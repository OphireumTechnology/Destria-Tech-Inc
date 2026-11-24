import { SERVICE_CATALOG, CATALOG_CATEGORIES, formatCatalogEngagement } from '../data/serviceCatalog';
import { corporateIdentity, COMMERCIAL_ENGAGEMENT_STATEMENT } from '../data/companyConfig';
import { ProjectBrief, ClientProfile, ProjectRequirements } from './supabaseService';
import { apiUrl } from '../lib/apiClient';

export interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
  stage?: 'welcome' | 'category' | 'details' | 'recommendation' | 'brief' | 'schedule';
  quickReplies?: string[];
  recommendedServiceIds?: string[];
  suggestedAction?: 'review_brief' | 'schedule_meeting' | 'talk_to_human';
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
  return null;
}

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
      fullName: state.client.fullName || 'Prospective Enterprise Client',
      email: state.client.email || 'client@organization.com',
      phone: state.client.phone || corporateIdentity.contact.telephone.display,
      companyName: state.client.companyName || 'Client Organization',
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

export const aiConsultantService = {
  async processUserMessage(
    userMessage: string,
    state: ConsultationState,
    conversationHistory: ChatMessage[],
    language: 'en-US' | 'fil-PH' = 'en-US'
  ): Promise<{ aiMessage: ChatMessage; updatedState: ConsultationState }> {
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

    if (updatedState.currentStage === 'welcome') {
      const matchedCat =
        CATALOG_CATEGORIES.find(
          (c) =>
            c.id !== 'all' &&
            (trimmed.toLowerCase().includes(c.label.toLowerCase()) ||
              trimmed.toLowerCase().includes(c.shortLabel.toLowerCase()))
        )?.label || trimmed;
      updatedState.requirements.category = matchedCat;
      updatedState.currentStage = 'problem';
    } else if (updatedState.currentStage === 'problem') {
      updatedState.requirements.businessProblem = trimmed;
      updatedState.currentStage = 'features';
    } else if (updatedState.currentStage === 'features') {
      updatedState.requirements.keyFeatures = trimmed
        .split(/,|\n| and /)
        .map((f) => f.trim())
        .filter(Boolean);
      updatedState.currentStage = 'client_info';
    } else if (updatedState.currentStage === 'client_info') {
      const emailMatch = trimmed.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) updatedState.client.email = emailMatch[0];
      const parts = trimmed.split(/[,\n-]/).map((s) => s.trim());
      if (parts[0] && !updatedState.client.fullName) {
        updatedState.client.fullName = parts[0].replace(/my name is/i, '').replace(/i am/i, '').trim();
      }
      if (parts[1] && !updatedState.client.companyName) {
        updatedState.client.companyName = parts[1].replace(/company is/i, '').replace(/at/i, '').trim();
      }
      updatedState.currentStage = 'brief_ready';
    }

    try {
      const response = await fetch(apiUrl('/api/consultant/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: trimmed.slice(0, 1500),
          stateContext: {
            category: updatedState.requirements.category,
            businessProblem: updatedState.requirements.businessProblem,
            currentStage: updatedState.currentStage,
          },
          conversationHistory: conversationHistory.slice(-8).map((m) => ({
            sender: m.sender,
            text: m.text.slice(0, 1200),
          })),
          language,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const recommendedIds: string[] = Array.isArray(data.recommendedServiceIds)
          ? data.recommendedServiceIds
          : [];

        if (
          updatedState.currentStage === 'brief_ready' ||
          data.suggestedAction === 'review_brief'
        ) {
          updatedState.generatedBrief = synthesizeBriefFromState(updatedState, recommendedIds);
          updatedState.currentStage = 'brief_ready';
        }

        return {
          aiMessage: {
            id: msgId,
            sender: 'ai',
            text: data.replyText,
            timestamp: now,
            recommendedServiceIds: recommendedIds,
            suggestedAction: data.suggestedAction,
            quickReplies: Array.isArray(data.quickReplies)
              ? data.quickReplies
              : ['Review Project Brief', 'Request an Enterprise Consultation'],
          },
          updatedState,
        };
      }
    } catch (err) {
      console.warn('[DESTRIA] Falling back to local corporate solutions engine:', err);
    }

    // Offline Commercial Policy Guardrail
    const policyReply = getOfflineCommercialPolicyReply(trimmed);
    if (policyReply) {
      return {
        aiMessage: {
          id: msgId,
          sender: 'ai',
          text: policyReply,
          timestamp: now,
          suggestedAction: 'schedule_meeting',
          quickReplies: ['Request an Enterprise Consultation', 'Direct Solutions Contact'],
        },
        updatedState,
      };
    }

    const localMatches = matchCatalogLocally(
      `${trimmed} ${updatedState.requirements.category} ${updatedState.requirements.businessProblem}`,
      3
    );

    if (updatedState.currentStage === 'brief_ready') {
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
      };
    }

    const matchText =
      localMatches.length > 0
        ? `Aligned customized enterprise solution frameworks from ${corporateIdentity.legalName}:\n${localMatches
            .map((m) => `• ${m.title} — ${formatCatalogEngagement(m).primaryLabel} (${formatCatalogEngagement(m).secondaryLabel})`)
            .join('\n')}\n\nTo prepare for a formal technical assessment, what target timeline and enterprise integrations does your organization require?`
        : `Thank you for contacting ${corporateIdentity.legalName}. To prepare a customized solution assessment across our 10 technology divisions, please share your operational objectives, target users, and required integrations. You may also reach us directly at ${corporateIdentity.contact.telephone.display} or ${corporateIdentity.contact.email}.`;

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
    };
  },
};
