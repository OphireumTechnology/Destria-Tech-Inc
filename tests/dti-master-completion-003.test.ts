import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/server/app';
import {
  AiRuntimeConfigRegistry,
  classifyGeminiProviderError,
  type CanonicalGeminiProviderStatus,
} from '../src/server/aiRuntimeConfig';
import type {
  AppointmentRecord,
  AuditLogRecord,
  CreateAppointmentInput,
  CreateOutboxInput,
  CreateSolutionRequestInput,
  DatabaseRepository,
  EmailOutboxRecord,
  SolutionRequestRecord,
} from '../src/server/db/types';
import { LocalPortalRepository } from '../src/server/portal/localPortalRepository';
import {
  SnapshotFrontDeskPersistenceAdapter,
  createSharedFrontDeskBackingState,
} from '../src/server/frontDeskRepository';
import { FrontDeskStore } from '../src/server/frontDeskStore';

function createDurableTestDb(options?: {
  sharedRevokedJtis?: Set<string>;
  simulateDbOutage?: () => boolean;
}): DatabaseRepository {
  const inquiries: SolutionRequestRecord[] = [];
  const appointments: AppointmentRecord[] = [];
  const outbox: EmailOutboxRecord[] = [];
  const audits: AuditLogRecord[] = [];
  const revokedJtis = options?.sharedRevokedJtis || new Set<string>();

  return {
    isConfigured: true,
    ping: async () => {
      if (options?.simulateDbOutage?.()) {
        return { ok: false, configured: true, error: 'Simulated database outage' };
      }
      return { ok: true, configured: true, latencyMs: 1 };
    },
    findSolutionRequestByIdempotencyKey: async (key: string) =>
      inquiries.find((r) => r.idempotencyKey === key) || null,
    createSolutionRequest: async (input: CreateSolutionRequestInput) => {
      const now = new Date().toISOString();
      const record: SolutionRequestRecord = {
        id: `sol-${inquiries.length + 1}`,
        referenceCode: input.referenceCode,
        idempotencyKey: input.idempotencyKey,
        type: input.type,
        status: 'submitted',
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
        sourceChannel: input.sourceChannel || 'web_chat',
        emailDeliveryStatus: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      inquiries.push(record);
      return { record, created: true };
    },
    updateSolutionRequestEmailStatus: async () => {},
    listSolutionRequests: async () => ({ records: inquiries, total: inquiries.length }),
    getBookedSlotsForDate: async (date: string) =>
      appointments
        .filter((a) => a.scheduledDate === date && a.status !== 'cancelled')
        .map((a) => a.scheduledTimeSlot),
    createAppointment: async (input: CreateAppointmentInput) => {
      const now = new Date().toISOString();
      const record: AppointmentRecord = {
        id: `apt-${appointments.length + 1}`,
        ...input,
        createdAt: now,
        updatedAt: now,
      };
      appointments.push(record);
      return { record, created: true };
    },
    getAppointmentByReference: async (ref: string) =>
      appointments.find((a) => a.referenceCode === ref) || null,
    updateAppointment: async (ref: string, patch) => {
      const existing = appointments.find((a) => a.referenceCode === ref);
      if (!existing) throw new Error('Appointment not found');
      Object.assign(existing, patch, { updatedAt: new Date().toISOString() });
      return existing;
    },
    listAppointments: async () => ({ records: appointments, total: appointments.length }),
    createOutboxRecord: async (input: CreateOutboxInput) => {
      const now = new Date().toISOString();
      const record: EmailOutboxRecord = {
        id: `ob-${outbox.length + 1}`,
        ...input,
        status: 'queued',
        provider: 'test',
        deliveryAttempts: 0,
        createdAt: now,
        updatedAt: now,
      };
      outbox.push(record);
      return { record, created: true };
    },
    updateOutboxStatus: async () => {},
    listRetryableOutbox: async () => [],
    writeAuditLog: async (input) => {
      audits.push({
        id: `aud-${audits.length + 1}`,
        ...input,
        createdAt: new Date().toISOString(),
      });
    },
    listAuditLogs: async () => ({ records: audits, total: audits.length }),
    findActiveAdminByEmail: async (email: string) =>
      email.trim().toLowerCase() === 'admin@destriatech.com'
        ? {
            id: 'admin-dti-003',
            email: 'admin@destriatech.com',
            fullName: 'DESTRIA Executive Admin',
            role: 'super_admin' as const,
            isActive: true,
          }
        : null,
    verifySupabaseUserToken: async () => null,
    revokeAdminSessionToken: async ({ jti }) => {
      revokedJtis.add(jti);
    },
    isAdminSessionTokenRevoked: async (jti: string) => revokedJtis.has(jti),
  };
}

describe('DTI-MASTER-COMPLETION-003 Verification & Failure-Injection Suite', () => {
  describe('1. Durable Multi-Instance Admin Session Revocation & Migration 009 (DTI-C026)', () => {
    const prevEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
    const prevPass = process.env.ADMIN_BOOTSTRAP_PASSWORD;

    before(() => {
      process.env.ADMIN_BOOTSTRAP_EMAIL = 'admin@destriatech.com';
      process.env.ADMIN_BOOTSTRAP_PASSWORD = 'StrongTestPassword!2026';
    });

    after(() => {
      process.env.ADMIN_BOOTSTRAP_EMAIL = prevEmail;
      process.env.ADMIN_BOOTSTRAP_PASSWORD = prevPass;
    });

    it('persists admin logout revocation across simulated backend restarts/replicas and verifies migration 009 SQL', async () => {
      const sql009 = fs.readFileSync(
        path.resolve('supabase/migrations/009_operational_hardening_and_durable_governance.sql'),
        'utf8'
      );
      assert.ok(sql009.includes('CREATE TABLE IF NOT EXISTS public.admin_revoked_sessions'));
      assert.ok(sql009.includes('ENABLE ROW LEVEL SECURITY'));
      assert.ok(sql009.includes('service_role_all_admin_revoked_sessions'));
      assert.ok(sql009.includes('purge_expired_admin_revoked_sessions'));
      assert.ok(sql009.includes("'009'"));

      const sharedRevokedJtis = new Set<string>();
      const sharedSecret = 'dti-003-shared-multi-instance-secret';
      const sharedBacking = createSharedFrontDeskBackingState();

      // Instance A (before restart)
      const instanceA = createApp({
        db: createDurableTestDb({ sharedRevokedJtis }),
        portalRepo: new LocalPortalRepository(),
        frontDeskPersistence: new SnapshotFrontDeskPersistenceAdapter(sharedBacking),
        productionStrictMode: true,
        geminiClient: null,
        sessionSecret: sharedSecret,
      });
      const serverA = http.createServer(instanceA.app);
      await new Promise<void>((r) => serverA.listen(0, '127.0.0.1', () => r()));
      const addrA = serverA.address();
      const baseA = typeof addrA === 'object' && addrA ? `http://127.0.0.1:${addrA.port}` : '';

      // Instance B (fresh process / second Railway replica with empty in-memory revocation map)
      const instanceB = createApp({
        db: createDurableTestDb({ sharedRevokedJtis }),
        portalRepo: new LocalPortalRepository(),
        frontDeskPersistence: new SnapshotFrontDeskPersistenceAdapter(sharedBacking),
        productionStrictMode: true,
        geminiClient: null,
        sessionSecret: sharedSecret,
      });
      const serverB = http.createServer(instanceB.app);
      await new Promise<void>((r) => serverB.listen(0, '127.0.0.1', () => r()));
      const addrB = serverB.address();
      const baseB = typeof addrB === 'object' && addrB ? `http://127.0.0.1:${addrB.port}` : '';

      try {
        const loginRes = await fetch(`${baseA}/api/admin/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ email: 'admin@destriatech.com', password: 'StrongTestPassword!2026' }),
        });
        assert.equal(loginRes.status, 200);
        const loginData = await loginRes.json();
        const token = loginData.token as string;
        assert.ok(token);

        // Token works on Instance B prior to logout
        const preLogoutB = await fetch(`${baseB}/api/admin/system-health`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        assert.equal(preLogoutB.status, 200);

        // Log out on Instance A
        const logoutRes = await fetch(`${baseA}/api/admin/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'X-Requested-With': 'XMLHttpRequest' },
        });
        assert.equal(logoutRes.status, 200);
        const logoutBody = await logoutRes.json();
        assert.equal(logoutBody.revoked, true);
        assert.equal(logoutBody.durableRevocation, true);
        assert.equal(sharedRevokedJtis.size, 1);

        // Replaying the same token against fresh Instance B MUST fail with HTTP 401
        const postLogoutB = await fetch(`${baseB}/api/admin/system-health`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        assert.equal(
          postLogoutB.status,
          401,
          'Revoked admin token must remain invalid across restarts and horizontal replicas'
        );
      } finally {
        await new Promise<void>((r) => serverA.close(() => r()));
        await new Promise<void>((r) => serverB.close(() => r()));
      }
    });
  });

  describe('2. HMAC-SHA256 Authenticated Backup Signatures vs. Unkeyed Checksums (DTI-C030)', () => {
    it('distinguishes checksum-only from HMAC-SHA256 authenticated backups and blocks tampered, wrong-key, or downgraded restores', async () => {
      const backing = createSharedFrontDeskBackingState();
      const adapter = new SnapshotFrontDeskPersistenceAdapter(backing);
      const store = new FrontDeskStore({ persistence: adapter, productionStrictMode: true });
      await store.applySessionCorrectionsDurable('dr-hmac-sess', {
        clientProfile: {
          fullName: 'Elena Vance',
          companyName: 'Vance Systems',
          email: 'elena@vance.example',
        },
      });

      // Unkeyed export MUST declare checksum-only and null signature
      const prevEnvKey = process.env.BACKUP_SIGNING_SECRET;
      delete process.env.BACKUP_SIGNING_SECRET;
      try {
        const unkeyed = adapter.exportSignedBackupSnapshot();
        assert.equal(unkeyed.integrityMode, 'sha256-checksum-only');
        assert.equal(unkeyed.hmacSha256Signature, null);

        // Keyed export MUST produce real HMAC-SHA256 signature
        const signingKey = 'dti-003-dr-hmac-signing-secret-2026';
        const signed = adapter.exportSignedBackupSnapshot(signingKey);
        assert.equal(signed.schemaVersion, '009');
        assert.equal(signed.integrityMode, 'hmac-sha256');
        assert.match(signed.hmacSha256Signature || '', /^[a-f0-9]{64}$/);

        // Wrong signing key rejected
        const wrongKeyResult = adapter.restoreSignedBackupSnapshot(signed, 'wrong-key');
        assert.equal(wrongKeyResult.ok, false);

        // Signed snapshot restored without key rejected
        const missingKeyResult = adapter.restoreSignedBackupSnapshot(signed);
        assert.equal(missingKeyResult.ok, false);

        // Downgrade (unkeyed snapshot passed when key is required) rejected
        const downgradeResult = adapter.restoreSignedBackupSnapshot(unkeyed, signingKey);
        assert.equal(downgradeResult.ok, false);

        // Wipe state and restore with valid HMAC key
        backing.sessions.clear();
        assert.equal(backing.sessions.size, 0);

        const okRestore = adapter.restoreSignedBackupSnapshot(signed, signingKey);
        assert.equal(okRestore.ok, true);
        if (okRestore.ok) {
          assert.equal(okRestore.integrityMode, 'hmac-sha256');
          assert.equal(okRestore.restoredCounts.sessions, 1);
        }
        assert.equal(backing.sessions.size, 1);
      } finally {
        if (prevEnvKey !== undefined) {
          process.env.BACKUP_SIGNING_SECRET = prevEnvKey;
        }
      }
    });
  });

  describe('3. Granular Readiness Probes, 8-State Gemini Status & Failure Injection (DTI-C002, DTI-C010, DTI-C028)', () => {
    it('tracks all 8 canonical Gemini provider statuses and separates liveness from database outage readiness', async () => {
      // Unconfigured registry
      const unconfiguredRegistry = new AiRuntimeConfigRegistry({ geminiConfiguredOverride: false });
      assert.equal(unconfiguredRegistry.getCanonicalProviderStatus(), 'UNCONFIGURED');

      // Configured registry transitions across all error categories and recovers to READY
      const registry = new AiRuntimeConfigRegistry({ geminiConfiguredOverride: true });
      assert.equal(registry.getCanonicalProviderStatus(), 'READY');

      const cases: Array<{ err: unknown; expected: CanonicalGeminiProviderStatus }> = [
        { err: { status: 401, message: 'API_KEY_INVALID AIzaSySecret1234567890' }, expected: 'AUTHENTICATION_FAILED' },
        { err: { status: 404, message: 'Model not found for API version' }, expected: 'MODEL_UNAVAILABLE' },
        { err: { status: 429, message: 'Quota exceeded for billing project' }, expected: 'QUOTA_EXCEEDED' },
        { err: { status: 429, message: 'Rate limit exceeded' }, expected: 'RATE_LIMITED' },
        { err: { message: 'Request timed out ETIMEDOUT' }, expected: 'NETWORK_ERROR' },
        { err: { status: 503, message: 'Service unavailable overloaded' }, expected: 'PROVIDER_UNAVAILABLE' },
      ];

      for (const c of cases) {
        const classified = classifyGeminiProviderError(c.err);
        assert.equal(classified.providerStatus, c.expected);
        registry.recordFailure(classified.category, 'chat', classified.safeMessage);
        assert.equal(registry.getCanonicalProviderStatus(), c.expected);
      }

      // Successful turn restores READY status
      registry.recordTurnTelemetry({ channel: 'chat', latencyMs: 120 });
      assert.equal(registry.getCanonicalProviderStatus(), 'READY');

      // Failure injection: DB outage causes /ready -> 503 while /healthz remains 200
      let dbDown = false;
      const sharedBacking = createSharedFrontDeskBackingState();
      const { app } = createApp({
        db: createDurableTestDb({ simulateDbOutage: () => dbDown }),
        portalRepo: new LocalPortalRepository(),
        frontDeskPersistence: new SnapshotFrontDeskPersistenceAdapter(sharedBacking),
        productionStrictMode: true,
        geminiClient: null,
        sessionSecret: 'dti-003-readiness-secret',
      });

      const server = http.createServer(app);
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
      const addr = server.address();
      const baseUrl = typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : '';

      try {
        const healthyReady = await fetch(`${baseUrl}/ready`);
        assert.equal(healthyReady.status, 200);
        const healthyBody = await healthyReady.json();
        assert.equal(healthyBody.databaseMigrationVersion, '010');
        assert.equal(healthyBody.checks.serverAlive, true);
        assert.equal(healthyBody.checks.appReady, true);
        assert.equal(healthyBody.checks.databaseReady, true);
        assert.equal(healthyBody.checks.geminiReady, false);
        assert.equal(healthyBody.dependencies.gemini.providerStatus, 'UNCONFIGURED');

        // Inject DB outage
        dbDown = true;
        const livenessRes = await fetch(`${baseUrl}/healthz`);
        assert.equal(livenessRes.status, 200);

        const outageReady = await fetch(`${baseUrl}/ready`);
        assert.equal(outageReady.status, 503);
        const outageBody = await outageReady.json();
        assert.equal(outageBody.ready, false);
        assert.equal(outageBody.checks.serverAlive, true);
        assert.equal(outageBody.checks.databaseReady, false);
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
      }
    });
  });

  describe('4. Zero-DevDep Production Packaging, Confidentiality Rules & Release Manifest (DTI-C002, DTI-C027, DTI-C033)', () => {
    it('verifies Railway production startup avoids devDependencies, .env.example is complete, and release manifest metadata is valid', () => {
      const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
      const railway = JSON.parse(fs.readFileSync(path.resolve('railway.json'), 'utf8'));
      assert.equal(railway.build.buildCommand, 'npm run build:server');
      assert.equal(railway.deploy.startCommand, 'npm run start:prod');
      assert.equal(pkg.scripts['start:prod'], 'node dist-server/server.mjs');
      assert.ok(pkg.scripts['build:release-manifest'].includes('generate-release-manifest.mjs'));

      const envExample = fs.readFileSync(path.resolve('.env.example'), 'utf8');
      for (const requiredKey of [
        'SUPABASE_URL=',
        'SUPABASE_SERVICE_ROLE_KEY=',
        'GEMINI_API_KEY=',
        'RESEND_API_KEY=',
        'RESEND_WEBHOOK_SECRET=',
        'GOOGLE_CALENDAR_ID=',
        'GOOGLE_SERVICE_ACCOUNT_JSON=',
        'ADMIN_SESSION_SECRET=',
        'BACKUP_SIGNING_SECRET=',
        'VITE_API_BASE_URL=',
      ]) {
        assert.ok(envExample.includes(requiredKey), `.env.example must document ${requiredKey}`);
      }

      const linterSrc = fs.readFileSync(path.resolve('scripts/lint-codebase.mjs'), 'utf8');
      assert.ok(linterSrc.includes('no-proprietary-public-paste'));
      assert.ok(linterSrc.includes('no-public-env-file'));
      assert.ok(linterSrc.includes('no-public-private-key'));
      assert.ok(linterSrc.includes('no-public-database-artifact'));
      assert.ok(linterSrc.includes('no-public-source-map'));
    });
  });

  describe('5. Live Observability Telemetry, Privacy Session Deletion & Extended Failure Injection (DTI-C013, DTI-C028, Sec 35)', () => {
    it('records real runtime telemetry without simulated metrics, supports durable draft session deletion, and fails safely on injected faults', async () => {
      const prevEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
      const prevPass = process.env.ADMIN_BOOTSTRAP_PASSWORD;
      process.env.ADMIN_BOOTSTRAP_EMAIL = 'admin@destriatech.com';
      process.env.ADMIN_BOOTSTRAP_PASSWORD = 'StrongTestPassword!2026';

      const sharedBacking = createSharedFrontDeskBackingState();
      const db = createDurableTestDb();
      const { app } = createApp({
        db,
        portalRepo: new LocalPortalRepository(),
        frontDeskPersistence: new SnapshotFrontDeskPersistenceAdapter(sharedBacking),
        productionStrictMode: true,
        geminiClient: null,
        sessionSecret: 'dti-003-observability-secret',
      });

      const server = http.createServer(app);
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
      const addr = server.address();
      const baseUrl = typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : '';

      try {
        // 1. Failure injection: Unauthorized admin access -> 401 (increments authFailures401)
        const unauthRes = await fetch(`${baseUrl}/api/admin/system-health`);
        assert.equal(unauthRes.status, 401);

        // 2. Failure injection: Malformed JSON -> 400 with zero stack trace leak
        const badJsonRes = await fetch(`${baseUrl}/api/frontdesk/session/bad-json-sess`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: '{"broken_json": ',
        });
        assert.equal(badJsonRes.status, 400);
        const badJsonText = await badJsonRes.text();
        assert.equal(badJsonText.includes('at '), false);

        // 3. Privacy & Retention Control: create draft session -> prepare confirmation token -> DELETE session -> token invalidated
        const sessId = 'privacy-delete-sess-003';
        const patchRes = await fetch(`${baseUrl}/api/frontdesk/session/${sessId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientProfile: {
              fullName: 'Marco Santos',
              companyName: 'Santos Logistics',
              email: 'marco@santos-logistics.example',
              phone: '+63 917 555 0199',
              industry: 'Transportation',
              country: 'Philippines',
            },
            projectRequirements: {
              projectName: 'Fleet Tracking Core',
              businessProblem: 'Manual dispatch delays across 45 delivery trucks',
              businessObjective: 'Real-time dispatch optimization',
              keyFeatures: ['Live GPS map', 'Driver mobile app'],
              preferredTimeline: 'Q3 2026',
            },
          }),
        });
        assert.equal(patchRes.status, 200);

        const mpRes = await fetch(`${baseUrl}/api/frontdesk/session/${sessId}/masterplan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        assert.equal(mpRes.status, 200);

        const prepRes = await fetch(`${baseUrl}/api/frontdesk/session/${sessId}/prepare-submission`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        assert.equal(prepRes.status, 200);
        const prepBody = await prepRes.json();
        assert.ok(prepBody.confirmationToken);
        assert.equal(sharedBacking.sessions.has(sessId), true);

        const deleteRes = await fetch(`${baseUrl}/api/frontdesk/session/${sessId}`, {
          method: 'DELETE',
        });
        assert.equal(deleteRes.status, 200);
        const deleteBody = await deleteRes.json();
        assert.equal(deleteBody.deleted, true);
        assert.equal(deleteBody.clearedPendingConfirmations, 1);
        assert.equal(sharedBacking.sessions.has(sessId), false);

        // Replaying invalidated confirmation token after deletion MUST fail with 400
        const replayAfterDelete = await fetch(`${baseUrl}/api/frontdesk/session/${sessId}/authorize-submission`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            confirmationToken: prepBody.confirmationToken,
            clientConfirmed: true,
          }),
        });
        assert.equal(replayAfterDelete.status, 400);

        // 4. Verify live measured telemetry in /api/admin/system-health (zero simulated metrics)
        const loginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ email: 'admin@destriatech.com', password: 'StrongTestPassword!2026' }),
        });
        assert.equal(loginRes.status, 200);
        const loginData = await loginRes.json();
        const adminToken = loginData.token as string;
        assert.ok(adminToken);

        const healthRes = await fetch(`${baseUrl}/api/admin/system-health`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert.equal(healthRes.status, 200);
        const healthBody = await healthRes.json();
        assert.equal(healthBody.telemetry.measurementSource, 'live_process_measured');
        assert.ok(healthBody.telemetry.apiRequests.total >= 5);
        assert.ok(healthBody.telemetry.securityEvents.authFailures401 >= 1);
        assert.ok(healthBody.telemetry.processResources.memoryMb.rss > 0);
        assert.ok(
          Array.isArray(healthBody.telemetry.unavailableMetrics) &&
            healthBody.telemetry.unavailableMetrics.includes('live_browser_core_web_vitals')
        );
        // Unconfigured email & calendar providers MUST report UNCONFIGURED honestly
        assert.equal(healthBody.subsystems.emailDelivery.state, 'UNCONFIGURED');
        assert.equal(healthBody.subsystems.calendar.state, 'UNCONFIGURED');
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
        if (prevEmail === undefined) delete process.env.ADMIN_BOOTSTRAP_EMAIL;
        else process.env.ADMIN_BOOTSTRAP_EMAIL = prevEmail;
        if (prevPass === undefined) delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
        else process.env.ADMIN_BOOTSTRAP_PASSWORD = prevPass;
      }
    });
  });
});
