/**
 * DESTRIA TECH INC — Browser-Native Unified Voice WebSocket Bridge (`/api/frontdesk/voice/stream`)
 *
 * Completely independent from Asterisk SIP/RTP telephony:
 * - Authenticates browser connections via Origin allowlist + HMAC-bound Front Desk session token.
 * - Accepts 16 kHz mono PCM16 frames from browser AudioWorklet / MediaRecorder.
 * - Routes VAD -> Faster-Whisper STT -> Unified Front Desk Gateway (Qwen2.5-7B-Instruct) -> Kokoro 24 kHz TTS.
 * - Supports real-time barge-in (`interrupt` event) with `generationEpoch` tracking and
 *   remote `/v1/cancel/:requestId` cancellation so stale audio is immediately dropped.
 * - Fails closed honestly (`INFERENCE_SERVICE_UNAVAILABLE`) when the local inference worker is offline.
 */

import crypto from 'crypto';
import type { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  FrontDeskSessionTokenSigner,
  FrontDeskUnifiedGateway,
  containsPromptInjection,
} from './frontDeskUnifiedGateway';
import { FrontDeskOperationsStore } from './services/frontDeskOperationsStore';
import {
  LocalInferenceClient,
  LocalInferenceUnavailableError,
} from './services/localInferenceClient';
import { logStructured } from './logger';

export const FRONTDESK_VOICE_STREAM_WS_PATH = '/api/frontdesk/voice/stream';

export interface FrontDeskVoiceStreamBridgeOptions {
  gateway: FrontDeskUnifiedGateway;
  operationsStore: FrontDeskOperationsStore;
  localInferenceClient: LocalInferenceClient;
  tokenSigner: FrontDeskSessionTokenSigner;
  allowedOrigins: string[];
  maxConnectionsPerIpPerMinute?: number;
}

interface ClientVoiceFrame {
  type: 'audio_chunk' | 'commit_utterance' | 'interrupt' | 'text' | 'ping';
  pcm16Base64?: string;
  sampleRate?: number;
  language?: string;
  text?: string;
  idempotencyKey?: string;
}

function sendSafe(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function isOriginPermitted(req: IncomingMessage, allowedOrigins: string[]): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const clean = origin.replace(/\/$/, '');
  if (allowedOrigins.includes(clean)) return true;
  const host = req.headers.host;
  if (host && (clean === `https://${host}` || clean === `http://${host}`)) return true;
  if (process.env.NODE_ENV !== 'production' && clean.endsWith('.run.app')) return true;
  return false;
}

export function attachFrontDeskVoiceStreamBridge(
  httpServer: HttpServer,
  opts: FrontDeskVoiceStreamBridgeOptions
) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 2 * 1024 * 1024,
  });

  const maxConnPerMin = opts.maxConnectionsPerIpPerMinute ?? 30;
  const ipTimestamps = new Map<string, number[]>();

  const checkRate = (ip: string): boolean => {
    const now = Date.now();
    const recent = (ipTimestamps.get(ip) || []).filter((ts) => now - ts < 60_000);
    if (recent.length >= maxConnPerMin) {
      ipTimestamps.set(ip, recent);
      return false;
    }
    recent.push(now);
    ipTimestamps.set(ip, recent);
    return true;
  };

  const handleUpgrade = (req: IncomingMessage, socket: any, head: Buffer) => {
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    if (parsedUrl.pathname !== FRONTDESK_VOICE_STREAM_WS_PATH) return;

    if (!isOriginPermitted(req, opts.allowedOrigins)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nOrigin not allowed');
      socket.destroy();
      return;
    }

    const sessionId = (parsedUrl.searchParams.get('sessionId') || '').trim();
    const sessionToken =
      (parsedUrl.searchParams.get('sessionToken') || '').trim() ||
      (typeof req.headers['x-frontdesk-session-token'] === 'string'
        ? req.headers['x-frontdesk-session-token'].trim()
        : '');

    if (!sessionId || !opts.tokenSigner.verify(sessionId, sessionToken)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\n\r\nValid session token required');
      socket.destroy();
      return;
    }

    const ip = req.socket?.remoteAddress || 'unknown';
    if (!checkRate(ip)) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\nContent-Type: text/plain\r\n\r\nRate limit exceeded');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, sessionId);
    });
  };

  httpServer.on('upgrade', handleUpgrade);

  wss.on('connection', async (ws: WebSocket, _req: IncomingMessage, sessionId: string) => {
    // Honest fail-closed availability check: never report connected if local inference is offline!
    const health = await opts.localInferenceClient.probeHealth();
    if (!health.configured || !health.reachable || !health.ready) {
      sendSafe(ws, {
        type: 'error',
        code: 'INFERENCE_SERVICE_UNAVAILABLE',
        message:
          'Local AI voice inference service is currently unavailable. Please continue via text chat or request a callback.',
        retryable: true,
      });
      try {
        ws.close(1013, 'Local inference service unavailable');
      } catch {
        // Ignore close errors
      }
      return;
    }

    const meta = opts.operationsStore.getOrCreateSessionMeta(sessionId, 'ai_frontdesk_voice');
    let generationEpoch = meta.generationEpoch;
    let activeRequestId: string | null = null;
    let speechBuffers: Buffer[] = [];
    let bufferedBytes = 0;
    const MAX_UTTERANCE_BYTES = Number(process.env.FRONTDESK_MAX_AUDIO_BYTES || 5 * 1024 * 1024);

    sendSafe(ws, {
      type: 'ready',
      sessionId,
      generationEpoch,
      providerMode: opts.localInferenceClient.providerMode,
      inputSampleRate: 16000,
      outputSampleRate: 24000,
      bargeInEnabled: true,
    });

    const cancelActiveGeneration = async () => {
      generationEpoch = opts.operationsStore.incrementGenerationEpoch(sessionId);
      const reqToCancel = activeRequestId;
      activeRequestId = null;
      if (reqToCancel) {
        await opts.localInferenceClient.cancelRequest(reqToCancel).catch(() => {});
      }
      sendSafe(ws, { type: 'interrupted', sessionId, generationEpoch });
    };

    const processCompleteUtterance = async (pcmBuffer: Buffer, languageHint?: string, idempotencyKey?: string) => {
      const myEpoch = generationEpoch;
      const requestId = `ws-${crypto.randomUUID().slice(0, 12)}`;
      activeRequestId = requestId;

      try {
        sendSafe(ws, { type: 'state', state: 'thinking', generationEpoch: myEpoch });
        const stt = await opts.localInferenceClient.transcribeAudio({
          sessionId,
          requestId,
          audioBase64: pcmBuffer.toString('base64'),
          sampleRate: 16000,
          languageHint,
        });

        if (myEpoch !== generationEpoch) return; // Discarded due to barge-in
        if (!stt.text.trim()) {
          sendSafe(ws, { type: 'state', state: 'listening', generationEpoch: myEpoch });
          return;
        }

        sendSafe(ws, {
          type: 'transcript',
          role: 'user',
          text: stt.text,
          language: stt.language,
          isFinal: true,
          generationEpoch: myEpoch,
        });

        if (containsPromptInjection(stt.text)) {
          sendSafe(ws, {
            type: 'error',
            code: 'PROMPT_INJECTION_BLOCKED',
            message: 'Request blocked by corporate security policy.',
            generationEpoch: myEpoch,
          });
          return;
        }

        const turn = await opts.gateway.executeUnifiedTurn({
          sessionId,
          channel: 'ai_frontdesk_voice',
          userMessage: stt.text,
          language: stt.language,
          idempotencyKey,
          requestId,
        });

        if (myEpoch !== generationEpoch) return; // Stale reply suppressed!

        sendSafe(ws, {
          type: 'reply',
          turnId: turn.turnId,
          turnSequence: turn.turnSequence,
          text: turn.replyText,
          spokenText: turn.spokenText,
          language: turn.language,
          department: turn.department,
          recommendedAction: turn.recommendedAction,
          generationEpoch: myEpoch,
        });

        sendSafe(ws, { type: 'state', state: 'speaking', generationEpoch: myEpoch });
        const tts = await opts.localInferenceClient.synthesizeSpeech({
          requestId,
          text: turn.spokenText,
          language: turn.language,
          format: 'wav',
        });

        if (myEpoch !== generationEpoch) return; // Stale audio suppressed!

        sendSafe(ws, {
          type: 'audio',
          audioBase64: tts.audioBase64,
          mimeType: tts.mimeType,
          sampleRate: tts.sampleRate,
          generationEpoch: myEpoch,
        });
        sendSafe(ws, { type: 'turn_complete', turnId: turn.turnId, generationEpoch: myEpoch });
      } catch (err: any) {
        if (myEpoch !== generationEpoch) return;
        const code = err instanceof LocalInferenceUnavailableError ? err.code : 'VOICE_PROCESSING_ERROR';
        logStructured('warn', 'frontdesk_voice_stream_error', { sessionId, code, error: err?.message });
        sendSafe(ws, {
          type: 'error',
          code,
          message: err?.message || 'Voice turn failed. Please retry or continue in text chat.',
          generationEpoch: myEpoch,
        });
      } finally {
        if (activeRequestId === requestId) {
          activeRequestId = null;
        }
      }
    };

    ws.on('message', async (raw) => {
      let frame: ClientVoiceFrame;
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (frame.type === 'ping') {
        sendSafe(ws, { type: 'pong', ts: Date.now(), generationEpoch });
        return;
      }

      if (frame.type === 'interrupt') {
        speechBuffers = [];
        bufferedBytes = 0;
        await cancelActiveGeneration();
        return;
      }

      if (frame.type === 'audio_chunk' && typeof frame.pcm16Base64 === 'string') {
        const chunk = Buffer.from(frame.pcm16Base64, 'base64');
        if (bufferedBytes + chunk.length > MAX_UTTERANCE_BYTES) {
          sendSafe(ws, {
            type: 'error',
            code: 'AUDIO_PAYLOAD_TOO_LARGE',
            message: 'Audio utterance exceeded maximum permitted buffer size.',
          });
          speechBuffers = [];
          bufferedBytes = 0;
          return;
        }
        speechBuffers.push(chunk);
        bufferedBytes += chunk.length;

        const hadActiveGenerationWhenChunkArrived = activeRequestId !== null;
        try {
          const vad = await opts.localInferenceClient.detectVad({
            sessionId,
            pcm16Base64: frame.pcm16Base64,
            sampleRate: frame.sampleRate ?? 16000,
          });
          sendSafe(ws, { type: 'vad', ...vad, generationEpoch });
          if (vad.speechStart && hadActiveGenerationWhenChunkArrived && activeRequestId) {
            // Automatic voice barge-in only when the AI was already generating/speaking
            await cancelActiveGeneration();
          }
          if (vad.speechEnd && bufferedBytes >= 1600) {
            const fullAudio = Buffer.concat(speechBuffers);
            speechBuffers = [];
            bufferedBytes = 0;
            await processCompleteUtterance(fullAudio, frame.language, frame.idempotencyKey);
          }
        } catch (err: any) {
          sendSafe(ws, {
            type: 'error',
            code: err instanceof LocalInferenceUnavailableError ? err.code : 'VAD_UNAVAILABLE',
            message: err?.message || 'Voice activity detection unavailable.',
          });
        }
        return;
      }

      if (frame.type === 'commit_utterance') {
        if (bufferedBytes > 0) {
          const fullAudio = Buffer.concat(speechBuffers);
          speechBuffers = [];
          bufferedBytes = 0;
          await processCompleteUtterance(fullAudio, frame.language, frame.idempotencyKey);
        }
        return;
      }

      if (frame.type === 'text' && typeof frame.text === 'string' && frame.text.trim()) {
        const myEpoch = generationEpoch;
        const turn = await opts.gateway.executeUnifiedTurn({
          sessionId,
          channel: 'ai_frontdesk_voice',
          userMessage: frame.text,
          language: frame.language,
          idempotencyKey: frame.idempotencyKey,
        });
        if (myEpoch !== generationEpoch) return;
        sendSafe(ws, {
          type: 'reply',
          turnId: turn.turnId,
          turnSequence: turn.turnSequence,
          text: turn.replyText,
          spokenText: turn.spokenText,
          language: turn.language,
          department: turn.department,
          recommendedAction: turn.recommendedAction,
          generationEpoch: myEpoch,
        });
      }
    });

    ws.on('close', () => {
      speechBuffers = [];
      bufferedBytes = 0;
      if (activeRequestId) {
        void opts.localInferenceClient.cancelRequest(activeRequestId).catch(() => {});
        activeRequestId = null;
      }
    });
  });

  return {
    wss,
    close: () => {
      httpServer.off('upgrade', handleUpgrade);
      for (const client of wss.clients) {
        try {
          client.terminate();
        } catch {
          // Ignore
        }
      }
      wss.close();
    },
  };
}
