import crypto from 'crypto';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  CATALOG_CATEGORIES,
  CATALOG_DIVISION_SUMMARIES,
  SERVICE_CATALOG,
} from '../data/serviceCatalog';
import { corporateIdentity } from '../data/companyConfig';
import {
  CORPORATE_KNOWLEDGE_VERSION,
  formatGroundedKnowledgeBlock,
  retrieveCorporateKnowledge,
} from '../data/corporateKnowledgeBase';
import {
  CorporateResourceLink,
  MANDATORY_AI_SYSTEM_INSTRUCTION,
  classifyCommercialPolicyIntent,
  enforceCommercialPolicyOnOutput,
  formatTextForVoiceSpeech,
  sanitizeConversationHistory,
} from './aiCommercialPolicy';
import { AiRuntimeConfigRegistry, classifyGeminiProviderError } from './aiRuntimeConfig';
import { AIToolsExecutor, getGeminiFunctionDeclarations } from './aiToolsEngine';
import {
  buildDeterministicConversationalReply,
  buildNaturalGeminiContextBlock,
  classifyConversationalTurn,
} from './conversationalEngine';

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
  clientName?: string;
  clientEmail?: string;
  clientCompany?: string;
  targetTimeline?: string;
  preferredName?: string;
  preferredLanguage?: string;
  previousQuestions?: string[];
  discussedTopics?: string[];
  lastTopic?: string;
  userPreferences?: string[];
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
    isCorrection?: boolean;
    isClarificationNeeded?: boolean;
    executivePreference?: 'ceo' | 'cto' | 'advisory';
    recognizedIntentCategory?: string;
  };
  updatedContext: VoiceDiscoveryContext;
  recommendedServiceIds: string[];
  quickReplies: string[];
  resourceLinks?: CorporateResourceLink[];
  toolEvents?: Array<{ type: string; payload: Record<string, unknown> }>;
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
        clientName: initialContext?.clientName,
        clientEmail: initialContext?.clientEmail,
        clientCompany: initialContext?.clientCompany,
        targetTimeline: initialContext?.targetTimeline,
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
 * Normalizes conversational speech transcripts (strips filler words, Taglish particles,
 * spoken punctuation hesitation artifacts, and bounded phonetic brand variants while
 * preserving technical terms and unrelated words).
 */
export function normalizeSpokenUtterance(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^(?:uh+|um+|hmm+|ah+|er+|like,?\s+|so,?\s+|well,?\s+|ano,?\s+|kasi,?\s+)+/gi, '')
    // Bounded phonetic brand normalization for DESTRIA TECH & Ophireum
    .replace(/\bdestr(?:ea|iya|ia)\s+tech\b/gi, 'DESTRIA TECH')
    .replace(/\b(?:oferium|ophirium|ophyrium|ophireum)\b/gi, 'Ophireum')
    .trim();
}

/**
 * Detects whether an incoming transcript is garbled, noise-only, or too unclear to interpret.
 */
export function isUnclearOrNoisyTranscript(raw: string): boolean {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return true;
  if (/^[.\s,?!\-_*~]+$/.test(trimmed)) return true;
  // Pure filler / background noise tokens (including multi-token fragments like "hmm mm ??")
  if (
    /^(?:(?:uh+|um+|hmm+|hm+|ah+|mm+|eh+|oh+|er+|static|noise|inaudible|unintelligible|cough|sigh|\.\.\.)[\s.?!,\-_*~]*)+$/i.test(
      trimmed
    )
  ) {
    return true;
  }
  const alnum = trimmed.replace(/[^a-z0-9]/g, '');
  if (alnum.length <= 1) return true;
  return false;
}

/**
 * Detects Tagalog / Taglish pricing or cost queries so commercial policy
 * enforcement works seamlessly across multilingual speech.
 */
function isFilipinoPricingQuery(text: string): boolean {
  return /\b(magkano|presyo|halaga|bayad|singil|gastos|pinakamura|mura|diskwento|tawad)\b/i.test(
    text
  );
}

/**
 * Detects whether the user is requesting direct human / solutions team contact
 * (without hijacking executive CEO/CTO consultation preference turns).
 */
function detectHumanEscalationIntent(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return (
    /\b(speak|talk|connect|call|reach)\s+(directly\s+)?(with|to)?\s*(a\s+|an\s+|your\s+|the\s+)?(human(?:\s+solutions\s+architect|\s+representative|\s+engineer)?|real\s+person|live\s+engineer|solutions\s+(?:team|architect|specialist)|representative)\b/i.test(
      normalized
    ) ||
    /\b(real\s+person|call\s+executive|direct\s+contact|live\s+engineer|human\s+representative|solutions\s+team\s+directly|makausap\s+ang\s+tao)\b/i.test(
      normalized
    )
  );
}

/**
 * Detects whether the user is correcting previously stated information
 * (e.g., "Actually, not blockchain, I meant cloud security", "Sorry, CTO instead of CEO").
 */
export function detectUserCorrection(text: string): boolean {
  return /\b(actually|sorry|wait|scratch\s+that|never\s*mind|i\s+meant|change\s+that\s+to|instead\s+of|not\s+(?:the\s+)?(?:ceo|cto|website|blockchain|mobile|ai)|correction|hindi\s+pala|palitan)\b/i.test(
    text
  );
}

/**
 * Extracts client contact & project entities passively from natural speech
 * so the assistant NEVER re-asks information the user already stated.
 */
function extractClientContextFromUtterance(text: string, ctx: VoiceDiscoveryContext) {
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) ctx.clientEmail = emailMatch[0].toLowerCase();

  const nameMatch = text.match(
    /(?:[Mm]y\s+name\s+is|[Ii](?:'m|\s+am)|[Tt]his\s+is|[Aa]ko\s+si)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/
  );
  if (nameMatch) ctx.clientName = nameMatch[1].trim();

  const companyMatch = text.match(
    /(?:from|at|company\s+is|organization\s+is|we\s+are|representing)\s+([A-Z][A-Za-z0-9&.\-\s]{2,45}?)(?=\s+(?:in|with|and|we|looking|need|want|email)\b|[,.!?]|$)/
  );
  if (companyMatch && !companyMatch[1].includes('@')) {
    const candidate = companyMatch[1].trim();
    if (!/^(a|an|the|looking|interested|trying|building)$/i.test(candidate)) {
      ctx.clientCompany = candidate;
    }
  }

  const timelineMatch = text.match(
    /\b(within\s+\d+\s+(?:weeks?|months?)|in\s+\d+\s+(?:weeks?|months?)|(?:by\s+)?q[1-4](?:\s*20\d{2})?|next\s+(?:month|quarter|year)|asap|urgent)\b/i
  );
  if (timelineMatch) {
    ctx.targetTimeline = timelineMatch[0].trim();
  }

  // Extract explicit enterprise capability phrases from multi-clause instructions
  const featurePatterns: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\bweb\s+portal\b/i, label: 'unified web portal' },
    { pattern: /\brole[\s-]based\s+access\b/i, label: 'role-based access control' },
    { pattern: /\banalytics\s+dashboards?\b/i, label: 'real-time analytics dashboards' },
    { pattern: /\bautomated\s+api\s+alerts?\b/i, label: 'automated API alerts' },
    { pattern: /\bworkflow\s+automation\b/i, label: 'workflow automation' },
  ];
  const existingFeatures = new Set((ctx.keyFeatures || []).map((f) => f.toLowerCase()));
  for (const fp of featurePatterns) {
    if (fp.pattern.test(text) && !existingFeatures.has(fp.label.toLowerCase())) {
      ctx.keyFeatures = [...(ctx.keyFeatures || []), fp.label].slice(0, 10);
      existingFeatures.add(fp.label.toLowerCase());
    }
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
    /(?:discuss|explore|focus on|consider|prefer|options?(?:\s+are|\s+include)?|such as|including|between|specialize in)\s+([^?.!]{10,180})/i;
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
 * Finds catalog matches using both the current utterance and recent conversation context,
 * supporting enterprise acronyms, Filipino/Taglish phrasing, and multi-clause prompts.
 */
export function matchCatalogServices(query: string, limit = 3) {
  const q = query.toLowerCase();
  const keywordBoosts: Array<{ pattern: RegExp; categoryHint: string; weight?: number }> = [
    {
      pattern: /\b(website|web\s*app|web\s*development|portal|landing\s*page|ecommerce|e-commerce|storefront|booking\s+site)\b/i,
      categoryHint: 'web',
      weight: 4,
    },
    {
      pattern: /\b(ai|artificial\s+intelligence|automation|agent|chatbot|voice\s+assistant|llm|rag|workflow|machine\s*learning|nlp|automate)\b/i,
      categoryHint: 'ai',
      weight: 5,
    },
    {
      pattern: /\b(blockchain|web3|smart\s*contract|solidity|ledger|token|crypto|defi|audit\s+trail)\b/i,
      categoryHint: 'blockchain',
      weight: 5,
    },
    {
      pattern: /\b(cloud|devops|kubernetes|docker|aws|gcp|azure|cybersecurity|security|audit|infrastructure|soc|compliance|iso\s*27001|zero[\s-]trust|migration)\b/i,
      categoryHint: 'cloud',
      weight: 5,
    },
    {
      pattern: /\b(mobile|ios|android|app\s*development|saas|erp|crm|custom\s*software|inventory|fleet|logistics|clinic|hospital|payroll|hris|pos)\b/i,
      categoryHint: 'software',
      weight: 4,
    },
    {
      pattern: /\b(multimedia|ophireum|video|cinema|3d|vfx|branding|broadcast|production|animation|creative)\b/i,
      categoryHint: 'creative',
      weight: 5,
    },
  ];

  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  return SERVICE_CATALOG.map((svc) => {
    const haystack = `${svc.title} ${svc.shortDescription} ${svc.capabilities.join(' ')} ${svc.categoryId}`.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (svc.title.toLowerCase().includes(token)) score += 4;
      else if (haystack.includes(token)) score += 1;
    }
    for (const boost of keywordBoosts) {
      if (
        boost.pattern.test(q) &&
        (svc.categoryId.toLowerCase().includes(boost.categoryHint) ||
          haystack.includes(boost.categoryHint))
      ) {
        score += boost.weight ?? 3;
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
  // Handle explicit corrections like "not CEO, I meant CTO"
  if (/\b(?:not\s+(?:the\s+)?ceo|instead\s+of\s+(?:the\s+)?ceo).*\b(cto|chief\s+technology|leodenis)\b/i.test(text)) {
    return 'cto';
  }
  if (/\b(?:not\s+(?:the\s+)?cto|instead\s+of\s+(?:the\s+)?cto).*\b(ceo|chief\s+executive|desmond)\b/i.test(text)) {
    return 'ceo';
  }
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
 * (supports English & Taglish, without hijacking negations or pure questions).
 */
export function detectAffirmativeBookingIntent(
  userMessage: string,
  lastAiMessage?: string
): { isBookingIntent: boolean; requiresBookingConfirmation: boolean } {
  const normalized = userMessage.trim().toLowerCase();
  const hasNegation = /\b(don't|do\s+not|not\s+yet|later|wait|before\s+we\s+book|no\s+thanks|no\b|hindi\s+muna|mamaya\s+na)\b/i.test(
    normalized
  );
  if (hasNegation) {
    return { isBookingIntent: false, requiresBookingConfirmation: false };
  }

  const explicitSchedule =
    /\b(open|show|start|launch)\s+(the\s+)?((?:executive|ceo|cto|technical|initial|verified)\s+)?(?:consultation\s+)?(booking|scheduling|appointment|calendar)(\s+form|\s+modal|\s+widget)?\b/i.test(
      normalized
    ) ||
    /\b(book|schedule|set\s+up|arrange|magpa-?schedule|pa-?schedule|mag-?book)\s+(a|an|my|the|ng)?\s*(executive\s+|ceo\s+|cto\s+|technical\s+)?(consultation|appointment|meeting|call|slot)\s*(now|today|please|po)?\b/i.test(
      normalized
    );
  if (explicitSchedule) {
    return { isBookingIntent: true, requiresBookingConfirmation: false };
  }

  const isShortYes = /^(yes|yeah|yep|sure|please|please\s+do|go\s+ahead|sounds\s+good|let's\s+do\s+it|ok|okay|oo|opo|sige|sige\s+po)\.?$/i.test(
    normalized
  );
  if (
    isShortYes &&
    lastAiMessage &&
    /\b(open\s+the\s+.*(scheduling|booking|consultation)\s+form|schedule\s+(a|an|your)\s+(ceo|cto|executive|initial)?\s*consultation|book\s+a\s+slot|scheduling\s+form)\b/i.test(
      lastAiMessage
    )
  ) {
    return { isBookingIntent: true, requiresBookingConfirmation: false };
  }

  if (/\b(prefer|want|would\s+like|gusto)\s+.*(ceo|cto|executive)\s+(consultation|call|meeting|briefing)\b/i.test(normalized)) {
    return { isBookingIntent: false, requiresBookingConfirmation: true };
  }

  return { isBookingIntent: false, requiresBookingConfirmation: false };
}

/**
 * Generates an intelligent, retrieval-grounded, context-aware deterministic reply
 * when Gemini API is unavailable or times out. Strictly honors prior conversation
 * history, corrections, unclear audio, Filipino/Taglish, short follow-ups, and
 * corporate knowledge facts.
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
  isCorrection: boolean;
  isClarificationNeeded: boolean;
  recognizedIntentCategory: string;
} {
  const { userMessage, history, language } = params;
  const cleanedUtterance = normalizeSpokenUtterance(userMessage);
  const hasTagalogCue = /\b(po|opo|gusto|pwede|kailangan|namin|natin|saan|sino|paano|magkano|magpa|sige|hindi|oo)\b/i.test(
    userMessage
  );
  const isFilipino = language.startsWith('fil') || hasTagalogCue;
  const normalized = cleanedUtterance.toLowerCase();

  const nextContext: VoiceDiscoveryContext = {
    ...params.context,
    presentedOptions: [...(params.context.presentedOptions || [])],
    keyFeatures: [...(params.context.keyFeatures || [])],
  };

  // 0. Unclear / garbled audio detection -> polite clarification without resetting session!
  if (isUnclearOrNoisyTranscript(userMessage)) {
    return {
      replyText: isFilipino
        ? 'Paumanhin po, hindi gaanong malinaw ang narinig ko sa audio. Maaari po ba ninyong ulitin nang bahagya ang inyong tanong o requirement?'
        : 'Pardon me, I did not catch that clearly over the audio. Could you please repeat your question or let me know how I can help with your project?',
      updatedContext: nextContext,
      recommendedServiceIds: [],
      quickReplies: ['AI Solutions & Automation', 'Custom Enterprise Software', 'Schedule Consultation'],
      isBookingIntent: false,
      requiresBookingConfirmation: false,
      isBriefIntent: false,
      isHumanEscalation: false,
      isCorrection: false,
      isClarificationNeeded: true,
      recognizedIntentCategory: 'clarification_needed',
    };
  }

  // 0b. Natural conversational intent & memory classification (greetings, personal AI Q&A, general knowledge, multilingual, memory recall, subject changes, closures)
  const conversationalClass = classifyConversationalTurn(userMessage, history, nextContext as Record<string, unknown>);
  if (conversationalClass.memory.preferredName) {
    nextContext.preferredName = conversationalClass.memory.preferredName;
    if (!nextContext.clientName) nextContext.clientName = conversationalClass.memory.preferredName;
  }
  nextContext.preferredLanguage = conversationalClass.language;
  nextContext.previousQuestions = conversationalClass.memory.previousQuestions;
  nextContext.discussedTopics = conversationalClass.memory.discussedTopics;
  nextContext.lastTopic = conversationalClass.memory.lastTopic;
  nextContext.userPreferences = conversationalClass.memory.userPreferences;

  // Handle explicit subject change by clearing active enterprise discovery lock
  if (conversationalClass.intent === 'subject_change') {
    nextContext.selectedService = undefined;
    nextContext.category = undefined;
    nextContext.businessProblem = undefined;
    nextContext.presentedOptions = [];
    const pivotReply = buildDeterministicConversationalReply(userMessage, conversationalClass);
    if (pivotReply) {
      return {
        replyText: pivotReply.replyText,
        updatedContext: nextContext,
        recommendedServiceIds: [],
        quickReplies: [],
        isBookingIntent: false,
        requiresBookingConfirmation: false,
        isBriefIntent: false,
        isHumanEscalation: false,
        isCorrection: false,
        isClarificationNeeded: false,
        recognizedIntentCategory: 'subject_change',
      };
    }
  }

  // Passively capture client info only when not purely casual/personal
  if (!conversationalClass.isCasualOrPersonal) {
    extractClientContextFromUtterance(cleanedUtterance, nextContext);
  }

  const lastAiMessage = [...history].reverse().find((m) => m.sender === 'ai')?.text || '';
  const extractedFromLastAi = extractPresentedOptionsFromText(lastAiMessage);
  if (extractedFromLastAi.length >= 2) {
    nextContext.presentedOptions = extractedFromLastAi;
  }

  const isCorrection = detectUserCorrection(cleanedUtterance);
  const execPref = detectExecutivePreference(cleanedUtterance);
  if (execPref) {
    nextContext.executivePreference = execPref;
  }

  const bookingCheck = detectAffirmativeBookingIntent(cleanedUtterance, lastAiMessage);
  const isBriefIntent = /\b(project\s+brief|review\s+brief|generate\s+brief|proposal\s+summary|scope\s+document|service\s+inquiry|submit\s+inquiry)\b/i.test(
    normalized
  );
  const isHumanEscalation =
    conversationalClass.intent !== 'personal_ai_question' &&
    detectHumanEscalationIntent(cleanedUtterance);

  // If this turn is casual, personal AI question, general knowledge, memory recall, closure,
  // pure greeting, multilingual small talk, or non-DESTRIA technical discussion —
  // AND NOT an active consultation follow-up (like "Which one?" / "The second option" / booking confirmation) —
  // respond naturally WITHOUT pushing corporate sales discovery!
  const isOrdinalOptionFollowUp =
    (nextContext.presentedOptions?.length || 0) >= 2 &&
    /\b(first|second|third|fourth|1st|2nd|3rd|which\s+one|either|both|option\s+[1-4])\b/i.test(normalized);
  const isActiveConsultationFollowUp =
    bookingCheck.isBookingIntent ||
    isBriefIntent ||
    isHumanEscalation ||
    isOrdinalOptionFollowUp ||
    Boolean(execPref) ||
    (Boolean(nextContext.selectedService || nextContext.category) &&
      /\b(how\s+does\s+it\s+work|tell\s+me\s+more|what\s+about|integrat|timeline|security|compliance|deploy|architecture|more\s+about\s+(?:it|that|this))\b/i.test(
        normalized
      ));

  if (
    !isActiveConsultationFollowUp &&
    (conversationalClass.isCasualOrPersonal ||
      conversationalClass.intent === 'technical_discussion' ||
      conversationalClass.intent === 'conversation_continuation' ||
      (conversationalClass.intent === 'conversation_correction' && !execPref))
  ) {
    const naturalReply = buildDeterministicConversationalReply(userMessage, conversationalClass);
    if (naturalReply) {
      return {
        replyText: naturalReply.replyText,
        updatedContext: nextContext,
        recommendedServiceIds: [],
        quickReplies: naturalReply.quickReplies,
        isBookingIntent: false,
        requiresBookingConfirmation: false,
        isBriefIntent: false,
        isHumanEscalation: false,
        isCorrection: conversationalClass.intent === 'conversation_correction' || isCorrection,
        isClarificationNeeded: conversationalClass.requiresClarification,
        recognizedIntentCategory: conversationalClass.intent,
      };
    }
  }

  // 1. Human escalation intent
  if (isHumanEscalation) {
    return {
      replyText: isFilipino
        ? `Maaari po kayong makipag-ugnayan nang direkta sa aming DESTRIA TECH INC Solutions Architecture team sa ${corporateIdentity.contact.telephone.display} o sa ${corporateIdentity.contact.email}, o maaari ko pong buksan ang verified consultation scheduling form para sa inyo.`
        : `You can connect directly with our ${corporateIdentity.legalName} solutions architecture team by calling ${corporateIdentity.contact.telephone.display} or emailing ${corporateIdentity.contact.email}. Would you also like me to open the executive consultation scheduling form?`,
      updatedContext: nextContext,
      recommendedServiceIds: [],
      quickReplies: ['Direct Solutions Contact', 'Schedule Consultation'],
      isBookingIntent: false,
      requiresBookingConfirmation: false,
      isBriefIntent: false,
      isHumanEscalation: true,
      isCorrection,
      isClarificationNeeded: false,
      recognizedIntentCategory: 'human_escalation',
    };
  }

  // 2. Explicit user correction of executive track or solution topic
  if (isCorrection && execPref) {
    const execName =
      execPref === 'cto'
        ? `${corporateIdentity.leadership.cto.name}, our Chief Technology Officer`
        : execPref === 'ceo'
        ? `${corporateIdentity.leadership.ceo.name}, our Founder and Chief Executive Officer`
        : 'our Enterprise Solutions Advisory team';
    nextContext.currentStage = 'scheduling';
    return {
      replyText: isFilipino
        ? `Salamat po sa pagwawasto. In-update ko na po ang inyong consultation preference kay ${execName}. Nais po ba ninyong ituloy ang scheduling form o may idagdag pa kayong technical requirements?`
        : `Thank you for the correction. I have updated your consultation preference to ${execName}. Would you like to proceed to the consultation scheduling form or share additional technical requirements first?`,
      updatedContext: nextContext,
      recommendedServiceIds: [],
      quickReplies: ['Open Scheduling Form', 'Discuss Requirements First'],
      isBookingIntent: false,
      requiresBookingConfirmation: true,
      isBriefIntent: false,
      isHumanEscalation: false,
      isCorrection: true,
      isClarificationNeeded: false,
      recognizedIntentCategory: 'correction_executive_preference',
    };
  }

  if (isCorrection) {
    const correctedSegment = cleanedUtterance
      .replace(/^.*?\b(?:instead\s+of\s+[^,.]+|not\s+[^,.]+|meant|change\s+that\s+to|scratch\s+that)\b[,:\s—-]*/i, '')
      .trim();
    const correctedMatches = matchCatalogServices(correctedSegment || cleanedUtterance, 2);
    if (correctedMatches.length > 0) {
      const updatedSvc = correctedMatches[0];
      nextContext.selectedService = updatedSvc.title;
      nextContext.category = updatedSvc.title;
      return {
        replyText: isFilipino
          ? `Salamat po sa paglilinaw. In-update ko na po ang ating focus sa ${updatedSvc.title}. Ano po ang pangunahing capability o integration na kailangan ng inyong organisasyon para dito?`
          : `Got it—thank you for clarifying. I have updated our focus to ${updatedSvc.title}. What key capabilities, security standards, or integrations should we prioritize for this solution?`,
        updatedContext: nextContext,
        recommendedServiceIds: correctedMatches.map((m) => m.id),
        quickReplies: ['How does it work?', 'Discuss integrations', 'Schedule CTO Consultation'],
        isBookingIntent: false,
        requiresBookingConfirmation: false,
        isBriefIntent: false,
        isHumanEscalation: false,
        isCorrection: true,
        isClarificationNeeded: false,
        recognizedIntentCategory: 'correction_service_topic',
      };
    }
  }

  // 3. User prefers CEO or CTO consultation (confirm before submitting)
  if (execPref && /\b(prefer|want|choose|pick|select|like|gusto|with)\b/i.test(normalized) && !bookingCheck.isBookingIntent) {
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
      isBookingIntent: false,
      requiresBookingConfirmation: true,
      isBriefIntent: false,
      isHumanEscalation: false,
      isCorrection,
      isClarificationNeeded: false,
      recognizedIntentCategory: 'executive_preference',
    };
  }

  // 4. Affirmative scheduling / booking intent
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
      isCorrection,
      isClarificationNeeded: false,
      recognizedIntentCategory: 'consultation_booking',
    };
  }

  // 5. Architecture / Governance / Corporate Knowledge questions (grounded in KB)
  if (/\b(8[\s-]layer|eight[\s-]layer|architecture\s+layers?|core\s+values|responsible\s+ai|privacy|recording|audio\s+stored|international|global|philippines)\b/i.test(normalized)) {
    const kbHits = retrieveCorporateKnowledge(cleanedUtterance, { topK: 1 });
    if (kbHits.length > 0) {
      const hit = kbHits[0].entry;
      return {
        replyText: `${hit.summary} ${hit.facts.slice(0, 2).join(' ')} Would you like to explore how this applies to your organization's initiative?`,
        updatedContext: nextContext,
        recommendedServiceIds: [],
        quickReplies: ['Explore Solution Frameworks', 'View Corporate Profile', 'Schedule Consultation'],
        isBookingIntent: false,
        requiresBookingConfirmation: false,
        isBriefIntent: false,
        isHumanEscalation: false,
        isCorrection,
        isClarificationNeeded: false,
        recognizedIntentCategory: `knowledge_${hit.domain}`,
      };
    }
  }

  // 6. Short follow-up: "Which one would you recommend?" / "Which one?"
  if (/\b(which\s+one|what\s+(would|do)\s+you\s+recommend|which\s+option|recommend\s+one|alin\s+po)\b/i.test(normalized)) {
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
        isCorrection,
        isClarificationNeeded: false,
        recognizedIntentCategory: 'followup_recommendation',
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
      isCorrection,
      isClarificationNeeded: false,
      recognizedIntentCategory: 'followup_recommendation',
    };
  }

  // 7. Ordinal option selection ("The first option", "Second one", "Third")
  const ordinalMatch = normalized.match(/\b(first|1st|one|second|2nd|two|third|3rd|three|una|pangalawa)\s*(option|one|choice)?\b/i);
  if (
    ordinalMatch &&
    (nextContext.presentedOptions?.length || 0) >= 2 &&
    normalized.split(/\s+/).length <= 8
  ) {
    const word = ordinalMatch[1].toLowerCase();
    const index =
      word === 'first' || word === '1st' || word === 'one' || word === 'una'
        ? 0
        : word === 'second' || word === '2nd' || word === 'two' || word === 'pangalawa'
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
        isCorrection,
        isClarificationNeeded: false,
        recognizedIntentCategory: 'followup_ordinal_selection',
      };
    }
  }

  // 8. Elaborative follow-up ("Tell me more", "How does it work?", "What about security?", "How long does that take?")
  if (
    /^(tell\s+me\s+more|more\s+details?|how\s+does\s+(it|that|this)\s+work|can\s+you\s+explain|explain\s+(more|that|further)|what\s+does\s+that\s+include|paano\s+iyon)\??\.?$/i.test(
      normalized
    ) ||
    /\b(how\s+long\s+(does|will)\s+(it|that|this)\s+take|what\s+is\s+the\s+timeline|what\s+about\s+integrat|does\s+(it|that)\s+integrat)\b/i.test(
      normalized
    )
  ) {
    const activeTopic =
      nextContext.selectedService ||
      nextContext.category ||
      (nextContext.presentedOptions?.length ? nextContext.presentedOptions[0] : 'customized enterprise technology architecture');
    const matches = matchCatalogServices(activeTopic, 2);
    const primarySvc = matches[0];

    if (/\b(how\s+long|timeline)\b/i.test(normalized)) {
      return {
        replyText: isFilipino
          ? `Para sa ${activeTopic}, nakadepende po ang delivery timeline sa technical complexity, security requirements, at system integrations. Nagbibigay kami ng malinaw na milestone schedule sa formal proposal pagkatapos ng initial technical assessment.`
          : `For ${activeTopic}, the delivery timeline depends on technical scope, required integrations, and security testing. We define a staged milestone schedule inside the formal proposal right after an initial technical assessment.`,
        updatedContext: nextContext,
        recommendedServiceIds: matches.map((m) => m.id),
        quickReplies: ['Schedule CTO Consultation', 'Review Project Brief'],
        isBookingIntent: false,
        requiresBookingConfirmation: false,
        isBriefIntent: false,
        isHumanEscalation: false,
        isCorrection,
        isClarificationNeeded: false,
        recognizedIntentCategory: 'followup_timeline',
      };
    }

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
        isCorrection,
        isClarificationNeeded: false,
        recognizedIntentCategory: 'followup_elaboration',
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
      isCorrection,
      isClarificationNeeded: false,
      recognizedIntentCategory: 'followup_elaboration',
    };
  }

  // 9. Short affirmative / negative conversational continuations
  if (/^(yes|yeah|yep|correct|exactly|sure|right|oo|opo|tama|sige)\.?$/i.test(normalized)) {
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
        isCorrection,
        isClarificationNeeded: false,
        recognizedIntentCategory: 'followup_affirmative_brief',
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
        isCorrection,
        isClarificationNeeded: false,
        recognizedIntentCategory: 'followup_affirmative_integration',
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
      isCorrection,
      isClarificationNeeded: false,
      recognizedIntentCategory: 'followup_affirmative',
    };
  }

  if (/^(no|nope|not\s+yet|not\s+really|none|hindi|wala\s+pa)\.?$/i.test(normalized)) {
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
      isCorrection,
      isClarificationNeeded: false,
      recognizedIntentCategory: 'followup_negative',
    };
  }

  // 10. Project brief / service inquiry request
  if (isBriefIntent) {
    nextContext.currentStage = 'brief_ready';
    const knownClientNote = nextContext.clientName
      ? ` I already have your details noted for ${nextContext.clientName}${nextContext.clientCompany ? ` at ${nextContext.clientCompany}` : ''}.`
      : '';
    return {
      replyText: isFilipino
        ? `Maaari po nating ihanda ang inyong Project Requirements Brief o Service Inquiry para sa ${nextContext.selectedService || 'inyong proyekto'}.${knownClientNote} Nais po ba ninyong buksan ang Project Brief form ngayon?`
        : `I can prepare your preliminary Project Requirements Brief or Service Inquiry for ${nextContext.selectedService || 'your initiative'}.${knownClientNote} Would you like to open the structured brief to review and confirm before submitting?`,
      updatedContext: nextContext,
      recommendedServiceIds: [],
      quickReplies: ['Review Project Brief', 'Schedule Consultation'],
      isBookingIntent: false,
      requiresBookingConfirmation: false,
      isBriefIntent: true,
      isHumanEscalation: false,
      isCorrection,
      isClarificationNeeded: false,
      recognizedIntentCategory: 'project_brief_inquiry',
    };
  }

  // 10b. Client self-introduction / contact capture turn (avoid misclassifying company names as new service requests)
  const isContactIntroTurn =
    /(?:my\s+name\s+is|i\s+am|i'm|this\s+is|ako\s+si)\s+/i.test(cleanedUtterance) &&
    Boolean(nextContext.clientName || nextContext.clientEmail) &&
    !/\b(need|want|build|develop|looking\s+for|migrate|automate)\b/i.test(normalized);
  if (isContactIntroTurn) {
    const identitySummary = [
      nextContext.clientName,
      nextContext.clientCompany ? `from ${nextContext.clientCompany}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const emailSummary = nextContext.clientEmail ? ` (${nextContext.clientEmail})` : '';
    return {
      replyText: isFilipino
        ? `Salamat po, ${identitySummary || 'sir/ma\'am'}. Naitala ko na ang inyong contact details${emailSummary} upang hindi na kailangang ulitin. Paano ko po matutulungan ang inyong organisasyon ngayon?`
        : `Thank you, ${identitySummary || 'and welcome'}. I have noted your contact details${emailSummary} so you will not need to repeat them. What enterprise technology initiative or requirement would you like to discuss today?`,
      updatedContext: nextContext,
      recommendedServiceIds: [],
      quickReplies: ['AI Solutions & Automation', 'Custom Enterprise Software', 'Schedule Consultation'],
      isBookingIntent: false,
      requiresBookingConfirmation: false,
      isBriefIntent: false,
      isHumanEscalation: false,
      isCorrection,
      isClarificationNeeded: false,
      recognizedIntentCategory: 'client_context_capture',
    };
  }

  // 11. Catalog-matched specific domain answer (supports multi-clause & Taglish instructions!)
  const matched = matchCatalogServices(`${cleanedUtterance} ${nextContext.selectedService || ''}`, 3);
  if (matched.length > 0) {
    const primary = matched[0];
    nextContext.selectedService = primary.title;
    nextContext.category = primary.title;
    if (cleanedUtterance.length > 12) {
      nextContext.businessProblem = cleanedUtterance;
    }
    nextContext.currentStage = nextContext.currentStage === 'welcome' ? 'problem' : 'features';
    const capturedFeaturesNote =
      nextContext.keyFeatures && nextContext.keyFeatures.length > 0
        ? ` covering ${nextContext.keyFeatures.slice(0, 4).join(', ')}`
        : '';
    const memoryNote = nextContext.targetTimeline
      ? ` I have also noted your target timeline (${nextContext.targetTimeline}) for our technical assessment.`
      : '';
    return {
      replyText: isFilipino
        ? `Para sa inyong pangangailangan${capturedFeaturesNote}, ang ${primary.title} ng ${corporateIdentity.legalName} ay maaaring i-customize ayon sa inyong workflow at security standards.${memoryNote} Ano po ang pangunahing functionality o kasalukuyang system integration na nais ninyong unahin para dito?`
        : `For those requirements${capturedFeaturesNote}, ${corporateIdentity.legalName} can architect a customized ${primary.title} solution tailored to your workflows and security standards.${memoryNote} What primary capabilities or existing system integrations are most important for your team to launch first?`,
      updatedContext: nextContext,
      recommendedServiceIds: matched.map((m) => m.id),
      quickReplies: ['How does it work?', 'Discuss integrations', 'Schedule CTO Consultation'],
      isBookingIntent: false,
      requiresBookingConfirmation: false,
      isBriefIntent: false,
      isHumanEscalation: false,
      isCorrection,
      isClarificationNeeded: false,
      recognizedIntentCategory: `solution_${primary.categoryId}`,
    };
  }

  // 12. Contextual discovery continuation (never repeating robotic static boilerplate or re-asking known info)
  if (!nextContext.businessProblem) {
    nextContext.businessProblem = cleanedUtterance;
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
    isBriefIntent: false,
    isHumanEscalation: false,
    isCorrection,
    isClarificationNeeded: false,
    recognizedIntentCategory: activeFocus ? 'contextual_continuation' : 'discovery_routing',
  };
}

/**
 * Primary server-side voice conversational turn processor.
 * Combines commercial policy enforcement (English + Tagalog/Taglish), retrieval-grounded
 * Corporate Knowledge, Gemini 4 Hydrogen inference + authorized function calling,
 * and context-aware fallback.
 */
export async function processVoiceConversationTurn(params: {
  ai: GoogleGenAI | null;
  sessionStore: VoiceSessionStore;
  sessionId?: string;
  userMessage: string;
  language: string;
  clientHistory: Array<{ sender: 'user' | 'ai'; text: string }>;
  stateContext?: VoiceDiscoveryContext;
  runtimeConfig?: AiRuntimeConfigRegistry;
  toolsExecutor?: AIToolsExecutor;
  onPolicyAudit?: (trigger: string, reason?: string) => Promise<void>;
}): Promise<VoiceTurnResult> {
  const startedAt = Date.now();
  const {
    ai,
    sessionStore,
    userMessage,
    language,
    clientHistory,
    stateContext,
    runtimeConfig,
    toolsExecutor,
    onPolicyAudit,
  } = params;
  const session = sessionStore.getOrCreateSession(params.sessionId, language);

  if (stateContext) {
    if (stateContext.selectedService) session.context.selectedService = stateContext.selectedService;
    if (stateContext.category) session.context.category = stateContext.category;
    if (stateContext.businessProblem) session.context.businessProblem = stateContext.businessProblem;
    if (stateContext.currentStage) session.context.currentStage = stateContext.currentStage;
    if (stateContext.executivePreference) session.context.executivePreference = stateContext.executivePreference;
    if (stateContext.clientName) session.context.clientName = stateContext.clientName;
    if (stateContext.clientEmail) session.context.clientEmail = stateContext.clientEmail;
    if (stateContext.clientCompany) session.context.clientCompany = stateContext.clientCompany;
    if (stateContext.targetTimeline) session.context.targetTimeline = stateContext.targetTimeline;
    if (stateContext.presentedOptions && stateContext.presentedOptions.length > 0) {
      session.context.presentedOptions = stateContext.presentedOptions.slice(0, 5);
    }
    if (stateContext.keyFeatures && stateContext.keyFeatures.length > 0) {
      session.context.keyFeatures = stateContext.keyFeatures.slice(0, 10);
    }
  }

  const normalizedUtterance = normalizeSpokenUtterance(userMessage);
  extractClientContextFromUtterance(normalizedUtterance, session.context);
  const execPref = detectExecutivePreference(normalizedUtterance);
  if (execPref) {
    session.context.executivePreference = execPref;
  }

  const dedupedHistory = buildDeduplicatedHistory(session.history, clientHistory, userMessage);
  const lastAiMessage = [...dedupedHistory].reverse().find((m) => m.sender === 'ai')?.text || '';
  const extractedOptions = extractPresentedOptionsFromText(lastAiMessage);
  if (extractedOptions.length >= 2) {
    session.context.presentedOptions = extractedOptions;
  }

  // 0. Unclear / noise-only utterance guard (ask politely for clarification before calling LLM)
  if (isUnclearOrNoisyTranscript(userMessage)) {
    const clarify = generateContextualFallbackReply({
      userMessage,
      history: dedupedHistory,
      context: session.context,
      language,
    });
    const latencyMs = Date.now() - startedAt;
    runtimeConfig?.recordTurnTelemetry({
      sessionId: session.sessionId,
      channel: 'turn_based',
      latencyMs,
    });
    return {
      sessionId: session.sessionId,
      replyText: clarify.replyText,
      spokenText: formatTextForVoiceSpeech(clarify.replyText),
      policyEnforced: false,
      detectedIntent: {
        isBookingIntent: false,
        requiresBookingConfirmation: false,
        isBriefIntent: false,
        isHumanEscalation: false,
        isClarificationNeeded: true,
        recognizedIntentCategory: 'clarification_needed',
      },
      updatedContext: { ...session.context },
      recommendedServiceIds: [],
      quickReplies: clarify.quickReplies,
      provider: 'DESTRIA Speech Clarification Guard',
      aiLatencyMs: latencyMs,
      language,
      timestamp: new Date().toISOString(),
    };
  }

  // 1. Authoritative Commercial Policy & Corporate Identity Guardrail Check (English + Filipino/Taglish)
  const policyCheckInput = isFilipinoPricingQuery(normalizedUtterance)
    ? `${normalizedUtterance} pricing cost`
    : normalizedUtterance;
  const policyDecision = classifyCommercialPolicyIntent(policyCheckInput);
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

    const latencyMs = Date.now() - startedAt;
    runtimeConfig?.recordTurnTelemetry({
      sessionId: session.sessionId,
      channel: 'turn_based',
      latencyMs,
      policyEnforced: policyDecision.isPricingRestricted,
    });

    const bookingCheck = detectAffirmativeBookingIntent(normalizedUtterance, lastAiMessage);
    return {
      sessionId: session.sessionId,
      replyText,
      spokenText: formatTextForVoiceSpeech(replyText),
      policyEnforced: policyDecision.isPricingRestricted,
      detectedIntent: {
        isBookingIntent:
          bookingCheck.isBookingIntent || policyDecision.trigger === 'consultation',
        requiresBookingConfirmation: bookingCheck.requiresBookingConfirmation,
        isBriefIntent: /\b(brief|proposal|scope|requirements)\b/i.test(normalizedUtterance),
        isHumanEscalation:
          policyDecision.suggestedAction === 'talk_to_human' ||
          detectHumanEscalationIntent(normalizedUtterance),
        executivePreference: session.context.executivePreference,
        recognizedIntentCategory: `policy_${policyDecision.trigger}`,
      },
      updatedContext: { ...session.context },
      recommendedServiceIds: [],
      quickReplies: policyDecision.quickReplies,
      resourceLinks: policyDecision.resourceLinks,
      provider: 'DESTRIA Corporate Governance Policy Engine',
      aiLatencyMs: latencyMs,
      language,
      timestamp: new Date().toISOString(),
    };
  }

  const conversationalClass = classifyConversationalTurn(
    userMessage,
    dedupedHistory,
    session.context as Record<string, unknown>
  );
  if (conversationalClass.memory.preferredName) {
    session.context.preferredName = conversationalClass.memory.preferredName;
    if (!session.context.clientName) {
      session.context.clientName = conversationalClass.memory.preferredName;
    }
  }
  session.context.preferredLanguage = conversationalClass.language;
  session.context.previousQuestions = conversationalClass.memory.previousQuestions;
  session.context.discussedTopics = conversationalClass.memory.discussedTopics;
  session.context.lastTopic = conversationalClass.memory.lastTopic;
  session.context.userPreferences = conversationalClass.memory.userPreferences;
  const effectiveLanguage = conversationalClass.language || language;
  session.language = effectiveLanguage;

  // Handle private executive/employee personal probes deterministically so LLM can never speculate
  if (conversationalClass.isPrivateExecutiveProbe) {
    const privateReply = buildDeterministicConversationalReply(userMessage, conversationalClass)!;
    session.history = [
      ...dedupedHistory,
      { sender: 'user' as const, text: userMessage },
      { sender: 'ai' as const, text: privateReply.replyText },
    ].slice(-24);
    session.turnCount += 1;
    session.lastActivityAt = Date.now();
    const latencyMs = Date.now() - startedAt;
    return {
      sessionId: session.sessionId,
      replyText: privateReply.replyText,
      spokenText: formatTextForVoiceSpeech(privateReply.replyText),
      policyEnforced: false,
      detectedIntent: {
        isBookingIntent: false,
        requiresBookingConfirmation: false,
        isBriefIntent: false,
        isHumanEscalation: false,
        executivePreference: session.context.executivePreference,
        recognizedIntentCategory: 'personal_ai_question',
      },
      updatedContext: { ...session.context },
      recommendedServiceIds: [],
      quickReplies: [],
      provider: 'DESTRIA Conversational Privacy Guard',
      aiLatencyMs: latencyMs,
      language: effectiveLanguage,
      timestamp: new Date().toISOString(),
    };
  }

  const bookingCheck = detectAffirmativeBookingIntent(userMessage, lastAiMessage);
  const isCorrection = detectUserCorrection(userMessage);
  const allowToolsThisTurn =
    conversationalClass.shouldAllowEnterpriseTools ||
    bookingCheck.isBookingIntent ||
    detectHumanEscalationIntent(normalizedUtterance);

  // 2. Live Gemini 4 Hydrogen multi-turn voice reasoning with natural conversational intelligence & gated tool calling
  if (ai) {
    try {
      const kbHits = allowToolsThisTurn ? retrieveCorporateKnowledge(userMessage, { topK: 3 }) : [];
      const groundedKbBlock = kbHits.length > 0 ? formatGroundedKnowledgeBlock(kbHits) : '';
      const naturalContextBlock = buildNaturalGeminiContextBlock(conversationalClass, 'voice');

      const contextSummary = [
        `Session ID: ${session.sessionId}`,
        `Turn Number: ${session.turnCount + 1}`,
        `Preferred User Name: ${session.context.preferredName || session.context.clientName || 'Not yet shared'}`,
        `Selected Service/Topic: ${session.context.selectedService || session.context.category || 'None active'}`,
        `Captured Business Problem: ${session.context.businessProblem || 'None active'}`,
        `Known Client Company: ${session.context.clientCompany || 'Not yet provided'}`,
        `Known Client Email: ${session.context.clientEmail || 'Not yet provided'}`,
        `Known Target Timeline: ${session.context.targetTimeline || 'Not yet provided'}`,
        `Executive Consultation Preference: ${session.context.executivePreference || 'None stated'}`,
        `Previously Presented Options: ${
          session.context.presentedOptions && session.context.presentedOptions.length > 0
            ? session.context.presentedOptions.join(' | ')
            : 'None'
        }`,
      ].join('\n');

      const enterpriseReferenceBlock = allowToolsThisTurn
        ? `\nRETRIEVED CORPORATE KNOWLEDGE (Version ${CORPORATE_KNOWLEDGE_VERSION}):\n${groundedKbBlock}\n\nOFFICIAL 10-CATEGORY ENTERPRISE TECHNOLOGY DIVISIONS (CUSTOMIZED SOLUTIONS — ZERO PUBLIC PRICING):\n${CATALOG_DIVISION_SUMMARIES.map((d) => `${Number(d.number)}. ${d.label} (${d.count} frameworks)`).join('\n')}\n\nCATALOG REFERENCE:\n${CATALOG_SUMMARY_FOR_AI.slice(0, 3500)}`
        : '';

      const systemInstruction = `${MANDATORY_AI_SYSTEM_INSTRUCTION}

${naturalContextBlock}

ACTIVE VOICE SESSION MEMORY:
${contextSummary}${enterpriseReferenceBlock}

NATURAL TWO-WAY VOICE CONVERSATION RULES:
- Respond naturally, warmly, and directly to what the user just said—whether casual chat, a personal question about you as an AI, general knowledge, technology discussion, or DESTRIA TECH INC enterprise consultation.
- Match the user's language automatically (English, Filipino, Taglish, Spanish, French, etc.) and switch seamlessly mid-conversation without losing memory.
- Handle incomplete thoughts, follow-up references, subject changes, and user corrections smoothly without restarting or re-asking details already known above.
- Only use enterprise consultation tools when the user explicitly requests DESTRIA TECH INC services, corporate resources, scheduling, or human assistance. NEVER submit bookings or inquiries without explicit client confirmation.
- Keep spoken responses natural and concise (typically 1 to 3 clear spoken sentences), zero markdown, zero bullets, zero asterisks, zero JSON.`;

      const contents: any[] = dedupedHistory.map((turn) => ({
        role: turn.sender === 'user' ? 'user' : 'model',
        parts: [{ text: turn.text }],
      }));
      contents.push({ role: 'user', parts: [{ text: userMessage }] });

      // CRITICAL: Only expose enterprise tools when intent actually warrants them!
      const tools =
        toolsExecutor && allowToolsThisTurn
          ? [{ functionDeclarations: getGeminiFunctionDeclarations({ nonBlocking: false }) }]
          : undefined;

      const chatModel = runtimeConfig?.getSettings().geminiChatModel || 'gemini-4-hydrogen';
      const collectedToolEvents: Array<{ type: string; payload: Record<string, unknown> }> = [];
      let totalToolCalls = 0;
      let totalPromptTokens = 0;
      let totalOutputTokens = 0;
      let rawReply = '';

      for (let round = 0; round < 3; round++) {
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini voice timeout')), 7500)
        );
        const geminiPromise = ai.models.generateContent({
          model: chatModel,
          contents,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            ...(tools ? { tools } : {}),
          },
        });

        const response: any = await Promise.race([geminiPromise, timeoutPromise]);
        if (response?.usageMetadata) {
          totalPromptTokens += Number(response.usageMetadata.promptTokenCount || 0);
          totalOutputTokens += Number(response.usageMetadata.responseTokenCount || 0);
        }

        const functionCalls = response?.functionCalls;
        if (functionCalls && functionCalls.length > 0 && toolsExecutor && allowToolsThisTurn) {
          const prevContent = response.candidates?.[0]?.content;
          if (prevContent) contents.push(prevContent);

          const responseParts: any[] = [];
          for (const call of functionCalls) {
            totalToolCalls += 1;
            const outcome = await toolsExecutor.executeTool(
              session.sessionId,
              call.name || '',
              (call.args || {}) as Record<string, unknown>,
              { sourceChannel: 'AI Voice' }
            );
            if (outcome.uiEvent) {
              collectedToolEvents.push(outcome.uiEvent);
            }
            responseParts.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: outcome.data,
              },
            });
          }
          contents.push({ role: 'user', parts: responseParts });
          continue;
        }

        rawReply = typeof response?.text === 'string' ? response.text.trim() : '';
        break;
      }

      if (rawReply) {
        const enforced = enforceCommercialPolicyOnOutput(rawReply, userMessage);
        if (enforced.enforced && onPolicyAudit) {
          await onPolicyAudit('output_blocked', enforced.reason).catch(() => {});
        }

        const newPresented = extractPresentedOptionsFromText(enforced.replyText);
        if (newPresented.length >= 2) {
          session.context.presentedOptions = newPresented;
        }
        const matched = allowToolsThisTurn
          ? matchCatalogServices(`${userMessage} ${enforced.replyText}`, 2)
          : [];
        if (matched.length > 0 && (!session.context.selectedService || isCorrection)) {
          session.context.selectedService = matched[0].title;
        }

        session.history = [
          ...dedupedHistory,
          { sender: 'user' as const, text: userMessage },
          { sender: 'ai' as const, text: enforced.replyText },
        ].slice(-24);
        session.turnCount += 1;
        session.lastActivityAt = Date.now();

        const latencyMs = Date.now() - startedAt;
        runtimeConfig?.recordTurnTelemetry({
          sessionId: session.sessionId,
          channel: 'turn_based',
          latencyMs,
          promptTokens: totalPromptTokens,
          outputTokens: totalOutputTokens,
          toolCalls: totalToolCalls,
          policyEnforced: enforced.enforced,
        });

        const resourceEvent = collectedToolEvents.find((e) => e.type === 'resource_links');
        const resourceLinks = Array.isArray(resourceEvent?.payload?.resourceLinks)
          ? (resourceEvent.payload.resourceLinks as CorporateResourceLink[])
          : undefined;

        const quickReplies = conversationalClass.isCasualOrPersonal
          ? []
          : newPresented.length >= 2
          ? newPresented.slice(0, 3)
          : allowToolsThisTurn
          ? ['Tell me more', 'Review Project Brief', 'Schedule Consultation']
          : [];

        return {
          sessionId: session.sessionId,
          replyText: enforced.replyText,
          spokenText: formatTextForVoiceSpeech(enforced.replyText),
          policyEnforced: enforced.enforced,
          detectedIntent: {
            isBookingIntent: bookingCheck.isBookingIntent,
            requiresBookingConfirmation: bookingCheck.requiresBookingConfirmation,
            isBriefIntent: /\b(project\s+brief|review\s+brief|proposal\s+summary)\b/i.test(userMessage),
            isHumanEscalation: detectHumanEscalationIntent(normalizedUtterance),
            isCorrection,
            executivePreference: session.context.executivePreference,
            recognizedIntentCategory: conversationalClass.isCasualOrPersonal
              ? conversationalClass.intent
              : 'gemini_contextual_reasoning',
          },
          updatedContext: { ...session.context },
          recommendedServiceIds: matched.map((m) => m.id),
          quickReplies,
          resourceLinks,
          toolEvents: collectedToolEvents.length > 0 ? collectedToolEvents : undefined,
          provider: chatModel,
          aiLatencyMs: latencyMs,
          language: effectiveLanguage,
          timestamp: new Date().toISOString(),
        };
      }
    } catch (err: any) {
      const classified = classifyGeminiProviderError(err);
      runtimeConfig?.recordFailure(
        `voice_${classified.category.toLowerCase()}`,
        'turn_based',
        `${classified.category}: ${classified.safeMessage}`
      );
    }
  }

  // 3. Context-aware deterministic fallback (preserves full multi-turn coherence & intent intelligence)
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

  const latencyMs = Date.now() - startedAt;
  runtimeConfig?.recordTurnTelemetry({
    sessionId: session.sessionId,
    channel: 'turn_based',
    latencyMs,
    policyEnforced: enforcedFallback.enforced,
  });

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
      isCorrection: fallback.isCorrection,
      isClarificationNeeded: fallback.isClarificationNeeded,
      executivePreference: session.context.executivePreference,
      recognizedIntentCategory: fallback.recognizedIntentCategory,
    },
    updatedContext: { ...session.context },
    recommendedServiceIds: fallback.recommendedServiceIds,
    quickReplies: fallback.quickReplies,
    provider: 'DESTRIA Contextual Voice Engine',
    aiLatencyMs: latencyMs,
    language,
    timestamp: new Date().toISOString(),
  };
}
