import { COMPANY_CONFIG, COMMERCIAL_ENGAGEMENT_STATEMENT, corporateIdentity } from '../../data/companyConfig';
import { BRAND_ASSETS } from '../../data/brandAssets';
import { getCatalogServiceById } from '../../data/serviceCatalog';
import { AppointmentRecord, DatabaseRepository, SolutionRequestRecord } from '../db/types';
import { logStructured } from '../logger';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface EmailSendResult {
  status: 'sent' | 'failed' | 'unconfigured';
  providerReference?: string;
  error?: string;
}

export interface EmailTransport {
  readonly isConfigured: boolean;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/**
 * Production Resend transactional email transport.
 * Honestly reports 'unconfigured' when RESEND_API_KEY is absent instead of faking delivery.
 */
export class ResendEmailTransport implements EmailTransport {
  private readonly apiKey: string;
  private readonly fromAddress: string;

  constructor(
    apiKey = process.env.RESEND_API_KEY || '',
    fromAddress = process.env.EMAIL_FROM ||
      `${corporateIdentity.legalName} <${corporateIdentity.contact.email}>`
  ) {
    this.apiKey = apiKey.trim();
    this.fromAddress = fromAddress.trim();
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

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        }),
      });

      const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!response.ok) {
        return {
          status: 'failed',
          error: body.message || `Resend HTTP ${response.status}`,
        };
      }

      if (typeof body.id !== 'string' || !body.id.trim()) return { status: 'failed', error: 'Missing provider dispatch reference' };
      return {
        status: 'sent',
        providerReference: body.id,
      };
    } catch (err: any) {
      return {
        status: 'failed',
        error: err?.message || 'Network failure dispatching email via Resend.',
      };
    }
  }
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
                    <div style="font-size:19px;font-weight:800;color:#FFFFFF;letter-spacing:-0.3px;">${escapeHtml(corporateIdentity.legalName)}</div>
                    <div style="font-size:11px;color:#94A3B8;margin-top:2px;">${escapeHtml(corporateIdentity.networkName)} &middot; ${escapeHtml(corporateIdentity.jurisdiction)}</div>
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
            <td style="padding:20px 28px;background-color:#0B1220;border-top:1px solid #1E293B;font-size:11px;color:#94A3B8;line-height:1.6;">
              <strong style="color:#E2E8F0;">${escapeHtml(corporateIdentity.legalName)} (${escapeHtml(corporateIdentity.abbreviation)})</strong> &middot; ${escapeHtml(corporateIdentity.networkName)}<br/>
              Headquarters: ${officialAddress}<br/>
              Telephone: <a href="${officialPhoneHref}" style="color:#00C2C7;text-decoration:none;">${officialPhone}</a> &middot; Email: <a href="mailto:${officialEmail}" style="color:#00C2C7;text-decoration:none;">${officialEmail}</a><br/>
              Website: <a href="${escapeHtml(corporateIdentity.contact.website)}" style="color:#00C2C7;text-decoration:none;">${escapeHtml(corporateIdentity.contact.website)}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export class TransactionalEmailService {
  private readonly adminInbox: string;

  constructor(
    private readonly db: DatabaseRepository,
    private readonly transport: EmailTransport,
    adminInbox = process.env.ADMIN_NOTIFICATION_EMAIL || corporateIdentity.contact.email
  ) {
    this.adminInbox = adminInbox.trim();
  }

  public isConfigured(): boolean {
    return this.transport.isConfigured;
  }

  private async enqueueAndDispatch(params: {
    dedupeKey: string;
    entityType: 'solution_request' | 'appointment';
    entityReference: string;
    recipientEmail: string;
    notificationType:
      | 'customer_confirmation'
      | 'admin_alert'
      | 'appointment_request'
      | 'appointment_update';
    subject: string;
    htmlBody: string;
    textBody: string;
    replyTo?: string;
    correlationId?: string;
  }): Promise<'sent' | 'failed' | 'unconfigured'> {
    const { record } = await this.db.createOutboxRecord({
      dedupeKey: params.dedupeKey,
      entityType: params.entityType,
      entityReference: params.entityReference,
      recipientEmail: params.recipientEmail,
      notificationType: params.notificationType,
      subject: params.subject,
      htmlBody: params.htmlBody,
      textBody: params.textBody,
    });

    if (record.status === 'sent') {
      return 'sent';
    }

    const result = await this.transport.send({
      to: params.recipientEmail,
      subject: params.subject,
      html: params.htmlBody,
      text: params.textBody,
      replyTo: params.replyTo,
    });

    if (result.status === 'sent') {
      await this.db.updateOutboxStatus(record.id, {
        status: 'sent',
        providerReference: result.providerReference,
        deliveryAttempts: record.deliveryAttempts + 1,
        sentAt: new Date().toISOString(),
        nextRetryAt: null,
      });
      logStructured('info', 'email_dispatched', {
        correlationId: params.correlationId,
        entityType: params.entityType,
        entityReference: params.entityReference,
        notificationType: params.notificationType,
        recipientEmail: params.recipientEmail,
        providerReference: result.providerReference,
      });
      return 'sent';
    }

    if (result.status === 'unconfigured') {
      await this.db.updateOutboxStatus(record.id, {
        status: 'unconfigured',
        deliveryAttempts: record.deliveryAttempts,
        lastError: result.error,
        nextRetryAt: null,
      });
      logStructured('warn', 'email_dispatch_skipped_unconfigured', {
        correlationId: params.correlationId,
        entityType: params.entityType,
        entityReference: params.entityReference,
        notificationType: params.notificationType,
      });
      return 'unconfigured';
    }

    const attempts = record.deliveryAttempts + 1;
    const backoffMinutes = Math.min(60, Math.pow(2, attempts));
    const nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();
    await this.db.updateOutboxStatus(record.id, {
      status: 'failed',
      deliveryAttempts: attempts,
      lastError: result.error,
      nextRetryAt,
    });
    logStructured('error', 'email_dispatch_failed', {
      correlationId: params.correlationId,
      entityType: params.entityType,
      entityReference: params.entityReference,
      notificationType: params.notificationType,
      attemptNumber: attempts,
      error: result.error,
    });
    return 'failed';
  }

  public async enqueueAndSendSolutionRequestEmails(
    request: SolutionRequestRecord,
    correlationId?: string
  ): Promise<{
    customerStatus: 'sent' | 'failed' | 'unconfigured';
    adminStatus: 'sent' | 'failed' | 'unconfigured';
    overallStatus: 'sent' | 'failed' | 'unconfigured';
  }> {
    const servicesListHtml =
      request.selectedServiceIds.length > 0
        ? request.selectedServiceIds
            .map((id) => {
              const svc = getCatalogServiceById(id);
              const title = svc ? svc.title : id;
              const opts = request.selectedOptionsMap[id] || [];
              const optNote = opts.length > 0 ? ` (${opts.length} scope module(s) requested)` : '';
              return `<li style="margin:6px 0;color:#E2E8F0;"><strong>${escapeHtml(title)}</strong> &mdash; <span style="color:#00C2C7;">Customized Enterprise Solution</span>${escapeHtml(optNote)}</li>`;
            })
            .join('')
        : `<li style="margin:6px 0;color:#E2E8F0;">${escapeHtml(request.serviceTitle)} &mdash; <span style="color:#00C2C7;">Customized Enterprise Solution</span></li>`;

    const customerHtml = renderEmailShell(
      `Service Inquiry Received — ${request.referenceCode}`,
      'ENTERPRISE SERVICE INQUIRY CONFIRMATION',
      `
      <p style="margin:0 0 14px;font-size:15px;color:#FFFFFF;">Hello ${escapeHtml(request.fullName)},</p>
      <p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#CBD5E1;">
        Thank you for engaging <strong style="color:#FFFFFF;">${escapeHtml(corporateIdentity.legalName)}</strong>.
        Your enterprise service inquiry has been logged and assigned to our solutions architecture review desk.
      </p>
      <div style="background-color:#0B1220;border:1px solid #1E293B;border-radius:12px;padding:16px;margin-bottom:18px;">
        <div style="font-size:11px;font-family:monospace;color:#00C2C7;text-transform:uppercase;">Reference Code</div>
        <div style="font-size:20px;font-family:monospace;font-weight:800;color:#FFFFFF;margin-top:4px;">${escapeHtml(request.referenceCode)}</div>
        <div style="font-size:12px;color:#94A3B8;margin-top:8px;">Organization: <strong style="color:#E2E8F0;">${escapeHtml(request.company)}</strong></div>
        ${request.targetTimeline ? `<div style="font-size:12px;color:#94A3B8;margin-top:4px;">Target Timeline: <strong style="color:#E2E8F0;">${escapeHtml(request.targetTimeline)}</strong></div>` : ''}
        <div style="font-size:12px;color:#94A3B8;margin-top:4px;">Commercial Structure: <strong style="color:#00C2C7;">Subject to Formal Assessment</strong></div>
      </div>
      <div style="font-size:12px;font-weight:700;color:#FFFFFF;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.6px;">Selected Solution Frameworks</div>
      <ul style="margin:0 0 18px;padding-left:18px;font-size:13px;line-height:1.5;">${servicesListHtml}</ul>
      <div style="background-color:#0F172A;border-left:3px solid #D4AF37;padding:12px 14px;font-size:12px;color:#CBD5E1;line-height:1.55;">
        <strong style="color:#D4AF37;">Commercial Engagement Policy:</strong> ${escapeHtml(COMMERCIAL_ENGAGEMENT_STATEMENT)}
      </div>
      <p style="margin:18px 0 0;font-size:12px;color:#94A3B8;">
        For direct corporate assistance, call <a href="${escapeHtml(corporateIdentity.contact.telephone.href)}" style="color:#00C2C7;text-decoration:none;">${escapeHtml(corporateIdentity.contact.telephone.display)}</a> or reply to <a href="mailto:${escapeHtml(corporateIdentity.contact.email)}" style="color:#00C2C7;text-decoration:none;">${escapeHtml(corporateIdentity.contact.email)}</a>.
      </p>`
    );

    const customerText = [
      `${corporateIdentity.legalName} — Enterprise Service Inquiry Confirmation`,
      `Reference Code: ${request.referenceCode}`,
      `Client: ${request.fullName} (${request.company})`,
      `Selected Solutions: ${request.serviceTitle}`,
      `Commercial Structure: Subject to Formal Assessment`,
      '',
      COMMERCIAL_ENGAGEMENT_STATEMENT,
      '',
      `Official Telephone: ${corporateIdentity.contact.telephone.display}`,
      `Official Email: ${corporateIdentity.contact.email}`,
      `Headquarters: ${corporateIdentity.headquarters.fullAddress}`,
    ].join('\n');

    const adminHtml = renderEmailShell(
      `New Enterprise Service Inquiry: ${request.referenceCode}`,
      'EXECUTIVE REVIEW NOTIFICATION',
      `
      <p style="margin:0 0 14px;font-size:14px;color:#FFFFFF;">A new customized enterprise service inquiry has been recorded.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="6" style="font-size:13px;color:#CBD5E1;background-color:#0B1220;border:1px solid #1E293B;border-radius:10px;">
        <tr><td style="color:#94A3B8;">Reference:</td><td style="font-family:monospace;color:#00C2C7;font-weight:700;">${escapeHtml(request.referenceCode)}</td></tr>
        <tr><td style="color:#94A3B8;">Client:</td><td>${escapeHtml(request.fullName)}</td></tr>
        <tr><td style="color:#94A3B8;">Email:</td><td>${escapeHtml(request.email)}</td></tr>
        <tr><td style="color:#94A3B8;">Phone:</td><td>${escapeHtml(request.contactNumber)}</td></tr>
        <tr><td style="color:#94A3B8;">Company:</td><td>${escapeHtml(request.company)}</td></tr>
        <tr><td style="color:#94A3B8;">Solutions:</td><td>${escapeHtml(request.serviceTitle)}</td></tr>
        <tr><td style="color:#94A3B8;">Commercial Status:</td><td style="color:#00C2C7;font-weight:700;">Subject to Formal Assessment</td></tr>
      </table>
      <div style="margin-top:16px;padding:14px;background-color:#0F172A;border:1px solid #1E293B;border-radius:10px;font-size:13px;color:#E2E8F0;line-height:1.5;">
        <div style="font-size:11px;font-family:monospace;color:#94A3B8;margin-bottom:6px;">PROJECT REQUIREMENTS</div>
        ${escapeHtml(request.projectDescription)}
      </div>`
    );

    const adminText = `New Enterprise Service Inquiry ${request.referenceCode}\nClient: ${request.fullName} <${request.email}> | ${request.contactNumber}\nCompany: ${request.company}\nSolutions: ${request.serviceTitle}\nCommercial Status: Subject to Formal Assessment\nRequirements:\n${request.projectDescription}`;

    const customerStatus = await this.enqueueAndDispatch({
      dedupeKey: `sol:${request.referenceCode}:customer`,
      entityType: 'solution_request',
      entityReference: request.referenceCode,
      recipientEmail: request.email,
      notificationType: 'customer_confirmation',
      subject: `[${request.referenceCode}] ${corporateIdentity.legalName} — Enterprise Service Inquiry Received`,
      htmlBody: customerHtml,
      textBody: customerText,
      replyTo: this.adminInbox,
      correlationId,
    });

    const adminStatus = await this.enqueueAndDispatch({
      dedupeKey: `sol:${request.referenceCode}:admin`,
      entityType: 'solution_request',
      entityReference: request.referenceCode,
      recipientEmail: this.adminInbox,
      notificationType: 'admin_alert',
      subject: `[NEW ENTERPRISE INQUIRY] ${request.referenceCode} — ${request.company}`,
      htmlBody: adminHtml,
      textBody: adminText,
      replyTo: request.email,
      correlationId,
    });

    const overallStatus =
      customerStatus === 'sent' && adminStatus === 'sent'
        ? 'sent'
        : customerStatus === 'unconfigured' && adminStatus === 'unconfigured'
        ? 'unconfigured'
        : 'failed';

    await this.db.updateSolutionRequestEmailStatus(request.referenceCode, overallStatus);

    return { customerStatus, adminStatus, overallStatus };
  }

  public async sendSolutionRequestNotifications(
    request: SolutionRequestRecord,
    correlationId?: string
  ) {
    return this.enqueueAndSendSolutionRequestEmails(request, correlationId);
  }

  public async enqueueAndSendAppointmentEmails(
    appointment: AppointmentRecord,
    correlationId?: string,
    kind: 'created' | 'rescheduled' | 'cancelled' = 'created'
  ): Promise<{
    customerStatus: 'sent' | 'failed' | 'unconfigured';
    adminStatus: 'sent' | 'failed' | 'unconfigured';
  }> {
    const isConfirmed = appointment.status === 'confirmed';
    const statusLabel =
      kind === 'cancelled'
        ? 'Cancelled'
        : isConfirmed
        ? 'Confirmed Calendar Appointment'
        : 'Pending Scheduling Request';

    const customerHtml = renderEmailShell(
      `Consultation ${statusLabel} — ${appointment.referenceCode}`,
      `CONSULTATION ${statusLabel.toUpperCase()}`,
      `
      <p style="margin:0 0 14px;font-size:15px;color:#FFFFFF;">Hello ${escapeHtml(appointment.fullName)},</p>
      <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#CBD5E1;">
        ${
          kind === 'cancelled'
            ? 'Your consultation request has been marked as cancelled and the reserved time slot has been released.'
            : isConfirmed
            ? 'Your consultation has been confirmed and synchronized with our executive calendar.'
            : 'Your consultation scheduling request has been securely recorded. Our solutions coordinator will confirm your session and send final meeting details shortly.'
        }
      </p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="6" style="font-size:13px;color:#CBD5E1;background-color:#0B1220;border:1px solid #1E293B;border-radius:10px;">
        <tr><td style="color:#94A3B8;">Reference:</td><td style="font-family:monospace;color:#00C2C7;font-weight:700;">${escapeHtml(appointment.referenceCode)}</td></tr>
        <tr><td style="color:#94A3B8;">Status:</td><td style="font-weight:700;color:#FFFFFF;">${escapeHtml(statusLabel)}</td></tr>
        <tr><td style="color:#94A3B8;">Date:</td><td>${escapeHtml(appointment.scheduledDate)}</td></tr>
        <tr><td style="color:#94A3B8;">Time Slot:</td><td>${escapeHtml(appointment.scheduledTimeSlot)} (${escapeHtml(appointment.clientTimezone)})</td></tr>
        <tr><td style="color:#94A3B8;">Channel:</td><td>${escapeHtml(appointment.consultationType.toUpperCase())}</td></tr>
        ${appointment.meetingLink ? `<tr><td style="color:#94A3B8;">Meeting Link:</td><td><a href="${escapeHtml(appointment.meetingLink)}" style="color:#00C2C7;">${escapeHtml(appointment.meetingLink)}</a></td></tr>` : ''}
        ${appointment.meetingLocation ? `<tr><td style="color:#94A3B8;">Reference Location:</td><td>${escapeHtml(appointment.meetingLocation)}</td></tr>` : ''}
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#94A3B8;">
        Corporate Telephone: <a href="${escapeHtml(corporateIdentity.contact.telephone.href)}" style="color:#00C2C7;text-decoration:none;">${escapeHtml(corporateIdentity.contact.telephone.display)}</a> &middot; Email: <a href="mailto:${escapeHtml(corporateIdentity.contact.email)}" style="color:#00C2C7;text-decoration:none;">${escapeHtml(corporateIdentity.contact.email)}</a>
      </p>`
    );

    const customerText = `${corporateIdentity.legalName} Consultation (${statusLabel})\nReference: ${appointment.referenceCode}\nDate: ${appointment.scheduledDate} ${appointment.scheduledTimeSlot} (${appointment.clientTimezone})\nChannel: ${appointment.consultationType}${appointment.meetingLink ? `\nMeeting Link: ${appointment.meetingLink}` : ''}\nTelephone: ${corporateIdentity.contact.telephone.display}\nEmail: ${corporateIdentity.contact.email}\nHeadquarters: ${corporateIdentity.headquarters.fullAddress}`;

    const adminHtml = renderEmailShell(
      `Consultation ${kind.toUpperCase()}: ${appointment.referenceCode}`,
      'EXECUTIVE CONSULTATION ALERT',
      `
      <p style="margin:0 0 12px;font-size:14px;color:#FFFFFF;">Consultation ${escapeHtml(kind)}: <strong>${escapeHtml(appointment.referenceCode)}</strong> (${escapeHtml(statusLabel)})</p>
      <p style="font-size:13px;color:#CBD5E1;">
        Client: ${escapeHtml(appointment.fullName)} (${escapeHtml(appointment.companyName)})<br/>
        Email: ${escapeHtml(appointment.email)} | Phone: ${escapeHtml(appointment.phone)}<br/>
        Slot: ${escapeHtml(appointment.scheduledDate)} ${escapeHtml(appointment.scheduledTimeSlot)}<br/>
        Channel: ${escapeHtml(appointment.consultationType.toUpperCase())} | Calendar Sync: ${escapeHtml(appointment.calendarSyncStatus)}
      </p>`
    );

    const adminText = `Consultation ${kind}: ${appointment.referenceCode} (${statusLabel})\nClient: ${appointment.fullName} <${appointment.email}> | ${appointment.phone}\nDate/Slot: ${appointment.scheduledDate} ${appointment.scheduledTimeSlot}`;

    const dedupeSuffix = kind === 'created' ? 'created' : `${kind}:${Date.now()}`;
    const notifType = kind === 'created' ? 'appointment_request' : 'appointment_update';

    const customerStatus = await this.enqueueAndDispatch({
      dedupeKey: `apt:${appointment.referenceCode}:customer:${dedupeSuffix}`,
      entityType: 'appointment',
      entityReference: appointment.referenceCode,
      recipientEmail: appointment.email,
      notificationType: notifType,
      subject: `[${appointment.referenceCode}] ${corporateIdentity.legalName} — Consultation ${statusLabel}`,
      htmlBody: customerHtml,
      textBody: customerText,
      replyTo: this.adminInbox,
      correlationId,
    });

    const adminStatus = await this.enqueueAndDispatch({
      dedupeKey: `apt:${appointment.referenceCode}:admin:${dedupeSuffix}`,
      entityType: 'appointment',
      entityReference: appointment.referenceCode,
      recipientEmail: this.adminInbox,
      notificationType: 'admin_alert',
      subject: `[CONSULTATION ${kind.toUpperCase()}] ${appointment.referenceCode} — ${appointment.scheduledDate} ${appointment.scheduledTimeSlot}`,
      htmlBody: adminHtml,
      textBody: adminText,
      replyTo: appointment.email,
      correlationId,
    });

    return { customerStatus, adminStatus };
  }

  public async processRetryQueue(limit = 20): Promise<number> {
    if (!this.db.isConfigured || !this.transport.isConfigured) return 0;
    const retryable = await this.db.listRetryableOutbox(limit);
    let processed = 0;

    for (const item of retryable) {
      const result = await this.transport.send({
        to: item.recipientEmail,
        subject: item.subject,
        html: item.htmlBody,
        text: item.textBody,
      });

      const attempts = item.deliveryAttempts + 1;
      if (result.status === 'sent') {
        await this.db.updateOutboxStatus(item.id, {
          status: 'sent',
          providerReference: result.providerReference,
          deliveryAttempts: attempts,
          sentAt: new Date().toISOString(),
          nextRetryAt: null,
        });
        logStructured('info', 'email_dispatched', {
          entityType: item.entityType,
          entityReference: item.entityReference,
          notificationType: item.notificationType,
          recipientEmail: item.recipientEmail,
          providerReference: result.providerReference,
        });
      } else if (result.status === 'failed') {
        const nextRetryAt =
          attempts >= 5
            ? null
            : new Date(Date.now() + Math.min(60, Math.pow(2, attempts)) * 60 * 1000).toISOString();
        await this.db.updateOutboxStatus(item.id, {
          status: 'failed',
          deliveryAttempts: attempts,
          lastError: result.error,
          nextRetryAt,
        });
      }
      processed += 1;
    }

    return processed;
  }

  public async sendAppointmentNotifications(
    appointment: AppointmentRecord,
    kind: 'created' | 'rescheduled' | 'cancelled',
    correlationId?: string
  ) {
    return this.enqueueAndSendAppointmentEmails(appointment, correlationId, kind);
  }
}

export const NotificationEmailService = TransactionalEmailService;
