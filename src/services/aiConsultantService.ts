import { SERVICE_CATALOG, CATALOG_CATEGORIES, formatCatalogEngagement } from '../data/serviceCatalog';
import { corporateIdentity, COMMERCIAL_ENGAGEMENT_STATEMENT } from '../data/companyConfig';
import { ProjectBrief, ClientProfile, ProjectRequirements } from './supabaseService';
import { apiUrl } from '../lib/apiClient';

import { corporateProfile } from '../config/corporateProfile';
import {
  CORPORATE_PROFILE_RESOURCE,
  SERVICES_BROCHURE_RESOURCE,
} from '../data/corporateResources';
import { ROUTES } from '../config/routes';

export interface ChatResourceLink {
  id: string;
  title: string;
  category: string;
  fileUrl: string;
  canonicalUrl: string;
  downloadFilename: string;
  pagePath: string;
  pageCount: number;
}

export interface ChatToolEvent {
  toolName?: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
  stage?: 'welcome' | 'category' | 'details' | 'recommendation' | 'brief' | 'schedule';
  quickReplies?: string[];
  recommendedServiceIds?: string[];
  resourceLinks?: ChatResourceLink[];
  suggestedAction?: 'review_brief' | 'schedule_meeting' | 'talk_to_human' | 'corporate_profile';
}

export interface ConsultationState {
  currentStage:
    | 'welcome'
    | 'category'
    | 'problem'
    | 'features'
    | 'client_info'
    | 'recommendation'
    | 'brief_ready'
    | 'scheduling'
    | 'confirmed';
  client: ClientProfile;
  requirements: ProjectRequirements;
  generatedBrief?: ProjectBrief;
  scheduledAppointment?: any;
}

export const INITIAL_CONSULTATION_STATE: ConsultationState = {
  currentStage: 'welcome',
  client: {
    fullName: '',
    email: '',
    phone: '',
    companyName: '',
    industry: '',
    location: '',
  },
  requirements: {
    category: '',
    businessProblem: '',
    targetUsers: '',
    keyFeatures: [],
    existingSystems: '',
    thirdPartyIntegrations: [],
    budgetPreference: 'Subject to Formal Assessment',
    targetTimeline: '',
    specialRequirements: '',
  },
};

export const PROJECT_CATEGORIES = CATALOG_CATEGORIES.filter((c) => c.id !== 'all').map((c) => c.label);

const matchCatalogLocally = (query: string, limit = 3) => {
  const q = query.toLowerCase();
  const tokens = q.split(/\W+/).filter((t) => t.length > 2);
  return SERVICE_CATALOG.map((svc) => {
    const text = `${svc.title} ${svc.shortDescription} ${svc.capabilities.join(' ')} ${svc.categoryId}`.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (svc.title.toLowerCase().includes(token)) score += 4;
      else if (text.includes(token)) score += 1;
    }
    return { svc, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.svc);
};

function getOfflineCommercialPolicyReply(userMessage: string): string | null {
  const normalized = userMessage.toLowerCase();
  if (
    /(ignore|override|bypass)\s+.*(instructions|rules|policy)/i.test(normalized) ||
    /(previous|old|former)\s+.*(price|pricing|rate|fee|package)/i.test(normalized)
  ) {
    return "DESTRIA TECH INC delivers customized enterprise technology solutions tailored to each client's specific operational, technical, security, and integration requirements. Because every project is individually architected, we do not publish standardized pricing or provide automated cost estimates. We would be pleased to arrange a consultation to evaluate your project requirements and prepare a formal proposal. You may schedule a consultation through our website, email info@destriatech.com, or call our official corporate telephone number at +1 (307) 419-4277.";
  }
  if (/\b(discount|promo|promotion|coupon|voucher|welcome10|destria25)\b/i.test(normalized)) {
    return 'DESTRIA TECH INC does not advertise public discounts or promotional pricing. Commercial terms are determined exclusively within formal proposals following technical assessment and executive review.';
  }
  if (/\b(cheapest|lowest\s+price|most\s+affordable|budget\s+package|minimum\s+price)\b/i.test(normalized)) {
    return "DESTRIA TECH INC does not offer standardized low-cost packages or advertised price tiers. All engagements are structured around customized enterprise solutions designed to align with your organization's specific technical and business objectives. We invite you to share your requirements so our team can assess the most suitable solution architecture.";
  }
  if (
    /\b(price|prices|pricing|cost|costs|how\s+much|rate|rates|hourly|monthly\s+plan|quote|ballpark|estimate|budget)\b/i.test(
      normalized
    )
  ) {
    return "DESTRIA TECH INC delivers customized enterprise technology solutions tailored to each client's specific operational, technical, security, and integration requirements. Because every project is individually architected, we do not publish standardized pricing or provide automated cost estimates. We would be pleased to arrange a consultation to evaluate your project requirements and prepare a formal proposal. You may schedule a consultation through our website, email info@destriatech.com, or call our official corporate telephone number at +1 (307) 419-4277.";
  }
  if (/\b(headquarters|address|located|sheridan|wyoming)\b/i.test(normalized)) {
    return `DESTRIA TECH INC is a Wyoming-registered technology corporation. Our official corporate headquarters address is ${corporateIdentity.headquarters.fullAddress}.`;
  }
  if (/\b(phone|telephone|call\s+you|contact\s+number|hotline)\b/i.test(normalized)) {
    return `You may reach DESTRIA TECH INC via our official corporate telephone number at ${corporateIdentity.contact.telephone.display}, or by email at ${corporateIdentity.contact.email}.`;
  }
  if (/\b(ceo|chief\s+executive|founder)\b/i.test(normalized)) {
    return `${corporateIdentity.leadership.ceo.name} is the Founder and Chief Executive Officer of ${corporateIdentity.legalName}.`;
  }
  if (/\b(cto|chief\s+technology)\b/i.test(normalized)) {
    return `${corporateIdentity.leadership.cto.name} is the Chief Technology Officer of ${corporateIdentity.legalName}.`;
  }
  if (
    /\b(services?\s+brochure|corporate\s+brochure|service\s+catalog|services?\s+catalog|list\s+of\s+services|line\s+of\s+services|technology\s+capabilities|corporate\s+presentation|brochure|corporate\s+profile|company\s+profile|company\s+brochure|company\s+background|corporate\s+documentation|company\s+overview|company\s+information|corporate\s+resources|download\s+center)\b/i.test(
      normalized
    )
  ) {
    return `You may view or download our official 8-page Corporate Summary and Enterprise Technology Services brochure at ${SERVICES_BROCHURE_RESOURCE.canonicalFileUrl}, our 17-page Corporate Profile at ${corporateProfile.canonicalPageUrl}, or browse all publications at https://destriatech.com${ROUTES.RESOURCES}.`;
  }
  return null;
}

const OFFLINE_RESOURCE_LINKS: ChatResourceLink[] = [
  {
    id: SERVICES_BROCHURE_RESOURCE.id,
    title: SERVICES_BROCHURE_RESOURCE.title,
    category: SERVICES_BROCHURE_RESOURCE.category,
    fileUrl: SERVICES_BROCHURE_RESOURCE.fileUrl,
    canonicalUrl: SERVICES_BROCHURE_RESOURCE.canonicalFileUrl,
    downloadFilename: SERVICES_BROCHURE_RESOURCE.downloadFilename,
    pagePath: SERVICES_BROCHURE_RESOURCE.detailPagePath,
    pageCount: SERVICES_BROCHURE_RESOURCE.pageCount,
  },
  {
    id: CORPORATE_PROFILE_RESOURCE.id,
    title: CORPORATE_PROFILE_RESOURCE.title,
    category: CORPORATE_PROFILE_RESOURCE.category,
    fileUrl: CORPORATE_PROFILE_RESOURCE.fileUrl,
    canonicalUrl: CORPORATE_PROFILE_RESOURCE.canonicalFileUrl,
    downloadFilename: CORPORATE_PROFILE_RESOURCE.downloadFilename,
    pagePath: CORPORATE_PROFILE_RESOURCE.detailPagePath,
    pageCount: CORPORATE_PROFILE_RESOURCE.pageCount,
  },
];

const synthesizeBriefFromState = (state: ConsultationState, recommendedIds: string[]): ProjectBrief => {
  const refCode = `DTI-BRF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const matchedServices = recommendedIds
    .map((id) => SERVICE_CATALOG.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const recommendedModules =
    matchedServices.length > 0
      ? matchedServices.map((s) => `${s.title} (${formatCatalogEngagement(s).primaryLabel})`)
      : [
          'Authentication & Multi-Tenant Access Controller',
          'Distributed Cloud API & Event Engine',
          'Real-Time Status & Progress Dashboard',
          'Automated CI/CD & Quality Verification Pipeline',
        ];

  return {
    referenceCode: refCode,
    client: {
      fullName: state.client.fullName || '',
      email: state.client.email || '',
      phone: state.client.phone || '',
      companyName: state.client.companyName || '',
      industry: state.client.industry || 'Digital & Enterprise Services',
      location: state.client.location || 'Global / International',
    },
    requirements: {
      category: state.requirements.category || 'Customized Enterprise Technology Solution',
      businessProblem:
        state.requirements.businessProblem ||
        'Operational scalability, digital platform modernization, and intelligent automation.',
      keyFeatures:
        state.requirements.keyFeatures.length > 0
          ? state.requirements.keyFeatures
          : matchedServices.flatMap((s) => s.capabilities).slice(0, 4),
      budgetPreference: 'Subject to Formal Assessment',
      targetTimeline: state.requirements.targetTimeline || 'Staged Milestone Delivery (Defined in Formal Proposal)',
    },
    technicalArchitecture: {
      recommendedModules,
      suggestedStack: ['React 19', 'TypeScript', 'Node.js', 'PostgreSQL / Cloud SQL', 'Enterprise AI & Cloud APIs'],
      infrastructure: 'Managed cloud architecture with automated backups, HTTPS encryption, and access controls.',
      securityMeasures: [
        'Role-Based Access Control (RBAC) & Row-Level Security',
        'Server-side secret & API key isolation',
        'Compliance & pre-deployment security review',
      ],
    },
    commercialDiscovery: {
      budgetPreference: 'Subject to Formal Assessment & Approved Commercial Proposal',
      timelinePreference: 'Staged engineering & milestone review',
      suggestedPhases: [
        'Phase 1: Initial Consultation, Technical Assessment & Architecture Blueprint',
        'Phase 2: Formal Proposal Approval & Core System Implementation',
        'Phase 3: Integration Testing, Security Hardening & Quality Assurance',
        'Phase 4: Deployment, Handover & Customized Enterprise Support',
      ],
      consultationAgenda: [
        'Validate business workflows, security posture, and integration touchpoints',
        'Define deliverables, scope boundaries, and third-party infrastructure requirements',
        'Establish milestone schedule for formal proposal preparation',
      ],
    },
    createdAt: new Date().toISOString(),
    status: 'draft',
  };
};

let activeChatSessionId = `dti-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const aiConsultantService = {
  getSessionId(): string {
    return activeChatSessionId;
  },

  resetSession(): string {
    activeChatSessionId = `dti-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return activeChatSessionId;
  },

  async confirmPreparedToolAction(input: {
    sessionId?: string;
    confirmationToken: string;
    kind: 'consultation' | 'inquiry';
    sourceChannel?: 'AI Chat' | 'AI Voice';
  }): Promise<{
    success: boolean;
    referenceCode?: string;
    message?: string;
    error?: string;
    appointment?: Record<string, unknown>;
    inquiry?: Record<string, unknown>;
  }> {
    const res = await fetch(apiUrl('/api/consultant/confirm-tool'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: input.sessionId || activeChatSessionId,
        confirmationToken: input.confirmationToken,
        kind: input.kind,
        clientConfirmed: true,
        sourceChannel: input.sourceChannel || 'AI Chat',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'Unable to confirm and submit request at this time.',
      };
    }
    return {
      success: true,
      referenceCode: data.referenceCode,
      message: data.message,
      appointment: data.appointment,
      inquiry: data.inquiry,
    };
  },

  async processUserMessage(
    userMessage: string,
    state: ConsultationState,
    conversationHistory: ChatMessage[],
    language: string = 'en-US'
  ): Promise<{ aiMessage: ChatMessage; updatedState: ConsultationState; toolEvents?: ChatToolEvent[]; sessionId: string }> {
    const trimmed = userMessage.trim();
    const updatedState: ConsultationState = {
      ...state,
      client: { ...state.client },
      requirements: {
        ...state.requirements,
        keyFeatures: [...(state.requirements.keyFeatures || [])],
      },
    };
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgId = `msg-${Date.now()}`;

    const lower = trimmed.toLowerCase();
    const looksLikeEnterpriseQuery =
      /\b(destria|ophireum|enterprise|erp|crm|custom\s+software|web\s+development|mobile\s+app|ai\s+agent|automation|blockchain|smart\s+contract|cloud\s+infrastructure|cybersecurity|multimedia|3d|vfx|consultation|proposal|project\s+brief|our\s+company|our\s+business|we\s+need\s+to\s+build)\b/i.test(
        lower
      ) ||
      CATALOG_CATEGORIES.some(
        (c) =>
          c.id !== 'all' &&
          (lower.includes(c.label.toLowerCase()) || lower.includes(c.shortLabel.toLowerCase()))
      );

    // Only advance enterprise discovery stage when the conversation is actually about enterprise solutions
    if (looksLikeEnterpriseQuery || updatedState.currentStage !== 'welcome') {
      if (updatedState.currentStage === 'welcome' && looksLikeEnterpriseQuery) {
        const matchedCat =
          CATALOG_CATEGORIES.find(
            (c) =>
              c.id !== 'all' &&
              (lower.includes(c.label.toLowerCase()) || lower.includes(c.shortLabel.toLowerCase()))
          )?.label || '';
        if (matchedCat) {
          updatedState.requirements.category = matchedCat;
          updatedState.currentStage = 'problem';
        }
      } else if (updatedState.currentStage === 'problem' && looksLikeEnterpriseQuery) {
        updatedState.requirements.businessProblem = trimmed;
        updatedState.currentStage = 'features';
      } else if (updatedState.currentStage === 'features' && looksLikeEnterpriseQuery) {
        updatedState.requirements.keyFeatures = trimmed
          .split(/,|\n| and /)
          .map((f) => f.trim())
          .filter(Boolean);
        updatedState.currentStage = 'client_info';
      } else if (updatedState.currentStage === 'client_info' && looksLikeEnterpriseQuery) {
        const emailMatch = trimmed.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) updatedState.client.email = emailMatch[0].toLowerCase();
        const phoneMatch = trimmed.match(/(\+?\d[\d\s\-().]{6,}\d)/);
        if (phoneMatch && !updatedState.client.phone) {
          updatedState.client.phone = phoneMatch[1].trim();
        }
        const nameExplicit = trimmed.match(/(?:my name is|i am|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/);
        if (nameExplicit && !updatedState.client.fullName) {
          updatedState.client.fullName = nameExplicit[1].trim();
        }
        const companyExplicit = trimmed.match(/(?:company is|organization is|from|at)\s+([A-Za-z0-9&.,'\-\s]{2,60})/i);
        if (companyExplicit && !updatedState.client.companyName && !companyExplicit[1].includes('@')) {
          updatedState.client.companyName = companyExplicit[1].split(/[,\n]/)[0].trim();
        }
        updatedState.currentStage = 'brief_ready';
      }
    }

    try {
      const response = await fetch(apiUrl('/api/consultant/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeChatSessionId,
          userMessage: trimmed.slice(0, 1500),
          stateContext: {
            category: updatedState.requirements.category || undefined,
            businessProblem: updatedState.requirements.businessProblem || undefined,
            currentStage: updatedState.currentStage,
            preferredName: updatedState.client.fullName || undefined,
            preferredLanguage: language,
          },
          conversationHistory: conversationHistory.slice(-12).map((m) => ({
            sender: m.sender,
            text: m.text.slice(0, 1200),
          })),
          language,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (typeof data.sessionId === 'string' && data.sessionId.trim()) {
          activeChatSessionId = data.sessionId.trim();
        }
        if (data.memory?.preferredName && !updatedState.client.fullName) {
          updatedState.client.fullName = String(data.memory.preferredName);
        }
        if (data.detectedIntent === 'subject_change') {
          updatedState.requirements.category = '';
          updatedState.requirements.businessProblem = '';
          updatedState.currentStage = 'welcome';
        }
        const recommendedIds: string[] = Array.isArray(data.recommendedServiceIds)
          ? data.recommendedServiceIds
          : [];
        const toolEvents: ChatToolEvent[] = Array.isArray(data.toolEvents) ? data.toolEvents : [];

        if (
          updatedState.currentStage === 'brief_ready' ||
          data.suggestedAction === 'review_brief'
        ) {
          updatedState.generatedBrief = synthesizeBriefFromState(updatedState, recommendedIds);
          updatedState.currentStage = 'brief_ready';
        }

        const quickReplies = Array.isArray(data.quickReplies)
          ? data.quickReplies
          : recommendedIds.length > 0
          ? ['Review Project Brief', 'Request an Enterprise Consultation']
          : [];

        return {
          aiMessage: {
            id: msgId,
            sender: 'ai',
            text: data.replyText,
            timestamp: now,
            recommendedServiceIds: recommendedIds,
            resourceLinks: Array.isArray(data.resourceLinks) ? data.resourceLinks : undefined,
            suggestedAction: data.suggestedAction,
            quickReplies,
          },
          updatedState,
          toolEvents,
          sessionId: activeChatSessionId,
        };
      }
    } catch (err) {
      console.warn('[DESTRIA] Falling back to local conversational engine:', err);
    }

    // Offline Commercial Policy Guardrail
    const policyReply = getOfflineCommercialPolicyReply(trimmed);
    if (policyReply) {
      const isCorporateResourceReply =
        policyReply.includes(corporateProfile.pagePath) || policyReply.includes(ROUTES.RESOURCES);
      return {
        aiMessage: {
          id: msgId,
          sender: 'ai',
          text: policyReply,
          timestamp: now,
          suggestedAction: isCorporateResourceReply ? 'corporate_profile' : 'schedule_meeting',
          resourceLinks: isCorporateResourceReply ? OFFLINE_RESOURCE_LINKS : undefined,
          quickReplies: isCorporateResourceReply
            ? ['Explore Technology Solutions', 'Request an Enterprise Consultation']
            : ['Request an Enterprise Consultation', 'Direct Solutions Contact'],
        },
        updatedState,
        sessionId: activeChatSessionId,
      };
    }

    // Natural offline handling for greetings, personal AI questions, and casual chat
    if (/^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|kamusta|kumusta|hola|bonjour)\b/i.test(lower)) {
      return {
        aiMessage: {
          id: msgId,
          sender: 'ai',
          text: `Hi! I'm the AI assistant for ${corporateIdentity.legalName}. Feel free to chat casually, ask a question, or explore technology solutions—what's on your mind?`,
          timestamp: now,
          quickReplies: [],
        },
        updatedState,
        sessionId: activeChatSessionId,
      };
    }
    if (/\b(how\s+are\s+you|are\s+you\s+married|how\s+old\s+are\s+you|where\s+do\s+you\s+live|are\s+you\s+(?:a\s+)?(?:real\s+person|human)|do\s+you\s+have\s+children|what\s+is\s+your\s+name)\b/i.test(lower)) {
      const personalText = /\bhow\s+are\s+you\b/i.test(lower)
        ? `I'm doing great, thanks for asking! How's your day going, and how can I help?`
        : /\bname\b/i.test(lower)
        ? `I'm the AI assistant for ${corporateIdentity.legalName}—you can just call me your DESTRIA AI assistant. What can I help you with today?`
        : `I'm an AI assistant for ${corporateIdentity.legalName}, so I don't have personal human traits like an age, home, or family—but I'm always happy to chat or help with whatever you're curious about!`;
      return {
        aiMessage: {
          id: msgId,
          sender: 'ai',
          text: personalText,
          timestamp: now,
          quickReplies: [],
        },
        updatedState,
        sessionId: activeChatSessionId,
      };
    }

    const localMatches = looksLikeEnterpriseQuery
      ? matchCatalogLocally(
          `${trimmed} ${updatedState.requirements.category} ${updatedState.requirements.businessProblem}`,
          3
        )
      : [];

    if (updatedState.currentStage === 'brief_ready' && looksLikeEnterpriseQuery) {
      updatedState.generatedBrief = synthesizeBriefFromState(
        updatedState,
        localMatches.map((m) => m.id)
      );
      return {
        aiMessage: {
          id: msgId,
          sender: 'ai',
          text: `Thank you. I have prepared a preliminary Project Requirements Brief (Ref: ${updatedState.generatedBrief.referenceCode}). ${COMMERCIAL_ENGAGEMENT_STATEMENT} Would you like to review your brief or schedule an initial consultation?`,
          timestamp: now,
          stage: 'brief',
          recommendedServiceIds: localMatches.map((m) => m.id),
          suggestedAction: 'review_brief',
          quickReplies: ['Review Project Brief', 'Request an Enterprise Consultation', 'Direct Solutions Contact'],
        },
        updatedState,
        sessionId: activeChatSessionId,
      };
    }

    if (localMatches.length > 0) {
      const matchText = `Aligned customized enterprise solution frameworks from ${corporateIdentity.legalName}:\n${localMatches
        .map((m) => `• ${m.title} — ${formatCatalogEngagement(m).primaryLabel} (${formatCatalogEngagement(m).secondaryLabel})`)
        .join('\n')}\n\nWould you like to discuss any of these in more detail or coordinate a technical consultation?`;

      return {
        aiMessage: {
          id: msgId,
          sender: 'ai',
          text: matchText,
          timestamp: now,
          stage: 'recommendation',
          recommendedServiceIds: localMatches.map((m) => m.id),
          quickReplies: [
            'Review Project Brief',
            'Request an Enterprise Consultation',
            'Direct Solutions Contact',
          ],
        },
        updatedState,
        sessionId: activeChatSessionId,
      };
    }

    const recoveryText = language.startsWith('fil')
      ? 'Paumanhin, naputol saglit ang koneksyon. Pwede mo bang ulitin ang huling bahagi?'
      : language.startsWith('es')
      ? 'Disculpa, la conexión se interrumpió un momento. ¿Podrías repetir la última parte?'
      : language.startsWith('fr')
      ? 'Désolé, la connexion a été interrompue un instant. Pourriez-vous répéter la dernière partie ?'
      : 'Sorry, the connection dropped for a moment. Could you repeat the last part?';

    return {
      aiMessage: {
        id: msgId,
        sender: 'ai',
        text: recoveryText,
        timestamp: now,
        quickReplies: [],
      },
      updatedState,
      sessionId: activeChatSessionId,
    };
  },
};
