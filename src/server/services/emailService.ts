import crypto from 'crypto';
import { COMPANY_CONFIG, COMMERCIAL_ENGAGEMENT_STATEMENT, corporateIdentity } from '../../data/companyConfig';
import { BRAND_ASSETS } from '../../data/brandAssets';
import { getCatalogServiceById } from '../../data/serviceCatalog';
import { ROUTES, buildCanonicalPublicUrl } from '../../config/routes';
import { AppointmentRecord, DatabaseRepository, EmailOutboxRecord, SolutionRequestRecord } from '../db/types';
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
  status: 'sent' | 'failed' | 'unconfigured';
  providerReference?: string;
  providerAcceptedAt?: string;
  error?: string;
}

export interface EmailTransport {
  readonly isConfigured: boolean;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export interface DualRecipientDeliveryOutcome {
  customerStatus: 'sent' | 'failed' | 'unconfigured';
  adminStatus: 'sent' | 'failed' | 'unconfigured';
  overallStatus: 'sent' | 'failed' | 'unconfigured';
  notifiedRecipientsCount: number;
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

/**
 * Production Resend transactional email transport.
 * - Honestly reports 'unconfigured' when RESEND_API_KEY is absent instead of faking delivery.
 * - Enforces request timeouts via AbortController so hung provider calls fail safely & queue for retry.
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

      const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!response.ok) {
        return {
          status: 'failed',
          error: body.message || `Resend HTTP ${response.status}`,
        };
      }

      const acceptedAt = new Date().toISOString();
      if (typeof body.id !== 'string' || !body.id.trim()) return { status: 'failed', error: 'Resend response missing message ID.' };
      return {
        status: 'sent',
        providerReference: body.id,
        providerAcceptedAt: acceptedAt,
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

  private async dispatchOutboxRecord(
    record: EmailOutboxRecord,
    correlationId?: string
  ): Promise<'sent' | 'failed' | 'unconfigured'> {
    const attemptNumber = (record.deliveryAttempts || 0) + 1;
    const attemptTimestamp = new Date().toISOString();
    const replyTo =
      record.replyTo ||
      (typeof record.metadata?.replyTo === 'string' ? record.metadata.replyTo : undefined);
    const idempotencyKey =
      record.idempotencyKey ||
      (typeof record.metadata?.idempotencyKey === 'string'
        ? record.metadata.idempotencyKey
        : record.dedupeKey);

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

    if (result.status === 'sent') {
      const acceptedAt = result.providerAcceptedAt || new Date().toISOString();
      await this.db.updateOutboxStatus(record.id, {
        status: 'sent',
        providerReference: result.providerReference,
        deliveryAttempts: attemptNumber,
        lastAttemptAt: attemptTimestamp,
        providerAcceptedAt: acceptedAt,
        sentAt: acceptedAt,
        nextRetryAt: null,
      });
      logStructured('info', 'transactional_email_sent', {
        correlationId,
        entityType: record.entityType,
        entityReference: record.entityReference,
        notificationType: record.notificationType,
        providerReference: result.providerReference,
      });
      return 'sent';
    }

    if (result.status === 'unconfigured') {
      await this.db.updateOutboxStatus(record.id, {
        status: 'unconfigured',
        deliveryAttempts: attemptNumber,
        lastAttemptAt: attemptTimestamp,
        lastError: result.error,
        nextRetryAt: null,
      });
      logStructured('warn', 'transactional_email_unconfigured', {
        correlationId,
        entityType: record.entityType,
        entityReference: record.entityReference,
        notificationType: record.notificationType,
      });
      return 'unconfigured';
    }

    // Exponential backoff retry schedule: 2m, 8m, 32m, 2h
    const backoffMinutes = Math.min(120, Math.pow(2, attemptNumber) * 2);
    const nextRetry = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();
    await this.db.updateOutboxStatus(record.id, {
      status: 'failed',
      deliveryAttempts: attemptNumber,
      lastAttemptAt: attemptTimestamp,
      lastError: result.error,
      nextRetryAt: attemptNumber < 5 ? nextRetry : null,
    });
    logStructured('error', 'transactional_email_failed', {
      correlationId,
      entityType: record.entityType,
      entityReference: record.entityReference,
      notificationType: record.notificationType,
      attemptNumber,
      error: result.error,
    });
    return 'failed';
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

  public async enqueueAndSendSolutionRequestEmails(
    record: SolutionRequestRecord,
    correlationId?: string
  ): Promise<DualRecipientDeliveryOutcome> {
    const dualConfig = this.getDualNotificationConfig();
    const templates = this.buildServiceInquiryTemplates(record);
    const safeClientReplyTo = isValidEmailAddress(record.email) ? record.email.trim().toLowerCase() : undefined;

    // 1. Customer confirmation outbox record
    const custOutbox = await this.db.createOutboxRecord({
      dedupeKey: `sol:${record.referenceCode}:customer`,
      entityType: 'solution_request',
      entityReference: record.referenceCode,
      recipientEmail: record.email,
      replyTo: corporateIdentity.contact.email,
      idempotencyKey: `sol-${record.referenceCode}-customer`,
      requestSource: templates.requestSource,
      notificationType: 'customer_confirmation',
      subject: templates.customerSubject,
      htmlBody: templates.customerHtml,
      textBody: templates.customerText,
      metadata: {
        correlationId,
        referenceCode: record.referenceCode,
        replyTo: corporateIdentity.contact.email,
        requestSource: templates.requestSource,
      },
    });

    const customerStatus = await this.dispatchOutboxRecord(custOutbox.record, correlationId);

    // 2. Dual-recipient independent delivery (each authorized recipient gets its own durable outbox record & isolated try/catch)
    const recipients = dualConfig.serviceInquiry.enabled ? dualConfig.serviceInquiry.recipients : [];
    const recipientStatuses: Array<'sent' | 'failed' | 'unconfigured'> = [];

    if (dualConfig.serviceInquiry.enabled && recipients.length > 0) {
      const dispatchResults = await Promise.allSettled(
        recipients.map(async (recipientEmail, idx) => {
          const outboxItem = await this.db.createOutboxRecord({
            dedupeKey: `sol:${record.referenceCode}:recipient:${recipientEmail}`,
            entityType: 'solution_request',
            entityReference: record.referenceCode,
            recipientEmail,
            replyTo: safeClientReplyTo,
            idempotencyKey: crypto.createHash('sha256').update(`sol:${record.referenceCode}:recipient:${recipientEmail}`).digest('hex'),
            requestSource: templates.requestSource,
            notificationType: 'admin_alert',
            subject: templates.internalSubject,
            htmlBody: templates.internalHtml,
            textBody: templates.internalText,
            metadata: {
              correlationId,
              referenceCode: record.referenceCode,
              recipientSlot: idx + 1,
              replyTo: safeClientReplyTo,
              requestSource: templates.requestSource,
            },
          });
          return this.dispatchOutboxRecord(outboxItem.record, correlationId);
        })
      );

      for (const settled of dispatchResults) {
        if (settled.status === 'fulfilled') {
          recipientStatuses.push(settled.value);
        } else {
          recipientStatuses.push('failed');
          logStructured('error', 'dual_recipient_inquiry_dispatch_error', {
            correlationId,
            referenceCode: record.referenceCode,
            error: settled.reason?.message || 'Unexpected error sending recipient notification',
          });
        }
      }
    }

    const deliveredCount = recipientStatuses.filter((s) => s === 'sent').length;
    const failedCount = recipientStatuses.filter((s) => s === 'failed').length;
    const unconfiguredCount = recipientStatuses.filter((s) => s === 'unconfigured').length;
    const partialFailure = deliveredCount > 0 && failedCount > 0;

    let adminStatus: 'sent' | 'failed' | 'unconfigured';
    if (!dualConfig.serviceInquiry.enabled || recipients.length === 0) {
      adminStatus = 'unconfigured';
    } else if (deliveredCount === recipients.length) {
      adminStatus = 'sent';
    } else if (unconfiguredCount === recipients.length) {
      adminStatus = 'unconfigured';
    } else {
      adminStatus = 'failed';
    }

    const overallStatus: 'sent' | 'failed' | 'unconfigured' =
      customerStatus === 'sent' && (adminStatus === 'sent' || !dualConfig.serviceInquiry.enabled)
        ? 'sent'
        : customerStatus === 'unconfigured' && adminStatus === 'unconfigured'
        ? 'unconfigured'
        : 'failed';

    await this.db.updateSolutionRequestEmailStatus(record.referenceCode, overallStatus);

    return {
      customerStatus,
      adminStatus,
      overallStatus,
      notifiedRecipientsCount: recipients.length,
      deliveredRecipientsCount: deliveredCount,
      failedRecipientsCount: failedCount,
      partialFailure,
      notificationsEnabled: dualConfig.serviceInquiry.enabled,
    };
  }

  public async enqueueAndSendAppointmentEmails(
    appointment: AppointmentRecord,
    correlationId?: string,
    kind: 'requested' | 'rescheduled' | 'cancelled' = 'requested'
  ): Promise<DualRecipientDeliveryOutcome> {
    const dualConfig = this.getDualNotificationConfig();
    const templates = this.buildConsultationTemplates(appointment, kind);
    const safeClientReplyTo = isValidEmailAddress(appointment.email)
      ? appointment.email.trim().toLowerCase()
      : undefined;
    const dedupeSuffix = kind === 'requested' ? 'req' : `${kind}:${appointment.updatedAt}`;
    const notificationType = kind === 'requested' ? 'appointment_request' : 'appointment_update';

    // 1. Customer confirmation outbox record
    const custOutbox = await this.db.createOutboxRecord({
      dedupeKey: `apt:${appointment.referenceCode}:customer:${dedupeSuffix}`,
      entityType: 'appointment',
      entityReference: appointment.referenceCode,
      recipientEmail: appointment.email,
      replyTo: corporateIdentity.contact.email,
      idempotencyKey: crypto.createHash('sha256').update(`apt:${appointment.referenceCode}:customer:${dedupeSuffix}`).digest('hex'),
      requestSource: templates.requestSource,
      notificationType,
      subject: templates.customerSubject,
      htmlBody: templates.customerHtml,
      textBody: templates.customerText,
      metadata: {
        correlationId,
        referenceCode: appointment.referenceCode,
        kind,
        replyTo: corporateIdentity.contact.email,
        requestSource: templates.requestSource,
      },
    });

    const customerStatus = await this.dispatchOutboxRecord(custOutbox.record, correlationId);

    // 2. Dual-recipient independent delivery
    const recipients = dualConfig.executiveConsultation.enabled
      ? dualConfig.executiveConsultation.recipients
      : [];
    const recipientStatuses: Array<'sent' | 'failed' | 'unconfigured'> = [];

    if (dualConfig.executiveConsultation.enabled && recipients.length > 0) {
      const dispatchResults = await Promise.allSettled(
        recipients.map(async (recipientEmail, idx) => {
          const outboxItem = await this.db.createOutboxRecord({
            dedupeKey: `apt:${appointment.referenceCode}:recipient:${recipientEmail}:${dedupeSuffix}`,
            entityType: 'appointment',
            entityReference: appointment.referenceCode,
            recipientEmail,
            replyTo: safeClientReplyTo,
            idempotencyKey: crypto.createHash('sha256').update(`apt:${appointment.referenceCode}:recipient:${recipientEmail}:${dedupeSuffix}`).digest('hex'),
            requestSource: templates.requestSource,
            notificationType: 'admin_alert',
            subject: templates.internalSubject,
            htmlBody: templates.internalHtml,
            textBody: templates.internalText,
            metadata: {
              correlationId,
              referenceCode: appointment.referenceCode,
              kind,
              recipientSlot: idx + 1,
              replyTo: safeClientReplyTo,
              requestSource: templates.requestSource,
            },
          });
          return this.dispatchOutboxRecord(outboxItem.record, correlationId);
        })
      );

      for (const settled of dispatchResults) {
        if (settled.status === 'fulfilled') {
          recipientStatuses.push(settled.value);
        } else {
          recipientStatuses.push('failed');
          logStructured('error', 'dual_recipient_consultation_dispatch_error', {
            correlationId,
            referenceCode: appointment.referenceCode,
            error: settled.reason?.message || 'Unexpected error sending consultation notification',
          });
        }
      }
    }

    const deliveredCount = recipientStatuses.filter((s) => s === 'sent').length;
    const failedCount = recipientStatuses.filter((s) => s === 'failed').length;
    const unconfiguredCount = recipientStatuses.filter((s) => s === 'unconfigured').length;
    const partialFailure = deliveredCount > 0 && failedCount > 0;

    let adminStatus: 'sent' | 'failed' | 'unconfigured';
    if (!dualConfig.executiveConsultation.enabled || recipients.length === 0) {
      adminStatus = 'unconfigured';
    } else if (deliveredCount === recipients.length) {
      adminStatus = 'sent';
    } else if (unconfiguredCount === recipients.length) {
      adminStatus = 'unconfigured';
    } else {
      adminStatus = 'failed';
    }

    const overallStatus: 'sent' | 'failed' | 'unconfigured' =
      customerStatus === 'sent' && (adminStatus === 'sent' || !dualConfig.executiveConsultation.enabled)
        ? 'sent'
        : customerStatus === 'unconfigured' && adminStatus === 'unconfigured'
        ? 'unconfigured'
        : 'failed';

    return {
      customerStatus,
      adminStatus,
      overallStatus,
      notifiedRecipientsCount: recipients.length,
      deliveredRecipientsCount: deliveredCount,
      failedRecipientsCount: failedCount,
      partialFailure,
      notificationsEnabled: dualConfig.executiveConsultation.enabled,
    };
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

  public async processRetryQueue(limit = 20, correlationId?: string): Promise<number> {
    if (!this.transport.isConfigured) return 0;
    const pending = await this.db.listRetryableOutbox(limit);
    let processed = 0;
    for (const item of pending) {
      try {
        await this.dispatchOutboxRecord(item, correlationId);
        processed += 1;
      } catch (err: any) {
        logStructured('error', 'outbox_retry_item_error', {
          correlationId,
          outboxId: item.id,
          error: err?.message,
        });
      }
    }
    return processed;
  }

  /**
   * Processes verified Resend delivery webhook events (email.delivered, email.bounced, email.complained)
   * to record genuine inbox delivery confirmation timestamps on durable outbox rows.
   */
  public async handleResendWebhookEvent(
    payload: ResendWebhookEventPayload,
    correlationId?: string
  ): Promise<{ matched: boolean; status?: string; outboxId?: string }> {
    const eventType = String(payload.type || '').trim().toLowerCase();
    const emailId = typeof payload.data?.email_id === 'string' ? payload.data.email_id.trim() : '';
    if (!emailId || !this.db.findOutboxByProviderReference) {
      return { matched: false };
    }

    const existing = await this.db.findOutboxByProviderReference(emailId);
    if (!existing) {
      return { matched: false };
    }

    const parsedEventTime = Date.parse(payload.created_at || '');
    const eventTs = Number.isFinite(parsedEventTime) ? new Date(parsedEventTime).toISOString() : new Date().toISOString();
    // A delayed notification must never downgrade a confirmed delivery.
    if (existing.status === 'delivered' && (eventType === 'email.delivered' || eventType === 'email.delivery_delayed')) {
      return { matched: true, status: existing.status, outboxId: existing.id };
    }

    if (eventType === 'email.delivered') {
      await this.db.updateOutboxStatus(existing.id, {
        status: 'delivered',
        providerReference: existing.providerReference,
        deliveryAttempts: existing.deliveryAttempts,
        deliveredAt: eventTs,
        sentAt: existing.sentAt || eventTs,
        nextRetryAt: null,
      });
      logStructured('info', 'transactional_email_delivery_confirmed', {
        correlationId,
        outboxId: existing.id,
        entityReference: existing.entityReference,
        providerReference: emailId,
      });
      return { matched: true, status: 'delivered', outboxId: existing.id };
    }

    if (eventType === 'email.bounced' || eventType === 'email.complained' || eventType === 'email.delivery_delayed') {
      const reason =
        payload.data?.bounce?.message ||
        `Resend webhook reported ${eventType}`;
      await this.db.updateOutboxStatus(existing.id, {
        status: eventType === 'email.delivery_delayed' ? existing.status : 'failed',
        providerReference: existing.providerReference,
        deliveryAttempts: existing.deliveryAttempts,
        lastError: reason,
        nextRetryAt: null,
      });
      logStructured('warn', 'transactional_email_webhook_issue', {
        correlationId,
        outboxId: existing.id,
        entityReference: existing.entityReference,
        eventType,
        reason,
      });
      return { matched: true, status: eventType, outboxId: existing.id };
    }

    return { matched: true, status: existing.status, outboxId: existing.id };
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

    if (result.status === 'sent') {
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
