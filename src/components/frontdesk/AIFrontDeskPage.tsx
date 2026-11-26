import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  Globe,
  Headphones,
  AlertCircle,
  Layers,
  Mail,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  Square,
  UserCheck,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { corporateIdentity } from '../../data/companyConfig';
import { ROUTES } from '../../config/routes';
import { apiUrl } from '../../lib/apiClient';
import { aiVoiceService, VoiceLanguage, VoiceSessionState } from '../../services/aiVoiceService';

interface FrontDeskMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  channel?: 'chat' | 'voice';
  quickReplies?: string[];
  recommendedServiceIds?: string[];
}

interface FrontDeskDossierView {
  sessionId: string;
  version: number;
  discoveryActive: boolean;
  leadStatus: string;
  clientProfile: Record<string, string | undefined>;
  businessDiscovery: Record<string, string | undefined>;
  projectRequirements: {
    projectName?: string;
    projectDescription?: string;
    primaryObjective?: string;
    businessProblem?: string;
    applicationType?: string;
    intendedUsers: string[];
    functionalRequirements: Array<{ id: string; label: string; classification: string; source: string }>;
    nonfunctionalRequirements: Array<{ id: string; label: string; classification: string; source: string }>;
    integrations: Array<{ id: string; label: string; classification: string; source: string }>;
    preferredTimeline?: string;
    optionalBudgetExpectation?: string;
    clientConcerns: string[];
  };
  completeness: {
    scorePercent: number;
    readyForMasterplan: boolean;
    readyForSubmission: boolean;
    dimensions: Array<{ key: string; label: string; status: string; weight: number; detail: string }>;
    missingCriticalFields: string[];
    recommendedNextQuestion: string | null;
  };
  recommendation: {
    proposedApplicationType: string;
    architectureRationale: string;
    preliminaryDisclaimer: string;
    recommendedModules: Array<{ name: string; classification: string; purpose: string }>;
    preliminaryTechStack: Record<string, string>;
    deliveryRoadmap: Array<{ phase: string; focus: string }>;
    alignedCatalogServiceIds: string[];
  } | null;
  summary: {
    headline: string;
    confirmedClientFacts: string[];
    aiRecommendedProposals: string[];
    missingItemsForExecutiveReview: string[];
    nextSteps: string[];
  } | null;
  masterplan: {
    version: number;
    generatedAt: string;
    disclaimer: string;
    sections: Record<string, any>;
  } | null;
}

const VOICE_LANGUAGES: Array<{ code: VoiceLanguage; label: string; short: string }> = [
  { code: 'en-US', label: 'English (US)', short: 'EN' },
  { code: 'fil-PH', label: 'Filipino / Tagalog', short: 'FIL' },
  { code: 'es-ES', label: 'Español', short: 'ES' },
  { code: 'fr-FR', label: 'Français', short: 'FR' },
];

const MASTERPLAN_SECTION_LABELS: Record<string, string> = {
  '01_project_overview': '01. Project Overview',
  '02_client_business_summary': '02. Client & Business Summary',
  '03_business_objectives': '03. Business Objectives',
  '04_problem_statement': '04. Problem Statement',
  '05_recommended_solution_architecture': '05. Recommended Solution Architecture',
  '06_user_roles_and_permissions': '06. User Roles & Permissions',
  '07_core_modules': '07. Core Modules',
  '08_functional_requirements': '08. Functional Requirements',
  '09_nonfunctional_requirements': '09. Non-Functional Requirements',
  '10_system_architecture': '10. System Architecture',
  '11_technology_stack_preliminary': '11. Preliminary Technology Stack',
  '12_database_overview': '12. Database Overview',
  '13_integration_requirements': '13. Integration Requirements',
  '14_security_requirements': '14. Security Requirements',
  '15_infrastructure_requirements': '15. Infrastructure Requirements',
  '16_ui_ux_design_approach': '16. UI/UX Design Approach',
  '17_development_phases': '17. Development Phases',
  '18_testing_and_qa_plan': '18. Testing & QA Plan',
  '19_deployment_and_launch_plan': '19. Deployment & Launch Plan',
  '20_maintenance_and_support_plan': '20. Maintenance & Support Plan',
  '21_assumptions': '21. Assumptions',
  '22_risks': '22. Risks',
  '23_outstanding_questions': '23. Outstanding Questions',
  '24_executive_consultation_agenda': '24. Executive Consultation Agenda',
  '25_commercial_discussion_items': '25. Commercial Discussion Items',
};

function getTomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function buildMasterplanMarkdown(dossier: FrontDeskDossierView): string {
  const mp = dossier.masterplan;
  if (!mp) return '';
  const lines: string[] = [
    `# DESTRIA TECH INC — Preliminary Project Development Masterplan (v${mp.version})`,
    `Generated: ${mp.generatedAt}`,
    `Lead Status: ${dossier.leadStatus} | Completeness: ${dossier.completeness.scorePercent}%`,
    '',
    `> ${mp.disclaimer}`,
    '',
  ];
  for (const [key, label] of Object.entries(MASTERPLAN_SECTION_LABELS)) {
    const val = mp.sections[key];
    lines.push(`## ${label}`);
    if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === 'string') lines.push(`- ${item}`);
        else if (item && typeof item === 'object') {
          lines.push(`- ${Object.entries(item).map(([k, v]) => `**${k}**: ${String(v)}`).join(' · ')}`);
        }
      }
    } else if (val && typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) {
        lines.push(`- **${k}**: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
      }
    } else if (val !== undefined) {
      lines.push(String(val));
    }
    lines.push('');
  }
  return lines.join('\n');
}

export const AIFrontDeskPage: React.FC = () => {
  const [sessionId] = useState<string>(
    () => `dti-fd-web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  );
  const [messages, setMessages] = useState<FrontDeskMessage[]>([
    {
      id: 'fd-welcome',
      sender: 'ai',
      text: `Hello and welcome to ${corporateIdentity.legalName} (${corporateIdentity.networkName}). I'm the AI Front Desk Officer—here to chat naturally, answer technical or corporate questions, help organize your project goals into a preliminary masterplan, or coordinate an executive consultation. How can I assist you today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      channel: 'chat',
      quickReplies: [
        'We need a custom web or mobile system',
        'Can you build an AI workflow for our team?',
        'Tell me about DESTRIA TECH INC',
        'Schedule an executive consultation',
      ],
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Voice state
  const [voiceStatus, setVoiceStatus] = useState<VoiceSessionState>('disconnected');
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>('en-US');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [audioBands, setAudioBands] = useState<number[]>(() => new Array(16).fill(0));
  const [liveTranscript, setLiveTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Front Desk Dossier & Right-hand Progressive Workspace
  const [dossier, setDossier] = useState<FrontDeskDossierView | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<'profile' | 'masterplan' | 'submit'>('profile');
  const [isGeneratingMasterplan, setIsGeneratingMasterplan] = useState(false);

  // Editable Profile & Requirements Draft
  const [profileDraft, setProfileDraft] = useState({
    fullName: '',
    companyName: '',
    email: '',
    phone: '',
    industry: '',
    jobTitle: '',
    projectName: '',
    businessProblem: '',
    preferredTimeline: '',
    optionalBudgetExpectation: '',
  });
  const [profileSaveMsg, setProfileSaveMsg] = useState<string | null>(null);

  // Review, Consultation Scheduling & Explicit Authorization State
  const [scheduleConsultation, setScheduleConsultation] = useState(true);
  const [consultDate, setConsultDate] = useState(getTomorrowIso);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [consultationType, setConsultationType] = useState<'video' | 'phone' | 'executive_briefing'>('video');
  const [executivePathway, setExecutivePathway] = useState<'solutions_architecture' | 'ceo' | 'cto'>('solutions_architecture');
  const [clientTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  });
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null);
  const [clientConfirmedChecked, setClientConfirmedChecked] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [submissionReceipt, setSubmissionReceipt] = useState<any | null>(null);

  // Human Escalation
  const [showEscalationModal, setShowEscalationModal] = useState(false);
  const [escalationReason, setEscalationReason] = useState('');
  const [escalationTrack, setEscalationTrack] = useState<'general' | 'ceo' | 'cto' | 'pricing' | 'technical'>('general');
  const [escalationReceipt, setEscalationReceipt] = useState<string | null>(null);
  const [isEscalating, setIsEscalating] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveTranscript]);

  // Sync draft form when dossier updates
  const syncDraftFromDossier = useCallback((d: FrontDeskDossierView) => {
    setProfileDraft((prev) => ({
      fullName: d.clientProfile.fullName || prev.fullName,
      companyName: d.clientProfile.companyName || prev.companyName,
      email: d.clientProfile.email || prev.email,
      phone: d.clientProfile.phone || prev.phone,
      industry: d.clientProfile.industry || prev.industry,
      jobTitle: d.clientProfile.jobTitle || prev.jobTitle,
      projectName: d.projectRequirements.projectName || prev.projectName,
      businessProblem: d.projectRequirements.businessProblem || prev.businessProblem,
      preferredTimeline: d.projectRequirements.preferredTimeline || prev.preferredTimeline,
      optionalBudgetExpectation: d.projectRequirements.optionalBudgetExpectation || prev.optionalBudgetExpectation,
    }));
  }, []);

  // Load initial empty session dossier
  useEffect(() => {
    fetch(apiUrl(`/api/frontdesk/session/${encodeURIComponent(sessionId)}`))
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.dossier) {
          setDossier(data.dossier);
        }
      })
      .catch(() => {});
  }, [sessionId]);

  // Load available consultation slots when date changes
  useEffect(() => {
    if (!scheduleConsultation || !consultDate) return;
    fetch(apiUrl(`/api/appointments/availability?date=${encodeURIComponent(consultDate)}`))
      .then((r) => r.json())
      .then((data) => {
        const slots = Array.isArray(data.availableSlots) ? data.availableSlots : [];
        setAvailableSlots(slots);
        if (slots.length > 0 && !slots.includes(selectedSlot)) {
          setSelectedSlot(slots[0]);
        }
      })
      .catch(() => {
        setAvailableSlots([]);
      });
  }, [scheduleConsultation, consultDate, selectedSlot]);

  // Wire voice service callbacks
  useEffect(() => {
    aiVoiceService.setCallbacks({
      onStatusChange: (st) => {
        setVoiceStatus(st);
        if (st === 'disconnected' || st === 'processing' || st === 'ai_speaking') {
          setLiveTranscript('');
        }
      },
      onSessionActiveChange: (active) => setIsVoiceActive(active),
      onTranscript: (text, isFinal) => {
        if (!isFinal) {
          setLiveTranscript(text);
          return;
        }
        setLiveTranscript('');
        if (text.trim()) {
          setMessages((prev) => [
            ...prev,
            {
              id: `v-u-${Date.now()}`,
              sender: 'user',
              text: text.trim(),
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              channel: 'voice',
            },
          ]);
        }
      },
      onAiResponse: (text, intent) => {
        setMessages((prev) => [
          ...prev,
          {
            id: `v-a-${Date.now()}`,
            sender: 'ai',
            text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            channel: 'voice',
            quickReplies: Array.isArray(intent?.quickReplies) ? intent.quickReplies : undefined,
            recommendedServiceIds: Array.isArray(intent?.recommendedServiceIds)
              ? intent.recommendedServiceIds
              : undefined,
          },
        ]);
        // Refresh dossier after voice turn
        fetch(apiUrl(`/api/frontdesk/session/${encodeURIComponent(sessionId)}`))
          .then((r) => r.json())
          .then((d) => {
            if (d.success && d.dossier) {
              setDossier(d.dossier);
              syncDraftFromDossier(d.dossier);
            }
          })
          .catch(() => {});
      },
      onVolumeChange: (_vol, bands) => {
        if (Array.isArray(bands) && bands.length === 16) {
          setAudioBands(bands);
        } else {
          setAudioBands(new Array(16).fill(0));
        }
      },
      onError: (msg) => setVoiceError(msg),
    });

    return () => {
      aiVoiceService.stopSession();
    };
  }, [sessionId, syncDraftFromDossier]);

  const sendMessage = async (rawText?: string) => {
    const text = (rawText ?? inputText).trim();
    if (!text || isSending) return;
    setInputText('');
    setIsSending(true);

    const userMsg: FrontDeskMessage = {
      id: `c-u-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      channel: 'chat',
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);

    try {
      const res = await fetch(apiUrl('/api/consultant/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          userMessage: text,
          language: voiceLanguage,
          history: nextHistory.slice(-14).map((m) => ({ sender: m.sender, text: m.text })),
          stateContext: { currentStage: 'frontdesk' },
        }),
      });
      const data = await res.json().catch(() => ({}));
      const replyText =
        data.replyText ||
        data.error ||
        'I encountered a temporary connection issue. Please try sending your message again or call +1 (307) 419-4277.';
      setMessages((prev) => [
        ...prev,
        {
          id: `c-a-${Date.now()}`,
          sender: 'ai',
          text: replyText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          channel: 'chat',
          quickReplies: Array.isArray(data.quickReplies) ? data.quickReplies : undefined,
          recommendedServiceIds: Array.isArray(data.recommendedServiceIds) ? data.recommendedServiceIds : undefined,
        },
      ]);
      if (data.frontDeskDossier) {
        setDossier(data.frontDeskDossier);
        syncDraftFromDossier(data.frontDeskDossier);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `c-err-${Date.now()}`,
          sender: 'ai',
          text: `Our AI Front Desk service is momentarily unreachable. You can retry shortly or contact ${corporateIdentity.legalName} directly at ${corporateIdentity.contact.telephone.display} or ${corporateIdentity.contact.email}.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          channel: 'chat',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleVoice = async () => {
    setVoiceError(null);
    if (isVoiceActive) {
      aiVoiceService.stopSession();
    } else {
      aiVoiceService.setLanguage(voiceLanguage);
      await aiVoiceService.startSession();
    }
  };

  const handleRetryVoice = async () => {
    setVoiceError(null);
    await aiVoiceService.retryConnection();
  };

  const handleSaveProfileEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaveMsg(null);
    try {
      const res = await fetch(apiUrl(`/api/frontdesk/session/${encodeURIComponent(sessionId)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientProfile: {
            fullName: profileDraft.fullName,
            companyName: profileDraft.companyName,
            email: profileDraft.email,
            phone: profileDraft.phone,
            industry: profileDraft.industry,
            jobTitle: profileDraft.jobTitle,
            timezone: clientTimezone,
          },
          projectOverview: {
            projectName: profileDraft.projectName,
            businessProblem: profileDraft.businessProblem,
            preferredTimeline: profileDraft.preferredTimeline,
            optionalBudgetExpectation: profileDraft.optionalBudgetExpectation,
          },
        }),
      });
      const data = await res.json();
      if (data.success && data.dossier) {
        setDossier(data.dossier);
        setConfirmationToken(null); // Require fresh token after edits
        setProfileSaveMsg('Profile & project details saved.');
      }
    } catch {
      setProfileSaveMsg('Unable to save edits right now.');
    }
  };

  const handleGenerateMasterplan = async () => {
    setIsGeneratingMasterplan(true);
    try {
      // Save any pending form edits first
      await fetch(apiUrl(`/api/frontdesk/session/${encodeURIComponent(sessionId)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientProfile: {
            fullName: profileDraft.fullName,
            companyName: profileDraft.companyName,
            email: profileDraft.email,
            phone: profileDraft.phone,
            industry: profileDraft.industry,
            jobTitle: profileDraft.jobTitle,
            timezone: clientTimezone,
          },
          projectOverview: {
            projectName: profileDraft.projectName,
            businessProblem: profileDraft.businessProblem,
            preferredTimeline: profileDraft.preferredTimeline,
            optionalBudgetExpectation: profileDraft.optionalBudgetExpectation,
          },
        }),
      });
      const res = await fetch(apiUrl(`/api/frontdesk/session/${encodeURIComponent(sessionId)}/masterplan`), {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success && data.dossier) {
        setDossier(data.dossier);
        setWorkspaceTab('masterplan');
      }
    } finally {
      setIsGeneratingMasterplan(false);
    }
  };

  const handlePrepareSubmission = async () => {
    setSubmissionError(null);
    setSubmissionReceipt(null);
    setClientConfirmedChecked(false);
    try {
      const res = await fetch(apiUrl(`/api/frontdesk/session/${encodeURIComponent(sessionId)}/prepare-submission`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patch: {
            clientProfile: {
              fullName: profileDraft.fullName,
              companyName: profileDraft.companyName,
              email: profileDraft.email,
              phone: profileDraft.phone,
              industry: profileDraft.industry,
              jobTitle: profileDraft.jobTitle,
              timezone: clientTimezone,
            },
            projectOverview: {
              projectName: profileDraft.projectName,
              businessProblem: profileDraft.businessProblem,
              preferredTimeline: profileDraft.preferredTimeline,
              optionalBudgetExpectation: profileDraft.optionalBudgetExpectation,
            },
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setSubmissionError(data.error || 'Please provide your full name, valid email, and project goals first.');
        return;
      }
      setConfirmationToken(data.confirmationToken);
      if (data.dossier) setDossier(data.dossier);
    } catch {
      setSubmissionError('Unable to prepare confirmation summary right now.');
    }
  };

  const handleAuthorizeSubmission = async () => {
    if (!confirmationToken || !clientConfirmedChecked || isAuthorizing) return;
    setSubmissionError(null);
    setIsAuthorizing(true);
    try {
      const res = await fetch(apiUrl(`/api/frontdesk/session/${encodeURIComponent(sessionId)}/authorize-submission`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmationToken,
          clientConfirmed: true,
          scheduleConsultation,
          scheduledDate: consultDate,
          scheduledTimeSlot: selectedSlot,
          clientTimezone,
          consultationType,
          executivePathway,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setSubmissionError(data.error || 'Unable to authorize submission.');
        if (res.status === 400) setConfirmationToken(null);
        return;
      }
      setSubmissionReceipt(data);
      setConfirmationToken(null);
      setClientConfirmedChecked(false);
    } catch {
      setSubmissionError('Network error while submitting your project inquiry.');
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleSubmitEscalation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!escalationReason.trim() || isEscalating) return;
    setIsEscalating(true);
    try {
      const res = await fetch(apiUrl(`/api/frontdesk/session/${encodeURIComponent(sessionId)}/escalate`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: profileDraft.fullName,
          clientEmail: profileDraft.email,
          clientPhone: profileDraft.phone,
          companyName: profileDraft.companyName,
          reason: escalationReason,
          requestedTrack: escalationTrack,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setEscalationReceipt(data.message);
        setEscalationReason('');
      }
    } finally {
      setIsEscalating(false);
    }
  };

  const handleDownloadMasterplan = () => {
    if (!dossier?.masterplan) return;
    const md = buildMasterplanMarkdown(dossier);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DESTRIA-Preliminary-Masterplan-${sessionId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const voiceStatusLabel: Record<VoiceSessionState, string> = {
    disconnected: 'Voice Ready',
    connecting: 'Connecting Voice...',
    connected: 'Voice Connected',
    listening: 'Listening — Speak Naturally',
    user_speaking: 'Hearing You...',
    understanding: 'Understanding...',
    processing: 'Thinking...',
    ai_speaking: 'AI Officer Speaking',
    interrupted: 'Interrupted — Listening',
    reconnecting: 'Reconnecting Voice...',
    stopping: 'Ending Voice...',
    error: 'Voice Connection Issue',
    microphone_unavailable: 'Microphone Unavailable',
    service_unavailable: 'Voice Service Temporarily Unavailable',
  };

  return (
    <div className="min-h-screen bg-[#0B1220] text-slate-100 flex flex-col">
      {/* Top Corporate Bar */}
      <header className="sticky top-0 z-40 bg-[#0B1F3B]/95 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to={ROUTES.HOME} className="flex items-center gap-2.5 group min-w-0">
              <BrandLogo variant="emblem" size="sm" ring="gold" eager decorative />
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-white tracking-wide uppercase truncate group-hover:text-[#00C2C7] transition-colors">
                  {corporateIdentity.legalName}
                </div>
                <div className="text-[10px] font-mono text-[#00C2C7] uppercase tracking-wider truncate">
                  AI Front Desk &amp; Technology Consultation
                </div>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <a
              href={corporateIdentity.contact.telephone.href}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#081529] border border-slate-700 text-xs font-mono text-[#00C2C7] hover:border-[#00C2C7]"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>{corporateIdentity.contact.telephone.display}</span>
            </a>
            <button
              type="button"
              onClick={() => setShowEscalationModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-[#D4AF37]/50 text-[#D4AF37] hover:bg-[#D4AF37]/10 text-xs font-semibold cursor-pointer"
            >
              <Headphones className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Talk to Human Team</span>
              <span className="sm:hidden">Human</span>
            </button>
            <Link
              to={ROUTES.PORTAL.LOGIN}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:border-[#00C2C7] text-xs font-semibold"
            >
              <Shield className="w-3.5 h-3.5 text-[#00C2C7]" />
              <span>Client Portal</span>
            </Link>
            <Link
              to={ROUTES.HOME}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Website</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Split Consultation Desk */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN (7 cols): Natural Conversational Voice + Text Front Desk */}
        <section className="lg:col-span-7 flex flex-col rounded-2xl bg-[#111827] border border-slate-800 shadow-2xl overflow-hidden min-h-[640px] max-h-[82vh]">
          {/* Desk Status & Voice Controls Bar */}
          <div className="px-4 py-3 bg-[#0B1F3B] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#00C2C7]/15 border border-[#00C2C7]/40 flex items-center justify-center">
                <Bot className="w-5 h-5 text-[#00C2C7]" />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>DESTRIA AI Front Desk Officer</span>
                  <span className="text-[10px] font-mono text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/30 px-1.5 py-0.5 rounded">
                    AI ASSISTANT
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  {voiceStatusLabel[voiceStatus]}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Language selector */}
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs">
                <Globe className="w-3.5 h-3.5 text-[#00C2C7]" />
                <select
                  aria-label="Conversation language"
                  value={voiceLanguage}
                  onChange={(e) => {
                    const lang = e.target.value as VoiceLanguage;
                    setVoiceLanguage(lang);
                    aiVoiceService.setLanguage(lang);
                  }}
                  className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer"
                >
                  {VOICE_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code} className="bg-[#0B1F3B] text-white">
                      {l.short} — {l.label}
                    </option>
                  ))}
                </select>
              </div>

              {isVoiceActive && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isMicMuted;
                      aiVoiceService.setMicMuted(next);
                      setIsMicMuted(next);
                    }}
                    className={`p-2 rounded-lg border text-xs cursor-pointer ${
                      isMicMuted
                        ? 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                        : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-[#00C2C7]'
                    }`}
                    title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                  >
                    {isMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isSpeakerMuted;
                      aiVoiceService.setSpeakerMuted(next);
                      setIsSpeakerMuted(next);
                    }}
                    className="p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:border-[#00C2C7] cursor-pointer"
                    title={isSpeakerMuted ? 'Unmute Speaker' : 'Mute Speaker'}
                  >
                    {isSpeakerMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                  {voiceStatus === 'ai_speaking' && (
                    <button
                      type="button"
                      onClick={() => aiVoiceService.interrupt(false)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold cursor-pointer"
                    >
                      <Square className="w-3 h-3" />
                      <span>Interrupt</span>
                    </button>
                  )}
                </>
              )}

              <button
                type="button"
                onClick={handleToggleVoice}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  isVoiceActive
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-[#00C2C7] hover:bg-[#00d8de] text-[#0B1220]'
                }`}
              >
                {isVoiceActive ? <PhoneOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                <span>{isVoiceActive ? 'End Voice' : 'Start Voice'}</span>
              </button>
            </div>
          </div>

          {/* Live Voice Waveform & Circuit Breaker Recovery Banner */}
          {(isVoiceActive || voiceStatus === 'service_unavailable' || voiceStatus === 'error' || voiceError) && (
            <div className="px-4 py-2.5 bg-[#081529] border-b border-slate-800 space-y-2">
              {isVoiceActive && (
                <div className="flex items-center justify-between gap-3">
                  <div
                    role="meter"
                    aria-label="Live voice audio activity"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(Math.max(...audioBands, 0) * 100)}
                    className="flex items-end gap-1 h-7 flex-1 max-w-xs"
                  >
                    {audioBands.map((band, idx) => (
                      <div
                        key={idx}
                        className="flex-1 rounded-full bg-[#00C2C7] transition-all duration-75"
                        style={{ height: `${Math.max(15, Math.min(100, Math.round(band * 100)))}%` }}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] font-mono text-slate-300 truncate max-w-md">
                    {liveTranscript || voiceStatusLabel[voiceStatus]}
                  </span>
                </div>
              )}

              {(voiceStatus === 'service_unavailable' || voiceStatus === 'error' || voiceError) && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-amber-950/50 border border-amber-500/40 text-xs text-amber-200">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>
                      {voiceError ||
                        'Voice service paused to prevent repeated audio prompts. You can continue typing below or manually retry voice.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRetryVoice}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/50 text-amber-200 font-semibold cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Retry Voice</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Chat Transcript */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.sender === 'user'
                      ? 'bg-[#0B1F3B] border border-[#00C2C7]/40 text-white'
                      : 'bg-slate-900/90 border border-slate-800 text-slate-200'
                  }`}
                >
                  {msg.text}
                </div>
                <span className="mt-1 px-1 text-[10px] font-mono text-slate-500">
                  {msg.sender === 'user' ? 'You' : 'AI Front Desk Officer'} · {msg.timestamp}
                  {msg.channel === 'voice' ? ' · Voice' : ''}
                </span>

                {msg.sender === 'ai' && msg.quickReplies && msg.quickReplies.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 max-w-[90%]">
                    {msg.quickReplies.map((qr) => (
                      <button
                        key={qr}
                        type="button"
                        onClick={() => void sendMessage(qr)}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-[#0B1F3B] border border-slate-700 hover:border-[#00C2C7] text-xs text-slate-300 hover:text-[#00C2C7] transition-colors cursor-pointer"
                      >
                        {qr}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isSending && (
              <div className="flex items-center gap-2 text-xs font-mono text-[#00C2C7] px-2">
                <div className="w-3.5 h-3.5 rounded-full border-2 border-[#00C2C7] border-t-transparent animate-spin" />
                <span>AI Front Desk Officer is thinking...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage();
            }}
            className="p-3.5 bg-[#081529] border-t border-slate-800 space-y-2"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask anything, describe your project goals, or request a consultation..."
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#111827] border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00C2C7]"
              />
              <button
                type="submit"
                disabled={isSending || !inputText.trim()}
                className="px-4 py-2.5 rounded-xl bg-[#00C2C7] hover:bg-[#00d8de] disabled:opacity-40 text-[#0B1220] text-sm font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </div>
            <p className="text-[10.5px] text-slate-500 leading-snug">
              AI Front Desk Disclosure: Informational preliminary consultation only. Final pricing, scope, and commercial terms are determined exclusively through authorized DESTRIA TECH INC executive review. Raw microphone audio is not stored.
            </p>
          </form>
        </section>

        {/* RIGHT COLUMN (5 cols): Progressive Discovery, Masterplan & Authorized Submission */}
        <aside className="lg:col-span-5 flex flex-col rounded-2xl bg-[#111827] border border-slate-800 shadow-2xl overflow-hidden max-h-[82vh]">
          {/* Completeness & Lead Status Header */}
          <div className="p-4 bg-[#0B1F3B] border-b border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                <h2 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Project Discovery Workspace
                </h2>
              </div>
              <span className="text-[11px] font-mono text-[#00C2C7] font-bold">
                {dossier?.completeness.scorePercent ?? 0}% Complete
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#00C2C7] to-[#10B981] transition-all duration-300"
                style={{ width: `${dossier?.completeness.scorePercent ?? 0}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Status: <strong className="text-slate-200">{dossier?.leadStatus || 'New visitor'}</strong></span>
              <span className="font-mono text-[10px]">v{dossier?.version ?? 1}</span>
            </div>

            {/* Progressive Disclosure Tabs */}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setWorkspaceTab('profile')}
                className={`py-2 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                  workspaceTab === 'profile'
                    ? 'bg-[#00C2C7] text-[#0B1220]'
                    : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Profile</span>
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceTab('masterplan')}
                className={`py-2 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                  workspaceTab === 'masterplan'
                    ? 'bg-[#00C2C7] text-[#0B1220]'
                    : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Masterplan</span>
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceTab('submit')}
                className={`py-2 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                  workspaceTab === 'submit'
                    ? 'bg-[#00C2C7] text-[#0B1220]'
                    : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                <span>Authorize</span>
              </button>
            </div>
          </div>

          {/* Workspace Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {/* TAB 1: PROFILE & REQUIREMENTS REVIEW */}
            {workspaceTab === 'profile' && (
              <form onSubmit={handleSaveProfileEdits} className="space-y-3">
                <p className="text-slate-400 leading-relaxed">
                  Details captured during our conversation appear here automatically. You may edit or refine any field at any time.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Full Name *</label>
                    <input
                      type="text"
                      value={profileDraft.fullName}
                      onChange={(e) => setProfileDraft({ ...profileDraft, fullName: e.target.value })}
                      placeholder="Your full name"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00C2C7]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Company / Organization</label>
                    <input
                      type="text"
                      value={profileDraft.companyName}
                      onChange={(e) => setProfileDraft({ ...profileDraft, companyName: e.target.value })}
                      placeholder="Company name"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00C2C7]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Business Email *</label>
                    <input
                      type="email"
                      value={profileDraft.email}
                      onChange={(e) => setProfileDraft({ ...profileDraft, email: e.target.value })}
                      placeholder="name@company.com"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00C2C7]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Telephone</label>
                    <input
                      type="tel"
                      value={profileDraft.phone}
                      onChange={(e) => setProfileDraft({ ...profileDraft, phone: e.target.value })}
                      placeholder="+1 ..."
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00C2C7]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Industry</label>
                    <input
                      type="text"
                      value={profileDraft.industry}
                      onChange={(e) => setProfileDraft({ ...profileDraft, industry: e.target.value })}
                      placeholder="e.g., Hospitality, Logistics, Healthcare"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00C2C7]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Target Timeline</label>
                    <input
                      type="text"
                      value={profileDraft.preferredTimeline}
                      onChange={(e) => setProfileDraft({ ...profileDraft, preferredTimeline: e.target.value })}
                      placeholder="e.g., 3 months, Q3 2026"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00C2C7]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">Project Name / Focus</label>
                  <input
                    type="text"
                    value={profileDraft.projectName}
                    onChange={(e) => setProfileDraft({ ...profileDraft, projectName: e.target.value })}
                    placeholder="e.g., Multi-Branch Hotel Management Platform"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00C2C7]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">Business Goal / Problem Statement *</label>
                  <textarea
                    rows={3}
                    value={profileDraft.businessProblem}
                    onChange={(e) => setProfileDraft({ ...profileDraft, businessProblem: e.target.value })}
                    placeholder="Describe what you want to build or improve..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00C2C7]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">
                    Optional Budget Expectation (Non-Binding, Optional)
                  </label>
                  <input
                    type="text"
                    value={profileDraft.optionalBudgetExpectation}
                    onChange={(e) => setProfileDraft({ ...profileDraft, optionalBudgetExpectation: e.target.value })}
                    placeholder="Optional — final pricing is determined during executive review"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00C2C7]"
                  />
                </div>

                {dossier && dossier.projectRequirements.functionalRequirements.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5">
                    <div className="text-[10.5px] font-mono text-[#00C2C7] uppercase">
                      Confirmed Features Captured
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {dossier.projectRequirements.functionalRequirements.map((f) => (
                        <span
                          key={f.id}
                          className="px-2 py-0.5 rounded bg-[#0B1F3B] border border-[#00C2C7]/30 text-slate-200 text-[11px]"
                        >
                          {f.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {profileSaveMsg && (
                  <p className="text-[11px] font-mono text-[#10B981]">{profileSaveMsg}</p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="submit"
                    className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold cursor-pointer"
                  >
                    Save Corrections
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleGenerateMasterplan()}
                    disabled={isGeneratingMasterplan}
                    className="flex-1 px-3.5 py-2 rounded-lg bg-[#00C2C7] hover:bg-[#00d8de] text-[#0B1220] font-bold cursor-pointer disabled:opacity-50"
                  >
                    {isGeneratingMasterplan ? 'Building Masterplan...' : 'Generate 25-Section Masterplan'}
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: PRELIMINARY 25-SECTION MASTERPLAN */}
            {workspaceTab === 'masterplan' && (
              <div className="space-y-3">
                {!dossier?.masterplan ? (
                  <div className="p-6 text-center rounded-xl border border-dashed border-slate-700 space-y-3">
                    <FileText className="w-8 h-8 text-[#00C2C7] mx-auto" />
                    <p className="text-slate-300">
                      Generate your structured 25-section Preliminary Project Development Masterplan based on your confirmed goals.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleGenerateMasterplan()}
                      disabled={isGeneratingMasterplan}
                      className="px-4 py-2 rounded-lg bg-[#00C2C7] hover:bg-[#00d8de] text-[#0B1220] font-bold cursor-pointer"
                    >
                      {isGeneratingMasterplan ? 'Generating...' : 'Generate Preliminary Masterplan'}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="p-3 rounded-xl bg-[#0B1F3B]/80 border border-[#D4AF37]/40 text-[11px] text-slate-200 leading-relaxed">
                      <strong className="text-[#D4AF37]">Preliminary Non-Binding Proposal:</strong>{' '}
                      {dossier.masterplan.disclaimer}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono text-slate-400">
                        Masterplan v{dossier.masterplan.version} · 25 Sections
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleDownloadMasterplan}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[#00C2C7] font-mono text-[11px] cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>Export .md</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setWorkspaceTab('submit')}
                          className="px-2.5 py-1 rounded bg-[#00C2C7] text-[#0B1220] font-bold text-[11px] cursor-pointer"
                        >
                          Review &amp; Submit
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {Object.entries(MASTERPLAN_SECTION_LABELS).map(([key, label]) => {
                        const val = dossier.masterplan?.sections?.[key];
                        return (
                          <details
                            key={key}
                            open={key === '01_project_overview' || key === '05_recommended_solution_architecture'}
                            className="rounded-xl bg-slate-900/90 border border-slate-800 p-3"
                          >
                            <summary className="font-mono text-[11px] font-bold text-[#00C2C7] cursor-pointer">
                              {label}
                            </summary>
                            <div className="mt-2 text-slate-300 space-y-1 text-[11.5px] leading-relaxed">
                              {Array.isArray(val) ? (
                                <ul className="list-disc pl-4 space-y-1">
                                  {val.map((item: any, idx: number) => (
                                    <li key={idx}>
                                      {typeof item === 'string'
                                        ? item
                                        : Object.entries(item)
                                            .map(([k, v]) => `${k}: ${String(v)}`)
                                            .join(' · ')}
                                    </li>
                                  ))}
                                </ul>
                              ) : val && typeof val === 'object' ? (
                                Object.entries(val).map(([k, v]) => (
                                  <div key={k}>
                                    <span className="text-slate-400 font-mono">{k}: </span>
                                    <span>{Array.isArray(v) ? v.join(', ') : String(v)}</span>
                                  </div>
                                ))
                              ) : (
                                <p>{String(val ?? '')}</p>
                              )}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* TAB 3: EXPLICIT REVIEW, CONSULTATION SCHEDULER & AUTHORIZATION */}
            {workspaceTab === 'submit' && (
              <div className="space-y-3.5">
                {submissionReceipt ? (
                  <div className="p-4 rounded-xl bg-emerald-950/40 border border-[#10B981]/50 space-y-3">
                    <div className="flex items-center gap-2 text-[#10B981] font-bold text-sm">
                      <CheckCircle2 className="w-5 h-5" />
                      <span>Project Inquiry Registered</span>
                    </div>
                    <p className="text-slate-200 leading-relaxed">
                      {submissionReceipt.confirmationMessage}
                    </p>
                    <div className="p-3 rounded-lg bg-[#0B1220] border border-slate-800 font-mono text-[11px] space-y-1">
                      <div>Inquiry Reference: <strong className="text-[#00C2C7]">{submissionReceipt.referenceCode}</strong></div>
                      {submissionReceipt.consultation && (
                        <div>
                          Consultation: <strong className="text-[#D4AF37]">{submissionReceipt.consultation.referenceCode}</strong>{' '}
                          ({submissionReceipt.consultation.scheduledDate} · {submissionReceipt.consultation.scheduledTimeSlot}) —{' '}
                          {submissionReceipt.consultation.status === 'confirmed'
                            ? 'Confirmed on Calendar'
                            : 'Pending Executive Confirmation'}
                        </div>
                      )}
                      <div>Email Dispatch Status: {submissionReceipt.emailDelivery?.deliveryState || 'recorded'}</div>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Sign in to the{' '}
                      <Link to={ROUTES.PORTAL.LOGIN} className="text-[#00C2C7] underline">
                        DESTRIA TECH INC Client Portal
                      </Link>{' '}
                      with <strong>{profileDraft.email}</strong> to track executive review status or submit requirement updates.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                      <label className="flex items-center gap-2 text-slate-200 font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scheduleConsultation}
                          onChange={(e) => setScheduleConsultation(e.target.checked)}
                          className="accent-[#00C2C7]"
                        />
                        <Calendar className="w-4 h-4 text-[#00C2C7]" />
                        <span>Also request an Executive Consultation slot</span>
                      </label>

                      {scheduleConsultation && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                          <div>
                            <label className="block text-[10.5px] font-mono text-slate-400 mb-1">Consultation Date</label>
                            <input
                              type="date"
                              value={consultDate}
                              min={getTomorrowIso()}
                              onChange={(e) => setConsultDate(e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-[#0B1220] border border-slate-700 text-white text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10.5px] font-mono text-slate-400 mb-1">Available Time Slot</label>
                            <select
                              value={selectedSlot}
                              onChange={(e) => setSelectedSlot(e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-[#0B1220] border border-slate-700 text-white text-xs"
                            >
                              {availableSlots.length === 0 ? (
                                <option value="">No slots available for date</option>
                              ) : (
                                availableSlots.map((slot) => (
                                  <option key={slot} value={slot}>
                                    {slot}
                                  </option>
                                ))
                              )}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10.5px] font-mono text-slate-400 mb-1">Channel</label>
                            <select
                              value={consultationType}
                              onChange={(e) => setConsultationType(e.target.value as any)}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-[#0B1220] border border-slate-700 text-white text-xs"
                            >
                              <option value="video">Video Consultation</option>
                              <option value="phone">Telephone Call</option>
                              <option value="executive_briefing">Executive Briefing</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10.5px] font-mono text-slate-400 mb-1">Executive Track</label>
                            <select
                              value={executivePathway}
                              onChange={(e) => setExecutivePathway(e.target.value as any)}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-[#0B1220] border border-slate-700 text-white text-xs"
                            >
                              <option value="solutions_architecture">Solutions Architecture Team</option>
                              <option value="ceo">Executive Review — {corporateIdentity.leadership.ceo.name} (CEO)</option>
                              <option value="cto">Technical Architecture — {corporateIdentity.leadership.cto.name} (CTO)</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>

                    {submissionError && (
                      <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-200 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{submissionError}</span>
                      </div>
                    )}

                    {!confirmationToken ? (
                      <button
                        type="button"
                        onClick={() => void handlePrepareSubmission()}
                        className="w-full py-2.5 px-4 rounded-xl bg-[#00C2C7] hover:bg-[#00d8de] text-[#0B1220] font-bold cursor-pointer"
                      >
                        Step 1: Prepare Summary for Client Review
                      </button>
                    ) : (
                      <div className="p-3.5 rounded-xl bg-[#0B1F3B] border border-[#00C2C7]/50 space-y-3">
                        <div className="text-xs font-bold text-white">Step 2: Explicit Client Authorization</div>
                        <div className="text-[11.5px] text-slate-300 space-y-1">
                          <div><strong>Client:</strong> {profileDraft.fullName} ({profileDraft.email})</div>
                          <div><strong>Organization:</strong> {profileDraft.companyName || 'Not specified'}</div>
                          <div><strong>Project:</strong> {profileDraft.projectName || 'Custom Enterprise Solution'}</div>
                          {scheduleConsultation && selectedSlot && (
                            <div><strong>Requested Slot:</strong> {consultDate} at {selectedSlot} ({clientTimezone})</div>
                          )}
                        </div>
                        <label className="flex items-start gap-2 text-[11px] text-slate-200 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={clientConfirmedChecked}
                            onChange={(e) => setClientConfirmedChecked(e.target.checked)}
                            className="mt-0.5 accent-[#00C2C7]"
                          />
                          <span>
                            I have reviewed the summary and preliminary masterplan, and I explicitly authorize DESTRIA TECH INC to register this project inquiry and dispatch the executive discovery report for formal review.
                          </span>
                        </label>
                        <button
                          type="button"
                          disabled={!clientConfirmedChecked || isAuthorizing}
                          onClick={() => void handleAuthorizeSubmission()}
                          className="w-full py-2.5 px-4 rounded-xl bg-[#10B981] hover:bg-emerald-400 disabled:opacity-40 text-[#0B1220] font-bold cursor-pointer"
                        >
                          {isAuthorizing ? 'Registering Authorized Inquiry...' : 'Confirm & Submit Project Inquiry'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </aside>
      </main>

      {/* Human Escalation Modal */}
      {showEscalationModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#111827] border border-slate-700 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Headphones className="w-4 h-4 text-[#D4AF37]" />
                <span>Connect with DESTRIA Human Team</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowEscalationModal(false);
                  setEscalationReceipt(null);
                }}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="p-3 rounded-lg bg-[#0B1F3B] border border-slate-800 text-xs text-slate-300 space-y-1">
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-[#00C2C7]" />
                <a href={corporateIdentity.contact.telephone.href} className="text-[#00C2C7] font-mono">
                  {corporateIdentity.contact.telephone.display}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[#00C2C7]" />
                <a href={`mailto:${corporateIdentity.contact.email}`} className="text-slate-200 font-mono">
                  {corporateIdentity.contact.email}
                </a>
              </div>
            </div>

            {escalationReceipt ? (
              <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200">
                {escalationReceipt}
              </div>
            ) : (
              <form onSubmit={handleSubmitEscalation} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">Routing Department</label>
                  <select
                    value={escalationTrack}
                    onChange={(e) => setEscalationTrack(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                  >
                    <option value="general">General Human Assistance</option>
                    <option value="pricing">Authorized Pricing &amp; Formal Proposal Desk</option>
                    <option value="technical">Senior Technical Architecture</option>
                    <option value="ceo">Executive Office — {corporateIdentity.leadership.ceo.name}</option>
                    <option value="cto">CTO Office — {corporateIdentity.leadership.cto.name}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">How can our team help? *</label>
                  <textarea
                    required
                    rows={3}
                    value={escalationReason}
                    onChange={(e) => setEscalationReason(e.target.value)}
                    placeholder="Briefly describe your question or request..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isEscalating}
                  className="w-full py-2.5 rounded-lg bg-[#D4AF37] hover:bg-amber-400 text-[#0B1220] font-bold cursor-pointer disabled:opacity-50"
                >
                  {isEscalating ? 'Submitting Handover...' : 'Request Human Representative'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AIFrontDeskPage;
