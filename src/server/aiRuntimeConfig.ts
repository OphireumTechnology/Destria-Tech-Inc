import crypto from 'crypto';

/**
 * Centralized Enterprise AI Runtime Configuration, Quotas, Active Session
 * Registry, and Operational Telemetry for DESTRIA TECH INC.
 *
 * Security invariants:
 * - NEVER returns, serializes, or accepts raw GEMINI_API_KEY values.
 * - NEVER retains raw microphone audio buffers.
 * - Validates all model, voice, language, and limit updates against strict allowlists.
 */

export const ALLOWED_AI_PROVIDERS = ['gemini'] as const;
export type AiProviderId = (typeof ALLOWED_AI_PROVIDERS)[number];

export const ALLOWED_GEMINI_LIVE_MODELS = [
  'gemini-3.8-live',
  'gemini-3.8-live-extended-thinking',
] as const;
export type GeminiLiveModelId = (typeof ALLOWED_GEMINI_LIVE_MODELS)[number];

export const ALLOWED_GEMINI_CHAT_MODELS = ['gemini-4-hydrogen'] as const;
export type GeminiChatModelId = (typeof ALLOWED_GEMINI_CHAT_MODELS)[number];

export const ALLOWED_GEMINI_TTS_MODELS = ['gemini-3.8-flash-lite-tts'] as const;
export type GeminiTtsModelId = (typeof ALLOWED_GEMINI_TTS_MODELS)[number];

export const ALLOWED_GEMINI_VOICES = [
  'Kore',
  'Aoede',
  'Leda',
  'Zephyr',
  'Puck',
  'Charon',
  'Fenrir',
] as const;
export type GeminiVoiceName = (typeof ALLOWED_GEMINI_VOICES)[number];

export const ALLOWED_AI_LANGUAGES = ['en-US', 'fil-PH'] as const;
export type AiDefaultLanguage = (typeof ALLOWED_AI_LANGUAGES)[number];

export interface AiRuntimeSettings {
  aiProvider: AiProviderId;
  geminiLiveEnabled: boolean;
  geminiLiveModel: GeminiLiveModelId;
  geminiChatModel: GeminiChatModelId;
  geminiTtsModel: GeminiTtsModelId;
  geminiVoiceName: GeminiVoiceName;
  defaultLanguage: AiDefaultLanguage;
  multilingualEnabled: boolean;
  transcriptionEnabled: boolean;
  bargeInEnabled: boolean;
  browserFallbackEnabled: boolean;
  maxConcurrentLiveSessions: number;
  sessionTtlMinutes: number;
  maxTurnsPerSession: number;
  dailyEstimatedBudgetUsd: number;
}

export interface ActiveAiSessionInfo {
  sessionId: string;
  channel: 'gemini_live' | 'turn_based' | 'chat';
  model: string;
  voiceName: string;
  language: string;
  startedAt: string;
  lastActivityAt: string;
  turnCount: number;
  toolCallsCount: number;
  status: 'active' | 'terminating';
}

export interface TranscriptionErrorReport {
  id: string;
  sessionId: string;
  originalTranscript: string;
  correctedTranscript: string;
  language: string;
  transportMode: string;
  reportedAt: string;
}

export type GeminiErrorCategory =
  | 'INVALID_CREDENTIALS'
  | 'UNSUPPORTED_MODEL'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'NETWORK_TIMEOUT'
  | 'MALFORMED_RESPONSE'
  | 'UNKNOWN_PROVIDER_ERROR';

export interface GeminiProviderErrorClassification {
  category: GeminiErrorCategory;
  httpStatus?: number;
  retryable: boolean;
  safeMessage: string;
}

/**
 * Classifies Gemini SDK / upstream HTTP errors into structured operational categories
 * while stripping any accidental secret strings or stack traces.
 */
export function classifyGeminiProviderError(err: unknown): GeminiProviderErrorClassification {
  const rawMessage =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message?: unknown }).message || '')
      : String(err || '');
  const statusVal =
    typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status?: unknown }).status)
      : typeof err === 'object' && err !== null && 'code' in err
      ? Number((err as { code?: unknown }).code)
      : undefined;
  const httpStatus = Number.isFinite(statusVal) ? statusVal : undefined;

  const redacted = rawMessage
    .replace(/\bAIzaSy[0-9A-Za-z_-]{10,}\b/g, '[REDACTED_API_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .slice(0, 220);
  const lower = redacted.toLowerCase();

  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    /\b(?:401|403)\b|api[_\s]*key[_\s]*(?:not[_\s]*valid|invalid|expired|missing)|unauthenticated|permission_denied|invalid\s+credentials/i.test(
      lower
    )
  ) {
    return {
      category: 'INVALID_CREDENTIALS',
      httpStatus: httpStatus || 401,
      retryable: false,
      safeMessage: 'Gemini API authentication failed; verify server GEMINI_API_KEY credentials.',
    };
  }

  if (
    httpStatus === 404 ||
    /model\s+.*not\s+found|is\s+not\s+found\s+for\s+api\s+version|unsupported\s+model|deprecated\s+model/i.test(
      lower
    )
  ) {
    return {
      category: 'UNSUPPORTED_MODEL',
      httpStatus: httpStatus || 404,
      retryable: false,
      safeMessage: 'Configured Gemini model is unavailable or unsupported by the upstream API.',
    };
  }

  if (/quota\s+exceeded|billing|insufficient\s+quota|resource_exhausted.*quota/i.test(lower)) {
    return {
      category: 'QUOTA_EXCEEDED',
      httpStatus: httpStatus || 429,
      retryable: false,
      safeMessage: 'Gemini API quota limit exceeded on the configured provider account.',
    };
  }

  if (httpStatus === 429 || /rate\s*limit|too\s+many\s+requests|resource_exhausted/i.test(lower)) {
    return {
      category: 'RATE_LIMITED',
      httpStatus: 429,
      retryable: true,
      safeMessage: 'Gemini API temporarily rate-limited the request; retry with backoff.',
    };
  }

  if (/timeout|timed\s*out|aborted|econnreset|etimedout|enotfound|fetch\s+failed|network/i.test(lower)) {
    return {
      category: 'NETWORK_TIMEOUT',
      httpStatus,
      retryable: true,
      safeMessage: 'Upstream Gemini request timed out or encountered a transient network error.',
    };
  }

  if (
    (httpStatus !== undefined && httpStatus >= 500) ||
    /unavailable|overloaded|internal\s+error|bad\s+gateway|service\s+unavailable/i.test(lower)
  ) {
    return {
      category: 'PROVIDER_UNAVAILABLE',
      httpStatus: httpStatus || 503,
      retryable: true,
      safeMessage: 'Gemini AI provider is temporarily unavailable.',
    };
  }

  if (httpStatus === 400 || /invalid_argument|invalid\s+request|malformed\s+request/i.test(lower)) {
    return {
      category: 'INVALID_REQUEST',
      httpStatus: 400,
      retryable: false,
      safeMessage: 'Gemini rejected the request payload as invalid.',
    };
  }

  if (/malformed|json\s+parse|unexpected\s+token|empty\s+response/i.test(lower)) {
    return {
      category: 'MALFORMED_RESPONSE',
      httpStatus,
      retryable: true,
      safeMessage: 'Gemini returned an incomplete or malformed response payload.',
    };
  }

  return {
    category: 'UNKNOWN_PROVIDER_ERROR',
    httpStatus,
    retryable: true,
    safeMessage: redacted || 'Unexpected Gemini provider error.',
  };
}

export interface AiFailureEvent {
  id: string;
  category: string;
  message: string;
  channel: string;
  occurredAt: string;
}

export interface ConversationDiagnosticRecord {
  sessionId: string;
  channel: string;
  turns: number;
  toolCalls: number;
  policyEnforcements: number;
  avgLatencyMs: number;
  lastUpdatedAt: string;
}

interface InternalActiveSession extends ActiveAiSessionInfo {
  onTerminate?: () => void;
}

function parseBoolEnv(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === '') return fallback;
  const lower = raw.trim().toLowerCase();
  if (lower === 'true' || lower === '1' || lower === 'yes') return true;
  if (lower === 'false' || lower === '0' || lower === 'no') return false;
  return fallback;
}

function parseIntEnv(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseFloatEnv(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw.trim());
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function isOneOf<T extends readonly string[]>(arr: T, value: unknown): value is T[number] {
  return typeof value === 'string' && (arr as readonly string[]).includes(value);
}

// Conservative approximate USD cost per 1M tokens for operational budget visibility
const COST_RATES_PER_1M = {
  promptText: 0.3,
  outputText: 1.2,
  audioInput: 3.0,
  audioOutput: 12.0,
};

export class AiRuntimeConfigRegistry {
  private settings: AiRuntimeSettings;
  private readonly geminiConfiguredOverride?: boolean;
  private readonly activeSessions = new Map<string, InternalActiveSession>();
  private readonly latenciesMs: number[] = [];
  private readonly failureCounts: Record<string, number> = {};
  private readonly recentFailures: AiFailureEvent[] = [];
  private readonly transcriptionReports: TranscriptionErrorReport[] = [];
  private readonly diagnostics = new Map<string, ConversationDiagnosticRecord>();

  private totalRequests = 0;
  private totalLiveSessionsStarted = 0;
  private totalToolCalls = 0;
  private totalPolicyEnforcements = 0;
  private promptTokens = 0;
  private outputTokens = 0;
  private audioInputTokens = 0;
  private audioOutputTokens = 0;
  private lastUpdatedAt = new Date().toISOString();

  constructor(options?: { env?: NodeJS.ProcessEnv; geminiConfiguredOverride?: boolean }) {
    const env = options?.env || process.env;
    this.geminiConfiguredOverride = options?.geminiConfiguredOverride;

    const rawProvider = (env.AI_PROVIDER || 'gemini').trim().toLowerCase();
    const rawLiveModel = (env.GEMINI_LIVE_MODEL || 'gemini-3.8-live').trim();
    const rawVoice = (env.GEMINI_VOICE_NAME || 'Kore').trim();
    const rawLang = (env.AI_DEFAULT_LANGUAGE || 'en-US').trim();

    this.settings = {
      aiProvider: isOneOf(ALLOWED_AI_PROVIDERS, rawProvider) ? rawProvider : 'gemini',
      geminiLiveEnabled: parseBoolEnv(env.GEMINI_LIVE_ENABLED, true),
      geminiLiveModel: isOneOf(ALLOWED_GEMINI_LIVE_MODELS, rawLiveModel)
        ? rawLiveModel
        : 'gemini-3.8-live',
      geminiChatModel: 'gemini-4-hydrogen',
      geminiTtsModel: 'gemini-3.8-flash-lite-tts',
      geminiVoiceName: isOneOf(ALLOWED_GEMINI_VOICES, rawVoice) ? rawVoice : 'Kore',
      defaultLanguage: isOneOf(ALLOWED_AI_LANGUAGES, rawLang) ? rawLang : 'en-US',
      multilingualEnabled: parseBoolEnv(env.AI_MULTILINGUAL_ENABLED, true),
      transcriptionEnabled: parseBoolEnv(env.AI_TRANSCRIPTION_ENABLED, true),
      bargeInEnabled: parseBoolEnv(env.AI_BARGE_IN_ENABLED, true),
      browserFallbackEnabled: parseBoolEnv(env.AI_BROWSER_FALLBACK_ENABLED, true),
      maxConcurrentLiveSessions: parseIntEnv(env.AI_MAX_CONCURRENT_SESSIONS, 25, 1, 200),
      sessionTtlMinutes: parseIntEnv(env.AI_SESSION_TTL_MINUTES, 20, 2, 120),
      maxTurnsPerSession: parseIntEnv(env.AI_MAX_TURNS_PER_SESSION, 60, 5, 300),
      dailyEstimatedBudgetUsd: parseFloatEnv(env.AI_DAILY_ESTIMATED_BUDGET_USD, 25, 1, 5000),
    };
  }

  public isGeminiApiKeyConfigured(): boolean {
    if (typeof this.geminiConfiguredOverride === 'boolean') {
      return this.geminiConfiguredOverride;
    }
    const key = process.env.GEMINI_API_KEY || '';
    return Boolean(key && !key.includes('MY_GEMINI_API_KEY') && key.length > 10);
  }

  public getSettings(): AiRuntimeSettings {
    return { ...this.settings };
  }

  public updateSettings(patch: Record<string, unknown>): {
    ok: true;
    settings: AiRuntimeSettings;
    changedFields: string[];
  } | {
    ok: false;
    error: string;
  } {
    const next: AiRuntimeSettings = { ...this.settings };
    const changedFields: string[] = [];

    // Explicitly reject any attempt to submit API keys via runtime config API
    if ('geminiApiKey' in patch || 'GEMINI_API_KEY' in patch || 'apiKey' in patch) {
      return {
        ok: false,
        error: 'API keys cannot be modified or transmitted through the runtime configuration endpoint. Configure GEMINI_API_KEY strictly via server environment secrets.',
      };
    }

    if (patch.aiProvider !== undefined) {
      if (!isOneOf(ALLOWED_AI_PROVIDERS, patch.aiProvider)) {
        return { ok: false, error: `Unsupported aiProvider. Allowed: ${ALLOWED_AI_PROVIDERS.join(', ')}` };
      }
      if (next.aiProvider !== patch.aiProvider) changedFields.push('aiProvider');
      next.aiProvider = patch.aiProvider;
    }

    if (patch.geminiLiveModel !== undefined) {
      if (!isOneOf(ALLOWED_GEMINI_LIVE_MODELS, patch.geminiLiveModel)) {
        return {
          ok: false,
          error: `Unsupported geminiLiveModel. Approved models: ${ALLOWED_GEMINI_LIVE_MODELS.join(', ')}`,
        };
      }
      if (next.geminiLiveModel !== patch.geminiLiveModel) changedFields.push('geminiLiveModel');
      next.geminiLiveModel = patch.geminiLiveModel;
    }

    if (patch.geminiVoiceName !== undefined) {
      if (!isOneOf(ALLOWED_GEMINI_VOICES, patch.geminiVoiceName)) {
        return { ok: false, error: `Unsupported geminiVoiceName. Allowed: ${ALLOWED_GEMINI_VOICES.join(', ')}` };
      }
      if (next.geminiVoiceName !== patch.geminiVoiceName) changedFields.push('geminiVoiceName');
      next.geminiVoiceName = patch.geminiVoiceName;
    }

    if (patch.defaultLanguage !== undefined) {
      if (!isOneOf(ALLOWED_AI_LANGUAGES, patch.defaultLanguage)) {
        return { ok: false, error: `Unsupported defaultLanguage. Allowed: ${ALLOWED_AI_LANGUAGES.join(', ')}` };
      }
      if (next.defaultLanguage !== patch.defaultLanguage) changedFields.push('defaultLanguage');
      next.defaultLanguage = patch.defaultLanguage;
    }

    const booleanKeys: Array<keyof Pick<
      AiRuntimeSettings,
      | 'geminiLiveEnabled'
      | 'multilingualEnabled'
      | 'transcriptionEnabled'
      | 'bargeInEnabled'
      | 'browserFallbackEnabled'
    >> = [
      'geminiLiveEnabled',
      'multilingualEnabled',
      'transcriptionEnabled',
      'bargeInEnabled',
      'browserFallbackEnabled',
    ];

    for (const key of booleanKeys) {
      if (patch[key] !== undefined) {
        if (typeof patch[key] !== 'boolean') {
          return { ok: false, error: `${key} must be a boolean.` };
        }
        if (next[key] !== patch[key]) changedFields.push(key);
        next[key] = patch[key] as boolean;
      }
    }

    if (patch.maxConcurrentLiveSessions !== undefined) {
      const n = Number(patch.maxConcurrentLiveSessions);
      if (!Number.isInteger(n) || n < 1 || n > 200) {
        return { ok: false, error: 'maxConcurrentLiveSessions must be an integer between 1 and 200.' };
      }
      if (next.maxConcurrentLiveSessions !== n) changedFields.push('maxConcurrentLiveSessions');
      next.maxConcurrentLiveSessions = n;
    }

    if (patch.sessionTtlMinutes !== undefined) {
      const n = Number(patch.sessionTtlMinutes);
      if (!Number.isInteger(n) || n < 2 || n > 120) {
        return { ok: false, error: 'sessionTtlMinutes must be an integer between 2 and 120.' };
      }
      if (next.sessionTtlMinutes !== n) changedFields.push('sessionTtlMinutes');
      next.sessionTtlMinutes = n;
    }

    if (patch.maxTurnsPerSession !== undefined) {
      const n = Number(patch.maxTurnsPerSession);
      if (!Number.isInteger(n) || n < 5 || n > 300) {
        return { ok: false, error: 'maxTurnsPerSession must be an integer between 5 and 300.' };
      }
      if (next.maxTurnsPerSession !== n) changedFields.push('maxTurnsPerSession');
      next.maxTurnsPerSession = n;
    }

    if (patch.dailyEstimatedBudgetUsd !== undefined) {
      const n = Number(patch.dailyEstimatedBudgetUsd);
      if (!Number.isFinite(n) || n < 1 || n > 5000) {
        return { ok: false, error: 'dailyEstimatedBudgetUsd must be between 1 and 5000.' };
      }
      if (next.dailyEstimatedBudgetUsd !== n) changedFields.push('dailyEstimatedBudgetUsd');
      next.dailyEstimatedBudgetUsd = n;
    }

    this.settings = next;
    this.lastUpdatedAt = new Date().toISOString();
    return { ok: true, settings: { ...this.settings }, changedFields };
  }

  // -------------------------------------------------------------------------
  // Active Session Management & Concurrency Quotas
  // -------------------------------------------------------------------------

  public canAcceptLiveSession(): { allowed: boolean; reason?: string } {
    if (!this.settings.geminiLiveEnabled) {
      return { allowed: false, reason: 'Gemini Live voice streaming is disabled by administrator configuration.' };
    }
    if (!this.isGeminiApiKeyConfigured()) {
      return { allowed: false, reason: 'Server GEMINI_API_KEY is not configured.' };
    }
    const activeLiveCount = Array.from(this.activeSessions.values()).filter(
      (s) => s.channel === 'gemini_live' && s.status === 'active'
    ).length;
    if (activeLiveCount >= this.settings.maxConcurrentLiveSessions) {
      return {
        allowed: false,
        reason: `Maximum concurrent Live sessions (${this.settings.maxConcurrentLiveSessions}) reached. Please retry shortly.`,
      };
    }
    if (this.getEstimatedCostUsd() >= this.settings.dailyEstimatedBudgetUsd) {
      return {
        allowed: false,
        reason: 'Daily AI operational spending guardrail reached. Falling back to governed advisory mode.',
      };
    }
    return { allowed: true };
  }

  public registerSession(info: {
    sessionId: string;
    channel: 'gemini_live' | 'turn_based' | 'chat';
    model: string;
    voiceName: string;
    language: string;
    onTerminate?: () => void;
  }) {
    const now = new Date().toISOString();
    this.activeSessions.set(info.sessionId, {
      sessionId: info.sessionId,
      channel: info.channel,
      model: info.model,
      voiceName: info.voiceName,
      language: info.language,
      startedAt: now,
      lastActivityAt: now,
      turnCount: 0,
      toolCallsCount: 0,
      status: 'active',
      onTerminate: info.onTerminate,
    });
    if (info.channel === 'gemini_live') {
      this.totalLiveSessionsStarted += 1;
    }
    this.ensureDiagnostic(info.sessionId, info.channel);
  }

  public touchSession(sessionId: string, opts?: { incrementTurn?: boolean; incrementToolCall?: boolean }) {
    const existing = this.activeSessions.get(sessionId);
    const now = new Date().toISOString();
    if (existing) {
      existing.lastActivityAt = now;
      if (opts?.incrementTurn) existing.turnCount += 1;
      if (opts?.incrementToolCall) existing.toolCallsCount += 1;
    }
    const diag = this.diagnostics.get(sessionId);
    if (diag) {
      diag.lastUpdatedAt = now;
      if (opts?.incrementTurn) diag.turns += 1;
      if (opts?.incrementToolCall) diag.toolCalls += 1;
    }
  }

  public unregisterSession(sessionId: string) {
    this.activeSessions.delete(sessionId);
  }

  public terminateSession(sessionId: string): boolean {
    const existing = this.activeSessions.get(sessionId);
    if (!existing) return false;
    existing.status = 'terminating';
    try {
      existing.onTerminate?.();
    } catch {
      // Ignore termination callback errors
    }
    this.activeSessions.delete(sessionId);
    return true;
  }

  public listActiveSessions(): ActiveAiSessionInfo[] {
    return Array.from(this.activeSessions.values()).map(({ onTerminate: _fn, ...rest }) => rest);
  }

  // -------------------------------------------------------------------------
  // Telemetry, Latency, Tokens, Failures & Transcription Diagnostics
  // -------------------------------------------------------------------------

  private ensureDiagnostic(sessionId: string, channel: string): ConversationDiagnosticRecord {
    let diag = this.diagnostics.get(sessionId);
    if (!diag) {
      diag = {
        sessionId,
        channel,
        turns: 0,
        toolCalls: 0,
        policyEnforcements: 0,
        avgLatencyMs: 0,
        lastUpdatedAt: new Date().toISOString(),
      };
      this.diagnostics.set(sessionId, diag);
      if (this.diagnostics.size > 100) {
        const oldest = this.diagnostics.keys().next().value;
        if (oldest) this.diagnostics.delete(oldest);
      }
    }
    return diag;
  }

  public recordTurnTelemetry(params: {
    sessionId?: string;
    channel: 'gemini_live' | 'turn_based' | 'chat';
    latencyMs: number;
    promptTokens?: number;
    outputTokens?: number;
    audioInputTokens?: number;
    audioOutputTokens?: number;
    toolCalls?: number;
    policyEnforced?: boolean;
  }) {
    this.totalRequests += 1;
    if (Number.isFinite(params.latencyMs) && params.latencyMs >= 0) {
      this.latenciesMs.push(Math.round(params.latencyMs));
      if (this.latenciesMs.length > 250) {
        this.latenciesMs.shift();
      }
    }
    if (params.promptTokens && params.promptTokens > 0) this.promptTokens += params.promptTokens;
    if (params.outputTokens && params.outputTokens > 0) this.outputTokens += params.outputTokens;
    if (params.audioInputTokens && params.audioInputTokens > 0) {
      this.audioInputTokens += params.audioInputTokens;
    }
    if (params.audioOutputTokens && params.audioOutputTokens > 0) {
      this.audioOutputTokens += params.audioOutputTokens;
    }
    if (params.toolCalls && params.toolCalls > 0) this.totalToolCalls += params.toolCalls;
    if (params.policyEnforced) this.totalPolicyEnforcements += 1;

    if (params.sessionId) {
      const diag = this.ensureDiagnostic(params.sessionId, params.channel);
      const prevTurns = diag.turns;
      diag.turns += 1;
      if (params.toolCalls) diag.toolCalls += params.toolCalls;
      if (params.policyEnforced) diag.policyEnforcements += 1;
      diag.avgLatencyMs =
        prevTurns === 0
          ? Math.round(params.latencyMs)
          : Math.round((diag.avgLatencyMs * prevTurns + params.latencyMs) / diag.turns);
      diag.lastUpdatedAt = new Date().toISOString();
    }
  }

  public recordFailure(category: string, channel: string, message: string) {
    this.failureCounts[category] = (this.failureCounts[category] || 0) + 1;
    this.recentFailures.unshift({
      id: `err-${crypto.randomUUID().slice(0, 8)}`,
      category,
      channel,
      message: message.slice(0, 240),
      occurredAt: new Date().toISOString(),
    });
    if (this.recentFailures.length > 40) {
      this.recentFailures.pop();
    }
  }

  public recordTranscriptionError(params: {
    sessionId: string;
    originalTranscript: string;
    correctedTranscript: string;
    language: string;
    transportMode: string;
  }): TranscriptionErrorReport {
    const report: TranscriptionErrorReport = {
      id: `txerr-${crypto.randomUUID().slice(0, 8)}`,
      sessionId: params.sessionId.slice(0, 80),
      originalTranscript: params.originalTranscript.slice(0, 500),
      correctedTranscript: params.correctedTranscript.slice(0, 500),
      language: params.language.slice(0, 16),
      transportMode: params.transportMode.slice(0, 40),
      reportedAt: new Date().toISOString(),
    };
    this.transcriptionReports.unshift(report);
    if (this.transcriptionReports.length > 50) {
      this.transcriptionReports.pop();
    }
    return report;
  }

  public getEstimatedCostUsd(): number {
    const cost =
      (this.promptTokens / 1_000_000) * COST_RATES_PER_1M.promptText +
      (this.outputTokens / 1_000_000) * COST_RATES_PER_1M.outputText +
      (this.audioInputTokens / 1_000_000) * COST_RATES_PER_1M.audioInput +
      (this.audioOutputTokens / 1_000_000) * COST_RATES_PER_1M.audioOutput;
    return Number(cost.toFixed(4));
  }

  public getLatencySummary() {
    if (this.latenciesMs.length === 0) {
      return { sampleCount: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, lastMs: 0 };
    }
    const sorted = [...this.latenciesMs].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const p50Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.5));
    const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    return {
      sampleCount: sorted.length,
      avgMs: Math.round(sum / sorted.length),
      p50Ms: sorted[p50Idx],
      p95Ms: sorted[p95Idx],
      lastMs: this.latenciesMs[this.latenciesMs.length - 1],
    };
  }

  public getAdminOverview() {
    const configured = this.isGeminiApiKeyConfigured();
    const estimatedCostUsd = this.getEstimatedCostUsd();
    const budgetUtilizationPct = Number(
      Math.min(100, (estimatedCostUsd / Math.max(1, this.settings.dailyEstimatedBudgetUsd)) * 100).toFixed(1)
    );
    const totalFailures = Object.values(this.failureCounts).reduce((a, b) => a + b, 0);

    const healthState = !configured
      ? 'UNCONFIGURED'
      : totalFailures > 20 || budgetUtilizationPct >= 95
      ? 'DEGRADED'
      : 'HEALTHY';

    return {
      serviceHealth: {
        state: healthState,
        provider: this.settings.aiProvider,
        geminiApiKeyConfigured: configured,
        liveApiAvailable: configured && this.settings.geminiLiveEnabled,
        rawAudioRetained: false,
        lastConfigUpdatedAt: this.lastUpdatedAt,
      },
      config: this.getSettings(),
      allowedOptions: {
        providers: [...ALLOWED_AI_PROVIDERS],
        liveModels: [...ALLOWED_GEMINI_LIVE_MODELS],
        chatModels: [...ALLOWED_GEMINI_CHAT_MODELS],
        ttsModels: [...ALLOWED_GEMINI_TTS_MODELS],
        voices: [...ALLOWED_GEMINI_VOICES],
        languages: [...ALLOWED_AI_LANGUAGES],
      },
      activeSessions: this.listActiveSessions(),
      metrics: {
        totalRequests: this.totalRequests,
        totalLiveSessionsStarted: this.totalLiveSessionsStarted,
        totalToolCalls: this.totalToolCalls,
        totalPolicyEnforcements: this.totalPolicyEnforcements,
        latency: this.getLatencySummary(),
        tokens: {
          promptTokens: this.promptTokens,
          outputTokens: this.outputTokens,
          audioInputTokens: this.audioInputTokens,
          audioOutputTokens: this.audioOutputTokens,
          totalTokens:
            this.promptTokens +
            this.outputTokens +
            this.audioInputTokens +
            this.audioOutputTokens,
        },
        cost: {
          estimatedCostUsd,
          dailyBudgetUsd: this.settings.dailyEstimatedBudgetUsd,
          budgetUtilizationPct,
        },
        failures: {
          total: totalFailures,
          byCategory: { ...this.failureCounts },
          recent: this.recentFailures.slice(0, 15),
        },
      },
      transcriptionErrors: this.transcriptionReports.slice(0, 20),
      conversationDiagnostics: Array.from(this.diagnostics.values())
        .sort((a, b) => b.lastUpdatedAt.localeCompare(a.lastUpdatedAt))
        .slice(0, 20),
    };
  }
}
