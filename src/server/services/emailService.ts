import crypto from 'crypto';
import { COMPANY_CONFIG, COMMERCIAL_ENGAGEMENT_STATEMENT, corporateIdentity } from '../../data/companyConfig';
import { BRAND_ASSETS } from '../../data/brandAssets';
import { getCatalogServiceById } from '../../data/serviceCatalog';
import { ROUTES, buildCanonicalPublicUrl } from '../../config/routes';
import { AppointmentRecord, CreateOutboxInput, DatabaseRepository, EmailOutboxRecord, SolutionRequestRecord } from '../db/types';
import { logStructured } from '../logger';
import {
  DEFAULT_NOTIFICATION_FROM,
  DualNotificationConfig,
  DualNotificationOverrides,
  isValidEmailAddress,
  resolveDualNotificationConfig,
  sanitizeEmailHeader,
} from '../config/notificationRecipients';
import { computeEquivalentUtcSlot } from '../utils/timezoneUtc';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  idempotencyKey?: string;
}

export interface EmailSendResult {
  status: 'provider_accepted' | 'sent' | 'failed' | 'unconfigured';
  providerReference?: string;
  providerAcceptedAt?: string;
  retryAfterSeconds?: number;
  httpStatus?: number;
  error?: string;
}

export interface EmailTransport {
  readonly isConfigured: boolean;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export type DeliveryStatusSummary =
  | 'queued'
  | 'provider_accepted'
  | 'delivered'
  | 'failed'
  | 'dead_letter'
  | 'bounced'
  | 'complained'
  | 'unconfigured';

export interface DualRecipientDeliveryOutcome {
  customerStatus: DeliveryStatusSummary;
  adminStatus: DeliveryStatusSummary;
  overallStatus: DeliveryStatusSummary;
  deliveryState:
    | 'confirmed_delivered'
    | 'provider_accepted_awaiting_webhook'
    | 'partial_failure'
    | 'retry_scheduled'
    | 'failed'
    | 'unconfigured';
  notifiedRecipientsCount: number;
  providerAcceptedRecipientsCount: number;
  confirmedDeliveredRecipientsCount: number;
  /** Strictly equals webhook-confirmed delivered count (NEVER inflated by provider acceptance). */
  deliveredRecipientsCount: number;
  failedRecipientsCount: number;
  partialFailure: boolean;
  notificationsEnabled: boolean;
}

export interface ResendWebhookEventPayload {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    subject?: string;
    bounce?: { message?: string };
  };
}

export const MAX_OUTBOX_DELIVERY_ATTEMPTS = 5;

/**
 * ERR-003: Deterministic recipient-identity idempotency key.
 * Derived strictly from entity identity, notification purpose, event revision, and normalized lowercase
 * recipient email hash — NEVER from recipient array position.
 */
export function buildNotificationIdempotencyKey(params: {
  entityType: 'solution_request' | 'appointment';
  entityReference: string;
  notificationType: EmailOutboxRecord['notificationType'];
  recipientEmail: string;
  eventRevision?: number | string;
}): string {
  const prefix = params.entityType === 'solution_request' ? 'sol' : 'apt';
  const normalizedRecipient = params.recipientEmail.trim().toLowerCase();
  const recipientHash = crypto
    .createHash('sha256')
    .update(normalizedRecipient, 'utf8')
    .digest('hex')
    .slice(0, 20);
  const revisionTag = String(params.eventRevision ?? 1)
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 24);
  const safeRef = params.entityReference.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  return `${prefix}-${safeRef}-${params.notificationType}-r${revisionTag}-${recipientHash}`;
}

/**
 * ERR-006: Validate and normalize external webhook timestamps into bounded UTC ISO-8601 strings
 * before persisting to PostgreSQL timestamptz columns.
 */
export function normalizeWebhookTimestamp(
  rawTimestamp?: unknown,
  svixTimestampHeader?: string
): { iso: string; validSource: boolean; source: 'payload' | 'svix_header' | 'server_fallback' } {
  const nowMs = Date.now();
  const minAllowedMs = Date.UTC(2020, 0, 1);
  const maxAllowedMs = nowMs + 15 * 60 * 1000; // allow at most 15 min clock skew into future

  const tryParseMs = (candidate: unknown): number | null => {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      const ms = candidate < 1e12 ? candidate * 1000 : candidate;
      return ms >= minAllowedMs && ms <= maxAllowedMs ? ms : null;
    }
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (!trimmed || trimmed.length > 64) return null;
      if (/^\d{9,13}$/.test(trimmed)) {
        const num = Number(trimmed);
        const ms = trimmed.length <= 10 ? num * 1000 : num;
        return ms >= minAllowedMs && ms <= maxAllowedMs ? ms : null;
      }
      const parsed = Date.parse(trimmed);
      if (Number.isFinite(parsed) && parsed >= minAllowedMs && parsed <= maxAllowedMs) {
        return parsed;
      }
    }
    return null;
  };

  const fromPayload = tryParseMs(rawTimestamp);
  if (fromPayload !== null) {
    return { iso: new Date(fromPayload).toISOString(), validSource: true, source: 'payload' };
  }

  const fromSvix = tryParseMs(svixTimestampHeader);
  if (fromSvix !== null) {
    return { iso: new Date(fromSvix).toISOString(), validSource: true, source: 'svix_header' };
  }

  return { iso: new Date(nowMs).toISOString(), validSource: false, source: 'server_fallback' };
}

function parseRetryAfterSeconds(headerVal: string | null): number | undefined {
  if (!headerVal) return undefined;
  const trimmed = headerVal.trim();
  if (/^\d+$/.test(trimmed)) {
    const secs = Number.parseInt(trimmed, 10);
    return Math.min(900, Math.max(5, secs));
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    const diffSec = Math.ceil((dateMs - Date.now()) / 1000);
    if (diffSec > 0) return Math.min(900, Math.max(5, diffSec));
  }
  return undefined;
}

/**
 * Production Resend transactional email transport.
 * - Honestly reports 'unconfigured' when RESEND_API_KEY is absent instead of faking delivery.
 * - ERR-001: NEVER fabricates provider message IDs when Resend omits or returns an empty `id`.
 * - Enforces request timeouts via AbortController and parses HTTP 429 Retry-After headers.
 * - Sanitizes headers to prevent CR/LF header injection and passes Idempotency-Key + Reply-To.
 */
export class ResendEmailTransport implements EmailTransport {
  private readonly apiKey: string;
  private readonly fromAddress: string;
  private readonly timeoutMs: number;
  private readonly endpointUrl: string;

  constructor(
    apiKey = process.env.RESEND_API_KEY || '',
    fromAddress = process.env.EMAIL_FROM || DEFAULT_NOTIFICATION_FROM,
    options: { timeoutMs?: number; endpointUrl?: string } = {}
  ) {
    this.apiKey = apiKey.trim();
    this.fromAddress = sanitizeEmailHeader(fromAddress || DEFAULT_NOTIFICATION_FROM, 180);
    this.timeoutMs = options.timeoutMs ?? 12000;
    this.endpointUrl = options.endpointUrl || 'https://api.resend.com/emails';
  }

  public get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.isConfigured) {
      return {
        status: 'unconfigured',
        error: 'RESEND_API_KEY is not configured on the server.',
      };
    }

    if (!isValidEmailAddress(message.to)) {
      return {
        status: 'failed',
        error: 'Rejected invalid recipient email address.',
      };
    }

    const safeTo = sanitizeEmailHeader(message.to, 254).toLowerCase();
    const safeSubject = sanitizeEmailHeader(message.subject, 240);
    const safeReplyTo =
      message.replyTo && isValidEmailAddress(message.replyTo)
        ? sanitizeEmailHeader(message.replyTo, 254).toLowerCase()
        : undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      };
      if (message.idempotencyKey) {
        headers['Idempotency-Key'] = sanitizeEmailHeader(message.idempotencyKey, 128);
      }

      const response = await fetch(this.endpointUrl, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          from: this.fromAddress,
          to: [safeTo],
          subject: safeSubject,
          html: message.html,
          text: message.text,
          ...(safeReplyTo ? { reply_to: safeReplyTo } : {}),
        }),
      });

      const retryAfterSeconds =
        response.status === 429 ? parseRetryAfterSeconds(response.headers.get('retry-after')) : undefined;

      const body = (await response.json().catch(() => ({}))) as { id?: unknown; message?: string };
      if (!response.ok) {
        return {
          status: 'failed',
          httpStatus: response.status,
          retryAfterSeconds,
          error: body.message || `Resend HTTP ${response.status}`,
        };
      }

      // ERR-001: Strictly require a real non-empty provider message ID from Resend. NEVER fabricate one!
      const realProviderId = typeof body.id === 'string' ? body.id.trim() : '';
      if (!realProviderId || realProviderId.length > 160) {
        return {
          status: 'failed',
          httpStatus: response.status,
          error: 'Resend API returned HTTP 2xx without a valid provider message ID; marking retryable failure instead of fabricating an ID.',
        };
      }

      const acceptedAt = new Date().toISOString();
      return {
        status: 'provider_accepted',
        providerReference: realProviderId,
        providerAcceptedAt: acceptedAt,
        httpStatus: response.status,
      };
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError' || /abort|timeout/i.test(String(err?.message || ''));
      return {
        status: 'failed',
        error: isTimeout
          ? `Resend API request timed out after ${this.timeoutMs}ms.`
          : err?.message || 'Network failure dispatching email via Resend.',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Verifies Resend / Svix HMAC-SHA256 webhook signatures using constant-time comparison
 * and enforces a 5-minute replay tolerance window.
 */
export function verifyResendWebhookSignature(params: {
  rawBody: string;
  svixId?: string;
  svixTimestamp?: string;
  svixSignature?: string;
  secret: string;
  toleranceSeconds?: number;
}): { ok: boolean; reason?: string } {
  const { rawBody, svixId, svixTimestamp, svixSignature, secret, toleranceSeconds = 300 } = params;
  if (!secret || !secret.trim()) {
    return { ok: false, reason: 'Webhook verification secret is not configured.' };
  }
  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, reason: 'Missing required webhook signature headers.' };
  }
  const tsSeconds = Number(svixTimestamp);
  if (!Number.isFinite(tsSeconds)) {
    return { ok: false, reason: 'Invalid webhook timestamp header.' };
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - tsSeconds) > toleranceSeconds) {
    return { ok: false, reason: 'Webhook timestamp outside acceptable replay window.' };
  }

  const trimmedSecret = secret.trim();
  const keyBytes = trimmedSecret.startsWith('whsec_')
    ? Buffer.from(trimmedSecret.slice('whsec_'.length), 'base64')
    : Buffer.from(trimmedSecret, 'utf8');

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expectedSig = crypto.createHmac('sha256', keyBytes).update(signedContent).digest('base64');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');

  const candidates = svixSignature
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const [version, sigValue] = candidate.split(',');
    if (version !== 'v1' || !sigValue) continue;
    const candidateBuf = Buffer.from(sigValue, 'utf8');
    if (
      candidateBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(candidateBuf, expectedBuf)
    ) {
      return { ok: true };
    }
  }

  return { ok: false, reason: 'Webhook HMAC signature verification failed.' };
}

function escapeHtml(raw: string): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CORPORATE_CONFIDENTIALITY_NOTICE =
  'CONFIDENTIALITY NOTICE: This automated notification and any associated inquiry or consultation information are intended solely for authorized personnel of DESTRIA TECH INC. Unauthorized review, use, disclosure, or distribution is strictly prohibited.';

function renderCorporateSignatureHtml(): string {
  const officialPhone = escapeHtml(corporateIdentity.contact.telephone.display);
  const officialPhoneHref = escapeHtml(corporateIdentity.contact.telephone.href);
  const officialEmail = escapeHtml(corporateIdentity.contact.email);
  const officialAddress = escapeHtml(corporateIdentity.headquarters.fullAddress);
  const portalLoginUrl = escapeHtml(buildCanonicalPublicUrl(ROUTES.PORTAL.LOGIN));

  return `
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #1E293B;font-size:12px;color:#CBD5E1;line-height:1.6;">
      <div style="font-weight:700;color:#FFFFFF;letter-spacing:0.4px;">DESTRIA TECH INC</div>
      <div style="color:#00C2C7;font-size:11px;margin-bottom:6px;">Enterprise Technology &amp; Digital Transformation</div>
      <div>${officialAddress}</div>
      <div>Telephone: <a href="${officialPhoneHref}" style="color:#00C2C7;text-decoration:none;">${officialPhone}</a></div>
      <div>Email: <a href="mailto:${officialEmail}" style="color:#00C2C7;text-decoration:none;">${officialEmail}</a></div>
      <div>Website: <a href="https://destriatech.com/" style="color:#00C2C7;text-decoration:none;">https://destriatech.com/</a></div>
      <div>Client Portal: <a href="${portalLoginUrl}" style="color:#00C2C7;text-decoration:none;">${portalLoginUrl}</a></div>
      <p style="margin:12px 0 0 0;font-size:10px;color:#64748B;line-height:1.5;">${escapeHtml(CORPORATE_CONFIDENTIALITY_NOTICE)}</p>
    </div>`;
}

function renderCorporateSignatureText(): string {
  const portalLoginUrl = buildCanonicalPublicUrl(ROUTES.PORTAL.LOGIN);
  return [
    '------------------------------------------------------------------------',
    'DESTRIA TECH INC',
    'Enterprise Technology & Digital Transformation',
    corporateIdentity.headquarters.fullAddress,
    `Telephone: ${corporateIdentity.contact.telephone.display}`,
    `Email: ${corporateIdentity.contact.email}`,
    'Website: https://destriatech.com/',
    `Client Portal: ${portalLoginUrl}`,
    '',
    CORPORATE_CONFIDENTIALITY_NOTICE,
  ].join('\n');
}

function renderEmailShell(title: string, badge: string, bodyHtml: string): string {
  const safeLogoUrl = escapeHtml(BRAND_ASSETS.hostedPrimaryLogoUrl);
  const officialPhone = escapeHtml(corporateIdentity.contact.telephone.display);
  const officialPhoneHref = escapeHtml(corporateIdentity.contact.telephone.href);
  const officialEmail = escapeHtml(corporateIdentity.contact.email);
  const officialAddress = escapeHtml(corporateIdentity.headquarters.fullAddress);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#0B1220;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#E2E8F0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0B1220;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background-color:#111827;border:1px solid #1E293B;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px;background:linear-gradient(135deg,#0B1F3B,#111827);border-bottom:1px solid #1E293B;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="54" valign="middle" style="padding-right:14px;">
                    <img src="${safeLogoUrl}" alt="${escapeHtml(BRAND_ASSETS.altText)}" width="44" height="44" style="display:block;width:44px;height:44px;border-radius:9999px;border:1px solid #D4AF37;object-fit:cover;" />
                  </td>
                  <td valign="middle">
                    <div style="font-size:11px;font-family:monospace;letter-spacing:1.5px;color:#00C2C7;text-transform:uppercase;margin-bottom:4px;">${escapeHtml(badge)}</div>
                    <div style="font-size:20px;font-weight:700;color:#FFFFFF;letter-spacing:0.3px;">${escapeHtml(corporateIdentity.legalName)}</div>
                    <div style="font-size:12px;color:#94A3B8;margin-top:2px;">${escapeHtml(corporateIdentity.networkName)} · Enterprise Technology &amp; Digital Transformation</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;background-color:#0B1220;border-top:1px solid #1E293B;font-size:11px;color:#94A3B8;line-height:1.6;">
              <div><strong style="color:#E2E8F0;">${escapeHtml(corporateIdentity.legalName)}</strong> · ${officialAddress}</div>
              <div>Official Telephone: <a href="${officialPhoneHref}" style="color:#00C2C7;text-decoration:none;">${officialPhone}</a> · Email: <a href="mailto:${officialEmail}" style="color:#00C2C7;text-decoration:none;">${officialEmail}</a></div>
              <div style="margin-top:6px;color:#64748B;">${escapeHtml(COMMERCIAL_ENGAGEMENT_STATEMENT)}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function formatConsultationChannelLabel(type: AppointmentRecord['consultationType']): string {
  if (type === 'video') return 'Video Call';
  if (type === 'phone') return 'Phone Call';
  return 'Executive Briefing';
}

function formatAppointmentStatusLabel(status: AppointmentRecord['status']): string {
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'completed') return 'Completed';
  return 'Pending Scheduling Confirmation';
}

function renderKeyValueRowsHtml(rows: Array<[string, string]>): string {
  return rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:6px 10px 6px 0;font-size:12px;color:#94A3B8;vertical-align:top;width:190px;font-weight:600;">${escapeHtml(label)}</td>
          <td style="padding:6px 0;font-size:13px;color:#F8FAFC;vertical-align:top;word-break:break-word;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join('');
}

function renderSectionBoxHtml(title: string, innerHtml: string): string {
  return `
    <div style="margin:0 0 16px 0;padding:14px 16px;background-color:#0B1220;border:1px solid #1E293B;border-radius:10px;">
      <div style="font-size:11px;font-family:monospace;letter-spacing:1.2px;text-transform:uppercase;color:#00C2C7;font-weight:700;margin-bottom:8px;">${escapeHtml(title)}</div>
      ${innerHtml}
    </div>`;
}

export class TransactionalEmailService {
  private readonly adminInbox: string;
  private readonly dualConfigOverrides: DualNotificationOverrides;

  constructor(
    private readonly db: DatabaseRepository,
    private readonly transport: EmailTransport = new ResendEmailTransport(),
    adminInbox = process.env.ADMIN_NOTIFICATION_EMAIL || COMPANY_CONFIG.corporateEmail,
    dualConfigOverrides: DualNotificationOverrides = {}
  ) {
    this.adminInbox = adminInbox.trim();
    this.dualConfigOverrides = dualConfigOverrides;
  }

  public isConfigured(): boolean {
    return this.transport.isConfigured;
  }

  public getDualNotificationConfig(): DualNotificationConfig {
    return resolveDualNotificationConfig(this.dualConfigOverrides);
  }

  private async reconcilePendingWebhooksForOutbox(
    outboxId: string,
    providerReference: string,
    correlationId?: string
  ): Promise<void> {
    if (!this.db.listPendingWebhookEventsByMessageId || !this.db.getOutboxById) return;
    const pendingEvents = await this.db.listPendingWebhookEventsByMessageId(providerReference);
    if (pendingEvents.length === 0) return;

    for (const evt of pendingEvents) {
      const current = await this.db.getOutboxById(outboxId);
      if (!current) break;
      const bounceMessage =
        typeof (evt.payload as any)?.data?.bounce?.message === 'string'
          ? (evt.payload as any).data.bounce.message
          : undefined;
      await this.applyWebhookTransitionToOutbox(
        current,
        evt.eventType,
        evt.eventTimestampUtc,
        evt.providerEventId,
        bounceMessage,
        correlationId
      );
      if (this.db.markWebhookEventReconciled) {
        await this.db.markWebhookEventReconciled(evt.id, outboxId);
      }
    }
  }

  private async applyWebhookTransitionToOutbox(
    existing: EmailOutboxRecord,
    eventType: string,
    eventTs: string,
    providerEventId: string,
    bounceReason?: string,
    correlationId?: string
  ): Promise<{ status: string; updated: boolean }> {
    const normalizedType = eventType.trim().toLowerCase();

    if (normalizedType === 'email.delivered') {
      // ERR-005: Preserve original deliveredAt on duplicate or late email.delivered events.
      // Never overwrite permanent bounce/complaint terminal state.
      if (existing.status === 'bounced' || existing.status === 'complained') {
        return { status: existing.status, updated: false };
      }
      const preservedDeliveredAt = existing.deliveredAt || eventTs;
      await this.db.updateOutboxStatus(existing.id, {
        status: 'delivered',
        providerReference: existing.providerReference,
        deliveryAttempts: existing.deliveryAttempts,
        deliveredAt: preservedDeliveredAt,
        sentAt: existing.sentAt || existing.providerAcceptedAt || preservedDeliveredAt,
        nextRetryAt: null,
        claimedBy: null,
        claimedAt: null,
        leaseExpiresAt: null,
        lastWebhookEventId: providerEventId,
        lastWebhookEventAt: eventTs,
      });
      logStructured('info', 'transactional_email_delivery_confirmed', {
        correlationId,
        outboxId: existing.id,
        entityReference: existing.entityReference,
        providerReference: existing.providerReference,
        deliveredAt: preservedDeliveredAt,
      });
      return { status: 'delivered', updated: true };
    }

    if (normalizedType === 'email.delivery_delayed') {
      // ERR-005: Out-of-order monotonic protection — never downgrade delivered/bounced/complained
      if (
        existing.status === 'delivered' ||
        existing.status === 'bounced' ||
        existing.status === 'complained'
      ) {
        return { status: existing.status, updated: false };
      }
      const reason = bounceReason || 'Resend webhook reported email.delivery_delayed';
      await this.db.updateOutboxStatus(existing.id, {
        status: 'delivery_delayed',
        providerReference: existing.providerReference,
        deliveryAttempts: existing.deliveryAttempts,
        lastError: reason,
        deliveryDelayedAt: existing.deliveryDelayedAt || eventTs,
        nextRetryAt: null,
        lastWebhookEventId: providerEventId,
        lastWebhookEventAt: eventTs,
      });
      logStructured('warn', 'transactional_email_delivery_delayed', {
        correlationId,
        outboxId: existing.id,
        entityReference: existing.entityReference,
        reason,
      });
      return { status: 'delivery_delayed', updated: true };
    }

    if (normalizedType === 'email.bounced') {
      const reason = bounceReason || 'Resend webhook reported email.bounced';
      await this.db.updateOutboxStatus(existing.id, {
        status: 'bounced',
        providerReference: existing.providerReference,
        deliveryAttempts: existing.deliveryAttempts,
        lastError: reason,
        bouncedAt: existing.bouncedAt || eventTs,
        nextRetryAt: null,
        claimedBy: null,
        claimedAt: null,
        leaseExpiresAt: null,
        lastWebhookEventId: providerEventId,
        lastWebhookEventAt: eventTs,
      });
      logStructured('warn', 'transactional_email_bounced', {
        correlationId,
        outboxId: existing.id,
        entityReference: existing.entityReference,
        reason,
      });
      return { status: 'bounced', updated: true };
    }

    if (normalizedType === 'email.complained') {
      const reason = bounceReason || 'Resend webhook reported email.complained';
      await this.db.updateOutboxStatus(existing.id, {
        status: 'complained',
        providerReference: existing.providerReference,
        deliveryAttempts: existing.deliveryAttempts,
        lastError: reason,
        complainedAt: existing.complainedAt || eventTs,
        nextRetryAt: null,
        claimedBy: null,
        claimedAt: null,
        leaseExpiresAt: null,
        lastWebhookEventId: providerEventId,
        lastWebhookEventAt: eventTs,
      });
      logStructured('warn', 'transactional_email_complained', {
        correlationId,
        outboxId: existing.id,
        entityReference: existing.entityReference,
        reason,
      });
      return { status: 'complained', updated: true };
    }

    return { status: existing.status, updated: false };
  }

  private async dispatchOutboxRecord(
    record: EmailOutboxRecord,
    correlationId?: string
  ): Promise<DeliveryStatusSummary> {
    // ERR-002: Never re-dispatch terminal or non-retryable bounce/complaint/delivered states
    if (record.status === 'delivered') return 'delivered';
    if (record.status === 'bounced') return 'bounced';
    if (record.status === 'complained') return 'complained';
    if (record.status === 'provider_accepted' || record.status === 'sent') return 'provider_accepted';

    const attemptNumber = (record.deliveryAttempts || 0) + 1;
    const attemptTimestamp = new Date().toISOString();
    const replyTo =
      record.replyTo ||
      (typeof record.metadata?.replyTo === 'string' ? record.metadata.replyTo : undefined);
    const idempotencyKey =
      record.idempotencyKey ||
      (typeof record.metadata?.idempotencyKey === 'string'
        ? record.metadata.idempotencyKey
        : buildNotificationIdempotencyKey({
            entityType: record.entityType,
            entityReference: record.entityReference,
            notificationType: record.notificationType,
            recipientEmail: record.recipientEmail,
            eventRevision: record.eventRevision ?? 1,
          }));

    let result: EmailSendResult;
    try {
      result = await this.transport.send({
        to: record.recipientEmail,
        subject: record.subject,
        html: record.htmlBody,
        text: record.textBody,
        replyTo,
        idempotencyKey,
      });
    } catch (unexpectedErr: any) {
      result = {
        status: 'failed',
        error: unexpectedErr?.message || 'Unexpected exception while dispatching email.',
      };
    }

    const acceptedByProvider = result.status === 'provider_accepted' || result.status === 'sent';
    const validProviderRef = typeof result.providerReference === 'string' ? result.providerReference.trim() : '';

    if (acceptedByProvider && validProviderRef) {
      const acceptedAt = result.providerAcceptedAt || new Date().toISOString();
      await this.db.updateOutboxStatus(record.id, {
        status: 'provider_accepted',
        providerReference: validProviderRef,
        deliveryAttempts: attemptNumber,
        lastError: null,
        lastAttemptAt: attemptTimestamp,
        providerAcceptedAt: acceptedAt,
        sentAt: acceptedAt,
        nextRetryAt: null,
        claimedBy: null,
        claimedAt: null,
        leaseExpiresAt: null,
      });
      logStructured('info', 'transactional_email_provider_accepted', {
        correlationId,
        entityType: record.entityType,
        entityReference: record.entityReference,
        notificationType: record.notificationType,
        providerReference: validProviderRef,
      });

      // ERR-005: Reconcile any webhook that arrived before provider_reference was persisted
      await this.reconcilePendingWebhooksForOutbox(record.id, validProviderRef, correlationId).catch(() => {});
      return 'provider_accepted';
    }

    if (acceptedByProvider && !validProviderRef) {
      result = {
        status: 'failed',
        error: 'Email transport reported acceptance without a valid provider message ID.',
      };
    }

    if (result.status === 'unconfigured') {
      await this.db.updateOutboxStatus(record.id, {
        status: 'unconfigured',
        deliveryAttempts: attemptNumber,
        lastAttemptAt: attemptTimestamp,
        lastError: result.error,
        nextRetryAt: null,
        claimedBy: null,
        claimedAt: null,
        leaseExpiresAt: null,
      });
      logStructured('warn', 'transactional_email_unconfigured', {
        correlationId,
        entityType: record.entityType,
        entityReference: record.entityReference,
        notificationType: record.notificationType,
      });
      return 'unconfigured';
    }

    // ERR-002: Bounded retries with exponential backoff + jitter (or Retry-After on 429) -> dead_letter at max attempts
    const exhausted = attemptNumber >= MAX_OUTBOX_DELIVERY_ATTEMPTS;
    const baseDelaySeconds =
      result.retryAfterSeconds ?? Math.min(7200, Math.pow(2, attemptNumber) * 120);
    const jitterSeconds = Math.floor(Math.random() * 15);
    const nextRetry = exhausted
      ? null
      : new Date(Date.now() + (baseDelaySeconds + jitterSeconds) * 1000).toISOString();

    await this.db.updateOutboxStatus(record.id, {
      status: exhausted ? 'dead_letter' : 'failed',
      deliveryAttempts: attemptNumber,
      lastAttemptAt: attemptTimestamp,
      lastError: result.error || 'Email delivery failed.',
      nextRetryAt: nextRetry,
      deadLetteredAt: exhausted ? attemptTimestamp : null,
      claimedBy: null,
      claimedAt: null,
      leaseExpiresAt: null,
    });
    logStructured('error', exhausted ? 'transactional_email_dead_lettered' : 'transactional_email_failed', {
      correlationId,
      entityType: record.entityType,
      entityReference: record.entityReference,
      notificationType: record.notificationType,
      attemptNumber,
      nextRetryAt: nextRetry,
      error: result.error,
    });
    return exhausted ? 'dead_letter' : 'failed';
  }

  private buildServiceInquiryTemplates(record: SolutionRequestRecord) {
    const selectedLinesText =
      record.selectedServices.length > 0
        ? record.selectedServices.map((s) => {
            const cat = getCatalogServiceById(s.id);
            const optionLabels = (s.selectedOptionIds || [])
              .map((oid) => cat?.configurableOptions?.find((o) => o.id === oid)?.label || oid)
              .filter(Boolean);
            const optText = optionLabels.length > 0 ? ` [Options: ${optionLabels.join(', ')}]` : '';
            const modelText = s.engagementLabel ? ` — ${s.engagementLabel}` : '';
            return `- ${s.title}${modelText}${optText}`;
          })
        : [`- ${record.serviceTitle || 'Customized Enterprise Solution Inquiry'}`];

    const selectedLinesHtml = selectedLinesText
      .map(
        (line) =>
          `<li style="margin:4px 0;color:#F8FAFC;font-size:13px;line-height:1.5;">${escapeHtml(
            line.replace(/^- /, '')
          )}</li>`
      )
      .join('');

    const submissionUtc = record.createdAt || new Date().toISOString();
    const submissionTimezone = record.submissionTimezone || 'UTC';
    const requestSource = record.sourceChannel || 'Public Website';
    const engagementScope = record.engagementScope || 'Subject to Formal Assessment';
    const consentStatus =
      record.privacyConsent && record.commercialPolicyConsent !== false
        ? 'Confirmed (Privacy & Formal Proposal Commercial Policy)'
        : 'Not Confirmed';
    const supportingDocDisplay = record.fileName
      ? `${record.fileName} (Filename reference recorded only — unverified files are not attached to email; secure transfer available via Client Portal)`
      : 'None provided';

    // 1. Customer acknowledgment email
    const portalLoginUrl = buildCanonicalPublicUrl(ROUTES.PORTAL.LOGIN);
    const customerSubject = `${corporateIdentity.legalName} — Enterprise Service Inquiry Received (${record.referenceCode})`;
    const customerHtml = renderEmailShell(
      customerSubject,
      'Enterprise Service Inquiry Confirmation',
      `
        <p style="margin:0 0 14px 0;font-size:15px;color:#FFFFFF;">Dear ${escapeHtml(record.fullName)},</p>
        <p style="margin:0 0 16px 0;font-size:14px;color:#CBD5E1;line-height:1.65;">
          Your service inquiry has been successfully registered with <strong>${escapeHtml(corporateIdentity.legalName)}</strong>. Our authorized team will review your submitted requirements and coordinate further communication.
        </p>
        ${renderSectionBoxHtml(
          'Inquiry Reference Summary',
          `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${renderKeyValueRowsHtml([
              ['Reference Number', record.referenceCode],
              ['Submission Date (UTC)', submissionUtc],
              ['Organization', record.company],
              ['Engagement Scope', engagementScope],
              ['Target Delivery Timeline', record.targetTimeline || 'To be confirmed during technical assessment'],
              ['Commercial Status', 'Subject to Formal Assessment'],
            ])}
          </table>`
        )}
        <div style="margin-bottom:14px;font-size:12px;font-weight:700;color:#E2E8F0;text-transform:uppercase;letter-spacing:0.8px;">Selected Solution Frameworks</div>
        <ul style="margin:0 0 18px 18px;padding:0;">${selectedLinesHtml}</ul>
        <p style="margin:0 0 12px 0;font-size:13px;color:#CBD5E1;line-height:1.6;">
          ${escapeHtml(COMMERCIAL_ENGAGEMENT_STATEMENT)}
        </p>
        <p style="margin:0 0 12px 0;font-size:13px;color:#CBD5E1;line-height:1.6;">
          Existing and invited clients may also sign in to the <a href="${escapeHtml(portalLoginUrl)}" style="color:#00C2C7;text-decoration:none;font-weight:600;">DESTRIA TECH INC Client Portal</a> to track proposals and securely transfer documentation.
        </p>
        <p style="margin:0;font-size:13px;color:#CBD5E1;line-height:1.6;">
          If you wish to coordinate directly with our team, please telephone <a href="${escapeHtml(corporateIdentity.contact.telephone.href)}" style="color:#00C2C7;text-decoration:none;font-weight:600;">${escapeHtml(corporateIdentity.contact.telephone.display)}</a> or reply to <a href="mailto:${escapeHtml(corporateIdentity.contact.email)}" style="color:#00C2C7;text-decoration:none;font-weight:600;">${escapeHtml(corporateIdentity.contact.email)}</a> referencing <strong>${escapeHtml(record.referenceCode)}</strong>.
        </p>
        ${renderCorporateSignatureHtml()}
      `
    );

    const customerText = [
      `Dear ${record.fullName},`,
      '',
      `Your service inquiry has been successfully registered with ${corporateIdentity.legalName}. Our authorized team will review your submitted requirements and coordinate further communication.`,
      '',
      `Reference Number: ${record.referenceCode}`,
      `Submission Date & Time (UTC): ${submissionUtc}`,
      `Organization: ${record.company}`,
      `Engagement Scope: ${engagementScope}`,
      `Target Delivery Timeline: ${record.targetTimeline || 'To be confirmed during technical assessment'}`,
      'Commercial Status: Subject to Formal Assessment',
      '',
      'Selected Solution Frameworks:',
      ...selectedLinesText,
      '',
      `Client Portal: ${portalLoginUrl}`,
      '',
      COMMERCIAL_ENGAGEMENT_STATEMENT,
      '',
      renderCorporateSignatureText(),
    ].join('\n');

    // 2. Dual-Recipient Authorized Notification Email (Section 10 + Section 12)
    const internalSubject = `NEW ENTERPRISE SERVICE INQUIRY | DESTRIA TECH INC | ${record.referenceCode}`;

    const internalHtml = renderEmailShell(
      internalSubject,
      'Authorized Enterprise Service Inquiry Alert',
      `
        <p style="margin:0 0 16px 0;font-size:14px;color:#E2E8F0;line-height:1.6;">
          A new enterprise service inquiry has been registered with <strong>DESTRIA TECH INC</strong>. Reply directly to this email to respond to the prospective client.
        </p>
        ${renderSectionBoxHtml(
          'INQUIRY METADATA',
          `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${renderKeyValueRowsHtml([
              ['Reference Number', record.referenceCode],
              ['Submission Date & Time (UTC)', submissionUtc],
              ['Submission Timezone', submissionTimezone],
              ['Request Source', requestSource],
              ['Commercial Status', 'Subject to Formal Assessment'],
            ])}
          </table>`
        )}
        ${renderSectionBoxHtml(
          'CLIENT INFORMATION',
          `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${renderKeyValueRowsHtml([
              ['Full Legal Name', record.fullName],
              ['Corporate or Business Email', record.email],
              ['Direct Telephone Number', record.contactNumber],
              ['Organization or Enterprise Name', record.company],
              ...(record.industry ? [['Industry Sector', record.industry] as [string, string]] : []),
            ])}
          </table>`
        )}
        ${renderSectionBoxHtml(
          'ENGAGEMENT DETAILS',
          `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${renderKeyValueRowsHtml([
              ['Selected Primary Solution', record.serviceTitle || 'Customized Enterprise Solution Inquiry'],
              ['Engagement Scope', engagementScope],
              ['Target Delivery Timeline', record.targetTimeline || 'Not specified'],
              ['Privacy & Commercial Policy Consent', consentStatus],
            ])}
          </table>
          <div style="margin-top:10px;font-size:11px;font-family:monospace;text-transform:uppercase;color:#94A3B8;">Selected Frameworks</div>
          <ul style="margin:6px 0 0 18px;padding:0;">${selectedLinesHtml}</ul>`
        )}
        ${renderSectionBoxHtml(
          'PROJECT REQUIREMENTS',
          `<div style="font-size:13px;color:#F8FAFC;line-height:1.65;white-space:pre-wrap;">${escapeHtml(record.projectDescription)}</div>`
        )}
        ${renderSectionBoxHtml(
          'SUPPORTING DOCUMENTATION',
          `<div style="font-size:13px;color:#CBD5E1;line-height:1.6;">${escapeHtml(supportingDocDisplay)}</div>`
        )}
        ${renderCorporateSignatureHtml()}
      `
    );

    const internalText = [
      `NEW ENTERPRISE SERVICE INQUIRY | DESTRIA TECH INC | ${record.referenceCode}`,
      '',
      'INQUIRY METADATA',
      `Reference Number: ${record.referenceCode}`,
      `Submission Date & Time (UTC): ${submissionUtc}`,
      `Submission Timezone: ${submissionTimezone}`,
      `Request Source: ${requestSource}`,
      'Commercial Status: Subject to Formal Assessment',
      '',
      'CLIENT INFORMATION',
      `Full Legal Name: ${record.fullName}`,
      `Corporate or Business Email: ${record.email}`,
      `Direct Telephone Number: ${record.contactNumber}`,
      `Organization or Enterprise Name: ${record.company}`,
      ...(record.industry ? [`Industry Sector: ${record.industry}`] : []),
      '',
      'ENGAGEMENT DETAILS',
      `Selected Primary Solution: ${record.serviceTitle || 'Customized Enterprise Solution Inquiry'}`,
      `Engagement Scope: ${engagementScope}`,
      `Target Delivery Timeline: ${record.targetTimeline || 'Not specified'}`,
      `Privacy & Commercial Policy Consent: ${consentStatus}`,
      'Selected Frameworks:',
      ...selectedLinesText,
      '',
      'PROJECT REQUIREMENTS',
      record.projectDescription,
      '',
      'SUPPORTING DOCUMENTATION',
      supportingDocDisplay,
      '',
      renderCorporateSignatureText(),
    ].join('\n');

    return {
      customerSubject,
      customerHtml,
      customerText,
      internalSubject,
      internalHtml,
      internalText,
      requestSource,
    };
  }

  private buildConsultationTemplates(
    appointment: AppointmentRecord,
    kind: 'requested' | 'rescheduled' | 'cancelled' = 'requested'
  ) {
    const channelLabel = formatConsultationChannelLabel(appointment.consultationType);
    const statusLabel = formatAppointmentStatusLabel(appointment.status);
    const requestSource = appointment.sourceChannel || 'Public Website';
    const requestTimestampUtc = appointment.createdAt || new Date().toISOString();
    const equivalentUtc =
      appointment.utcScheduledAt ||
      computeEquivalentUtcSlot(
        appointment.scheduledDate,
        appointment.scheduledTimeSlot,
        appointment.clientTimezone
      )?.formattedUtc ||
      `${appointment.scheduledDate} ${appointment.scheduledTimeSlot} (${appointment.clientTimezone})`;

    const verifiedMeetingLinkDisplay =
      appointment.calendarSyncStatus === 'synced' && appointment.meetingLink
        ? appointment.meetingLink
        : 'Pending scheduling confirmation — official meeting details will be issued upon formal confirmation.';

    // 1. Customer acknowledgment email
    const customerSubject =
      kind === 'cancelled'
        ? `Consultation Request Cancelled (${appointment.referenceCode}) — ${corporateIdentity.legalName}`
        : kind === 'rescheduled'
        ? `Consultation Reschedule Logged (${appointment.referenceCode}) — ${corporateIdentity.legalName}`
        : `Consultation Request Received (${appointment.referenceCode}) — ${corporateIdentity.legalName}`;

    const customerStatusMessage =
      appointment.status === 'confirmed'
        ? 'Your consultation appointment is confirmed on our executive calendar.'
        : 'Your consultation request has been successfully registered. The requested schedule remains subject to availability and formal confirmation by our authorized team.';

    const customerHtml = renderEmailShell(
      customerSubject,
      'Executive Consultation Request',
      `
        <p style="margin:0 0 14px 0;font-size:15px;color:#FFFFFF;">Dear ${escapeHtml(appointment.fullName)},</p>
        <p style="margin:0 0 16px 0;font-size:14px;color:#CBD5E1;line-height:1.65;">
          ${escapeHtml(customerStatusMessage)}
        </p>
        ${renderSectionBoxHtml(
          'Consultation Request Summary',
          `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${renderKeyValueRowsHtml([
              ['Reference Number', appointment.referenceCode],
              ['Appointment Status', statusLabel],
              ['Consultation Channel', channelLabel],
              ['Requested Representative', appointment.assignedConsultant],
              ['Selected Date', appointment.scheduledDate],
              ['Selected Time Slot', appointment.scheduledTimeSlot],
              ['Client Timezone', appointment.clientTimezone],
              ['Equivalent UTC Date & Time', equivalentUtc],
              ...(appointment.calendarSyncStatus === 'synced' && appointment.meetingLink
                ? [['Verified Meeting Link', appointment.meetingLink] as [string, string]]
                : []),
              ...(appointment.meetingLocation
                ? [['Briefing Reference', appointment.meetingLocation] as [string, string]]
                : []),
            ])}
          </table>`
        )}
        <p style="margin:0;font-size:13px;color:#CBD5E1;line-height:1.6;">
          For urgent coordination, call <a href="${escapeHtml(corporateIdentity.contact.telephone.href)}" style="color:#00C2C7;text-decoration:none;font-weight:600;">${escapeHtml(corporateIdentity.contact.telephone.display)}</a> or email <a href="mailto:${escapeHtml(corporateIdentity.contact.email)}" style="color:#00C2C7;text-decoration:none;font-weight:600;">${escapeHtml(corporateIdentity.contact.email)}</a>.
        </p>
        ${renderCorporateSignatureHtml()}
      `
    );

    const customerText = [
      `Dear ${appointment.fullName},`,
      '',
      customerStatusMessage,
      '',
      `Reference Number: ${appointment.referenceCode}`,
      `Appointment Status: ${statusLabel}`,
      `Consultation Channel: ${channelLabel}`,
      `Requested Representative: ${appointment.assignedConsultant}`,
      `Selected Date: ${appointment.scheduledDate}`,
      `Selected Time Slot: ${appointment.scheduledTimeSlot}`,
      `Client Timezone: ${appointment.clientTimezone}`,
      `Equivalent UTC Date and Time: ${equivalentUtc}`,
      ...(appointment.calendarSyncStatus === 'synced' && appointment.meetingLink
        ? [`Verified Meeting Link: ${appointment.meetingLink}`]
        : []),
      '',
      renderCorporateSignatureText(),
    ].join('\n');

    // 2. Dual-Recipient Authorized Notification Email (Section 11 + Section 12)
    const internalSubject =
      kind === 'requested'
        ? `NEW EXECUTIVE CONSULTATION REQUEST | DESTRIA TECH INC | ${appointment.referenceCode}`
        : `EXECUTIVE CONSULTATION ${kind.toUpperCase()} | DESTRIA TECH INC | ${appointment.referenceCode}`;

    const availabilityNote =
      appointment.availabilityVerified === false
        ? 'Live availability check was temporarily unverified at submission; verify schedule prior to formal confirmation.'
        : 'Schedule slot verified against server bookings at submission.';

    const internalHtml = renderEmailShell(
      internalSubject,
      'Authorized Executive Consultation Alert',
      `
        <p style="margin:0 0 16px 0;font-size:14px;color:#E2E8F0;line-height:1.6;">
          A new executive consultation request has been registered with <strong>DESTRIA TECH INC</strong>. Reply directly to this email to communicate with the prospective client.
        </p>
        ${renderSectionBoxHtml(
          'CONSULTATION METADATA',
          `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${renderKeyValueRowsHtml([
              ['Reference Number', appointment.referenceCode],
              ['Request Timestamp (UTC)', requestTimestampUtc],
              ['Request Source', requestSource],
              ['Appointment Status', statusLabel],
              ['Availability Verification', availabilityNote],
            ])}
          </table>`
        )}
        ${renderSectionBoxHtml(
          'CLIENT INFORMATION',
          `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${renderKeyValueRowsHtml([
              ['Full Legal Name', appointment.fullName],
              ['Corporate Email', appointment.email],
              ['Direct Telephone', appointment.phone],
              ['Organization or Enterprise Name', appointment.companyName],
            ])}
          </table>`
        )}
        ${renderSectionBoxHtml(
          'CONSULTATION SCHEDULE',
          `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${renderKeyValueRowsHtml([
              ['Consultation Channel', channelLabel],
              ['Requested Representative', appointment.assignedConsultant],
              ['Selected Date', appointment.scheduledDate],
              ['Selected Time Slot', appointment.scheduledTimeSlot],
              ['Client Timezone', appointment.clientTimezone],
              ['Equivalent UTC Date and Time', equivalentUtc],
              ['Calendar Sync Status', appointment.calendarSyncStatus],
              ['Meeting Link', verifiedMeetingLinkDisplay],
              ...(appointment.meetingLocation
                ? [['Executive Briefing Reference', appointment.meetingLocation] as [string, string]]
                : []),
            ])}
          </table>`
        )}
        ${renderSectionBoxHtml(
          'PROJECT REQUIREMENTS',
          `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${renderKeyValueRowsHtml([
              ...(appointment.consultationPurpose
                ? [['Consultation Purpose', appointment.consultationPurpose] as [string, string]]
                : []),
              ...(appointment.selectedSolution
                ? [['Selected Solution', appointment.selectedSolution] as [string, string]]
                : []),
              ...(appointment.briefReferenceCode
                ? [['Linked Project Brief Reference', appointment.briefReferenceCode] as [string, string]]
                : []),
              [
                'Requirements & Discussion Notes',
                appointment.notes || 'Not provided — to be scoped during initial consultation.',
              ],
            ])}
          </table>`
        )}
        ${renderCorporateSignatureHtml()}
      `
    );

    const internalText = [
      internalSubject,
      '',
      'CONSULTATION METADATA',
      `Reference Number: ${appointment.referenceCode}`,
      `Request Timestamp (UTC): ${requestTimestampUtc}`,
      `Request Source: ${requestSource}`,
      `Appointment Status: ${statusLabel}`,
      `Availability Verification: ${availabilityNote}`,
      '',
      'CLIENT INFORMATION',
      `Full Legal Name: ${appointment.fullName}`,
      `Corporate Email: ${appointment.email}`,
      `Direct Telephone: ${appointment.phone}`,
      `Organization or Enterprise Name: ${appointment.companyName}`,
      '',
      'CONSULTATION SCHEDULE',
      `Consultation Channel: ${channelLabel}`,
      `Requested Representative: ${appointment.assignedConsultant}`,
      `Selected Date: ${appointment.scheduledDate}`,
      `Selected Time Slot: ${appointment.scheduledTimeSlot}`,
      `Client Timezone: ${appointment.clientTimezone}`,
      `Equivalent UTC Date and Time: ${equivalentUtc}`,
      `Calendar Sync Status: ${appointment.calendarSyncStatus}`,
      `Meeting Link: ${verifiedMeetingLinkDisplay}`,
      ...(appointment.meetingLocation
        ? [`Executive Briefing Reference: ${appointment.meetingLocation}`]
        : []),
      '',
      'PROJECT REQUIREMENTS',
      ...(appointment.consultationPurpose
        ? [`Consultation Purpose: ${appointment.consultationPurpose}`]
        : []),
      ...(appointment.selectedSolution ? [`Selected Solution: ${appointment.selectedSolution}`] : []),
      ...(appointment.briefReferenceCode
        ? [`Linked Project Brief Reference: ${appointment.briefReferenceCode}`]
        : []),
      `Requirements & Discussion Notes: ${
        appointment.notes || 'Not provided — to be scoped during initial consultation.'
      }`,
      '',
      renderCorporateSignatureText(),
    ].join('\n');

    return {
      customerSubject,
      customerHtml,
      customerText,
      internalSubject,
      internalHtml,
      internalText,
      requestSource,
    };
  }

  private summarizeOutcome(
    customerStatus: DeliveryStatusSummary,
    recipientStatuses: DeliveryStatusSummary[],
    notificationsEnabled: boolean
  ): DualRecipientDeliveryOutcome {
    const providerAcceptedCount = recipientStatuses.filter(
      (s) => s === 'provider_accepted' || s === 'delivered'
    ).length;
    const confirmedDeliveredCount = recipientStatuses.filter((s) => s === 'delivered').length;
    const failedCount = recipientStatuses.filter(
      (s) => s === 'failed' || s === 'dead_letter' || s === 'bounced' || s === 'complained'
    ).length;
    const unconfiguredCount = recipientStatuses.filter((s) => s === 'unconfigured').length;
    const partialFailure = providerAcceptedCount > 0 && failedCount > 0;

    let adminStatus: DeliveryStatusSummary;
    if (!notificationsEnabled || recipientStatuses.length === 0) {
      adminStatus = 'unconfigured';
    } else if (confirmedDeliveredCount === recipientStatuses.length) {
      adminStatus = 'delivered';
    } else if (providerAcceptedCount === recipientStatuses.length) {
      adminStatus = 'provider_accepted';
    } else if (unconfiguredCount === recipientStatuses.length) {
      adminStatus = 'unconfigured';
    } else if (recipientStatuses.every((s) => s === 'queued')) {
      adminStatus = 'queued';
    } else {
      adminStatus = 'failed';
    }

    const customerAccepted = customerStatus === 'provider_accepted' || customerStatus === 'delivered';
    const adminAccepted =
      !notificationsEnabled || adminStatus === 'provider_accepted' || adminStatus === 'delivered';

    let overallStatus: DeliveryStatusSummary;
    if (customerStatus === 'delivered' && (!notificationsEnabled || adminStatus === 'delivered')) {
      overallStatus = 'delivered';
    } else if (customerAccepted && adminAccepted) {
      overallStatus = 'provider_accepted';
    } else if (customerStatus === 'unconfigured' && adminStatus === 'unconfigured') {
      overallStatus = 'unconfigured';
    } else if (customerStatus === 'queued' && (adminStatus === 'queued' || !notificationsEnabled)) {
      overallStatus = 'queued';
    } else {
      overallStatus = 'failed';
    }

    let deliveryState: DualRecipientDeliveryOutcome['deliveryState'];
    if (overallStatus === 'delivered') {
      deliveryState = 'confirmed_delivered';
    } else if (overallStatus === 'provider_accepted') {
      deliveryState = 'provider_accepted_awaiting_webhook';
    } else if (partialFailure) {
      deliveryState = 'partial_failure';
    } else if (overallStatus === 'unconfigured') {
      deliveryState = 'unconfigured';
    } else if (overallStatus === 'queued') {
      deliveryState = 'retry_scheduled';
    } else {
      deliveryState = 'failed';
    }

    return {
      customerStatus,
      adminStatus,
      overallStatus,
      deliveryState,
      notifiedRecipientsCount: recipientStatuses.length,
      providerAcceptedRecipientsCount: providerAcceptedCount,
      confirmedDeliveredRecipientsCount: confirmedDeliveredCount,
      // ERR-004: deliveredRecipientsCount reflects ONLY webhook-confirmed deliveries, NEVER provider acceptance
      deliveredRecipientsCount: confirmedDeliveredCount,
      failedRecipientsCount: failedCount,
      partialFailure,
      notificationsEnabled,
    };
  }

  private mapOutboxStatusToSummary(status: EmailOutboxRecord['status']): DeliveryStatusSummary {
    if (status === 'delivered') return 'delivered';
    if (status === 'provider_accepted' || status === 'sent' || status === 'delivery_delayed') {
      return 'provider_accepted';
    }
    if (status === 'unconfigured') return 'unconfigured';
    if (status === 'queued' || status === 'processing' || status === 'retry_scheduled') return 'queued';
    if (status === 'dead_letter') return 'dead_letter';
    if (status === 'bounced') return 'bounced';
    if (status === 'complained') return 'complained';
    return 'failed';
  }

  /**
   * ERR-010: Builds all outbox inputs (customer confirmation + dual authorized recipients)
   * with deterministic recipient-identity idempotency keys (ERR-003) so the database can persist
   * the parent request and all notification records atomically in a single transaction.
   */
  public buildSolutionRequestOutboxInputs(
    record: SolutionRequestRecord,
    correlationId?: string
  ) {
    const dualConfig = this.getDualNotificationConfig();
    const templates = this.buildServiceInquiryTemplates(record);
    const safeClientReplyTo = isValidEmailAddress(record.email) ? record.email.trim().toLowerCase() : undefined;
    const normalizedCustomerEmail = record.email.trim().toLowerCase();

    const items: CreateOutboxInput[] = [
      {
        dedupeKey: `sol:${record.referenceCode}:customer:${normalizedCustomerEmail}`,
        entityType: 'solution_request' as const,
        entityReference: record.referenceCode,
        recipientEmail: normalizedCustomerEmail,
        replyTo: corporateIdentity.contact.email,
        idempotencyKey: buildNotificationIdempotencyKey({
          entityType: 'solution_request',
          entityReference: record.referenceCode,
          notificationType: 'customer_confirmation',
          recipientEmail: normalizedCustomerEmail,
          eventRevision: 1,
        }),
        requestSource: templates.requestSource,
        notificationType: 'customer_confirmation' as const,
        subject: templates.customerSubject,
        htmlBody: templates.customerHtml,
        textBody: templates.customerText,
        eventRevision: 1,
        metadata: {
          correlationId,
          referenceCode: record.referenceCode,
          replyTo: corporateIdentity.contact.email,
          requestSource: templates.requestSource,
        },
      },
    ];

    const recipients = dualConfig.serviceInquiry.enabled ? dualConfig.serviceInquiry.recipients : [];
    for (const rawRecipient of recipients) {
      const recipientEmail = rawRecipient.trim().toLowerCase();
      items.push({
        dedupeKey: `sol:${record.referenceCode}:recipient:${recipientEmail}`,
        entityType: 'solution_request' as const,
        entityReference: record.referenceCode,
        recipientEmail,
        replyTo: safeClientReplyTo,
        idempotencyKey: buildNotificationIdempotencyKey({
          entityType: 'solution_request',
          entityReference: record.referenceCode,
          notificationType: 'admin_alert',
          recipientEmail,
          eventRevision: 1,
        }),
        requestSource: templates.requestSource,
        notificationType: 'admin_alert' as const,
        subject: templates.internalSubject,
        htmlBody: templates.internalHtml,
        textBody: templates.internalText,
        eventRevision: 1,
        metadata: {
          correlationId,
          referenceCode: record.referenceCode,
          replyTo: safeClientReplyTo,
          requestSource: templates.requestSource,
        },
      });
    }

    return { items, dualConfig };
  }

  public buildAppointmentOutboxInputs(
    appointment: AppointmentRecord,
    correlationId?: string,
    kind: 'requested' | 'rescheduled' | 'cancelled' = 'requested'
  ) {
    const dualConfig = this.getDualNotificationConfig();
    const templates = this.buildConsultationTemplates(appointment, kind);
    const safeClientReplyTo = isValidEmailAddress(appointment.email)
      ? appointment.email.trim().toLowerCase()
      : undefined;
    const normalizedCustomerEmail = appointment.email.trim().toLowerCase();
    const dedupeSuffix = kind === 'requested' ? 'req' : `${kind}:${appointment.updatedAt}`;
    const eventRevision = kind === 'requested' ? 1 : `${kind}-${appointment.updatedAt.replace(/[^0-9]/g, '').slice(0, 14)}`;
    const notificationType = kind === 'requested' ? ('appointment_request' as const) : ('appointment_update' as const);

    const items: CreateOutboxInput[] = [
      {
        dedupeKey: `apt:${appointment.referenceCode}:customer:${normalizedCustomerEmail}:${dedupeSuffix}`,
        entityType: 'appointment' as const,
        entityReference: appointment.referenceCode,
        recipientEmail: normalizedCustomerEmail,
        replyTo: corporateIdentity.contact.email,
        idempotencyKey: buildNotificationIdempotencyKey({
          entityType: 'appointment',
          entityReference: appointment.referenceCode,
          notificationType,
          recipientEmail: normalizedCustomerEmail,
          eventRevision,
        }),
        requestSource: templates.requestSource,
        notificationType,
        subject: templates.customerSubject,
        htmlBody: templates.customerHtml,
        textBody: templates.customerText,
        eventRevision: 1,
        metadata: {
          correlationId,
          referenceCode: appointment.referenceCode,
          kind,
          replyTo: corporateIdentity.contact.email,
          requestSource: templates.requestSource,
        },
      },
    ];

    const recipients = dualConfig.executiveConsultation.enabled
      ? dualConfig.executiveConsultation.recipients
      : [];
    for (const rawRecipient of recipients) {
      const recipientEmail = rawRecipient.trim().toLowerCase();
      items.push({
        dedupeKey: `apt:${appointment.referenceCode}:recipient:${recipientEmail}:${dedupeSuffix}`,
        entityType: 'appointment' as const,
        entityReference: appointment.referenceCode,
        recipientEmail,
        replyTo: safeClientReplyTo,
        idempotencyKey: buildNotificationIdempotencyKey({
          entityType: 'appointment',
          entityReference: appointment.referenceCode,
          notificationType: 'admin_alert',
          recipientEmail,
          eventRevision,
        }),
        requestSource: templates.requestSource,
        notificationType: 'admin_alert' as const,
        subject: templates.internalSubject,
        htmlBody: templates.internalHtml,
        textBody: templates.internalText,
        eventRevision: 1,
        metadata: {
          correlationId,
          referenceCode: appointment.referenceCode,
          kind,
          replyTo: safeClientReplyTo,
          requestSource: templates.requestSource,
        },
      });
    }

    return { items, dualConfig };
  }

  public async dispatchPersistedSolutionOutbox(
    referenceCode: string,
    outboxRecords: EmailOutboxRecord[],
    notificationsEnabled: boolean,
    correlationId?: string
  ): Promise<DualRecipientDeliveryOutcome> {
    const customerRecord = outboxRecords.find((o) => o.notificationType === 'customer_confirmation');
    const adminRecords = outboxRecords.filter((o) => o.notificationType === 'admin_alert');

    const customerStatus: DeliveryStatusSummary = customerRecord
      ? await this.dispatchOutboxRecord(customerRecord, correlationId)
      : 'unconfigured';

    const recipientStatuses: DeliveryStatusSummary[] = [];
    if (notificationsEnabled && adminRecords.length > 0) {
      const settled = await Promise.allSettled(
        adminRecords.map((item) => this.dispatchOutboxRecord(item, correlationId))
      );
      for (const s of settled) {
        if (s.status === 'fulfilled') {
          recipientStatuses.push(s.value);
        } else {
          recipientStatuses.push('failed');
          logStructured('error', 'dual_recipient_inquiry_dispatch_error', {
            correlationId,
            referenceCode,
            error: s.reason?.message || 'Unexpected error sending recipient notification',
          });
        }
      }
    }

    const outcome = this.summarizeOutcome(customerStatus, recipientStatuses, notificationsEnabled);
    const legacyDbStatus: 'pending' | 'sent' | 'failed' | 'unconfigured' =
      outcome.overallStatus === 'provider_accepted' || outcome.overallStatus === 'delivered'
        ? 'sent'
        : outcome.overallStatus === 'unconfigured'
        ? 'unconfigured'
        : outcome.overallStatus === 'queued'
        ? 'pending'
        : 'failed';
    await this.db.updateSolutionRequestEmailStatus(referenceCode, legacyDbStatus);
    return outcome;
  }

  public async dispatchPersistedAppointmentOutbox(
    referenceCode: string,
    outboxRecords: EmailOutboxRecord[],
    notificationsEnabled: boolean,
    correlationId?: string
  ): Promise<DualRecipientDeliveryOutcome> {
    const customerRecord = outboxRecords.find(
      (o) => o.notificationType === 'appointment_request' || o.notificationType === 'appointment_update'
    );
    const adminRecords = outboxRecords.filter((o) => o.notificationType === 'admin_alert');

    const customerStatus: DeliveryStatusSummary = customerRecord
      ? await this.dispatchOutboxRecord(customerRecord, correlationId)
      : 'unconfigured';

    const recipientStatuses: DeliveryStatusSummary[] = [];
    if (notificationsEnabled && adminRecords.length > 0) {
      const settled = await Promise.allSettled(
        adminRecords.map((item) => this.dispatchOutboxRecord(item, correlationId))
      );
      for (const s of settled) {
        if (s.status === 'fulfilled') {
          recipientStatuses.push(s.value);
        } else {
          recipientStatuses.push('failed');
          logStructured('error', 'dual_recipient_consultation_dispatch_error', {
            correlationId,
            referenceCode,
            error: s.reason?.message || 'Unexpected error sending consultation notification',
          });
        }
      }
    }

    return this.summarizeOutcome(customerStatus, recipientStatuses, notificationsEnabled);
  }

  /**
   * ERR-011: Retrieves ACTUAL persisted delivery status for duplicate idempotent submissions
   * instead of returning fabricated zeros or hardcoded 'unconfigured'.
   */
  public async getPersistedDeliveryOutcome(
    entityType: 'solution_request' | 'appointment',
    entityReference: string
  ): Promise<DualRecipientDeliveryOutcome> {
    const dualConfig = this.getDualNotificationConfig();
    const enabled =
      entityType === 'solution_request'
        ? dualConfig.serviceInquiry.enabled
        : dualConfig.executiveConsultation.enabled;

    if (!this.db.listOutboxByEntity) {
      return this.summarizeOutcome('unconfigured', [], enabled);
    }

    const rows = await this.db.listOutboxByEntity(entityType, entityReference);
    if (rows.length === 0) {
      return this.summarizeOutcome('queued', [], enabled);
    }

    const customerRow = rows.find((r) => r.notificationType !== 'admin_alert');
    const adminRows = rows.filter((r) => r.notificationType === 'admin_alert');

    const customerStatus = customerRow
      ? this.mapOutboxStatusToSummary(customerRow.status)
      : 'unconfigured';
    const recipientStatuses = adminRows.map((r) => this.mapOutboxStatusToSummary(r.status));
    return this.summarizeOutcome(customerStatus, recipientStatuses, enabled);
  }

  public async enqueueAndSendSolutionRequestEmails(
    record: SolutionRequestRecord,
    correlationId?: string
  ): Promise<DualRecipientDeliveryOutcome> {
    const { items, dualConfig } = this.buildSolutionRequestOutboxInputs(record, correlationId);
    const outboxRecords: EmailOutboxRecord[] = [];
    for (const item of items) {
      const created = await this.db.createOutboxRecord(item);
      outboxRecords.push(created.record);
    }
    return this.dispatchPersistedSolutionOutbox(
      record.referenceCode,
      outboxRecords,
      dualConfig.serviceInquiry.enabled,
      correlationId
    );
  }

  public async enqueueAndSendAppointmentEmails(
    appointment: AppointmentRecord,
    correlationId?: string,
    kind: 'requested' | 'rescheduled' | 'cancelled' = 'requested'
  ): Promise<DualRecipientDeliveryOutcome> {
    const { items, dualConfig } = this.buildAppointmentOutboxInputs(appointment, correlationId, kind);
    const outboxRecords: EmailOutboxRecord[] = [];
    for (const item of items) {
      const created = await this.db.createOutboxRecord(item);
      outboxRecords.push(created.record);
    }
    return this.dispatchPersistedAppointmentOutbox(
      appointment.referenceCode,
      outboxRecords,
      dualConfig.executiveConsultation.enabled,
      correlationId
    );
  }

  /**
   * Backwards-compatible alias for consultation notification dispatch.
   */
  public async sendAppointmentNotifications(
    appointment: AppointmentRecord,
    event: 'created' | 'requested' | 'rescheduled' | 'cancelled' = 'created',
    correlationId?: string
  ): Promise<DualRecipientDeliveryOutcome> {
    const kind: 'requested' | 'rescheduled' | 'cancelled' =
      event === 'created' ? 'requested' : event;
    return this.enqueueAndSendAppointmentEmails(appointment, correlationId, kind);
  }

  /**
   * ERR-002: Atomic multi-worker notification queue processing with worker lease claiming,
   * expired lease recovery, bounded retries, dead-lettering, and non-retryable bounce/complaint guard.
   */
  public async processRetryQueue(
    limit = 20,
    correlationId?: string,
    workerId = `worker-${process.pid}-${crypto.randomUUID().slice(0, 8)}`,
    leaseSeconds = 120
  ): Promise<number> {
    if (!this.transport.isConfigured) return 0;

    const claimed = this.db.claimRetryableOutbox
      ? await this.db.claimRetryableOutbox(workerId, limit, leaseSeconds)
      : await this.db.listRetryableOutbox(limit);

    let processed = 0;
    for (const item of claimed) {
      if (
        item.status === 'bounced' ||
        item.status === 'complained' ||
        item.status === 'delivered' ||
        item.status === 'dead_letter'
      ) {
        continue;
      }
      try {
        await this.dispatchOutboxRecord(item, correlationId);
        processed += 1;
      } catch (err: any) {
        logStructured('error', 'outbox_retry_item_error', {
          correlationId,
          workerId,
          outboxId: item.id,
          error: err?.message,
        });
      }
    }
    return processed;
  }

  /**
   * Controlled admin manual retry for failed or dead-lettered notifications.
   * Rejects already delivered records and never silently bypasses audit logging.
   */
  public async adminRetryOutboxRecord(
    outboxId: string,
    correlationId?: string
  ): Promise<{ ok: boolean; status?: DeliveryStatusSummary; error?: string }> {
    if (!this.db.getOutboxById) {
      return { ok: false, error: 'Repository does not support single-record outbox inspection.' };
    }
    const existing = await this.db.getOutboxById(outboxId);
    if (!existing) {
      return { ok: false, error: 'Notification outbox record not found.' };
    }
    if (existing.status === 'delivered') {
      return { ok: false, error: 'Notification was already confirmed delivered and cannot be re-dispatched.' };
    }
    if (existing.status === 'complained') {
      return {
        ok: false,
        error: 'Notification received a spam complaint and is permanently suppressed from re-dispatch.',
      };
    }

    // Reset attempt count if dead-lettered so admin manual retry gets a clean attempt
    const resetRecord: EmailOutboxRecord = {
      ...existing,
      status: 'queued',
      deliveryAttempts: existing.status === 'dead_letter' ? 0 : existing.deliveryAttempts,
    };
    await this.db.updateOutboxStatus(existing.id, {
      status: 'queued',
      deliveryAttempts: resetRecord.deliveryAttempts,
      nextRetryAt: null,
      deadLetteredAt: null,
      claimedBy: null,
      claimedAt: null,
      leaseExpiresAt: null,
      lastError: null,
    });

    const newStatus = await this.dispatchOutboxRecord(resetRecord, correlationId);
    return { ok: true, status: newStatus };
  }

  /**
   * ERR-005 & ERR-006: Processes verified Resend delivery webhook events with:
   * - Strict UTC ISO-8601 timestamp validation & normalization
   * - Durable event deduplication via notification_webhook_events
   * - Preservation of original deliveredAt timestamp across duplicates
   * - Out-of-order monotonic transition protection
   * - Pending reconciliation storage if webhook arrives before provider_reference is saved
   */
  public async handleResendWebhookEvent(
    payload: ResendWebhookEventPayload,
    correlationId?: string,
    options: { svixId?: string; svixTimestamp?: string } = {}
  ): Promise<{
    matched: boolean;
    deduplicated?: boolean;
    pendingReconciliation?: boolean;
    status?: string;
    outboxId?: string;
    eventTimestampUtc?: string;
  }> {
    const eventType = String(payload.type || '').trim().toLowerCase();
    const emailId = typeof payload.data?.email_id === 'string' ? payload.data.email_id.trim() : '';
    const normalizedTs = normalizeWebhookTimestamp(payload.created_at, options.svixTimestamp);

    if (!eventType) {
      return { matched: false, eventTimestampUtc: normalizedTs.iso };
    }

    const providerEventId =
      (options.svixId && options.svixId.trim()) ||
      crypto
        .createHash('sha256')
        .update(`${eventType}|${emailId}|${String(payload.created_at || '')}`)
        .digest('hex');

    let persistedWebhookId: string | undefined;
    if (this.db.recordWebhookEventOnce) {
      const recorded = await this.db.recordWebhookEventOnce({
        provider: 'resend',
        providerEventId,
        eventType,
        providerMessageId: emailId || undefined,
        eventTimestampUtc: normalizedTs.iso,
        payload: (payload as unknown as Record<string, unknown>) || {},
      });
      persistedWebhookId = recorded.record.id;
      if (!recorded.inserted && recorded.record.reconciled) {
        return {
          matched: true,
          deduplicated: true,
          status: 'duplicate_ignored',
          outboxId: recorded.record.outboxId,
          eventTimestampUtc: normalizedTs.iso,
        };
      }
    }

    if (!emailId || !this.db.findOutboxByProviderReference) {
      return {
        matched: false,
        pendingReconciliation: Boolean(persistedWebhookId),
        status: persistedWebhookId ? 'pending_reconciliation' : 'ignored',
        eventTimestampUtc: normalizedTs.iso,
      };
    }

    const existing = await this.db.findOutboxByProviderReference(emailId);
    if (!existing) {
      return {
        matched: false,
        pendingReconciliation: Boolean(persistedWebhookId),
        status: persistedWebhookId ? 'pending_reconciliation' : 'unmatched',
        eventTimestampUtc: normalizedTs.iso,
      };
    }

    const bounceReason =
      typeof payload.data?.bounce?.message === 'string' ? payload.data.bounce.message : undefined;

    const transition = await this.applyWebhookTransitionToOutbox(
      existing,
      eventType,
      normalizedTs.iso,
      providerEventId,
      bounceReason,
      correlationId
    );

    if (persistedWebhookId && this.db.markWebhookEventReconciled) {
      await this.db.markWebhookEventReconciled(persistedWebhookId, existing.id);
    }

    return {
      matched: true,
      deduplicated: false,
      status: transition.status,
      outboxId: existing.id,
      eventTimestampUtc: normalizedTs.iso,
    };
  }

  public getConfiguredAdminInbox(): string {
    return this.adminInbox;
  }

  public async sendSolutionRequestEmails(record: SolutionRequestRecord, correlationId?: string) {
    return this.enqueueAndSendSolutionRequestEmails(record, correlationId);
  }

  public async sendAppointmentEmails(
    appointment: AppointmentRecord,
    correlationId?: string,
    kind: 'requested' | 'rescheduled' | 'cancelled' = 'requested'
  ) {
    return this.enqueueAndSendAppointmentEmails(appointment, correlationId, kind);
  }

  public async dispatchPortalTransactionalEmail(params: {
    to: string;
    subject: string;
    badge: string;
    heading: string;
    greetingName: string;
    bodyParagraphs: string[];
    ctaLabel?: string;
    ctaUrl?: string;
    fallbackCodeLabel?: string;
    fallbackCodeValue?: string;
    correlationId?: string;
    emailType:
      | 'verification'
      | 'password_recovery'
      | 'email_change'
      | 'security_alert'
      | 'proposal_notification'
      | 'project_update'
      | 'support_update'
      | 'invoice_notification';
  }): Promise<{
    deliveryStatus:
      | 'request_accepted'
      | 'queued'
      | 'provider_accepted'
      | 'failed'
      | 'delivery_unverified'
      | 'unconfigured';
    provider: string;
    providerMessageId?: string;
    error?: string;
  }> {
    const safeGreeting = escapeHtml(params.greetingName || 'Valued Client');
    const paragraphsHtml = params.bodyParagraphs
      .map((p) => `<p style="margin:0 0 12px 0;font-size:14px;line-height:1.65;color:#CBD5E1;">${escapeHtml(p)}</p>`)
      .join('');

    const ctaHtml =
      params.ctaLabel && params.ctaUrl
        ? `<div style="margin:22px 0;">
            <a href="${escapeHtml(params.ctaUrl)}" style="display:inline-block;padding:12px 22px;background-color:#00C2C7;color:#0B1220;font-size:13px;font-weight:700;text-decoration:none;border-radius:8px;">
              ${escapeHtml(params.ctaLabel)}
            </a>
          </div>
          <p style="margin:0 0 12px 0;font-size:12px;color:#94A3B8;word-break:break-all;">
            If the button above does not open automatically, copy and paste this secure link into your browser:<br />
            <a href="${escapeHtml(params.ctaUrl)}" style="color:#00C2C7;">${escapeHtml(params.ctaUrl)}</a>
          </p>`
        : '';

    const codeHtml =
      params.fallbackCodeLabel && params.fallbackCodeValue
        ? `<div style="margin:16px 0;padding:12px 14px;background-color:#0F172A;border:1px solid #1E293B;border-radius:8px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#94A3B8;margin-bottom:4px;">
              ${escapeHtml(params.fallbackCodeLabel)}
            </div>
            <div style="font-family:monospace;font-size:13px;color:#F8FAFC;word-break:break-all;">
              ${escapeHtml(params.fallbackCodeValue)}
            </div>
          </div>`
        : '';

    const html = renderEmailShell(
      params.subject,
      params.badge,
      `
        <h2 style="margin:0 0 14px 0;font-size:20px;color:#FFFFFF;font-weight:700;">${escapeHtml(params.heading)}</h2>
        <p style="margin:0 0 14px 0;font-size:14px;color:#E2E8F0;">Dear ${safeGreeting},</p>
        ${paragraphsHtml}
        ${ctaHtml}
        ${codeHtml}
        <p style="margin:18px 0 0 0;font-size:12px;color:#94A3B8;line-height:1.6;">
          If you did not initiate this request, please contact ${escapeHtml(corporateIdentity.legalName)} immediately at ${escapeHtml(corporateIdentity.contact.email)} or ${escapeHtml(corporateIdentity.contact.telephone.display)}.
        </p>
      `
    );

    const textLines = [
      `${corporateIdentity.legalName} (${corporateIdentity.networkName})`,
      params.heading,
      '',
      `Dear ${params.greetingName || 'Valued Client'},`,
      '',
      ...params.bodyParagraphs,
      ...(params.ctaUrl ? ['', `${params.ctaLabel || 'Action link'}: ${params.ctaUrl}`] : []),
      ...(params.fallbackCodeValue
        ? ['', `${params.fallbackCodeLabel || 'Security Token'}: ${params.fallbackCodeValue}`]
        : []),
      '',
      `Official Support: ${corporateIdentity.contact.email} | ${corporateIdentity.contact.telephone.display}`,
      corporateIdentity.headquarters.fullAddress,
    ];

    if (!this.transport.isConfigured) {
      logStructured('warn', 'portal_email_unconfigured', {
        correlationId: params.correlationId,
        emailType: params.emailType,
        recipientEmail: params.to,
      });
      return {
        deliveryStatus: 'unconfigured',
        provider: 'resend',
        error: 'Transactional email provider (RESEND_API_KEY) is not configured on this server.',
      };
    }

    const result = await this.transport.send({
      to: params.to,
      subject: params.subject,
      html,
      text: textLines.join('\n'),
    });

    if ((result.status === 'provider_accepted' || result.status === 'sent') && result.providerReference?.trim()) {
      logStructured('info', 'portal_email_provider_accepted', {
        correlationId: params.correlationId,
        emailType: params.emailType,
        recipientEmail: params.to,
        providerReference: result.providerReference,
      });
      return {
        deliveryStatus: 'provider_accepted',
        provider: 'resend',
        providerMessageId: result.providerReference,
      };
    }

    logStructured('error', 'portal_email_dispatch_failed', {
      correlationId: params.correlationId,
      emailType: params.emailType,
      recipientEmail: params.to,
      error: result.error,
    });
    return {
      deliveryStatus: result.status === 'unconfigured' ? 'unconfigured' : 'failed',
      provider: 'resend',
      error: result.error || 'Email provider rejected or failed to dispatch the message.',
    };
  }

  public async sendPortalVerificationEmail(params: {
    to: string;
    fullName: string;
    verificationToken: string;
    correlationId?: string;
  }) {
    const verificationUrl = `${buildCanonicalPublicUrl(ROUTES.PORTAL.VERIFY_EMAIL)}?token=${encodeURIComponent(
      params.verificationToken
    )}`;
    return this.dispatchPortalTransactionalEmail({
      to: params.to,
      subject: `Verify your ${corporateIdentity.legalName} Client Portal email`,
      badge: 'Email Verification',
      heading: 'Confirm Your Client Portal Email Address',
      greetingName: params.fullName,
      bodyParagraphs: [
        `Thank you for registering with the ${corporateIdentity.legalName} (${corporateIdentity.networkName}) Client Portal.`,
        'Please confirm ownership of this email address within 24 hours to activate full account security and corporate communications.',
      ],
      ctaLabel: 'Verify Email Address',
      ctaUrl: verificationUrl,
      fallbackCodeLabel: 'Verification Code (Expires in 24 Hours)',
      fallbackCodeValue: params.verificationToken,
      correlationId: params.correlationId,
      emailType: 'verification',
    });
  }

  public async sendPortalPasswordRecoveryEmail(params: {
    to: string;
    fullName: string;
    resetToken: string;
    correlationId?: string;
  }) {
    const resetUrl = `${buildCanonicalPublicUrl(ROUTES.PORTAL.RESET_PASSWORD)}?token=${encodeURIComponent(
      params.resetToken
    )}`;
    return this.dispatchPortalTransactionalEmail({
      to: params.to,
      subject: `${corporateIdentity.legalName} Client Portal Password Recovery`,
      badge: 'Security Recovery',
      heading: 'Reset Your Client Portal Password',
      greetingName: params.fullName,
      bodyParagraphs: [
        `We received a request to reset the password for your ${corporateIdentity.legalName} Client Portal account.`,
        'This single-use recovery link expires in 60 minutes. Completing a password reset automatically revokes all prior active portal sessions.',
      ],
      ctaLabel: 'Reset Password',
      ctaUrl: resetUrl,
      fallbackCodeLabel: 'Single-Use Recovery Token (Expires in 60 Minutes)',
      fallbackCodeValue: params.resetToken,
      correlationId: params.correlationId,
      emailType: 'password_recovery',
    });
  }

  public async sendPortalEmailChangeEmail(params: {
    to: string;
    fullName: string;
    confirmationToken: string;
    correlationId?: string;
  }) {
    const confirmUrl = `${buildCanonicalPublicUrl(ROUTES.PORTAL.SECURITY)}?emailChangeToken=${encodeURIComponent(
      params.confirmationToken
    )}`;
    return this.dispatchPortalTransactionalEmail({
      to: params.to,
      subject: `Confirm your new ${corporateIdentity.legalName} Client Portal email`,
      badge: 'Account Security',
      heading: 'Confirm Email Address Change',
      greetingName: params.fullName,
      bodyParagraphs: [
        'A request was submitted to update the primary login email address on your DESTRIA TECH INC Client Portal account.',
        'Use the confirmation code or secure link below within 60 minutes to complete this change.',
      ],
      ctaLabel: 'Open Security Settings',
      ctaUrl: confirmUrl,
      fallbackCodeLabel: 'Email Change Confirmation Code',
      fallbackCodeValue: params.confirmationToken,
      correlationId: params.correlationId,
      emailType: 'email_change',
    });
  }

  public async sendPortalSecurityAlertEmail(params: {
    to: string;
    fullName: string;
    eventTitle: string;
    eventDetails: string;
    correlationId?: string;
  }) {
    return this.dispatchPortalTransactionalEmail({
      to: params.to,
      subject: `Security Notice: ${params.eventTitle} — ${corporateIdentity.legalName}`,
      badge: 'Security Alert',
      heading: params.eventTitle,
      greetingName: params.fullName,
      bodyParagraphs: [
        params.eventDetails,
        'You can review active sessions and security settings inside your Client Portal at any time.',
      ],
      ctaLabel: 'Review Security Settings',
      ctaUrl: buildCanonicalPublicUrl(ROUTES.PORTAL.SECURITY),
      correlationId: params.correlationId,
      emailType: 'security_alert',
    });
  }

  public async sendPortalLifecycleNotificationEmail(params: {
    to: string;
    fullName: string;
    subject: string;
    heading: string;
    message: string;
    actionLabel?: string;
    actionPath?: string;
    emailType:
      | 'proposal_notification'
      | 'project_update'
      | 'support_update'
      | 'invoice_notification';
    correlationId?: string;
  }) {
    return this.dispatchPortalTransactionalEmail({
      to: params.to,
      subject: params.subject,
      badge: 'Client Portal Update',
      heading: params.heading,
      greetingName: params.fullName,
      bodyParagraphs: [params.message],
      ctaLabel: params.actionLabel || 'Open Client Portal',
      ctaUrl: buildCanonicalPublicUrl(params.actionPath || ROUTES.PORTAL.DASHBOARD),
      correlationId: params.correlationId,
      emailType: params.emailType,
    });
  }
}

export const NotificationEmailService = TransactionalEmailService;
