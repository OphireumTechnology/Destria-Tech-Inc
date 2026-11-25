import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WsClient from 'ws';
import { createApp } from '../src/server/app';
import { attachVoiceLiveBridge, VOICE_LIVE_WS_PATH } from '../src/server/voiceLiveBridge';
import { AiRuntimeConfigRegistry } from '../src/server/aiRuntimeConfig';
import {
  AppointmentRecord,
  AuditLogRecord,
  CreateAppointmentInput,
  CreateOutboxInput,
  CreateSolutionRequestInput,
  DatabaseRepository,
  EmailOutboxRecord,
  SolutionRequestRecord,
} from '../src/server/db/types';

function createMinimalMemoryDb() {
  const inquiries: SolutionRequestRecord[] = [];
  const appointments: AppointmentRecord[] = [];
  const outbox: EmailOutboxRecord[] = [];
  const auditLogs: AuditLogRecord[] = [];

  const db: DatabaseRepository = {
    isConfigured: true,
    async ping() {
      return { ok: true, configured: true, latencyMs: 1 };
    },
    async findSolutionRequestByIdempotencyKey(key: string) {
      return inquiries.find((i) => i.idempotencyKey === key) || null;
    },
    async createSolutionRequest(input: CreateSolutionRequestInput) {
      const now = new Date().toISOString();
      const record: SolutionRequestRecord = {
        ...input,
        id: `sol-${inquiries.length + 1}`,
        sourceChannel: input.sourceChannel || 'AI Chat',
        status: 'submitted',
        emailDeliveryStatus: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      inquiries.push(record);
      return { record, created: true };
    },
    async updateSolutionRequestEmailStatus(ref, status) {
      const item = inquiries.find((i) => i.referenceCode === ref);
      if (item) item.emailDeliveryStatus = status;
    },
    async listSolutionRequests() {
      return { records: [...inquiries], total: inquiries.length };
    },
    async getBookedSlotsForDate() {
      return [];
    },
    async createAppointment(input: CreateAppointmentInput) {
      const now = new Date().toISOString();
      const record: AppointmentRecord = {
        ...input,
        id: `apt-${appointments.length + 1}`,
        createdAt: now,
        updatedAt: now,
      };
      appointments.push(record);
      return { record, created: true };
    },
    async getAppointmentByReference(ref: string) {
      return appointments.find((a) => a.referenceCode === ref) || null;
    },
    async updateAppointment(ref, patch) {
      const item = appointments.find((a) => a.referenceCode === ref);
      if (!item) throw new Error(`Appointment ${ref} not found`);
      Object.assign(item, patch);
      return item;
    },
    async listAppointments() {
      return { records: [...appointments], total: appointments.length };
    },
    async createOutboxRecord(input: CreateOutboxInput) {
      const now = new Date().toISOString();
      const record: EmailOutboxRecord = {
        ...input,
        id: `out-${outbox.length + 1}`,
        provider: 'resend',
        status: 'queued',
        deliveryAttempts: 0,
        createdAt: now,
        updatedAt: now,
      };
      outbox.push(record);
      return { record, created: true };
    },
    async updateOutboxStatus(id, patch) {
      const rec = outbox.find((o) => o.id === id);
      if (rec) Object.assign(rec, patch);
    },
    async listRetryableOutbox() {
      return [];
    },
    async listOutboxByEntity(entityType, entityReference) {
      return outbox.filter((o) => o.entityType === entityType && o.entityReference === entityReference);
    },
    async findOutboxByProviderReference(providerReference) {
      return outbox.find((o) => o.providerReference === providerReference) || null;
    },
    async writeAuditLog(entry) {
      auditLogs.push({
        ...entry,
        id: `aud-${auditLogs.length + 1}`,
        createdAt: new Date().toISOString(),
      });
    },
    async listAuditLogs() {
      return { records: [...auditLogs], total: auditLogs.length };
    },
    async findActiveAdminByEmail() {
      return null;
    },
    async verifySupabaseUserToken() {
      return null;
    },
  };

  return { db, inquiries, appointments, outbox };
}

describe('DESTRIA Security Hardening & Live Resilience Regression Suite', () => {
  it('PoC 1: Rejects X-Forwarded-For spoofing attempts against Express rate limiting', async () => {
    const { db } = createMinimalMemoryDb();
    const { app } = createApp({
      db,
      geminiClient: null,
      rateLimitMaxOverride: 2,
    });
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      // Send 3 requests with rotating forged leftmost X-Forwarded-For values from the same local socket
      const statuses: number[] = [];
      for (let i = 1; i <= 3; i++) {
        const res = await fetch(`${baseUrl}/api/consultant/confirm-tool`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': `198.51.100.${i}, 127.0.0.1`,
          },
          body: JSON.stringify({
            sessionId: 'dti-rate-limit-test',
            confirmationToken: 'invalid-token',
            kind: 'inquiry',
            clientConfirmed: true,
          }),
        });
        statuses.push(res.status);
      }

      // First two hit handler (400 invalid token); third MUST be blocked (429) despite spoofed leftmost IP!
      assert.equal(statuses[0], 400);
      assert.equal(statuses[1], 400);
      assert.equal(statuses[2], 429, 'Spoofed leftmost X-Forwarded-For must NOT bypass rate limiting');
    } finally {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('PoC 2: Blocks cross-session confirmation token hijacking and enforces single-use replay protection', async () => {
    const { db, inquiries } = createMinimalMemoryDb();
    const { app, aiToolsExecutor } = createApp({ db, geminiClient: null });

    const sessionA = 'dti-session-owner-a';
    const sessionB = 'dti-session-attacker-b';

    const prepared = await aiToolsExecutor.executeTool(sessionA, 'prepare_service_inquiry', {
      fullName: 'Elena Cruz',
      company: 'Pacific Energy Systems',
      email: 'elena.cruz@pacificenergy.example',
      contactNumber: '+1 (307) 555-0199',
      serviceTitle: 'AI Solutions & AI Agents',
      projectDescription: 'Automated compliance reporting workflow across regional grid hubs.',
    });
    assert.equal(prepared.ok, true);
    const token = String(prepared.data.confirmationToken);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      // Attacker in sessionB attempts to confirm sessionA's token -> MUST fail
      const hijackRes = await fetch(`${baseUrl}/api/consultant/confirm-tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionB,
          confirmationToken: token,
          kind: 'inquiry',
          clientConfirmed: true,
        }),
      });
      assert.equal(hijackRes.status, 400, 'Cross-session confirmation token must be rejected');
      assert.equal(inquiries.length, 0);

      // Legitimate owner in sessionA confirms -> succeeds once
      const okRes = await fetch(`${baseUrl}/api/consultant/confirm-tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionA,
          confirmationToken: token,
          kind: 'inquiry',
          clientConfirmed: true,
        }),
      });
      assert.equal(okRes.status, 200);
      assert.equal(inquiries.length, 1);

      // Replay in sessionA -> rejected
      const replayRes = await fetch(`${baseUrl}/api/consultant/confirm-tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionA,
          confirmationToken: token,
          kind: 'inquiry',
          clientConfirmed: true,
        }),
      });
      assert.equal(replayRes.status, 400);
      assert.equal(inquiries.length, 1);
    } finally {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('PoC 3: Handles Gemini Live connect() failures and disconnect-during-init races without leaks or hangs', async () => {
    const { db } = createMinimalMemoryDb();
    const runtimeConfig = new AiRuntimeConfigRegistry({
      env: { GEMINI_LIVE_ENABLED: 'true', GEMINI_LIVE_MODEL: 'gemini-3.8-live', GEMINI_VOICE_NAME: 'Kore' },
      geminiConfiguredOverride: true,
    });

    // Case A: Upstream connect() rejects
    const failingAi: any = {
      live: {
        connect: async () => {
          throw new Error('Simulated upstream Gemini Live 503');
        },
      },
    };
    const { app: failApp, aiToolsExecutor: failTools } = createApp({
      db,
      geminiClient: failingAi,
      aiRuntimeConfig: runtimeConfig,
    });
    const failServer = http.createServer(failApp);
    const failBridge = attachVoiceLiveBridge(failServer, {
      ai: failingAi,
      runtimeConfig,
      toolsExecutor: failTools,
      allowedOrigins: ['https://destriatech.com'],
    });
    await new Promise<void>((resolve) => failServer.listen(0, '127.0.0.1', () => resolve()));
    const failPort = (failServer.address() as { port: number }).port;

    try {
      const received: any[] = [];
      const ws = new WsClient(`ws://127.0.0.1:${failPort}${VOICE_LIVE_WS_PATH}`, {
        origin: 'https://destriatech.com',
      });
      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => resolve());
        ws.on('error', reject);
      });
      const closedPromise = new Promise<void>((resolve) => ws.on('close', () => resolve()));
      ws.on('message', (raw) => received.push(JSON.parse(raw.toString())));
      ws.send(JSON.stringify({ type: 'init', sessionId: 'dti-fail-test-01', language: 'en-US' }));
      await closedPromise;

      assert.ok(
        received.some((m) => m.type === 'error' && m.code === 'LIVE_CONNECT_FAILED'),
        'Failed upstream connect() must emit LIVE_CONNECT_FAILED'
      );
      assert.equal(runtimeConfig.listActiveSessions().length, 0, 'Failed connect() must leave 0 active sessions');
    } finally {
      failBridge.close();
      failServer.closeAllConnections?.();
      await new Promise<void>((resolve) => failServer.close(() => resolve()));
    }

    // Case B: Client disconnects while ai.live.connect() is still pending -> upstream session must be closed immediately
    const pendingResolver: { fn: ((val: any) => void) | null } = { fn: null };
    let upstreamClosed = false;
    const slowAi: any = {
      live: {
        connect: () =>
          new Promise((resolve) => {
            pendingResolver.fn = resolve;
          }),
      },
    };
    const { app: slowApp, aiToolsExecutor: slowTools } = createApp({
      db,
      geminiClient: slowAi,
      aiRuntimeConfig: runtimeConfig,
    });
    const slowServer = http.createServer(slowApp);
    const slowBridge = attachVoiceLiveBridge(slowServer, {
      ai: slowAi,
      runtimeConfig,
      toolsExecutor: slowTools,
      allowedOrigins: ['https://destriatech.com'],
    });
    await new Promise<void>((resolve) => slowServer.listen(0, '127.0.0.1', () => resolve()));
    const slowPort = (slowServer.address() as { port: number }).port;

    try {
      const ws = new WsClient(`ws://127.0.0.1:${slowPort}${VOICE_LIVE_WS_PATH}`, {
        origin: 'https://destriatech.com',
      });
      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => resolve());
        ws.on('error', reject);
      });
      ws.send(JSON.stringify({ type: 'init', sessionId: 'dti-race-test-01', language: 'en-US' }));
      // Wait briefly for connect() to start, then disconnect client before connect() resolves
      await new Promise((r) => setTimeout(r, 30));
      ws.close();
      await new Promise((r) => setTimeout(r, 30));

      assert.ok(pendingResolver.fn, 'Expected connect() to be pending');
      pendingResolver.fn({
        sendRealtimeInput: () => {},
        sendToolResponse: () => {},
        close: () => {
          upstreamClosed = true;
        },
      });
      await new Promise((r) => setTimeout(r, 40));

      assert.equal(upstreamClosed, true, 'Upstream live session must be closed immediately if client disconnected during init');
      assert.equal(runtimeConfig.listActiveSessions().length, 0, 'Disconnected init race must leave 0 active sessions');
    } finally {
      slowBridge.close();
      slowServer.closeAllConnections?.();
      await new Promise<void>((resolve) => slowServer.close(() => resolve()));
    }
  });
});
