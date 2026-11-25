import type http from 'http';
import type { Duplex } from 'stream';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';
import { CATALOG_DIVISION_SUMMARIES } from '../data/serviceCatalog';
import {
  MANDATORY_AI_SYSTEM_INSTRUCTION,
  enforceCommercialPolicyOnOutput,
} from './aiCommercialPolicy';
import { logStructured } from './logger';

export const VOICE_LIVE_WS_PATH = '/api/voice/live';
export const GEMINI_LIVE_MODEL = 'gemini-3.8-live';
export const GEMINI_LIVE_VOICE_NAME = 'Kore';

interface ClientLiveMessage {
  type: 'init' | 'audio' | 'text' | 'interrupt' | 'ping';
  sessionId?: string;
  language?: string;
  data?: string;
  text?: string;
  history?: Array<{ sender: 'user' | 'ai'; text: string }>;
}

/**
 * Attaches a server-side Gemini Live API WebSocket bridge on `/api/voice/live`.
 *
 * Security & architecture guarantees:
 * - `GEMINI_API_KEY` remains strictly server-side; browser never receives credentials.
 * - Bridges 16kHz PCM audio from client -> `gemini-3.8-live` and 24kHz PCM audio
 *   + input/output transcriptions + barge-in interruption events back to client.
 * - Rejects cleanly with `{ type: 'error', code: 'LIVE_UNAVAILABLE' }` when Gemini
 *   credentials are not configured so the client falls back transparently to
 *   `turn_based_continuous` mode without misrepresenting transport capability.
 */
export function attachVoiceLiveBridge(
  server: http.Server,
  ai: GoogleGenAI | null
): { close: () => void } {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });

  const handleUpgrade = (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    const pathname = (req.url || '').split('?')[0];
    if (pathname !== VOICE_LIVE_WS_PATH) {
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  };

  server.on('upgrade', handleUpgrade);

  wss.on('connection', (clientWs: WebSocket) => {
    if (!ai) {
      safeSend(clientWs, {
        type: 'error',
        code: 'LIVE_UNAVAILABLE',
        message: 'Server-side Gemini Live streaming is not configured; switching to continuous turn-based mode.',
      });
      clientWs.close(1008, 'LIVE_UNAVAILABLE');
      return;
    }

    let liveSession: any = null;
    let isClosing = false;
    let accumulatedOutputTranscript = '';

    const cleanupLiveSession = () => {
      if (isClosing) return;
      isClosing = true;
      if (liveSession) {
        try {
          liveSession.close();
        } catch {
          // Ignore close races
        }
        liveSession = null;
      }
    };

    const connectGeminiLive = async (language = 'en-US', history: Array<{ sender: 'user' | 'ai'; text: string }> = []) => {
      const isFilipino = language.startsWith('fil');
      const historyNote =
        history.length > 0
          ? `\nRECENT CONVERSATION CONTEXT:\n${history
              .slice(-8)
              .map((h) => `${h.sender === 'user' ? 'Client' : 'Consultant'}: ${h.text.slice(0, 300)}`)
              .join('\n')}`
          : '';

      const systemInstruction = `${MANDATORY_AI_SYSTEM_INSTRUCTION}

ENTERPRISE TECHNOLOGY DIVISIONS (CUSTOMIZED SOLUTIONS — ZERO PUBLIC PRICING):
${CATALOG_DIVISION_SUMMARIES.map((d) => `${Number(d.number)}. ${d.label}`).join('\n')}

LIVE VOICE BEHAVIOR:
- Speak as a warm, articulate, professional female executive technology consultant in ${
        isFilipino ? 'natural respectful Filipino/English' : 'neutral American English'
      }.
- Keep spoken turns concise (2-3 natural sentences), remember earlier conversation context, answer short follow-up questions directly, and never repeat scripted booking boilerplate.
- Never quote prices, rates, or discounts.
- Obtain explicit confirmation before requesting personal information or scheduling an appointment.${historyNote}`;

      try {
        liveSession = await ai.live.connect({
          model: GEMINI_LIVE_MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: GEMINI_LIVE_VOICE_NAME },
              },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction,
          },
          callbacks: {
            onopen: () => {
              if (!isClosing) {
                safeSend(clientWs, {
                  type: 'ready',
                  model: GEMINI_LIVE_MODEL,
                  voice: GEMINI_LIVE_VOICE_NAME,
                  transportMode: 'gemini_live_duplex',
                });
              }
            },
            onmessage: (message: LiveServerMessage) => {
              if (isClosing) return;
              const content = message.serverContent;
              if (!content) return;

              if (content.interrupted) {
                accumulatedOutputTranscript = '';
                safeSend(clientWs, { type: 'interrupted' });
              }

              if (content.inputTranscription?.text) {
                safeSend(clientWs, {
                  type: 'input_transcript',
                  text: content.inputTranscription.text,
                  isFinal: true,
                });
              }

              if (content.outputTranscription?.text) {
                accumulatedOutputTranscript += content.outputTranscription.text;
                const enforced = enforceCommercialPolicyOnOutput(accumulatedOutputTranscript, '');
                safeSend(clientWs, {
                  type: 'output_transcript',
                  text: enforced.enforced ? enforced.replyText : content.outputTranscription.text,
                  fullText: enforced.replyText,
                  policyEnforced: enforced.enforced,
                });
              }

              for (const part of content.modelTurn?.parts ?? []) {
                if (part.inlineData?.data) {
                  safeSend(clientWs, {
                    type: 'audio',
                    data: part.inlineData.data,
                    mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000',
                  });
                }
              }

              if (content.turnComplete) {
                const finalText = accumulatedOutputTranscript.trim();
                accumulatedOutputTranscript = '';
                safeSend(clientWs, {
                  type: 'turn_complete',
                  text: finalText,
                });
              }
            },
            onerror: (err: any) => {
              logStructured('warn', 'gemini_live_session_error', {
                error: err?.message || 'Live session error',
              });
              safeSend(clientWs, {
                type: 'error',
                code: 'LIVE_UPSTREAM_ERROR',
                message: 'Live voice stream encountered an upstream error.',
              });
            },
            onclose: () => {
              if (!isClosing) {
                safeSend(clientWs, { type: 'closed' });
              }
            },
          },
        });
      } catch (err: any) {
        logStructured('warn', 'gemini_live_connect_failed', {
          error: err?.message || String(err),
        });
        safeSend(clientWs, {
          type: 'error',
          code: 'LIVE_CONNECT_FAILED',
          message: 'Could not establish Gemini Live stream; falling back to continuous turn-based mode.',
        });
        clientWs.close(1011, 'LIVE_CONNECT_FAILED');
      }
    };

    clientWs.on('message', (raw) => {
      if (isClosing) return;
      let parsed: ClientLiveMessage;
      try {
        parsed = JSON.parse(raw.toString()) as ClientLiveMessage;
      } catch {
        return;
      }

      if (parsed.type === 'ping') {
        safeSend(clientWs, { type: 'pong', ts: Date.now() });
        return;
      }

      if (parsed.type === 'init') {
        if (!liveSession) {
          void connectGeminiLive(parsed.language || 'en-US', parsed.history || []);
        }
        return;
      }

      if (!liveSession) return;

      if (parsed.type === 'audio' && typeof parsed.data === 'string' && parsed.data.length > 0) {
        try {
          liveSession.sendRealtimeInput({
            audio: { data: parsed.data, mimeType: 'audio/pcm;rate=16000' },
          });
        } catch {
          // Ignore send race during teardown
        }
      } else if (parsed.type === 'text' && typeof parsed.text === 'string' && parsed.text.trim()) {
        try {
          liveSession.sendRealtimeInput({
            text: parsed.text.trim().slice(0, 1500),
          });
        } catch {
          // Ignore send race during teardown
        }
      }
    });

    clientWs.on('close', () => {
      cleanupLiveSession();
    });

    clientWs.on('error', () => {
      cleanupLiveSession();
    });
  });

  return {
    close: () => {
      server.off('upgrade', handleUpgrade);
      for (const client of wss.clients) {
        try {
          client.close(1001, 'Server shutting down');
        } catch {
          // Ignore
        }
      }
      wss.close();
    },
  };
}

function safeSend(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Ignore closed socket races
    }
  }
}
