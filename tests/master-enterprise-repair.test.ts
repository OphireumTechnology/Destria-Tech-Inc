import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import http from 'http';
import { AddressInfo } from 'net';
import { createApp } from '../src/server/app';
import {
  AdminUserRecord,
  AppointmentRecord,
  AuditLogRecord,
  ConflictError,
  CreateAppointmentInput,
  CreateOutboxInput,
  CreateSolutionRequestInput,
  DatabaseRepository,
  EmailOutboxRecord,
  NotFoundError,
  NotificationWebhookEventRecord,
  SolutionRequestRecord,
  UpdateOutboxPatch,
} from '../src/server/db/types';
import {
  EmailSendResult,
  EmailTransport,
  ResendEmailTransport,
  buildNotificationIdempotencyKey,
  normalizeWebhookTimestamp,
} from '../src/server/services/emailService';
import { GoogleCalendarService } from '../src/server/services/calendarService';
import { LocalPortalRepository } from '../src/server/portal/localPortalRepository';
import {
  PaymentGatewayRegistry,
  type GatewayFetchLike,
} from '../src/server/portal/payments/paymentAdapters';
import { resolveListenPort } from '../server';

interface EnterpriseTestStore {
  solutionRequests: SolutionRequestRecord[];
  appointments: AppointmentRecord[];
  outbox: EmailOutboxRecord[];
  webhookEvents: NotificationWebhookEventRecord[];
  auditLogs: AuditLogRecord[];
  admins: AdminUserRecord[];
}

function createEnterpriseStore(): EnterpriseTestStore {
  return {
    solutionRequests: [],
    appointments: [],
    outbox: [],
    webhookEvents: [],
    auditLogs: [],
    admins: [
      {
        id: 'admin-super-1',
        email: 'exec.admin@destriatech.com',
        fullName: 'Executive Super Admin',
        role: 'super_admin',
        isActive: true,
      },
    ],
  };
}

class EnterpriseTestDb implements DatabaseRepository {
  public readonly isConfigured = true;
  constructor(private readonly store: EnterpriseTestStore) {}

  async ping() {
    return { ok: true, configured: true, latencyMs: 1 };
  }

  async createSolutionRequest(input: CreateSolutionRequestInput) {
    if (input.idempotencyKey) {
      const existing = this.store.solutionRequests.find(
        (r) => r.idempotencyKey === input.idempotencyKey
      );
      if (existing) return { record: existing, created: false };
    }
    const now = new Date().toISOString();
    const record: SolutionRequestRecord = {
      ...input,
      sourceChannel: input.sourceChannel || 'Public Website',
      id: crypto.randomUUID(),
      status: 'submitted',
      emailDeliveryStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.store.solutionRequests.unshift(record);
    return { record, created: true };
  }

  async findSolutionRequestByIdempotencyKey(idempotencyKey: string) {
    return this.store.solutionRequests.find((r) => r.idempotencyKey === idempotencyKey) || null;
  }

  async verifySupabaseUserToken(_accessToken: string) {
    return null;
  }

  async createSolutionRequestWithOutbox(
    input: CreateSolutionRequestInput,
    outboxInputs: CreateOutboxInput[]
  ) {
    const res = await this.createSolutionRequest(input);
    const outboxRecords: EmailOutboxRecord[] = [];
    if (res.created) {
      for (const item of outboxInputs) {
        const created = await this.createOutboxRecord({
          ...item,
          entityReference: res.record.referenceCode,
        });
        outboxRecords.push(created.record);
      }
    } else {
      outboxRecords.push(
        ...(await this.listOutboxByEntity('solution_request', res.record.referenceCode))
      );
    }
    return { ...res, outboxRecords };
  }

  async updateSolutionRequestEmailStatus(
    referenceCode: string,
    status: SolutionRequestRecord['emailDeliveryStatus']
  ) {
    const rec = this.store.solutionRequests.find((r) => r.referenceCode === referenceCode);
    if (rec) rec.emailDeliveryStatus = status;
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

  async getBookedSlotsForDate(date: string) {
    return this.store.appointments
      .filter((a) => a.scheduledDate === date && (a.status === 'pending_review' || a.status === 'confirmed'))
      .map((a) => a.scheduledTimeSlot);
  }

  async createAppointment(input: CreateAppointmentInput) {
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
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.store.appointments.unshift(record);
    return { record, created: true };
  }

  async createAppointmentWithOutbox(
    input: CreateAppointmentInput,
    outboxInputs: CreateOutboxInput[]
  ) {
    const res = await this.createAppointment(input);
    const outboxRecords: EmailOutboxRecord[] = [];
    if (res.created) {
      for (const item of outboxInputs) {
        const created = await this.createOutboxRecord({
          ...item,
          entityReference: res.record.referenceCode,
        });
        outboxRecords.push(created.record);
      }
    } else {
      outboxRecords.push(
        ...(await this.listOutboxByEntity('appointment', res.record.referenceCode))
      );
    }
    return { ...res, outboxRecords };
  }

  async getAppointmentByReference(referenceCode: string) {
    return this.store.appointments.find((a) => a.referenceCode === referenceCode) || null;
  }

  async updateAppointment(referenceCode: string, patch: Partial<AppointmentRecord>) {
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

  async createOutboxRecord(input: CreateOutboxInput) {
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
      eventRevision: input.eventRevision ?? 1,
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now,
    };
    this.store.outbox.push(record);
    return { record, created: true };
  }

  async updateOutboxStatus(id: string, patch: UpdateOutboxPatch) {
    const rec = this.store.outbox.find((o) => o.id === id);
    if (!rec) return;
    rec.status = patch.status;
    if (patch.providerReference !== undefined) rec.providerReference = patch.providerReference;
    if (patch.deliveryAttempts !== undefined) rec.deliveryAttempts = patch.deliveryAttempts;
    if (patch.lastError !== undefined) rec.lastError = patch.lastError ?? undefined;
    if (patch.nextRetryAt !== undefined) rec.nextRetryAt = patch.nextRetryAt ?? undefined;
    if (patch.sentAt !== undefined) rec.sentAt = patch.sentAt ?? undefined;
    if (patch.providerAcceptedAt !== undefined) rec.providerAcceptedAt = patch.providerAcceptedAt ?? undefined;
    if (patch.deliveredAt !== undefined) rec.deliveredAt = patch.deliveredAt ?? undefined;
    if (patch.deadLetteredAt !== undefined) rec.deadLetteredAt = patch.deadLetteredAt ?? undefined;
    if (patch.bouncedAt !== undefined) rec.bouncedAt = patch.bouncedAt ?? undefined;
    if (patch.complainedAt !== undefined) rec.complainedAt = patch.complainedAt ?? undefined;
    if (patch.deliveryDelayedAt !== undefined) rec.deliveryDelayedAt = patch.deliveryDelayedAt ?? undefined;
    if (patch.claimedBy !== undefined) rec.claimedBy = patch.claimedBy ?? undefined;
    if (patch.claimedAt !== undefined) rec.claimedAt = patch.claimedAt ?? undefined;
    if (patch.leaseExpiresAt !== undefined) rec.leaseExpiresAt = patch.leaseExpiresAt ?? undefined;
    if (patch.lastWebhookEventId !== undefined) rec.lastWebhookEventId = patch.lastWebhookEventId ?? undefined;
    if (patch.lastWebhookEventAt !== undefined) rec.lastWebhookEventAt = patch.lastWebhookEventAt ?? undefined;
    rec.updatedAt = new Date().toISOString();
  }

  async claimRetryableOutbox(workerId: string, limit: number, leaseSeconds = 120) {
    const nowMs = Date.now();
    const leaseExpires = new Date(nowMs + leaseSeconds * 1000).toISOString();
    const nowIso = new Date(nowMs).toISOString();
    const claimed: EmailOutboxRecord[] = [];
    for (const o of this.store.outbox) {
      if (claimed.length >= limit) break;
      const retryable =
        (o.status === 'queued' || o.status === 'failed') &&
        o.deliveryAttempts < 5 &&
        (!o.nextRetryAt || Date.parse(o.nextRetryAt) <= nowMs);
      const expiredLease =
        o.status === 'processing' &&
        Boolean(o.leaseExpiresAt && Date.parse(o.leaseExpiresAt) < nowMs);
      if (retryable || expiredLease) {
        o.status = 'processing';
        o.claimedBy = workerId;
        o.claimedAt = nowIso;
        o.leaseExpiresAt = leaseExpires;
        claimed.push({ ...o });
      }
    }
    return claimed;
  }

  async listRetryableOutbox(limit: number) {
    return this.store.outbox
      .filter((o) => (o.status === 'queued' || o.status === 'failed') && o.deliveryAttempts < 5)
      .slice(0, limit);
  }

  async getOutboxById(id: string) {
    return this.store.outbox.find((o) => o.id === id) || null;
  }

  async findOutboxByProviderReference(providerReference: string) {
    return this.store.outbox.find((o) => o.providerReference === providerReference) || null;
  }

  async listOutboxByEntity(entityType: 'solution_request' | 'appointment', entityReference: string) {
    return this.store.outbox.filter(
      (o) => o.entityType === entityType && o.entityReference === entityReference
    );
  }

  async listOutboxRecords(options: {
    limit: number;
    offset: number;
    status?: string;
    entityReference?: string;
  }) {
    let list = [...this.store.outbox];
    if (options.status) list = list.filter((o) => o.status === options.status);
    if (options.entityReference) list = list.filter((o) => o.entityReference === options.entityReference);
    return {
      records: list.slice(options.offset, options.offset + options.limit),
      total: list.length,
    };
  }

  async recordWebhookEventOnce(input: {
    provider: string;
    providerEventId: string;
    eventType: string;
    providerMessageId?: string;
    eventTimestampUtc: string;
    payload: Record<string, unknown>;
  }) {
    const existing = this.store.webhookEvents.find(
      (e) => e.provider === input.provider && e.providerEventId === input.providerEventId
    );
    if (existing) return { record: existing, inserted: false };
    const record: NotificationWebhookEventRecord = {
      id: crypto.randomUUID(),
      provider: input.provider,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      providerMessageId: input.providerMessageId,
      eventTimestampUtc: input.eventTimestampUtc,
      payload: input.payload,
      reconciled: false,
      receivedAt: new Date().toISOString(),
    };
    this.store.webhookEvents.push(record);
    return { record, inserted: true };
  }

  async listPendingWebhookEventsByMessageId(providerMessageId: string) {
    return this.store.webhookEvents.filter(
      (e) => e.providerMessageId === providerMessageId && !e.reconciled
    );
  }

  async markWebhookEventReconciled(eventId: string, outboxId: string) {
    const ev = this.store.webhookEvents.find((e) => e.id === eventId);
    if (ev) {
      ev.reconciled = true;
      ev.outboxId = outboxId;
      ev.reconciledAt = new Date().toISOString();
    }
  }

  async writeAuditLog(input: Omit<AuditLogRecord, 'id' | 'createdAt'>) {
    this.store.auditLogs.unshift({
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
  }

  async listAuditLogs(options: { limit: number; offset: number }) {
    return {
      records: this.store.auditLogs.slice(options.offset, options.offset + options.limit),
      total: this.store.auditLogs.length,
    };
  }

  async findActiveAdminByEmail(email: string) {
    return (
      this.store.admins.find((a) => a.email.toLowerCase() === email.toLowerCase() && a.isActive) ||
      null
    );
  }
}

class ControllableEmailTransport implements EmailTransport {
  public readonly isConfigured = true;
  public calls: Array<{ to: string; idempotencyKey?: string; subject: string }> = [];
  public mode: 'accept' | 'fail' = 'accept';
  public delayMs = 0;
  public onBeforeReturn?: (providerId: string, to: string) => Promise<void>;

  async send(params: {
    to: string;
    subject: string;
    html: string;
    text: string;
    idempotencyKey?: string;
  }): Promise<EmailSendResult> {
    this.calls.push({
      to: params.to,
      idempotencyKey: params.idempotencyKey,
      subject: params.subject,
    });
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
    if (this.mode === 'fail') {
      return { status: 'failed', error: 'Simulated 503 upstream outage' };
    }
    const providerId = `re_real_${crypto.randomBytes(6).toString('hex')}`;
    if (this.onBeforeReturn) {
      await this.onBeforeReturn(providerId, params.to);
    }
    return { status: 'provider_accepted', providerReference: providerId };
  }
}

async function startServer(deps: Parameters<typeof createApp>[0]) {
  const { app, db, emailService, authService } = createApp(deps);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    db,
    emailService,
    authService,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function signSvix(secret: string, svixId: string, svixTs: string, rawBody: string): string {
  const keyBytes = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', keyBytes)
    .update(`${svixId}.${svixTs}.${rawBody}`)
    .digest('base64');
  return `v1,${sig}`;
}

function getFutureBusinessDate(daysAhead = 5): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

// ============================================================================
// ERR-001: Reject Resend HTTP 200 without real message id + parse 429 Retry-After
// ============================================================================
test('ERR-001: ResendEmailTransport rejects HTTP 200 missing id (zero fabricated resend_... ID) and honors HTTP 429 Retry-After', async () => {
  let responseMode: 'missing_id' | 'rate_limited' | 'valid' = 'missing_id';
  const mockServer = http.createServer((_req, res) => {
    if (responseMode === 'missing_id') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true })); // Missing real provider id!
      return;
    }
    if (responseMode === 'rate_limited') {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '45' });
      res.end(JSON.stringify({ message: 'Too many requests' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 're_verified_provider_id_991' }));
  });

  await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const { port } = mockServer.address() as AddressInfo;

  try {
    const transport = new ResendEmailTransport('re_test_key_valid', undefined, {
      endpointUrl: `http://127.0.0.1:${port}/emails`,
    });

    // 1. Missing id must fail honestly and never fabricate resend_<timestamp>
    const missingIdRes = await transport.send({
      to: 'client@corp.example',
      subject: 'Test',
      html: '<p>Test</p>',
      text: 'Test',
    });
    assert.equal(missingIdRes.status, 'failed');
    assert.equal(missingIdRes.providerReference, undefined);
    assert.match(missingIdRes.error || '', /without a valid provider message id/i);

    // 2. HTTP 429 Retry-After must be parsed into retryAfterSeconds
    responseMode = 'rate_limited';
    const rateLimitRes = await transport.send({
      to: 'client@corp.example',
      subject: 'Test',
      html: '<p>Test</p>',
      text: 'Test',
    });
    assert.equal(rateLimitRes.status, 'failed');
    assert.equal(rateLimitRes.retryAfterSeconds, 45);

    // 3. Valid response returns provider_accepted with real providerReference
    responseMode = 'valid';
    const okRes = await transport.send({
      to: 'client@corp.example',
      subject: 'Test',
      html: '<p>Test</p>',
      text: 'Test',
    });
    assert.equal(okRes.status, 'provider_accepted');
    assert.equal(okRes.providerReference, 're_verified_provider_id_991');
  } finally {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

// ============================================================================
// ERR-002: Atomic multi-worker claiming, expired lease recovery, dead-letter & bounce suppression
// ============================================================================
test('ERR-002: Concurrent workers never double-send, expired lease recovers, 5 failures transition to dead_letter, bounced/complained never auto-retried', async () => {
  const store = createEnterpriseStore();
  const db = new EnterpriseTestDb(store);
  const transport = new ControllableEmailTransport();
  transport.delayMs = 25;

  const srv = await startServer({ db, emailTransport: transport });
  try {
    // Seed 1 queued item
    const { record: item } = await db.createOutboxRecord({
      dedupeKey: 'err002:concurrent:1',
      entityType: 'solution_request',
      entityReference: 'OPM-INQ-2026-ERR002',
      recipientEmail: 'ops@enterprise.example',
      notificationType: 'admin_alert',
      subject: 'Concurrency Test',
      htmlBody: '<p>Hi</p>',
      textBody: 'Hi',
    });

    // Two concurrent workers race on the exact same queue
    const [w1, w2] = await Promise.all([
      srv.emailService.processRetryQueue(10, 'corr-1', 'worker-A', 120),
      srv.emailService.processRetryQueue(10, 'corr-2', 'worker-B', 120),
    ]);
    assert.equal(w1 + w2, 1);
    assert.equal(transport.calls.length, 1);
    assert.equal(store.outbox.find((o) => o.id === item.id)?.status, 'provider_accepted');

    // Expired processing lease recovery
    const { record: stuckItem } = await db.createOutboxRecord({
      dedupeKey: 'err002:stuck:1',
      entityType: 'solution_request',
      entityReference: 'OPM-INQ-2026-STUCK',
      recipientEmail: 'recover@enterprise.example',
      notificationType: 'admin_alert',
      subject: 'Lease Recovery',
      htmlBody: '<p>Hi</p>',
      textBody: 'Hi',
    });
    await db.updateOutboxStatus(stuckItem.id, {
      status: 'processing',
      deliveryAttempts: 1,
      claimedBy: 'crashed-worker',
      leaseExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const recoveredCount = await srv.emailService.processRetryQueue(10, 'corr-3', 'worker-C', 120);
    assert.equal(recoveredCount, 1);
    assert.equal(store.outbox.find((o) => o.id === stuckItem.id)?.status, 'provider_accepted');

    // Bounded retries -> dead_letter after 5 failures
    transport.mode = 'fail';
    const { record: dlqItem } = await db.createOutboxRecord({
      dedupeKey: 'err002:dlq:1',
      entityType: 'solution_request',
      entityReference: 'OPM-INQ-2026-DLQ',
      recipientEmail: 'dlq@enterprise.example',
      notificationType: 'admin_alert',
      subject: 'DLQ Test',
      htmlBody: '<p>Hi</p>',
      textBody: 'Hi',
    });

    for (let attempt = 1; attempt <= 5; attempt++) {
      // Make eligible immediately for deterministic test execution
      await db.updateOutboxStatus(dlqItem.id, {
        status: attempt === 1 ? 'queued' : 'failed',
        deliveryAttempts: attempt - 1,
        nextRetryAt: new Date(Date.now() - 1000).toISOString(),
      });
      await srv.emailService.processRetryQueue(10, `corr-dlq-${attempt}`, 'worker-DLQ', 120);
    }
    const finalDlq = store.outbox.find((o) => o.id === dlqItem.id)!;
    assert.equal(finalDlq.status, 'dead_letter');
    assert.equal(finalDlq.deliveryAttempts, 5);
    assert.ok(finalDlq.deadLetteredAt);

    // Bounced & complained records are NEVER auto-retried
    transport.mode = 'accept';
    const { record: bouncedItem } = await db.createOutboxRecord({
      dedupeKey: 'err002:bounced:1',
      entityType: 'solution_request',
      entityReference: 'OPM-INQ-2026-BOUNCE',
      recipientEmail: 'bounced@enterprise.example',
      notificationType: 'admin_alert',
      subject: 'Bounce Test',
      htmlBody: '<p>Hi</p>',
      textBody: 'Hi',
    });
    await db.updateOutboxStatus(bouncedItem.id, {
      status: 'bounced',
      deliveryAttempts: 1,
      bouncedAt: new Date().toISOString(),
    });
    const beforeCalls = transport.calls.length;
    const processedBounce = await srv.emailService.processRetryQueue(10, 'corr-b', 'worker-B', 120);
    assert.equal(processedBounce, 0);
    assert.equal(transport.calls.length, beforeCalls);
  } finally {
    await srv.close();
  }
});

// ============================================================================
// ERR-003: Deterministic recipient-identity idempotency key independent of order
// ============================================================================
test('ERR-003: Notification Idempotency-Key is recipient-identity deterministic regardless of recipient ordering or casing', () => {
  const keyA1 = buildNotificationIdempotencyKey({
    entityType: 'solution_request',
    entityReference: 'OPM-INQ-2026-AAA111',
    notificationType: 'admin_alert',
    recipientEmail: 'RecipientOne@Example.COM',
    eventRevision: 1,
  });
  const keyA2 = buildNotificationIdempotencyKey({
    entityType: 'solution_request',
    entityReference: 'OPM-INQ-2026-AAA111',
    notificationType: 'admin_alert',
    recipientEmail: ' recipientone@example.com ',
    eventRevision: 1,
  });
  const keyB = buildNotificationIdempotencyKey({
    entityType: 'solution_request',
    entityReference: 'OPM-INQ-2026-AAA111',
    notificationType: 'admin_alert',
    recipientEmail: 'recipienttwo@example.com',
    eventRevision: 1,
  });

  assert.equal(keyA1, keyA2);
  assert.notEqual(keyA1, keyB);
  assert.equal(keyA1.includes('recipient-1'), false);
  assert.equal(keyA1.includes('recipient-2'), false);
});

// ============================================================================
// ERR-004, ERR-005, ERR-006, ERR-010, ERR-011: Atomic outbox, accurate duplicate status,
// webhook timestamp validation, duplicate/out-of-order guard, and early-webhook reconciliation
// ============================================================================
test('ERR-004/005/006/010/011: Atomic request+outbox, real duplicate delivery status, webhook dedupe/out-of-order/timestamp validation, and early-webhook reconciliation', async () => {
  const store = createEnterpriseStore();
  const db = new EnterpriseTestDb(store);
  const transport = new ControllableEmailTransport();
  const webhookSecret = 'whsec_' + Buffer.from('destria-master-repair-webhook-key').toString('base64');

  const srv = await startServer({
    db,
    emailTransport: transport,
    dualNotificationOverrides: {
      webhookSecret,
      serviceInquiryRecipients: ['ops.one@example.test', 'ops.two@example.test'],
      executiveConsultationRecipients: ['ops.one@example.test', 'ops.two@example.test'],
    },
  });

  try {
    // 1. ERR-006 timestamp normalization unit check
    const badTs = normalizeWebhookTimestamp('not-a-date', String(Math.floor(Date.now() / 1000)));
    assert.equal(badTs.source, 'svix_header');
    assert.ok(!Number.isNaN(Date.parse(badTs.iso)));

    const absurdFutureTs = normalizeWebhookTimestamp('2099-01-01T00:00:00Z');
    assert.equal(absurdFutureTs.source, 'server_fallback');

    // 2. ERR-010 & ERR-004: Submit inquiry with Idempotency-Key -> provider_accepted, NOT delivered yet
    const inqRes1 = await fetch(`${srv.baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'master-inq-idemp-001',
      },
      body: JSON.stringify({
        type: 'contact_form',
        fullName: 'Elena Vance',
        email: 'elena@vance.example',
        contactNumber: '+1 307 555 0133',
        company: 'Vance Dynamics',
        projectDescription: 'Enterprise cloud migration and security hardening architecture.',
        privacyConsent: true,
      }),
    });
    assert.equal(inqRes1.status, 201);
    const inqJson1 = await inqRes1.json();
    assert.equal(inqJson1.emailDelivery.overallStatus, 'provider_accepted');
    assert.equal(inqJson1.emailDelivery.providerAcceptedRecipientsCount, 2);
    assert.equal(inqJson1.emailDelivery.confirmedDeliveredRecipientsCount, 0);
    assert.equal(inqJson1.emailDelivery.deliveredRecipientsCount, 0);

    // 3. ERR-011: Duplicate idempotent submission returns ACTUAL persisted counts (NOT hardcoded zeros / unconfigured!)
    const inqRes2 = await fetch(`${srv.baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'master-inq-idemp-001',
      },
      body: JSON.stringify({
        type: 'contact_form',
        fullName: 'Elena Vance',
        email: 'elena@vance.example',
        contactNumber: '+1 307 555 0133',
        company: 'Vance Dynamics',
        projectDescription: 'Enterprise cloud migration and security hardening architecture.',
        privacyConsent: true,
      }),
    });
    assert.equal(inqRes2.status, 200);
    const inqJson2 = await inqRes2.json();
    assert.equal(inqJson2.deduplicated, true);
    assert.equal(inqJson2.emailDelivery.overallStatus, 'provider_accepted');
    assert.equal(inqJson2.emailDelivery.notifiedRecipientsCount, 2);
    assert.equal(inqJson2.emailDelivery.providerAcceptedRecipientsCount, 2);

    // 4. ERR-005 & ERR-006: Verified email.delivered webhook with invalid created_at normalizes cleanly,
    // duplicate webhook preserves original deliveredAt, and out-of-order delivery_delayed does not downgrade
    const adminOutboxes = store.outbox.filter((o) => o.notificationType === 'admin_alert');
    assert.equal(adminOutboxes.length, 2);
    const targetOutbox = adminOutboxes[0];
    const targetMsgId = targetOutbox.providerReference!;

    const tsNowSec = String(Math.floor(Date.now() / 1000));
    const deliveredBody = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-11-25T10:20:00.000Z',
      data: { email_id: targetMsgId },
    });
    const wh1 = await fetch(`${srv.baseUrl}/api/webhooks/email/resend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'svix_deliv_001',
        'svix-timestamp': tsNowSec,
        'svix-signature': signSvix(webhookSecret, 'svix_deliv_001', tsNowSec, deliveredBody),
      },
      body: deliveredBody,
    });
    assert.equal(wh1.status, 200);
    assert.equal(targetOutbox.status, 'delivered');
    assert.equal(targetOutbox.deliveredAt, '2026-11-25T10:20:00.000Z');

    // Duplicate webhook with same svix-id deduplicates and preserves original deliveredAt
    const whDup = await fetch(`${srv.baseUrl}/api/webhooks/email/resend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'svix_deliv_001',
        'svix-timestamp': tsNowSec,
        'svix-signature': signSvix(webhookSecret, 'svix_deliv_001', tsNowSec, deliveredBody),
      },
      body: deliveredBody,
    });
    assert.equal(whDup.status, 200);
    const whDupJson = await whDup.json();
    assert.equal(whDupJson.deduplicated, true);
    assert.equal(targetOutbox.deliveredAt, '2026-11-25T10:20:00.000Z');

    // Out-of-order delivery_delayed AFTER delivered must NOT downgrade status
    const delayedBody = JSON.stringify({
      type: 'email.delivery_delayed',
      created_at: 'INVALID_TIMESTAMP_STRING',
      data: { email_id: targetMsgId },
    });
    const whDelayed = await fetch(`${srv.baseUrl}/api/webhooks/email/resend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'svix_delayed_002',
        'svix-timestamp': tsNowSec,
        'svix-signature': signSvix(webhookSecret, 'svix_delayed_002', tsNowSec, delayedBody),
      },
      body: delayedBody,
    });
    assert.equal(whDelayed.status, 200);
    assert.equal(targetOutbox.status, 'delivered');
    assert.equal(targetOutbox.deliveredAt, '2026-11-25T10:20:00.000Z');

    // 5. ERR-005 Early-webhook race reconciliation: webhook arrives BEFORE provider_reference is persisted
    transport.onBeforeReturn = async (providerId, to) => {
      if (to === 'ops.one@example.test') {
        const earlyBody = JSON.stringify({
          type: 'email.delivered',
          created_at: '2026-11-25T10:25:00.000Z',
          data: { email_id: providerId },
        });
        const earlyTs = String(Math.floor(Date.now() / 1000));
        await fetch(`${srv.baseUrl}/api/webhooks/email/resend`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'svix-id': `svix_early_${providerId}`,
            'svix-timestamp': earlyTs,
            'svix-signature': signSvix(webhookSecret, `svix_early_${providerId}`, earlyTs, earlyBody),
          },
          body: earlyBody,
        });
      }
    };

    const earlyInqRes = await fetch(`${srv.baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'contact_form',
        fullName: 'Early Webhook Client',
        email: 'early@vance.example',
        contactNumber: '+1 307 555 0144',
        company: 'Early Corp',
        projectDescription: 'Testing early webhook reconciliation before provider_reference update.',
        privacyConsent: true,
      }),
    });
    assert.equal(earlyInqRes.status, 201);
    const earlyInqJson = await earlyInqRes.json();
    const reconciledOutbox = store.outbox.find(
      (o) =>
        o.entityReference === earlyInqJson.referenceId && o.recipientEmail === 'ops.one@example.test'
    );
    assert.equal(reconciledOutbox?.status, 'delivered');
    assert.equal(reconciledOutbox?.deliveredAt, '2026-11-25T10:25:00.000Z');
  } finally {
    await srv.close();
  }
});

// ============================================================================
// ERR-007, ERR-008, ERR-009, ERR-013, ERR-017, ERR-018:
// Real provider HTTP checkout/verify/refund, canonical returnUrl, malware quarantine,
// /healthz, /ready, /api/admin/system-health, /api/admin/notifications & retry
// ============================================================================
test('ERR-007/008/009/013/017/018: Payment adapters (no sbx_ stubs), canonical returnUrl, S2S verify, authorized refund, malware quarantine, and admin ops', async () => {
  const store = createEnterpriseStore();
  const db = new EnterpriseTestDb(store);
  const portalRepo = new LocalPortalRepository({ persistDir: null });
  const transport = new ControllableEmailTransport();

  const recordedGatewayCalls: Array<{ url: string; method: string; body?: any }> = [];
  const mockGatewayFetch: GatewayFetchLike = async (urlInput, init) => {
    const url = String(urlInput);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    recordedGatewayCalls.push({ url, method: init?.method || 'GET', body });

    if (url.includes('/v2/invoices') && init?.method === 'POST') {
      return new Response(
        JSON.stringify({
          id: 'xen_inv_real_9001',
          invoice_url: 'https://checkout-staging.xendit.co/web/xen_inv_real_9001',
          status: 'PENDING',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/v2/invoices/xen_inv_real_9001') && (init?.method || 'GET') === 'GET') {
      return new Response(
        JSON.stringify({
          id: 'xen_inv_real_9001',
          status: 'PAID',
          amount: 1000,
          currency: 'USD',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/refunds') && init?.method === 'POST') {
      return new Response(
        JSON.stringify({
          id: 'xen_rfnd_real_777',
          status: 'SUCCEEDED',
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ message: 'Unknown mock route' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const prevXenditKey = process.env.XENDIT_SECRET_KEY_TEST;
  const prevXenditHook = process.env.XENDIT_WEBHOOK_TOKEN_TEST;
  const prevAdminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const prevAdminPass = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const prevQuarantine = process.env.ENFORCE_MALWARE_QUARANTINE;

  process.env.XENDIT_SECRET_KEY_TEST = 'xnd_development_test_secret_12345';
  process.env.XENDIT_WEBHOOK_TOKEN_TEST = 'xnd_webhook_token_12345';
  process.env.ADMIN_BOOTSTRAP_EMAIL = 'exec.admin@destriatech.com';
  process.env.ADMIN_BOOTSTRAP_PASSWORD = 'StrongEnterpriseAdminPassword!2026';
  process.env.ENFORCE_MALWARE_QUARANTINE = 'true';

  const paymentRegistry = new PaymentGatewayRegistry({ fetchImpl: mockGatewayFetch });
  const srv = await startServer({
    db,
    portalRepo,
    paymentRegistry,
    emailTransport: transport,
    calendarService: new GoogleCalendarService('', ''),
    sessionSecret: 'master-repair-test-signing-secret-32-chars-minimum',
  });

  try {
    // 1. /healthz and /ready probes (ERR-017)
    const healthzRes = await fetch(`${srv.baseUrl}/healthz`);
    assert.equal(healthzRes.status, 200);
    const readyRes = await fetch(`${srv.baseUrl}/ready`);
    assert.equal(readyRes.status, 200);
    const readyJson = await readyRes.json();
    assert.equal(readyJson.ready, true);

    // 2. Admin login + /api/admin/system-health + /api/admin/notifications
    const adminLoginRes = await fetch(`${srv.baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'exec.admin@destriatech.com',
        password: 'StrongEnterpriseAdminPassword!2026',
      }),
    });
    assert.equal(adminLoginRes.status, 200);
    const { token: adminToken } = await adminLoginRes.json();

    const sysHealthRes = await fetch(`${srv.baseUrl}/api/admin/system-health`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(sysHealthRes.status, 200);
    const sysHealthJson = await sysHealthRes.json();
    assert.equal(sysHealthJson.subsystems.database.state, 'HEALTHY');
    assert.equal(sysHealthJson.subsystems.payments.providers.find((p: any) => p.provider === 'gotyme').isEnabled, false);

    // 3. Admin notification retry endpoint: rejects delivered, retries failed
    const { record: failedNotif } = await db.createOutboxRecord({
      dedupeKey: 'admin-retry-test-1',
      entityType: 'solution_request',
      entityReference: 'OPM-INQ-2026-RETRY',
      recipientEmail: 'retry@enterprise.example',
      notificationType: 'admin_alert',
      subject: 'Retry Me',
      htmlBody: '<p>Retry</p>',
      textBody: 'Retry',
    });
    await db.updateOutboxStatus(failedNotif.id, { status: 'dead_letter', deliveryAttempts: 5 });

    const listNotifsRes = await fetch(`${srv.baseUrl}/api/admin/notifications`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(listNotifsRes.status, 200);
    const listNotifsJson = await listNotifsRes.json();
    assert.ok(listNotifsJson.records.some((r: any) => r.id === failedNotif.id));

    const retryRes = await fetch(`${srv.baseUrl}/api/admin/notifications/${failedNotif.id}/retry`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(retryRes.status, 200);
    const retryJson = await retryRes.json();
    assert.equal(retryJson.status, 'provider_accepted');

    // Mark delivered and verify retry is now rejected (409)
    await db.updateOutboxStatus(failedNotif.id, { status: 'delivered', deliveryAttempts: 1, deliveredAt: new Date().toISOString() });
    const retryDeliveredRes = await fetch(
      `${srv.baseUrl}/api/admin/notifications/${failedNotif.id}/retry`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    assert.equal(retryDeliveredRes.status, 409);

    // 4. Register portal user, upload PDF, verify ERR-013 malware quarantine enforcement & admin clearance
    const regRes = await fetch(`${srv.baseUrl}/api/portal/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'portal.client@enterprise.example',
        password: 'EnterpriseClientPass!2026',
        firstName: 'Marcus',
        lastName: 'Reyes',
        companyName: 'Reyes Logistics',
      }),
    });
    assert.equal(regRes.status, 201);
    const regJson = await regRes.json();
    const portalToken = regJson.token as string;
    const portalUserId = regJson.user.id;
    assert.ok(portalToken);
    assert.ok(regJson.devVerificationToken);

    const verifyEmailRes = await fetch(`${srv.baseUrl}/api/portal/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: regJson.devVerificationToken }),
    });
    assert.equal(verifyEmailRes.status, 200);

    // Upload valid PDF
    const pdfBase64 = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF').toString('base64');
    const uploadRes = await fetch(`${srv.baseUrl}/api/portal/files/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${portalToken}` },
      body: JSON.stringify({
        fileName: 'architecture-spec.pdf',
        mimeType: 'application/pdf',
        category: 'reference',
        contentBase64: pdfBase64,
      }),
    });
    assert.equal(uploadRes.status, 201);
    const uploadJson = await uploadRes.json();
    const fileId = uploadJson.file.id;

    // With ENFORCE_MALWARE_QUARANTINE=true, signing unscanned file MUST return 403 FILE_QUARANTINED
    const signBlockedRes = await fetch(`${srv.baseUrl}/api/portal/files/${fileId}/sign`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${portalToken}` },
    });
    assert.equal(signBlockedRes.status, 403);
    const signBlockedJson = await signBlockedRes.json();
    assert.equal(signBlockedJson.code, 'FILE_QUARANTINED');

    // Admin clears file as 'clean' -> signing & downloading now succeed
    const scanUpdateRes = await fetch(`${srv.baseUrl}/api/admin/portal/files/${fileId}/scan-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ scanStatus: 'clean' }),
    });
    assert.equal(scanUpdateRes.status, 200);

    const signOkRes = await fetch(`${srv.baseUrl}/api/portal/files/${fileId}/sign`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${portalToken}` },
    });
    assert.equal(signOkRes.status, 200);
    const signOkJson = await signOkRes.json();
    const downloadUrl = signOkJson.downloadUrl;

    const dlOkRes = await fetch(`${srv.baseUrl}${downloadUrl}`);
    assert.equal(dlOkRes.status, 200);

    // If file is subsequently flagged, even an unexpired signed URL MUST be blocked with 403 on download!
    await fetch(`${srv.baseUrl}/api/admin/portal/files/${fileId}/scan-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ scanStatus: 'flagged', quarantineReason: 'Post-upload malware signature' }),
    });
    const dlBlockedRes = await fetch(`${srv.baseUrl}${downloadUrl}`);
    assert.equal(dlBlockedRes.status, 403);
    const dlBlockedJson = await dlBlockedRes.json();
    assert.equal(dlBlockedJson.code, 'FILE_QUARANTINED');

    // 5. ERR-007, ERR-008, ERR-009, ERR-018: Approved proposal checkout -> Xendit real HTTP call + canonical returnUrl
    const products = await portalRepo.listProducts();
    const prod = products[0];
    const pkg = prod.packages[0];
    const proposal = await portalRepo.createApprovedProposal({
      userId: portalUserId,
      title: 'Enterprise Architecture Assessment',
      scopeSummary: 'Full architecture review & roadmap',
      currency: 'USD',
      items: [
        {
          productId: prod.id,
          packageId: pkg.id,
          productSlug: prod.slug,
          productName: prod.name,
          packageName: pkg.name,
          billingType: 'one_time',
          quantity: 1,
          unitPriceMinor: 100000, // $1,000.00
          creditsAllocated: 0,
          revisionLimit: 2,
        },
      ],
    });

    const checkoutRes = await fetch(`${srv.baseUrl}/api/portal/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${portalToken}` },
      body: JSON.stringify({
        approvedProposalId: proposal.id,
        paymentProvider: 'xendit',
        billingDetails: {
          fullName: 'Marcus Reyes',
          email: 'portal.client@enterprise.example',
          phone: '+1 307 555 0199',
          companyName: 'Reyes Logistics',
          address: '30 N Gould St, Sheridan, WY',
        },
        commercialConsent: true,
      }),
    });
    assert.equal(checkoutRes.status, 201);
    const checkoutJson = await checkoutRes.json();

    // Assert zero fabricated sbx_ IDs and real persisted checkout URL + canonical returnUrl!
    assert.equal(checkoutJson.paymentInitiation.providerTransactionId, 'xen_inv_real_9001');
    assert.equal(
      checkoutJson.paymentInitiation.checkoutUrl,
      'https://checkout-staging.xendit.co/web/xen_inv_real_9001'
    );
    assert.equal(checkoutJson.payment.providerTransactionId, 'xen_inv_real_9001');
    assert.equal(
      checkoutJson.payment.checkoutUrl,
      'https://checkout-staging.xendit.co/web/xen_inv_real_9001'
    );
    assert.equal(checkoutJson.paymentInitiation.providerTransactionId.startsWith('sbx_'), false);

    const xenditCreateCall = recordedGatewayCalls.find((c) => c.url.includes('/v2/invoices'));
    assert.ok(xenditCreateCall);
    assert.match(xenditCreateCall.body.success_redirect_url, /^https:\/\/destriatech\.com\/portal\/orders\//);

    // 6. ERR-008: Admin server-to-server payment verification
    const verifyRes = await fetch(
      `${srv.baseUrl}/api/admin/portal/payments/${checkoutJson.payment.id}/verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({}),
      }
    );
    assert.equal(verifyRes.status, 200);
    const verifyJson = await verifyRes.json();
    assert.equal(verifyJson.verification.verified, true);
    assert.equal(verifyJson.verification.status, 'paid');

    // Confirm order via signed Xendit webhook so payment transitions to paid
    const whConfirmRes = await fetch(`${srv.baseUrl}/api/portal/webhooks/xendit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-callback-token': 'xnd_webhook_token_12345',
      },
      body: JSON.stringify({
        eventId: 'xen_evt_paid_9001',
        orderId: checkoutJson.order.id,
        transactionId: 'xen_inv_real_9001',
        amountMinor: 100000,
        currency: 'USD',
        status: 'paid',
      }),
    });
    assert.equal(whConfirmRes.status, 200);

    // 7. ERR-009: Unauthenticated refund rejected (401); over-refund rejected (422); valid partial refund succeeds (201) and deduplicates on retry (200)
    const unauthRefund = await fetch(
      `${srv.baseUrl}/api/admin/portal/payments/${checkoutJson.payment.id}/refund`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountMinor: 25000, reason: 'Unauthorized attempt' }),
      }
    );
    assert.equal(unauthRefund.status, 401);

    const overRefund = await fetch(
      `${srv.baseUrl}/api/admin/portal/payments/${checkoutJson.payment.id}/refund`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          amountMinor: 150000,
          reason: 'Exceeds paid minor units',
          idempotencyKey: 'rfnd-over-1',
        }),
      }
    );
    assert.equal(overRefund.status, 422);

    const partialRefund = await fetch(
      `${srv.baseUrl}/api/admin/portal/payments/${checkoutJson.payment.id}/refund`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          amountMinor: 40000,
          reason: 'Approved scope adjustment partial refund',
          idempotencyKey: 'rfnd-partial-001',
        }),
      }
    );
    assert.equal(partialRefund.status, 201);
    const partialJson = await partialRefund.json();
    assert.equal(partialJson.refund.providerRefundId, 'xen_rfnd_real_777');
    assert.equal(partialJson.payment.status, 'partially_refunded');
    assert.equal(partialJson.payment.refundedMinor, 40000);

    // Duplicate refund idempotency key returns 200 deduplicated without double-calling gateway
    const refundCallsBefore = recordedGatewayCalls.filter((c) => c.url.includes('/refunds')).length;
    const dupRefund = await fetch(
      `${srv.baseUrl}/api/admin/portal/payments/${checkoutJson.payment.id}/refund`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          amountMinor: 40000,
          reason: 'Approved scope adjustment partial refund',
          idempotencyKey: 'rfnd-partial-001',
        }),
      }
    );
    assert.equal(dupRefund.status, 200);
    const dupRefundJson = await dupRefund.json();
    assert.equal(dupRefundJson.deduplicated, true);
    assert.equal(
      recordedGatewayCalls.filter((c) => c.url.includes('/refunds')).length,
      refundCallsBefore
    );

    // 8. Appointment idempotency duplicate returns real persisted delivery outcome (ERR-011 & ERR-012)
    const apptDate = getFutureBusinessDate(7);
    const apptPayload = {
      fullName: 'Grace Alvarez',
      email: 'grace@alvarez.example',
      phone: '+1 307 555 0155',
      companyName: 'Alvarez Capital',
      executivePathway: 'ceo',
      consultationType: 'video',
      consultationPurpose: 'Enterprise Architecture Assessment',
      scheduledDate: apptDate,
      scheduledTimeSlot: '09:00 AM - 09:30 AM',
      clientTimezone: 'America/Denver',
    };
    const appt1 = await fetch(`${srv.baseUrl}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'appt-idemp-master-001',
      },
      body: JSON.stringify(apptPayload),
    });
    assert.equal(appt1.status, 201);

    const appt2 = await fetch(`${srv.baseUrl}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'appt-idemp-master-001',
      },
      body: JSON.stringify(apptPayload),
    });
    assert.equal(appt2.status, 200);
    const appt2Json = await appt2.json();
    assert.equal(appt2Json.deduplicated, true);
    assert.equal(appt2Json.emailDelivery.overallStatus, 'provider_accepted');
    assert.equal(appt2Json.emailDelivery.providerAcceptedRecipientsCount, 2);
  } finally {
    if (prevXenditKey === undefined) delete process.env.XENDIT_SECRET_KEY_TEST;
    else process.env.XENDIT_SECRET_KEY_TEST = prevXenditKey;
    if (prevXenditHook === undefined) delete process.env.XENDIT_WEBHOOK_TOKEN_TEST;
    else process.env.XENDIT_WEBHOOK_TOKEN_TEST = prevXenditHook;
    if (prevAdminEmail === undefined) delete process.env.ADMIN_BOOTSTRAP_EMAIL;
    else process.env.ADMIN_BOOTSTRAP_EMAIL = prevAdminEmail;
    if (prevAdminPass === undefined) delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
    else process.env.ADMIN_BOOTSTRAP_PASSWORD = prevAdminPass;
    if (prevQuarantine === undefined) delete process.env.ENFORCE_MALWARE_QUARANTINE;
    else process.env.ENFORCE_MALWARE_QUARANTINE = prevQuarantine;
    await srv.close();
  }
});

// ============================================================================
// ERR-015: Port resolution sanity check
// ============================================================================
test('ERR-015: resolveListenPort handles valid, invalid, and out-of-range PORT values safely', () => {
  assert.equal(resolveListenPort('8080'), 8080);
  assert.equal(resolveListenPort('invalid'), 3000);
  assert.equal(resolveListenPort('70000'), 3000);
  assert.equal(resolveListenPort(undefined), 3000);
});
