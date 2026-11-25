import crypto from 'crypto';
import type { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  FunctionResponseScheduling,
  GoogleGenAI,
  InteractionStatus,
  LiveServerMessage,
  Modality,
  ThinkingLevel,
} from '@google/genai';
import { CATALOG_DIVISION_SUMMARIES } from '../data/serviceCatalog';
import {
  CORPORATE_KNOWLEDGE_BASE,
  CORPORATE_KNOWLEDGE_VERSION,
} from '../data/corporateKnowledgeBase';
import {
  MANDATORY_AI_SYSTEM_INSTRUCTION,
  enforceCommercialPolicyOnOutput,
} from './aiCommercialPolicy';
import { AiRuntimeConfigRegistry } from './aiRuntimeConfig';
import { AIToolsExecutor, getGeminiFunctionDeclarations } from './aiToolsEngine';
import { logStructured } from './logger';

export const VOICE_LIVE_WS_PATH = '/api/voice/live';
export const GEMINI_LIVE_MODEL = 'gemini-3.8-live';
export const GEMINI_LIVE_VOICE_NAME = 'Kore';

export interface VoiceLiveBridgeOptions {
  ai: GoogleGenAI | null;
  runtimeConfig?: AiRuntimeConfigRegistry;
  toolsExecutor?: AIToolsExecutor;
  allowedOrigins?: string[];
  maxConnectionsPerIpPerMinute?: number;
}

interface ClientLiveMessage {
  type:
    | 'init'
    | 'audio'
    | 'text'
    | 'correct_transcript'
    | 'interrupt'
    | 'activity_start'
    | 'activity_end'
    | 'ping';
  sessionId?: string;
  resumptionHandle?: string;
  language?: string;
  data?: string;
  text?: string;
  originalTranscript?: string;
  correctedTranscript?: string;
  history?: Array<{ sender: 'user' | 'ai'; text: string }>;
}

const DEFAULT_ALLOWED_ORIGINS = [
  'https://destriatech.com',
  'https://www.destriatech.com',
  'https://ophireumtechnology.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function getUpgradeClientIp(req: IncomingMessage): string {
  const trustProxy =
    process.env.TRUST_PROXY === 'true' ||
    process.env.TRUST_PROXY === '1' ||
    Boolean(process.env.RAILWAY_ENVIRONMENT);
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.trim()) {
      const hops = fwd
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean);
      // Rightmost hop added by the trusted reverse proxy resists client spoofing
      if (hops.length > 0) {
        return hops[hops.length - 1];
      }
    }
  }
  return req.socket?.remoteAddress || 'unknown';
}

function isOriginAllowed(req: IncomingMessage, allowedOrigins: string[]): boolean {
  const origin = req.headers.origin;
  // Same-origin non-browser or server-to-server requests without Origin header
  if (!origin) return true;
  const cleanOrigin = origin.replace(/\/$/, '');
  if (allowedOrigins.includes(cleanOrigin)) return true;

  // Allow matching Host header (same-origin WS upgrade behind reverse proxy)
  const host = req.headers.host;
  if (host) {
    if (cleanOrigin === `https://${host}` || cleanOrigin === `http://${host}`) {
      return true;
    }
  }
  if (process.env.NODE_ENV !== 'production' && cleanOrigin.endsWith('.run.app')) {
    return true;
  }
  return false;
}

function buildCompactCorporateGrounding(): string {
  return CORPORATE_KNOWLEDGE_BASE.map((e) => `• ${e.title}: ${e.summary}`).join('\n');
}

function buildLiveSystemInstruction(
  language: string,
  multilingualEnabled: boolean,
  history?: Array<{ sender: 'user' | 'ai'; text: string }>
): string {
  const langLabel = language.startsWith('fil')
    ? 'natural Filipino or Taglish (matching the speaker)'
    : language.startsWith('es')
    ? 'natural, warm Spanish'
    : language.startsWith('fr')
    ? 'natural, warm French'
    : 'clear, warm, natural English (or automatically matching whatever language the user speaks)';
  const recentTurns = Array.isArray(history)
    ? history
        .slice(-12)
        .filter((h) => h && typeof h.text === 'string' && h.text.trim())
        .map((h) => `${h.sender === 'user' ? 'User' : 'Assistant'}: ${h.text.slice(0, 320)}`)
        .join('\n')
    : '';

  return `${MANDATORY_AI_SYSTEM_INSTRUCTION}

CORPORATE KNOWLEDGE REPOSITORY (Version ${CORPORATE_KNOWLEDGE_VERSION}):
${buildCompactCorporateGrounding()}

OFFICIAL 10-CATEGORY ENTERPRISE TECHNOLOGY DIVISIONS (CUSTOMIZED SOLUTIONS — ZERO PUBLIC PRICING):
${CATALOG_DIVISION_SUMMARIES.map((d) => `${Number(d.number)}. ${d.label}`).join(', ')}.

REAL-TIME NATURAL VOICE CONVERSATION DIRECTIVES:
- You are the helpful, intelligent AI voice assistant for DESTRIA TECH INC (always transparently identify as an AI assistant—never claim to be human, never invent human family/life stories, and never act as an authorized corporate signatory).
- Speak naturally, warmly, and clearly in ${langLabel}, adapting your tone and length to match the user effortlessly.
- ${
    multilingualEnabled
      ? 'Automatically understand and respond naturally in English, Filipino, Taglish, Spanish, French, and other spoken languages, including mid-conversation language switches without resetting conversation memory.'
      : 'Prioritize clear English comprehension.'
  }
- Engage warmly in casual conversation, honest personal questions about yourself as an AI, general knowledge, and technology discussions WITHOUT forcing the conversation into corporate sales scripts or consultation requests.
- Only discuss DESTRIA TECH INC services, corporate resources, or consultations—and ONLY invoke enterprise tools—when relevant to what the user asks.
- Handle incomplete thoughts, interruptions (barge-in), follow-up references, subject changes, and user corrections smoothly without restarting or re-asking details already shared.
- If the user's audio is unclear, muffled, or ambiguous, politely ask for brief clarification instead of guessing or fabricating facts.
- CRITICAL CONFIRMATION RULE: NEVER call submit_consultation_request or submit_service_inquiry without FIRST calling prepare_consultation_request / prepare_service_inquiry, reading the exact summary back, and receiving explicit client verbal or UI confirmation.
- Keep spoken replies concise, conversational, and easy to interrupt (typically 1 to 3 clear spoken sentences), with zero markdown, zero bullets, zero asterisks, and zero system labels.
${recentTurns ? `\nPRIOR CONVERSATION MEMORY:\n${recentTurns}` : ''}`;
}

function sendJsonSafe(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

/**
 * Attaches the hardened server-side Gemini Live WebSocket bridge at /api/voice/live.
 * Supports both the legacy 2-argument signature `(httpServer, ai)` and the full
 * options object `(httpServer, { ai, runtimeConfig, toolsExecutor, allowedOrigins })`.
 */
export function attachVoiceLiveBridge(
  httpServer: HttpServer,
  aiOrOptions: GoogleGenAI | null | VoiceLiveBridgeOptions
) {
  const opts: VoiceLiveBridgeOptions =
    aiOrOptions && typeof aiOrOptions === 'object' && 'ai' in aiOrOptions
      ? aiOrOptions
      : { ai: aiOrOptions as GoogleGenAI | null };

  const ai = opts.ai;
  const runtimeConfig = opts.runtimeConfig || new AiRuntimeConfigRegistry({ geminiConfiguredOverride: Boolean(ai) });
  const toolsExecutor = opts.toolsExecutor;
  const allowedOrigins = opts.allowedOrigins || DEFAULT_ALLOWED_ORIGINS;
  const maxConnPerMin = opts.maxConnectionsPerIpPerMinute ?? 30;
  const ipConnectionTimestamps = new Map<string, number[]>();

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 2 * 1024 * 1024, // 2MB max frame guard
  });
  const activeCleanups = new Set<() => void>();

  const checkUpgradeRateLimit = (ip: string): boolean => {
    const now = Date.now();
    const recent = (ipConnectionTimestamps.get(ip) || []).filter((ts) => now - ts < 60_000);
    if (recent.length >= maxConnPerMin) {
      ipConnectionTimestamps.set(ip, recent);
      return false;
    }
    recent.push(now);
    ipConnectionTimestamps.set(ip, recent);
    return true;
  };

  const handleUpgrade = (req: IncomingMessage, socket: any, head: Buffer) => {
    const pathname = (req.url || '').split('?')[0];
    if (pathname !== VOICE_LIVE_WS_PATH) return;

    if (!isOriginAllowed(req, allowedOrigins)) {
      logStructured('warn', 'voice_live_ws_origin_blocked', {
        origin: req.headers.origin,
        host: req.headers.host,
      });
      socket.write('HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nOrigin not allowed');
      socket.destroy();
      return;
    }

    const clientIp = getUpgradeClientIp(req);
    if (!checkUpgradeRateLimit(clientIp)) {
      runtimeConfig.recordFailure('rate_limited', 'gemini_live', 'WebSocket upgrade rate limit exceeded');
      socket.write('HTTP/1.1 429 Too Many Requests\r\nContent-Type: text/plain\r\n\r\nToo many connections');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  };

  httpServer.on('upgrade', handleUpgrade);

  wss.on('connection', (clientWs: WebSocket) => {
    if (!ai) {
      sendJsonSafe(clientWs, {
        type: 'error',
        code: 'LIVE_UNAVAILABLE',
        message: 'Gemini Live streaming is currently unavailable. Switching to continuous voice consultation mode.',
      });
      try {
        clientWs.close(1011, 'Gemini Live unavailable');
      } catch {
        // Ignore close errors
      }
      return;
    }

    let liveSession: any = null;
    let isClosing = false;
    let initStarted = false;
    let readyEmitted = false;
    let sessionId = `dti-live-${crypto.randomUUID().slice(0, 12)}`;
    let sessionRegistered = false;
    let accumulatedInputTranscript = '';
    let lastFinalInputTranscript = '';
    let accumulatedOutputTranscript = '';
    let policyBlockedCurrentTurn = false;
    let currentTurnStartedAt: number | null = null;
    let turnCount = 0;
    let activeModel = runtimeConfig.getSettings().geminiLiveModel;
    let activeVoice = runtimeConfig.getSettings().geminiVoiceName;
    let activeLanguage = runtimeConfig.getSettings().defaultLanguage;
    let sessionTtlTimer: ReturnType<typeof setTimeout> | null = null;
    let idleTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (isClosing) return;
      isClosing = true;
      activeCleanups.delete(cleanup);
      if (sessionTtlTimer) {
        clearTimeout(sessionTtlTimer);
        sessionTtlTimer = null;
      }
      if (idleTimeoutTimer) {
        clearTimeout(idleTimeoutTimer);
        idleTimeoutTimer = null;
      }
      if (sessionRegistered) {
        runtimeConfig.unregisterSession(sessionId);
        sessionRegistered = false;
      }
      if (liveSession) {
        try {
          liveSession.close();
        } catch {
          // Ignore close errors
        }
        liveSession = null;
      }
    };
    activeCleanups.add(cleanup);

    const resetIdleTimer = () => {
      if (idleTimeoutTimer) clearTimeout(idleTimeoutTimer);
      idleTimeoutTimer = setTimeout(() => {
        sendJsonSafe(clientWs, {
          type: 'session_expired',
          reason: 'Voice session closed due to inactivity.',
        });
        cleanup();
        try {
          clientWs.close(1000, 'Idle timeout');
        } catch {
          // Ignore
        }
      }, 5 * 60 * 1000);
      idleTimeoutTimer.unref?.();
    };

    const flushPendingInputTranscript = () => {
      const finalized = accumulatedInputTranscript.trim();
      if (finalized && finalized.toLowerCase() !== lastFinalInputTranscript.toLowerCase()) {
        lastFinalInputTranscript = finalized;
        sendJsonSafe(clientWs, {
          type: 'input_transcript',
          text: finalized,
          isFinal: true,
        });
      }
      accumulatedInputTranscript = '';
    };

    clientWs.on('close', cleanup);
    clientWs.on('error', cleanup);

    clientWs.on('message', async (rawData) => {
      if (isClosing) return;
      let parsed: ClientLiveMessage;
      try {
        parsed = JSON.parse(rawData.toString());
      } catch {
        return;
      }

      if (parsed.type === 'ping') {
        sendJsonSafe(clientWs, { type: 'pong', ts: Date.now() });
        return;
      }

      resetIdleTimer();

      if (parsed.type === 'init') {
        if (initStarted) {
          // Idempotent guard against duplicate init frames on the same socket
          if (readyEmitted) {
            const currentSettings = runtimeConfig.getSettings();
            sendJsonSafe(clientWs, {
              type: 'ready',
              sessionId,
              model: activeModel,
              voice: activeVoice,
              language: activeLanguage,
              bargeInEnabled: currentSettings.bargeInEnabled,
              transcriptionEnabled: currentSettings.transcriptionEnabled,
              inputSampleRate: 16000,
              outputSampleRate: 24000,
            });
          }
          return;
        }
        initStarted = true;

        const settings = runtimeConfig.getSettings();
        const quotaCheck = runtimeConfig.canAcceptLiveSession();
        if (!ai || !quotaCheck.allowed) {
          initStarted = false;
          runtimeConfig.recordFailure(
            'live_unavailable',
            'gemini_live',
            quotaCheck.reason || 'Gemini Live API unconfigured'
          );
          sendJsonSafe(clientWs, {
            type: 'error',
            code: 'LIVE_UNAVAILABLE',
            fallbackAllowed: settings.browserFallbackEnabled,
            message:
              quotaCheck.reason ||
              'Gemini Live streaming requires server-side GEMINI_API_KEY configuration. Falling back to continuous turn-based voice mode.',
          });
          cleanup();
          clientWs.close(1000, 'Gemini Live unavailable');
          return;
        }

        if (parsed.sessionId && /^dti-[a-zA-Z0-9_-]{6,64}$/.test(parsed.sessionId)) {
          sessionId = parsed.sessionId;
        }
        activeModel = settings.geminiLiveModel;
        activeVoice = settings.geminiVoiceName;
        const requestedLang = typeof parsed.language === 'string' ? parsed.language.trim() : '';
        activeLanguage =
          /^(?:en-US|fil-PH|es-ES|fr-FR|de-DE|ja-JP|ko-KR|zh-CN)$/.test(requestedLang)
            ? (requestedLang as typeof activeLanguage)
            : settings.defaultLanguage;

        const isExtendedThinking = activeModel === 'gemini-3.8-live-extended-thinking';
        const functionDeclarations = toolsExecutor
          ? getGeminiFunctionDeclarations({ nonBlocking: isExtendedThinking })
          : [];

        const emitReadyOnce = () => {
          if (isClosing || readyEmitted) return;
          readyEmitted = true;
          if (!sessionRegistered) {
            runtimeConfig.registerSession({
              sessionId,
              channel: 'gemini_live',
              model: activeModel,
              voiceName: activeVoice,
              language: activeLanguage,
              onTerminate: () => {
                sendJsonSafe(clientWs, {
                  type: 'session_terminated',
                  reason: 'Session terminated by administrator.',
                });
                cleanup();
                try {
                  clientWs.close(1000, 'Terminated by administrator');
                } catch {
                  // Ignore
                }
              },
            });
            sessionRegistered = true;
          }

          if (!sessionTtlTimer) {
            sessionTtlTimer = setTimeout(() => {
              sendJsonSafe(clientWs, {
                type: 'session_expired',
                reason: `Maximum session duration (${settings.sessionTtlMinutes} minutes) reached.`,
              });
              cleanup();
              try {
                clientWs.close(1000, 'Session TTL reached');
              } catch {
                // Ignore
              }
            }, settings.sessionTtlMinutes * 60 * 1000);
            sessionTtlTimer.unref?.();
          }

          sendJsonSafe(clientWs, {
            type: 'ready',
            sessionId,
            model: activeModel,
            voice: activeVoice,
            language: activeLanguage,
            bargeInEnabled: settings.bargeInEnabled,
            transcriptionEnabled: settings.transcriptionEnabled,
            inputSampleRate: 16000,
            outputSampleRate: 24000,
          });
        };

        try {
          const liveConfig: Record<string, unknown> = {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: activeVoice },
              },
            },
            systemInstruction: buildLiveSystemInstruction(
              activeLanguage,
              settings.multilingualEnabled,
              parsed.history
            ),
            ...(settings.transcriptionEnabled
              ? {
                  inputAudioTranscription: {},
                  outputAudioTranscription: {},
                }
              : {}),
            ...(parsed.resumptionHandle
              ? { sessionResumption: { handle: parsed.resumptionHandle } }
              : { sessionResumption: {} }),
            ...(functionDeclarations.length > 0
              ? { tools: [{ functionDeclarations }] }
              : {}),
            ...(isExtendedThinking
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          };

          const connectedSession = await ai.live.connect({
            model: activeModel,
            config: liveConfig as any,
            callbacks: {
              onopen: () => {
                emitReadyOnce();
              },
              onmessage: async (message: LiveServerMessage) => {
                if (isClosing) return;

                // Session resumption handle update for seamless reconnect
                const resumption = (message as any).sessionResumptionUpdate;
                if (resumption?.newHandle) {
                  sendJsonSafe(clientWs, {
                    type: 'resumption_update',
                    handle: String(resumption.newHandle),
                    resumable: Boolean(resumption.resumable),
                  });
                }

                // Token usage telemetry
                const usage = (message as any).usageMetadata;
                if (usage) {
                  runtimeConfig.recordTurnTelemetry({
                    sessionId,
                    channel: 'gemini_live',
                    latencyMs: currentTurnStartedAt ? Date.now() - currentTurnStartedAt : 0,
                    promptTokens: Number(usage.promptTokenCount || 0),
                    outputTokens: Number(usage.responseTokenCount || 0),
                  });
                }

                // Server-validated Gemini Function Calling execution
                const toolCalls = message.toolCall?.functionCalls;
                if (toolCalls && toolCalls.length > 0 && toolsExecutor) {
                  flushPendingInputTranscript();
                  sendJsonSafe(clientWs, {
                    type: 'understanding',
                    tools: toolCalls.map((c) => c.name),
                  });

                  const functionResponses: any[] = [];
                  for (const call of toolCalls) {
                    const toolName = call.name || '';
                    const toolArgs =
                      call.args && typeof call.args === 'object'
                        ? (call.args as Record<string, unknown>)
                        : {};
                    const outcome = await toolsExecutor.executeTool(sessionId, toolName, toolArgs, {
                      sourceChannel: 'AI Voice',
                    });
                    runtimeConfig.touchSession(sessionId, { incrementToolCall: true });

                    if (outcome.uiEvent) {
                      sendJsonSafe(clientWs, {
                        type: 'tool_event',
                        toolName,
                        eventType: outcome.uiEvent.type,
                        payload: outcome.uiEvent.payload,
                        event: outcome.uiEvent,
                      });
                    }

                    functionResponses.push({
                      id: call.id,
                      name: toolName,
                      response: outcome.data,
                      ...(isExtendedThinking
                        ? { scheduling: FunctionResponseScheduling.WHEN_IDLE }
                        : {}),
                    });
                  }

                  try {
                    liveSession?.sendToolResponse({ functionResponses });
                  } catch (toolErr: any) {
                    runtimeConfig.recordFailure(
                      'live_tool_response_failed',
                      'gemini_live',
                      toolErr?.message || 'Failed to send tool response'
                    );
                  }
                }

                const content = message.serverContent;
                if (!content) return;

                // Barge-in interruption signaled by Gemini Live
                if (content.interrupted) {
                  accumulatedOutputTranscript = '';
                  policyBlockedCurrentTurn = false;
                  sendJsonSafe(clientWs, { type: 'interrupted' });
                }

                // Streaming user input transcription (accumulate partials cleanly without duplicates)
                if (content.inputTranscription?.text) {
                  if (!currentTurnStartedAt) currentTurnStartedAt = Date.now();
                  accumulatedInputTranscript = `${accumulatedInputTranscript}${content.inputTranscription.text}`;
                  const partialClean = accumulatedInputTranscript.trim();
                  if (partialClean) {
                    sendJsonSafe(clientWs, {
                      type: 'input_transcript',
                      text: partialClean,
                      isFinal: false,
                    });
                  }
                }

                // Streaming model output transcription + server-side commercial pricing enforcement
                if (content.outputTranscription?.text) {
                  flushPendingInputTranscript();
                  accumulatedOutputTranscript = `${accumulatedOutputTranscript}${content.outputTranscription.text}`;
                  const livePolicyCheck = enforceCommercialPolicyOnOutput(
                    accumulatedOutputTranscript,
                    lastFinalInputTranscript
                  );
                  if (livePolicyCheck.enforced && !policyBlockedCurrentTurn) {
                    policyBlockedCurrentTurn = true;
                    runtimeConfig.recordTurnTelemetry({
                      sessionId,
                      channel: 'gemini_live',
                      latencyMs: currentTurnStartedAt ? Date.now() - currentTurnStartedAt : 0,
                      policyEnforced: true,
                    });
                    // Stop any further model audio for this turn & replace with approved corporate response
                    sendJsonSafe(clientWs, { type: 'interrupted' });
                    sendJsonSafe(clientWs, {
                      type: 'policy_override',
                      text: livePolicyCheck.replyText,
                    });
                  } else if (!policyBlockedCurrentTurn) {
                    sendJsonSafe(clientWs, {
                      type: 'output_transcript',
                      text: accumulatedOutputTranscript.trim(),
                      isFinal: false,
                    });
                  }
                }

                // 24kHz PCM audio output chunks (suppressed if commercial policy was violated)
                if (!policyBlockedCurrentTurn) {
                  for (const part of content.modelTurn?.parts ?? []) {
                    if (part.inlineData?.data) {
                      flushPendingInputTranscript();
                      sendJsonSafe(clientWs, {
                        type: 'audio',
                        data: part.inlineData.data,
                        mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000',
                      });
                    }
                  }
                }

                const interactionStatus = (content as any).interactionStatus;
                const isTurnFinished = isExtendedThinking
                  ? interactionStatus === InteractionStatus.IDLE
                  : Boolean(content.turnComplete);

                if (isTurnFinished) {
                  flushPendingInputTranscript();
                  turnCount += 1;
                  runtimeConfig.touchSession(sessionId, { incrementTurn: true });
                  const latencyMs = currentTurnStartedAt ? Date.now() - currentTurnStartedAt : 0;
                  runtimeConfig.recordTurnTelemetry({
                    sessionId,
                    channel: 'gemini_live',
                    latencyMs,
                    policyEnforced: policyBlockedCurrentTurn,
                  });
                  currentTurnStartedAt = null;

                  const rawFinal = accumulatedOutputTranscript.trim();
                  const enforced = rawFinal
                    ? enforceCommercialPolicyOnOutput(rawFinal, lastFinalInputTranscript)
                    : { replyText: '', enforced: false };

                  sendJsonSafe(clientWs, {
                    type: 'turn_complete',
                    text: enforced.replyText,
                    policyEnforced: enforced.enforced || policyBlockedCurrentTurn,
                    turnNumber: turnCount,
                    latencyMs,
                  });

                  accumulatedOutputTranscript = '';
                  policyBlockedCurrentTurn = false;

                  if (turnCount >= settings.maxTurnsPerSession) {
                    sendJsonSafe(clientWs, {
                      type: 'session_expired',
                      reason: `Maximum session turn limit (${settings.maxTurnsPerSession}) reached. Please start a new session to continue.`,
                    });
                    cleanup();
                    clientWs.close(1000, 'Max turns reached');
                  }
                }
              },
              onerror: (err: any) => {
                logStructured('warn', 'voice_live_upstream_error', {
                  sessionId,
                  error: err?.message || String(err),
                });
                runtimeConfig.recordFailure(
                  'live_upstream_error',
                  'gemini_live',
                  err?.message || 'Upstream Gemini Live error'
                );
                sendJsonSafe(clientWs, {
                  type: 'error',
                  code: 'LIVE_UPSTREAM_ERROR',
                  fallbackAllowed: settings.browserFallbackEnabled,
                  message: 'Gemini Live connection interrupted. Switching to continuous voice fallback.',
                });
              },
              onclose: () => {
                cleanup();
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.close(1000, 'Upstream closed');
                }
              },
            },
          });

          // Handle disconnect-during-init race cleanly so no zombie provider session remains open
          if (isClosing || clientWs.readyState !== WebSocket.OPEN) {
            try {
              connectedSession?.close?.();
            } catch {
              // Ignore
            }
            cleanup();
            return;
          }

          liveSession = connectedSession;
          // Ensure ready & session registration always occur even if SDK resolves connect() without firing onopen
          emitReadyOnce();
        } catch (err: any) {
          logStructured('warn', 'voice_live_connect_failed', {
            sessionId,
            error: err?.message,
          });
          runtimeConfig.recordFailure(
            'live_connect_failed',
            'gemini_live',
            err?.message || 'Unable to connect to Gemini Live'
          );
          sendJsonSafe(clientWs, {
            type: 'error',
            code: 'LIVE_CONNECT_FAILED',
            fallbackAllowed: settings.browserFallbackEnabled,
            message: 'Unable to establish Gemini Live stream. Falling back to continuous turn-based voice mode.',
          });
          cleanup();
          clientWs.close(1000, 'Live connect failed');
        }
        return;
      }

      if (!liveSession) return;

      if (parsed.type === 'audio' && typeof parsed.data === 'string' && parsed.data.length > 0) {
        try {
          liveSession.sendRealtimeInput({
            audio: {
              data: parsed.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } catch {
          // Ignore transient send error if session is closing
        }
        return;
      }

      if (parsed.type === 'activity_start') {
        try {
          liveSession.sendRealtimeInput({ activityStart: {} });
        } catch {
          // Ignore if automatic VAD active
        }
        return;
      }

      if (parsed.type === 'activity_end') {
        try {
          liveSession.sendRealtimeInput({ activityEnd: {} });
        } catch {
          // Ignore if automatic VAD active
        }
        return;
      }

      if (parsed.type === 'interrupt') {
        accumulatedOutputTranscript = '';
        policyBlockedCurrentTurn = false;
        sendJsonSafe(clientWs, { type: 'interrupted' });
        return;
      }

      if (parsed.type === 'correct_transcript') {
        const originalText = String(parsed.originalTranscript || '').trim().slice(0, 500);
        const correctedText = String(parsed.correctedTranscript || '').trim().slice(0, 1200);
        if (correctedText) {
          runtimeConfig.recordTranscriptionError({
            sessionId,
            originalTranscript: originalText || '(unspecified)',
            correctedTranscript: correctedText,
            language: activeLanguage,
            transportMode: 'gemini_live_duplex',
          });
          currentTurnStartedAt = Date.now();
          lastFinalInputTranscript = correctedText;
          try {
            liveSession.sendRealtimeInput({
              text: `Correction from client (the previous speech transcription was inaccurate; please respond to this corrected instruction): ${correctedText}`,
            });
          } catch {
            // Ignore
          }
        }
        return;
      }

      if (parsed.type === 'text' && typeof parsed.text === 'string' && parsed.text.trim()) {
        const cleanText = parsed.text.trim().slice(0, 1500);
        currentTurnStartedAt = Date.now();
        lastFinalInputTranscript = cleanText;
        try {
          liveSession.sendRealtimeInput({ text: cleanText });
        } catch {
          // Ignore
        }
      }
    });
  });

  return {
    wss,
    close: () => {
      httpServer.off('upgrade', handleUpgrade);
      for (const cleanupFn of Array.from(activeCleanups)) {
        try {
          cleanupFn();
        } catch {
          // Ignore cleanup errors during shutdown
        }
      }
      for (const client of wss.clients) {
        try {
          client.terminate();
        } catch {
          // Ignore terminate errors during shutdown
        }
      }
      wss.close();
    },
  };
}
