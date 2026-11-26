/**
 * Private Authenticated Client for DESTRIA Local AI Inference Service (`services/ai-inference`).
 *
 * Security & Cost Governance Guarantees (DTI-HELIX-IMPLEMENTATION-002):
 * - Communicates exclusively over private configured `AI_INFERENCE_BASE_URL` with
 *   `X-Service-Auth: Bearer <AI_INFERENCE_SHARED_SECRET>`.
 * - Enforces `AI_PROVIDER_MODE` (`local_inference` | `governed_deterministic` | `gemini_authorized`).
 * - NEVER invokes paid Gemini APIs as an automatic fallback when local inference fails or is offline.
 * - Implements bounded timeouts, AbortController + `/v1/cancel/:requestId` barge-in cancellation,
 *   and an automatic circuit breaker.
 */

export type AiProviderMode = 'local_inference' | 'governed_deterministic' | 'gemini_authorized';

export interface LocalInferenceConfig {
  providerMode: AiProviderMode;
  baseUrl: string;
  sharedSecret: string;
  timeoutMs: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
}

export interface LocalVadResponse {
  speechDetected: boolean;
  probability: number;
  speechStart: boolean;
  speechEnd: boolean;
  backend: string;
  latencyMs: number;
}

export interface LocalSttResponse {
  text: string;
  language: string;
  languageProbability: number;
  durationSec: number;
  latencyMs: number;
  deviceUsed: string;
  beamSizeUsed: number;
}

export interface LocalLlmReplyResponse {
  replyText: string;
  model: string;
  tokensGenerated: number;
  latencyMs: number;
  cancelled?: boolean;
}

export interface LocalTtsResponse {
  audioBase64: string;
  mimeType: string;
  sampleRate: number;
  durationMs?: number;
  voiceUsed: string;
  chunkCount: number;
  latencyMs: number;
  espeakUsed: boolean;
}

export interface LocalInferenceHealth {
  configured: boolean;
  reachable: boolean;
  ready: boolean;
  providerMode: AiProviderMode;
  circuitBreakerOpen: boolean;
  consecutiveFailures: number;
  checkedAt: string;
  workerSnapshot: Record<string, unknown> | null;
  error?: string;
}

export class LocalInferenceUnavailableError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly retryable: boolean;

  constructor(message: string, code = 'INFERENCE_SERVICE_UNAVAILABLE', statusCode = 503, retryable = true) {
    super(message);
    this.name = 'LocalInferenceUnavailableError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

export function resolveAiProviderMode(rawMode?: string, hasLocalBaseUrl?: boolean): AiProviderMode {
  const cleaned = (rawMode || '').trim().toLowerCase();
  if (cleaned === 'gemini_authorized') return 'gemini_authorized';
  if (cleaned === 'governed_deterministic') return 'governed_deterministic';
  if (cleaned === 'local_inference') return 'local_inference';
  return hasLocalBaseUrl ? 'local_inference' : 'governed_deterministic';
}

export class LocalInferenceClient {
  private readonly config: LocalInferenceConfig;
  private readonly fetchImpl: typeof fetch;
  private consecutiveFailures = 0;
  private circuitOpenedAt: number | null = null;
  private lastHealthCache: { at: number; snapshot: LocalInferenceHealth } | null = null;
  private readonly activeControllers = new Map<string, AbortController>();

  constructor(
    overrides?: Partial<LocalInferenceConfig>,
    fetchImpl: typeof fetch = globalThis.fetch
  ) {
    const baseUrl = (overrides?.baseUrl ?? process.env.AI_INFERENCE_BASE_URL ?? '').trim().replace(/\/+$/, '');
    const sharedSecret = (overrides?.sharedSecret ?? process.env.AI_INFERENCE_SHARED_SECRET ?? '').trim();
    const providerMode =
      overrides?.providerMode ?? resolveAiProviderMode(process.env.AI_PROVIDER_MODE, Boolean(baseUrl));
    this.config = {
      providerMode,
      baseUrl,
      sharedSecret,
      timeoutMs: Math.max(1000, overrides?.timeoutMs ?? Number(process.env.AI_INFERENCE_TIMEOUT_MS || 15000)),
      circuitBreakerThreshold: Math.max(
        1,
        overrides?.circuitBreakerThreshold ?? Number(process.env.AI_INFERENCE_CB_FAILURE_THRESHOLD || 5)
      ),
      circuitBreakerResetMs: Math.max(
        2000,
        overrides?.circuitBreakerResetMs ?? Number(process.env.AI_INFERENCE_CB_RESET_MS || 30000)
      ),
    };
    this.fetchImpl = fetchImpl;
  }

  public get providerMode(): AiProviderMode {
    return this.config.providerMode;
  }

  public get isConfigured(): boolean {
    return Boolean(this.config.baseUrl && this.config.sharedSecret.length >= 16);
  }

  public isPaidGeminiAuthorized(): boolean {
    return this.config.providerMode === 'gemini_authorized';
  }

  public isCircuitOpen(): boolean {
    if (this.circuitOpenedAt === null) return false;
    if (Date.now() - this.circuitOpenedAt >= this.config.circuitBreakerResetMs) {
      // Half-open recovery
      this.circuitOpenedAt = null;
      this.consecutiveFailures = Math.max(0, this.config.circuitBreakerThreshold - 1);
      return false;
    }
    return true;
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.circuitOpenedAt = null;
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.config.circuitBreakerThreshold) {
      this.circuitOpenedAt = Date.now();
    }
  }

  private async requestJson<T>(
    endpoint: string,
    options: {
      method: 'GET' | 'POST';
      body?: unknown;
      timeoutMs?: number;
      requestId?: string;
    }
  ): Promise<T> {
    if (!this.isConfigured) {
      throw new LocalInferenceUnavailableError(
        'Local AI inference worker is not configured on this server.',
        'INFERENCE_NOT_CONFIGURED',
        503,
        false
      );
    }

    if (this.isCircuitOpen()) {
      throw new LocalInferenceUnavailableError(
        'Local AI inference circuit breaker is temporarily open after repeated errors.',
        'CIRCUIT_BREAKER_OPEN',
        503,
        true
      );
    }

    const controller = new AbortController();
    if (options.requestId) {
      this.activeControllers.set(options.requestId, controller);
    }
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? this.config.timeoutMs);

    try {
      const res = await this.fetchImpl(`${this.config.baseUrl}${endpoint}`, {
        method: options.method,
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Auth': `Bearer ${this.config.sharedSecret}`,
          ...(options.requestId ? { 'X-Request-Id': options.requestId } : {}),
        },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal,
      });

      const payload = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        if (res.status >= 500 || res.status === 429) {
          this.recordFailure();
        }
        const detailCode = payload?.detail?.code || payload?.code || 'INFERENCE_ERROR';
        const detailMsg =
          payload?.detail?.message || payload?.error || `Inference worker returned HTTP ${res.status}.`;
        throw new LocalInferenceUnavailableError(detailMsg, String(detailCode), res.status, res.status >= 500 || res.status === 429);
      }

      this.recordSuccess();
      return payload as T;
    } catch (err: any) {
      if (err instanceof LocalInferenceUnavailableError) {
        throw err;
      }
      if (err?.name === 'AbortError') {
        throw new LocalInferenceUnavailableError(
          'Local AI inference request timed out or was cancelled.',
          'INFERENCE_TIMEOUT_OR_CANCELLED',
          504,
          true
        );
      }
      this.recordFailure();
      throw new LocalInferenceUnavailableError(
        'Local AI inference service is currently unreachable.',
        'INFERENCE_SERVICE_UNAVAILABLE',
        503,
        true
      );
    } finally {
      clearTimeout(timer);
      if (options.requestId) {
        this.activeControllers.delete(options.requestId);
      }
    }
  }

  public async cancelRequest(requestId: string): Promise<boolean> {
    const controller = this.activeControllers.get(requestId);
    if (controller) {
      try {
        controller.abort();
      } catch {
        // Ignore abort errors
      }
      this.activeControllers.delete(requestId);
    }
    if (!this.isConfigured) return Boolean(controller);
    try {
      await this.fetchImpl(`${this.config.baseUrl}/v1/cancel/${encodeURIComponent(requestId)}`, {
        method: 'POST',
        headers: { 'X-Service-Auth': `Bearer ${this.config.sharedSecret}` },
      });
      return true;
    } catch {
      return Boolean(controller);
    }
  }

  public async probeHealth(forceRefresh = false): Promise<LocalInferenceHealth> {
    const now = Date.now();
    if (!forceRefresh && this.lastHealthCache && now - this.lastHealthCache.at < 5000) {
      return this.lastHealthCache.snapshot;
    }

    if (!this.isConfigured) {
      const unconfigured: LocalInferenceHealth = {
        configured: false,
        reachable: false,
        ready: false,
        providerMode: this.config.providerMode,
        circuitBreakerOpen: this.isCircuitOpen(),
        consecutiveFailures: this.consecutiveFailures,
        checkedAt: new Date(now).toISOString(),
        workerSnapshot: null,
        error: 'AI_INFERENCE_BASE_URL or AI_INFERENCE_SHARED_SECRET is not configured.',
      };
      this.lastHealthCache = { at: now, snapshot: unconfigured };
      return unconfigured;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await this.fetchImpl(`${this.config.baseUrl}/v1/ready`, {
        method: 'GET',
        headers: { 'X-Service-Auth': `Bearer ${this.config.sharedSecret}` },
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const ready = res.ok && Boolean(json?.ready);
      const snapshot: LocalInferenceHealth = {
        configured: true,
        reachable: true,
        ready,
        providerMode: this.config.providerMode,
        circuitBreakerOpen: this.isCircuitOpen(),
        consecutiveFailures: this.consecutiveFailures,
        checkedAt: new Date(now).toISOString(),
        workerSnapshot: json,
        ...(ready ? {} : { error: `Worker reported ready=false (HTTP ${res.status}).` }),
      };
      this.lastHealthCache = { at: now, snapshot };
      return snapshot;
    } catch (err: any) {
      const snapshot: LocalInferenceHealth = {
        configured: true,
        reachable: false,
        ready: false,
        providerMode: this.config.providerMode,
        circuitBreakerOpen: this.isCircuitOpen(),
        consecutiveFailures: this.consecutiveFailures,
        checkedAt: new Date(now).toISOString(),
        workerSnapshot: null,
        error: err?.name === 'AbortError' ? 'Inference readiness probe timed out.' : 'Inference worker unreachable.',
      };
      this.lastHealthCache = { at: now, snapshot };
      return snapshot;
    } finally {
      clearTimeout(timer);
    }
  }

  public async detectVad(params: {
    sessionId: string;
    pcm16Base64: string;
    sampleRate?: number;
    resetState?: boolean;
  }): Promise<LocalVadResponse> {
    return this.requestJson<LocalVadResponse>('/v1/vad', {
      method: 'POST',
      timeoutMs: 2500,
      body: {
        sessionId: params.sessionId,
        sampleRate: params.sampleRate ?? 16000,
        pcm16Base64: params.pcm16Base64,
        resetState: Boolean(params.resetState),
      },
    });
  }

  public async transcribeAudio(params: {
    sessionId?: string;
    requestId?: string;
    audioBase64: string;
    sampleRate?: number;
    languageHint?: string;
    beamSize?: number;
  }): Promise<LocalSttResponse> {
    return this.requestJson<LocalSttResponse>('/v1/stt', {
      method: 'POST',
      requestId: params.requestId,
      body: {
        sessionId: params.sessionId,
        requestId: params.requestId,
        audioBase64: params.audioBase64,
        sampleRate: params.sampleRate ?? 16000,
        languageHint: params.languageHint,
        beamSize: params.beamSize,
      },
    });
  }

  public async generateReply(params: {
    sessionId: string;
    requestId?: string;
    systemPrompt: string;
    userMessage: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    knowledgeContext: string[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<LocalLlmReplyResponse> {
    const raw = await this.requestJson<any>('/v1/llm/reply', {
      method: 'POST',
      requestId: params.requestId,
      body: {
        sessionId: params.sessionId,
        requestId: params.requestId,
        systemPrompt: params.systemPrompt,
        userMessage: params.userMessage,
        history: params.history,
        knowledgeContext: params.knowledgeContext,
        temperature: params.temperature ?? 0.35,
        maxTokens: params.maxTokens ?? 320,
      },
    });
    const replyText = String(raw?.replyText ?? raw?.reply_text ?? '').trim();
    if (!replyText) {
      throw new LocalInferenceUnavailableError(
        'Local AI inference worker returned an empty reply.',
        'EMPTY_LLM_REPLY',
        502,
        true
      );
    }
    return {
      replyText,
      model: String(raw?.model ?? 'qwen2.5:7b-instruct'),
      tokensGenerated: Number(raw?.tokensGenerated ?? raw?.tokens_generated ?? 0),
      latencyMs: Number(raw?.latencyMs ?? raw?.latency_ms ?? 0),
      cancelled: Boolean(raw?.cancelled),
    };
  }

  public async synthesizeSpeech(params: {
    requestId?: string;
    text: string;
    language?: string;
    voiceId?: string;
    speed?: number;
    format?: 'wav' | 'pcm16';
  }): Promise<LocalTtsResponse> {
    const raw = await this.requestJson<any>('/v1/tts', {
      method: 'POST',
      requestId: params.requestId,
      body: {
        requestId: params.requestId,
        text: params.text,
        language: params.language ?? 'en-US',
        voiceId: params.voiceId,
        speed: params.speed ?? 1.0,
        format: params.format ?? 'wav',
      },
    });
    return {
      audioBase64: String(raw?.audioBase64 ?? raw?.audio_base64 ?? ''),
      mimeType: String(raw?.mimeType ?? raw?.mime_type ?? 'audio/wav'),
      sampleRate: Number(raw?.sampleRate ?? raw?.sample_rate ?? 24000),
      durationMs: Number(raw?.durationMs ?? raw?.duration_ms ?? 0),
      voiceUsed: String(raw?.voiceUsed ?? raw?.voice_used ?? 'af_heart'),
      chunkCount: Number(raw?.chunkCount ?? raw?.chunk_count ?? 1),
      latencyMs: Number(raw?.latencyMs ?? raw?.latency_ms ?? 0),
      espeakUsed: Boolean(raw?.espeakUsed ?? raw?.espeak_used ?? raw?.espeakGplEnabled ?? raw?.espeak_gpl_enabled ?? false),
    };
  }
}
