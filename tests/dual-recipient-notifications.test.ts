import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import { createApp, AppDependencies } from '../src/server/app';
import {
  DEFAULT_AUTHORIZED_DUAL_RECIPIENTS,
  parseRecipients,
  resolveDualNotificationConfig,
  sanitizeEmailHeader,
} from '../src/server/config/notificationRecipients';
import {
  AdminUserRecord,
  AppointmentRecord,
  AuditLogRecord,
  ConflictError,
  CreateAppointmentInput,
  CreateSolutionRequestInput,
  DatabaseRepository,
  DatabaseUnavailableError,
  EmailOutboxRecord,
  NotFoundError,
  SolutionRequestRecord,
} from '../src/server/db/types';
import {
  EmailMessage,
  EmailSendResult,
  EmailTransport,
  ResendEmailTransport,
} from '../src/server/services/emailService';
import { GoogleCalendarService } from '../src/server/services/calendarService';
import { computeEquivalentUtcSlot } from '../src/server/utils/timezoneUtc';

const RECIPIENT_1 = 'artaxsvcs@gmail.com';
const RECIPIENT_2 = 'dhenze.languisan@gmail.com';

interface DualTestStore {
  solutionRequests: SolutionRequestRecord[];
  appointments: AppointmentRecord[];
  outbox: EmailOutboxRecord[];
  auditLogs: AuditLogRecord[];
  failAvailabilityReads: boolean;
}

function createStore(): DualTestStore {
  return {
    solutionRequests: [],
    appointments: [],
    outbox: [],
    auditLogs: [],
    failAvailabilityReads: false,
  };
}

class DualTestDb implements DatabaseRepository {
  public readonly isConfigured = true;
  constructor(private readonly store: DualTestStore) {}

  async ping() {
    return { ok: true, configured: true, latencyMs: 1 };
  }

  async findSolutionRequestByIdempotencyKey(key: string): Promise<SolutionRequestRecord | null> {
    return this.store.solutionRequests.find((r) => r.idempotencyKey === key) || null;
  }

  async createSolutionRequest(input: CreateSolutionRequestInput): Promise<{
    record: SolutionRequestRecord;
    created: boolean;
  }> {
    if (input.idempotencyKey) {
      const existing = await this.findSolutionRequestByIdempotencyKey(input.idempotencyKey);
      if (existing) return { record: existing, created: false };
    }
    const now = new Date().toISOString();
    const record: SolutionRequestRecord = {
      id: crypto.randomUUID(),
      referenceCode: input.referenceCode,
      idempotencyKey: input.idempotencyKey,
      type: input.type,
      fullName: input.fullName,
      email: input.email,
      contactNumber: input.contactNumber,
      company: input.company,
      industry: input.industry,
      targetTimeline: input.targetTimeline,
      selectedServices: input.selectedServices,
      selectedServiceIds: input.selectedServiceIds,
      selectedOptionsMap: input.selectedOptionsMap,
      serviceId: input.serviceId,
      serviceTitle: input.serviceTitle,
      estimatedOneTimeStartingUsd: input.estimatedOneTimeStartingUsd,
      estimatedMonthlyStartingUsd: input.estimatedMonthlyStartingUsd,
      estimatedBudget: input.estimatedBudget,
      engagementScope: input.engagementScope,
      submissionTimezone: input.submissionTimezone,
      preferredCurrency: input.preferredCurrency,
      phpConversionRate: input.phpConversionRate,
      projectDescription: input.projectDescription,
      fileName: input.fileName,
      privacyConsent: input.privacyConsent,
      commercialPolicyConsent: input.commercialPolicyConsent,
      status: 'submitted',
      emailDeliveryStatus: 'pending',
      sourceChannel: input.sourceChannel || 'Public Website',
      createdAt: now,
      updatedAt: now,
    };
    this.store.solutionRequests.unshift(record);
    return { record, created: true };
  }

  async updateSolutionRequestEmailStatus(
    referenceCode: string,
    emailDeliveryStatus: 'pending' | 'sent' | 'failed' | 'unconfigured'
  ): Promise<void> {
    const target = this.store.solutionRequests.find((r) => r.referenceCode === referenceCode);
    if (target) {
      target.emailDeliveryStatus = emailDeliveryStatus;
      target.updatedAt = new Date().toISOString();
    }
  }

  async listSolutionRequests(options: { limit: number; offset: number; status?: string }) {
    const filtered = options.status
      ? this.store.solutionRequests.filter((r) => r.status === options.status)
      : this.store.solutionRequests;
    return {
      records: filtered.slice(options.offset, options.offset + options.limit),
      total: filtered.length,
    };
  }

  async getBookedSlotsForDate(scheduledDate: string): Promise<string[]> {
    if (this.store.failAvailabilityReads) {
      throw new DatabaseUnavailableError('Simulated transient availability query outage');
    }
    return this.store.appointments
      .filter(
        (a) =>
          a.scheduledDate === scheduledDate &&
          (a.status === 'pending_review' || a.status === 'confirmed')
      )
      .map((a) => a.scheduledTimeSlot);
  }

  async createAppointment(input: CreateAppointmentInput): Promise<{
    record: AppointmentRecord;
    created: boolean;
  }> {
    if (input.idempotencyKey) {
      const existing = this.store.appointments.find((a) => a.idempotencyKey === input.idempotencyKey);
      if (existing) return { record: existing, created: false };
    }
    const conflict = this.store.appointments.find(
      (a) =>
        a.scheduledDate === input.scheduledDate &&
        a.scheduledTimeSlot === input.scheduledTimeSlot &&
        (a.status === 'pending_review' || a.status === 'confirmed')
    );
    if (conflict) {
      throw new ConflictError(`Slot ${input.scheduledTimeSlot} on ${input.scheduledDate} already reserved.`);
    }

    const now = new Date().toISOString();
    const record: AppointmentRecord = {
      id: crypto.randomUUID(),
      referenceCode: input.referenceCode,
      idempotencyKey: input.idempotencyKey,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      companyName: input.companyName,
      briefReferenceCode: input.briefReferenceCode,
      executivePathway: input.executivePathway,
      consultationType: input.consultationType,
      consultationPurpose: input.consultationPurpose,
      selectedSolution: input.selectedSolution,
      scheduledDate: input.scheduledDate,
      scheduledTimeSlot: input.scheduledTimeSlot,
      utcScheduledAt: input.utcScheduledAt,
      durationMinutes: input.durationMinutes,
      clientTimezone: input.clientTimezone,
      meetingLink: input.meetingLink,
      meetingLocation: input.meetingLocation,
      assignedConsultant: input.assignedConsultant,
      status: input.status,
      calendarSyncStatus: input.calendarSyncStatus,
      calendarEventId: input.calendarEventId,
      managementTokenHash: input.managementTokenHash,
      sourceChannel: input.sourceChannel || 'Public Website',
      availabilityVerified: input.availabilityVerified,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    };
    this.store.appointments.unshift(record);
    return { record, created: true };
  }

  async getAppointmentByReference(referenceCode: string): Promise<AppointmentRecord | null> {
    return this.store.appointments.find((a) => a.referenceCode === referenceCode) || null;
  }

  async updateAppointment(
    referenceCode: string,
    patch: Partial<AppointmentRecord>
  ): Promise<AppointmentRecord> {
    const idx = this.store.appointments.findIndex((a) => a.referenceCode === referenceCode);
    if (idx === -1) throw new NotFoundError('Appointment not found');
    const updated = { ...this.store.appointments[idx], ...patch, updatedAt: new Date().toISOString() };
    this.store.appointments[idx] = updated;
    return updated;
  }

  async listAppointments(options: { limit: number; offset: number }) {
    return {
      records: this.store.appointments.slice(options.offset, options.offset + options.limit),
      total: this.store.appointments.length,
    };
  }

  async createOutboxRecord(input: {
    dedupeKey: string;
    entityType: 'solution_request' | 'appointment';
    entityReference: string;
    recipientEmail: string;
    replyTo?: string;
    idempotencyKey?: string;
    requestSource?: string;
    notificationType: EmailOutboxRecord['notificationType'];
    subject: string;
    htmlBody: string;
    textBody: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ record: EmailOutboxRecord; created: boolean }> {
    const existing = this.store.outbox.find((o) => o.dedupeKey === input.dedupeKey);
    if (existing) return { record: existing, created: false };
    const now = new Date().toISOString();
    const record: EmailOutboxRecord = {
      id: crypto.randomUUID(),
      dedupeKey: input.dedupeKey,
      entityType: input.entityType,
      entityReference: input.entityReference,
      recipientEmail: input.recipientEmail,
      replyTo: input.replyTo,
      idempotencyKey: input.idempotencyKey,
      requestSource: input.requestSource,
      notificationType: input.notificationType,
      subject: input.subject,
      htmlBody: input.htmlBody,
      textBody: input.textBody,
      status: 'queued',
      provider: 'resend',
      deliveryAttempts: 0,
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now,
    };
    this.store.outbox.push(record);
    return { record, created: true };
  }

  async updateOutboxStatus(
    id: string,
    patch: {
      status: EmailOutboxRecord['status'];
      providerReference?: string;
      deliveryAttempts: number;
      lastError?: string;
      nextRetryAt?: string | null;
      lastAttemptAt?: string | null;
      providerAcceptedAt?: string | null;
      deliveredAt?: string | null;
      sentAt?: string | null;
    }
  ): Promise<void> {
    const item = this.store.outbox.find((o) => o.id === id);
    if (item) {
      item.status = patch.status;
      if (patch.providerReference !== undefined) item.providerReference = patch.providerReference;
      item.deliveryAttempts = patch.deliveryAttempts;
      item.lastError = patch.lastError;
      item.nextRetryAt = patch.nextRetryAt || undefined;
      if (patch.lastAttemptAt !== undefined) item.lastAttemptAt = patch.lastAttemptAt || undefined;
      if (patch.providerAcceptedAt !== undefined) {
        item.providerAcceptedAt = patch.providerAcceptedAt || undefined;
      }
      if (patch.deliveredAt !== undefined) item.deliveredAt = patch.deliveredAt || undefined;
      if (patch.sentAt !== undefined) item.sentAt = patch.sentAt || undefined;
      item.updatedAt = new Date().toISOString();
    }
  }

  async listRetryableOutbox(limit = 20): Promise<EmailOutboxRecord[]> {
    return this.store.outbox
      .filter((o) => (o.status === 'queued' || o.status === 'failed') && o.deliveryAttempts < 5)
      .slice(0, limit);
  }

  async findOutboxByProviderReference(providerReference: string): Promise<EmailOutboxRecord | null> {
    return this.store.outbox.find((o) => o.providerReference === providerReference) || null;
  }

  async writeAuditLog(input: Omit<AuditLogRecord, 'id' | 'createdAt'>): Promise<void> {
    this.store.auditLogs.unshift({
      id: crypto.randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
    });
  }

  async listAuditLogs(options: { limit: number; offset: number }) {
    return {
      records: this.store.auditLogs.slice(options.offset, options.offset + options.limit),
      total: this.store.auditLogs.length,
    };
  }

  async findActiveAdminByEmail(): Promise<AdminUserRecord | null> {
    return null;
  }

  async verifySupabaseUserToken(): Promise<{ id: string; email: string } | null> {
    return null;
  }
}

class SpyEmailTransport implements EmailTransport {
  public isConfigured = true;
  public failRecipients = new Set<string>();
  public sentMessages: Array<EmailMessage & { providerReference: string }> = [];
  private counter = 0;

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.isConfigured) {
      return { status: 'unconfigured', error: 'RESEND_API_KEY not configured' };
    }
    if (this.failRecipients.has(message.to.toLowerCase())) {
      return { status: 'failed', error: `Simulated provider failure for ${message.to}` };
    }
    this.counter += 1;
    const providerReference = `re_dual_${this.counter}`;
    this.sentMessages.push({ ...message, providerReference });
    return {
      status: 'sent',
      providerReference,
      providerAcceptedAt: new Date().toISOString(),
    };
  }
}

async function startTestServer(deps: AppDependencies) {
  const created = createApp(deps);
  const server = http.createServer(created.app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    ...created,
    close: () =>
      new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function getNextBusinessDayIso(daysAhead = 3): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().split('T')[0];
}

// ============================================================================
// 1. CENTRALIZED RECIPIENT PARSER & SECURITY VALIDATION
// ============================================================================
test('Dual-recipient config validates both authorized emails and rejects duplicates/malformed/CR-LF', () => {
  assert.deepEqual([...DEFAULT_AUTHORIZED_DUAL_RECIPIENTS], [RECIPIENT_1, RECIPIENT_2]);

  const valid = parseRecipients(`${RECIPIENT_1}, ${RECIPIENT_2}`, { requireMinimum: 2 });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.recipients, [RECIPIENT_1, RECIPIENT_2]);

  const duplicate = parseRecipients(`${RECIPIENT_1}, ${RECIPIENT_1}`, { requireMinimum: 2 });
  assert.equal(duplicate.valid, false);
  assert.equal(duplicate.recipients.length, 1);

  const injected = parseRecipients(`${RECIPIENT_1}\r\nBcc: attacker@evil.com, ${RECIPIENT_2}`, {
    requireMinimum: 2,
  });
  assert.equal(injected.valid, false);
  assert.equal(injected.recipients.length, 1);

  const sanitized = sanitizeEmailHeader('Subject Line\r\nBcc: evil@attacker.com');
  assert.equal(sanitized.includes('\r'), false);
  assert.equal(sanitized.includes('\n'), false);

  const cfg = resolveDualNotificationConfig();
  assert.equal(cfg.serviceInquiry.enabled, true);
  assert.equal(cfg.executiveConsultation.enabled, true);
  assert.deepEqual(cfg.serviceInquiry.recipients, [RECIPIENT_1, RECIPIENT_2]);
  assert.deepEqual(cfg.executiveConsultation.recipients, [RECIPIENT_1, RECIPIENT_2]);
});

// ============================================================================
// 2. PUBLIC SERVICE INQUIRY -> DUAL RECIPIENTS + EXACT TEMPLATE + NO LEAKAGE
// ============================================================================
test('Initiate Service Inquiry sends exact formatted email + Reply-To to BOTH authorized recipients without exposing internal emails', async () => {
  const store = createStore();
  const transport = new SpyEmailTransport();
  const srv = await startTestServer({
    db: new DualTestDb(store),
    emailTransport: transport,
  });

  try {
    const res = await fetch(`${srv.baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'inq-dual-test-001',
      },
      body: JSON.stringify({
        type: 'contact_form',
        fullName: 'Evelyn Carter',
        email: 'evelyn.carter@northstar.example',
        contactNumber: '+1 (307) 555-0148',
        company: 'Northstar Logistics Group',
        serviceId: 'ai-solutions',
        serviceTitle: 'AI Solutions & Enterprise Automation',
        engagementScope: 'Enterprise Architecture Modernization',
        submissionTimezone: 'America/New_York',
        projectDescription:
          'We require a unified enterprise workflow platform integrating ERP, predictive scheduling, and role-based executive reporting.',
        fileName: 'Architecture-Brief-2026.pdf',
        privacyConsent: true,
        commercialPolicyConsent: true,
        sourceChannel: 'Public Website',
        // Attempted client-side recipient override must be completely ignored
        recipients: ['hacker@evil.example'],
      }),
    });

    assert.equal(res.status, 201);
    const bodyText = await res.text();
    const json = JSON.parse(bodyText);

    // Public API response must NEVER leak internal notification addresses
    assert.equal(bodyText.toLowerCase().includes(RECIPIENT_1), false);
    assert.equal(bodyText.toLowerCase().includes(RECIPIENT_2), false);

    assert.equal(json.success, true);
    assert.match(json.referenceId, /^OPM-INQ-\d{4}-/);
    assert.equal(
      json.confirmationMessage,
      'Your service inquiry has been successfully registered with DESTRIA TECH INC. Our authorized team will review your submitted requirements and coordinate further communication.'
    );
    assert.equal(json.emailDelivery.notifiedRecipientsCount, 2);
    assert.equal(json.emailDelivery.providerAcceptedRecipientsCount, 2);
    assert.equal(json.emailDelivery.confirmedDeliveredRecipientsCount, 0);
    assert.equal(json.emailDelivery.deliveredRecipientsCount, 0);
    assert.equal(json.emailDelivery.overallStatus, 'provider_accepted');

    // Verify both authorized recipients received independent messages with exact subject, sections, signature, and client Reply-To
    const internalEmails = transport.sentMessages.filter(
      (m) => m.to === RECIPIENT_1 || m.to === RECIPIENT_2
    );
    assert.equal(internalEmails.length, 2);
    assert.deepEqual(
      internalEmails.map((m) => m.to).sort(),
      [RECIPIENT_1, RECIPIENT_2].sort()
    );

    const expectedSubject = `NEW ENTERPRISE SERVICE INQUIRY | DESTRIA TECH INC | ${json.referenceId}`;
    for (const msg of internalEmails) {
      assert.equal(msg.subject, expectedSubject);
      assert.equal(msg.replyTo, 'evelyn.carter@northstar.example');
      assert.ok(msg.text.includes('INQUIRY METADATA'));
      assert.ok(msg.text.includes('CLIENT INFORMATION'));
      assert.ok(msg.text.includes('ENGAGEMENT DETAILS'));
      assert.ok(msg.text.includes('PROJECT REQUIREMENTS'));
      assert.ok(msg.text.includes('SUPPORTING DOCUMENTATION'));
      assert.ok(msg.text.includes('Evelyn Carter'));
      assert.ok(msg.text.includes('Northstar Logistics Group'));
      assert.ok(msg.text.includes('Enterprise Architecture Modernization'));
      assert.ok(msg.text.includes('America/New_York'));
      assert.ok(msg.text.includes('Architecture-Brief-2026.pdf'));
      assert.ok(msg.text.includes('Filename reference recorded only'));
      assert.ok(msg.text.includes('SUITE 6082 - 30 N Gould St #6082, Sheridan, Sheridan County, WY 82801 USA'));
      assert.ok(msg.text.includes('+1 (307) 419-4277'));
      assert.ok(msg.text.includes('info@destriatech.com'));
      assert.ok(msg.text.includes('https://destriatech.com/'));
      assert.ok(msg.text.includes('CONFIDENTIALITY NOTICE'));
    }

    // Duplicate Idempotency-Key submission must NOT send duplicate emails
    const dupRes = await fetch(`${srv.baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'inq-dual-test-001',
      },
      body: JSON.stringify({
        type: 'contact_form',
        fullName: 'Evelyn Carter',
        email: 'evelyn.carter@northstar.example',
        contactNumber: '+1 (307) 555-0148',
        company: 'Northstar Logistics Group',
        serviceId: 'ai-solutions',
        projectDescription:
          'We require a unified enterprise workflow platform integrating ERP, predictive scheduling, and role-based executive reporting.',
        privacyConsent: true,
      }),
    });
    assert.equal(dupRes.status, 200);
    const dupJson = await dupRes.json();
    assert.equal(dupJson.deduplicated, true);
    assert.equal(transport.sentMessages.length, 3); // 1 customer + 2 dual recipients only
  } finally {
    await srv.close();
  }
});

// ============================================================================
// 3. EXECUTIVE CONSULTATION CHANNELS (VIDEO, PHONE, EXECUTIVE BRIEFING) + UTC + AI VOICE/CHAT
// ============================================================================
test('Executive Consultation (Video Call, Phone Call, Executive Briefing) and AI Chat/Voice deliver to BOTH recipients with accurate UTC conversion', async () => {
  const store = createStore();
  const transport = new SpyEmailTransport();
  const srv = await startTestServer({
    db: new DualTestDb(store),
    emailTransport: transport,
    calendarService: new GoogleCalendarService('', ''),
  });

  // Verify DST-aware UTC conversion directly
  const manilaUtc = computeEquivalentUtcSlot('2026-07-15', '10:00 AM - 10:30 AM', 'Asia/Manila');
  assert.equal(manilaUtc?.formattedUtc, '2026-07-15 02:00 - 02:30 UTC');

  const denverSummerUtc = computeEquivalentUtcSlot('2026-07-15', '10:00 AM - 10:30 AM', 'America/Denver');
  assert.equal(denverSummerUtc?.formattedUtc, '2026-07-15 16:00 - 16:30 UTC');

  const denverWinterUtc = computeEquivalentUtcSlot('2026-01-15', '10:00 AM - 10:30 AM', 'America/Denver');
  assert.equal(denverWinterUtc?.formattedUtc, '2026-01-15 17:00 - 17:30 UTC');

  const date1 = getNextBusinessDayIso(4);

  const scenarios: Array<{
    consultationType: 'video' | 'phone' | 'in_person';
    expectedChannelLabel: string;
    executivePathway: 'ceo' | 'cto' | 'advisory';
    slot: string;
    timezone: string;
    sourceChannel: 'Public Website' | 'AI Chat' | 'AI Voice';
  }> = [
    {
      consultationType: 'video',
      expectedChannelLabel: 'Video Call',
      executivePathway: 'ceo',
      slot: '09:00 AM - 09:30 AM',
      timezone: 'America/Denver',
      sourceChannel: 'Public Website',
    },
    {
      consultationType: 'phone',
      expectedChannelLabel: 'Phone Call',
      executivePathway: 'cto',
      slot: '10:00 AM - 10:30 AM',
      timezone: 'Asia/Manila',
      sourceChannel: 'AI Voice',
    },
    {
      consultationType: 'in_person',
      expectedChannelLabel: 'Executive Briefing',
      executivePathway: 'advisory',
      slot: '11:00 AM - 11:30 AM',
      timezone: 'UTC',
      sourceChannel: 'AI Chat',
    },
  ];

  try {
    for (const sc of scenarios) {
      const beforeCount = transport.sentMessages.length;
      const res = await fetch(`${srv.baseUrl}/api/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: `Client ${sc.consultationType}`,
          email: `exec.${sc.consultationType}@enterprise.example`,
          phone: '+1 (307) 555-0192',
          companyName: 'Meridian Holdings',
          executivePathway: sc.executivePathway,
          consultationType: sc.consultationType,
          consultationPurpose: 'Enterprise Architecture Assessment',
          selectedSolution: 'Autonomous AI Workflow Platform',
          scheduledDate: date1,
          scheduledTimeSlot: sc.slot,
          clientTimezone: sc.timezone,
          sourceChannel: sc.sourceChannel,
          notes: 'Concise structured project summary without raw private transcript.',
        }),
      });

      assert.equal(res.status, 201);
      const rawBody = await res.text();
      assert.equal(rawBody.toLowerCase().includes(RECIPIENT_1), false);
      assert.equal(rawBody.toLowerCase().includes(RECIPIENT_2), false);

      const json = JSON.parse(rawBody);
      assert.equal(json.appointment.status, 'pending_review');
      assert.equal(json.appointment.meetingLink, undefined);
      assert.equal(
        json.confirmationMessage,
        'Your consultation request has been successfully registered. The requested schedule remains subject to availability and formal confirmation by our authorized team.'
      );
      assert.equal(json.emailDelivery.providerAcceptedRecipientsCount, 2);
      assert.equal(json.emailDelivery.confirmedDeliveredRecipientsCount, 0);

      const newMessages = transport.sentMessages.slice(beforeCount);
      const dualMessages = newMessages.filter(
        (m) => m.to === RECIPIENT_1 || m.to === RECIPIENT_2
      );
      assert.equal(dualMessages.length, 2);

      const expectedSubject = `NEW EXECUTIVE CONSULTATION REQUEST | DESTRIA TECH INC | ${json.appointment.referenceCode}`;
      for (const msg of dualMessages) {
        assert.equal(msg.subject, expectedSubject);
        assert.equal(msg.replyTo, `exec.${sc.consultationType}@enterprise.example`);
        assert.ok(msg.text.includes('CONSULTATION METADATA'));
        assert.ok(msg.text.includes('CLIENT INFORMATION'));
        assert.ok(msg.text.includes('CONSULTATION SCHEDULE'));
        assert.ok(msg.text.includes('PROJECT REQUIREMENTS'));
        assert.ok(msg.text.includes(`Request Source: ${sc.sourceChannel}`));
        assert.ok(msg.text.includes('Appointment Status: Pending Scheduling Confirmation'));
        assert.ok(msg.text.includes(`Consultation Channel: ${sc.expectedChannelLabel}`));
        assert.ok(msg.text.includes('Equivalent UTC Date and Time:'));
        assert.ok(msg.text.includes('UTC'));
        assert.ok(msg.text.includes('https://destriatech.com/'));
      }
    }

    // Also test AI Chat service inquiry submission
    const aiInquiryRes = await fetch(`${srv.baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'contact_inquiry',
        fullName: 'Daniel Park',
        email: 'daniel.park@horizon.example',
        contactNumber: '+63 917 555 8811',
        company: 'Horizon BioTech',
        serviceId: 'enterprise-custom-assessment',
        serviceTitle: 'AI Solutions & AI Agents',
        projectDescription: 'AI Consultant Brief Reference: DTI-BRF-2026-4412. Automated clinical triage workflow.',
        privacyConsent: true,
        sourceChannel: 'AI Chat',
      }),
    });
    assert.equal(aiInquiryRes.status, 201);
    const aiInqJson = await aiInquiryRes.json();
    const aiInqEmails = transport.sentMessages.filter(
      (m) => m.subject.includes(aiInqJson.referenceId) && (m.to === RECIPIENT_1 || m.to === RECIPIENT_2)
    );
    assert.equal(aiInqEmails.length, 2);
    assert.ok(aiInqEmails.every((m) => m.text.includes('Request Source: AI Chat')));
  } finally {
    await srv.close();
  }
});

// ============================================================================
// 4. PARTIAL FAILURE ISOLATION & INDEPENDENT RETRY QUEUE
// ============================================================================
test('Partial failure isolation: Recipient 1 failure never blocks Recipient 2, and retry queue recovers Recipient 1 with Reply-To preserved', async () => {
  const store = createStore();
  const transport = new SpyEmailTransport();
  transport.failRecipients.add(RECIPIENT_1);

  const srv = await startTestServer({
    db: new DualTestDb(store),
    emailTransport: transport,
  });

  try {
    const res = await fetch(`${srv.baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'contact_form',
        fullName: 'Hanna Brooks',
        email: 'hanna.brooks@foundry.example',
        contactNumber: '+1 307 555 0177',
        company: 'Foundry Energy Systems',
        serviceId: 'enterprise-custom-assessment',
        projectDescription: 'Multi-region industrial telemetry platform with SOC-ready audit logging.',
        privacyConsent: true,
      }),
    });

    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.emailDelivery.notifiedRecipientsCount, 2);
    assert.equal(json.emailDelivery.providerAcceptedRecipientsCount, 1);
    assert.equal(json.emailDelivery.confirmedDeliveredRecipientsCount, 0);
    assert.equal(json.emailDelivery.failedRecipientsCount, 1);
    assert.equal(json.emailDelivery.partialFailure, true);
    assert.equal(json.emailDelivery.adminStatus, 'failed');

    const r1Outbox = store.outbox.find((o) => o.recipientEmail === RECIPIENT_1);
    const r2Outbox = store.outbox.find((o) => o.recipientEmail === RECIPIENT_2);
    assert.equal(r1Outbox?.status, 'failed');
    assert.equal(r1Outbox?.replyTo, 'hanna.brooks@foundry.example');
    assert.equal(r2Outbox?.status, 'provider_accepted');
    assert.ok(r2Outbox?.providerAcceptedAt);

    // Recover Recipient 1 & run independent retry queue (even after simulated server restart)
    transport.failRecipients.clear();
    const srvRestarted = await startTestServer({
      db: new DualTestDb(store),
      emailTransport: transport,
    });
    try {
      const retried = await srvRestarted.emailService.processRetryQueue(10);
      assert.equal(retried, 1);
      assert.equal(r1Outbox?.status, 'provider_accepted');
      const recoveredMsg = transport.sentMessages.find((m) => m.to === RECIPIENT_1);
      assert.ok(recoveredMsg);
      assert.equal(recoveredMsg?.replyTo, 'hanna.brooks@foundry.example');
    } finally {
      await srvRestarted.close();
    }
  } finally {
    await srv.close();
  }
});

// ============================================================================
// 5. AVAILABILITY RELIABILITY REPAIR, TIMEOUT HANDLING, INPUT SECURITY & WEBHOOKS
// ============================================================================
test('Availability outage returns honest unverified status without fabricating slots; header injection & unsafe filenames rejected; Resend timeout & webhook HMAC verified', async () => {
  const store = createStore();
  const transport = new SpyEmailTransport();
  const webhookSecret = 'whsec_' + Buffer.from('destria-webhook-test-secret-key').toString('base64');

  const srv = await startTestServer({
    db: new DualTestDb(store),
    emailTransport: transport,
    dualNotificationOverrides: { webhookSecret },
  });

  try {
    // 5a. Transient availability outage returns honest availabilityVerified: false (never crashes with dead-end)
    store.failAvailabilityReads = true;
    const targetDate = getNextBusinessDayIso(6);
    const unverifiedRes = await fetch(
      `${srv.baseUrl}/api/appointments/availability?date=${targetDate}&timezone=Asia/Manila`
    );
    assert.equal(unverifiedRes.status, 200);
    const unverifiedJson = await unverifiedRes.json();
    assert.equal(unverifiedJson.availabilityVerified, false);
    assert.equal(unverifiedJson.availabilityStatus, 'unverified');
    assert.ok(unverifiedJson.warning);
    store.failAvailabilityReads = false;

    // 5b. Email header injection rejected with 400
    const injectRes = await fetch(`${srv.baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'contact_form',
        fullName: 'Bad Actor',
        email: 'victim@corp.example\r\nBcc: evil@attacker.example',
        contactNumber: '+1 307 555 0111',
        company: 'Test Corp',
        projectDescription: 'Attempting email header injection via CRLF characters.',
        privacyConsent: true,
      }),
    });
    assert.equal(injectRes.status, 400);

    // 5c. Executable supporting document filename rejected with 400
    const badFileRes = await fetch(`${srv.baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'contact_form',
        fullName: 'Safe Client',
        email: 'client@corp.example',
        contactNumber: '+1 307 555 0112',
        company: 'Test Corp',
        projectDescription: 'Attempting to attach disallowed executable filename reference.',
        fileName: 'payload.exe',
        privacyConsent: true,
      }),
    });
    assert.equal(badFileRes.status, 400);

    // 5d. ResendEmailTransport AbortController timeout test against delayed mock HTTP server
    const slowServer = http.createServer((_req, _res) => {
      // Intentionally never responds to trigger AbortController timeout
    });
    await new Promise<void>((resolve) => slowServer.listen(0, '127.0.0.1', resolve));
    const slowPort = (slowServer.address() as AddressInfo).port;
    try {
      const slowTransport = new ResendEmailTransport('re_test_key', undefined, {
        timeoutMs: 120,
        endpointUrl: `http://127.0.0.1:${slowPort}/emails`,
      });
      const timeoutResult = await slowTransport.send({
        to: RECIPIENT_1,
        subject: 'Timeout Test',
        html: '<p>Test</p>',
        text: 'Test',
      });
      assert.equal(timeoutResult.status, 'failed');
      assert.match(timeoutResult.error || '', /timed out/i);
    } finally {
      await new Promise<void>((resolve) => slowServer.close(() => resolve()));
    }

    // 5e. Verified Resend / Svix delivery webhook updates outbox status -> delivered + deliveredAt
    const inqRes = await fetch(`${srv.baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'contact_form',
        fullName: 'Webhook Verification Client',
        email: 'webhook.client@corp.example',
        contactNumber: '+1 307 555 0188',
        company: 'Atlas Corp',
        projectDescription: 'Verifying HMAC-signed Resend delivery webhook tracking on outbox.',
        privacyConsent: true,
      }),
    });
    assert.equal(inqRes.status, 201);

    const outboxTarget = store.outbox.find((o) => o.recipientEmail === RECIPIENT_2);
    assert.ok(outboxTarget?.providerReference);

    const webhookPayload = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-11-25T10:15:00.000Z',
      data: { email_id: outboxTarget.providerReference },
    });

    // Reject forged signature with 401
    const forgedRes = await fetch(`${srv.baseUrl}/api/webhooks/email/resend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'msg_forged_1',
        'svix-timestamp': String(Math.floor(Date.now() / 1000)),
        'svix-signature': 'v1,invalidSignatureBase64==',
      },
      body: webhookPayload,
    });
    assert.equal(forgedRes.status, 401);

    // Accept valid Svix HMAC-SHA256 signature with 200
    const svixId = 'msg_valid_1';
    const svixTs = String(Math.floor(Date.now() / 1000));
    const keyBytes = Buffer.from(webhookSecret.slice('whsec_'.length), 'base64');
    const sig = crypto
      .createHmac('sha256', keyBytes)
      .update(`${svixId}.${svixTs}.${webhookPayload}`)
      .digest('base64');

    const validWebhookRes = await fetch(`${srv.baseUrl}/api/webhooks/email/resend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': svixId,
        'svix-timestamp': svixTs,
        'svix-signature': `v1,${sig}`,
      },
      body: webhookPayload,
    });
    assert.equal(validWebhookRes.status, 200);
    const whJson = await validWebhookRes.json();
    assert.equal(whJson.matched, true);
    assert.equal(whJson.status, 'delivered');
    assert.equal(outboxTarget.status, 'delivered');
    assert.equal(outboxTarget.deliveredAt, '2026-11-25T10:15:00.000Z');
  } finally {
    await srv.close();
  }
});

// ============================================================================
// 6. FRONTEND SOURCE STATIC SCAN — ZERO INTERNAL NOTIFICATION EMAIL EXPOSURE
// ============================================================================
test('Frontend source code & index.html never expose internal notification recipient emails and retain official info@destriatech.com', () => {
  const root = process.cwd();
  const frontendDirs = [
    'src/components',
    'src/services',
    'src/data',
    'src/portal',
    'src/config',
    'src/lib',
  ];

  const collectFiles = (dir: string): string[] => {
    const abs = path.resolve(root, dir);
    if (!fs.existsSync(abs)) return [];
    const results: string[] = [];
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const full = path.join(abs, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectFiles(path.relative(root, full)));
      } else if (/\.(ts|tsx|js|jsx|html)$/.test(entry.name)) {
        results.push(full);
      }
    }
    return results;
  };

  const files = [
    path.resolve(root, 'index.html'),
    path.resolve(root, 'src/App.tsx'),
    ...frontendDirs.flatMap(collectFiles),
  ].filter((f) => fs.existsSync(f));

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8').toLowerCase();
    assert.equal(
      content.includes(RECIPIENT_1),
      false,
      `Frontend file ${path.relative(root, filePath)} must never contain internal recipient ${RECIPIENT_1}`
    );
    assert.equal(
      content.includes(RECIPIENT_2),
      false,
      `Frontend file ${path.relative(root, filePath)} must never contain internal recipient ${RECIPIENT_2}`
    );
  }

  // Verify public corporate email info@destriatech.com is retained
  const companyConfig = fs.readFileSync(path.resolve(root, 'src/data/companyConfig.ts'), 'utf8');
  assert.ok(companyConfig.includes('info@destriatech.com'));
});
