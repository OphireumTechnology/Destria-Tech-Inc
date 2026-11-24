/**
 * DESTRIA TECH INC AI Solutions Consultant - Real-Time Voice Engine
 * Handles bidirectional voice conversation, Web Audio API analysis,
 * Speech-to-Text streaming, Speech Synthesis, interruption detection,
 * and verified handoff to AppointmentBookingModal (never fabricates bookings).
 */

import { ConsultationAppointment } from './supabaseService';
import { apiUrl } from '../lib/apiClient';

export type VoiceState =
  | 'disconnected'
  | 'connecting'
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';
export type VoiceLanguage = 'en-US' | 'fil-PH';

export interface VoiceEventCallbacks {
  onStatusChange?: (status: VoiceState) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onAiResponse?: (text: string, intent?: any) => void;
  onVolumeChange?: (volume: number) => void;
  onAppointmentBooked?: (appointment: ConsultationAppointment) => void;
  onBookingRequested?: () => void;
  onError?: (errorMessage: string) => void;
}

class AIVoiceService {
  private status: VoiceState = 'disconnected';
  private language: VoiceLanguage = 'en-US';
  private callbacks: VoiceEventCallbacks = {};

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private animationFrameId: number | null = null;

  private recognition: any = null;
  private isRecognitionRunning = false;
  private recognitionRestartTimeout: any = null;

  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private isSpeakerMuted = false;
  private isMicMuted = false;

  private sessionId: string = '';
  private conversationHistory: Array<{ sender: 'user' | 'ai'; text: string }> = [];

  constructor() {
    this.sessionId = `dti-session-${Date.now()}`;
  }

  public setCallbacks(callbacks: VoiceEventCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public getStatus(): VoiceState {
    return this.status;
  }

  public getLanguage(): VoiceLanguage {
    return this.language;
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
    if (muted && this.status === 'listening') {
      this.setStatus('idle');
    }
  }

  public setSpeakerMuted(muted: boolean) {
    this.isSpeakerMuted = muted;
    if (muted) {
      this.cancelSpeech();
      if (this.status === 'speaking') {
        this.setStatus('idle');
      }
    }
  }

  public getIsMicMuted(): boolean {
    return this.isMicMuted;
  }

  public getIsSpeakerMuted(): boolean {
    return this.isSpeakerMuted;
  }

  public async startSession(): Promise<boolean> {
    if (this.status !== 'disconnected' && this.status !== 'error') {
      return true;
    }

    this.setStatus('connecting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.mediaStream = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioContext = new AudioContextClass();
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }
        const source = this.audioContext.createMediaStreamSource(stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 64;
        source.connect(this.analyser);
        this.startVolumeMonitoring();
      }

      const SpeechRecognitionClass =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        this.setupRecognition(SpeechRecognitionClass);
      }

      try {
        const res = await fetch(apiUrl('/api/voice/session'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: this.language }),
        });
        if (res.ok) {
          const data = await res.json();
          this.sessionId = data.sessionId || this.sessionId;
        }
      } catch {
        // Non-fatal telemetry/session hint
      }

      this.setStatus('idle');

      const greeting = this.language.startsWith('fil')
        ? 'Magandang araw po. Ako ang inyong DESTRIA TECH INC AI Corporate Solutions Consultant. Paano ko po matutulungan ang inyong customized enterprise technology project ngayon?'
        : 'Welcome to DESTRIA TECH INC and the DESTRIA NETWORK. I am your AI Corporate Solutions Consultant. How may I assist with your customized enterprise technology initiative today?';

      void this.speakText(greeting, false);
      return true;
    } catch (err: any) {
      this.setStatus('error');
      const msg =
        err.name === 'NotAllowedError'
          ? 'Microphone permission denied. Please allow microphone access in your browser settings to activate voice communication.'
          : 'Could not initialize audio input. Returning to text chat.';
      this.callbacks.onError?.(msg);
      this.stopSession();
      return false;
    }
  }

  public stopSession() {
    this.cancelSpeech();

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
      this.isRecognitionRunning = false;
    }

    if (this.recognitionRestartTimeout) {
      clearTimeout(this.recognitionRestartTimeout);
      this.recognitionRestartTimeout = null;
    }

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }

    this.setStatus('disconnected');
    this.callbacks.onVolumeChange?.(0);
  }

  public interrupt() {
    this.cancelSpeech();
    if (this.status === 'speaking') {
      this.setStatus('idle');
    }
  }

  public async handleUserSpeech(transcript: string) {
    const cleanTranscript = transcript.trim().slice(0, 2000);
    if (!cleanTranscript) return;

    this.conversationHistory = [
      ...this.conversationHistory.slice(-7),
      { sender: 'user', text: cleanTranscript },
    ];
    this.callbacks.onTranscript?.(cleanTranscript, true);
    this.setStatus('thinking');

    // Never fabricate an unverified appointment via voice; route user cleanly to verified Booking Modal
    if (/schedule|appointment|book|meeting|slot|calendar/i.test(cleanTranscript)) {
      const isFilipino = this.language.startsWith('fil');
      const reply = isFilipino
        ? 'Handa po akong tulungan kayong mag-schedule ng consultation. Binubuksan ko na ang verified appointment form upang mapili ninyo ang tamang petsa, oras, at mailagay ang inyong contact details.'
        : 'I can help arrange your consultation request. I am opening the verified scheduling form now so you can select your preferred slot and enter your contact details cleanly.';

      this.conversationHistory.push({ sender: 'ai', text: reply });
      this.callbacks.onAiResponse?.(reply, { isBookingIntent: true });
      this.callbacks.onBookingRequested?.();
      this.speakText(reply);
      return;
    }

    try {
      const response = await fetch(apiUrl('/api/voice/process'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: cleanTranscript,
          language: this.language,
          conversationHistory: this.conversationHistory.slice(-6),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const replyText =
          data.replyText ||
          'Thank you for sharing your requirements. Would you like to arrange an initial consultation with DESTRIA TECH INC?';
        const spokenText = typeof data.spokenText === 'string' && data.spokenText ? data.spokenText : replyText;

        this.conversationHistory = [
          ...this.conversationHistory.slice(-7),
          { sender: 'ai', text: replyText },
        ];
        this.callbacks.onAiResponse?.(replyText, data.detectedIntent);
        void this.speakText(spokenText);
        return;
      }
    } catch {
      // Safe deterministic local voice reply below
    }

    const localReply = this.generateLocalConsultantResponse(cleanTranscript);
    this.conversationHistory = [
      ...this.conversationHistory.slice(-7),
      { sender: 'ai', text: localReply },
    ];
    this.callbacks.onAiResponse?.(localReply);
    void this.speakText(localReply);
  }

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

  public async speakText(text: string, restartRecognitionAfter = true) {
    if (typeof window === 'undefined') {
      this.setStatus('idle');
      return;
    }

    if (this.isSpeakerMuted) {
      this.setStatus('idle');
      return;
    }

    this.cancelSpeech();
    this.setStatus('speaking');

    if (this.recognition && this.isRecognitionRunning) {
      try {
        this.recognition.stop();
      } catch {}
      this.isRecognitionRunning = false;
    }

    const spokenText = this.formatSpokenCadence(text);
    const finishSpeaking = () => {
      this.currentAudio = null;
      this.currentUtterance = null;
      this.setStatus('idle');
      if (
        restartRecognitionAfter &&
        this.recognition &&
        !this.isMicMuted &&
        this.status !== 'disconnected'
      ) {
        this.startRecognitionSafe();
      }
    };

    // 1. Attempt server-side natural female Gemini TTS (Kore voice)
    try {
      const ttsRes = await fetch(apiUrl('/api/voice/speak'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: spokenText }),
      });
      if (ttsRes.ok) {
        const ttsData = await ttsRes.json();
        if (ttsData.success && ttsData.audioBase64 && !this.isSpeakerMuted) {
          const audio = new Audio(`data:${ttsData.mimeType || 'audio/wav'};base64,${ttsData.audioBase64}`);
          this.currentAudio = audio;
          audio.onended = finishSpeaking;
          audio.onerror = () => {
            this.speakWithBrowserFemaleVoice(ttsData.spokenText || spokenText, finishSpeaking);
          };
          await audio.play();
          return;
        }
      }
    } catch {
      // Fall back gracefully to natural female browser SpeechSynthesis
    }

    this.speakWithBrowserFemaleVoice(spokenText, finishSpeaking);
  }

  private speakWithBrowserFemaleVoice(cleanText: string, onComplete: () => void) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || this.isSpeakerMuted) {
      onComplete();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.98;
    utterance.pitch = 1.02;
    this.currentUtterance = utterance;

    const voices = window.speechSynthesis.getVoices();
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

    utterance.onend = onComplete;
    utterance.onerror = onComplete;

    window.speechSynthesis.speak(utterance);
  }

  public cancelSpeech() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {}
      this.currentAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      this.currentUtterance = null;
    }
  }

  private setStatus(newStatus: VoiceState) {
    this.status = newStatus;
    this.callbacks.onStatusChange?.(newStatus);
  }

  private setupRecognition(SpeechRecognitionClass: any) {
    try {
      this.recognition = new SpeechRecognitionClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = this.language;

      this.recognition.onstart = () => {
        this.isRecognitionRunning = true;
      };

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            finalTranscript += item[0].transcript;
          } else {
            interimTranscript += item[0].transcript;
          }
        }

        if (interimTranscript.trim() && this.status === 'speaking') {
          this.interrupt();
        }

        if (interimTranscript) {
          this.setStatus('listening');
          this.callbacks.onTranscript?.(interimTranscript, false);
        }

        if (finalTranscript.trim()) {
          void this.handleUserSpeech(finalTranscript.trim());
        }
      };

      this.recognition.onend = () => {
        this.isRecognitionRunning = false;
        if (this.status !== 'disconnected' && this.status !== 'speaking' && !this.isMicMuted) {
          this.recognitionRestartTimeout = setTimeout(() => {
            this.startRecognitionSafe();
          }, 400);
        }
      };

      this.startRecognitionSafe();
    } catch {
      // Unsupported browser fallback
    }
  }

  private startRecognitionSafe() {
    if (
      !this.recognition ||
      this.isRecognitionRunning ||
      this.isMicMuted ||
      this.status === 'disconnected'
    ) {
      return;
    }
    try {
      this.recognition.lang = this.language;
      this.recognition.start();
      this.isRecognitionRunning = true;
      if (this.status !== 'speaking' && this.status !== 'thinking') {
        this.setStatus('idle');
      }
    } catch {}
  }

  private startVolumeMonitoring() {
    const dataArray = new Uint8Array(this.analyser?.frequencyBinCount || 32);

    const checkVolume = () => {
      if (this.status === 'disconnected') return;

      if (this.status === 'speaking') {
        const simulated = Math.min(
          100,
          Math.floor(40 + Math.sin(Date.now() / 80) * 35 + Math.random() * 20)
        );
        this.callbacks.onVolumeChange?.(simulated);
      } else if (this.analyser && !this.isMicMuted) {
        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 255) * 100 * 2.2));
        if (normalized > 18 && this.status === 'idle') {
          this.setStatus('listening');
        }
        this.callbacks.onVolumeChange?.(normalized);
      } else {
        this.callbacks.onVolumeChange?.(0);
      }

      this.animationFrameId = requestAnimationFrame(checkVolume);
    };

    this.animationFrameId = requestAnimationFrame(checkVolume);
  }

  private generateLocalConsultantResponse(input: string): string {
    const isFilipino = this.language.startsWith('fil');
    const lower = input.toLowerCase();

    if (/(price|pricing|cost|budget|rate|discount|promo|cheapest|quote|estimate)/i.test(lower)) {
      return isFilipino
        ? 'Ang DESTRIA TECH INC ay nagbibigay ng customized enterprise technology solutions at hindi naglalathala ng standardized pricing. Maaari po tayong mag-schedule ng initial consultation, mag-email sa info@destriatech.com, o tumawag sa +1 (307) 419-4277.'
        : "DESTRIA TECH INC delivers customized enterprise technology solutions tailored to each client's operational, technical, security, and integration requirements. Because every project is individually architected, we do not publish standardized pricing or provide automated cost estimates. You may schedule a consultation through our website, email info@destriatech.com, or call +1 (307) 419-4277.";
    }

    return isFilipino
      ? 'Naintindihan ko po ang inyong pangangailangan. Nais po ba ninyong gumawa tayo ng preliminary Project Brief o magbukas ng consultation schedule form?'
      : 'Thank you for sharing your requirements. Would you like to prepare a Project Requirements Brief or open the consultation scheduling form?';
  }
}

export const aiVoiceService = new AIVoiceService();
