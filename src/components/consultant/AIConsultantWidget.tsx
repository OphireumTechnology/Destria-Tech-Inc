import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  Bot, X, Send, Calendar, FileText, Phone, Minimize2, 
  Maximize2, RotateCcw, Shield, Building,
  MapPin, Mic, MicOff, Volume2, VolumeX, PhoneOff, Globe,
  Square, AlertCircle, Sparkles, CheckCircle2, Download, ExternalLink,
  Pencil, Radio
} from 'lucide-react';
import { COMPANY_CONFIG, corporateIdentity, LEGAL_GOVERNANCE_STATEMENTS } from '../../data/companyConfig';
import { ROUTES } from '../../config/routes';
import { BrandLogo } from '../BrandLogo';
import { 
  aiConsultantService, 
  ChatMessage, 
  ChatToolEvent,
  ConsultationState, 
  INITIAL_CONSULTATION_STATE 
} from '../../services/aiConsultantService';
import {
  supabaseService,
  ProjectBrief,
  ConsultationAppointment,
  ConsultationSourceChannel,
} from '../../services/supabaseService';
import {
  aiVoiceService,
  VoiceSessionState,
  VoiceLanguage,
  VoiceToolEvent,
} from '../../services/aiVoiceService';
import { SERVICE_CATALOG, formatCatalogEngagement } from '../../data/serviceCatalog';
import { ProjectBriefModal } from './ProjectBriefModal';
import { AppointmentBookingModal } from './AppointmentBookingModal';

interface AIConsultantWidgetProps {
  externalOpenRequest?: { nonce: number; initialPrompt?: string } | null;
}

export const AIConsultantWidget: React.FC<AIConsultantWidgetProps> = ({ externalOpenRequest }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [hasUnreadNotice, setHasUnreadNotice] = useState(true);

  // Modals for Brief & Booking
  const [isBriefModalOpen, setIsBriefModalOpen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [currentBrief, setCurrentBrief] = useState<ProjectBrief | null>(null);
  const [activeRequestSource, setActiveRequestSource] = useState<ConsultationSourceChannel>('AI Chat');

  // Human Escalation Modal
  const [isEscalationModalOpen, setIsEscalationModalOpen] = useState(false);

  // Voice State
  const [voiceStatus, setVoiceStatus] = useState<VoiceSessionState>('disconnected');
  const [isVoiceSessionActive, setIsVoiceSessionActive] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [speakerVolume, setSpeakerVolume] = useState<number>(1);
  const [isPushToTalkMode, setIsPushToTalkMode] = useState(false);
  const [isPushToTalkHeld, setIsPushToTalkHeld] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0);
  const [audioBands, setAudioBands] = useState<number[]>(() => new Array(16).fill(0));
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>('en-US');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Transcript correction & explicit server-validated tool confirmation state
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [pendingToolConfirmation, setPendingToolConfirmation] = useState<{
    kind: 'consultation' | 'inquiry';
    confirmationToken: string;
    sessionId: string;
    sourceChannel: 'AI Chat' | 'AI Voice';
    summary: Record<string, unknown>;
  } | null>(null);
  const [isSubmittingConfirmation, setIsSubmittingConfirmation] = useState(false);

  const isVoiceActive =
    isVoiceSessionActive ||
    (voiceStatus !== 'disconnected' &&
      voiceStatus !== 'error' &&
      voiceStatus !== 'microphone_unavailable' &&
      voiceStatus !== 'service_unavailable' &&
      voiceStatus !== 'stopping');

  // Conversation State (v2 keys; purges legacy cached conversations that may hold retired pricing)
  const [state, setState] = useState<ConsultationState>(() => {
    try {
      localStorage.removeItem('opm_consultant_state');
      localStorage.removeItem('opm_consultant_messages');
      const saved = localStorage.getItem('dti_consultant_state_v2');
      return saved ? JSON.parse(saved) : INITIAL_CONSULTATION_STATE;
    } catch {
      return INITIAL_CONSULTATION_STATE;
    }
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('dti_consultant_messages_v2');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [
      {
        id: 'msg-welcome',
        sender: 'ai',
        text: `Hi! I'm the AI assistant for ${corporateIdentity.legalName} (${corporateIdentity.networkName}). Feel free to chat casually, ask a general or technical question in any language, or explore customized enterprise technology solutions whenever you're ready—how can I help today?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        stage: 'welcome',
        quickReplies: [
          'Explore AI & Enterprise Solutions',
          'About DESTRIA TECH INC',
          'Request a Consultation',
        ],
      },
    ];
  });

  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastProcessedNonceRef = useRef<number>(0);
  const stateRef = useRef<ConsultationState>(state);
  const messagesRef = useRef<ChatMessage[]>(messages);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Keep voice engine synchronized with chat history and discovery state
  useEffect(() => {
    aiVoiceService.syncConversationContext(
      messages.map((m) => ({ sender: m.sender, text: m.text })),
      {
        category: state.requirements.category || undefined,
        selectedService: state.requirements.category || undefined,
        businessProblem: state.requirements.businessProblem || undefined,
        currentStage: state.currentStage,
        keyFeatures: state.requirements.keyFeatures,
      }
    );
  }, [messages, state]);

  // Setup Voice Service Callbacks (uses refs to avoid stale React closures)
  useEffect(() => {
    aiVoiceService.setCallbacks({
      onStatusChange: (status) => {
        setVoiceStatus(status);
        if (status === 'disconnected' || status === 'processing' || status === 'ai_speaking') {
          setLiveTranscript('');
        }
      },
      onSessionActiveChange: (active) => {
        setIsVoiceSessionActive(active);
      },
      onTranscript: (text, isFinal) => {
        if (!isFinal) {
          setLiveTranscript(text);
          return;
        }
        setLiveTranscript('');
        if (text.trim()) {
          const userMsgId = `voice-usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          setMessages((prev) => [
            ...prev,
            {
              id: userMsgId,
              sender: 'user',
              text: `[Voice Consultation]: "${text}"`,
              timestamp: now,
            },
          ]);
        }
      },
      onAiResponse: (text, intent) => {
        const aiMsgId = `voice-ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        setMessages((prev) => [
          ...prev,
          {
            id: aiMsgId,
            sender: 'ai',
            text,
            timestamp: now,
            recommendedServiceIds: intent?.recommendedServiceIds,
            resourceLinks: intent?.resourceLinks,
            suggestedAction:
              intent?.isBookingIntent || intent?.isBookingConfirmed
                ? 'schedule_meeting'
                : intent?.isHumanEscalation
                ? 'talk_to_human'
                : intent?.resourceLinks && intent.resourceLinks.length > 0
                ? 'corporate_profile'
                : intent?.isBriefIntent
                ? 'review_brief'
                : undefined,
            quickReplies: Array.isArray(intent?.quickReplies)
              ? intent.quickReplies
              : intent?.isBookingIntent
              ? ['Schedule Consultation', 'Review Project Brief']
              : [],
          },
        ]);

        if (intent?.updatedContext) {
          const updatedCtx = intent.updatedContext;
          setState((prev) => ({
            ...prev,
            currentStage: (updatedCtx.currentStage as ConsultationState['currentStage']) || prev.currentStage,
            requirements: {
              ...prev.requirements,
              category: updatedCtx.selectedService || updatedCtx.category || prev.requirements.category,
              businessProblem: updatedCtx.businessProblem || prev.requirements.businessProblem,
            },
          }));
        }

        if (intent?.isBookingConfirmed && intent?.appointment) {
          setState((prev) => ({
            ...prev,
            currentStage: 'confirmed',
            scheduledAppointment: intent.appointment,
          }));
        }
      },
      onVolumeChange: (vol, bands) => {
        setAudioVolume(vol);
        if (Array.isArray(bands) && bands.length === 16) {
          setAudioBands(bands);
        } else {
          setAudioBands(new Array(16).fill(0));
        }
      },
      onAppointmentBooked: (appointment) => {
        setState((prev) => ({
          ...prev,
          currentStage: 'confirmed',
          scheduledAppointment: appointment,
        }));
      },
      onBookingRequested: () => {
        setActiveRequestSource('AI Voice');
        setIsBookingModalOpen(true);
      },
      onBriefRequested: () => {
        setActiveRequestSource('AI Voice');
        const current = stateRef.current;
        if (current.generatedBrief) {
          setCurrentBrief(current.generatedBrief);
        } else {
          const draft = supabaseService.generateDefaultBrief(
            current.requirements.category || 'Customized Enterprise Solution',
            current.client
          );
          setCurrentBrief(draft);
        }
        setIsBriefModalOpen(true);
      },
      onToolEvent: (event: VoiceToolEvent) => {
        const payload = event.payload || {};
        if (
          (event.type === 'prepared_consultation' || event.type === 'prepared_inquiry') &&
          typeof payload.confirmationToken === 'string'
        ) {
          setPendingToolConfirmation({
            kind: event.type === 'prepared_consultation' ? 'consultation' : 'inquiry',
            confirmationToken: payload.confirmationToken,
            sessionId:
              typeof payload.sessionId === 'string' && payload.sessionId
                ? payload.sessionId
                : aiVoiceService.getSessionId(),
            sourceChannel: 'AI Voice',
            summary: (payload.summary as Record<string, unknown>) || payload,
          });
        }
      },
      onError: (err) => {
        setVoiceError(err);
        setTimeout(() => setVoiceError(null), 8000);
      },
    });

    return () => {
      aiVoiceService.stopSession();
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isMinimized, isTyping, liveTranscript]);

  // Persist conversation
  useEffect(() => {
    try {
      localStorage.setItem('dti_consultant_messages_v2', JSON.stringify(messages));
      localStorage.setItem('dti_consultant_state_v2', JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [messages, state]);

  // Sync brief if available in state
  useEffect(() => {
    if (state.generatedBrief) {
      setCurrentBrief(state.generatedBrief);
    }
  }, [state.generatedBrief]);

  // Handle programmatic open requests from ServicesSection hero/cards/builder
  useEffect(() => {
    if (!externalOpenRequest || externalOpenRequest.nonce === lastProcessedNonceRef.current) return;
    lastProcessedNonceRef.current = externalOpenRequest.nonce;
    setIsOpen(true);
    setIsMinimized(false);
    setHasUnreadNotice(false);
    if (externalOpenRequest.initialPrompt) {
      void handleSendMessage(externalOpenRequest.initialPrompt);
    }
  }, [externalOpenRequest]);

  // Handle Voice Toggle
  const handleToggleVoice = async () => {
    if (isVoiceActive) {
      aiVoiceService.stopSession();
      setVoiceStatus('disconnected');
      setIsVoiceSessionActive(false);
    } else {
      setVoiceError(null);
      aiVoiceService.syncConversationContext(
        messagesRef.current.map((m) => ({ sender: m.sender, text: m.text })),
        {
          category: stateRef.current.requirements.category || undefined,
          selectedService: stateRef.current.requirements.category || undefined,
          businessProblem: stateRef.current.requirements.businessProblem || undefined,
          currentStage: stateRef.current.currentStage,
          keyFeatures: stateRef.current.requirements.keyFeatures,
        }
      );
      const success = await aiVoiceService.startSession();
      if (!success) {
        setVoiceStatus('disconnected');
        setIsVoiceSessionActive(false);
      }
    }
  };

  const handleToggleMic = () => {
    const next = !isMicMuted;
    setIsMicMuted(next);
    aiVoiceService.setMicMuted(next);
  };

  const handleToggleSpeaker = () => {
    const next = !isSpeakerMuted;
    setIsSpeakerMuted(next);
    aiVoiceService.setSpeakerMuted(next);
  };

  const handleSpeakerVolumeChange = (nextVolume: number) => {
    const clamped = Math.max(0, Math.min(1, nextVolume));
    setSpeakerVolume(clamped);
    if (clamped > 0 && isSpeakerMuted) {
      setIsSpeakerMuted(false);
      aiVoiceService.setSpeakerMuted(false);
    }
    aiVoiceService.setSpeakerVolume(clamped);
  };

  const handleTogglePushToTalk = () => {
    const next = !isPushToTalkMode;
    setIsPushToTalkMode(next);
    setIsPushToTalkHeld(false);
    aiVoiceService.setPushToTalkMode(next);
  };

  const handleStartTranscriptEdit = (msg: ChatMessage) => {
    const cleanText = msg.text.replace(/^\[Voice Consultation\]:\s*"?|"?$/g, '').trim();
    setEditingMsgId(msg.id);
    setEditingDraft(cleanText);
  };

  const handleSubmitTranscriptCorrection = async (msg: ChatMessage) => {
    const original = msg.text.replace(/^\[Voice Consultation\]:\s*"?|"?$/g, '').trim();
    const corrected = editingDraft.trim();
    setEditingMsgId(null);
    setEditingDraft('');
    if (!corrected || corrected === original) return;
    await aiVoiceService.submitTranscriptCorrection(original, corrected);
  };

  const handleConfirmPendingTool = async () => {
    if (!pendingToolConfirmation || isSubmittingConfirmation) return;
    setIsSubmittingConfirmation(true);
    try {
      const result = await aiConsultantService.confirmPreparedToolAction({
        sessionId: pendingToolConfirmation.sessionId,
        confirmationToken: pendingToolConfirmation.confirmationToken,
        kind: pendingToolConfirmation.kind,
        sourceChannel: pendingToolConfirmation.sourceChannel,
      });

      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (result.success) {
        const successText =
          result.message ||
          `Your ${pendingToolConfirmation.kind === 'consultation' ? 'consultation request' : 'service inquiry'} has been confirmed and registered (Reference: ${result.referenceCode || 'Verified'}).`;
        setMessages((prev) => [
          ...prev,
          {
            id: `tool-confirm-${Date.now()}`,
            sender: 'ai',
            text: successText,
            timestamp: now,
            quickReplies: ['Direct Solutions Contact'],
          },
        ]);
        if (isVoiceActive && !isSpeakerMuted) {
          void aiVoiceService.speakText(successText);
        }
        setPendingToolConfirmation(null);
      } else {
        setVoiceError(result.error || 'Could not confirm request. Please review details and try again.');
      }
    } finally {
      setIsSubmittingConfirmation(false);
    }
  };

  const handleLanguageChange = (lang: VoiceLanguage) => {
    setVoiceLanguage(lang);
    aiVoiceService.setLanguage(lang);
  };

  const handleInterruptAi = () => {
    aiVoiceService.interrupt();
  };

  // Standard Text Message Pipeline
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isTyping) return;

    const userMsgId = `usr-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsTyping(true);

    try {
      // Only intercept explicit modal-trigger actions (never hijack casual chat or questions)
      if (/^(?:speak\s+to\s+(?:a\s+)?human|talk\s+to\s+(?:a\s+)?human|direct\s+solutions\s+contact|call\s+executive)$/i.test(text)) {
        setTimeout(() => {
          setIsTyping(false);
          const aiEscalateMsg: ChatMessage = {
            id: `ai-esc-${Date.now()}`,
            sender: 'ai',
            text: `I'd be happy to connect you with our ${COMPANY_CONFIG.name} solutions team.${COMPANY_CONFIG.corporatePhone ? ` You can also reach us directly at ${COMPANY_CONFIG.corporatePhone}.` : ''} Would you like to view direct contact options or schedule a consultation?`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            suggestedAction: 'talk_to_human',
            quickReplies: ['Direct Solutions Contact', 'Schedule Consultation'],
          };
          setMessages((prev) => [...prev, aiEscalateMsg]);
          if (isVoiceActive && !isSpeakerMuted) {
            aiVoiceService.speakText(aiEscalateMsg.text);
          }
        }, 350);
        return;
      }

      if (/^(?:review\s+project\s+brief|view\s+brief|see\s+brief|open\s+project\s+brief)$/i.test(text)) {
        setTimeout(() => {
          setIsTyping(false);
          setActiveRequestSource(isVoiceActive ? 'AI Voice' : 'AI Chat');
          if (state.generatedBrief) {
            setCurrentBrief(state.generatedBrief);
            setIsBriefModalOpen(true);
          } else {
            const draftBrief = supabaseService.generateDefaultBrief(
              state.requirements.category || 'Enterprise Digital Platform',
              {
                fullName: state.client.fullName || '',
                companyName: state.client.companyName || '',
                email: state.client.email || '',
                phone: state.client.phone || '',
              }
            );
            setCurrentBrief(draftBrief);
            setIsBriefModalOpen(true);
          }
        }, 300);
        return;
      }

      if (/^(?:schedule\s+consultation(?:\s+now)?|book\s+appointment|open\s+scheduling\s+form|request\s+a\s+consultation|request\s+an\s+enterprise\s+consultation)$/i.test(text)) {
        setTimeout(() => {
          setIsTyping(false);
          setActiveRequestSource(isVoiceActive ? 'AI Voice' : 'AI Chat');
          setIsBookingModalOpen(true);
        }, 300);
        return;
      }

      // Live consultative pipeline grounded in the full 10-category service catalog
      const { aiMessage, updatedState, toolEvents, sessionId } = await aiConsultantService.processUserMessage(
        text,
        state,
        messages,
        voiceLanguage
      );

      setIsTyping(false);
      setMessages((prev) => [...prev, aiMessage]);
      setState(updatedState);
      if (updatedState.generatedBrief) {
        setCurrentBrief(updatedState.generatedBrief);
      }
      if (Array.isArray(toolEvents) && toolEvents.length > 0) {
        const prepared = toolEvents.find(
          (ev: ChatToolEvent) =>
            (ev.type === 'prepared_consultation' || ev.type === 'prepared_inquiry') &&
            typeof ev.payload?.confirmationToken === 'string'
        );
        if (prepared) {
          setPendingToolConfirmation({
            kind: prepared.type === 'prepared_consultation' ? 'consultation' : 'inquiry',
            confirmationToken: String(prepared.payload.confirmationToken),
            sessionId:
              typeof prepared.payload.sessionId === 'string' && prepared.payload.sessionId
                ? prepared.payload.sessionId
                : sessionId,
            sourceChannel: isVoiceActive ? 'AI Voice' : 'AI Chat',
            summary: (prepared.payload.summary as Record<string, unknown>) || prepared.payload,
          });
        }
      }
      if (isVoiceActive && !isSpeakerMuted) {
        aiVoiceService.speakText(aiMessage.text);
      }
    } catch (err) {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'ai',
          text: 'Sorry, the connection dropped for a moment. Could you repeat the last part?',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          quickReplies: [],
        },
      ]);
    }
  };

  const handleQuickReply = (reply: string) => {
    if (reply === 'Review Project Brief') {
      if (currentBrief || state.generatedBrief) {
        setIsBriefModalOpen(true);
      } else {
        const brief = supabaseService.generateDefaultBrief(state.requirements.category || 'Customized Enterprise Solution', state.client);
        setCurrentBrief(brief);
        setIsBriefModalOpen(true);
      }
      return;
    }

    if (
      reply === 'Schedule Consultation' ||
      reply === 'Request an Enterprise Consultation' ||
      reply === 'Schedule Consultation Now'
    ) {
      setIsBookingModalOpen(true);
      return;
    }

    if (
      reply === 'Direct Solutions Contact' ||
      reply === 'Direct Executive Contact' ||
      reply.startsWith('Call +1')
    ) {
      setIsEscalationModalOpen(true);
      return;
    }

    handleSendMessage(reply);
  };

  const handleResetConversation = () => {
    aiVoiceService.stopSession();
    aiVoiceService.resetConversationContext();
    aiConsultantService.resetSession();
    setVoiceStatus('disconnected');
    setIsVoiceSessionActive(false);
    setPendingToolConfirmation(null);
    setEditingMsgId(null);
    setEditingDraft('');
    try {
      localStorage.removeItem('opm_consultant_messages');
      localStorage.removeItem('opm_consultant_state');
      localStorage.removeItem('dti_consultant_messages_v2');
      localStorage.removeItem('dti_consultant_state_v2');
    } catch {
      // ignore storage errors
    }
    setState(INITIAL_CONSULTATION_STATE);
    setCurrentBrief(null);
    setMessages([
      {
        id: `msg-welcome-reset-${Date.now()}`,
        sender: 'ai',
        text: `Fresh start! I'm the AI assistant for ${corporateIdentity.legalName} (${corporateIdentity.networkName}). Feel free to chat casually, ask a question in any language, or explore enterprise technology solutions whenever you'd like.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        stage: 'welcome',
        quickReplies: [
          'Explore AI & Enterprise Solutions',
          'About DESTRIA TECH INC',
          'Request a Consultation',
        ],
      },
    ]);
  };

  // Stage progress calculation
  const getStageStep = () => {
    switch (state.currentStage) {
      case 'welcome': return 1;
      case 'category': return 1;
      case 'problem': return 2;
      case 'features': return 2;
      case 'client_info': return 3;
      case 'recommendation': return 3;
      case 'brief_ready': return 4;
      case 'scheduling': return 4;
      case 'confirmed': return 4;
      default: return 1;
    }
  };

  return (
    <>
      {/* =========================================================================
          FLOATING LAUNCHER BUTTON (Bottom-Right)
          ========================================================================= */}
      {!isOpen && (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-3">
          {/* Subtle Callout Bubble (Desktop XL+ only to prevent collisions on mobile/tablet) */}
          {hasUnreadNotice && (
            <div className="hidden xl:flex items-center gap-2 px-3.5 py-2 bg-[#111827] border border-[#00C2C7]/30 text-xs text-slate-200 rounded-xl shadow-2xl animate-fade-in">
              <span className="w-2 h-2 rounded-full bg-[#00C2C7] animate-ping" />
              <span>Two-way AI voice enabled: <strong>Speak with AI Solutions</strong></span>
              <button 
                onClick={(e) => { e.stopPropagation(); setHasUnreadNotice(false); }}
                className="text-slate-500 hover:text-slate-300 ml-1 cursor-pointer"
                aria-label="Dismiss notice"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <button
            onClick={() => {
              setIsOpen(true);
              setIsMinimized(false);
              setHasUnreadNotice(false);
            }}
            className="group relative flex items-center gap-3 px-4 py-3.5 bg-gradient-to-r from-[#111827] via-[#1a2336] to-[#0d1627] text-white rounded-2xl border border-[#00C2C7]/50 shadow-[0_10px_30px_rgba(0,194,199,0.25)] hover:shadow-[0_15px_35px_rgba(0,194,199,0.4)] transition-all duration-300 hover:scale-105 cursor-pointer"
            aria-label="Open AI Solutions Consultant"
          >
            {/* Outer Glow Ring */}
            <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-[#00C2C7] via-[#D4AF37] to-[#00C2C7] opacity-25 group-hover:opacity-60 blur transition duration-300" />

            <div className="relative flex items-center gap-2.5">
              <BrandLogo variant="emblem" size="md" ring="brand" decorative />

              <div className="text-left hidden sm:block">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white tracking-wide uppercase">AI Voice & Chat</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00C2C7]" />
                </div>
                <p className="text-[10px] font-mono text-[#00C2C7]">DESTRIA SOLUTIONS</p>
              </div>

              <div className="w-8 h-8 rounded-lg bg-[#00C2C7]/10 flex items-center justify-center text-[#00C2C7] border border-[#00C2C7]/20 group-hover:bg-[#00C2C7] group-hover:text-[#0B1220] transition-colors">
                <Mic className="w-4 h-4" />
              </div>
            </div>
          </button>
        </div>
      )}

      {/* =========================================================================
          EXPANDABLE CHAT & VOICE PANEL
          ========================================================================= */}
      {isOpen && (
        <div 
          className={`fixed right-3 sm:right-6 bottom-3 sm:bottom-6 z-[55] bg-[#0B1220] border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
            isMinimized 
              ? 'w-[min(320px,calc(100vw-24px))] h-16' 
              : 'w-[calc(100vw-24px)] sm:w-[460px] md:w-[500px] h-[calc(100dvh-24px)] sm:h-[670px] max-h-[calc(100dvh-24px)] sm:max-h-[90dvh]'
          }`}
        >
          {/* Top Header */}
          <div className="px-4 py-3 bg-[#111827] border-b border-slate-800 flex items-center justify-between gap-2 select-none">
            <div className="flex items-center gap-2.5">
              <div className="relative shrink-0">
                <BrandLogo variant="emblem" size="sm" ring="brand" decorative />
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#111827] ${
                  voiceStatus === 'error'
                    ? 'bg-rose-500'
                    : voiceStatus === 'reconnecting' || voiceStatus === 'connecting'
                    ? 'bg-amber-400 animate-pulse'
                    : isVoiceActive
                    ? 'bg-[#00C2C7] animate-pulse'
                    : 'bg-emerald-400'
                }`} />
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-bold text-white tracking-wide">DESTRIA AI Solutions</h3>
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                    voiceStatus === 'error' ||
                    voiceStatus === 'microphone_unavailable' ||
                    voiceStatus === 'service_unavailable'
                      ? 'text-rose-300 bg-rose-950/60 border-rose-500/40 font-bold'
                      : voiceStatus === 'reconnecting' || voiceStatus === 'connecting'
                      ? 'text-amber-300 bg-amber-950/60 border-amber-500/40 font-bold'
                      : isVoiceActive
                      ? 'text-[#00C2C7] bg-[#00C2C7]/15 border-[#00C2C7]/40 font-bold'
                      : 'text-slate-400 bg-slate-800 border-slate-700'
                  }`}>
                    {voiceStatus === 'microphone_unavailable'
                      ? 'MIC UNAVAILABLE'
                      : voiceStatus === 'service_unavailable'
                      ? 'AI UNAVAILABLE'
                      : voiceStatus === 'error'
                      ? 'CONNECTION ERROR'
                      : voiceStatus === 'reconnecting'
                      ? 'RECONNECTING...'
                      : voiceStatus === 'connecting'
                      ? 'CONNECTING...'
                      : isVoiceActive
                      ? 'VOICE ACTIVE'
                      : 'ONLINE'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">Conversational AI &amp; Solutions Assistant</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Multilingual Language Switcher */}
              <div className="relative mr-1">
                <button
                  onClick={() => {
                    const order: VoiceLanguage[] = ['en-US', 'fil-PH', 'es-ES', 'fr-FR'];
                    const nextLang = order[(order.indexOf(voiceLanguage) + 1) % order.length];
                    handleLanguageChange(nextLang);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono border border-slate-700 transition-colors cursor-pointer"
                  title="Switch Voice Language (EN / FIL / ES / FR — multilingual auto-detection active)"
                  aria-label={`Voice language ${voiceLanguage}`}
                >
                  <Globe className="w-3 h-3 text-[#00C2C7]" />
                  <span>
                    {voiceLanguage === 'fil-PH'
                      ? 'FIL'
                      : voiceLanguage === 'es-ES'
                      ? 'ES'
                      : voiceLanguage === 'fr-FR'
                      ? 'FR'
                      : 'EN'}
                  </span>
                </button>
              </div>

              <Link
                to={ROUTES.AI_FRONTDESK}
                onClick={() => setIsOpen(false)}
                className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#00C2C7]/10 hover:bg-[#00C2C7]/20 text-[#00C2C7] text-[10px] font-mono border border-[#00C2C7]/30 transition-colors"
                title="Open Full AI Front Desk Workspace"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Front Desk</span>
              </Link>

              <button
                onClick={handleResetConversation}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="Reset conversation"
                aria-label="Reset conversation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title={isMinimized ? 'Expand' : 'Minimize'}
                aria-label={isMinimized ? 'Expand' : 'Minimize'}
              >
                {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={() => {
                  aiVoiceService.stopSession();
                  setVoiceStatus('disconnected');
                  setIsVoiceSessionActive(false);
                  setIsOpen(false);
                }}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Stage Progress Bar (only shown during active enterprise discovery/scoping) */}
              {(state.currentStage !== 'welcome' || Boolean(state.requirements.category) || Boolean(currentBrief)) && (
                <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[#00C2C7] uppercase font-bold">Solution Scope</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4].map((step) => {
                        const active = step <= getStageStep();
                        return (
                          <div
                            key={step}
                            className={`h-1.5 rounded-full transition-all duration-300 ${
                              active ? 'w-6 bg-[#00C2C7]' : 'w-2 bg-slate-700'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {currentBrief && (
                      <button
                        onClick={() => setIsBriefModalOpen(true)}
                        className="text-[10px] font-mono text-[#D4AF37] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <FileText className="w-3 h-3" />
                        <span>Brief</span>
                      </button>
                    )}
                    <button
                      onClick={() => setIsBookingModalOpen(true)}
                      className="text-[10px] font-mono text-[#00C2C7] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Calendar className="w-3 h-3" />
                      <span>Book</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Voice Error Notice with Manual Circuit-Breaker Retry */}
              {voiceError && (
                <div className="px-4 py-2 bg-amber-950/60 border-b border-amber-500/30 flex items-center gap-2 text-xs text-amber-200">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span className="text-[11px] leading-tight flex-1">{voiceError}</span>
                  {(voiceStatus === 'service_unavailable' || voiceStatus === 'error') && (
                    <button
                      type="button"
                      onClick={() => {
                        setVoiceError(null);
                        aiVoiceService.retryConnection();
                      }}
                      className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 text-[10px] font-mono font-bold cursor-pointer shrink-0"
                    >
                      Retry Voice
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setVoiceError(null)}
                    className="text-amber-400 hover:text-white cursor-pointer"
                    aria-label="Dismiss voice notice"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Chat Thread */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => {
                  const isAi = msg.sender === 'ai';
                  const isVoiceMsg = msg.text.startsWith('[Voice Consultation]:');

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isAi ? 'items-start' : 'items-end'}`}
                    >
                      <div className="flex items-start gap-2 max-w-[88%]">
                        {isAi && (
                          <div className="w-6 h-6 rounded-lg bg-[#111827] border border-cyan-500/40 flex-shrink-0 flex items-center justify-center text-[#00C2C7] mt-0.5">
                            <Bot className="w-3.5 h-3.5" />
                          </div>
                        )}

                        <div>
                          <div
                            className={`p-3.5 rounded-2xl text-xs sm:text-[13px] leading-relaxed whitespace-pre-line ${
                              isAi
                                ? 'bg-slate-900 border border-slate-800 text-slate-100 rounded-tl-sm'
                                : 'bg-gradient-to-r from-[#00C2C7] to-[#009b9f] text-[#0B1220] font-medium rounded-tr-sm shadow-md'
                            }`}
                          >
                            {isVoiceMsg ? (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[#0B1220] opacity-80 uppercase font-bold">
                                    <Mic className="w-3 h-3" />
                                    <span>Voice Input</span>
                                  </span>
                                  {editingMsgId !== msg.id && (
                                    <button
                                      type="button"
                                      onClick={() => handleStartTranscriptEdit(msg)}
                                      className="inline-flex items-center gap-1 text-[10px] font-mono text-[#0B1220]/80 hover:text-[#0B1220] underline cursor-pointer"
                                      title="Edit or correct speech transcript"
                                    >
                                      <Pencil className="w-2.5 h-2.5" />
                                      <span>Edit</span>
                                    </button>
                                  )}
                                </div>
                                {editingMsgId === msg.id ? (
                                  <form
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      void handleSubmitTranscriptCorrection(msg);
                                    }}
                                    className="space-y-1.5 pt-1"
                                  >
                                    <input
                                      type="text"
                                      value={editingDraft}
                                      onChange={(e) => setEditingDraft(e.target.value)}
                                      className="w-full px-2 py-1 rounded-lg bg-[#0B1220] text-white text-xs border border-[#0B1220]/40 focus:outline-none"
                                      aria-label="Correct speech transcript"
                                    />
                                    <div className="flex items-center gap-1.5 justify-end">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingMsgId(null);
                                          setEditingDraft('');
                                        }}
                                        className="px-2 py-0.5 rounded bg-[#0B1220]/20 text-[#0B1220] text-[10px] font-bold cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="submit"
                                        className="px-2 py-0.5 rounded bg-[#0B1220] text-[#00C2C7] text-[10px] font-bold cursor-pointer"
                                      >
                                        Send Correction
                                      </button>
                                    </div>
                                  </form>
                                ) : (
                                  <div>{msg.text.replace('[Voice Consultation]: ', '')}</div>
                                )}
                              </div>
                            ) : (
                              msg.text
                            )}
                          </div>

                          <div
                            className={`mt-1 flex items-center gap-2 text-[10px] font-mono ${
                              isAi ? 'text-slate-500' : 'text-slate-400 justify-end'
                            }`}
                          >
                            <span>{msg.timestamp}</span>
                            {isAi && <span>· DESTRIA AI Core</span>}
                          </div>

                          {/* Action Buttons for AI message if available */}
                          {isAi && msg.suggestedAction === 'schedule_meeting' && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                onClick={() => setIsBriefModalOpen(true)}
                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <FileText className="w-3.5 h-3.5 text-[#D4AF37]" />
                                <span>Inspect Project Brief</span>
                              </button>
                              <button
                                onClick={() => setIsBookingModalOpen(true)}
                                className="px-3 py-1.5 rounded-lg bg-[#00C2C7] hover:bg-[#00d8de] text-[#0B1220] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
                              >
                                <Calendar className="w-3.5 h-3.5" />
                                <span>Schedule Consultation</span>
                              </button>
                            </div>
                          )}

                          {isAi && msg.suggestedAction === 'talk_to_human' && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                onClick={() => setIsEscalationModalOpen(true)}
                                className="px-3 py-1.5 rounded-lg bg-[#D4AF37] hover:bg-[#e4be46] text-[#0B1220] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
                              >
                                <Phone className="w-3.5 h-3.5" />
                                <span>Direct Solutions Contact</span>
                              </button>
                              <button
                                onClick={() => setIsBookingModalOpen(true)}
                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
                              >
                                <Calendar className="w-3.5 h-3.5 text-[#00C2C7]" />
                                <span>Book Calendar Slot</span>
                              </button>
                            </div>
                          )}

                          {/* Verified Corporate Resource Download & View Cards */}
                          {isAi && msg.resourceLinks && msg.resourceLinks.length > 0 && (
                            <div className="mt-2.5 space-y-2">
                              {msg.resourceLinks.map((res) => (
                                <div
                                  key={res.id}
                                  className="p-2.5 rounded-xl bg-slate-900/95 border border-[#D4AF37]/40 space-y-2"
                                >
                                  <div>
                                    <div className="text-[10px] font-mono uppercase tracking-wider text-[#D4AF37]">
                                      {res.category} · {res.pageCount} Pages PDF
                                    </div>
                                    <div className="text-xs font-semibold text-white mt-0.5">
                                      {res.title}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <a
                                      href={res.fileUrl}
                                      download={res.downloadFilename}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#00C2C7] hover:bg-[#00d6dc] text-[#0B1220] text-[11px] font-bold transition-colors"
                                    >
                                      <Download className="w-3 h-3" />
                                      <span>Download PDF</span>
                                    </a>
                                    <a
                                      href={res.fileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-[11px] font-semibold transition-colors"
                                    >
                                      <ExternalLink className="w-3 h-3 text-[#D4AF37]" />
                                      <span>View PDF</span>
                                    </a>
                                  </div>
                                </div>
                              ))}
                              <Link
                                to={ROUTES.RESOURCES}
                                className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#00C2C7] hover:underline"
                              >
                                <FileText className="w-3 h-3" />
                                <span>Open Corporate Resources Download Center</span>
                              </Link>
                            </div>
                          )}

                          {/* Recommended Catalog Solution Cards */}
                          {isAi && msg.recommendedServiceIds && msg.recommendedServiceIds.length > 0 && (
                            <div className="mt-2.5 space-y-1.5">
                              {msg.recommendedServiceIds
                                .map((id) => SERVICE_CATALOG.find((s) => s.id === id))
                                .filter((s): s is NonNullable<typeof s> => Boolean(s))
                                .map((svc) => {
                                  const engagement = formatCatalogEngagement(svc);
                                  return (
                                    <button
                                      key={svc.id}
                                      type="button"
                                      onClick={() =>
                                        handleSendMessage(
                                          `Tell me more about ${svc.title} (${engagement.primaryLabel}), its capabilities, and the technical assessment process.`
                                        )
                                      }
                                      className="w-full text-left px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-[#00C2C7]/25 hover:border-[#00C2C7]/60 transition-colors cursor-pointer flex items-center justify-between gap-2"
                                    >
                                      <span className="text-[11px] font-semibold text-white truncate">
                                        {svc.title}
                                      </span>
                                      <span className="text-[10px] font-mono text-[#00C2C7] shrink-0">
                                        {engagement.primaryLabel}
                                      </span>
                                    </button>
                                  );
                                })}
                            </div>
                          )}

                          {/* Quick replies */}
                          {isAi && msg.quickReplies && msg.quickReplies.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              {msg.quickReplies.map((reply, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => handleQuickReply(reply)}
                                  className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-[#00C2C7]/20 hover:border-[#00C2C7]/50 text-slate-300 hover:text-white border border-slate-700/80 transition-all cursor-pointer"
                                >
                                  {reply}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Typing Indicator */}
                {isTyping && (
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-mono">
                    <div className="w-6 h-6 rounded-lg bg-[#111827] border border-cyan-500/40 flex items-center justify-center text-[#00C2C7]">
                      <Bot className="w-3.5 h-3.5 animate-pulse" />
                    </div>
                    <span className="flex items-center gap-1">
                      <span>Thinking</span>
                      <span className="animate-bounce">.</span>
                      <span className="animate-bounce delay-100">.</span>
                      <span className="animate-bounce delay-200">.</span>
                    </span>
                  </div>
                )}

                {/* Explicit Client Confirmation Card for Server-Prepared Consultations / Inquiries */}
                {pendingToolConfirmation && (
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-[#D4AF37]/50 space-y-2.5 shadow-lg">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#D4AF37] font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          {pendingToolConfirmation.kind === 'consultation'
                            ? 'Confirm Executive Consultation Request'
                            : 'Confirm Service Inquiry Submission'}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setPendingToolConfirmation(null)}
                        className="text-slate-400 hover:text-white cursor-pointer"
                        aria-label="Dismiss confirmation"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="text-[11px] text-slate-300 space-y-1 bg-[#0B1220] p-2.5 rounded-lg border border-slate-800">
                      {Object.entries(pendingToolConfirmation.summary)
                        .filter(([, val]) => val !== undefined && val !== null && String(val).trim() !== '')
                        .slice(0, 7)
                        .map(([key, val]) => (
                          <div key={key} className="flex justify-between gap-2">
                            <span className="text-slate-500 font-mono capitalize">
                              {key.replace(/([A-Z])/g, ' $1').trim()}:
                            </span>
                            <span className="text-slate-200 text-right truncate max-w-[220px]">
                              {Array.isArray(val) ? val.join(', ') : String(val)}
                            </span>
                          </div>
                        ))}
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Nothing is submitted until you confirm. Confirming registers this request and notifies our executive solutions team.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isSubmittingConfirmation}
                        onClick={() => void handleConfirmPendingTool()}
                        className="flex-1 py-2 px-3 rounded-lg bg-[#00C2C7] hover:bg-[#00d8de] disabled:opacity-50 text-[#0B1220] text-xs font-bold cursor-pointer transition-colors"
                      >
                        {isSubmittingConfirmation ? 'Submitting...' : 'Confirm & Submit'}
                      </button>
                      <button
                        type="button"
                        disabled={isSubmittingConfirmation}
                        onClick={() => setPendingToolConfirmation(null)}
                        className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* =========================================================================
                  REAL-TIME VOICE CONTROL & WAVEFORM CENTER
                  ========================================================================= */}
              {isVoiceActive ||
              voiceStatus === 'error' ||
              voiceStatus === 'microphone_unavailable' ||
              voiceStatus === 'service_unavailable' ? (
                <div className="px-4 py-3 bg-[#111827] border-t border-cyan-500/30 flex flex-col gap-2.5">
                  {/* Status & Live Audio Waveform Strip */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {voiceStatus === 'connecting' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                          <span>Connecting...</span>
                        </span>
                      )}
                      {voiceStatus === 'connected' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          <span>Connected</span>
                        </span>
                      )}
                      {voiceStatus === 'reconnecting' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                          <span>Reconnecting...</span>
                        </span>
                      )}
                      {voiceStatus === 'microphone_unavailable' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-rose-400">
                          <MicOff className="w-3.5 h-3.5" />
                          <span>Microphone Unavailable</span>
                        </span>
                      )}
                      {voiceStatus === 'service_unavailable' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-rose-400">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Connection Unavailable</span>
                        </span>
                      )}
                      {voiceStatus === 'error' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-rose-400">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Connection Unavailable</span>
                        </span>
                      )}
                      {voiceStatus !== 'connecting' &&
                        voiceStatus !== 'reconnecting' &&
                        voiceStatus !== 'error' &&
                        voiceStatus !== 'microphone_unavailable' &&
                        voiceStatus !== 'service_unavailable' &&
                        isMicMuted && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-rose-300">
                            <MicOff className="w-3.5 h-3.5" />
                            <span>Microphone Muted</span>
                          </span>
                        )}
                      {!isMicMuted && voiceStatus === 'listening' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                          <span>{isPushToTalkMode ? 'Ready (Push-to-Talk)' : 'Listening...'}</span>
                        </span>
                      )}
                      {!isMicMuted && voiceStatus === 'user_speaking' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-300">
                          <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                          <span>You&apos;re Speaking...</span>
                        </span>
                      )}
                      {!isMicMuted && voiceStatus === 'interrupted' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-amber-300">
                          <span className="w-2 h-2 rounded-full bg-amber-300 animate-pulse" />
                          <span>Listening...</span>
                        </span>
                      )}
                      {!isMicMuted && voiceStatus === 'understanding' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-sky-400">
                          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                          <span>Understanding...</span>
                        </span>
                      )}
                      {!isMicMuted && voiceStatus === 'processing' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                          <span>Processing...</span>
                        </span>
                      )}
                      {voiceStatus === 'ai_speaking' && !isSpeakerMuted && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#00C2C7]">
                          <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                          <span>Speaking...</span>
                        </span>
                      )}
                      {voiceStatus === 'ai_speaking' && isSpeakerMuted && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-slate-400">
                          <VolumeX className="w-3.5 h-3.5" />
                          <span>Speaker Muted</span>
                        </span>
                      )}
                    </div>

                    {/* Real AnalyserNode Waveform Visualization (16 Frequency Bands — strictly idle when silent/muted) */}
                    <div
                      className="flex items-center gap-[3px] h-7 px-2 rounded-lg bg-[#0B1220]/80 border border-slate-800/80"
                      role="meter"
                      aria-label={`Voice audio level ${audioVolume}%`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={audioVolume}
                    >
                      {audioBands.map((bandLevel, i) => {
                        const isLiveAudioBar =
                          isVoiceActive &&
                          ((voiceStatus === 'ai_speaking' && !isSpeakerMuted) ||
                            ((voiceStatus === 'listening' || voiceStatus === 'user_speaking') && !isMicMuted));
                        const heightPercent = isLiveAudioBar
                          ? Math.max(14, Math.min(100, bandLevel))
                          : 14;
                        return (
                          <div
                            key={i}
                            style={{ height: `${heightPercent}%` }}
                            className={`w-[3px] rounded-full transition-[height] duration-75 motion-reduce:transition-none ${
                              voiceStatus === 'ai_speaking' && !isSpeakerMuted
                                ? 'bg-gradient-to-t from-[#009b9f] to-[#00C2C7]'
                                : (voiceStatus === 'listening' || voiceStatus === 'user_speaking') && !isMicMuted
                                ? 'bg-gradient-to-t from-emerald-500 to-emerald-300'
                                : voiceStatus === 'understanding'
                                ? 'bg-sky-400/70'
                                : voiceStatus === 'reconnecting' || voiceStatus === 'processing'
                                ? 'bg-amber-400/60'
                                : 'bg-slate-700/70'
                            }`}
                          />
                        );
                      })}
                    </div>

                    {/* Voice Controls: Mic Mute, Speaker Mute, Interrupt, End */}
                    <div className="flex items-center gap-1">
                      {voiceStatus === 'ai_speaking' && (
                        <button
                          onClick={handleInterruptAi}
                          className="px-2 py-1 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-600/50 text-amber-300 text-[10px] font-mono flex items-center gap-1 cursor-pointer transition-colors"
                          title="Interrupt AI speaking"
                        >
                          <Square className="w-2.5 h-2.5 fill-current" />
                          <span>Interrupt</span>
                        </button>
                      )}

                      <button
                        onClick={handleToggleMic}
                        className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                          isMicMuted
                            ? 'bg-rose-950/70 border-rose-500/50 text-rose-400 hover:bg-rose-900'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                        }`}
                        title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                      >
                        {isMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        onClick={handleToggleSpeaker}
                        className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                          isSpeakerMuted
                            ? 'bg-rose-950/70 border-rose-500/50 text-rose-400 hover:bg-rose-900'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                        }`}
                        title={isSpeakerMuted ? 'Unmute Speaker Output' : 'Mute Speaker Output'}
                      >
                        {isSpeakerMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        onClick={handleToggleVoice}
                        className="px-2.5 py-1 rounded-lg bg-rose-900/60 hover:bg-rose-800 border border-rose-700/60 text-white text-[11px] font-mono flex items-center gap-1 cursor-pointer transition-colors"
                        title="End Voice Conversation"
                      >
                        <PhoneOff className="w-3 h-3" />
                        <span className="hidden sm:inline">End Voice</span>
                      </button>
                    </div>
                  </div>

                  {/* Secondary Audio Controls: Speaker Volume & Push-to-Talk */}
                  <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
                    <div className="flex items-center gap-2">
                      <label htmlFor="destria-voice-volume" className="text-slate-400">
                        Vol
                      </label>
                      <input
                        id="destria-voice-volume"
                        type="range"
                        min={0}
                        max={100}
                        value={isSpeakerMuted ? 0 : Math.round(speakerVolume * 100)}
                        onChange={(e) => handleSpeakerVolumeChange(Number(e.target.value) / 100)}
                        className="w-20 accent-[#00C2C7] cursor-pointer"
                        aria-label="Speaker volume"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleTogglePushToTalk}
                        className={`px-2 py-0.5 rounded border text-[10px] font-mono flex items-center gap-1 cursor-pointer transition-colors ${
                          isPushToTalkMode
                            ? 'bg-[#00C2C7]/20 border-[#00C2C7]/60 text-[#00C2C7]'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                        title="Toggle Push-to-Talk Mode"
                      >
                        <Radio className="w-2.5 h-2.5" />
                        <span>{isPushToTalkMode ? 'PTT ON' : 'PTT'}</span>
                      </button>
                      {isPushToTalkMode && (
                        <button
                          type="button"
                          onPointerDown={() => {
                            setIsPushToTalkHeld(true);
                            aiVoiceService.startPushToTalk();
                          }}
                          onPointerUp={() => {
                            setIsPushToTalkHeld(false);
                            aiVoiceService.endPushToTalk();
                          }}
                          onPointerLeave={() => {
                            if (isPushToTalkHeld) {
                              setIsPushToTalkHeld(false);
                              aiVoiceService.endPushToTalk();
                            }
                          }}
                          className={`px-2.5 py-0.5 rounded border text-[10px] font-bold cursor-pointer select-none transition-colors ${
                            isPushToTalkHeld
                              ? 'bg-[#00C2C7] text-[#0B1220] border-[#00C2C7]'
                              : 'bg-slate-800 text-slate-200 border-slate-600 hover:border-[#00C2C7]'
                          }`}
                        >
                          {isPushToTalkHeld ? 'Speaking...' : 'Hold to Speak'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Live Speech Transcription Preview */}
                  {liveTranscript && (
                    <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-cyan-500/20 text-xs text-slate-300 font-sans flex items-start gap-2 animate-fade-in">
                      <Mic className="w-3 h-3 text-[#00C2C7] flex-shrink-0 mt-0.5" />
                      <span className="italic flex-1 truncate">"{liveTranscript}"</span>
                    </div>
                  )}

                  {/* Voice Privacy Disclosure */}
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 leading-tight">
                    <Shield className="w-3 h-3 text-[#00C2C7] shrink-0" />
                    <span>
                      Voice Disclosure: Microphone audio is used only for real-time consultation and is not permanently stored.
                    </span>
                  </div>
                </div>
              ) : (
                /* Voice Launch Callout Strip */
                <div className="px-4 py-2 bg-[#111827]/90 border-t border-slate-800 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Sparkles className="w-3.5 h-3.5 text-[#00C2C7]" />
                    <span>Real-time two-way voice consultation</span>
                  </div>
                  <button
                    onClick={handleToggleVoice}
                    className="px-3 py-1 rounded-lg bg-[#00C2C7]/15 hover:bg-[#00C2C7] text-[#00C2C7] hover:text-[#0B1220] border border-[#00C2C7]/40 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Start Voice</span>
                  </button>
                </div>
              )}

              {/* Chat Input Bar */}
              <div className="p-3 bg-[#111827] border-t border-slate-800">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    maxLength={2000}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder={
                      isVoiceActive 
                        ? "Voice is active, speak aloud or type here..." 
                        : "Describe your project or ask a question..."
                    }
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00C2C7] transition-colors"
                  />

                  {/* Mic Quick Trigger */}
                  <button
                    type="button"
                    onClick={handleToggleVoice}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isVoiceActive
                        ? 'bg-[#00C2C7] text-[#0B1220] border-[#00C2C7] shadow-lg shadow-[#00C2C7]/30'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-[#00C2C7] border-slate-700'
                    }`}
                    title={isVoiceActive ? 'Voice Conversation Active' : 'Start Voice Conversation'}
                    aria-label="Toggle voice"
                  >
                    <Mic className="w-4 h-4" />
                  </button>

                  <button
                    type="submit"
                    disabled={!inputMessage.trim() || isTyping}
                    className="p-2.5 rounded-xl bg-[#00C2C7] hover:bg-[#00d8de] text-[#0B1220] font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-md"
                    aria-label="Send message"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
                <p className="mt-2 text-[10px] text-slate-500 leading-snug">
                  {LEGAL_GOVERNANCE_STATEMENTS.find((s) => s.id === 'ai-usage-disclaimer')?.clauses[0]}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* =========================================================================
          STRUCTURED PROJECT BRIEF MODAL
          ========================================================================= */}
      <ProjectBriefModal
        isOpen={isBriefModalOpen}
        sourceChannel={isVoiceActive ? 'AI Voice' : activeRequestSource}
        onClose={() => setIsBriefModalOpen(false)}
        brief={currentBrief}
        onScheduleConsultation={() => {
          setIsBriefModalOpen(false);
          setActiveRequestSource(isVoiceActive ? 'AI Voice' : activeRequestSource);
          setIsBookingModalOpen(true);
        }}
        onInquirySubmitted={({ referenceId }) => {
          const confirmMsg = `Your service inquiry has been successfully registered with DESTRIA TECH INC (Reference: ${referenceId}). Our authorized team will review your submitted requirements and coordinate further communication.`;
          setMessages((prev) => [
            ...prev,
            {
              id: `msg-inq-confirmed-${Date.now()}`,
              sender: 'ai',
              text: confirmMsg,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              stage: 'brief',
              suggestedAction: 'schedule_meeting',
              quickReplies: ['Schedule Consultation', 'Direct Solutions Contact'],
            },
          ]);
          if (isVoiceActive && !isSpeakerMuted) {
            void aiVoiceService.speakText(confirmMsg);
          }
        }}
      />

      {/* =========================================================================
          SMART APPOINTMENT BOOKING MODAL
          ========================================================================= */}
      <AppointmentBookingModal
        isOpen={isBookingModalOpen}
        sourceChannel={isVoiceActive ? 'AI Voice' : activeRequestSource}
        onClose={() => setIsBookingModalOpen(false)}
        projectBrief={currentBrief}
        initialClientData={state.client}
        onAppointmentBooked={(appointment: ConsultationAppointment) => {
          setState((prev) => ({
            ...prev,
            currentStage: 'confirmed',
            scheduledAppointment: appointment,
          }));
          const isConfirmedCalendar = appointment.status === 'confirmed';
          const confirmText = isConfirmedCalendar
            ? `Your consultation appointment is confirmed.\n\n• Reference: ${appointment.referenceCode}\n• Date & Time: ${appointment.scheduledDate} at ${appointment.scheduledTimeSlot} (${appointment.clientTimezone})\n• Channel: ${appointment.consultationType.toUpperCase()}`
            : `Your consultation request has been successfully registered. The requested schedule remains subject to availability and formal confirmation by our authorized team.\n\n• Reference: ${appointment.referenceCode}\n• Requested Date & Time: ${appointment.scheduledDate} at ${appointment.scheduledTimeSlot} (${appointment.clientTimezone})\n• Channel: ${appointment.consultationType.toUpperCase()}`;
          setMessages((prev) => [
            ...prev,
            {
              id: `msg-confirmed-${Date.now()}`,
              sender: 'ai',
              text: confirmText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              stage: 'schedule',
              suggestedAction: 'talk_to_human',
              quickReplies: ['Direct Solutions Contact'],
            },
          ]);
          if (isVoiceActive && !isSpeakerMuted) {
            void aiVoiceService.speakText(
              isConfirmedCalendar
                ? `Your consultation appointment is confirmed under reference ${appointment.referenceCode}.`
                : `Your consultation request has been successfully registered under reference ${appointment.referenceCode}. The requested schedule remains subject to availability and formal confirmation by our authorized team.`
            );
          }
        }}
      />

      {/* =========================================================================
          DIRECT SOLUTIONS ESCALATION MODAL
          ========================================================================= */}
      {isEscalationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-[#0B1220] border border-[#00C2C7]/40 rounded-2xl shadow-2xl overflow-hidden p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <BrandLogo variant="emblem" size="md" ring="gold" decorative />
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Direct Solutions Desk</h3>
                  <p className="text-xs text-slate-400">{COMPANY_CONFIG.name} · {COMPANY_CONFIG.platformName}</p>
                </div>
              </div>
              <button
                onClick={() => setIsEscalationModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-mono text-[#D4AF37] uppercase tracking-wider">
                      Enterprise Solutions Architecture
                    </span>
                    <h4 className="text-base font-bold text-white mt-0.5">{COMPANY_CONFIG.name}</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Dedicated engineering review for enterprise software, AI automation, digital platforms, and strategic technology deployments.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-[#00C2C7] bg-[#00C2C7]/10 px-2 py-0.5 rounded border border-[#00C2C7]/30 shrink-0">
                    {COMPANY_CONFIG.initials} DESK
                  </span>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2 text-xs">
                  {COMPANY_CONFIG.corporatePhone && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-[#00C2C7]" />
                        <span>Corporate Phone:</span>
                      </span>
                      <a
                        href={COMPANY_CONFIG.corporatePhoneLink || '#'}
                        className="font-mono text-white font-bold hover:text-[#00C2C7] transition-colors"
                      >
                        {COMPANY_CONFIG.corporatePhone}
                      </a>
                    </div>
                  )}

                  {COMPANY_CONFIG.corporateEmail && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 text-[#00C2C7]" />
                        <span>Corporate Email:</span>
                      </span>
                      <a
                        href={`mailto:${COMPANY_CONFIG.corporateEmail}`}
                        className="font-mono text-white font-bold hover:text-[#00C2C7] transition-colors"
                      >
                        {COMPANY_CONFIG.corporateEmail}
                      </a>
                    </div>
                  )}

                  {COMPANY_CONFIG.registeredAddress && (
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-slate-400 flex items-center gap-1.5 shrink-0">
                        <MapPin className="w-3.5 h-3.5 text-[#00C2C7]" />
                        <span>Corporate Headquarters:</span>
                      </span>
                      <span className="text-slate-300 text-right">{COMPANY_CONFIG.registeredAddress}</span>
                    </div>
                  )}

                  {!COMPANY_CONFIG.corporatePhone && !COMPANY_CONFIG.corporateEmail && !COMPANY_CONFIG.registeredAddress && (
                    <div className="flex items-start gap-2 text-slate-300">
                      <Shield className="w-4 h-4 text-[#00C2C7] shrink-0 mt-0.5" />
                      <span>
                        Book a verified consultation slot or submit your project inquiry through our online desk for a direct architect response.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                {COMPANY_CONFIG.corporatePhone && COMPANY_CONFIG.corporatePhoneLink && (
                  <a
                    href={COMPANY_CONFIG.corporatePhoneLink}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#00C2C7] to-[#009b9f] text-[#0B1220] font-bold text-xs text-center flex items-center justify-center gap-2 shadow-lg hover:brightness-110 transition-all cursor-pointer"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Call {COMPANY_CONFIG.corporatePhone}</span>
                  </a>
                )}
                <button
                  onClick={() => {
                    setIsEscalationModalOpen(false);
                    setIsBookingModalOpen(true);
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-[#00C2C7] hover:bg-[#00d8de] text-[#0B1220] font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Book Formal Consultation</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
