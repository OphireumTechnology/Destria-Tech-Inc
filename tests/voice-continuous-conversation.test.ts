import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocket as WsClient } from 'ws';
import { randomUUID } from 'node:crypto';
import type {
  AppointmentRecord,
  CreateAppointmentInput,
  CreateOutboxInput,
  CreateSolutionRequestInput,
  DatabaseRepository,
  EmailOutboxRecord,
  SolutionRequestRecord,
  UpdateOutboxPatch,
} from '../src/server/db/types';
import { createApp } from '../src/server/app';
import { attachVoiceLiveBridge, VOICE_LIVE_WS_PATH } from '../src/server/voiceLiveBridge';
import {
  AIVoiceService,
  VoiceSessionState,
  VoiceTurnMetrics,
  isValidVoiceTransition,
} from '../src/services/aiVoiceService';
import {
  buildDeduplicatedHistory,
  detectAffirmativeBookingIntent,
  extractPresentedOptionsFromText,
} from '../src/server/voiceContextEngine';

// ---------------------------------------------------------------------------
// Deterministic Browser Audio / Speech Test Harness (drives real AIVoiceService)
// ---------------------------------------------------------------------------

class FakeMediaStreamTrack {
  public readyState: 'live' | 'ended' = 'live';
  public enabled = true;
  public stopCalls = 0;
  public stop() {
    this.stopCalls += 1;
    this.readyState = 'ended';
  }
}

class FakeMediaStream {
  public readonly tracks: FakeMediaStreamTrack[];
  constructor() {
    this.tracks = [new FakeMediaStreamTrack()];
  }
  public getAudioTracks() {
    return this.tracks;
  }
  public getTracks() {
    return this.tracks;
  }
}

class FakeSpeechRecognition {
  public static instances: FakeSpeechRecognition[] = [];
  public continuous = false;
  public interimResults = false;
  public lang = 'en-US';
  public isRunning = false;
  public startCount = 0;
  public stopCount = 0;
  public abortCount = 0;

  public onstart: (() => void) | null = null;
  public onspeechstart: (() => void) | null = null;
  public onspeechend: (() => void) | null = null;
  public onresult: ((ev: any) => void) | null = null;
  public onnomatch: (() => void) | null = null;
  public onerror: ((ev: any) => void) | null = null;
  public onend: (() => void) | null = null;

  constructor() {
    FakeSpeechRecognition.instances.push(this);
  }

  public start() {
    if (this.isRunning) {
      const err: any = new Error('Recognition already started');
      err.name = 'InvalidStateError';
      throw err;
    }
    this.isRunning = true;
    this.startCount += 1;
    this.onstart?.();
  }

  public stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.stopCount += 1;
    this.onend?.();
  }

  public abort() {
    this.isRunning = false;
    this.abortCount += 1;
    this.onend?.();
  }

  public emitInterim(text: string) {
    this.onspeechstart?.();
    this.onresult?.({
      resultIndex: 0,
      results: [{ 0: { transcript: text }, isFinal: false }],
    });
  }

  public emitFinal(text: string) {
    this.onspeechstart?.();
    this.onresult?.({
      resultIndex: 0,
      results: [{ 0: { transcript: text }, isFinal: true }],
    });
    this.onspeechend?.();
  }

  public emitUnexpectedEnd() {
    this.isRunning = false;
    this.onend?.();
  }

  public emitError(errorCode: string) {
    this.onerror?.({ error: errorCode });
  }
}

class FakeUtterance {
  public text: string;
  public lang = 'en-US';
  public rate = 1;
  public pitch = 1;
  public voice: any = null;
  public onend: (() => void) | null = null;
  public onerror: ((ev: any) => void) | null = null;
  constructor(text = '') {
    this.text = text;
  }
}

class FakeSpeechSynthesis {
  public speaking = false;
  public spokenUtterances: FakeUtterance[] = [];
  public cancelCount = 0;
  public autoCompleteDelayMs = 4;
  public holdOpen = false;
  public shouldFailSpeak = false;
  private pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  public getVoices() {
    return [
      { name: 'Aria Natural', lang: 'en-US' },
      { name: 'Google US English', lang: 'en-US' },
    ];
  }

  public speak(utterance: FakeUtterance) {
    if (this.shouldFailSpeak) {
      utterance.onerror?.({ error: 'synthesis-failed' });
      return;
    }
    this.speaking = true;
    this.spokenUtterances.push(utterance);
    if (this.holdOpen) {
      return;
    }
    const timer = setTimeout(() => {
      this.pendingTimers.delete(timer);
      if (this.speaking) {
        this.speaking = false;
        utterance.onend?.();
      }
    }, this.autoCompleteDelayMs);
    this.pendingTimers.add(timer);
  }

  public cancel() {
    this.cancelCount += 1;
    this.speaking = false;
    for (const t of this.pendingTimers) {
      clearTimeout(t);
    }
    this.pendingTimers.clear();
  }

  public resume() {
    // No-op keepalive hook
  }
}

class FakeAudioContext {
  public state: 'running' | 'suspended' | 'closed' = 'running';
  public currentTime = 0;
  public sampleRate = 16000;
  public destination = {};
  public closedCount = 0;
  public decodedCount = 0;
  public activeSources: Array<{ stopped: boolean; onended: (() => void) | null }> = [];

  public async resume() {
    if (this.state === 'suspended') this.state = 'running';
  }

  public async close() {
    this.state = 'closed';
    this.closedCount += 1;
  }

  public createMediaStreamSource() {
    return { connect() {} };
  }

  public createAnalyser() {
    return {
      fftSize: 64,
      frequencyBinCount: 32,
      connect() {},
      getByteFrequencyData(arr: Uint8Array) {
        arr.fill(40);
      },
    };
  }

  public async decodeAudioData() {
    this.decodedCount += 1;
    return { duration: 0.05 };
  }

  public createBufferSource() {
    const src = {
      buffer: null as any,
      stopped: false,
      onended: null as (() => void) | null,
      connect() {},
      disconnect() {},
      start: () => {
        setTimeout(() => {
          if (!src.stopped) {
            src.onended?.();
          }
        }, 5);
      },
      stop: () => {
        src.stopped = true;
      },
    };
    this.activeSources.push(src);
    return src;
  }
}

function waitMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`);
    }
    await waitMs(8);
  }
}


/**
 * Isolated durable test double: exercises the genuine Express inquiry and
 * appointment contracts without contacting production Supabase or Resend.
 * These are application integration tests, not live provider acceptance.
 */
function createVoiceTestDatabase(): DatabaseRepository {
  const inquiries: SolutionRequestRecord[] = [];
  const appointments: AppointmentRecord[] = [];
  const outbox: EmailOutboxRecord[] = [];
  return {
    isConfigured: true,
    async ping() { return { ok: true, configured: true }; },
    async findSolutionRequestByIdempotencyKey(key: string) {
      return inquiries.find((record) => record.idempotencyKey === key) || null;
    },
    async createSolutionRequest(input: CreateSolutionRequestInput) {
      const existing = input.idempotencyKey
        ? inquiries.find((record) => record.idempotencyKey === input.idempotencyKey)
        : undefined;
      if (existing) return { record: existing, created: false };
      const now = new Date().toISOString();
      const record: SolutionRequestRecord = {
        ...input, id: randomUUID(), status: 'submitted', emailDeliveryStatus: 'pending',
        sourceChannel: input.sourceChannel || 'AI Voice', createdAt: now, updatedAt: now,
      };
      inquiries.push(record);
      return { record, created: true };
    },
    async updateSolutionRequestEmailStatus(referenceCode, status) {
      const record = inquiries.find((item) => item.referenceCode === referenceCode);
      if (record) record.emailDeliveryStatus = status;
    },
    async listSolutionRequests({ limit, offset }) {
      return { records: inquiries.slice(offset, offset + limit), total: inquiries.length };
    },
    async getBookedSlotsForDate(date: string) {
      return appointments.filter((item) => item.scheduledDate === date && item.status === 'confirmed')
        .map((item) => item.scheduledTimeSlot);
    },
    async createAppointment(input: CreateAppointmentInput) {
      const existing = input.idempotencyKey
        ? appointments.find((record) => record.idempotencyKey === input.idempotencyKey)
        : undefined;
      if (existing) return { record: existing, created: false };
      const now = new Date().toISOString();
      const record: AppointmentRecord = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
      appointments.push(record);
      return { record, created: true };
    },
    async getAppointmentByReference(ref: string) {
      return appointments.find((item) => item.referenceCode === ref) || null;
    },
    async updateAppointment(ref, patch) {
      const record = appointments.find((item) => item.referenceCode === ref);
      if (!record) throw new Error('Appointment not found in isolated test database.');
      Object.assign(record, patch, { updatedAt: new Date().toISOString() });
      return record;
    },
    async listAppointments({ limit, offset }) {
      return { records: appointments.slice(offset, offset + limit), total: appointments.length };
    },
    async createOutboxRecord(input: CreateOutboxInput) {
      const existing = outbox.find((item) => item.dedupeKey === input.dedupeKey);
      if (existing) return { record: existing, created: false };
      const now = new Date().toISOString();
      const record: EmailOutboxRecord = {
        ...input, id: randomUUID(), status: 'queued', provider: 'resend',
        deliveryAttempts: 0, createdAt: now, updatedAt: now,
      };
      outbox.push(record);
      return { record, created: true };
    },
    async updateOutboxStatus(id: string, patch: UpdateOutboxPatch) {
      const record = outbox.find((item) => item.id === id);
      if (!record) throw new Error('Notification not found in isolated test database.');
      Object.assign(record, patch, { updatedAt: new Date().toISOString() });
    },
    async listRetryableOutbox() { return []; },
    async listOutboxByEntity(entityType, entityReference) {
      return outbox.filter((item) => item.entityType === entityType && item.entityReference === entityReference);
    },
    async writeAuditLog() {},
    async listAuditLogs() { return { records: [], total: 0 }; },
    async findActiveAdminByEmail() { return null; },
    async verifySupabaseUserToken() { return null; },
  };
}

// ---------------------------------------------------------------------------
// 25-Scenario Continuous AI Voice Regression Suite (DTI-VOICE-REPAIR-001)
// ---------------------------------------------------------------------------

describe('DESTRIA AI Voice Continuous Conversation Regression Suite (25 Scenarios)', () => {
  let server: http.Server;
  let baseUrl: string;
  let closeLiveBridge: () => void;

  before(async () => {
    const { app, ai } = createApp({
      db: createVoiceTestDatabase(),
      // No actual outbound email is permitted during automated tests.
      emailTransport: {
        isConfigured: false,
        async send() { return { status: 'unconfigured' as const, error: 'Isolated test transport.' }; },
      },
    });
    server = http.createServer(app);
    const bridge = attachVoiceLiveBridge(server, ai);
    closeLiveBridge = bridge.close;

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    closeLiveBridge();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function createLocalFetch(interceptor?: (url: string, init?: RequestInit) => Promise<Response> | null): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === 'string' ? input : input.toString();
      const targetUrl = rawUrl.startsWith('http') ? rawUrl : `${baseUrl}${rawUrl}`;
      if (interceptor) {
        const custom = await interceptor(targetUrl, init);
        if (custom) return custom;
      }
      return fetch(targetUrl, init);
    }) as typeof fetch;
  }

  function createHarness(options?: {
    fetchInterceptor?: (url: string, init?: RequestInit) => Promise<Response> | null;
    synthHoldOpen?: boolean;
    synthShouldFail?: boolean;
    recognitionRestartBaseDelayMs?: number;
    networkRetryDelaysMs?: number[];
  }) {
    FakeSpeechRecognition.instances = [];
    const streams: FakeMediaStream[] = [];
    const audioContexts: FakeAudioContext[] = [];
    const synth = new FakeSpeechSynthesis();
    synth.holdOpen = Boolean(options?.synthHoldOpen);
    synth.shouldFailSpeak = Boolean(options?.synthShouldFail);

    const statusHistory: VoiceSessionState[] = [];
    const aiResponses: Array<{ text: string; intent?: any }> = [];
    const transcripts: Array<{ text: string; isFinal: boolean }> = [];
    const errors: string[] = [];
    const turnMetrics: VoiceTurnMetrics[] = [];
    let bookingRequestedCount = 0;

    const service = new AIVoiceService({
      fetchImpl: createLocalFetch(options?.fetchInterceptor),
      getUserMedia: async () => {
        const stream = new FakeMediaStream();
        streams.push(stream);
        return stream as unknown as MediaStream;
      },
      SpeechRecognitionCtor: FakeSpeechRecognition as any,
      AudioContextCtor: function (this: any) {
        const ctx = new FakeAudioContext();
        audioContexts.push(ctx);
        return ctx;
      } as any,
      SpeechSynthesisUtteranceCtor: FakeUtterance as any,
      speechSynthesis: synth as unknown as SpeechSynthesis,
      enableLiveWebSocket: false,
      recognitionRestartBaseDelayMs: options?.recognitionRestartBaseDelayMs ?? 12,
      networkRetryDelaysMs: options?.networkRetryDelaysMs ?? [15, 25],
      playbackWatchdogPaddingMs: 200,
    });

    service.setCallbacks({
      onStatusChange: (s) => statusHistory.push(s),
      onAiResponse: (text, intent) => aiResponses.push({ text, intent }),
      onTranscript: (text, isFinal) => transcripts.push({ text, isFinal }),
      onError: (e) => errors.push(e),
      onTurnMetrics: (m) => turnMetrics.push(m),
      onBookingRequested: () => {
        bookingRequestedCount += 1;
      },
    });

    return {
      service,
      streams,
      audioContexts,
      synth,
      statusHistory,
      aiResponses,
      transcripts,
      errors,
      turnMetrics,
      getBookingRequestedCount: () => bookingRequestedCount,
      getRecognition: () => FakeSpeechRecognition.instances[FakeSpeechRecognition.instances.length - 1],
    };
  }

  // Scenarios 1, 2, 3: Session start, audible greeting, automatic post-greeting listening recovery
  it('Scenarios 1-3: Start voice succeeds, delivers audible greeting, and automatically resumes listening', async () => {
    const h = createHarness();
    const started = await h.service.startSession();
    assert.equal(started, true);
    assert.equal(h.service.isSessionActive(), true);
    assert.equal(h.service.getStatus(), 'listening');
    assert.equal(h.service.getTransportMode(), 'turn_based_continuous');

    // Audible greeting must have played (via fallback or neural TTS)
    assert.ok(h.synth.spokenUtterances.length >= 1, 'Expected audible greeting utterance');
    assert.match(h.synth.spokenUtterances[0].text, /DESTRIA TECH INC/i);

    // State transition sequence must include connecting -> ai_speaking -> listening
    assert.ok(h.statusHistory.includes('connecting'));
    assert.ok(h.statusHistory.includes('ai_speaking'));
    assert.equal(h.statusHistory[h.statusHistory.length - 1], 'listening');

    // Speech recognition MUST automatically start after greeting completes
    const rec = h.getRecognition();
    assert.ok(rec, 'SpeechRecognition instance must be initialized');
    assert.equal(rec.isRunning, true, 'SpeechRecognition must automatically be active after greeting');
    assert.ok(rec.startCount >= 1, 'SpeechRecognition.start() must be called automatically after greeting');

    h.service.stopSession();
  });

  // Scenarios 4, 5, 6, 7, 8: Full two-way verbal turn -> contextual response -> audible playback -> auto-listening
  it('Scenarios 4-8: User verbally answers -> transcript captured -> contextual response -> audible playback -> auto-listening resumes', async () => {
    const h = createHarness();
    await h.service.startSession();
    const rec = h.getRecognition();
    assert.equal(rec.isRunning, true);

    // Emit interim then final speech
    rec.emitInterim('I need a');
    assert.equal(h.service.getStatus(), 'user_speaking');
    rec.emitFinal('I need a website for our enterprise logistics portal.');

    await waitForCondition(() => h.aiResponses.length === 1 && h.service.getStatus() === 'listening');

    assert.equal(h.service.getTurnCount(), 1);
    assert.ok(
      h.transcripts.some((t) => t.isFinal && /website/i.test(t.text)),
      'Finalized transcript must be captured'
    );
    assert.ok(h.aiResponses[0].text.length > 20, 'AI must generate substantive contextual reply');
    assert.ok(h.synth.spokenUtterances.length >= 2, 'AI response must be played audibly after greeting');
    assert.equal(h.service.getStatus(), 'listening', 'Status must return to listening automatically');
    assert.equal(rec.isRunning, true, 'SpeechRecognition must automatically resume after AI finishes speaking');

    // Verify turn metrics captured
    assert.equal(h.turnMetrics.length, 1);
    assert.ok(h.turnMetrics[0].aiResponseLatencyMs >= 0);
    assert.ok(h.turnMetrics[0].totalTurnLatencyMs >= 0);

    h.service.stopSession();
  });

  // Scenario 9: 20+ consecutive conversational turns without manually restarting voice
  it('Scenario 9: Sustains 22 consecutive verbal turns without pressing Start Voice again or hitting rate limits', async () => {
    const h = createHarness();
    await h.service.startSession();
    const rec = h.getRecognition();
    const initialSessionId = h.service.getSessionId();

    const conversationScript = [
      'Hello, we are evaluating technology modernization for our operations.',
      'Which one would you recommend?',
      'The first option.',
      'We need a customer portal with role-based access and document workflows.',
      'Tell me more.',
      'How does it work?',
      'Yes.',
      'We currently use Salesforce CRM and an internal PostgreSQL ledger.',
      'We also want AI workflow automation for ticket routing.',
      'Can you explain how you handle cloud security and encryption?',
      'No.',
      'About five hundred enterprise staff and ten thousand external partners.',
      'What divisions handle cybersecurity and infrastructure?',
      'Do you also build mobile companion apps?',
      'What about automated analytics dashboards?',
      'How long does technical discovery normally take?',
      'Can we integrate single sign-on later?',
      'We want to start with phase one web portal architecture.',
      'I prefer the CTO consultation.',
      'Not yet, let us discuss requirements first.',
      'How much does this cost?',
      'Thank you, please open the scheduling form now.',
    ];

    assert.ok(conversationScript.length >= 20, 'Must test at least 20 consecutive turns');

    for (let i = 0; i < conversationScript.length; i++) {
      assert.equal(h.service.isSessionActive(), true, `Session dropped before turn ${i + 1}`);
      assert.equal(h.service.getStatus(), 'listening', `Not listening before turn ${i + 1}`);
      assert.equal(rec.isRunning, true, `Recognition stopped before turn ${i + 1}`);

      // Trigger final transcript directly via recognition event (just like real browser speech)
      rec.emitFinal(conversationScript[i]);

      await waitForCondition(
        () => h.aiResponses.length === i + 1 && h.service.getStatus() === 'listening' && rec.isRunning,
        3500
      );
    }

    assert.equal(h.service.getTurnCount(), 22);
    assert.equal(h.service.getSessionId(), initialSessionId, 'Session ID must remain consistent across all 22 turns');
    assert.equal(h.service.isSessionActive(), true);
    assert.equal(h.service.getStatus(), 'listening');
    assert.equal(rec.isRunning, true);
    assert.equal(h.errors.length, 0, `Expected zero errors across 22 turns, got: ${h.errors.join('; ')}`);
    assert.equal(h.turnMetrics.length, 22);

    // Commercial pricing guardrail verification on Turn 21 ("How much does this cost?")
    const pricingReply = h.aiResponses[20].text;
    assert.doesNotMatch(pricingReply, /\$\d/, 'Pricing guardrail must never output dollar figures');
    assert.match(pricingReply, /customized|consultation|info@destriatech\.com/i);

    // Affirmative booking intent on Turn 22 ("please open the scheduling form now")
    assert.equal(h.getBookingRequestedCount(), 1, 'Booking modal should open only on explicit affirmative turn 22');

    // Compute & verify latency metrics across 22 turns
    const avgAiMs =
      h.turnMetrics.reduce((sum, m) => sum + m.aiResponseLatencyMs, 0) / h.turnMetrics.length;
    const avgTotalMs =
      h.turnMetrics.reduce((sum, m) => sum + m.totalTurnLatencyMs, 0) / h.turnMetrics.length;
    assert.ok(avgAiMs >= 0 && avgTotalMs >= 0);

    h.service.stopSession();
  });

  // Scenarios 10 & 11: Short contextual follow-ups & option selection without boilerplate hijacking
  it('Scenarios 10-11: Contextual understanding resolves short follow-ups ("Which one?", "The first option", "Yes", "No", "I prefer the CTO consultation")', async () => {
    // Unit checks on context helpers
    const extracted = extractPresentedOptionsFromText(
      'Would you like to discuss website development, AI automation, or blockchain solutions?'
    );
    assert.deepEqual(extracted, ['website development', 'AI automation', 'blockchain solutions']);

    // Deduplication prevents consecutive identical user turns
    const deduped = buildDeduplicatedHistory(
      [],
      [
        { sender: 'ai', text: 'Welcome to DESTRIA TECH INC.' },
        { sender: 'user', text: 'I need a website' },
      ],
      'I need a website'
    );
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].sender, 'ai');

    // Negative / exploratory booking mentions must NOT prematurely hijack conversation
    assert.equal(detectAffirmativeBookingIntent("I don't want to book yet").isBookingIntent, false);
    assert.equal(
      detectAffirmativeBookingIntent('I prefer the CTO consultation').requiresBookingConfirmation,
      true
    );
    assert.equal(
      detectAffirmativeBookingIntent('I prefer the CTO consultation').isBookingIntent,
      false
    );

    // Live multi-turn contextual test through /api/voice/process
    const h = createHarness();
    await h.service.startSession();
    h.service.syncConversationContext([
      {
        sender: 'ai',
        text: 'Would you like to discuss website development, AI automation, or blockchain solutions?',
      },
    ]);

    const rec = h.getRecognition();
    rec.emitFinal('Which one would you recommend?');
    await waitForCondition(() => h.aiResponses.length === 1 && h.service.getStatus() === 'listening');
    assert.match(
      h.aiResponses[0].text,
      /website development|AI automation|blockchain|priority|goal/i,
      'Must reference previously presented options'
    );

    rec.emitFinal('The first option.');
    await waitForCondition(() => h.aiResponses.length === 2 && h.service.getStatus() === 'listening');
    assert.match(h.aiResponses[1].text, /website development/i, 'Must resolve "The first option" to website development');

    rec.emitFinal('I prefer the CTO consultation.');
    await waitForCondition(() => h.aiResponses.length === 3 && h.service.getStatus() === 'listening');
    assert.match(h.aiResponses[2].text, /Leodenis|Chief Technology Officer|CTO/i);
    assert.equal(h.getBookingRequestedCount(), 0, 'Must ask confirmation before auto-opening booking form');

    h.service.stopSession();
  });

  // Scenarios 12 & 13: User interrupts AI speech -> stops immediately & stale audio never resumes
  it('Scenarios 12-13: User interruption stops active AI speech immediately, transitions via interrupted, and fences stale audio', async () => {
    const h = createHarness({ synthHoldOpen: true });

    // Start session where greeting utterance holds open in ai_speaking
    const startPromise = h.service.startSession();
    await waitForCondition(() => h.service.getStatus() === 'ai_speaking');
    const rec = h.getRecognition();

    // User interrupts while AI is actively speaking
    h.service.interrupt(true);

    assert.ok(h.statusHistory.includes('interrupted'), 'Must transition through interrupted state');
    assert.equal(h.service.getStatus(), 'user_speaking');
    assert.ok(h.synth.cancelCount >= 1, 'SpeechSynthesis.cancel() must be invoked immediately');
    assert.equal(rec.isRunning, true, 'SpeechRecognition must resume immediately on interruption');

    // Simulate stale onend firing on the interrupted greeting utterance -> MUST be ignored!
    const interruptedUtterance = h.synth.spokenUtterances[0];
    interruptedUtterance.onend?.();
    await startPromise;

    // Now allow next turn to complete normally
    h.synth.holdOpen = false;
    rec.emitFinal('Actually I need AI workflow automation instead.');
    await waitForCondition(() => h.aiResponses.length === 1 && h.service.getStatus() === 'listening');

    assert.match(h.aiResponses[0].text, /AI|automation/i);
    assert.equal(h.service.getStatus(), 'listening');
    assert.equal(rec.isRunning, true);

    h.service.stopSession();
  });

  // Scenario 14: Temporary network / 503 failure -> reconnecting -> automatic retry with context preserved
  it('Scenario 14: Recovers cleanly from transient 503 voice API failure via reconnecting state while preserving session context', async () => {
    let processAttempts = 0;
    const h = createHarness({
      networkRetryDelaysMs: [15, 25],
      fetchInterceptor: async (url) => {
        if (url.includes('/api/voice/process')) {
          processAttempts += 1;
          if (processAttempts === 1) {
            return new Response(JSON.stringify({ error: 'Temporary gateway outage' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }
        return new Response(null, { status: 404 });
      },
    });

    await h.service.startSession();
    const sessionIdBefore = h.service.getSessionId();
    const rec = h.getRecognition();

    rec.emitFinal('We need custom enterprise cloud infrastructure.');
    await waitForCondition(() => h.aiResponses.length === 1 && h.service.getStatus() === 'listening');

    assert.equal(processAttempts, 2, 'Should retry automatically after initial 503');
    assert.ok(h.statusHistory.includes('reconnecting'), 'Must visibly enter reconnecting state during retry');
    assert.equal(h.service.getSessionId(), sessionIdBefore, 'Session ID must persist across reconnection');
    assert.equal(h.service.getStatus(), 'listening');
    assert.equal(rec.isRunning, true);

    h.service.stopSession();
  });

  // Scenario 15: Unexpected speech recognition onend -> safe bounded recovery without infinite loop
  it('Scenario 15: Unexpected SpeechRecognition onend recovers safely with bounded backoff', async () => {
    const h = createHarness({ recognitionRestartBaseDelayMs: 12 });
    await h.service.startSession();
    const rec = h.getRecognition();
    const startsBefore = rec.startCount;

    rec.emitUnexpectedEnd();
    assert.equal(rec.isRunning, false);

    await waitForCondition(() => rec.isRunning && rec.startCount > startsBefore, 1000);
    assert.equal(h.service.getStatus(), 'listening');
    assert.equal(rec.isRunning, true);

    h.service.stopSession();
  });

  // Scenario 16: Primary audio provider fails -> female browser fallback; all fail -> honest error + listening recovery
  it('Scenario 16: Primary TTS failure falls back cleanly; total audio failure reports honest error and still resumes listening', async () => {
    // 16a: /api/voice/speak returns 503 -> browser female fallback plays seamlessly
    const h1 = createHarness({
      fetchInterceptor: async (url) => {
        if (url.includes('/api/voice/speak')) {
          return new Response(JSON.stringify({ success: false }), { status: 503 });
        }
        return new Response(null, { status: 404 });
      },
    });
    await h1.service.startSession();
    assert.equal(h1.service.getActiveVoiceEngine(), 'browser_fallback');
    assert.equal(h1.service.getStatus(), 'listening');
    assert.equal(h1.getRecognition().isRunning, true);
    h1.service.stopSession();

    // 16b: /api/voice/speak returns valid base64 WAV -> Gemini Neural path decodes & plays via AudioBufferSourceNode
    const minimalWavBase64 = Buffer.from('RIFF....WAVEfmt ').toString('base64');
    const h2 = createHarness({
      fetchInterceptor: async (url) => {
        if (url.includes('/api/voice/speak')) {
          return new Response(
            JSON.stringify({
              success: true,
              audioBase64: minimalWavBase64,
              mimeType: 'audio/wav',
              voice: 'Kore',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(null, { status: 404 });
      },
    });
    await h2.service.startSession();
    assert.equal(h2.service.getActiveVoiceEngine(), 'gemini_neural');
    assert.equal(h2.service.getStatus(), 'listening');
    assert.equal(h2.getRecognition().isRunning, true);
    h2.service.stopSession();

    // 16c: Both primary neural TTS and browser SpeechSynthesis fail -> honest error emitted, still recovers listening
    const h3 = createHarness({
      synthShouldFail: true,
      fetchInterceptor: async (url) => {
        if (url.includes('/api/voice/speak')) {
          return new Response(JSON.stringify({ success: false }), { status: 503 });
        }
        return new Response(null, { status: 404 });
      },
    });
    await h3.service.startSession();
    assert.equal(h3.service.getActiveVoiceEngine(), 'none');
    assert.ok(h3.errors.some((e) => /Audio playback could not start/i.test(e)));
    assert.equal(h3.service.getStatus(), 'listening');
    assert.equal(h3.getRecognition().isRunning, true);
    h3.service.stopSession();
  });

  // Scenario 17: Duplicate speech recognition events do NOT generate duplicate AI responses
  it('Scenario 17: Duplicate final recognition bursts within dedupe window trigger only a single AI turn', async () => {
    const h = createHarness();
    await h.service.startSession();
    const rec = h.getRecognition();

    rec.emitFinal('We need blockchain supply chain tracking.');
    // Immediately emit duplicate burst before turn completes
    rec.emitFinal('We need blockchain supply chain tracking.');
    await waitForCondition(() => h.aiResponses.length === 1 && h.service.getStatus() === 'listening');
    // Emit same text again within 1800ms dedupe window
    rec.emitFinal('We need blockchain supply chain tracking.');
    await waitMs(60);

    assert.equal(h.aiResponses.length, 1, 'Duplicate recognition results must not trigger duplicate AI turns');
    assert.equal(h.service.getTurnCount(), 1);

    h.service.stopSession();
  });

  // Scenarios 18, 19, 20: Full cleanup on end/close, zero stale mic restart, clean reopen
  it('Scenarios 18-20: Stopping/closing releases tracks/contexts/recognition, blocks stale callbacks, and reopens cleanly', async () => {
    const h = createHarness();
    await h.service.startSession();
    const firstRec = h.getRecognition();
    const firstStream = h.streams[0];
    const firstSessionId = h.service.getSessionId();

    h.service.stopSession();

    assert.equal(h.service.isSessionActive(), false);
    assert.equal(h.service.getStatus(), 'disconnected');
    assert.ok(h.statusHistory.includes('stopping'));
    assert.equal(firstStream.tracks[0].readyState, 'ended', 'Microphone track must be stopped');
    assert.equal(firstRec.abortCount >= 1, true, 'SpeechRecognition must be aborted');
    assert.equal(firstRec.onresult, null, 'Old recognition listeners must be detached');
    assert.equal(firstRec.onend, null, 'Old recognition onend must be detached');
    assert.ok(h.audioContexts.every((c) => c.state === 'closed'), 'AudioContexts must be closed');

    // Old callbacks firing after stop must never restart mic
    firstRec.emitUnexpectedEnd();
    await waitMs(40);
    assert.equal(h.service.getStatus(), 'disconnected');
    assert.equal(h.service.isSessionActive(), false);

    // Scenario 20: Reopening voice establishes a brand-new clean session
    const restarted = await h.service.startSession();
    assert.equal(restarted, true);
    assert.equal(h.service.isSessionActive(), true);
    assert.equal(h.service.getStatus(), 'listening');
    assert.notEqual(h.service.getSessionId(), firstSessionId);
    assert.equal(h.getRecognition().isRunning, true);

    h.service.stopSession();
  });

  // Scenarios 21, 22, 23: Existing text chat, Project Brief, and Executive Consultation remain intact
  it('Scenarios 21-23: Text chat, Project Brief submission, and Executive Consultation booking remain fully operational', async () => {
    // 21. Text chat endpoint
    const chatRes = await fetch(`${baseUrl}/api/consultant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userMessage: 'Tell me about DESTRIA TECH INC enterprise AI solutions.',
        conversationHistory: [],
        stateContext: { currentStage: 'welcome' },
      }),
    });
    assert.equal(chatRes.status, 200);
    const chatBody = await chatRes.json();
    assert.ok(typeof chatBody.replyText === 'string' && chatBody.replyText.length > 20);

    // 22. Project Brief / Service Inquiry endpoint
    const inquiryRes = await fetch(`${baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'contact_inquiry',
        fullName: 'Elena Vance',
        company: 'Vance Logistics Corp',
        email: 'elena@vancelogistics.example',
        contactNumber: '+1 (307) 555-0192',
        projectDescription: 'Unify partner portal and workflow automation with controlled access.',
        privacyConsent: true,
        commercialPolicyConsent: true,
        sourceChannel: 'AI Voice',
      }),
    });
    assert.equal(inquiryRes.status, 201);
    const inquiryBody = await inquiryRes.json();
    assert.equal(inquiryBody.success, true);
    assert.ok(inquiryBody.referenceId);

    // 23. Real executive scheduling endpoint, with a future weekday and an authorized slot.
    const futureBusinessDate = new Date();
    futureBusinessDate.setUTCDate(futureBusinessDate.getUTCDate() + 7);
    while ([0, 6].includes(futureBusinessDate.getUTCDay())) {
      futureBusinessDate.setUTCDate(futureBusinessDate.getUTCDate() + 1);
    }
    const consultRes = await fetch(`${baseUrl}/api/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Elena Vance',
        companyName: 'Vance Logistics Corp',
        email: 'elena@vancelogistics.example',
        phone: '+1 (307) 555-0192',
        executivePathway: 'cto',
        consultationType: 'video',
        scheduledDate: futureBusinessDate.toISOString().slice(0, 10),
        scheduledTimeSlot: '10:00 AM - 10:30 AM',
        clientTimezone: 'America/Denver',
        consultationPurpose: 'Enterprise web portal and AI workflow integration.',
        availabilityVerified: false,
        sourceChannel: 'AI Voice',
      }),
    });
    assert.equal(consultRes.status, 201);
    const consultBody = await consultRes.json();
    assert.equal(consultBody.success, true);
    assert.ok(consultBody.appointment?.referenceCode);
    assert.equal(consultBody.appointment?.sourceChannel, 'AI Voice');
    assert.equal(consultBody.appointment?.status, 'pending_review');
  });

  // Scenario 24: State machine transition enforcement + Gemini Live WebSocket bridge honest behavior
  it('Scenario 24: Enforces deterministic state transitions and honest Gemini Live WebSocket handshake', async () => {
    assert.equal(isValidVoiceTransition('disconnected', 'connecting'), true);
    assert.equal(isValidVoiceTransition('ai_speaking', 'listening'), true);
    assert.equal(isValidVoiceTransition('ai_speaking', 'interrupted'), true);
    assert.equal(isValidVoiceTransition('disconnected', 'ai_speaking'), false);
    assert.equal(isValidVoiceTransition('stopping', 'listening'), false);

    // Connect real WebSocket client to /api/voice/live
    const wsUrl = baseUrl.replace(/^http/, 'ws') + VOICE_LIVE_WS_PATH;
    const receivedMessages: any[] = [];

    await new Promise<void>((resolve, reject) => {
      const ws = new WsClient(wsUrl);
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error('WebSocket handshake timed out'));
      }, 3000);

      ws.on('message', (data) => {
        try {
          receivedMessages.push(JSON.parse(data.toString()));
        } catch {
          // Ignore
        }
      });

      ws.on('close', () => {
        clearTimeout(timer);
        resolve();
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    // Without live GEMINI_API_KEY in test env, bridge MUST honestly return LIVE_UNAVAILABLE
    if (!process.env.GEMINI_API_KEY) {
      assert.ok(
        receivedMessages.some((m) => m.type === 'error' && m.code === 'LIVE_UNAVAILABLE'),
        `Expected honest LIVE_UNAVAILABLE message, got: ${JSON.stringify(receivedMessages)}`
      );
    }
  });

  // Scenario 25: Client-side security audit (zero GEMINI_API_KEY, zero @google/genai, zero internal emails in src/services & src/components)
  it('Scenario 25: Client voice modules contain zero API key references, zero @google/genai imports, and zero internal email leaks', () => {
    const clientFiles = [
      path.resolve('src/services/aiVoiceService.ts'),
      path.resolve('src/components/consultant/AIConsultantWidget.tsx'),
      path.resolve('src/services/aiConsultantService.ts'),
    ];

    for (const filePath of clientFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      assert.doesNotMatch(content, /@google\/genai/, `${filePath} must never import @google/genai`);
      assert.doesNotMatch(content, /GEMINI_API_KEY/, `${filePath} must never reference GEMINI_API_KEY`);
      assert.doesNotMatch(content, /artaxsvcs@gmail\.com/i, `${filePath} must never expose internal recipient email`);
      assert.doesNotMatch(
        content,
        /dhenze\.languisan@gmail\.com/i,
        `${filePath} must never expose internal recipient email`
      );
    }
  });
});
