import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AddressInfo } from 'node:net';
import { createApp, AppDependencies } from '../src/server/app';
import { LocalPortalRepository } from '../src/server/portal/localPortalRepository';
import { UnconfiguredPortalRepository } from '../src/server/portal/supabasePortalRepository';
import {
  AdminUserRecord,
  AppointmentRecord,
  AuditLogRecord,
  ConflictError,
  CreateAppointmentInput,
  CreateSolutionRequestInput,
  DatabaseRepository,
  EmailOutboxRecord,
  NotFoundError,
  SolutionRequestRecord,
} from '../src/server/db/types';
import { EmailMessage, EmailSendResult, EmailTransport } from '../src/server/services/emailService';
import { GoogleCalendarService } from '../src/server/services/calendarService';
import { SupabaseDatabaseRepository } from '../src/server/db/supabaseRepository';
import { corporateIdentity } from '../src/data/companyConfig';

class EnterpriseTestDb implements DatabaseRepository {
  public readonly isConfigured = true;
  public appointments: AppointmentRecord[] = [];
  public solutionRequests: SolutionRequestRecord[] = [];
  public outbox: EmailOutboxRecord[] = [];
  public auditLogs: AuditLogRecord[] = [];
  public admins: AdminUserRecord[] = [];

  async ping() {
    return { ok: true, configured: true, latencyMs: 1 };
  }
  async findSolutionRequestByIdempotencyKey(key: string) {
    return this.solutionRequests.find((r) => r.idempotencyKey === key) || null;
  }
  async createSolutionRequest(input: CreateSolutionRequestInput) {
    const now = new Date().toISOString();
    const record: SolutionRequestRecord = {
      id: crypto.randomUUID(),
      ...input,
      status: 'submitted',
      emailDeliveryStatus: 'pending',
      sourceChannel: 'website',
      createdAt: now,
      updatedAt: now,
    };
    this.solutionRequests.unshift(record);
    return { record, created: true };
  }
  async updateSolutionRequestEmailStatus() {}
  async listSolutionRequests(options: { limit: number; offset: number }) {
    return {
      records: this.solutionRequests.slice(options.offset, options.offset + options.limit),
      total: this.solutionRequests.length,
    };
  }
  async getBookedSlotsForDate(scheduledDate: string) {
    return this.appointments
      .filter((a) => a.scheduledDate === scheduledDate && a.status !== 'cancelled')
      .map((a) => a.scheduledTimeSlot);
  }
  async createAppointment(input: CreateAppointmentInput) {
    const conflict = this.appointments.find(
      (a) =>
        a.scheduledDate === input.scheduledDate &&
        a.scheduledTimeSlot === input.scheduledTimeSlot &&
        a.status !== 'cancelled'
    );
    if (conflict) throw new ConflictError('Slot already booked');
    const now = new Date().toISOString();
    const record: AppointmentRecord = {
      id: crypto.randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.appointments.unshift(record);
    return { record, created: true };
  }
  async getAppointmentByReference(ref: string) {
    return this.appointments.find((a) => a.referenceCode === ref) || null;
  }
  async updateAppointment(ref: string, patch: Partial<AppointmentRecord>) {
    const idx = this.appointments.findIndex((a) => a.referenceCode === ref);
    if (idx === -1) throw new NotFoundError('Not found');
    const updated = { ...this.appointments[idx], ...patch, updatedAt: new Date().toISOString() };
    this.appointments[idx] = updated;
    return updated;
  }
  async listAppointments(options: { limit: number; offset: number }) {
    return {
      records: this.appointments.slice(options.offset, options.offset + options.limit),
      total: this.appointments.length,
    };
  }
  async createOutboxRecord(input: any) {
    const record: EmailOutboxRecord = {
      id: crypto.randomUUID(),
      dedupeKey: input.dedupeKey,
      entityType: input.entityType,
      entityReference: input.entityReference,
      recipientEmail: input.recipientEmail,
      notificationType: input.notificationType,
      subject: input.subject,
      htmlBody: input.htmlBody,
      textBody: input.textBody,
      status: 'queued',
      provider: 'resend',
      deliveryAttempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.outbox.push(record);
    return { record, created: true };
  }
  async updateOutboxStatus() {}
  async listRetryableOutbox() {
    return [];
  }
  async writeAuditLog(input: Omit<AuditLogRecord, 'id' | 'createdAt'>) {
    this.auditLogs.unshift({
      id: crypto.randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
    });
  }
  async listAuditLogs(options: { limit: number; offset: number }) {
    return {
      records: this.auditLogs.slice(options.offset, options.offset + options.limit),
      total: this.auditLogs.length,
    };
  }
  async findActiveAdminByEmail(email: string) {
    return this.admins.find((a) => a.email.toLowerCase() === email.toLowerCase()) || null;
  }
  async verifySupabaseUserToken() {
    return null;
  }
}

class CapturingEmailTransport implements EmailTransport {
  public isConfigured = true;
  public shouldFail = false;
  public sentEmails: EmailMessage[] = [];

  async send(params: EmailMessage): Promise<EmailSendResult> {
    if (!this.isConfigured) {
      return { status: 'unconfigured', error: 'RESEND_API_KEY not configured' };
    }
    if (this.shouldFail) {
      return { status: 'failed', error: 'Provider 503 transient failure' };
    }
    this.sentEmails.push(params);
    return { status: 'sent', providerReference: `re_portal_${this.sentEmails.length}` };
  }
}

async function startServer(deps: AppDependencies) {
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

function getNextBusinessDayIso(daysAhead = 4): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().split('T')[0];
}

test('1. Health probes (/healthz, /ready, /api/health) and security headers (CSP, CORP, X-Permitted-Cross-Domain-Policies)', async () => {
  // Healthy configured instance
  const healthySrv = await startServer({
    db: new EnterpriseTestDb(),
    portalRepo: new LocalPortalRepository(),
  });
  try {
    const liveness = await fetch(`${healthySrv.baseUrl}/healthz`);
    assert.equal(liveness.status, 200);
    assert.ok(liveness.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"));
    assert.equal(liveness.headers.get('cross-origin-resource-policy'), 'same-site');
    assert.equal(liveness.headers.get('x-permitted-cross-domain-policies'), 'none');
    assert.equal(liveness.headers.get('x-content-type-options'), 'nosniff');
    const liveJson = await liveness.json();
    assert.equal(liveJson.status, 'healthy');

    const ready = await fetch(`${healthySrv.baseUrl}/ready`);
    assert.equal(ready.status, 200);
    const readyJson = await ready.json();
    assert.equal(readyJson.ready, true);
  } finally {
    await healthySrv.close();
  }

  // Unconfigured DB + fail-closed portal instance -> /healthz 200, /ready 503
  const unconfiguredSrv = await startServer({
    db: new SupabaseDatabaseRepository('', ''),
    portalRepo: new UnconfiguredPortalRepository(),
  });
  try {
    const liveness = await fetch(`${unconfiguredSrv.baseUrl}/healthz`);
    assert.equal(liveness.status, 200);

    const ready = await fetch(`${unconfiguredSrv.baseUrl}/ready`);
    assert.equal(ready.status, 503);
    const readyJson = await ready.json();
    assert.equal(readyJson.ready, false);

    const health = await fetch(`${unconfiguredSrv.baseUrl}/api/health`);
    const healthJson = await health.json();
    assert.equal(healthJson.status, 'unconfigured');
    assert.equal(healthJson.dependencies.portalPersistence.mode, 'unconfigured');
    assert.equal(healthJson.dependencies.portalPersistence.durable, false);
  } finally {
    await unconfiguredSrv.close();
  }
});

test('2. Fail-closed production guard blocks Client Portal when durable Supabase persistence is unconfigured', async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevUrl = process.env.SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NODE_ENV = 'production';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const srv = await startServer({
    db: new SupabaseDatabaseRepository('', ''),
  });

  try {
    const regRes = await fetch(`${srv.baseUrl}/api/portal/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'prod-guard@example.com',
        password: 'StrongPassword2026!',
        firstName: 'Prod',
        lastName: 'Guard',
      }),
    });
    assert.equal(regRes.status, 503);
    const regJson = await regRes.json();
    assert.equal(regJson.success, false);
    assert.equal(regJson.code, 'DATABASE_UNAVAILABLE');

    const catalogRes = await fetch(`${srv.baseUrl}/api/portal/catalog/products`);
    assert.equal(catalogRes.status, 503);
  } finally {
    await srv.close();
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
  }
});

test('3. Client Portal transactional email dispatch (clean URLs, zero /#/) & full password recovery security lifecycle', async () => {
  const transport = new CapturingEmailTransport();
  const repo = new LocalPortalRepository();
  const srv = await startServer({
    db: new EnterpriseTestDb(),
    portalRepo: repo,
    emailTransport: transport,
    sessionSecret: 'enterprise-test-signing-secret-0123456789abcdef',
  });

  try {
    // 1. Register -> dispatches verification email with clean https://destriatech.com/portal/verify-email URL
    const regRes = await fetch(`${srv.baseUrl}/api/portal/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'director@enterprise-client.com',
        password: 'InitialPassword2026!',
        firstName: 'Jordan',
        lastName: 'Vance',
        companyName: 'Vance Global Corp',
      }),
    });
    assert.equal(regRes.status, 201);
    const regJson = await regRes.json();
    assert.equal(regJson.emailDelivery.deliveryStatus, 'provider_accepted');
    assert.ok(regJson.token);
    assert.equal(transport.sentEmails.length, 1);
    assert.ok(transport.sentEmails[0].html.includes('https://destriatech.com/portal/verify-email?token='));
    assert.equal(transport.sentEmails[0].html.includes('/#/'), false, 'Portal emails must never use /#/ hash links');

    const originalToken = regJson.token;

    // 2. Forgot password -> dispatches recovery email with clean reset URL
    const forgotRes = await fetch(`${srv.baseUrl}/api/portal/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'director@enterprise-client.com' }),
    });
    assert.equal(forgotRes.status, 200);
    const forgotJson = await forgotRes.json();
    assert.equal(forgotJson.success, true);
    assert.ok(forgotJson.devResetToken);
    assert.equal(transport.sentEmails.length, 2);
    assert.ok(transport.sentEmails[1].html.includes('https://destriatech.com/portal/reset-password?token='));
    assert.equal(transport.sentEmails[1].html.includes('/#/'), false);

    // 3. Invalid reset token rejected with 400
    const badResetRes = await fetch(`${srv.baseUrl}/api/portal/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'invalid-token-000000000',
        newPassword: 'UpdatedPassword2026!',
      }),
    });
    assert.equal(badResetRes.status, 400);

    // 4. Valid reset token updates password, sends security alert, and revokes prior sessions
    const resetRes = await fetch(`${srv.baseUrl}/api/portal/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: forgotJson.devResetToken,
        newPassword: 'UpdatedPassword2026!',
      }),
    });
    assert.equal(resetRes.status, 200);
    assert.equal(transport.sentEmails.length, 3);
    assert.ok(transport.sentEmails[2].subject.toLowerCase().includes('security notice'));

    // 5. Reusing consumed reset token fails with 400
    const reuseRes = await fetch(`${srv.baseUrl}/api/portal/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: forgotJson.devResetToken,
        newPassword: 'AnotherPassword2026!',
      }),
    });
    assert.equal(reuseRes.status, 400);

    // 6. Prior session token must be revoked (401)
    const revokedCheck = await fetch(`${srv.baseUrl}/api/portal/auth/me`, {
      headers: { Authorization: `Bearer ${originalToken}` },
    });
    assert.equal(revokedCheck.status, 401);

    // 7. Login succeeds with new password and fails with old password
    const oldLogin = await fetch(`${srv.baseUrl}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'director@enterprise-client.com',
        password: 'InitialPassword2026!',
      }),
    });
    assert.equal(oldLogin.status, 401);

    const newLogin = await fetch(`${srv.baseUrl}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'director@enterprise-client.com',
        password: 'UpdatedPassword2026!',
      }),
    });
    assert.equal(newLogin.status, 200);
  } finally {
    await srv.close();
  }
});

test('4. File upload magic-byte spoofing rejection & quarantine metadata integrity', async () => {
  const repo = new LocalPortalRepository();
  const srv = await startServer({
    db: new EnterpriseTestDb(),
    portalRepo: repo,
    sessionSecret: 'enterprise-test-signing-secret-0123456789abcdef',
  });

  try {
    const regRes = await fetch(`${srv.baseUrl}/api/portal/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'filesec@enterprise-client.com',
        password: 'FileSecPassword2026!',
        firstName: 'Alex',
        lastName: 'Mercer',
      }),
    });
    const { token } = await regRes.json();

    // 1. Disguised Windows PE executable ("MZ...") uploaded as invoice.pdf -> MUST reject 400
    const peBytes = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]).toString('base64');
    const spoofedExeRes = await fetch(`${srv.baseUrl}/api/portal/files/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        fileName: 'invoice.pdf',
        mimeType: 'application/pdf',
        contentBase64: peBytes,
      }),
    });
    assert.equal(spoofedExeRes.status, 400);
    const spoofedExeJson = await spoofedExeRes.json();
    assert.equal(spoofedExeJson.code, 'INVALID_FILE_SIGNATURE');

    // 2. HTML script disguised as PNG -> MUST reject 400
    const htmlScriptBase64 = Buffer.from('<html><script>alert(1)</script></html>', 'utf8').toString('base64');
    const spoofedPngRes = await fetch(`${srv.baseUrl}/api/portal/files/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        fileName: 'brand-logo.png',
        mimeType: 'image/png',
        contentBase64: htmlScriptBase64,
      }),
    });
    assert.equal(spoofedPngRes.status, 400);
    const spoofedPngJson = await spoofedPngRes.json();
    assert.equal(spoofedPngJson.code, 'INVALID_FILE_SIGNATURE');

    // 3. Valid PDF signature -> accepted with explicit quarantine & SHA-256 metadata
    const validPdfBytes = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'utf8');
    const expectedHash = crypto.createHash('sha256').update(validPdfBytes).digest('hex');
    const validUploadRes = await fetch(`${srv.baseUrl}/api/portal/files/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        fileName: 'architecture-brief.pdf',
        mimeType: 'application/pdf',
        contentBase64: validPdfBytes.toString('base64'),
      }),
    });
    assert.equal(validUploadRes.status, 201);
    const validJson = await validUploadRes.json();
    assert.equal(validJson.file.scanStatus, 'quarantined_unscanned');
    assert.equal(validJson.file.contentSha256, expectedHash);
    assert.ok(validJson.file.quarantineReason);
  } finally {
    await srv.close();
  }
});

test('5. Executive Consultation pathways route distinctly to CEO (Desmond Hinds) vs CTO and default to America/Denver', async () => {
  const db = new EnterpriseTestDb();
  const srv = await startServer({
    db,
    calendarService: new GoogleCalendarService('', ''),
  });

  const targetDate = getNextBusinessDayIso(5);

  try {
    // Availability defaults to America/Denver (Cheyenne, Wyoming HQ)
    const availRes = await fetch(`${srv.baseUrl}/api/appointments/availability?date=${targetDate}`);
    assert.equal(availRes.status, 200);
    const availJson = await availRes.json();
    assert.equal(availJson.timezone, 'America/Denver');

    // Invalid executive pathway rejected with 400
    const badPathway = await fetch(`${srv.baseUrl}/api/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Test Client',
        email: 'client@corp.com',
        phone: '+1 307 555 0100',
        companyName: 'Test Corp',
        executivePathway: 'invalid_exec',
        consultationType: 'video',
        scheduledDate: targetDate,
        scheduledTimeSlot: '09:00 AM - 09:30 AM',
      }),
    });
    assert.equal(badPathway.status, 400);

    // CEO Consultation booking
    const ceoRes = await fetch(`${srv.baseUrl}/api/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Victoria Sterling',
        email: 'victoria@sterlinggroup.com',
        phone: '+1 307 555 0199',
        companyName: 'Sterling Holdings',
        executivePathway: 'ceo',
        consultationType: 'video',
        scheduledDate: targetDate,
        scheduledTimeSlot: '09:00 AM - 09:30 AM',
      }),
    });
    assert.equal(ceoRes.status, 201);
    const ceoJson = await ceoRes.json();
    assert.equal(ceoJson.appointment.executivePathway, 'ceo');
    assert.ok(ceoJson.appointment.assignedConsultant.includes(corporateIdentity.leadership.ceo.name));
    assert.equal(ceoJson.appointment.clientTimezone, 'America/Denver');

    // CTO Consultation booking
    const ctoRes = await fetch(`${srv.baseUrl}/api/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Marcus Chen',
        email: 'marcus@fintech-scale.io',
        phone: '+1 415 555 0144',
        companyName: 'FinTech Scale',
        executivePathway: 'cto',
        consultationType: 'video',
        scheduledDate: targetDate,
        scheduledTimeSlot: '11:00 AM - 11:30 AM',
      }),
    });
    assert.equal(ctoRes.status, 201);
    const ctoJson = await ctoRes.json();
    assert.equal(ctoJson.appointment.executivePathway, 'cto');
    assert.ok(ctoJson.appointment.assignedConsultant.includes(corporateIdentity.leadership.cto.name));
  } finally {
    await srv.close();
  }
});

test('6. Gemini Neural TTS WAV header integrity prevents double-wrapping and wraps raw PCM cleanly', async () => {
  // Build a genuine minimal RIFF/WAVE payload to simulate Gemini returning encoded WAV
  const preEncodedWav = Buffer.alloc(48);
  preEncodedWav.write('RIFF', 0);
  preEncodedWav.writeUInt32LE(40, 4);
  preEncodedWav.write('WAVE', 8);

  const mockWavGemini = {
    models: {
      generateContent: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: preEncodedWav.toString('base64'),
                    mimeType: 'audio/wav',
                  },
                },
              ],
            },
          },
        ],
      }),
    },
  } as any;

  const wavSrv = await startServer({
    db: new EnterpriseTestDb(),
    geminiClient: mockWavGemini,
  });

  try {
    const res = await fetch(`${wavSrv.baseUrl}/api/voice/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Welcome to Destria Tech Inc.' }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    const outBuf = Buffer.from(json.audioBase64, 'base64');
    assert.equal(outBuf.length, preEncodedWav.length, 'Pre-encoded WAV must not be double-wrapped');
    assert.equal(outBuf.toString('ascii', 0, 4), 'RIFF');
    assert.equal(outBuf.toString('ascii', 8, 12), 'WAVE');
  } finally {
    await wavSrv.close();
  }

  // Simulate raw PCM payload (no RIFF header) -> should wrap with single 44-byte RIFF/WAVE header
  const rawPcm = Buffer.alloc(32, 0x01);
  const mockPcmGemini = {
    models: {
      generateContent: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: rawPcm.toString('base64'),
                    mimeType: 'audio/L16;rate=24000',
                  },
                },
              ],
            },
          },
        ],
      }),
    },
  } as any;

  const pcmSrv = await startServer({
    db: new EnterpriseTestDb(),
    geminiClient: mockPcmGemini,
  });

  try {
    const res = await fetch(`${pcmSrv.baseUrl}/api/voice/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Welcome to Destria Tech Inc.' }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    const outBuf = Buffer.from(json.audioBase64, 'base64');
    assert.equal(outBuf.length, 44 + rawPcm.length, 'Raw PCM must be wrapped with single 44-byte WAV header');
    assert.equal(outBuf.toString('ascii', 0, 4), 'RIFF');
    assert.equal(outBuf.toString('ascii', 8, 12), 'WAVE');
  } finally {
    await pcmSrv.close();
  }
});

test('7. Static codebase invariants: zero legacy API URLs, clean /portal/documents route, ErrorBoundary, and migration 003', () => {
  const apiClient = fs.readFileSync(path.resolve('src/lib/apiClient.ts'), 'utf8');
  assert.equal(apiClient.includes('api.ophireummultimedia.com'), false);
  assert.ok(apiClient.includes('https://api.destriatech.com'));

  const manifest = JSON.parse(fs.readFileSync(path.resolve('src/config/routeManifest.json'), 'utf8'));
  assert.ok(manifest.portalStaticRoutes.includes('/portal/documents'));

  const appTsx = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
  assert.ok(appTsx.includes('ErrorBoundary'));

  const migration003 = fs.readFileSync(
    path.resolve('supabase/migrations/003_enterprise_portal_stabilization.sql'),
    'utf8'
  );
  assert.ok(migration003.includes('CREATE TABLE IF NOT EXISTS public.portal_auth_users'));
  assert.ok(migration003.includes('CREATE TABLE IF NOT EXISTS public.portal_sessions'));
  assert.ok(migration003.includes('executive_pathway'));
  assert.equal(/\bDROP\s+TABLE\b/i.test(migration003), false, 'Migration 003 must be non-destructive');
});
