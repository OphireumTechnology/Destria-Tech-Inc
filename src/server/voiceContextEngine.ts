import crypto from 'crypto';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  CATALOG_CATEGORIES,
  CATALOG_DIVISION_SUMMARIES,
  SERVICE_CATALOG,
} from '../data/serviceCatalog';
import { corporateIdentity } from '../data/companyConfig';
import {
  MANDATORY_AI_SYSTEM_INSTRUCTION,
  classifyCommercialPolicyIntent,
  enforceCommercialPolicyOnOutput,
  formatTextForVoiceSpeech,
  sanitizeConversationHistory,
} from './aiCommercialPolicy';

const CATALOG_SUMMARY_FOR_AI = CATALOG_CATEGORIES.filter((c) => c.id !== 'all')
  .map((c) => {
    const items = SERVICE_CATALOG.filter((s) => s.categoryId === c.id)
      .slice(0, 6)
      .map((s) => s.title)
      .join(', ');
    return `${c.number}. ${c.label}: ${items}`;
  })
  .join('\n');

export interface VoiceDiscoveryContext {
  sessionId?: string;
  selectedService?: string;
  category?: string;
  businessProblem?: string;
  currentStage?: string;
  executivePreference?: 'ceo' | 'cto' | 'advisory';
  presentedOptions?: string[];
  keyFeatures?: string[];
}

export interface VoiceSessionRecord {
  sessionId: string;
  language: string;
  createdAt: string;
  lastActivityAt: number;
  turnCount: number;
  context: VoiceDiscoveryContext;
  history: Array<{ sender: 'user' | 'ai'; text: string }>;
}

export interface VoiceTurnResult {
  sessionId: string;
  replyText: string;
  spokenText: string;
  policyEnforced: boolean;
  detectedIntent: {
    isBookingIntent: boolean;
    requiresBookingConfirmation: boolean;
    isBriefIntent: boolean;
    isHumanEscalation: boolean;
    executivePreference?: 'ceo' | 'cto' | 'advisory';
  };
  updatedContext: VoiceDiscoveryContext;
  recommendedServiceIds: string[];
  quickReplies: string[];
  provider: string;
  aiLatencyMs: number;
  language: string;
  timestamp: string;
}

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_ACTIVE_SESSIONS = 500;

export class VoiceSessionStore {
  private readonly sessions = new Map<string, VoiceSessionRecord>();

  private pruneExpired() {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastActivityAt > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
    while (this.sessions.size > MAX_ACTIVE_SESSIONS) {
      const oldestKey = this.sessions.keys().next().value;
      if (!oldestKey) break;
      this.sessions.delete(oldestKey);
    }
  }

  public createSession(language = 'en-US', initialContext?: VoiceDiscoveryContext): VoiceSessionRecord {
    this.pruneExpired();
    const sessionId = `dti-voice-${crypto.randomUUID()}`;
    const record: VoiceSessionRecord = {
      sessionId,
      language,
      createdAt: new Date().toISOString(),
      lastActivityAt: Date.now(),
      turnCount: 0,
      context: {
        sessionId,
        currentStage: initialContext?.currentStage || 'welcome',
        selectedService: initialContext?.selectedService,
        category: initialContext?.category,
        businessProblem: initialContext?.businessProblem,
        executivePreference: initialContext?.executivePreference,
        presentedOptions: initialContext?.presentedOptions ? [...initialContext.presentedOptions] : [],
        keyFeatures: initialContext?.keyFeatures ? [...initialContext.keyFeatures] : [],
      },
      history: [],
    };
    this.sessions.set(sessionId, record);
    return record;
  }

  public getOrCreateSession(sessionId?: string, language = 'en-US'): VoiceSessionRecord {
    this.pruneExpired();
    if (sessionId && this.sessions.has(sessionId)) {
      const existing = this.sessions.get(sessionId)!;
      existing.lastActivityAt = Date.now();
      if (language) existing.language = language;
      return existing;
    }
    const created = this.createSession(language);
    if (sessionId && /^dti-voice-[a-zA-Z0-9_-]{6,64}$/.test(sessionId)) {
      this.sessions.delete(created.sessionId);
      created.sessionId = sessionId;
      created.context.sessionId = sessionId;
      this.sessions.set(sessionId, created);
    }
    return created;
  }

  public getSession(sessionId: string): VoiceSessionRecord | null {
    this.pruneExpired();
    return this.sessions.get(sessionId) || null;
  }

  public deleteSession(sessionId: string) {
    this.sessions.delete(sessionId);
  }
}

/**
 * Extracts explicit options presented in an AI utterance (e.g.
 * "Would you like to discuss website development, AI automation, or blockchain solutions?")
 * so follow-ups like "Which one?" or "The first option" resolve deterministically.
 */
export function extractPresentedOptionsFromText(aiText: string): string[] {
  const normalized = aiText.replace(/\s+/g, ' ').trim();
  const listPattern =
    /(?:discuss|explore|focus on|consider|prefer|options?(?:\s+are|\s+include)?|such as|including|between)\s+([^?.!]{10,180})/i;
  const match = normalized.match(listPattern);
  if (!match) return [];
  const rawSegment = match[1];
  const parts = rawSegment
    .split(/,\s*(?:or\s+|and\s+)?|\s+or\s+/i)
    .map((part) => part.replace(/^(?:a|an|the)\s+/i, '').trim())
    .filter((part) => part.length >= 3 && part.length <= 60);
  if (parts.length >= 2) {
    return parts.slice(0, 4);
  }
  return [];
}

/**
 * Finds catalog matches using both the current utterance and recent conversation context.
 */
function matchCatalogServices(query: string, limit = 3) {
  const q = query.toLowerCase();
  const keywordBoosts: Array<{ pattern: RegExp; categoryHint: string }> = [
    { pattern: /\b(website|web\s*app|web\s*development|portal|landing\s*page|ecommerce|e-commerce)\b/i, categoryHint: 'web' },
    { pattern: /\b(ai|automation|agent|chatbot|voice|llm|workflow|machine\s*learning)\b/i, categoryHint: 'ai' },
    { pattern: /\b(blockchain|web3|smart\s*contract|ledger|token|crypto|defi)\b/i, categoryHint: 'blockchain' },
    { pattern: /\b(cloud|devops|cybersecurity|security|audit|infrastructure|soc|compliance)\b/i, categoryHint: 'cloud' },
    { pattern: /\b(mobile|ios|android|app\s*development|saas|erp|crm|custom\s*software)\b/i, categoryHint: 'software' },
  ];

  const tokens = q.split(/\W+/).filter((t) => t.length > 2);
  return SERVICE_CATALOG.map((svc) => {
    const haystack = `${svc.title} ${svc.shortDescription} ${svc.capabilities.join(' ')} ${svc.categoryId}`.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (svc.title.toLowerCase().includes(token)) score += 4;
      else if (haystack.includes(token)) score += 1;
    }
    for (const boost of keywordBoosts) {
      if (boost.pattern.test(q) && (svc.categoryId.toLowerCase().includes(boost.categoryHint) || haystack.includes(boost.categoryHint))) {
        score += 3;
      }
    }
    return { svc, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.svc);
}

/**
 * Deduplicates incoming conversation history against the current user message
 * so Gemini never receives the exact same user turn twice in a row.
 */
export function buildDeduplicatedHistory(
  serverHistory: Array<{ sender: 'user' | 'ai'; text: string }>,
  clientHistory: Array<{ sender: 'user' | 'ai'; text: string }>,
  currentUserMessage: string
): Array<{ sender: 'user' | 'ai'; text: string }> {
  const base = clientHistory.length >= serverHistory.length ? clientHistory : serverHistory;
  const sanitized = sanitizeConversationHistory(base);
  const trimmedCurrent = currentUserMessage.trim().toLowerCase();

  const deduped: Array<{ sender: 'user' | 'ai'; text: string }> = [];
  for (const turn of sanitized) {
    const cleaned = turn.text.replace(/^\[Voice Consultation\]:\s*"?|"?$/g, '').trim();
    if (!cleaned) continue;
    const prev = deduped[deduped.length - 1];
    if (prev && prev.sender === turn.sender && prev.text.toLowerCase() === cleaned.toLowerCase()) {
      continue;
    }
    deduped.push({ sender: turn.sender, text: cleaned });
  }

  // Drop trailing duplicate of the exact current user turn
  while (
    deduped.length > 0 &&
    deduped[deduped.length - 1].sender === 'user' &&
    deduped[deduped.length - 1].text.toLowerCase() === trimmedCurrent
  ) {
    deduped.pop();
  }

  return deduped.slice(-16);
}

function detectExecutivePreference(text: string): 'ceo' | 'cto' | 'advisory' | undefined {
  if (/\b(cto|chief\s+technology|leodenis|technical\s+architect|architecture\s+review)\b/i.test(text)) {
    return 'cto';
  }
  if (/\b(ceo|chief\s+executive|founder|desmond|executive\s+strategy)\b/i.test(text)) {
    return 'ceo';
  }
  if (/\b(advisory|solutions\s+desk|general\s+advisory)\b/i.test(text)) {
    return 'advisory';
  }
  return undefined;
}

/**
 * Determines whether the user is affirmatively asking to open the booking form
 * (without hijacking negative statements like "I don't want to book yet" or pure questions).
 */
export function detectAffirmativeBookingIntent(
  userMessage: string,
  lastAiMessage?: string
): { isBookingIntent: boolean; requiresBookingConfirmation: boolean } {
  const normalized = userMessage.trim().toLowerCase();
  const hasNegation = /\b(don't|do\s+not|not\s+yet|later|wait|before\s+we\s+book|no\s+thanks|no\b)\b/i.test(
    normalized
  );
  if (hasNegation) {
    return { isBookingIntent: false, requiresBookingConfirmation: false };
  }

  // Explicit direct command to schedule/book now
  const explicitSchedule =
    /\b(open|show|start|launch)\s+(the\s+)?(booking|scheduling|appointment|calendar)\b/i.test(normalized) ||
    /\b(book|schedule|set\s+up|arrange)\s+(a|an|my|the)?\s*(consultation|appointment|meeting|call|slot)\s*(now|today|please)?\b/i.test(
      normalized
    );
  if (explicitSchedule) {
    return { isBookingIntent: true, requiresBookingConfirmation: false };
  }

  // User affirmed a direct offer from the AI to open the scheduling form
  const isShortYes = /^(yes|yeah|yep|sure|please|please\s+do|go\s+ahead|sounds\s+good|let's\s+do\s+it|ok|okay)\.?$/i.test(
    normalized
  );
  if (
    isShortYes &&
    lastAiMessage &&
    /\b(open\s+the\s+.*(scheduling|booking|consultation)\s+form|schedule\s+(a|an|your)\s+(ceo|cto|executive|initial)?\s*consultation|book\s+a\s+slot)\b/i.test(
      lastAiMessage
    )
  ) {
    return { isBookingIntent: true, requiresBookingConfirmation: false };
  }

  // User expressed preference for CEO/CTO consultation -> confirm before opening/submitting
  if (/\b(prefer|want|would\s+like)\s+(the\s+|a\s+)?(ceo|cto|executive)\s+(consultation|call|meeting|briefing)\b/i.test(normalized)) {
    return { isBookingIntent: false, requiresBookingConfirmation: true };
  }

  return { isBookingIntent: false, requiresBookingConfirmation: false };
}

/**
 * Generates an intelligent, context-aware deterministic reply when Gemini API
 * is unavailable or times out. Strictly honors prior conversation history,
 * short follow-ups, option selection, and executive preferences.
 */
export function generateContextualFallbackReply(params: {
  userMessage: string;
  history: Array<{ sender: 'user' | 'ai'; text: string }>;
  context: VoiceDiscoveryContext;
  language: string;
}): {
  replyText: string;
  updatedContext: VoiceDiscoveryContext;
  recommendedServiceIds: string[];
  quickReplies: string[];
  isBookingIntent: boolean;
  requiresBookingConfirmation: boolean;
  isBriefIntent: boolean;
  isHumanEscalation: boolean;
} {
  const { userMessage, history, language } = params;
  const isFilipino = language.startsWith('fil');
  const normalized = userMessage.trim().toLowerCase();
  const nextContext: VoiceDiscoveryContext = {
    ...params.context,
    presentedOptions: [...(params.context.presentedOptions || [])],
    keyFeatures: [...(params.context.keyFeatures || [])],
  };

  const lastAiMessage = [...history].reverse().find((m) => m.sender === 'ai')?.text || '';
  const extractedFromLastAi = extractPresentedOptionsFromText(lastAiMessage);
  if (extractedFromLastAi.length >= 2) {
    nextContext.presentedOptions = extractedFromLastAi;
  }

  const execPref = detectExecutivePreference(userMessage);
  if (execPref) {
    nextContext.executivePreference = execPref;
  }

  const bookingCheck = detectAffirmativeBookingIntent(userMessage, lastAiMessage);
  const isBriefIntent = /\b(project\s+brief|review\s+brief|generate\s+brief|proposal\s+summary|scope\s+document)\b/i.test(
    normalized
  );
  const isHumanEscalation =
    /\b(speak\s+to\s+(a\s+)?human|talk\s+to\s+(a\s+)?human|call\s+executive|direct\s+contact|live\s+engineer)\b/i.test(
      normalized
    );

  // 1. User prefers CEO or CTO consultation (without forcing immediate submission)
  if (execPref && /\b(prefer|want|choose|pick|select|like)\b/i.test(normalized)) {
    const execName =
      execPref === 'cto'
        ? `${corporateIdentity.leadership.cto.name}, our Chief Technology Officer`
        : execPref === 'ceo'
        ? `${corporateIdentity.leadership.ceo.name}, our Founder and Chief Executive Officer`
        : 'our Enterprise Solutions Advisory team';
    const focusNote = nextContext.selectedService
      ? ` focused on ${nextContext.selectedService}`
      : '';
    nextContext.currentStage = 'scheduling';
    return {
      replyText: isFilipino
        ? `Naitala ko po ang inyong kagustuhan para sa consultation kasama si ${execName}${focusNote}. Nais po ba ninyong buksan ko na ang verified scheduling form ngayon, o may iba pa po kayong technical requirements na nais ibahagi muna?`
        : `I have noted your preference for a consultation with ${execName}${focusNote}. Would you like me to open the verified consultation scheduling form now, or would you like to discuss any additional technical requirements first?`,
      updatedContext: nextContext,
      recommendedServiceIds: [],
      quickReplies: ['Open Scheduling Form', 'Discuss Requirements First', 'Review Project Brief'],
      isBookingIntent: bookingCheck.isBookingIntent,
      requiresBookingConfirmation: true,
      isBriefIntent: false,
      isHumanEscalation: false,
    };
  }

  // 2. Affirmative scheduling request
  if (bookingCheck.isBookingIntent) {
    nextContext.currentStage = 'scheduling';
    const execHint =
      nextContext.executivePreference === 'cto'
        ? ` with ${corporateIdentity.leadership.cto.name} (CTO)`
        : nextContext.executivePreference === 'ceo'
        ? ` with ${corporateIdentity.leadership.ceo.name} (CEO)`
        : '';
    return {
      replyText: isFilipino
        ? `Sige po, binubuksan ko na ang verified consultation scheduling form${execHint} upang mapili ninyo ang inyong nais na petsa at oras at makumpirma ang inyong contact details.`
        : `Certainly. I am opening the verified consultation scheduling form${execHint} now so you can select your preferred date and time and confirm your contact details directly.`,
      updatedContext: nextContext,
      recommendedServiceIds: [],
      quickReplies: ['Review Project Brief', 'Direct Solutions Contact'],
      isBookingIntent: true,
      requiresBookingConfirmation: false,
      isBriefIntent: false,
      isHumanEscalation: false,
    };
  }

  // 3. Short follow-up: "Which one would you recommend?" / "Which one?"
  if (/\b(which\s+one|what\s+(would|do)\s+you\s+recommend|which\s+option|recommend\s+one)\b/i.test(normalized)) {
    const options = nextContext.presentedOptions || [];
    if (options.length >= 2) {
      const joined = options.slice(0, 3).join(', ');
      return {
        replyText: isFilipino
          ? `Nakadepende po iyan sa pangunahing layunin ng inyong negosyo sa pagitan ng ${joined}. Ang priority po ba ninyo ngayon ay makahikayat ng mas maraming customer, mag-automate ng internal operations, o magdagdag ng transaction transparency?`
          : `That depends on your primary business priority across ${joined}. May I ask whether your main focus right now is attracting customers, automating operations, or improving transaction transparency?`,
        updatedContext: nextContext,
        recommendedServiceIds: [],
        quickReplies: options.slice(0, 3),
        isBookingIntent: false,
        requiresBookingConfirmation: false,
        isBriefIntent: false,
        isHumanEscalation: false,
      };
    }
    return {
      replyText: isFilipino
        ? 'Nakadepende po iyan sa inyong kasalukuyang business priority. Ang pangunahing layunin po ba ninyo ay bagong customer-facing web platform, AI workflow automation, o secure enterprise software architecture?'
        : 'That depends on your core business objective. Is your immediate priority launching a customer-facing web platform, automating internal workflows with AI, or modernizing enterprise software and cloud security?',
      updatedContext: {
        ...nextContext,
        presentedOptions: ['website development', 'AI automation', 'enterprise software architecture'],
      },
      recommendedServiceIds: [],
      quickReplies: ['Website Development', 'AI Automation', 'Enterprise Software'],
      isBookingIntent: false,
      requiresBookingConfirmation: false,
      isBriefIntent: false,
      isHumanEscalation: false,
    };
  }

  // 4. Ordinal option selection ("The first option", "Second one", "Third")
  const ordinalMatch = normalized.match(/\b(first|1st|one|second|2nd|two|third|3rd|three)\s*(option|one|choice)?\b/i);
  if (
    ordinalMatch &&
    (nextContext.presentedOptions?.length || 0) >= 2 &&
    normalized.split(/\s+/).length <= 7
  ) {
    const word = ordinalMatch[1].toLowerCase();
    const index =
      word === 'first' || word === '1st' || word === 'one'
        ? 0
        : word === 'second' || word === '2nd' || word === 'two'
        ? 1
        : 2;
    const chosen = nextContext.presentedOptions?.[index] || nextContext.presentedOptions?.[0];
    if (chosen) {
      nextContext.selectedService = chosen;
      nextContext.category = chosen;
      nextContext.currentStage = 'problem';
      const matches = matchCatalogServices(chosen, 2);
      return {
        replyText: isFilipino
          ? `Napakagandang pili po ng ${chosen}. Sa ${corporateIdentity.legalName}, dinidisenyo namin ito nang customized para sa inyong operations. Ano po ang pangunahing problema o goal na nais ninyong maresolba sa ${chosen}?`
          : `Excellent choice focusing on ${chosen}. At ${corporateIdentity.legalName}, we architect customized ${chosen} solutions around your exact operational requirements. What primary business outcome or workflow challenge would you like this initiative to solve first?`,
        updatedContext: nextContext,
        recommendedServiceIds: matches.map((m) => m.id),
        quickReplies: ['Tell me how it works', 'Discuss integrations', 'Schedule CTO Consultation'],
        isBookingIntent: false,
        requiresBookingConfirmation: false,
        isBriefIntent: false,
        isHumanEscalation: false,
      };
    }
  }

  // 5. Short elaborative follow-up ("Tell me more", "How does it work?", "Explain that")
  if (
    /^(tell\s+me\s+more|more\s+details?|how\s+does\s+(it|that|this)\s+work|can\s+you\s+explain|explain\s+(more|that|further)|what\s+does\s+that\s+include)\??\.?$/i.test(
      normalized
    )
  ) {
    const activeTopic =
      nextContext.selectedService ||
      nextContext.category ||
      (nextContext.presentedOptions?.length ? nextContext.presentedOptions[0] : 'customized enterprise technology architecture');
    const matches = matchCatalogServices(activeTopic, 2);
    const primarySvc = matches[0];
    if (primarySvc) {
      return {
        replyText: isFilipino
          ? `Para sa ${primarySvc.title}, nagsisimula kami sa technical discovery at architecture blueprint, kasunod ng customized engineering, security hardening, at integration testing. Kabilang sa core capabilities nito ang ${primarySvc.capabilities.slice(0, 2).join(' at ')}. May mga kasalukuyan po ba kayong system na kailangang i-integrate?`
          : `For ${primarySvc.title}, our engagement begins with technical discovery and architecture design, followed by customized engineering, security hardening, and staged deployment. Key capabilities include ${primarySvc.capabilities.slice(0, 2).join(' and ')}. Do you have existing systems or third-party tools that need to connect with it?`,
        updatedContext: {
          ...nextContext,
          selectedService: primarySvc.title,
          currentStage: nextContext.currentStage === 'welcome' ? 'features' : nextContext.currentStage,
        },
        recommendedServiceIds: matches.map((m) => m.id),
        quickReplies: ['We use existing CRM/ERP', 'Starting from scratch', 'Schedule CTO Consultation'],
        isBookingIntent: false,
        requiresBookingConfirmation: false,
        isBriefIntent: false,
        isHumanEscalation: false,
      };
    }
    return {
      replyText: isFilipino
        ? `Sa ${activeTopic}, nagsisimula ang ${corporateIdentity.legalName} sa discovery assessment upang tukuyin ang architecture, security standards, at integration requirements bago maghanda ng formal proposal. Aling bahagi po ng workflow ninyo ang nais ninyong unahin?`
        : `With ${activeTopic}, ${corporateIdentity.legalName} begins with a structured technical assessment to map your architecture, security requirements, and system integrations before preparing a formal customized proposal. Which part of your current workflow would you like to improve first?`,
      updatedContext: nextContext,
      recommendedServiceIds: [],
      quickReplies: ['Customer Experience', 'Internal Automation', 'System Integrations'],
      isBookingIntent: false,
      requiresBookingConfirmation: false,
      isBriefIntent: false,
      isHumanEscalation: false,
    };
  }

  // 6. Short affirmative / negative conversational continuations ("Yes.", "No.")
  if (/^(yes|yeah|yep|correct|exactly|sure|right)\.?$/i.test(normalized)) {
    if (/brief|proposal/i.test(lastAiMessage)) {
      return {
        replyText: isFilipino
          ? 'Sige po, ihahanda ko ang inyong preliminary Project Requirements Brief. Maaari po ba ninyong ibahagi ang inyong target timeline o nais na integrations upang maisama natin ito?'
          : 'Great, I can prepare your preliminary Project Requirements Brief. Before we finalize it, what target delivery timeline or key system integrations should we include?',
        updatedContext: { ...nextContext, currentStage: 'features' },
        recommendedServiceIds: [],
        quickReplies: ['Review Project Brief', 'Schedule Consultation'],
        isBookingIntent: false,
        requiresBookingConfirmation: false,
        isBriefIntent: true,
        isHumanEscalation: false,
      };
    }
    if (/integrat|existing\s+system|crm|erp/i.test(lastAiMessage)) {
      return {
        replyText: isFilipino
          ? 'Mainam po. Aling kasalukuyang platforms o databases ang ginagamit ng inyong team ngayon, tulad ng CRM, ERP, o payment systems?'
          : 'Understood. Which existing platforms or data sources does your organization rely on today, such as your CRM, ERP, or internal APIs?',
        updatedContext: { ...nextContext, currentStage: 'features' },
        recommendedServiceIds: [],
        quickReplies: ['CRM & Sales Systems', 'ERP & Operations', 'Custom Internal APIs'],
        isBookingIntent: false,
        requiresBookingConfirmation: false,
        isBriefIntent: false,
        isHumanEscalation: false,
      };
    }
    return {
      replyText: isFilipino
        ? `Sige po, ituloy natin ang ${nextContext.selectedService || 'inyong technology scope'}. Sino po ang pangunahing gagamit ng system at ano ang pinakamahalagang feature na kailangan ninyo sa unang phase?`
        : `Sounds good. Continuing with ${nextContext.selectedService || 'your initiative'}, who are the primary users and what is the most important capability you want in the first phase?`,
      updatedContext: {
        ...nextContext,
        currentStage: nextContext.currentStage === 'welcome' ? 'problem' : 'features',
      },
      recommendedServiceIds: [],
      quickReplies: ['Tell me more', 'Review Project Brief', 'Schedule Consultation'],
      isBookingIntent: false,
      requiresBookingConfirmation: false,
      isBriefIntent: false,
      isHumanEscalation: false,
    };
  }

  if (/^(no|nope|not\s+yet|not\s+really|none)\.?$/i.test(normalized)) {
    return {
      replyText: isFilipino
        ? 'Walang problema po. Magpatuloy lang tayo sa inyong pacing. Ano pong aspeto ng architecture, features, o delivery process ang nais ninyong tanungin susunod?'
        : 'No problem at all, we can take this at your pace. What aspect of the technical architecture, capabilities, or delivery process would you like to explore next?',
      updatedContext: nextContext,
      recommendedServiceIds: [],
      quickReplies: ['How does it work?', 'Explore Solution Divisions', 'CTO Consultation'],
      isBookingIntent: false,
      requiresBookingConfirmation: false,
      isBriefIntent: false,
      isHumanEscalation: false,
    };
  }

  // 7. Catalog-matched specific domain answer (e.g., "I need a website", "AI automation", "blockchain")
  const matched = matchCatalogServices(`${userMessage} ${nextContext.selectedService || ''}`, 2);
  if (matched.length > 0) {
    const primary = matched[0];
    nextContext.selectedService = primary.title;
    nextContext.category = primary.title;
    if (!nextContext.businessProblem && userMessage.length > 12) {
      nextContext.businessProblem = userMessage;
    }
    nextContext.currentStage = nextContext.currentStage === 'welcome' ? 'problem' : 'features';
    return {
      replyText: isFilipino
        ? `Para sa inyong pangangailangan, ang ${primary.title} ng ${corporateIdentity.legalName} ay maaaring i-customize ayon sa inyong workflow at security standards. Ano po ang pangunahing functionality o user experience na nais ninyong unahin para dito?`
        : `For that requirement, ${corporateIdentity.legalName} can architect a customized ${primary.title} solution tailored to your workflows and security standards. What primary features or user journeys are most important for your team to launch first?`,
      updatedContext: nextContext,
      recommendedServiceIds: matched.map((m) => m.id),
      quickReplies: ['How does it work?', 'Discuss integrations', 'Schedule CTO Consultation'],
      isBookingIntent: false,
      requiresBookingConfirmation: false,
      isBriefIntent,
      isHumanEscalation,
    };
  }

  // 8. Contextual discovery continuation (never repeating robotic static closing boilerplate)
  if (!nextContext.businessProblem) {
    nextContext.businessProblem = userMessage;
  }
  const activeFocus = nextContext.selectedService || nextContext.category;
  return {
    replyText: activeFocus
      ? isFilipino
        ? `Naintindihan ko po iyon para sa ${activeFocus}. Upang mas mailinya ko ang rekomendasyon, gaano po kalawak ang user base ninyo at may mga kasalukuyang system bang kailangang ikonekta?`
        : `Thank you for clarifying that for ${activeFocus}. To tailor the right architecture recommendation, roughly who will be using the system and are there existing tools we should integrate with?`
      : isFilipino
        ? `Naintindihan ko po. Sa ${corporateIdentity.legalName}, nagde-develop kami ng website development, AI automation, enterprise software, at blockchain solutions. Alin po sa mga ito ang pinakamalapit sa layunin ng inyong organisasyon ngayon?`
        : `Understood. At ${corporateIdentity.legalName}, we specialize in website development, AI automation, custom enterprise software, and blockchain solutions. Which of those areas aligns closest with your organization's immediate priority?`,
    updatedContext: activeFocus
      ? nextContext
      : {
          ...nextContext,
          presentedOptions: [
            'website development',
            'AI automation',
            'custom enterprise software',
            'blockchain solutions',
          ],
        },
    recommendedServiceIds: [],
    quickReplies: activeFocus
      ? ['Tell me more', 'Review Project Brief', 'Schedule Consultation']
      : ['Website Development', 'AI Automation', 'Blockchain Solutions'],
    isBookingIntent: false,
    requiresBookingConfirmation: false,
    isBriefIntent,
    isHumanEscalation,
  };
}

/**
 * Primary server-side voice conversational turn processor.
 * Combines commercial policy enforcement, persistent multi-turn session state,
 * low-latency Gemini 4 Hydrogen inference (ThinkingLevel.LOW), and context-aware fallback.
 */
export async function processVoiceConversationTurn(params: {
  ai: GoogleGenAI | null;
  sessionStore: VoiceSessionStore;
  sessionId?: string;
  userMessage: string;
  language: string;
  clientHistory: Array<{ sender: 'user' | 'ai'; text: string }>;
  stateContext?: VoiceDiscoveryContext;
  onPolicyAudit?: (trigger: string, reason?: string) => Promise<void>;
}): Promise<VoiceTurnResult> {
  const startedAt = Date.now();
  const { ai, sessionStore, userMessage, language, clientHistory, stateContext, onPolicyAudit } = params;
  const session = sessionStore.getOrCreateSession(params.sessionId, language);

  // Merge incoming client context safely without erasing remembered session state
  if (stateContext) {
    if (stateContext.selectedService) session.context.selectedService = stateContext.selectedService;
    if (stateContext.category) session.context.category = stateContext.category;
    if (stateContext.businessProblem) session.context.businessProblem = stateContext.businessProblem;
    if (stateContext.currentStage) session.context.currentStage = stateContext.currentStage;
    if (stateContext.executivePreference) session.context.executivePreference = stateContext.executivePreference;
    if (stateContext.presentedOptions && stateContext.presentedOptions.length > 0) {
      session.context.presentedOptions = stateContext.presentedOptions.slice(0, 5);
    }
    if (stateContext.keyFeatures && stateContext.keyFeatures.length > 0) {
      session.context.keyFeatures = stateContext.keyFeatures.slice(0, 10);
    }
  }

  const execPref = detectExecutivePreference(userMessage);
  if (execPref) {
    session.context.executivePreference = execPref;
  }

  const dedupedHistory: Array<{ sender: 'user' | 'ai'; text: string }> = buildDeduplicatedHistory(
    session.history,
    clientHistory,
    userMessage
  );
  const lastAiMessage = [...dedupedHistory].reverse().find((m) => m.sender === 'ai')?.text || '';
  const extractedOptions = extractPresentedOptionsFromText(lastAiMessage);
  if (extractedOptions.length >= 2) {
    session.context.presentedOptions = extractedOptions;
  }

  // 1. Authoritative Commercial Policy & Corporate Identity Guardrail Check
  const policyDecision = classifyCommercialPolicyIntent(userMessage);
  if (policyDecision.approvedResponse) {
    if (policyDecision.isPricingRestricted && onPolicyAudit) {
      await onPolicyAudit(String(policyDecision.trigger || 'pricing')).catch(() => {});
    }

    const replyText = policyDecision.approvedResponse;
    session.history = [
      ...dedupedHistory,
      { sender: 'user' as const, text: userMessage },
      { sender: 'ai' as const, text: replyText },
    ].slice(-24);
    session.turnCount += 1;
    session.lastActivityAt = Date.now();

    const bookingCheck = detectAffirmativeBookingIntent(userMessage, lastAiMessage);
    return {
      sessionId: session.sessionId,
      replyText,
      spokenText: formatTextForVoiceSpeech(replyText),
      policyEnforced: policyDecision.isPricingRestricted,
      detectedIntent: {
        isBookingIntent:
          bookingCheck.isBookingIntent || policyDecision.trigger === 'consultation',
        requiresBookingConfirmation: bookingCheck.requiresBookingConfirmation,
        isBriefIntent: /\b(brief|proposal|scope|requirements)\b/i.test(userMessage),
        isHumanEscalation:
          policyDecision.suggestedAction === 'talk_to_human' ||
          /\b(speak\s+to\s+(a\s+)?human|call\s+(the\s+)?executive|solutions\s+architect|phone|telephone)\b/i.test(
            userMessage
          ),
        executivePreference: session.context.executivePreference,
      },
      updatedContext: { ...session.context },
      recommendedServiceIds: [],
      quickReplies: policyDecision.quickReplies,
      provider: 'DESTRIA Corporate Governance Policy Engine',
      aiLatencyMs: Date.now() - startedAt,
      language,
      timestamp: new Date().toISOString(),
    };
  }

  const isFilipino = language.startsWith('fil');
  const bookingCheck = detectAffirmativeBookingIntent(userMessage, lastAiMessage);

  // 2. Live Gemini 4 Hydrogen multi-turn voice reasoning with LOW thinking latency
  if (ai) {
    try {
      const contextSummary = [
        `Session ID: ${session.sessionId}`,
        `Turn Number: ${session.turnCount + 1}`,
        `Discovery Stage: ${session.context.currentStage || 'welcome'}`,
        `Selected Service/Topic: ${session.context.selectedService || session.context.category || 'Not yet selected'}`,
        `Captured Business Problem: ${session.context.businessProblem || 'Not yet captured'}`,
        `Executive Consultation Preference: ${session.context.executivePreference || 'None stated'}`,
        `Previously Presented Options: ${
          session.context.presentedOptions && session.context.presentedOptions.length > 0
            ? session.context.presentedOptions.join(' | ')
            : 'None'
        }`,
      ].join('\n');

      const systemInstruction = `${MANDATORY_AI_SYSTEM_INSTRUCTION}

ACTIVE VOICE CONVERSATION STATE:
${contextSummary}

OFFICIAL 10-CATEGORY ENTERPRISE TECHNOLOGY DIVISIONS (CUSTOMIZED SOLUTIONS — ZERO PUBLIC PRICING):
${CATALOG_DIVISION_SUMMARIES.map((d) => `${Number(d.number)}. ${d.label} (${d.count} frameworks)`).join('\n')}

CATALOG REFERENCE:
${CATALOG_SUMMARY_FOR_AI.slice(0, 3500)}

NATURAL TWO-WAY VOICE CONVERSATION RULES:
- You are engaged in a continuous, natural, two-way executive voice conversation.
- ALWAYS interpret the user's latest utterance in direct relation to the preceding conversation history and previously presented options.
- Handle short answers intelligently ("Yes", "No", "Which one?", "The first option", "Tell me more", "How does it work?", "I prefer the CTO consultation").
- Do NOT repeatedly push generic project brief or consultation scheduling boilerplate on every turn. Continue natural discovery and answer follow-up questions thoroughly before offering scheduling.
- Obtain explicit confirmation before opening forms or submitting personal contact information.
- Keep spoken responses crisp and natural: 2 to 3 clear spoken sentences, zero markdown, zero bullets, zero asterisks, zero JSON.
- Respond in ${isFilipino ? 'natural, respectful Filipino/Taglish as appropriate' : 'clear, warm, neutral American executive English'}.`;

      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = dedupedHistory.map(
        (turn) => ({
          role: turn.sender === 'user' ? 'user' : 'model',
          parts: [{ text: turn.text }],
        })
      );
      contents.push({ role: 'user', parts: [{ text: userMessage }] });

      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini voice timeout')), 6500)
      );
      const geminiPromise = ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: contents as any,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const response: any = await Promise.race([geminiPromise, timeoutPromise]);
      const rawReply = typeof response?.text === 'string' ? response.text.trim() : '';

      if (rawReply) {
        const enforced = enforceCommercialPolicyOnOutput(rawReply, userMessage);
        if (enforced.enforced && onPolicyAudit) {
          await onPolicyAudit('output_blocked', enforced.reason).catch(() => {});
        }

        const newPresented = extractPresentedOptionsFromText(enforced.replyText);
        if (newPresented.length >= 2) {
          session.context.presentedOptions = newPresented;
        }
        const matched = matchCatalogServices(`${userMessage} ${enforced.replyText}`, 2);
        if (matched.length > 0 && !session.context.selectedService) {
          session.context.selectedService = matched[0].title;
        }

        session.history = [
          ...dedupedHistory,
          { sender: 'user' as const, text: userMessage },
          { sender: 'ai' as const, text: enforced.replyText },
        ].slice(-24);
        session.turnCount += 1;
        session.lastActivityAt = Date.now();

        return {
          sessionId: session.sessionId,
          replyText: enforced.replyText,
          spokenText: formatTextForVoiceSpeech(enforced.replyText),
          policyEnforced: enforced.enforced,
          detectedIntent: {
            isBookingIntent: bookingCheck.isBookingIntent,
            requiresBookingConfirmation: bookingCheck.requiresBookingConfirmation,
            isBriefIntent: /\b(project\s+brief|review\s+brief|proposal\s+summary)\b/i.test(userMessage),
            isHumanEscalation:
              /\b(speak\s+to\s+(a\s+)?human|call\s+(the\s+)?executive|solutions\s+architect|phone|telephone)\b/i.test(
                userMessage
              ),
            executivePreference: session.context.executivePreference,
          },
          updatedContext: { ...session.context },
          recommendedServiceIds: matched.map((m) => m.id),
          quickReplies:
            newPresented.length >= 2
              ? newPresented.slice(0, 3)
              : ['Tell me more', 'Review Project Brief', 'Schedule Consultation'],
          provider: 'gemini-4-hydrogen',
          aiLatencyMs: Date.now() - startedAt,
          language,
          timestamp: new Date().toISOString(),
        };
      }
    } catch {
      // Fall through cleanly to contextual deterministic fallback below
    }
  }

  // 3. Context-aware deterministic fallback (preserves full multi-turn coherence)
  const fallback = generateContextualFallbackReply({
    userMessage,
    history: dedupedHistory,
    context: session.context,
    language,
  });
  const enforcedFallback = enforceCommercialPolicyOnOutput(fallback.replyText, userMessage);

  session.context = fallback.updatedContext;
  const fallbackOptions = extractPresentedOptionsFromText(enforcedFallback.replyText);
  if (fallbackOptions.length >= 2) {
    session.context.presentedOptions = fallbackOptions;
  }
  session.history = [
    ...dedupedHistory,
    { sender: 'user' as const, text: userMessage },
    { sender: 'ai' as const, text: enforcedFallback.replyText },
  ].slice(-24);
  session.turnCount += 1;
  session.lastActivityAt = Date.now();

  return {
    sessionId: session.sessionId,
    replyText: enforcedFallback.replyText,
    spokenText: formatTextForVoiceSpeech(enforcedFallback.replyText),
    policyEnforced: enforcedFallback.enforced,
    detectedIntent: {
      isBookingIntent: fallback.isBookingIntent,
      requiresBookingConfirmation: fallback.requiresBookingConfirmation,
      isBriefIntent: fallback.isBriefIntent,
      isHumanEscalation: fallback.isHumanEscalation,
      executivePreference: session.context.executivePreference,
    },
    updatedContext: { ...session.context },
    recommendedServiceIds: fallback.recommendedServiceIds,
    quickReplies: fallback.quickReplies,
    provider: 'DESTRIA Contextual Voice Engine',
    aiLatencyMs: Date.now() - startedAt,
    language,
    timestamp: new Date().toISOString(),
  };
}
