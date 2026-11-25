/**
 * DESTRIA TECH INC AI Solutions Consultant — Continuous Enterprise Voice Engine
 *
 * Implements:
 * - Deterministic 10-state VoiceSessionState machine with separate isSessionActive flag
 * - Monotonic sessionSeq & responseSeq fencing to reject stale async callbacks & audio
 * - Guaranteed post-playback listening & microphone recovery (greeting + every turn)
 * - Full Web Speech Recognition lifecycle handling with duplicate-transcript prevention
 * - Natural barge-in / interruption with immediate audio cancellation & queue flush
 * - Server-bridged Gemini Live full-duplex streaming (/api/voice/live) with honest
 *   fallback to continuous turn-based mode (/api/voice/process + /api/voice/speak)
 * - Real Web Audio AnalyserNode level metering (zero simulated random bars)
 * - Per-turn latency instrumentation & complete teardown on stop/close
 */

import { ConsultationAppointment } from './supabaseService';
import { apiUrl, resolveApiBaseUrl } from '../lib/apiClient';

export type VoiceSessionState =
  | 'disconnected'
  | 'connecting'
  | 'listening'
  | 'user_speaking'
  | 'processing'
  | 'ai_speaking'
  | 'interrupted'
  | 'reconnecting'
  | 'error'
  | 'stopping';

/** Backwards-compatible alias */
export type VoiceState = VoiceSessionState;

export type VoiceLanguage = 'en-US' | 'fil-PH';
export type VoiceEngineType = 'gemini_live' | 'gemini_neural' | 'browser_fallback' | 'none';
export type VoiceTransportMode = 'gemini_live_duplex' | 'turn_based_continuous' | 'none';

export interface VoiceSharedContext {
  selectedService?: string;
  category?: string;
  businessProblem?: string;
  currentStage?: string;
  executivePreference?: 'ceo' | 'cto' | 'advisory';
  presentedOptions?: string[];
  keyFeatures?: string[];
}

export interface VoiceTurnMetrics {
  turnNumber: number;
  speechCaptureDurationMs: number;
  speechFinalizationMs: number;
  transcriptionLatencyMs: number;
  aiResponseLatencyMs: number;
  audioGenerationLatencyMs: number;
  timeToFirstAudibleResponseMs: number;
  totalTurnLatencyMs: number;
  voiceEngine: VoiceEngineType;
  transportMode: VoiceTransportMode;
  recordedAt: string;
}

export interface VoiceAiIntent {
  isBookingIntent?: boolean;
  requiresBookingConfirmation?: boolean;
  isBriefIntent?: boolean;
  isHumanEscalation?: boolean;
  isBookingConfirmed?: boolean;
  appointment?: ConsultationAppointment;
  executivePreference?: 'ceo' | 'cto' | 'advisory';
  recommendedServiceIds?: string[];
  quickReplies?: string[];
  resourceLinks?: Array<{
    id: string;
    title: string;
    category: string;
    fileUrl: string;
    canonicalUrl: string;
    downloadFilename: string;
    pagePath: string;
    pageCount: number;
  }>;
  updatedContext?: VoiceSharedContext;
}

export interface VoiceEventCallbacks {
  onStatusChange?: (status: VoiceSessionState) => void;
  onSessionActiveChange?: (active: boolean) => void;
  onTransportModeChange?: (mode: VoiceTransportMode) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onAiResponse?: (text: string, intent?: VoiceAiIntent) => void;
  onVolumeChange?: (volume: number, bands?: number[]) => void;
  onVoiceEngineChange?: (engine: VoiceEngineType) => void;
  onTurnMetrics?: (metrics: VoiceTurnMetrics) => void;
  onAppointmentBooked?: (appointment: ConsultationAppointment) => void;
  onBookingRequested?: () => void;
  onBriefRequested?: () => void;
  onError?: (errorMessage: string) => void;
}

export interface VoiceRuntimeDeps {
  fetchImpl?: typeof fetch;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  SpeechRecognitionCtor?: new () => any;
  AudioContextCtor?: new (options?: AudioContextOptions) => AudioContext;
  AudioCtor?: new (src?: string) => HTMLAudioElement;
  SpeechSynthesisUtteranceCtor?: new (text?: string) => SpeechSynthesisUtterance;
  speechSynthesis?: SpeechSynthesis | null;
  WebSocketCtor?: typeof WebSocket;
  enableLiveWebSocket?: boolean;
  recognitionRestartBaseDelayMs?: number;
  networkRetryDelaysMs?: number[];
  bargeInHoldMs?: number;
  bargeInThreshold?: number;
  idleTimeoutMs?: number;
  maxConsecutiveRecognitionFailures?: number;
  playbackWatchdogPaddingMs?: number;
}

const ALLOWED_TRANSITIONS: Record<VoiceSessionState, ReadonlySet<VoiceSessionState>> = {
  disconnected: new Set(['connecting']),
  connecting: new Set(['listening', 'ai_speaking', 'error', 'stopping', 'disconnected']),
  listening: new Set(['user_speaking', 'processing', 'ai_speaking', 'reconnecting', 'error', 'stopping']),
  user_speaking: new Set(['processing', 'listening', 'interrupted', 'reconnecting', 'error', 'stopping']),
  processing: new Set(['ai_speaking', 'listening', 'interrupted', 'reconnecting', 'error', 'stopping']),
  ai_speaking: new Set(['listening', 'interrupted', 'reconnecting', 'error', 'stopping']),
  interrupted: new Set(['user_speaking', 'listening', 'processing', 'error', 'stopping']),
  reconnecting: new Set(['listening', 'processing', 'ai_speaking', 'error', 'stopping']),
  error: new Set(['reconnecting', 'listening', 'connecting', 'stopping', 'disconnected']),
  stopping: new Set(['disconnected']),
};

export function isValidVoiceTransition(from: VoiceSessionState, to: VoiceSessionState): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.has(to) ?? false;
}

function pcm16FloatToBase64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

export class AIVoiceService {
  private status: VoiceSessionState = 'disconnected';
  private isSessionActiveFlag = false;
  private language: VoiceLanguage = 'en-US';
  private activeVoiceEngine: VoiceEngineType = 'none';
  private transportMode: VoiceTransportMode = 'none';
  private callbacks: VoiceEventCallbacks = {};

  // Monotonic tokens prevent stale callbacks or interrupted responses from acting
  private sessionSeq = 0;
  private responseSeq = 0;
  private sessionId = '';
  private turnCount = 0;

  // Audio capture & playback resources
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private outputAudioContext: AudioContext | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private currentBufferSource: AudioBufferSourceNode | null = null;
  private liveQueuedSources: Set<AudioBufferSourceNode> = new Set();
  private liveNextStartTime = 0;
  private liveTurnCompleteReceived = false;
  private liveWs: WebSocket | null = null;
  private liveProcessor: ScriptProcessorNode | null = null;
  private mediaStream: MediaStream | null = null;
  private animationFrameId: number | null = null;

  // Speech recognition & duplicate guard state
  private recognition: any = null;
  private isRecognitionRunning = false;
  private recognitionPausedForSpeech = false;
  private consecutiveRecognitionFailures = 0;
  private lastFinalSubmittedText = '';
  private lastFinalSubmittedAt = 0;
  private speechStartedAt: number | null = null;
  private lastInterimAt: number | null = null;

  // Active playback & in-flight request cancellation
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private activePlaybackAbortResolver: (() => void) | null = null;
  private activeFetchController: AbortController | null = null;
  private isSpeakerMuted = false;
  private isMicMuted = false;

  // Timers (all cleared on stopSession)
  private recognitionRestartTimeout: ReturnType<typeof setTimeout> | null = null;
  private idleTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private playbackWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private speechKeepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private bargeInHighSince: number | null = null;

  // Conversation context & latency telemetry
  private conversationHistory: Array<{ sender: 'user' | 'ai'; text: string }> = [];
  private sharedContext: VoiceSharedContext = {};
  private lastResponseLatencyMs: number | null = null;
  private lastTurnMetrics: VoiceTurnMetrics | null = null;
  private turnMetricsHistory: VoiceTurnMetrics[] = [];
  private stateTransitionLog: Array<{ from: VoiceSessionState; to: VoiceSessionState; at: number }> = [];

  private readonly deps: VoiceRuntimeDeps;
  private readonly idleTimeoutMs: number;
  private readonly recognitionRestartBaseDelayMs: number;
  private readonly networkRetryDelaysMs: number[];
  private readonly bargeInHoldMs: number;
  private readonly bargeInThreshold: number;
  private readonly maxConsecutiveRecognitionFailures: number;
  private readonly playbackWatchdogPaddingMs: number;

  constructor(deps: VoiceRuntimeDeps = {}) {
    this.deps = deps;
    this.sessionId = `dti-voice-init-${Date.now()}`;
    this.idleTimeoutMs = deps.idleTimeoutMs ?? 5 * 60 * 1000;
    this.recognitionRestartBaseDelayMs = deps.recognitionRestartBaseDelayMs ?? 180;
    this.networkRetryDelaysMs = deps.networkRetryDelaysMs ?? [350, 800];
    this.bargeInHoldMs = deps.bargeInHoldMs ?? 240;
    this.bargeInThreshold = deps.bargeInThreshold ?? 36;
    this.maxConsecutiveRecognitionFailures = deps.maxConsecutiveRecognitionFailures ?? 6;
    this.playbackWatchdogPaddingMs = deps.playbackWatchdogPaddingMs ?? 6000;
  }

  // -------------------------------------------------------------------------
  // Public Getters, Telemetry & Context Sync
  // -------------------------------------------------------------------------

  public setCallbacks(callbacks: VoiceEventCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public getStatus(): VoiceSessionState {
    return this.status;
  }

  public isSessionActive(): boolean {
    return this.isSessionActiveFlag;
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public getTurnCount(): number {
    return this.turnCount;
  }

  public getLanguage(): VoiceLanguage {
    return this.language;
  }

  public getActiveVoiceEngine(): VoiceEngineType {
    return this.activeVoiceEngine;
  }

  public getTransportMode(): VoiceTransportMode {
    return this.transportMode;
  }

  public getIsMicMuted(): boolean {
    return this.isMicMuted;
  }

  public getIsSpeakerMuted(): boolean {
    return this.isSpeakerMuted;
  }

  public getLastResponseLatencyMs(): number | null {
    return this.lastResponseLatencyMs;
  }

  public getLastTurnMetrics(): VoiceTurnMetrics | null {
    return this.lastTurnMetrics;
  }

  public getTurnMetricsHistory(): VoiceTurnMetrics[] {
    return [...this.turnMetricsHistory];
  }

  public getStateTransitionLog(): Array<{ from: VoiceSessionState; to: VoiceSessionState; at: number }> {
    return [...this.stateTransitionLog];
  }

  public getConversationHistory(): Array<{ sender: 'user' | 'ai'; text: string }> {
    return [...this.conversationHistory];
  }

  public getSharedContext(): VoiceSharedContext {
    return { ...this.sharedContext };
  }

  /**
   * Synchronizes conversation history and discovery state between text chat
   * and voice sessions so both channels share one continuous context.
   */
  public syncConversationContext(
    history: Array<{ sender: 'user' | 'ai'; text: string }>,
    context?: VoiceSharedContext
  ) {
    if (Array.isArray(history)) {
      this.conversationHistory = history
        .map((m) => ({
          sender: m.sender,
          text: m.text.replace(/^\[Voice Consultation\]:\s*"?|"?$/g, '').trim(),
        }))
        .filter((m) => Boolean(m.text))
        .slice(-20);
    }
    if (context) {
      this.sharedContext = {
        ...this.sharedContext,
        ...context,
        presentedOptions: context.presentedOptions
          ? [...context.presentedOptions]
          : this.sharedContext.presentedOptions,
        keyFeatures: context.keyFeatures
          ? [...context.keyFeatures]
          : this.sharedContext.keyFeatures,
      };
    }
  }

  public resetConversationContext() {
    this.conversationHistory = [];
    this.sharedContext = {};
    this.turnCount = 0;
    this.turnMetricsHistory = [];
    this.lastTurnMetrics = null;
    this.lastFinalSubmittedText = '';
    this.lastFinalSubmittedAt = 0;
  }

  public setLanguage(lang: VoiceLanguage) {
    this.language = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  public setMicMuted(muted: boolean) {
    this.isMicMuted = muted;
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    if (!this.isSessionActiveFlag) return;

    if (muted) {
      this.pauseRecognitionTemporarily();
      this.callbacks.onVolumeChange?.(0, new Array(16).fill(0));
    } else if (this.status === 'listening' || this.status === 'user_speaking') {
      void this.resumeSpeechRecognitionSafely(this.sessionSeq);
    }
  }

  public setSpeakerMuted(muted: boolean) {
    this.isSpeakerMuted = muted;
    if (muted && this.status === 'ai_speaking') {
      const currentSession = this.sessionSeq;
      const currentResp = this.responseSeq;
      this.clearPlaybackResources();
      void this.handleAssistantPlaybackComplete(currentSession, currentResp);
    }
  }

  // -------------------------------------------------------------------------
  // State Machine & Session Guard Helpers
  // -------------------------------------------------------------------------

  private isCurrentActiveSession(sessionSeq: number): boolean {
    return this.isSessionActiveFlag && this.sessionSeq === sessionSeq;
  }

  private isCurrentResponse(sessionSeq: number, responseSeq: number): boolean {
    return this.isCurrentActiveSession(sessionSeq) && this.responseSeq === responseSeq;
  }

  private transitionTo(next: VoiceSessionState) {
    const prev = this.status;
    if (prev === next) return;
    if (!isValidVoiceTransition(prev, next)) {
      // Allow forced teardown transitions into stopping/disconnected safely
      if (next !== 'stopping' && next !== 'disconnected') {
        return;
      }
    }
    this.status = next;
    this.stateTransitionLog.push({ from: prev, to: next, at: Date.now() });
    if (this.stateTransitionLog.length > 200) {
      this.stateTransitionLog.shift();
    }
    this.callbacks.onStatusChange?.(next);
  }

  private setSessionActive(active: boolean) {
    if (this.isSessionActiveFlag !== active) {
      this.isSessionActiveFlag = active;
      this.callbacks.onSessionActiveChange?.(active);
    }
  }

  private setActiveVoiceEngine(engine: VoiceEngineType) {
    this.activeVoiceEngine = engine;
    this.callbacks.onVoiceEngineChange?.(engine);
  }

  private setTransportMode(mode: VoiceTransportMode) {
    this.transportMode = mode;
    this.callbacks.onTransportModeChange?.(mode);
  }

  private resetIdleTimer(sessionSeq: number) {
    if (this.idleTimeoutTimer) {
      clearTimeout(this.idleTimeoutTimer);
      this.idleTimeoutTimer = null;
    }
    if (!this.isCurrentActiveSession(sessionSeq)) return;
    this.idleTimeoutTimer = setTimeout(() => {
      if (this.isCurrentActiveSession(sessionSeq)) {
        this.callbacks.onError?.('Voice session ended after 5 minutes of inactivity.');
        this.stopSession();
      }
    }, this.idleTimeoutMs);
  }

  private getFetch(): typeof fetch {
    if (this.deps.fetchImpl) return this.deps.fetchImpl;
    return fetch.bind(globalThis);
  }

  private getSpeechSynthesis(): SpeechSynthesis | null {
    if (this.deps.speechSynthesis !== undefined) return this.deps.speechSynthesis;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      return window.speechSynthesis;
    }
    return null;
  }

  private getAudioContextCtor(): (new (options?: AudioContextOptions) => AudioContext) | null {
    if (this.deps.AudioContextCtor) return this.deps.AudioContextCtor;
    if (typeof window !== 'undefined') {
      return window.AudioContext || (window as any).webkitAudioContext || null;
    }
    return null;
  }

  private getSpeechRecognitionCtor(): (new () => any) | null {
    if (this.deps.SpeechRecognitionCtor) return this.deps.SpeechRecognitionCtor;
    if (typeof window !== 'undefined') {
      return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
    }
    return null;
  }

  private getUserMediaFn(): ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | null {
    if (this.deps.getUserMedia) return this.deps.getUserMedia;
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      return (constraints) => navigator.mediaDevices.getUserMedia(constraints);
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Session Lifecycle: Start & Stop
  // -------------------------------------------------------------------------

  public async startSession(): Promise<boolean> {
    if (this.isSessionActiveFlag && this.status !== 'disconnected' && this.status !== 'error') {
      return true;
    }

    // Ensure any residual state from a prior errored session is completely cleared first
    if (this.status !== 'disconnected') {
      this.stopSession();
    }

    const mySession = ++this.sessionSeq;
    this.responseSeq += 1;
    this.turnCount = 0;
    this.consecutiveRecognitionFailures = 0;
    this.lastFinalSubmittedText = '';
    this.lastFinalSubmittedAt = 0;
    this.bargeInHighSince = null;
    this.setSessionActive(true);
    this.transitionTo('connecting');

    try {
      // 1. Initialize microphone with echo cancellation & noise suppression
      await this.ensureMicrophoneAvailable(mySession);
      if (!this.isCurrentActiveSession(mySession)) return false;

      // 2. Unlock output AudioContext inside user gesture to satisfy browser autoplay policy
      await this.ensureOutputAudioContextReady();
      if (!this.isCurrentActiveSession(mySession)) return false;

      // 3. Negotiate persistent server voice session
      let liveStreamingAvailable = false;
      let liveWebSocketPath = '/api/voice/live';
      try {
        const res = await this.getFetch()(apiUrl('/api/voice/session'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: this.language,
            stateContext: this.sharedContext,
          }),
        });
        if (!this.isCurrentActiveSession(mySession)) return false;
        if (res.ok) {
          const data = await res.json();
          this.sessionId = data.sessionId || `dti-voice-${Date.now()}`;
          liveStreamingAvailable = Boolean(data.liveStreamingAvailable);
          if (typeof data.liveWebSocketPath === 'string' && data.liveWebSocketPath) {
            liveWebSocketPath = data.liveWebSocketPath;
          }
        }
      } catch {
        this.sessionId = `dti-voice-local-${Date.now()}`;
      }

      if (!this.isCurrentActiveSession(mySession)) return false;

      // 4. Optional full-duplex Gemini Live WebSocket if explicitly enabled & available
      const allowLive = this.deps.enableLiveWebSocket ?? false;
      if (allowLive && liveStreamingAvailable) {
        const liveConnected = await this.tryConnectGeminiLive(mySession, liveWebSocketPath);
        if (liveConnected && this.isCurrentActiveSession(mySession)) {
          this.setTransportMode('gemini_live_duplex');
          this.setActiveVoiceEngine('gemini_live');
          this.transitionTo('listening');
          this.resetIdleTimer(mySession);
          return true;
        }
      }

      // 5. Continuous Turn-Based Voice Mode (honestly labeled, never misrepresented as full-duplex)
      this.setTransportMode('turn_based_continuous');

      const RecognitionCtor = this.getSpeechRecognitionCtor();
      if (RecognitionCtor) {
        this.setupRecognition(RecognitionCtor, mySession);
      } else {
        this.callbacks.onError?.(
          'Browser Speech Recognition is unavailable on this browser. You may still type messages and hear spoken AI responses.'
        );
      }

      this.resetIdleTimer(mySession);

      // 6. Deliver audible greeting AND AUTOMATICALLY RESUME LISTENING AFTERWARDS!
      // (Root cause fix: previously passed restartRecognitionAfter = false, stranding the mic!)
      const greeting = this.language.startsWith('fil')
        ? 'Magandang araw po. Ako ang inyong DESTRIA TECH INC AI Corporate Solutions Consultant. Paano ko po matutulungan ang inyong enterprise technology project ngayon?'
        : 'Welcome to DESTRIA TECH INC. I am your AI Corporate Solutions Consultant. How may I assist with your enterprise technology initiative today?';

      // Record greeting in history only if conversation has no prior AI greeting
      if (this.conversationHistory.length === 0) {
        this.conversationHistory.push({ sender: 'ai', text: greeting });
      }

      // Speak greeting and guarantee listening automatically starts right after playback completes
      await this.speakTextInternal(greeting, mySession, ++this.responseSeq, true);
      return this.isCurrentActiveSession(mySession);
    } catch (err: any) {
      if (!this.isCurrentActiveSession(mySession)) return false;
      const errName = err?.name || '';
      const msg =
        errName === 'NotAllowedError' || errName === 'PermissionDeniedError'
          ? 'Microphone permission was denied. Please allow microphone access in your browser settings and try again.'
          : errName === 'NotFoundError'
          ? 'No microphone device was detected. Please connect a microphone or continue via text chat.'
          : 'Unable to initialize voice audio input. Please check microphone permissions or continue via text chat.';

      this.transitionTo('error');
      this.callbacks.onError?.(msg);
      this.stopSession();
      return false;
    }
  }

  public stopSession() {
    if (this.status === 'disconnected' && !this.isSessionActiveFlag) {
      return;
    }

    // Fence ALL pending async callbacks immediately
    this.sessionSeq += 1;
    this.responseSeq += 1;
    this.setSessionActive(false);
    this.transitionTo('stopping');

    // Abort any in-flight /api/voice/process or /api/voice/speak fetch
    if (this.activeFetchController) {
      try {
        this.activeFetchController.abort();
      } catch {
        // Ignore
      }
      this.activeFetchController = null;
    }

    // Clear ALL timers
    this.clearAllTimers();

    // Cancel all audio playback & queued streaming buffers
    this.clearPlaybackResources();

    // Teardown Gemini Live WebSocket & audio processor if active
    this.teardownLiveBridge();

    // Teardown speech recognition cleanly so old callbacks can NEVER fire or restart mic
    if (this.recognition) {
      try {
        this.recognition.onstart = null;
        this.recognition.onresult = null;
        this.recognition.onspeechstart = null;
        this.recognition.onspeechend = null;
        this.recognition.onend = null;
        this.recognition.onerror = null;
        this.recognition.onnomatch = null;
        this.recognition.abort();
      } catch {
        // Ignore browser abort race
      }
      this.recognition = null;
    }
    this.isRecognitionRunning = false;
    this.recognitionPausedForSpeech = false;

    if (this.animationFrameId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Stop all microphone media tracks immediately
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      });
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        void this.audioContext.close();
      } catch {
        // Ignore
      }
      this.audioContext = null;
      this.analyser = null;
    }

    if (this.outputAudioContext && this.outputAudioContext.state !== 'closed') {
      try {
        void this.outputAudioContext.close();
      } catch {
        // Ignore
      }
      this.outputAudioContext = null;
      this.outputAnalyser = null;
    }

    this.setActiveVoiceEngine('none');
    this.setTransportMode('none');
    this.bargeInHighSince = null;
    this.speechStartedAt = null;
    this.lastInterimAt = null;

    this.transitionTo('disconnected');
    this.callbacks.onVolumeChange?.(0, new Array(16).fill(0));
  }

  private clearAllTimers() {
    if (this.recognitionRestartTimeout) {
      clearTimeout(this.recognitionRestartTimeout);
      this.recognitionRestartTimeout = null;
    }
    if (this.idleTimeoutTimer) {
      clearTimeout(this.idleTimeoutTimer);
      this.idleTimeoutTimer = null;
    }
    if (this.playbackWatchdogTimer) {
      clearTimeout(this.playbackWatchdogTimer);
      this.playbackWatchdogTimer = null;
    }
    if (this.speechKeepAliveTimer) {
      clearInterval(this.speechKeepAliveTimer);
      this.speechKeepAliveTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Microphone & AudioContext Initialization / Recovery
  // -------------------------------------------------------------------------

  private async ensureMicrophoneAvailable(sessionSeq: number): Promise<void> {
    if (!this.isCurrentActiveSession(sessionSeq)) return;

    const hasLiveTrack = Boolean(
      this.mediaStream &&
        this.mediaStream.getAudioTracks().some((t) => t.readyState === 'live')
    );

    if (!hasLiveTrack) {
      const getUserMedia = this.getUserMediaFn();
      if (!getUserMedia) {
        throw Object.assign(new Error('getUserMedia unavailable'), { name: 'NotSupportedError' });
      }
      const stream = await getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (!this.isCurrentActiveSession(sessionSeq)) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !this.isMicMuted;
      });
      this.mediaStream = stream;
    }

    const AudioCtx = this.getAudioContextCtor();
    if (AudioCtx && this.mediaStream) {
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx();
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 64;
        source.connect(this.analyser);
        this.startVolumeMonitoring(sessionSeq);
      }
      if (this.audioContext.state === 'suspended') {
        try {
          await this.audioContext.resume();
        } catch {
          // Will retry on next user gesture
        }
      }
    }
  }

  private async ensureOutputAudioContextReady(): Promise<AudioContext | null> {
    const AudioCtx = this.getAudioContextCtor();
    if (!AudioCtx) return null;
    if (!this.outputAudioContext || this.outputAudioContext.state === 'closed') {
      this.outputAudioContext = new AudioCtx();
    }
    if (this.outputAudioContext.state === 'suspended') {
      try {
        await this.outputAudioContext.resume();
      } catch {
        // Ignore if blocked outside user gesture
      }
    }
    return this.outputAudioContext;
  }

  // -------------------------------------------------------------------------
  // Interruption / Barge-In Handling
  // -------------------------------------------------------------------------

  public interrupt(initiatedBySpeech = false) {
    if (!this.isSessionActiveFlag) return;
    if (this.status !== 'ai_speaking' && this.status !== 'processing') return;

    const mySession = this.sessionSeq;
    // Invalidate in-flight response & audio immediately so stale audio can NEVER play later
    this.responseSeq += 1;

    if (this.activeFetchController) {
      try {
        this.activeFetchController.abort();
      } catch {
        // Ignore
      }
      this.activeFetchController = null;
    }

    this.transitionTo('interrupted');
    this.clearPlaybackResources();

    if (this.liveWs && this.liveWs.readyState === 1) {
      try {
        this.liveWs.send(JSON.stringify({ type: 'interrupt' }));
      } catch {
        // Ignore
      }
    }

    if (initiatedBySpeech) {
      this.transitionTo('user_speaking');
      this.speechStartedAt = Date.now();
    } else {
      this.transitionTo('listening');
    }

    this.resetIdleTimer(mySession);
    if (this.transportMode === 'turn_based_continuous' && !this.isMicMuted) {
      void this.resumeSpeechRecognitionSafely(mySession);
    }
  }

  // -------------------------------------------------------------------------
  // Turn-Based Speech Processing & Continuous Context Loop
  // -------------------------------------------------------------------------

  public async handleUserSpeech(
    transcript: string,
    timing?: { speechCaptureDurationMs?: number; speechFinalizationMs?: number; transcriptionLatencyMs?: number }
  ) {
    const cleanTranscript = transcript.trim().slice(0, 2000);
    if (!cleanTranscript) return;

    const mySession = this.sessionSeq;
    if (this.isSessionActiveFlag && !this.isCurrentActiveSession(mySession)) return;

    // Prevent duplicate browser recognition bursts from firing duplicate AI responses
    const normalizedKey = cleanTranscript.toLowerCase().replace(/\s+/g, ' ');
    const now = Date.now();
    if (
      normalizedKey === this.lastFinalSubmittedText &&
      now - this.lastFinalSubmittedAt < 1800
    ) {
      return;
    }
    this.lastFinalSubmittedText = normalizedKey;
    this.lastFinalSubmittedAt = now;

    // Cancel any residual AI speech if user spoke over the assistant
    if (this.status === 'ai_speaking') {
      this.clearPlaybackResources();
    }

    const myResponse = ++this.responseSeq;
    const turnStartedAt = Date.now();
    const speechCaptureDurationMs =
      timing?.speechCaptureDurationMs ??
      (this.speechStartedAt ? Math.max(0, turnStartedAt - this.speechStartedAt) : 0);
    const speechFinalizationMs =
      timing?.speechFinalizationMs ??
      (this.lastInterimAt ? Math.max(0, turnStartedAt - this.lastInterimAt) : 0);
    const transcriptionLatencyMs = timing?.transcriptionLatencyMs ?? 0;

    this.speechStartedAt = null;
    this.lastInterimAt = null;

    // Pause recognition while AI processes & speaks to eliminate self-echo
    this.pauseRecognitionTemporarily();

    // Snapshot prior history BEFORE pushing current utterance (so server never sees duplicate user turn)
    const priorHistory = this.conversationHistory.slice(-16);
    this.conversationHistory = [
      ...this.conversationHistory.slice(-19),
      { sender: 'user', text: cleanTranscript },
    ];

    this.callbacks.onTranscript?.(cleanTranscript, true);
    if (this.isSessionActiveFlag) {
      this.transitionTo('processing');
      this.resetIdleTimer(mySession);
    }

    // Abort any stale prior turn request
    if (this.activeFetchController) {
      try {
        this.activeFetchController.abort();
      } catch {
        // Ignore
      }
    }
    const controller = new AbortController();
    this.activeFetchController = controller;

    // Bounded retry loop for transient network or 5xx API failures (preserves sessionId & context!)
    let responseData: any = null;
    let lastError: string | null = null;
    const maxAttempts = this.networkRetryDelaysMs.length + 1;
    const aiStartedAt = Date.now();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (this.isSessionActiveFlag && !this.isCurrentResponse(mySession, myResponse)) {
        return;
      }

      if (attempt > 0) {
        if (this.isSessionActiveFlag) {
          this.transitionTo('reconnecting');
        }
        const delayMs = this.networkRetryDelaysMs[attempt - 1] ?? 600;
        await this.sleep(delayMs);
        if (this.isSessionActiveFlag && !this.isCurrentResponse(mySession, myResponse)) {
          return;
        }
        if (this.isSessionActiveFlag) {
          this.transitionTo('processing');
        }
      }

      try {
        const response = await this.getFetch()(apiUrl('/api/voice/process'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            sessionId: this.sessionId,
            userMessage: cleanTranscript,
            language: this.language,
            conversationHistory: priorHistory,
            stateContext: this.sharedContext,
          }),
        });

        if (this.isSessionActiveFlag && !this.isCurrentResponse(mySession, myResponse)) {
          return;
        }

        if (response.ok) {
          responseData = await response.json();
          lastError = null;
          break;
        }

        if (response.status >= 500 || response.status === 429) {
          lastError = `Voice service temporarily unavailable (HTTP ${response.status})`;
          continue;
        }

        const errBody = await response.json().catch(() => ({}));
        lastError = errBody?.error || `Voice request failed (HTTP ${response.status})`;
        break;
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return;
        }
        lastError = err?.message || 'Network disruption while contacting voice service.';
      }
    }

    if (this.activeFetchController === controller) {
      this.activeFetchController = null;
    }

    if (this.isSessionActiveFlag && !this.isCurrentResponse(mySession, myResponse)) {
      return;
    }

    const aiResponseLatencyMs = Date.now() - aiStartedAt;
    this.lastResponseLatencyMs = aiResponseLatencyMs;

    let replyText: string;
    let spokenText: string;
    let detectedIntent: VoiceAiIntent = {};

    if (responseData && typeof responseData.replyText === 'string' && responseData.replyText.trim()) {
      if (responseData.sessionId) {
        this.sessionId = responseData.sessionId;
      }
      replyText = responseData.replyText.trim();
      spokenText =
        typeof responseData.spokenText === 'string' && responseData.spokenText.trim()
          ? responseData.spokenText.trim()
          : replyText;
      if (responseData.updatedContext && typeof responseData.updatedContext === 'object') {
        this.sharedContext = {
          ...this.sharedContext,
          ...responseData.updatedContext,
        };
      }
      detectedIntent = {
        ...(responseData.detectedIntent || {}),
        recommendedServiceIds: Array.isArray(responseData.recommendedServiceIds)
          ? responseData.recommendedServiceIds
          : undefined,
        quickReplies: Array.isArray(responseData.quickReplies)
          ? responseData.quickReplies
          : undefined,
        resourceLinks: Array.isArray(responseData.resourceLinks)
          ? responseData.resourceLinks
          : undefined,
        updatedContext: responseData.updatedContext,
      };
    } else {
      // Surface accurate connection error and recover gracefully to listening
      const errMsg = lastError || 'Temporary voice connection issue. Reconnecting automatically.';
      this.callbacks.onError?.(errMsg);
      replyText = this.generateContextualLocalFallback(cleanTranscript);
      spokenText = replyText;
    }

    this.turnCount += 1;
    this.conversationHistory = [
      ...this.conversationHistory.slice(-19),
      { sender: 'ai', text: replyText },
    ];

    this.callbacks.onAiResponse?.(replyText, detectedIntent);

    // Only trigger booking/brief modal when the user affirmatively requested it
    if (detectedIntent.isBookingIntent) {
      this.callbacks.onBookingRequested?.();
    } else if (detectedIntent.isBriefIntent && /\b(open|show|review|view)\s+.*brief\b/i.test(cleanTranscript)) {
      this.callbacks.onBriefRequested?.();
    }

    const audioGenStart = Date.now();
    const audioResult = await this.speakTextInternal(spokenText, mySession, myResponse, true);
    const totalTurnLatencyMs = Date.now() - turnStartedAt;

    if (this.isCurrentActiveSession(mySession)) {
      const metrics: VoiceTurnMetrics = {
        turnNumber: this.turnCount,
        speechCaptureDurationMs,
        speechFinalizationMs,
        transcriptionLatencyMs,
        aiResponseLatencyMs,
        audioGenerationLatencyMs: audioResult.audioGenerationLatencyMs,
        timeToFirstAudibleResponseMs:
          audioResult.firstAudioAtMs !== null
            ? Math.max(0, audioResult.firstAudioAtMs - turnStartedAt)
            : Math.max(0, Date.now() - audioGenStart + aiResponseLatencyMs),
        totalTurnLatencyMs,
        voiceEngine: this.activeVoiceEngine,
        transportMode: this.transportMode,
        recordedAt: new Date().toISOString(),
      };
      this.lastTurnMetrics = metrics;
      this.turnMetricsHistory.push(metrics);
      if (this.turnMetricsHistory.length > 50) {
        this.turnMetricsHistory.shift();
      }
      this.callbacks.onTurnMetrics?.(metrics);
    }
  }

  // -------------------------------------------------------------------------
  // Guaranteed Audible Playback & Post-Playback Listening Recovery
  // -------------------------------------------------------------------------

  public async speakText(text: string, restartRecognitionAfter = true): Promise<void> {
    const mySession = this.sessionSeq;
    const myResponse = ++this.responseSeq;
    await this.speakTextInternal(text, mySession, myResponse, restartRecognitionAfter);
  }

  private async speakTextInternal(
    text: string,
    sessionSeq: number,
    responseSeq: number,
    restartListeningAfter: boolean
  ): Promise<{ played: boolean; audioGenerationLatencyMs: number; firstAudioAtMs: number | null }> {
    const cleanText = this.formatSpokenCadence(text);
    if (!cleanText) {
      if (restartListeningAfter) {
        await this.handleAssistantPlaybackComplete(sessionSeq, responseSeq);
      }
      return { played: false, audioGenerationLatencyMs: 0, firstAudioAtMs: null };
    }

    if (this.sessionSeq !== sessionSeq || this.responseSeq !== responseSeq) {
      return { played: false, audioGenerationLatencyMs: 0, firstAudioAtMs: null };
    }

    if (this.isSpeakerMuted) {
      if (restartListeningAfter && this.isCurrentResponse(sessionSeq, responseSeq)) {
        await this.handleAssistantPlaybackComplete(sessionSeq, responseSeq);
      }
      return { played: false, audioGenerationLatencyMs: 0, firstAudioAtMs: null };
    }

    this.clearPlaybackResources();
    this.pauseRecognitionTemporarily();

    if (this.isSessionActiveFlag) {
      this.transitionTo('ai_speaking');
    }

    const genStartedAt = Date.now();
    let firstAudioAtMs: number | null = null;
    let audioGenerationLatencyMs = 0;

    // 1. Primary audio provider: server-side Gemini 3.8 Neural TTS (female voice Kore)
    try {
      const controller = new AbortController();
      this.activeFetchController = controller;
      const ttsRes = await this.getFetch()(apiUrl('/api/voice/speak'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ text: cleanText }),
      });

      if (this.activeFetchController === controller) {
        this.activeFetchController = null;
      }

      if (this.sessionSeq !== sessionSeq || this.responseSeq !== responseSeq) {
        return { played: false, audioGenerationLatencyMs: Date.now() - genStartedAt, firstAudioAtMs: null };
      }

      audioGenerationLatencyMs = Date.now() - genStartedAt;

      if (ttsRes.ok) {
        const ttsData = await ttsRes.json();
        if (ttsData.success && ttsData.audioBase64 && !this.isSpeakerMuted) {
          this.setActiveVoiceEngine('gemini_neural');

          // 1a. Try Web Audio API AudioBufferSourceNode (real output analyser + accurate onended)
          firstAudioAtMs = Date.now();
          const playedWebAudio = await this.playNeuralAudioWithAnalyser(
            ttsData.audioBase64,
            sessionSeq,
            responseSeq,
            restartListeningAfter
          );
          if (playedWebAudio) {
            return { played: true, audioGenerationLatencyMs, firstAudioAtMs };
          }

          if (this.sessionSeq !== sessionSeq || this.responseSeq !== responseSeq) {
            return { played: false, audioGenerationLatencyMs, firstAudioAtMs };
          }

          // 1b. Try HTMLAudioElement playback
          const playedHtmlAudio = await this.playHtmlAudioElement(
            ttsData.audioBase64,
            ttsData.mimeType || 'audio/wav',
            sessionSeq,
            responseSeq,
            restartListeningAfter
          );
          if (playedHtmlAudio) {
            return { played: true, audioGenerationLatencyMs, firstAudioAtMs };
          }
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { played: false, audioGenerationLatencyMs: Date.now() - genStartedAt, firstAudioAtMs: null };
      }
      audioGenerationLatencyMs = Date.now() - genStartedAt;
    }

    if (this.sessionSeq !== sessionSeq || this.responseSeq !== responseSeq) {
      return { played: false, audioGenerationLatencyMs, firstAudioAtMs: null };
    }

    // 2. Authorized fallback: Natural female browser SpeechSynthesis
    firstAudioAtMs = Date.now();
    const playedBrowserTts = await this.speakWithBrowserFemaleVoice(
      cleanText,
      sessionSeq,
      responseSeq,
      restartListeningAfter
    );

    if (playedBrowserTts) {
      return { played: true, audioGenerationLatencyMs, firstAudioAtMs };
    }

    // If cancelled by user barge-in interruption or session stop, exit cleanly without error
    if (!this.isCurrentResponse(sessionSeq, responseSeq)) {
      return { played: false, audioGenerationLatencyMs, firstAudioAtMs: null };
    }

    // 3. All audio providers failed: report honestly (never fabricate playback!) and still recover listening
    this.setActiveVoiceEngine('none');
    this.callbacks.onError?.(
      'Audio playback could not start on this device. Responses remain visible in chat and you can continue speaking or typing.'
    );
    if (restartListeningAfter && this.isCurrentResponse(sessionSeq, responseSeq)) {
      await this.handleAssistantPlaybackComplete(sessionSeq, responseSeq);
    }
    return { played: false, audioGenerationLatencyMs, firstAudioAtMs: null };
  }

  private async playNeuralAudioWithAnalyser(
    audioBase64: string,
    sessionSeq: number,
    responseSeq: number,
    restartListeningAfter: boolean
  ): Promise<boolean> {
    try {
      const ctx = await this.ensureOutputAudioContextReady();
      if (!ctx || typeof ctx.decodeAudioData !== 'function') return false;

      const bytes = base64ToUint8Array(audioBase64);
      const bufferCopy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const decoded = await ctx.decodeAudioData(bufferCopy);

      if (this.sessionSeq !== sessionSeq || this.responseSeq !== responseSeq) {
        return true; // Intentionally cancelled by interruption or stop
      }
      if (this.isSpeakerMuted) {
        if (restartListeningAfter) {
          await this.handleAssistantPlaybackComplete(sessionSeq, responseSeq);
        }
        return true;
      }

      return await new Promise<boolean>((resolve) => {
        let finished = false;
        const finishOnce = (ok = true) => {
          if (finished) return;
          finished = true;
          this.clearPlaybackWatchdog();
          if (this.activePlaybackAbortResolver === abortResolve) {
            this.activePlaybackAbortResolver = null;
          }
          if (this.currentBufferSource === source) {
            this.currentBufferSource = null;
            this.outputAnalyser = null;
          }
          if (ok && restartListeningAfter && this.isCurrentResponse(sessionSeq, responseSeq)) {
            void this.handleAssistantPlaybackComplete(sessionSeq, responseSeq).finally(() => resolve(true));
            return;
          }
          resolve(ok);
        };
        const abortResolve = () => finishOnce(false);
        this.activePlaybackAbortResolver = abortResolve;

        const source = ctx.createBufferSource();
        source.buffer = decoded;

        const outputAnalyser = ctx.createAnalyser();
        outputAnalyser.fftSize = 64;
        source.connect(outputAnalyser);
        outputAnalyser.connect(ctx.destination);

        this.outputAnalyser = outputAnalyser;
        this.currentBufferSource = source;

        source.onended = () => finishOnce(true);

        // Safety watchdog in case browser drops onended
        const estimatedMs = Math.max(1500, Math.ceil((decoded.duration || 3) * 1000)) + this.playbackWatchdogPaddingMs;
        this.armPlaybackWatchdog(estimatedMs, () => finishOnce(true));

        source.start(0);
      });
    } catch {
      this.outputAnalyser = null;
      this.currentBufferSource = null;
      return false;
    }
  }

  private async playHtmlAudioElement(
    audioBase64: string,
    mimeType: string,
    sessionSeq: number,
    responseSeq: number,
    restartListeningAfter: boolean
  ): Promise<boolean> {
    const AudioConstructor =
      this.deps.AudioCtor || (typeof Audio !== 'undefined' ? Audio : null);
    if (!AudioConstructor) return false;

    try {
      const audio = new AudioConstructor(`data:${mimeType};base64,${audioBase64}`);
      this.currentAudio = audio;

      return await new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (ok: boolean) => {
          if (settled) return;
          settled = true;
          this.clearPlaybackWatchdog();
          if (this.activePlaybackAbortResolver === abortResolve) {
            this.activePlaybackAbortResolver = null;
          }
          if (this.currentAudio === audio) {
            this.currentAudio = null;
          }
          if (ok && restartListeningAfter && this.isCurrentResponse(sessionSeq, responseSeq)) {
            void this.handleAssistantPlaybackComplete(sessionSeq, responseSeq).finally(() => resolve(ok));
            return;
          }
          resolve(ok);
        };
        const abortResolve = () => settle(false);
        this.activePlaybackAbortResolver = abortResolve;

        audio.onended = () => settle(true);
        audio.onerror = () => settle(false);

        const playResult = audio.play();
        if (playResult && typeof playResult.then === 'function') {
          playResult
            .then(() => {
              this.armPlaybackWatchdog(25_000, () => settle(true));
            })
            .catch(() => settle(false));
        } else {
          this.armPlaybackWatchdog(25_000, () => settle(true));
        }
      });
    } catch {
      this.currentAudio = null;
      return false;
    }
  }

  private async speakWithBrowserFemaleVoice(
    cleanText: string,
    sessionSeq: number,
    responseSeq: number,
    restartListeningAfter: boolean
  ): Promise<boolean> {
    const synth = this.getSpeechSynthesis();
    const UtteranceCtor =
      this.deps.SpeechSynthesisUtteranceCtor ||
      (typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : null);

    if (!synth || !UtteranceCtor || this.isSpeakerMuted) {
      return false;
    }

    this.setActiveVoiceEngine('browser_fallback');

    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const finishOnce = (ok: boolean) => {
        if (settled) return;
        settled = true;
        this.clearPlaybackWatchdog();
        if (this.activePlaybackAbortResolver === abortResolve) {
          this.activePlaybackAbortResolver = null;
        }
        if (this.speechKeepAliveTimer) {
          clearInterval(this.speechKeepAliveTimer);
          this.speechKeepAliveTimer = null;
        }
        if (this.currentUtterance === utterance) {
          this.currentUtterance = null;
        }
        if (ok && restartListeningAfter && this.isCurrentResponse(sessionSeq, responseSeq)) {
          void this.handleAssistantPlaybackComplete(sessionSeq, responseSeq).finally(() => resolve(ok));
          return;
        }
        resolve(ok);
      };
      const abortResolve = () => finishOnce(false);
      this.activePlaybackAbortResolver = abortResolve;

      const utterance = new UtteranceCtor(cleanText);
      utterance.lang = this.language;
      utterance.rate = 0.98;
      utterance.pitch = 1.02;
      this.currentUtterance = utterance;

      const voices = typeof synth.getVoices === 'function' ? synth.getVoices() : [];
      if (this.language.startsWith('fil')) {
        const filVoice = voices.find(
          (v) => v.lang.includes('fil') || v.lang.includes('tl') || v.name.includes('Filipino')
        );
        if (filVoice) utterance.voice = filVoice;
      } else {
        const preferredFemaleNames = [
          'Aria',
          'Jenny',
          'Samantha',
          'Ava',
          'Allison',
          'Victoria',
          'Zira',
          'Google US English',
          'Natural',
        ];
        const enVoice =
          preferredFemaleNames
            .map((name) =>
              voices.find(
                (v) =>
                  (v.lang.includes('en-US') || v.lang.includes('en-GB') || v.lang.includes('en')) &&
                  v.name.includes(name)
              )
            )
            .find(Boolean) ||
          voices.find((v) => v.lang.includes('en-US') || v.lang.includes('en'));
        if (enVoice) utterance.voice = enVoice;
      }

      utterance.onend = () => finishOnce(true);
      utterance.onerror = (ev: any) => {
        const code = ev?.error || '';
        // 'interrupted' / 'canceled' are normal when user barges in or ends session
        if (code === 'interrupted' || code === 'canceled') {
          finishOnce(false);
          return;
        }
        finishOnce(false);
      };

      // Chrome SpeechSynthesis keep-alive prevents silent 15s stall bug on longer replies
      if (typeof synth.resume === 'function') {
        this.speechKeepAliveTimer = setInterval(() => {
          if (this.currentUtterance === utterance && synth.speaking) {
            try {
              synth.resume();
            } catch {
              // Ignore
            }
          }
        }, 9000);
      }

      // Safety completion watchdog (prevents permanent wedge if browser omits onend)
      const wordCount = Math.max(1, cleanText.split(/\s+/).length);
      const expectedSpeechMs = Math.max(2000, Math.ceil((wordCount / 2.2) * 1000)) + this.playbackWatchdogPaddingMs;
      this.armPlaybackWatchdog(expectedSpeechMs, () => finishOnce(true));

      try {
        synth.speak(utterance);
      } catch {
        finishOnce(false);
      }
    });
  }

  /**
   * Centralized, deterministic post-playback recovery handler.
   * Transitions `ai_speaking -> listening`, verifies microphone liveness,
   * and safely resumes speech recognition without duplicate restarts.
   */
  private async handleAssistantPlaybackComplete(sessionSeq: number, responseSeq: number) {
    if (!this.isCurrentResponse(sessionSeq, responseSeq)) return;

    this.clearPlaybackResources();
    this.transitionTo('listening');
    this.resetIdleTimer(sessionSeq);

    if (this.isMicMuted) {
      return;
    }

    try {
      await this.ensureMicrophoneAvailable(sessionSeq);
    } catch {
      if (!this.isCurrentActiveSession(sessionSeq)) return;
      this.callbacks.onError?.('Microphone connection interrupted. Please check microphone permissions.');
      this.transitionTo('error');
      return;
    }

    if (!this.isCurrentResponse(sessionSeq, responseSeq)) return;

    if (this.transportMode === 'turn_based_continuous') {
      await this.resumeSpeechRecognitionSafely(sessionSeq);
    }
  }

  public cancelSpeech() {
    this.responseSeq += 1;
    this.clearPlaybackResources();
  }

  private clearPlaybackWatchdog() {
    if (this.playbackWatchdogTimer) {
      clearTimeout(this.playbackWatchdogTimer);
      this.playbackWatchdogTimer = null;
    }
  }

  private armPlaybackWatchdog(timeoutMs: number, onExpire: () => void) {
    this.clearPlaybackWatchdog();
    this.playbackWatchdogTimer = setTimeout(() => {
      this.playbackWatchdogTimer = null;
      onExpire();
    }, timeoutMs);
  }

  private clearPlaybackResources() {
    this.clearPlaybackWatchdog();
    if (this.speechKeepAliveTimer) {
      clearInterval(this.speechKeepAliveTimer);
      this.speechKeepAliveTimer = null;
    }

    if (this.currentBufferSource) {
      try {
        this.currentBufferSource.onended = null;
        this.currentBufferSource.stop();
        this.currentBufferSource.disconnect();
      } catch {
        // Ignore already-stopped source
      }
      this.currentBufferSource = null;
      this.outputAnalyser = null;
    }

    for (const src of this.liveQueuedSources) {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        // Ignore
      }
    }
    this.liveQueuedSources.clear();
    this.liveNextStartTime = 0;

    if (this.currentAudio) {
      try {
        this.currentAudio.onended = null;
        this.currentAudio.onerror = null;
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {
        // Ignore
      }
      this.currentAudio = null;
    }

    const synth = this.getSpeechSynthesis();
    if (synth) {
      try {
        if (this.currentUtterance) {
          this.currentUtterance.onend = null;
          this.currentUtterance.onerror = null;
        }
        synth.cancel();
      } catch {
        // Ignore
      }
      this.currentUtterance = null;
    }

    if (this.activePlaybackAbortResolver) {
      const resolver = this.activePlaybackAbortResolver;
      this.activePlaybackAbortResolver = null;
      resolver();
    }
  }

  // -------------------------------------------------------------------------
  // Speech Recognition Setup, Handling & Safe Auto-Recovery
  // -------------------------------------------------------------------------

  private setupRecognition(SpeechRecognitionClass: new () => any, sessionSeq: number) {
    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = this.language;
    this.recognition = recognition;

    recognition.onstart = () => {
      if (!this.isCurrentActiveSession(sessionSeq)) {
        try {
          recognition.abort();
        } catch {
          // Ignore
        }
        return;
      }
      this.isRecognitionRunning = true;
      this.recognitionPausedForSpeech = false;
      this.consecutiveRecognitionFailures = 0;
      if (this.status === 'connecting' || this.status === 'reconnecting') {
        this.transitionTo('listening');
      }
    };

    recognition.onspeechstart = () => {
      if (!this.isCurrentActiveSession(sessionSeq)) return;
      this.speechStartedAt = Date.now();
      this.resetIdleTimer(sessionSeq);
      if (this.status === 'listening' || this.status === 'interrupted') {
        this.transitionTo('user_speaking');
      }
    };

    recognition.onspeechend = () => {
      if (!this.isCurrentActiveSession(sessionSeq)) return;
      this.lastInterimAt = Date.now();
    };

    recognition.onresult = (event: any) => {
      if (!this.isCurrentActiveSession(sessionSeq)) return;
      if (this.status === 'ai_speaking' || this.status === 'processing') {
        // Ignore self-echo or late fragments while AI is speaking/processing
        return;
      }

      let interimTranscript = '';
      let finalTranscript = '';

      const startIdx = typeof event.resultIndex === 'number' ? event.resultIndex : 0;
      for (let i = startIdx; i < event.results.length; i++) {
        const item = event.results[i];
        const piece = item?.[0]?.transcript || '';
        if (item?.isFinal) {
          finalTranscript += piece;
        } else {
          interimTranscript += piece;
        }
      }

      if (interimTranscript.trim()) {
        if (!this.speechStartedAt) this.speechStartedAt = Date.now();
        this.lastInterimAt = Date.now();
        this.resetIdleTimer(sessionSeq);
        if (this.status === 'listening' || this.status === 'interrupted') {
          this.transitionTo('user_speaking');
        }
        this.callbacks.onTranscript?.(interimTranscript.trim(), false);
      }

      if (finalTranscript.trim()) {
        this.consecutiveRecognitionFailures = 0;
        void this.handleUserSpeech(finalTranscript.trim());
      }
    };

    recognition.onnomatch = () => {
      if (!this.isCurrentActiveSession(sessionSeq)) return;
      if (this.status === 'user_speaking') {
        this.transitionTo('listening');
      }
    };

    recognition.onerror = (event: any) => {
      if (!this.isCurrentActiveSession(sessionSeq)) return;
      const errCode = event?.error || 'unknown';

      // Normal browser idle silence or intentional pause during AI speech
      if (errCode === 'no-speech' || (errCode === 'aborted' && this.recognitionPausedForSpeech)) {
        return;
      }

      if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
        this.callbacks.onError?.(
          'Microphone permission was revoked. Please re-enable microphone access to continue voice conversation.'
        );
        this.transitionTo('error');
        this.stopSession();
        return;
      }

      this.consecutiveRecognitionFailures += 1;
      if (errCode === 'network') {
        this.transitionTo('reconnecting');
      }

      if (this.consecutiveRecognitionFailures > this.maxConsecutiveRecognitionFailures) {
        this.callbacks.onError?.(
          'Speech recognition encountered repeated interruptions. Please check your connection or restart voice.'
        );
        this.transitionTo('error');
      }
    };

    recognition.onend = () => {
      this.isRecognitionRunning = false;
      if (!this.isCurrentActiveSession(sessionSeq)) return;
      if (this.isMicMuted || this.recognitionPausedForSpeech) return;
      if (this.status === 'ai_speaking' || this.status === 'processing' || this.status === 'stopping' || this.status === 'error') {
        return;
      }

      // Unexpected browser recognition end while active & listening -> recover with bounded backoff
      if (this.status === 'user_speaking') {
        this.transitionTo('listening');
      }
      this.scheduleRecognitionRecovery(sessionSeq);
    };
  }

  private pauseRecognitionTemporarily() {
    this.recognitionPausedForSpeech = true;
    if (this.recognitionRestartTimeout) {
      clearTimeout(this.recognitionRestartTimeout);
      this.recognitionRestartTimeout = null;
    }
    if (this.recognition && this.isRecognitionRunning) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore
      }
      this.isRecognitionRunning = false;
    }
  }

  private scheduleRecognitionRecovery(sessionSeq: number) {
    if (!this.isCurrentActiveSession(sessionSeq)) return;
    if (this.recognitionRestartTimeout) return; // Prevent duplicate restart timers

    if (this.consecutiveRecognitionFailures >= this.maxConsecutiveRecognitionFailures) {
      this.transitionTo('error');
      this.callbacks.onError?.(
        'Microphone listening could not recover automatically. Click End Voice and Start Voice to reconnect.'
      );
      return;
    }

    const backoff = Math.min(
      2400,
      this.recognitionRestartBaseDelayMs * Math.pow(2, this.consecutiveRecognitionFailures)
    );
    this.recognitionRestartTimeout = setTimeout(() => {
      this.recognitionRestartTimeout = null;
      if (!this.isCurrentActiveSession(sessionSeq)) return;
      if (this.status === 'listening' || this.status === 'user_speaking' || this.status === 'reconnecting') {
        void this.resumeSpeechRecognitionSafely(sessionSeq);
      }
    }, backoff);
  }

  private async resumeSpeechRecognitionSafely(sessionSeq: number): Promise<boolean> {
    if (!this.isCurrentActiveSession(sessionSeq)) return false;
    if (this.isMicMuted || !this.recognition) return false;
    if (this.isRecognitionRunning) return true;
    if (this.status === 'ai_speaking' || this.status === 'processing' || this.status === 'stopping') {
      return false;
    }

    if (this.recognitionRestartTimeout) {
      clearTimeout(this.recognitionRestartTimeout);
      this.recognitionRestartTimeout = null;
    }

    this.recognitionPausedForSpeech = false;
    try {
      this.recognition.lang = this.language;
      this.recognition.start();
      this.isRecognitionRunning = true;
      if (this.status === 'reconnecting' || this.status === 'connecting') {
        this.transitionTo('listening');
      }
      return true;
    } catch (err: any) {
      // Browser may still be finalizing previous stop(); schedule single bounded retry
      this.isRecognitionRunning = false;
      this.consecutiveRecognitionFailures += 1;
      if (err?.name === 'InvalidStateError') {
        this.isRecognitionRunning = true;
        return true;
      }
      this.scheduleRecognitionRecovery(sessionSeq);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Full-Duplex Gemini Live WebSocket Bridge (16kHz in -> 24kHz gapless out)
  // -------------------------------------------------------------------------

  private async tryConnectGeminiLive(sessionSeq: number, wsPath: string): Promise<boolean> {
    const WsCtor = this.deps.WebSocketCtor || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    if (!WsCtor) return false;

    const apiBase = resolveApiBaseUrl();
    let wsUrl = '';
    if (apiBase) {
      wsUrl = `${apiBase.replace(/^http/i, 'ws')}${wsPath}`;
    } else if (typeof window !== 'undefined' && window.location?.host) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}${wsPath}`;
    } else {
      return false;
    }

    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(connectTimeout);
        resolve(ok);
      };

      const connectTimeout = setTimeout(() => {
        this.teardownLiveBridge();
        done(false);
      }, 3500);

      try {
        const ws = new WsCtor(wsUrl);
        this.liveWs = ws;

        ws.onopen = () => {
          if (!this.isCurrentActiveSession(sessionSeq)) {
            this.teardownLiveBridge();
            done(false);
            return;
          }
          ws.send(
            JSON.stringify({
              type: 'init',
              sessionId: this.sessionId,
              language: this.language,
              history: this.conversationHistory.slice(-10),
            })
          );
        };

        ws.onmessage = (event) => {
          if (!this.isCurrentActiveSession(sessionSeq)) return;
          let msg: any;
          try {
            msg = JSON.parse(String(event.data));
          } catch {
            return;
          }

          if (msg.type === 'ready') {
            this.startLiveMicrophoneStreaming(sessionSeq, ws);
            done(true);
            return;
          }

          if (msg.type === 'error') {
            if (!settled) {
              this.teardownLiveBridge();
              done(false);
              return;
            }
            this.callbacks.onError?.(msg.message || 'Live voice stream interrupted.');
            return;
          }

          if (msg.type === 'interrupted') {
            this.clearPlaybackResources();
            this.transitionTo('interrupted');
            this.transitionTo('user_speaking');
            return;
          }

          if (msg.type === 'input_transcript' && msg.text) {
            this.conversationHistory = [
              ...this.conversationHistory.slice(-19),
              { sender: 'user', text: String(msg.text) },
            ];
            this.callbacks.onTranscript?.(String(msg.text), true);
            this.resetIdleTimer(sessionSeq);
            return;
          }

          if (msg.type === 'audio' && msg.data) {
            this.liveTurnCompleteReceived = false;
            if (this.status !== 'ai_speaking') {
              this.transitionTo('ai_speaking');
            }
            void this.enqueueLivePcm24kChunk(String(msg.data), sessionSeq);
            return;
          }

          if (msg.type === 'turn_complete') {
            this.liveTurnCompleteReceived = true;
            if (msg.text) {
              this.turnCount += 1;
              this.conversationHistory = [
                ...this.conversationHistory.slice(-19),
                { sender: 'ai', text: String(msg.text) },
              ];
              this.callbacks.onAiResponse?.(String(msg.text));
            }
            // Only resume 'listening' once the actual queued audio playback finishes!
            if (this.liveQueuedSources.size === 0 && this.isCurrentActiveSession(sessionSeq)) {
              this.transitionTo('listening');
            }
          }
        };

        ws.onerror = () => {
          if (!settled) {
            this.teardownLiveBridge();
            done(false);
          }
        };

        ws.onclose = () => {
          if (!settled) {
            done(false);
            return;
          }
          if (this.isCurrentActiveSession(sessionSeq) && this.transportMode === 'gemini_live_duplex') {
            // Gracefully downgrade to turn-based continuous mode while preserving context
            this.teardownLiveBridge();
            this.setTransportMode('turn_based_continuous');
            const RecognitionCtor = this.getSpeechRecognitionCtor();
            if (RecognitionCtor && !this.recognition) {
              this.setupRecognition(RecognitionCtor, sessionSeq);
            }
            this.transitionTo('listening');
            void this.resumeSpeechRecognitionSafely(sessionSeq);
          }
        };
      } catch {
        this.teardownLiveBridge();
        done(false);
      }
    });
  }

  private startLiveMicrophoneStreaming(sessionSeq: number, ws: WebSocket) {
    if (!this.audioContext || !this.mediaStream) return;
    try {
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.liveProcessor = processor;
      processor.onaudioprocess = (ev) => {
        if (!this.isCurrentActiveSession(sessionSeq) || this.isMicMuted || ws.readyState !== 1) return;
        const input = ev.inputBuffer.getChannelData(0);
        const downsampled = this.downsampleTo16k(input, this.audioContext?.sampleRate || 16000);
        ws.send(JSON.stringify({ type: 'audio', data: pcm16FloatToBase64(downsampled) }));
      };
      source.connect(processor);
      processor.connect(this.audioContext.destination);
    } catch {
      // Ignore if ScriptProcessor unavailable
    }
  }

  private downsampleTo16k(input: Float32Array, sourceRate: number): Float32Array {
    if (sourceRate <= 16000) return input;
    const ratio = sourceRate / 16000;
    const outLen = Math.floor(input.length / ratio);
    const result = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      result[i] = input[Math.floor(i * ratio)];
    }
    return result;
  }

  private async enqueueLivePcm24kChunk(base64Pcm: string, sessionSeq: number) {
    if (!this.isCurrentActiveSession(sessionSeq) || this.isSpeakerMuted) return;
    const ctx = await this.ensureOutputAudioContextReady();
    if (!ctx) return;

    const rawBytes = base64ToUint8Array(base64Pcm);
    const sampleCount = Math.floor(rawBytes.byteLength / 2);
    if (sampleCount === 0) return;

    const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
    const audioBuffer = ctx.createBuffer(1, sampleCount, 24000);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      channel[i] = view.getInt16(i * 2, true) / 32768;
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    this.outputAnalyser = analyser;

    const now = ctx.currentTime;
    const startAt = Math.max(now, this.liveNextStartTime);
    this.liveNextStartTime = startAt + audioBuffer.duration;
    this.liveQueuedSources.add(source);

    source.onended = () => {
      this.liveQueuedSources.delete(source);
      if (this.liveQueuedSources.size === 0) {
        this.outputAnalyser = null;
        if (this.liveTurnCompleteReceived && this.isCurrentActiveSession(sessionSeq)) {
          this.transitionTo('listening');
        }
      }
    };

    source.start(startAt);
  }

  private teardownLiveBridge() {
    if (this.liveProcessor) {
      try {
        this.liveProcessor.onaudioprocess = null;
        this.liveProcessor.disconnect();
      } catch {
        // Ignore
      }
      this.liveProcessor = null;
    }
    if (this.liveWs) {
      try {
        this.liveWs.onopen = null;
        this.liveWs.onmessage = null;
        this.liveWs.onerror = null;
        this.liveWs.onclose = null;
        this.liveWs.close();
      } catch {
        // Ignore
      }
      this.liveWs = null;
    }
  }

  // -------------------------------------------------------------------------
  // Real Web Audio Level Metering & Barge-In Energy Detection
  // -------------------------------------------------------------------------

  private startVolumeMonitoring(sessionSeq: number) {
    if (typeof requestAnimationFrame !== 'function') return;

    const sampleLevels = () => {
      if (!this.isCurrentActiveSession(sessionSeq)) return;

      const bands = new Array<number>(16).fill(0);

      if (this.status === 'ai_speaking') {
        if (this.outputAnalyser) {
          const outData = new Uint8Array(this.outputAnalyser.frequencyBinCount);
          this.outputAnalyser.getByteFrequencyData(outData);
          let sum = 0;
          for (let i = 0; i < outData.length; i++) sum += outData[i];
          const avg = outData.length > 0 ? sum / outData.length : 0;
          const normalized = Math.min(100, Math.round((avg / 255) * 100 * 2.2));
          for (let b = 0; b < 16; b++) {
            const idx = Math.min(outData.length - 1, Math.floor((b / 16) * outData.length));
            bands[b] = Math.min(100, Math.round(((outData[idx] || 0) / 255) * 100 * 1.8));
          }
          this.callbacks.onVolumeChange?.(normalized, bands);
        } else {
          // Browser SpeechSynthesis does not expose a Web Audio stream; do NOT fake random bars
          this.callbacks.onVolumeChange?.(0, bands);
        }

        // Real microphone energy barge-in detection (with browser echoCancellation active)
        if (this.analyser && !this.isMicMuted && this.transportMode === 'turn_based_continuous') {
          const micLevel = this.readAnalyserLevel(this.analyser);
          if (micLevel >= this.bargeInThreshold) {
            if (this.bargeInHighSince === null) {
              this.bargeInHighSince = Date.now();
            } else if (Date.now() - this.bargeInHighSince >= this.bargeInHoldMs) {
              this.bargeInHighSince = null;
              this.interrupt(true);
            }
          } else {
            this.bargeInHighSince = null;
          }
        }
      } else if (this.analyser && !this.isMicMuted) {
        this.bargeInHighSince = null;
        const micData = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(micData);
        let sum = 0;
        for (let i = 0; i < micData.length; i++) sum += micData[i];
        const avg = micData.length > 0 ? sum / micData.length : 0;
        const normalized = Math.min(100, Math.round((avg / 255) * 100 * 2.2));
        for (let b = 0; b < 16; b++) {
          const idx = Math.min(micData.length - 1, Math.floor((b / 16) * micData.length));
          bands[b] = Math.min(100, Math.round(((micData[idx] || 0) / 255) * 100 * 1.8));
        }
        this.callbacks.onVolumeChange?.(normalized, bands);
      } else {
        this.bargeInHighSince = null;
        this.callbacks.onVolumeChange?.(0, bands);
      }

      this.animationFrameId = requestAnimationFrame(sampleLevels);
    };

    this.animationFrameId = requestAnimationFrame(sampleLevels);
  }

  private readAnalyserLevel(analyser: AnalyserNode): number {
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = data.length > 0 ? sum / data.length : 0;
    return Math.min(100, Math.round((avg / 255) * 100 * 2.2));
  }

  // -------------------------------------------------------------------------
  // Spoken Cadence Formatting & Offline Contextual Fallback
  // -------------------------------------------------------------------------

  private formatSpokenCadence(text: string): string {
    return text
      .replace(/[*#_`~>]/g, '')
      .replace(/\+?1[\s.-]*\(?307\)?[\s.-]*419[\s.-]*4277/g, 'Plus one, three zero seven, four one nine, four two seven seven')
      .replace(
        /SUITE\s*6082\s*-\s*30\s*N\s*Gould\s*St\s*#6082,\s*Sheridan,\s*Sheridan\s*County,\s*WY\s*82801\s*USA/gi,
        'Suite 6082, 30 North Gould Street, number 6082, Sheridan, Sheridan County, Wyoming, 82801, United States of America'
      )
      .replace(/\bWY\b/g, 'Wyoming')
      .replace(/https?:\/\/destriatech\.com\/?/gi, 'destriatech dot com')
      .replace(/info@destriatech\.com/gi, 'info at destriatech dot com')
      .replace(/(?:DTI|OPM)-[A-Z]+-\d+-[A-Z0-9]+/g, (match) => match.split('-').join(' '))
      .trim();
  }

  private generateContextualLocalFallback(input: string): string {
    const isFilipino = this.language.startsWith('fil');
    const lower = input.toLowerCase();

    if (/(price|pricing|cost|budget|rate|discount|promo|cheapest|quote|estimate)/i.test(lower)) {
      return isFilipino
        ? 'Ang DESTRIA TECH INC ay nagbibigay ng customized enterprise technology solutions at hindi naglalathala ng standardized pricing. Maaari po tayong mag-schedule ng initial consultation, mag-email sa info@destriatech.com, o tumawag sa +1 (307) 419-4277.'
        : "DESTRIA TECH INC delivers customized enterprise technology solutions tailored to each client's operational, technical, security, and integration requirements. Because every project is individually architected, we do not publish standardized pricing or provide automated cost estimates. You may schedule a consultation through our website, email info@destriatech.com, or call +1 (307) 419-4277.";
    }

    if (/\b(which\s+one|recommend)\b/i.test(lower)) {
      return isFilipino
        ? 'Nakadepende po iyan sa inyong pangunahing business goal. Ang priority po ba ninyo ngayon ay makahikayat ng customer, mag-automate ng internal operations, o magpatibay ng transaction transparency?'
        : 'That depends on your business priority. May I ask whether your main focus is attracting customers, automating operations, or improving transaction transparency?';
    }

    if (this.sharedContext.selectedService) {
      return isFilipino
        ? `Naintindihan ko po iyon para sa ${this.sharedContext.selectedService}. Nagkaroon lamang ng sandaling network interruption, ngunit tuloy po ang ating usapan. Ano pa po ang nais ninyong idagdag sa requirements?`
        : `I captured that for ${this.sharedContext.selectedService}. We experienced a brief connection interruption, but our conversation context is intact. What additional requirements or questions would you like to discuss?`;
    }

    return isFilipino
      ? 'Nagkaroon po ng sandaling network interruption, ngunit nakikinig pa rin po ako. Maaari po ba ninyong ulitin o ibahagi ang susunod ninyong tanong tungkol sa inyong proyekto?'
      : 'We experienced a brief network interruption, but I am still listening and ready to continue. Could you share a bit more about your project goals or ask your next question?';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        resolve();
      }, ms);
    });
  }
}

export const aiVoiceService = new AIVoiceService();
