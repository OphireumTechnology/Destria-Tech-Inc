/**
 * DESTRIA TECH INC — Centralized Server-Side Notification Recipient Configuration
 *
 * SECURITY BOUNDARY:
 * - Server-side ONLY. Never import this file from frontend components, client services, or Vite bundles.
 * - Never expose internal notification recipients in public API responses or HTML/JS assets.
 * - Does NOT replace ADMIN_NOTIFICATION_EMAIL (which remains independent for unrelated features).
 */

export const DEFAULT_AUTHORIZED_DUAL_RECIPIENTS = [
  'artaxsvcs@gmail.com',
  'dhenze.languisan@gmail.com',
] as const;

export const DEFAULT_NOTIFICATION_FROM =
  'DESTRIA TECH INC <notifications@destriatech.com>';

export interface ParsedRecipientResult {
  valid: boolean;
  recipients: string[];
  errors: string[];
}

export interface DualNotificationChannelConfig {
  enabled: boolean;
  recipients: string[];
  validationErrors: string[];
}

export interface DualNotificationConfig {
  provider: string;
  emailFrom: string;
  serviceInquiry: DualNotificationChannelConfig;
  executiveConsultation: DualNotificationChannelConfig;
  webhookSecret: string;
}

export interface DualNotificationOverrides {
  serviceInquiryRecipients?: string | string[];
  executiveConsultationRecipients?: string | string[];
  serviceInquiryEnabled?: boolean;
  executiveConsultationEnabled?: boolean;
  emailFrom?: string;
  provider?: string;
  webhookSecret?: string;
}

const STRICT_EMAIL_REGEX =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

/**
 * Prevents email header injection by removing CR/LF and non-printable ASCII control characters.
 */
export function sanitizeEmailHeader(value: string, maxLength = 250): string {
  return String(value ?? '')
    .replace(/[\r\n\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Strictly validates an email address and rejects any CR/LF or header-injection characters.
 */
export function isValidEmailAddress(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (/[\r\n\u0000-\u001f\u007f]/.test(value)) return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return false;
  return STRICT_EMAIL_REGEX.test(trimmed);
}

function parseBooleanFlag(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (['false', '0', 'no', 'off', 'disabled'].includes(normalized)) return false;
  if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  return defaultValue;
}

/**
 * Parses and validates comma-separated recipient strings into unique, normalized email addresses.
 * Rejects malformed addresses, header-injection characters, and duplicate entries cleanly.
 */
export function parseRecipients(
  rawValue: string | string[] | undefined | null,
  options: { requireMinimum?: number } = {}
): ParsedRecipientResult {
  const minCount = options.requireMinimum ?? 1;
  const errors: string[] = [];

  const tokens = Array.isArray(rawValue)
    ? rawValue.map((item) => String(item ?? ''))
    : typeof rawValue === 'string'
    ? rawValue.split(',')
    : [];

  const seen = new Set<string>();
  const recipients: string[] = [];

  for (const token of tokens) {
    if (/[\r\n\u0000-\u001f\u007f]/.test(token)) {
      errors.push('Recipient value contains prohibited control or newline characters.');
      continue;
    }
    const normalized = token.trim().toLowerCase();
    if (!normalized) continue;

    if (!isValidEmailAddress(normalized)) {
      errors.push(`Invalid notification recipient email format: "${normalized.slice(0, 64)}"`);
      continue;
    }
    if (seen.has(normalized)) {
      errors.push(`Duplicate notification recipient configured: "${normalized}"`);
      continue;
    }
    seen.add(normalized);
    recipients.push(normalized);
  }

  if (recipients.length < minCount) {
    errors.push(
      `Expected at least ${minCount} valid unique notification recipient(s), found ${recipients.length}.`
    );
  }

  return {
    valid: errors.length === 0 && recipients.length >= minCount,
    recipients,
    errors,
  };
}

/**
 * Resolves the server-side dual-recipient notification configuration for
 * Service Inquiries and Executive Consultations.
 *
 * Uses explicit environment variables when provided, falling back to the two
 * authorized DESTRIA TECH INC notification recipients when unset.
 */
export function resolveDualNotificationConfig(
  overrides: DualNotificationOverrides = {}
): DualNotificationConfig {
  const rawServiceRecipients =
    overrides.serviceInquiryRecipients !== undefined
      ? overrides.serviceInquiryRecipients
      : process.env.SERVICE_INQUIRY_RECIPIENTS !== undefined &&
        process.env.SERVICE_INQUIRY_RECIPIENTS.trim() !== ''
      ? process.env.SERVICE_INQUIRY_RECIPIENTS
      : [...DEFAULT_AUTHORIZED_DUAL_RECIPIENTS];

  const rawConsultationRecipients =
    overrides.executiveConsultationRecipients !== undefined
      ? overrides.executiveConsultationRecipients
      : process.env.EXECUTIVE_CONSULTATION_RECIPIENTS !== undefined &&
        process.env.EXECUTIVE_CONSULTATION_RECIPIENTS.trim() !== ''
      ? process.env.EXECUTIVE_CONSULTATION_RECIPIENTS
      : [...DEFAULT_AUTHORIZED_DUAL_RECIPIENTS];

  const parsedService = parseRecipients(rawServiceRecipients, { requireMinimum: 1 });
  const parsedConsultation = parseRecipients(rawConsultationRecipients, { requireMinimum: 1 });

  const serviceEnabled =
    overrides.serviceInquiryEnabled !== undefined
      ? overrides.serviceInquiryEnabled
      : parseBooleanFlag(process.env.SERVICE_INQUIRY_EMAIL_ENABLED, true);

  const consultationEnabled =
    overrides.executiveConsultationEnabled !== undefined
      ? overrides.executiveConsultationEnabled
      : parseBooleanFlag(process.env.EXECUTIVE_CONSULTATION_EMAIL_ENABLED, true);

  const provider = sanitizeEmailHeader(
    overrides.provider || process.env.EMAIL_PROVIDER || 'resend',
    40
  ).toLowerCase();

  const emailFrom = sanitizeEmailHeader(
    overrides.emailFrom || process.env.EMAIL_FROM || DEFAULT_NOTIFICATION_FROM,
    180
  );

  const webhookSecret = (
    overrides.webhookSecret ??
    process.env.RESEND_WEBHOOK_SECRET ??
    ''
  ).trim();

  return {
    provider: provider || 'resend',
    emailFrom: emailFrom || DEFAULT_NOTIFICATION_FROM,
    serviceInquiry: {
      enabled: serviceEnabled,
      recipients: parsedService.recipients,
      validationErrors: parsedService.errors,
    },
    executiveConsultation: {
      enabled: consultationEnabled,
      recipients: parsedConsultation.recipients,
      validationErrors: parsedConsultation.errors,
    },
    webhookSecret,
  };
}
