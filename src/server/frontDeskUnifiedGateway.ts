/**
 * DESTRIA TECH INC — Unified AI Front Desk Conversation Gateway
 * Directive: DTI-HELIX-IMPLEMENTATION-002 (Phases 05, 06, 07)
 *
 * Single canonical gateway serving BOTH website chat and website voice:
 * - Shared sessionId, HMAC-bound sessionToken (blocks cross-client reads/writes),
 *   ordered turn_sequence, idempotency deduplication, and seamless voice <-> chat switching.
 * - Human-like corporate receptionist intelligence (transparent AI identification,
 *   conversational cue detection, active acknowledgments, clarification prompts,
 *   multilingual EN/Filipino/Taglish support, zero human-emotion impersonation).
 * - Strict corporate governance: approved public KB ONLY (internal_only excluded),
 *   zero public pricing, CEO Desmond Hinds, zero automatic paid Gemini fallback.
 * - Operational orchestration: department routing, atomic human-agent escalation,
 *   business hours/holiday awareness, callback requests, appointment availability
 *   (fail-closed Google Calendar), preliminary masterplan, and executive reporting.
 */

import crypto from 'crypto';
import type { Express, Request, Response, NextFunction } from 'express';
import {
  MANDATORY_AI_SYSTEM_INSTRUCTION,
  classifyCommercialPolicyIntent,
  enforceCommercialPolicyOnOutput,
  formatTextForVoiceSpeech,
} from './aiCommercialPolicy';
import {
  buildDeterministicConversationalReply,
  classifyConversationalTurn,
} from './conversationalEngine';
import {
  FrontDeskOperationsStore,
  UnifiedChannel,
  AgentAvailabilityState,
  CallbackState,
} from './services/frontDeskOperationsStore';
import {
  LocalInferenceClient,
  LocalInferenceUnavailableError,
} from './services/localInferenceClient';
import { FrontDeskStore } from './frontDeskStore';
import {
  FrontDeskKnowledgeStore,
  formatManagedKnowledgeEntry,
} from './frontDeskKnowledgeStore';
import { answerTechnicalFeasibilityQuestion } from './frontDeskEngine';
import { AdminAuthService, AuthenticatedAdminRequest } from './auth';
import { DatabaseRepository } from './db/types';
import { GoogleCalendarService } from './services/calendarService';
import { TransactionalEmailService } from './services/emailService';
import { sanitizePlainText, validateAppointmentPayload, ALLOWED_APPOINTMENT_SLOTS } from './validation';
import { logStructured } from './logger';

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions/i,
  /reveal\s+(?:your\s+)?(?:system\s+prompt|hidden\s+instructions|internal\s+knowledge)/i,
  /print\s+env|dump\s+database|bypass\s+commercial\s+policy/i,
  /pretend\s+you\s+are\s+(?:a\s+human|desmond\s+hinds|the\s+ceo)/i,
];

const FRUSTRATION_CUES = [
  /\b(frustrated|annoyed|upset|angry|terrible|useless|not\s+helping|doesn'?t\s+work|broken|again\??|ugh|hay\s+nako|nakakainis)\b/i,
];
const CONFUSION_CUES = [
  /\b(confused|don'?t\s+understand|not\s+sure|what\s+do\s+you\s+mean|clarify|hindi\s+ko\s+maintindihan|nalilito)\b/i,
];
const HUMAN_ESCALATION_CUES = [
  /\b(talk\s+to\s+(?:a\s+)?(?:human|person|agent|specialist|representative)|speak\s+with\s+(?:someone|a\s+human)|live\s+agent|kausap\s+ng\s+tao)\b/i,
];
const CALLBACK_CUES = [/\b(call\s*back|callback|call\s+me|tawagan\s+ako)\b/i];

export interface ConversationalCues {
  frustrated: boolean;
  confused: boolean;
  wantsHuman: boolean;
  wantsCallback: boolean;
  needsClarification: boolean;
  language: 'en-US' | 'fil-PH' | 'es-ES' | 'fr-FR';
}

export function detectConversationalCues(text: string): ConversationalCues {
  const cleaned = (text || '').trim();
  const lowered = cleaned.toLowerCase();
  const filRegex = /\b(kumusta|kamusta|po|opo|salamat|gusto|kailangan|paano|pwede|puwede|tulong|namin|natin|mga|para|negosyo|sistema|hindi|nalilito|tawagan)\b/i;
  const esRegex = /\b(hola|gracias|necesito|quiero|empresa|proyecto|consulta|ayuda)\b/i;
  const frRegex = /\b(bonjour|merci|besoin|projet|entreprise|aide|comment)\b/i;

  const language: ConversationalCues['language'] = filRegex.test(lowered)
    ? 'fil-PH'
    : esRegex.test(lowered)
    ? 'es-ES'
    : frRegex.test(lowered)
    ? 'fr-FR'
    : 'en-US';

  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  const isVeryAmbiguous =
    wordCount <= 2 &&
    !/^(hi|hello|hey|kumusta|kamusta|hola|bonjour|thanks|salamat|yes|no|opo|ok|okay)$/i.test(
      cleaned.replace(/[.!?]+$/, '')
    );

  return {
    frustrated: FRUSTRATION_CUES.some((p) => p.test(cleaned)),
    confused: CONFUSION_CUES.some((p) => p.test(cleaned)),
    wantsHuman: HUMAN_ESCALATION_CUES.some((p) => p.test(cleaned)),
    wantsCallback: CALLBACK_CUES.some((p) => p.test(cleaned)),
    needsClarification: isVeryAmbiguous,
    language,
  };
}

export function containsPromptInjection(text: string): boolean {
  return PROMPT_INJECTION_PATTERNS.some((re) => re.test(text || ''));
}

export class FrontDeskSessionTokenSigner {
  private readonly secret: string;

  constructor(secret?: string) {
    this.secret =
      (secret || process.env.FRONTDESK_SESSION_TOKEN_SECRET || '').trim() ||
      crypto.randomBytes(32).toString('hex');
  }

  public issue(sessionId: string): string {
    const nonce = crypto.randomBytes(12).toString('hex');
    const payload = `${sessionId}.${nonce}`;
    const sig = crypto.createHmac('sha256', this.secret).update(payload).digest('hex');
    return `${payload}.${sig}`;
  }

  public verify(sessionId: string, token: string | undefined): boolean {
    if (!token || typeof token !== 'string') return false;
    const parts = token.trim().split('.');
    if (parts.length !== 3) return false;
    const [tokenSessionId, nonce, providedSig] = parts;
    if (tokenSessionId !== sessionId || !nonce || !providedSig) return false;
    const expectedSig = crypto
      .createHmac('sha256', this.secret)
      .update(`${tokenSessionId}.${nonce}`)
      .digest('hex');
    const a = Buffer.from(providedSig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
}

export interface UnifiedTurnExecutionResult {
  sessionId: string;
  turnId: string;
  turnSequence: number;
  channel: UnifiedChannel;
  replyText: string;
  spokenText: string;
  language: string;
  detectedIntent: string;
  department: { slug: string; name: string };
  cues: ConversationalCues;
  providerUsed: string;
  generationEpoch: number;
  deduplicated: boolean;
  policyEnforced: boolean;
  recommendedAction:
    | 'continue_conversation'
    | 'offer_clarification'
    | 'offer_human_escalation'
    | 'offer_callback'
    | 'offer_appointment'
    | 'offer_masterplan';
  businessHours: ReturnType<FrontDeskOperationsStore['evaluateBusinessHours']>;
  frontDeskDossier: ReturnType<FrontDeskStore['getOrCreateSession']>;
  latencyMs: number;
}

export interface UnifiedGatewayDependencies {
  db: DatabaseRepository;
  authService: AdminAuthService;
  frontDeskStore: FrontDeskStore;
  frontDeskKnowledgeStore: FrontDeskKnowledgeStore;
  operationsStore: FrontDeskOperationsStore;
  localInferenceClient: LocalInferenceClient;
  calendarService: GoogleCalendarService;
  emailService: TransactionalEmailService;
  tokenSigner: FrontDeskSessionTokenSigner;
  checkAiRateLimit: (req: Request) => boolean;
  checkInquiryRateLimit: (req: Request) => boolean;
}

export class FrontDeskUnifiedGateway {
  constructor(private readonly deps: UnifiedGatewayDependencies) {}

  public buildReceptionistSystemPrompt(params: {
    language: string;
    departmentName: string;
    businessHoursOpen: boolean;
    cues: ConversationalCues;
    verifiedClientEmail: string | null;
    channel: UnifiedChannel;
  }): string {
    const isVoice = params.channel.includes('voice');
    const cueGuidance = params.cues.frustrated
      ? 'The visitor sounds frustrated or urgent. Acknowledge their concern calmly and concisely without claiming human feelings, and offer immediate practical resolution or human specialist escalation.'
      : params.cues.confused
      ? 'The visitor appears uncertain or needs clearer guidance. Explain concisely in plain language and ask one focused clarifying question.'
      : params.cues.needsClarification
      ? 'The visitor message is brief or ambiguous. Politely ask one concise clarifying question so you can assist accurately.'
      : 'Maintain warm, natural, executive corporate receptionist pacing with concise acknowledgments.';

    return `${MANDATORY_AI_SYSTEM_INSTRUCTION}

CORPORATE AI FRONT DESK RECEPTIONIST RULES (DESTRIA TECH INC):
- Transparently identify as the DESTRIA TECH INC AI Front Desk Receptionist when asked or greeting; NEVER impersonate a human employee, NEVER claim to possess human emotions, and NEVER infer sensitive personal traits from voice.
- Active Department Context: ${params.departmentName}.
- Current Corporate Desk Hours Status: ${params.businessHoursOpen ? 'OPEN (live specialist escalation available when agents are online)' : 'CLOSED / HOLIDAY (offer structured callback scheduling or executive consultation booking honestly)'}.
- Returning Client Verification: ${params.verifiedClientEmail ? `Verified client email on session: ${params.verifiedClientEmail}` : 'Visitor not yet verified — never disclose private records belonging to any other client.'}.
- Language Adaptation: Respond naturally in ${params.language === 'fil-PH' ? 'natural Filipino / Taglish' : params.language === 'es-ES' ? 'Spanish' : params.language === 'fr-FR' ? 'French' : 'clear, professional English'}.
- Conversational Pacing: ${cueGuidance}
- ${isVoice ? 'VOICE MODE: Respond in 1 to 3 natural spoken sentences with zero markdown, zero asterisks, and zero bullet lists so speech synthesis sounds fluid and easily interruptible.' : 'CHAT MODE: Keep replies clear, structured, helpful, and focused on next steps without aggressive sales pressure.'}
- NEVER fabricate appointment availability, human transfer confirmations, staff names, or commercial pricing/approvals.`;
  }

  public async executeUnifiedTurn(params: {
    sessionId: string;
    channel: UnifiedChannel;
    userMessage: string;
    language?: string;
    idempotencyKey?: string;
    requestId?: string;
    correlationId?: string;
  }): Promise<UnifiedTurnExecutionResult> {
    const startedAt = Date.now();
    const cleanMessage = sanitizePlainText(params.userMessage, 2500);
    if (!cleanMessage) {
      throw new Error('Message content is required.');
    }

    // 1. Idempotency replay deduplication
    if (params.idempotencyKey) {
      const prior = this.deps.operationsStore.findTurnsByIdempotencyKey(
        params.sessionId,
        params.idempotencyKey
      );
      if (prior && prior.length >= 2) {
        const aiTurn = prior[prior.length - 1];
        const meta = this.deps.operationsStore.getOrCreateSessionMeta(params.sessionId, params.channel);
        const dept = this.deps.operationsStore.routeDepartmentForMessage(
          cleanMessage,
          meta.activeDepartmentSlug
        );
        const bh = this.deps.operationsStore.evaluateBusinessHours();
        const dossier = this.deps.frontDeskStore.getOrCreateSession(params.sessionId);
        return {
          sessionId: params.sessionId,
          turnId: aiTurn.turnId,
          turnSequence: aiTurn.turnSequence,
          channel: aiTurn.sourceChannel,
          replyText: aiTurn.messageText,
          spokenText: formatTextForVoiceSpeech(aiTurn.messageText),
          language: aiTurn.language,
          detectedIntent: aiTurn.detectedIntent || 'general_reception',
          department: { slug: dept.slug, name: dept.name },
          cues: detectConversationalCues(cleanMessage),
          providerUsed: aiTurn.providerUsed || 'cached_idempotent',
          generationEpoch: meta.generationEpoch,
          deduplicated: true,
          policyEnforced: false,
          recommendedAction: 'continue_conversation',
          businessHours: bh,
          frontDeskDossier: dossier,
          latencyMs: Date.now() - startedAt,
        };
      }
    }

    // 2. Establish session metadata, conversational cues, department & business hours
    const cues = detectConversationalCues(cleanMessage);
    const meta = this.deps.operationsStore.getOrCreateSessionMeta(
      params.sessionId,
      params.channel,
      params.language || cues.language
    );
    const resolvedLanguage = params.language || cues.language || meta.preferredLanguage || 'en-US';
    const department = this.deps.operationsStore.routeDepartmentForMessage(
      cleanMessage,
      meta.activeDepartmentSlug
    );
    const businessHours = this.deps.operationsStore.evaluateBusinessHours();
    const priorTurns = this.deps.operationsStore.getUnifiedHistory(params.sessionId, { limit: 16 });
    const historyForClassifier = priorTurns.map((t) => ({
      sender: (t.sender === 'user' ? 'user' : 'ai') as 'user' | 'ai',
      text: t.messageText,
    }));
    const turnClass = classifyConversationalTurn(cleanMessage, historyForClassifier);

    // 3. Retrieve ONLY approved PUBLIC knowledge documents (strictly excludes `internal_only`)
    const approvedPublicKb = this.deps.frontDeskKnowledgeStore.retrieveApprovedPublicKnowledge(
      cleanMessage,
      { topK: 4 }
    );
    const kbSnippets = approvedPublicKb.map((hit) => formatManagedKnowledgeEntry(hit.entry));

    // 4. Update shared Front Desk dossier across BOTH voice and chat channels
    const frontDeskDossier = this.deps.frontDeskStore.getPersistenceStatus().durable
      ? await this.deps.frontDeskStore
          .recordTurnDurable(params.sessionId, cleanMessage, {
            isProjectDiscoveryTurn: turnClass.shouldAllowEnterpriseTools,
            detectedLanguage: resolvedLanguage,
          })
          .catch(() =>
            this.deps.frontDeskStore.recordTurn(params.sessionId, cleanMessage, {
              isProjectDiscoveryTurn: turnClass.shouldAllowEnterpriseTools,
              detectedLanguage: resolvedLanguage,
            })
          )
      : this.deps.frontDeskStore.recordTurn(params.sessionId, cleanMessage, {
          isProjectDiscoveryTurn: turnClass.shouldAllowEnterpriseTools,
          detectedLanguage: resolvedLanguage,
        });

    // 5. Commercial policy pre-check (zero public pricing / CEO identity / corporate guardrails)
    const policyIntent = classifyCommercialPolicyIntent(cleanMessage);
    let replyText = '';
    let providerUsed = 'governed_deterministic';
    let policyEnforced = false;

    if (policyIntent.trigger && policyIntent.approvedResponse) {
      replyText = policyIntent.approvedResponse;
      providerUsed = 'commercial_policy_guard';
      policyEnforced = true;
    } else if (cues.needsClarification) {
      replyText =
        resolvedLanguage === 'fil-PH'
          ? 'Salamat po sa mensahe ninyo. Maaari po ba ninyong linawin nang kaunti kung tungkol saan ang proyekto, konsultasyon, o tanong ninyo para ma-route ko kayo nang tama?'
          : 'Thank you for reaching out to DESTRIA TECH INC. Could you share a little more detail about what you are looking to build or discuss so I can route you accurately?';
      providerUsed = 'receptionist_clarification';
    } else if (
      this.deps.localInferenceClient.providerMode === 'local_inference' &&
      this.deps.localInferenceClient.isConfigured
    ) {
      // PRIMARY LOCAL INFERENCE PATH (Ollama Qwen2.5-7B-Instruct — NEVER falls back to paid Gemini!)
      const systemPrompt = this.buildReceptionistSystemPrompt({
        language: resolvedLanguage,
        departmentName: department.name,
        businessHoursOpen: businessHours.isOpen,
        cues,
        verifiedClientEmail: meta.verifiedClientEmail,
        channel: params.channel,
      });
      try {
        const llmRes = await this.deps.localInferenceClient.generateReply({
          sessionId: params.sessionId,
          requestId: params.requestId,
          systemPrompt,
          userMessage: cleanMessage,
          history: priorTurns.slice(-12).map((t) => ({
            role: t.sender === 'user' ? 'user' : 'assistant',
            content: t.messageText,
          })),
          knowledgeContext: kbSnippets,
        });
        replyText = llmRes.replyText;
        providerUsed = `local_ollama:${llmRes.model}`;
      } catch (err: any) {
        logStructured('warn', 'local_inference_fallback_to_governed_deterministic', {
          correlationId: params.correlationId,
          sessionId: params.sessionId,
          code: err instanceof LocalInferenceUnavailableError ? err.code : 'LOCAL_INFERENCE_ERROR',
        });
        // Safe non-paid governed deterministic fallback (NEVER invokes paid Gemini!)
        replyText = this.buildGovernedReceptionistReply({
          cleanMessage,
          resolvedLanguage,
          departmentName: department.name,
          businessHours,
          cues,
          historyForClassifier,
          kbSnippets,
          localUnavailableNote: true,
        });
        providerUsed = 'governed_deterministic_local_offline';
      }
    } else {
      replyText = this.buildGovernedReceptionistReply({
        cleanMessage,
        resolvedLanguage,
        departmentName: department.name,
        businessHours,
        cues,
        historyForClassifier,
        kbSnippets,
        localUnavailableNote: false,
      });
      providerUsed = 'governed_deterministic';
    }

    // 6. Post-output commercial policy & non-impersonation enforcement
    const enforced = enforceCommercialPolicyOnOutput(replyText, cleanMessage);
    if (enforced.enforced) {
      replyText = enforced.replyText;
      policyEnforced = true;
    }

    // 7. Determine honest next recommended operational action
    const recommendedAction: UnifiedTurnExecutionResult['recommendedAction'] = cues.wantsCallback
      ? 'offer_callback'
      : cues.wantsHuman || cues.frustrated
      ? businessHours.isOpen && this.deps.operationsStore.hasAvailableAgentForDepartment(department.slug)
        ? 'offer_human_escalation'
        : 'offer_callback'
      : cues.needsClarification
      ? 'offer_clarification'
      : /\b(book|schedule|appointment|consultation|meeting)\b/i.test(cleanMessage)
      ? 'offer_appointment'
      : frontDeskDossier.completeness.readyForSummary
      ? 'offer_masterplan'
      : 'continue_conversation';

    const turnId = `turn-${crypto.randomUUID().slice(0, 12)}`;
    const latencyMs = Date.now() - startedAt;

    const { assistantTurn } = await this.deps.operationsStore.recordUnifiedExchange({
      sessionKey: params.sessionId,
      turnId,
      sourceChannel: params.channel,
      language: resolvedLanguage,
      userMessage: cleanMessage,
      assistantReply: replyText,
      detectedIntent: turnClass.intent,
      departmentSlug: department.slug,
      providerUsed,
      idempotencyKey: params.idempotencyKey,
      latencyMs,
      metadata: {
        cues,
        policyEnforced,
        recommendedAction,
      },
    });

    this.deps.operationsStore.updateSessionMeta(params.sessionId, {
      activeChannel: params.channel,
      preferredLanguage: resolvedLanguage,
      activeDepartmentSlug: department.slug,
      lastProviderUsed: providerUsed,
      customerMemory: {
        lastIntent: turnClass.intent,
        lastDepartmentSlug: department.slug,
        lastChannel: params.channel,
      },
    });

    return {
      sessionId: params.sessionId,
      turnId,
      turnSequence: assistantTurn.turnSequence,
      channel: params.channel,
      replyText,
      spokenText: formatTextForVoiceSpeech(replyText),
      language: resolvedLanguage,
      detectedIntent: turnClass.intent,
      department: { slug: department.slug, name: department.name },
      cues,
      providerUsed,
      generationEpoch: meta.generationEpoch,
      deduplicated: false,
      policyEnforced,
      recommendedAction,
      businessHours,
      frontDeskDossier,
      latencyMs,
    };
  }

  private buildGovernedReceptionistReply(params: {
    cleanMessage: string;
    resolvedLanguage: string;
    departmentName: string;
    businessHours: ReturnType<FrontDeskOperationsStore['evaluateBusinessHours']>;
    cues: ConversationalCues;
    historyForClassifier: Array<{ sender: 'user' | 'ai'; text: string }>;
    kbSnippets: string[];
    localUnavailableNote: boolean;
  }): string {
    if (params.cues.wantsCallback) {
      return params.resolvedLanguage === 'fil-PH'
        ? `Maari po tayong mag-log ng callback request para sa ${params.departmentName}. Pakibigay po ang inyong pangalan, contact email o phone, at preferred callback window.`
        : `I can register a callback request with our ${params.departmentName} team right away. Please share your name, preferred email or phone number, and your preferred callback window.`;
    }
    if (params.cues.wantsHuman) {
      if (!params.businessHours.isOpen) {
        return params.resolvedLanguage === 'fil-PH'
          ? `Sarado po ang aming live corporate desk sa ngayon (${params.businessHours.holidayName || 'outside business hours'}). Pwede po akong mag-record ng callback request o mag-schedule ng executive consultation para sa ${params.departmentName}.`
          : `Our live corporate desk is currently closed (${params.businessHours.holidayName || 'outside business hours'}). I can schedule an executive consultation or log a priority callback request for our ${params.departmentName} team.`;
      }
      return params.resolvedLanguage === 'fil-PH'
        ? `Naiintindihan ko po na nais ninyong makipag-usap sa human specialist sa ${params.departmentName}. Maaari po kayong mag-click ng "Request Human Specialist" upang ma-check agad ang live availability o mag-set ng callback.`
        : `I understand you would like to connect with a human specialist in ${params.departmentName}. You can trigger a live specialist handoff now—if all specialists are currently engaged, I will immediately offer a structured callback request.`;
    }

    const techFeasibility = answerTechnicalFeasibilityQuestion(params.cleanMessage);
    if (techFeasibility) {
      return `${techFeasibility} This inquiry aligns with ${params.departmentName}.`;
    }

    const turnClassification = classifyConversationalTurn(
      params.cleanMessage,
      params.historyForClassifier,
      { preferredLanguage: params.resolvedLanguage }
    );
    const deterministic = buildDeterministicConversationalReply(
      params.cleanMessage,
      turnClassification
    );
    const ackPrefix = params.cues.frustrated
      ? 'I understand this is important and want to make sure we resolve it clearly. '
      : '';
    const offlineSuffix = params.localUnavailableNote
      ? ' (Note: Live local AI inference is temporarily offline, so I am assisting in governed Front Desk mode.)'
      : '';
    const baseReply =
      deterministic?.replyText ||
      `Thank you for contacting DESTRIA TECH INC (${params.departmentName}). I am the AI Front Desk Officer—please share a few details about your project goals, timeline, or preferred consultation window and I will help organize the next step.`;
    return `${ackPrefix}${baseReply}${offlineSuffix}`;
  }
}

function getSessionTokenFromReq(req: Request): string | undefined {
  const headerToken = req.headers['x-frontdesk-session-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) return headerToken.trim();
  if (typeof req.query.sessionToken === 'string' && req.query.sessionToken.trim()) {
    return req.query.sessionToken.trim();
  }
  return undefined;
}

export function mountFrontDeskUnifiedGateway(
  app: Express,
  deps: UnifiedGatewayDependencies
): FrontDeskUnifiedGateway {
  const gateway = new FrontDeskUnifiedGateway(deps);

  const requireValidSessionToken = (req: Request, res: Response): string | null => {
    const sessionId = sanitizePlainText(req.params.id, 100);
    if (!sessionId) {
      res.status(400).json({
        error: { code: 'VALIDATION_FAILED', message: 'Valid session ID is required.', retryable: false },
      });
      return null;
    }
    const token = getSessionTokenFromReq(req);
    if (!deps.tokenSigner.verify(sessionId, token)) {
      res.status(403).json({
        error: {
          code: 'UNAUTHORIZED_SESSION',
          message: 'Valid session-scoped X-FrontDesk-Session-Token is required for this session.',
          retryable: false,
        },
      });
      return null;
    }
    return sessionId;
  };

  // -------------------------------------------------------------------------
  // 1. Unified Public Front Desk Gateway Routes (Section 16)
  // -------------------------------------------------------------------------

  // POST /api/frontdesk/sessions — Create unified voice + chat session
  app.post('/api/frontdesk/sessions', async (req: Request & { correlationId?: string }, res: Response) => {
    if (!deps.checkAiRateLimit(req)) {
      res.status(429).json({
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many session requests.', retryable: true },
      });
      return;
    }

    const rawChannel = sanitizePlainText(req.body?.channel, 40);
    const channel: UnifiedChannel =
      rawChannel === 'ai_frontdesk_voice' ||
      rawChannel === 'widget_chat' ||
      rawChannel === 'widget_voice'
        ? rawChannel
        : 'ai_frontdesk_chat';
    const language = sanitizePlainText(req.body?.language, 16) || 'en-US';
    const requestedSessionId = sanitizePlainText(req.body?.sessionId, 80);
    const sessionId =
      requestedSessionId && /^dti-[a-zA-Z0-9_-]{6,64}$/.test(requestedSessionId)
        ? requestedSessionId
        : `dti-fd-${crypto.randomUUID().slice(0, 12)}`;

    const consentGranted = Boolean(req.body?.consentAccepted);
    const meta = deps.operationsStore.getOrCreateSessionMeta(sessionId, channel, language);
    if (consentGranted) {
      const ipHash = crypto
        .createHash('sha256')
        .update(req.ip || 'unknown')
        .digest('hex')
        .slice(0, 24);
      deps.operationsStore.recordConsent({
        sessionKey: sessionId,
        consentType: channel.includes('voice') ? 'voice_processing' : 'transcript_storage',
        granted: true,
        ipHash,
      });
    }

    const dossier = deps.frontDeskStore.getPersistenceStatus().durable
      ? await deps.frontDeskStore.getOrCreateSessionDurable(sessionId).catch(() =>
          deps.frontDeskStore.getOrCreateSession(sessionId)
        )
      : deps.frontDeskStore.getOrCreateSession(sessionId);

    const sessionToken = deps.tokenSigner.issue(sessionId);
    const businessHours = deps.operationsStore.evaluateBusinessHours();
    const localHealth = await deps.localInferenceClient.probeHealth();

    const greeting =
      language.startsWith('fil')
        ? 'Maligayang pagdating sa DESTRIA TECH INC! Ako po ang AI Front Desk Receptionist. Pwede po tayong mag-chat o mag-voice nang walang nawawalang konteksto—paano po ako makakatulong ngayon?'
        : 'Welcome to DESTRIA TECH INC. I am the AI Front Desk Receptionist. You can speak or chat with me seamlessly in this session—how may I assist you today?';

    res.status(201).json({
      success: true,
      sessionId,
      sessionToken,
      channel: meta.activeChannel,
      language,
      greeting,
      businessHours,
      providerMode: deps.localInferenceClient.providerMode,
      localInferenceReady: localHealth.ready,
      voiceStreamPath: '/api/frontdesk/voice/stream',
      departments: deps.operationsStore.listDepartments(false).map((d) => ({
        slug: d.slug,
        name: d.name,
        description: d.description,
      })),
      frontDeskDossier: dossier,
    });
  });

  // GET /api/frontdesk/sessions/:id — Scoped session state restoration
  app.get('/api/frontdesk/sessions/:id', async (req: Request, res: Response) => {
    const sessionId = requireValidSessionToken(req, res);
    if (!sessionId) return;

    const meta = deps.operationsStore.getSessionMeta(sessionId);
    if (!meta) {
      res.status(404).json({
        error: { code: 'SESSION_NOT_FOUND', message: 'Unified Front Desk session not found.', retryable: false },
      });
      return;
    }

    const dossier = deps.frontDeskStore.getPersistenceStatus().durable
      ? await deps.frontDeskStore.getOrCreateSessionDurable(sessionId).catch(() =>
          deps.frontDeskStore.getOrCreateSession(sessionId)
        )
      : deps.frontDeskStore.getOrCreateSession(sessionId);

    res.json({
      success: true,
      sessionId,
      metadata: meta,
      activeAssignment: deps.operationsStore.getActiveAssignmentForSession(sessionId),
      businessHours: deps.operationsStore.evaluateBusinessHours(),
      consents: deps.operationsStore.listConsentsForSession(sessionId),
      frontDeskDossier: dossier,
    });
  });

  // POST /api/frontdesk/sessions/:id/messages — Ordered unified chat/text turn
  app.post('/api/frontdesk/sessions/:id/messages', async (req: Request & { correlationId?: string }, res: Response) => {
    if (!deps.checkAiRateLimit(req)) {
      res.status(429).json({
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded.', retryable: true },
      });
      return;
    }
    const sessionId = requireValidSessionToken(req, res);
    if (!sessionId) return;

    const message = sanitizePlainText(req.body?.message, 2500);
    if (!message) {
      res.status(400).json({
        error: { code: 'VALIDATION_FAILED', message: 'Non-empty message is required.', retryable: false },
      });
      return;
    }
    if (containsPromptInjection(message)) {
      await deps.db
        .writeAuditLog({
          correlationId: req.correlationId,
          actor: 'visitor',
          actorRole: 'public',
          action: 'frontdesk_prompt_injection_blocked',
          entityType: 'ai_governance',
          entityId: sessionId,
          details: { channel: 'chat' },
        })
        .catch(() => {});
      res.status(400).json({
        error: {
          code: 'PROMPT_INJECTION_BLOCKED',
          message: 'Your message could not be processed due to security policy restrictions.',
          retryable: false,
        },
      });
      return;
    }

    const rawChannel = sanitizePlainText(req.body?.channel, 40);
    const channel: UnifiedChannel =
      rawChannel === 'widget_chat' || rawChannel === 'ai_frontdesk_voice' || rawChannel === 'widget_voice'
        ? rawChannel
        : 'ai_frontdesk_chat';
    const language = sanitizePlainText(req.body?.language, 16) || undefined;
    const idempotencyKey =
      sanitizePlainText(req.headers['idempotency-key'] as string, 128) ||
      sanitizePlainText(req.body?.idempotencyKey, 128) ||
      undefined;

    const result = await gateway.executeUnifiedTurn({
      sessionId,
      channel,
      userMessage: message,
      language,
      idempotencyKey,
      requestId: req.correlationId,
      correlationId: req.correlationId,
    });

    res.status(200).json({ success: true, ...result });
  });

  // GET /api/frontdesk/sessions/:id/history — Unified voice + chat ordered history
  app.get('/api/frontdesk/sessions/:id/history', (req: Request, res: Response) => {
    const sessionId = requireValidSessionToken(req, res);
    if (!sessionId) return;

    const afterSequence = Number(req.query.afterSequence ?? 0);
    const limit = Number(req.query.limit ?? 100);
    const turns = deps.operationsStore.getUnifiedHistory(sessionId, {
      afterSequence: Number.isFinite(afterSequence) ? afterSequence : 0,
      limit: Number.isFinite(limit) ? limit : 100,
    });

    res.json({
      success: true,
      sessionId,
      count: turns.length,
      turns,
    });
  });

  // POST /api/frontdesk/sessions/:id/voice — Single-turn HTTP audio upload -> local STT -> Unified Gateway -> local TTS
  app.post('/api/frontdesk/sessions/:id/voice', async (req: Request & { correlationId?: string }, res: Response) => {
    if (!deps.checkAiRateLimit(req)) {
      res.status(429).json({
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded.', retryable: true },
      });
      return;
    }
    const sessionId = requireValidSessionToken(req, res);
    if (!sessionId) return;

    const audioBase64 = typeof req.body?.audioBase64 === 'string' ? req.body.audioBase64.trim() : '';
    const mimeType = sanitizePlainText(req.body?.mimeType, 60).toLowerCase() || 'audio/wav';
    const allowedMimeTypes = new Set(['audio/wav', 'audio/x-wav', 'audio/pcm', 'audio/webm', 'audio/ogg']);
    if (!allowedMimeTypes.has(mimeType.split(';')[0])) {
      res.status(415).json({
        error: {
          code: 'UNSUPPORTED_AUDIO_FORMAT',
          message: `Unsupported audio format "${mimeType}". Use audio/wav or audio/pcm.`,
          retryable: false,
        },
      });
      return;
    }
    if (!audioBase64) {
      res.status(400).json({
        error: { code: 'VALIDATION_FAILED', message: 'audioBase64 payload is required.', retryable: false },
      });
      return;
    }

    const decodedBytes = Buffer.from(audioBase64, 'base64');
    const maxBytes = Number(process.env.FRONTDESK_MAX_AUDIO_BYTES || 5 * 1024 * 1024);
    if (decodedBytes.length > maxBytes) {
      res.status(413).json({
        error: {
          code: 'AUDIO_PAYLOAD_TOO_LARGE',
          message: `Audio payload exceeds ${Math.floor(maxBytes / (1024 * 1024))} MB limit.`,
          retryable: false,
        },
      });
      return;
    }

    if (!deps.localInferenceClient.isConfigured) {
      res.status(503).json({
        error: {
          code: 'INFERENCE_SERVICE_UNAVAILABLE',
          message: 'Local AI voice inference service is not configured. Please continue in text chat or request a callback.',
          retryable: true,
        },
      });
      return;
    }

    try {
      const sampleRate = Number(req.body?.sampleRate || 16000);
      const languageHint = sanitizePlainText(req.body?.language, 16) || undefined;
      const stt = await deps.localInferenceClient.transcribeAudio({
        sessionId,
        requestId: req.correlationId,
        audioBase64,
        sampleRate: Number.isFinite(sampleRate) ? sampleRate : 16000,
        languageHint,
      });

      if (!stt.text.trim()) {
        res.status(200).json({
          success: true,
          sessionId,
          transcript: '',
          noSpeechDetected: true,
          language: stt.language,
        });
        return;
      }

      if (containsPromptInjection(stt.text)) {
        res.status(400).json({
          error: {
            code: 'PROMPT_INJECTION_BLOCKED',
            message: 'Spoken request blocked by corporate security policy.',
            retryable: false,
          },
        });
        return;
      }

      const idempotencyKey =
        sanitizePlainText(req.headers['idempotency-key'] as string, 128) ||
        sanitizePlainText(req.body?.idempotencyKey, 128) ||
        undefined;

      const turn = await gateway.executeUnifiedTurn({
        sessionId,
        channel: 'ai_frontdesk_voice',
        userMessage: stt.text,
        language: stt.language,
        idempotencyKey,
        requestId: req.correlationId,
        correlationId: req.correlationId,
      });

      let audioResponse: { audioBase64: string; mimeType: string; sampleRate: number } | null = null;
      try {
        const tts = await deps.localInferenceClient.synthesizeSpeech({
          requestId: req.correlationId,
          text: turn.spokenText,
          language: turn.language,
          format: 'wav',
        });
        audioResponse = {
          audioBase64: tts.audioBase64,
          mimeType: tts.mimeType,
          sampleRate: tts.sampleRate,
        };
      } catch {
        // Return transcript + text reply honestly even if TTS synthesis fails
        audioResponse = null;
      }

      res.status(200).json({
        success: true,
        transcript: stt.text,
        sttLatencyMs: stt.latencyMs,
        audio: audioResponse,
        ...turn,
      });
    } catch (err: any) {
      const code = err instanceof LocalInferenceUnavailableError ? err.code : 'INFERENCE_SERVICE_UNAVAILABLE';
      const status = err instanceof LocalInferenceUnavailableError ? err.statusCode : 503;
      res.status(status).json({
        error: {
          code,
          message: err?.message || 'Voice inference service is temporarily unavailable.',
          retryable: true,
        },
      });
    }
  });

  // POST /api/frontdesk/sessions/:id/interrupt — Barge-in cancellation & stale audio flush
  app.post('/api/frontdesk/sessions/:id/interrupt', async (req: Request, res: Response) => {
    const sessionId = requireValidSessionToken(req, res);
    if (!sessionId) return;

    const generationEpoch = deps.operationsStore.incrementGenerationEpoch(sessionId);
    const requestId = sanitizePlainText(req.body?.requestId, 128);
    let remoteCancelled = false;
    if (requestId) {
      remoteCancelled = await deps.localInferenceClient.cancelRequest(requestId);
    }

    res.status(200).json({
      success: true,
      sessionId,
      interrupted: true,
      generationEpoch,
      remoteCancelled,
    });
  });

  // POST /api/frontdesk/sessions/:id/escalate — Atomic human-agent handoff or honest callback recommendation
  app.post('/api/frontdesk/sessions/:id/escalate', async (req: Request & { correlationId?: string }, res: Response) => {
    if (!deps.checkInquiryRateLimit(req)) {
      res.status(429).json({
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded.', retryable: true },
      });
      return;
    }
    const sessionId = requireValidSessionToken(req, res);
    if (!sessionId) return;

    const meta = deps.operationsStore.getOrCreateSessionMeta(sessionId);
    const departmentSlug =
      sanitizePlainText(req.body?.departmentSlug, 80) || meta.activeDepartmentSlug || 'client_support';
    const reason = sanitizePlainText(req.body?.reason, 1000) || 'Visitor requested human specialist assistance.';
    const idempotencyKey =
      sanitizePlainText(req.headers['idempotency-key'] as string, 128) ||
      sanitizePlainText(req.body?.idempotencyKey, 128) ||
      `esc-${sessionId}-${Date.now()}`;

    const businessHours = deps.operationsStore.evaluateBusinessHours();
    if (!businessHours.isOpen) {
      res.status(200).json({
        success: true,
        status: 'callback_recommended',
        reason: businessHours.reason === 'holiday'
          ? `DESTRIA corporate desk is closed for ${businessHours.holidayName}. Please submit a callback request.`
          : 'DESTRIA live specialists are currently outside business hours. Please submit a callback request.',
        businessHours,
      });
      return;
    }

    const claim = deps.operationsStore.claimHumanAgentAtomic({
      sessionKey: sessionId,
      departmentSlug,
      preferredLanguage: meta.preferredLanguage,
      expirySeconds: Number(process.env.FRONTDESK_ASSIGNMENT_EXPIRY_SEC || 90),
      idempotencyKey,
    });

    await deps.db
      .writeAuditLog({
        correlationId: req.correlationId,
        actor: 'frontdesk_unified_gateway',
        actorRole: 'system',
        action: claim.claimed ? 'frontdesk_human_agent_offered' : 'frontdesk_human_agent_unavailable',
        entityType: 'frontdesk_agent_assignments',
        entityId: claim.claimed ? claim.assignment.id : sessionId,
        details: { sessionId, departmentSlug, reason },
      })
      .catch(() => {});

    if (!claim.claimed) {
      res.status(200).json({
        success: true,
        status: 'callback_recommended',
        reason: claim.reason,
        businessHours,
      });
      return;
    }

    res.status(201).json({
      success: true,
      status: 'assigned',
      assignment: claim.assignment,
      businessHours,
    });
  });

  // POST /api/frontdesk/sessions/:id/callback — Idempotent structured callback request
  app.post('/api/frontdesk/sessions/:id/callback', async (req: Request & { correlationId?: string }, res: Response) => {
    if (!deps.checkInquiryRateLimit(req)) {
      res.status(429).json({
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded.', retryable: true },
      });
      return;
    }
    const sessionId = requireValidSessionToken(req, res);
    if (!sessionId) return;

    const visitorName = sanitizePlainText(req.body?.visitorName, 160);
    const visitorEmail = sanitizePlainText(req.body?.visitorEmail, 180);
    const visitorPhone = sanitizePlainText(req.body?.visitorPhone, 60);
    const reason = sanitizePlainText(req.body?.reason, 1000);
    const departmentSlug = sanitizePlainText(req.body?.departmentSlug, 80) || 'client_support';
    const preferredWindow = sanitizePlainText(req.body?.preferredWindow, 120) || 'Next available business window';
    const timezone = sanitizePlainText(req.body?.timezone, 64) || 'Asia/Manila';

    if (!visitorName || (!visitorEmail && !visitorPhone) || !reason) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'visitorName, reason, and either visitorEmail or visitorPhone are required.',
          retryable: false,
        },
      });
      return;
    }

    const idempotencyKey =
      sanitizePlainText(req.headers['idempotency-key'] as string, 128) ||
      sanitizePlainText(req.body?.idempotencyKey, 128) ||
      `cb-${sessionId}-${crypto.randomUUID().slice(0, 8)}`;

    const { record, deduplicated } = deps.operationsStore.createCallbackRequest({
      sessionKey: sessionId,
      idempotencyKey,
      departmentSlug,
      visitorName,
      visitorEmail: visitorEmail || undefined,
      visitorPhone: visitorPhone || undefined,
      preferredWindow,
      timezone,
      reason,
    });

    if (!deduplicated) {
      await deps.db
        .writeAuditLog({
          correlationId: req.correlationId,
          actor: visitorEmail || visitorName,
          actorRole: 'public',
          action: 'frontdesk_callback_requested',
          entityType: 'frontdesk_callback_requests',
          entityId: record.referenceCode,
          details: { sessionId, departmentSlug, preferredWindow, timezone },
        })
        .catch(() => {});
    }

    res.status(deduplicated ? 200 : 201).json({
      success: true,
      deduplicated,
      callback: record,
    });
  });

  // POST /api/frontdesk/sessions/:id/consent — Record explicit privacy/voice consent
  app.post('/api/frontdesk/sessions/:id/consent', (req: Request, res: Response) => {
    const sessionId = requireValidSessionToken(req, res);
    if (!sessionId) return;
    const rawType = sanitizePlainText(req.body?.consentType, 40);
    const consentType =
      rawType === 'voice_processing' ||
      rawType === 'recording' ||
      rawType === 'transcript_storage' ||
      rawType === 'privacy_policy'
        ? rawType
        : 'voice_processing';
    const granted = req.body?.granted !== false;
    const ipHash = crypto
      .createHash('sha256')
      .update(req.ip || 'unknown')
      .digest('hex')
      .slice(0, 24);
    const record = deps.operationsStore.recordConsent({
      sessionKey: sessionId,
      consentType,
      granted,
      ipHash,
    });
    res.status(201).json({ success: true, consent: record });
  });

  // DELETE /api/frontdesk/sessions/:id — Privacy deletion (cascades draft turns & pending tokens)
  app.delete('/api/frontdesk/sessions/:id', async (req: Request & { correlationId?: string }, res: Response) => {
    const sessionId = requireValidSessionToken(req, res);
    if (!sessionId) return;

    deps.operationsStore.deleteSessionOperationalData(sessionId);
    const deleted = await deps.frontDeskStore.deleteSessionDurable(sessionId).catch(() => false);
    res.status(200).json({
      success: true,
      sessionId,
      deleted: true,
      dossierDeleted: deleted,
    });
  });

  // GET /api/frontdesk/departments — Public active corporate departments (zero internal employee emails!)
  app.get('/api/frontdesk/departments', (_req: Request, res: Response) => {
    const bh = deps.operationsStore.evaluateBusinessHours();
    const departments = deps.operationsStore.listDepartments(false).map((d) => ({
      slug: d.slug,
      name: d.name,
      description: d.description,
      supportedLanguages: d.supportedLanguages,
      defaultSlaMinutes: d.defaultSlaMinutes,
      currentlyOpen: bh.isOpen,
      liveSpecialistAvailable: bh.isOpen && deps.operationsStore.hasAvailableAgentForDepartment(d.slug),
    }));
    res.json({ success: true, businessHours: bh, departments });
  });

  // GET /api/frontdesk/availability — Fail-closed DB + Google Calendar availability (never fabricates open slots!)
  app.get('/api/frontdesk/availability', async (req: Request, res: Response) => {
    const date = sanitizePlainText(req.query.date as string, 20);
    const timezone = sanitizePlainText(req.query.timezone as string, 64) || 'Asia/Manila';
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({
        error: { code: 'VALIDATION_FAILED', message: 'date query parameter (YYYY-MM-DD) is required.', retryable: false },
      });
      return;
    }

    try {
      const bookedSlots = await deps.db.getBookedSlotsForDate(date);
      const bookedSet = new Set(bookedSlots);
      const slots: Array<{ slot: string; available: boolean; reason?: string }> = [];

      for (const slot of ALLOWED_APPOINTMENT_SLOTS) {
        if (bookedSet.has(slot)) {
          slots.push({ slot, available: false, reason: 'booked' });
          continue;
        }
        if (deps.calendarService.isConfigured()) {
          const check = await deps.calendarService.checkSlotAvailability({
            scheduledDate: date,
            scheduledTimeSlot: slot,
            clientTimezone: timezone,
          });
          if (check.error) {
            // FAIL CLOSED: unlike Helix gcal.py, never fabricate open slots on Google Calendar outage
            res.status(503).json({
              error: {
                code: 'CALENDAR_AVAILABILITY_UNAVAILABLE',
                message: 'Live calendar availability could not be verified. Please retry or request a callback.',
                retryable: true,
              },
            });
            return;
          }
          slots.push({ slot, available: check.available, ...(check.available ? {} : { reason: 'calendar_busy' }) });
        } else {
          slots.push({ slot, available: true });
        }
      }

      res.json({
        success: true,
        date,
        timezone,
        calendarSynced: deps.calendarService.isConfigured(),
        slots,
      });
    } catch (err: any) {
      res.status(503).json({
        error: {
          code: 'AVAILABILITY_CHECK_FAILED',
          message: err?.message || 'Unable to verify appointment availability.',
          retryable: true,
        },
      });
    }
  });

  // POST /api/frontdesk/appointments — Transactional booking with explicit clientConfirmed + idempotency
  app.post('/api/frontdesk/appointments', async (req: Request & { correlationId?: string }, res: Response) => {
    if (!deps.checkInquiryRateLimit(req)) {
      res.status(429).json({
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded.', retryable: true },
      });
      return;
    }
    if (req.body?.clientConfirmed !== true) {
      res.status(400).json({
        error: {
          code: 'CLIENT_CONFIRMATION_REQUIRED',
          message: 'Explicit clientConfirmed: true is required before booking an appointment.',
          retryable: false,
        },
      });
      return;
    }

    const validated = validateAppointmentPayload(req.body);
    if (validated.ok === false) {
      res.status(400).json({
        error: { code: 'VALIDATION_FAILED', message: validated.error, retryable: false },
      });
      return;
    }

    if (deps.calendarService.isConfigured()) {
      const slotCheck = await deps.calendarService.checkSlotAvailability({
        scheduledDate: validated.data.scheduledDate,
        scheduledTimeSlot: validated.data.scheduledTimeSlot,
        clientTimezone: validated.data.clientTimezone,
      });
      if (slotCheck.error) {
        res.status(503).json({
          error: { code: 'CALENDAR_UNAVAILABLE', message: 'Calendar verification unavailable; booking aborted safely.', retryable: true },
        });
        return;
      }
      if (!slotCheck.available) {
        res.status(409).json({
          error: { code: 'CALENDAR_SLOT_BUSY', message: 'Selected time slot is no longer available.', retryable: false },
        });
        return;
      }
    }

    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const idempotencyKey =
      sanitizePlainText(req.headers['idempotency-key'] as string, 128) ||
      validated.data.idempotencyKey ||
      undefined;
    const referenceCode = `DTI-APT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    try {
      const created = await deps.db.createAppointment({
        ...validated.data,
        referenceCode,
        assignedConsultant: 'DESTRIA Solutions Architecture Team',
        status: deps.calendarService.isConfigured() ? 'confirmed' : 'pending_review',
        calendarSyncStatus: deps.calendarService.isConfigured() ? 'synced' : 'pending',
        idempotencyKey,
        managementTokenHash: tokenHash,
      });

      // Optionally link booking into unified session memory when valid session token provided
      const sessionId = sanitizePlainText(req.body?.sessionId, 100);
      const token = getSessionTokenFromReq(req);
      if (sessionId && deps.tokenSigner.verify(sessionId, token)) {
        deps.operationsStore.updateSessionMeta(sessionId, {
          customerMemory: {
            lastAppointmentReference: created.record.referenceCode,
            lastAppointmentDate: validated.data.scheduledDate,
            lastAppointmentSlot: validated.data.scheduledTimeSlot,
          },
        });
      }

      const deduplicated = !created.created;
      if (!deduplicated) {
        await deps.emailService
          .sendAppointmentNotifications(created.record, 'created')
          .catch(() => {});
      }

      res.status(deduplicated ? 200 : 201).json({
        success: true,
        deduplicated,
        referenceCode: created.record.referenceCode,
        managementToken: deduplicated ? undefined : rawToken,
        appointment: created.record,
      });
    } catch (err: any) {
      const isConflict = err?.name === 'ConflictError' || err?.statusCode === 409;
      res.status(isConflict ? 409 : 503).json({
        error: {
          code: isConflict ? 'CALENDAR_SLOT_BUSY' : 'APPOINTMENT_PERSISTENCE_FAILED',
          message: err?.message || 'Unable to book consultation appointment.',
          retryable: !isConflict,
        },
      });
    }
  });

  // -------------------------------------------------------------------------
  // 2. Authenticated Admin Front Desk Operations Endpoints (RBAC + CSRF)
  // -------------------------------------------------------------------------
  app.get('/api/admin/frontdesk/departments', deps.authService.requireAdmin, (_req: AuthenticatedAdminRequest, res: Response) => {
    res.json({ success: true, departments: deps.operationsStore.listDepartments(true) });
  });

  app.post('/api/admin/frontdesk/departments', deps.authService.requireAdmin, (req: AuthenticatedAdminRequest, res: Response) => {
    const name = sanitizePlainText(req.body?.name, 140);
    const slug = sanitizePlainText(req.body?.slug, 80);
    if (!name || !slug) {
      res.status(400).json({ success: false, error: 'Department name and slug are required.' });
      return;
    }
    const department = deps.operationsStore.upsertDepartment({
      name,
      slug,
      description: sanitizePlainText(req.body?.description, 400),
      routingKeywords: Array.isArray(req.body?.routingKeywords)
        ? req.body.routingKeywords.map((k: unknown) => sanitizePlainText(k, 40)).filter(Boolean)
        : undefined,
      priority: Number.isFinite(Number(req.body?.priority)) ? Number(req.body.priority) : undefined,
      enabled: req.body?.enabled !== undefined ? Boolean(req.body.enabled) : true,
    });
    res.status(201).json({ success: true, department });
  });

  app.get('/api/admin/frontdesk/agents', deps.authService.requireAdmin, (_req: AuthenticatedAdminRequest, res: Response) => {
    res.json({
      success: true,
      agents: deps.operationsStore.listAgents(),
      assignments: deps.operationsStore.listAssignments(),
    });
  });

  app.post('/api/admin/frontdesk/agents', deps.authService.requireAdmin, (req: AuthenticatedAdminRequest, res: Response) => {
    const displayName = sanitizePlainText(req.body?.displayName, 140);
    const departmentSlug = sanitizePlainText(req.body?.departmentSlug, 80) || 'client_support';
    if (!displayName) {
      res.status(400).json({ success: false, error: 'Agent displayName is required.' });
      return;
    }
    const rawState = sanitizePlainText(req.body?.availabilityState, 20) as AgentAvailabilityState;
    const validStates: AgentAvailabilityState[] = ['available', 'busy', 'break', 'offline'];
    const agent = deps.operationsStore.upsertAgent({
      displayName,
      departmentSlug,
      agentCode: sanitizePlainText(req.body?.agentCode, 40) || undefined,
      adminUserEmail: sanitizePlainText(req.body?.adminUserEmail, 160) || undefined,
      availabilityState: validStates.includes(rawState) ? rawState : 'offline',
      preferredLanguage: sanitizePlainText(req.body?.preferredLanguage, 16) || 'en-US',
      maxConcurrentSessions: Number(req.body?.maxConcurrentSessions) || 1,
    });
    res.status(201).json({ success: true, agent });
  });

  app.patch('/api/admin/frontdesk/agents/:agentId', deps.authService.requireAdmin, (req: AuthenticatedAdminRequest, res: Response) => {
    const agentId = sanitizePlainText(req.params.agentId, 100);
    const rawState = sanitizePlainText(req.body?.availabilityState, 20) as AgentAvailabilityState;
    if (!['available', 'busy', 'break', 'offline'].includes(rawState)) {
      res.status(400).json({ success: false, error: 'Valid availabilityState (available|busy|break|offline) is required.' });
      return;
    }
    const updated = deps.operationsStore.updateAgentAvailability(agentId, rawState);
    if (!updated) {
      res.status(404).json({ success: false, error: 'Human agent not found.' });
      return;
    }
    res.json({ success: true, agent: updated });
  });

  app.post('/api/admin/frontdesk/assignments/:assignmentId/accept', deps.authService.requireAdmin, (req: AuthenticatedAdminRequest, res: Response) => {
    const assignmentId = sanitizePlainText(req.params.assignmentId, 100);
    const accepted = deps.operationsStore.acceptAssignment(assignmentId);
    if (!accepted) {
      res.status(409).json({ success: false, error: 'Assignment is no longer offered or has already expired.' });
      return;
    }
    res.json({ success: true, assignment: accepted });
  });

  app.post('/api/admin/frontdesk/assignments/:assignmentId/release', deps.authService.requireAdmin, (req: AuthenticatedAdminRequest, res: Response) => {
    const assignmentId = sanitizePlainText(req.params.assignmentId, 100);
    const notes = sanitizePlainText(req.body?.notes, 400) || undefined;
    const released = deps.operationsStore.releaseAssignment(assignmentId, notes);
    if (!released) {
      res.status(404).json({ success: false, error: 'Active assignment not found.' });
      return;
    }
    res.json({ success: true, assignment: released });
  });

  app.get('/api/admin/frontdesk/callbacks', deps.authService.requireAdmin, (_req: AuthenticatedAdminRequest, res: Response) => {
    res.json({ success: true, callbacks: deps.operationsStore.listCallbackRequests() });
  });

  app.patch('/api/admin/frontdesk/callbacks/:callbackId', deps.authService.requireAdmin, (req: AuthenticatedAdminRequest, res: Response) => {
    const callbackId = sanitizePlainText(req.params.callbackId, 100);
    const rawState = sanitizePlainText(req.body?.state || req.body?.status, 20) as CallbackState;
    if (rawState && !['requested', 'scheduled', 'completed', 'cancelled'].includes(rawState)) {
      res.status(400).json({ success: false, error: 'Invalid callback state.' });
      return;
    }
    const updated = deps.operationsStore.updateCallbackRequest(callbackId, {
      state: rawState || undefined,
      assignedAgentId: req.body?.assignedAgentId ? sanitizePlainText(req.body.assignedAgentId, 100) : undefined,
    });
    if (!updated) {
      res.status(404).json({ success: false, error: 'Callback request not found.' });
      return;
    }
    res.json({ success: true, callback: updated });
  });

  app.get('/api/admin/frontdesk/schedule', deps.authService.requireAdmin, (_req: AuthenticatedAdminRequest, res: Response) => {
    res.json({
      success: true,
      currentStatus: deps.operationsStore.evaluateBusinessHours(),
      rules: deps.operationsStore.listScheduleRules(),
    });
  });

  app.post('/api/admin/frontdesk/schedule', deps.authService.requireAdmin, (req: AuthenticatedAdminRequest, res: Response) => {
    const recordType = req.body?.recordType === 'holiday' ? 'holiday' : 'business_hours';
    const timezone = sanitizePlainText(req.body?.timezone, 64) || 'Asia/Manila';
    if (recordType === 'holiday') {
      const holidayDate = sanitizePlainText(req.body?.holidayDate, 20);
      const holidayName = sanitizePlainText(req.body?.holidayName, 140);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayDate) || !holidayName) {
        res.status(400).json({ success: false, error: 'holidayDate (YYYY-MM-DD) and holidayName are required.' });
        return;
      }
      const rule = deps.operationsStore.upsertScheduleRule({
        recordType: 'holiday',
        timezone,
        holidayDate,
        holidayName,
        isActive: req.body?.isActive !== false,
      });
      res.status(201).json({ success: true, rule });
      return;
    }

    const dayOfWeek = Number(req.body?.dayOfWeek);
    const openTime = sanitizePlainText(req.body?.openTime, 10);
    const closeTime = sanitizePlainText(req.body?.closeTime, 10);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !openTime || !closeTime || openTime >= closeTime) {
      res.status(400).json({ success: false, error: 'Valid dayOfWeek (0-6) and openTime < closeTime are required.' });
      return;
    }
    const rule = deps.operationsStore.upsertScheduleRule({
      recordType: 'business_hours',
      timezone,
      dayOfWeek,
      openTime,
      closeTime,
      isActive: req.body?.isActive !== false,
    });
    res.status(201).json({ success: true, rule });
  });

  app.delete('/api/admin/frontdesk/schedule/:ruleId', deps.authService.requireAdmin, (req: AuthenticatedAdminRequest, res: Response) => {
    const ruleId = sanitizePlainText(req.params.ruleId, 100);
    const deleted = deps.operationsStore.deleteScheduleRule(ruleId);
    res.status(deleted ? 200 : 404).json({ success: deleted, ruleId });
  });

  app.get('/api/admin/frontdesk/inference-health', deps.authService.requireAdmin, async (_req: AuthenticatedAdminRequest, res: Response) => {
    const health = await deps.localInferenceClient.probeHealth(true);
    res.json({ success: true, inference: health });
  });

  return gateway;
}
