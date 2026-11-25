import { corporateIdentity } from '../data/companyConfig';

/**
 * Natural Multi-Intent Conversational Intelligence & Memory Engine
 *
 * Shared across text chat (/api/consultant/chat), turn-based voice (/api/voice/process),
 * and Gemini Live prompt construction (/api/voice/live).
 *
 * Capabilities:
 * - Classifies 15+ natural conversational intents without forcing casual/personal
 *   turns into corporate consultation scripts or tool calls.
 * - Handles personal AI identity questions honestly and warmly without claiming
 *   human traits or leaking/fabricating private executive information.
 * - Maintains session-scoped conversational memory (preferred name, language,
 *   previous questions, discussed topics, last explanation, corrections, pivots).
 * - Supports multilingual detection & continuity (English, Filipino, Taglish,
 *   Spanish, French, plus seamless passthrough for other languages in Gemini).
 * - Provides intelligent, intent-aware deterministic fallbacks when Gemini is
 *   unavailable, while strictly preserving commercial & privacy policies.
 */

export type ConversationalIntent =
  | 'greeting'
  | 'personal_ai_question'
  | 'casual_conversation'
  | 'general_knowledge'
  | 'multilingual_chat'
  | 'technical_discussion'
  | 'enterprise_consultation'
  | 'business_discovery'
  | 'corporate_information'
  | 'service_recommendation'
  | 'appointment_scheduling'
  | 'human_assistance'
  | 'conversation_correction'
  | 'conversation_continuation'
  | 'conversation_closure'
  | 'subject_change'
  | 'memory_recall'
  | 'clarification_needed';

export type SupportedConversationLanguage = 'en-US' | 'fil-PH' | 'es-ES' | 'fr-FR';

export interface ConversationHistoryEntry {
  sender: 'user' | 'ai';
  text: string;
  timestamp?: string;
}

export interface ConversationalMemory {
  preferredName?: string;
  preferredLanguage: SupportedConversationLanguage;
  languageSwitchRequested?: SupportedConversationLanguage;
  previousQuestions: string[];
  discussedTopics: string[];
  lastTopic?: string;
  lastAssistantMessage?: string;
  lastUserMessage?: string;
  userPreferences: string[];
  activeMode: 'casual' | 'general' | 'technical' | 'enterprise_consultation';
  topicResetRequested?: boolean;
}

export interface ConversationalClassification {
  intent: ConversationalIntent;
  language: SupportedConversationLanguage;
  isTaglish: boolean;
  isCasualOrPersonal: boolean;
  shouldAllowEnterpriseTools: boolean;
  shouldIncludeCorporateQuickReplies: boolean;
  requiresClarification: boolean;
  isPrivateExecutiveProbe: boolean;
  personalSubType?:
    | 'how_are_you'
    | 'name'
    | 'married'
    | 'age'
    | 'where_live'
    | 'real_person'
    | 'children_family'
    | 'friends'
    | 'joke'
    | 'feelings'
    | 'capabilities'
    | 'language_ability'
    | 'private_executive'
    | 'general_ai';
  memory: ConversationalMemory;
}

export interface DeterministicConversationalReply {
  replyText: string;
  intent: ConversationalIntent;
  language: SupportedConversationLanguage;
  quickReplies: string[];
  suggestedAction: 'none' | 'book_consultation' | 'talk_to_human' | 'corporate_profile';
  shouldAllowEnterpriseTools: boolean;
  memory: ConversationalMemory;
}

const FILIPINO_MARKERS =
  /(?:^|[\s,¿¡("'])(?:kamusta|kumusta|magandang\s+(?:umaga|hapon|gabi|araw)|salamat|maraming\s+salamat|po|opo|paalam|magkano|presyo|saan|ano|anong|sino|paano|pwede|puwede|gusto\s+ko|kailangan|tulong|tulungan|mabuti|ayos\s+lang|oo|hindi|ako\s+si|tawagin\s+mo|ilang\s+taon|may\s+asawa|nakatira|tao\s+ka\s+ba|kaibigan|tagalog|filipino|taglish|naman|talaga|bakit|tuloy|ulitin|paliwanag|ibang\s+usapan)(?=$|[\s?!.,;:"')])/i;

const SPANISH_MARKERS =
  /(?:^|[\s,¿¡("'])(?:hola|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|c[oó]mo\s+est[aá]s|gracias|muchas\s+gracias|adi[oó]s|hasta\s+luego|por\s+favor|cu[aá]nto\s+cuesta|precio|precios|d[oó]nde\s+vives|c[oó]mo\s+te\s+llamas|cu[aá]ntos\s+a[ñn]os|est[aá]s\s+casad[oa]|eres\s+human[oa]|eres\s+una\s+persona|me\s+llamo|hablas\s+espa[ñn]ol|espa[ñn]ol|puedes\s+ayudarme|necesito|empresa|consulta|cita|chiste|cambiemos\s+de\s+tema|qu[eé]\s+pregunt[eé]|explica\s+de\s+nuevo|recuerdas\s+mi\s+nombre)(?=$|[\s?!.,;:"')])/i;

const FRENCH_MARKERS =
  /(?:^|[\s,¿¡("'])(?:bonjour|bonsoir|salut|comment\s+[çc]a\s+va|comment\s+allez[\s-]vous|merci|merci\s+beaucoup|au\s+revoir|[àa]\s+bient[oô]t|s['’]il\s+vous\s+pla[îi]t|combien\s+co[ûu]te|prix|tarif|o[ùu]\s+habites[\s-]tu|comment\s+t['’]appelles[\s-]tu|quel\s+[âa]ge|es[\s-]tu\s+mari[ée]|es[\s-]tu\s+humain|je\s+m['’]appelle|parles[\s-]tu\s+fran[çc]ais|fran[çc]ais|peux[\s-]tu\s+m['’]aider|blague|changeons\s+de\s+sujet)(?=$|[\s?!.,;:"')])/i;

const ENGLISH_MARKERS =
  /\b(hello|hi|hey|how\s+are\s+you|what|where|when|why|who|can\s+you|could\s+you|please|thanks|thank\s+you|goodbye|bye|tell\s+me|explain|about|system|software|project|company|help|need|want|looking\s+for|actually|change\s+the\s+subject)\b/i;

export function detectLanguageFromText(
  text: string,
  previousLanguage: SupportedConversationLanguage = 'en-US'
): {
  language: SupportedConversationLanguage;
  isTaglish: boolean;
  explicitSwitch?: SupportedConversationLanguage;
} {
  const lower = text.trim().toLowerCase();

  // Explicit language switch requests
  if (
    /\b(speak|talk|reply|respond|switch|use)\s+(?:in\s+|to\s+)?(tagalog|filipino|taglish)\b|\b(mag[\s-]?tagalog|tagalog\s+na\s+lang|pwede\s+(?:bang|ba\s+tayong)\s+(?:mag[\s-]?usap\s+sa\s+|mag[\s-]?)?(?:tagalog|filipino|taglish)|taglish\s+na\s+lang)\b/i.test(
      lower
    )
  ) {
    return {
      language: 'fil-PH',
      isTaglish: /\btaglish\b/i.test(lower) || ENGLISH_MARKERS.test(lower),
      explicitSwitch: 'fil-PH',
    };
  }
  if (
    /\b(speak|talk|reply|respond|switch|use)\s+(?:in\s+|to\s+)?(spanish|espa[ñn]ol)(?=$|[\s?!.,])|\b(habla\s+en\s+espa[ñn]ol|en\s+espa[ñn]ol\s+por\s+favor|hablemos\s+espa[ñn]ol)(?=$|[\s?!.,])/i.test(
      lower
    )
  ) {
    return { language: 'es-ES', isTaglish: false, explicitSwitch: 'es-ES' };
  }
  if (
    /\b(speak|talk|reply|respond|switch|use)\s+(?:in\s+|to\s+)?(french|fran[çc]ais)(?=$|[\s?!.,])|\b(parle[sz]?\s+en\s+fran[çc]ais|en\s+fran[çc]ais\s+s['’]il)(?=$|[\s?!.,])/i.test(
      lower
    )
  ) {
    return { language: 'fr-FR', isTaglish: false, explicitSwitch: 'fr-FR' };
  }
  if (
    /\b(speak|talk|reply|respond|switch|back)\s+(?:in\s+|to\s+)?english\b|\b(in\s+english\s+please|english\s+na\s+lang|en\s+ingl[eé]s|en\s+anglais)\b/i.test(
      lower
    )
  ) {
    return { language: 'en-US', isTaglish: false, explicitSwitch: 'en-US' };
  }

  const hasFil = FILIPINO_MARKERS.test(lower);
  const hasEs = SPANISH_MARKERS.test(lower);
  const hasFr = FRENCH_MARKERS.test(lower);
  const hasEn = ENGLISH_MARKERS.test(lower);

  if (hasFil) {
    return { language: 'fil-PH', isTaglish: hasEn };
  }
  if (hasEs) {
    return { language: 'es-ES', isTaglish: false };
  }
  if (hasFr) {
    return { language: 'fr-FR', isTaglish: false };
  }
  if (hasEn) {
    return { language: 'en-US', isTaglish: false };
  }

  return { language: previousLanguage, isTaglish: false };
}

const NON_NAME_WORDS = new Set([
  'fine',
  'good',
  'great',
  'okay',
  'ok',
  'well',
  'doing',
  'looking',
  'interested',
  'calling',
  'asking',
  'wondering',
  'trying',
  'building',
  'working',
  'here',
  'back',
  'ready',
  'sorry',
  'sure',
  'happy',
  'curious',
  'not',
  'just',
  'also',
  'really',
  'very',
  'from',
  'in',
  'at',
  'the',
  'a',
  'an',
  'tired',
  'busy',
  'confused',
  'lost',
  'glad',
  'excited',
]);

export function extractPreferredName(text: string): string | undefined {
  const patterns = [
    /\b(?:my\s+name\s+is|call\s+me|you\s+can\s+call\s+me)\s+([A-ZÀ-ÿa-z][A-ZÀ-ÿa-z'-]{1,24}(?:\s+[A-ZÀ-ÿa-z][A-ZÀ-ÿa-z'-]{1,24})?)/i,
    /\b(?:ako\s+si|tawagin\s+mo\s+akong|pangalan\s+ko\s+ay)\s+([A-ZÀ-ÿa-z][A-ZÀ-ÿa-z'-]{1,24}(?:\s+[A-ZÀ-ÿa-z][A-ZÀ-ÿa-z'-]{1,24})?)/i,
    /\b(?:me\s+llamo|mi\s+nombre\s+es|soy)\s+([A-ZÀ-ÿa-z][A-ZÀ-ÿa-z'-]{1,24})/i,
    /\b(?:je\s+m['’]appelle|mon\s+nom\s+est)\s+([A-ZÀ-ÿa-z][A-ZÀ-ÿa-z'-]{1,24})/i,
    /^(?:[Hh]i|[Hh]ello|[Hh]ey)[,!\s]+[Ii]['’]?m\s+([A-Z][a-zA-Z'-]{1,20})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const candidate = match[1]
        .trim()
        .replace(/\b(?:and|from|here|today|please|po|naman)\b.*$/i, '')
        .trim();
      const firstToken = candidate.split(/\s+/)[0]?.toLowerCase() || '';
      if (candidate.length >= 2 && firstToken && !NON_NAME_WORDS.has(firstToken)) {
        return candidate
          .split(/\s+/)
          .slice(0, 2)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
      }
    }
  }
  return undefined;
}

function detectTopicLabel(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (/\b(ai\s+agent|artificial\s+intelligence|machine\s+learning|llm|rag|automation|chatbot|voice\s+ai)\b/.test(lower)) {
    return 'Artificial Intelligence & Automation';
  }
  if (/\b(erp|crm|inventory|enterprise\s+software|workflow|custom\s+software|saas|web\s+platform)\b/.test(lower)) {
    return 'Enterprise Software & Platforms';
  }
  if (/\b(ophireum|3d|vfx|video\s+production|broadcast|branding|motion\s+graphics|multimedia)\b/.test(lower)) {
    return 'Ophireum Multimedia & Creative Production';
  }
  if (/\b(blockchain|web3|smart\s+contract|tokenization|defi)\b/.test(lower)) {
    return 'Blockchain & Web3 Engineering';
  }
  if (/\b(cybersecurity|security|zero[\s-]trust|encryption|soc\s*2|iso\s*27001|compliance|cloud)\b/.test(lower)) {
    return 'Cloud Infrastructure & Cybersecurity';
  }
  if (/\b(api|rest|graphql|microservice|database|sql|nosql|react|typescript|python|kubernetes|docker)\b/.test(lower)) {
    return 'Software Engineering & Architecture';
  }
  if (/\b(consultation|appointment|meeting|schedule|book|proposal)\b/.test(lower)) {
    return 'Consultation Scheduling';
  }
  if (/\b(destria|desmond\s+hinds|leodenis|headquarters|corporate\s+profile|brochure)\b/.test(lower)) {
    return 'DESTRIA TECH INC Corporate Information';
  }
  if (/\b(weather|space|planet|science|history|cooking|coffee|music|movie|travel|book|sport|joke)\b/.test(lower)) {
    return 'General Conversation';
  }
  return undefined;
}

export function buildConversationalMemory(
  userMessage: string,
  history: ConversationHistoryEntry[] = [],
  existingContext?: Record<string, unknown>
): ConversationalMemory {
  const ctxPreferredName =
    typeof existingContext?.preferredName === 'string' && existingContext.preferredName.trim()
      ? existingContext.preferredName.trim()
      : typeof existingContext?.clientName === 'string' && existingContext.clientName.trim()
      ? existingContext.clientName.trim()
      : undefined;

  const ctxLanguage = existingContext?.preferredLanguage;
  let preferredLanguage: SupportedConversationLanguage =
    ctxLanguage === 'fil-PH' || ctxLanguage === 'es-ES' || ctxLanguage === 'fr-FR' || ctxLanguage === 'en-US'
      ? ctxLanguage
      : 'en-US';

  let preferredName = ctxPreferredName;
  const previousQuestions: string[] = Array.isArray(existingContext?.previousQuestions)
    ? existingContext.previousQuestions.filter((q): q is string => typeof q === 'string').slice(-8)
    : [];
  const discussedTopics: string[] = Array.isArray(existingContext?.discussedTopics)
    ? existingContext.discussedTopics.filter((t): t is string => typeof t === 'string').slice(-8)
    : [];
  const userPreferences: string[] = Array.isArray(existingContext?.userPreferences)
    ? existingContext.userPreferences.filter((p): p is string => typeof p === 'string').slice(-6)
    : [];

  let lastAssistantMessage: string | undefined;
  let lastUserMessage: string | undefined;
  let enterpriseTurns = 0;
  let casualTurns = 0;

  for (const entry of history.slice(-16)) {
    if (entry.sender === 'user') {
      const trimmed = entry.text.trim();
      if (trimmed) {
        lastUserMessage = trimmed;
        if (!previousQuestions.includes(trimmed)) {
          previousQuestions.push(trimmed);
        }
        const extractedName = extractPreferredName(trimmed);
        if (extractedName) preferredName = extractedName;

        const langDetect = detectLanguageFromText(trimmed, preferredLanguage);
        preferredLanguage = langDetect.language;

        const topic = detectTopicLabel(trimmed);
        if (topic && !discussedTopics.includes(topic)) {
          discussedTopics.push(topic);
        }
        if (
          /\b(destria|ophireum|enterprise|consultation|proposal|erp|crm|custom\s+software|ai\s+agent|blockchain|book|schedule)\b/i.test(
            trimmed
          )
        ) {
          enterpriseTurns += 1;
        } else {
          casualTurns += 1;
        }
      }
    } else if (entry.sender === 'ai' && entry.text.trim()) {
      lastAssistantMessage = entry.text.trim();
    }
  }

  // Extract from current message too
  const nameInCurrent = extractPreferredName(userMessage);
  if (nameInCurrent) preferredName = nameInCurrent;

  const langNow = detectLanguageFromText(userMessage, preferredLanguage);
  preferredLanguage = langNow.language;

  const currentTopic = detectTopicLabel(userMessage);
  if (currentTopic && !discussedTopics.includes(currentTopic)) {
    discussedTopics.push(currentTopic);
  }

  if (/\b(keep\s+it\s+(?:short|brief)|be\s+brief|short\s+answer|tl;?dr)\b/i.test(userMessage)) {
    if (!userPreferences.includes('concise responses')) userPreferences.push('concise responses');
  }
  if (/\b(more\s+detail|in\s+depth|detailed\s+explanation|elaborate)\b/i.test(userMessage)) {
    if (!userPreferences.includes('detailed responses')) userPreferences.push('detailed responses');
  }

  const activeMode: ConversationalMemory['activeMode'] =
    enterpriseTurns > 0 && enterpriseTurns >= casualTurns
      ? 'enterprise_consultation'
      : currentTopic === 'Software Engineering & Architecture'
      ? 'technical'
      : 'casual';

  return {
    preferredName,
    preferredLanguage,
    languageSwitchRequested: langNow.explicitSwitch,
    previousQuestions: previousQuestions.slice(-10),
    discussedTopics: discussedTopics.slice(-8),
    lastTopic: currentTopic || discussedTopics[discussedTopics.length - 1],
    lastAssistantMessage,
    lastUserMessage,
    userPreferences: userPreferences.slice(-6),
    activeMode,
  };
}

function isEnterpriseDomainMessage(lower: string): boolean {
  return /\b(destria|ophireum|enterprise\s+solution|enterprise\s+platform|enterprise\s+software|erp|crm|custom\s+software|software\s+development|web\s+development|mobile\s+app|ai\s+agent|agentic|workflow\s+automation|blockchain\s+platform|smart\s+contract|multimedia\s+production|3d\s+animation|vfx|project\s+brief|consultation|proposal|book\s+a?\s*(?:meeting|call|consultation|appointment)|schedule\s+a?\s*(?:meeting|call|consultation|appointment)|discovery\s+call|line\s+of\s+services|corporate\s+profile|service\s+division|client\s+portal|talk\s+to\s+(?:a\s+)?(?:human|representative|consultant|advisor|ceo|cto)|desmond\s+hinds|leodenis\s+languisan|headquarters|sheridan|wyoming|307[\s-]*419|info@destriatech)\b/i.test(
    lower
  );
}

/**
 * Classifies a user message across the 15+ natural conversational intents.
 */
export function classifyConversationalTurn(
  userMessage: string,
  history: ConversationHistoryEntry[] = [],
  existingContext?: Record<string, unknown>
): ConversationalClassification {
  const trimmed = userMessage.trim();
  const lower = trimmed.toLowerCase();
  const memory = buildConversationalMemory(trimmed, history, existingContext);
  const langInfo = detectLanguageFromText(trimmed, memory.preferredLanguage);
  const language = langInfo.language;
  const isTaglish = langInfo.isTaglish;

  // 0. Private personal information probe about real executives / employees
  const isPrivateExecutiveProbe =
    /\b(desmond|hinds|hines|leodenis|languisan|ceo|cto|founder|employees?|staff)\b/i.test(lower) &&
    /\b(married|wife|husband|spouse|children|kids|family|home\s+address|personal\s+phone|personal\s+email|personal\s+number|salary|net\s+worth|birthday|age|how\s+old|where\s+does\s+(?:he|she|desmond|leodenis)\s+live|private\s+life|social\s+security|bank\s+account)\b/i.test(
      lower
    );

  if (isPrivateExecutiveProbe) {
    return {
      intent: 'personal_ai_question',
      language,
      isTaglish,
      isCasualOrPersonal: true,
      shouldAllowEnterpriseTools: false,
      shouldIncludeCorporateQuickReplies: false,
      requiresClarification: false,
      isPrivateExecutiveProbe: true,
      personalSubType: 'private_executive',
      memory,
    };
  }

  // 1. Conversation closure (English, Filipino, Spanish, French)
  const isClosure =
    /^(?:thanks?(?:\s+(?:so|very)\s+much)?|thank\s+you(?:\s+(?:so|very)\s+much)?|thx|ty|salamat|maraming\s+salamat|gracias|muchas\s+gracias|merci|merci\s+beaucoup|ok\s+thanks?|okay\s+thanks?|got\s+it,?\s*thanks?)[\s,!.]*(?:bye|goodbye|good\s+bye|see\s+you|take\s+care|have\s+a\s+(?:good|great|nice)\s+(?:day|evening|night)|that'?s\s+all(?:\s+for\s+now)?|nothing\s+else|i'?m\s+(?:all\s+)?done|paalam|hanggang\s+sa\s+muli|adi[oó]s|hasta\s+luego|au\s+revoir|[àa]\s+bient[oô]t)?[.!\s]*$/i.test(
      lower
    ) ||
    /^(?:that'?s\s+all(?:\s+for\s+now)?|we'?re\s+done|nothing\s+else|end\s+conversation)?[\s,!.]*(?:bye|goodbye|good\s+bye|see\s+ya|see\s+you\s+later|good\s+night|paalam|adi[oó]s|hasta\s+luego|au\s+revoir|that'?s\s+all\s+for\s+now|we'?re\s+done|end\s+conversation)[.!\s]*$/i.test(
      lower
    );

  if (isClosure) {
    return {
      intent: 'conversation_closure',
      language,
      isTaglish,
      isCasualOrPersonal: true,
      shouldAllowEnterpriseTools: false,
      shouldIncludeCorporateQuickReplies: false,
      requiresClarification: false,
      isPrivateExecutiveProbe: false,
      memory,
    };
  }

  // 2. Subject change / pivot
  const isSubjectChange =
    /\b(change\s+the\s+subject|let'?s\s+talk\s+about\s+something\s+else|switch\s+topics?|different\s+topic|never\s+mind\s+that|forget\s+that\s+topic|move\s+on\s+to\s+something\s+else|ibang\s+usapan(?:\s+naman)?|mag[\s-]?iba\s+tayo\s+ng\s+topic|cambiemos\s+de\s+tema|changeons\s+de\s+sujet)\b/i.test(
      lower
    );
  if (isSubjectChange) {
    memory.topicResetRequested = true;
    memory.activeMode = 'casual';
    return {
      intent: 'subject_change',
      language,
      isTaglish,
      isCasualOrPersonal: true,
      shouldAllowEnterpriseTools: false,
      shouldIncludeCorporateQuickReplies: false,
      requiresClarification: false,
      isPrivateExecutiveProbe: false,
      memory,
    };
  }

  // 3. Memory recall ("What did I ask earlier?", "What's my name?", "What were we talking about?")
  const isMemoryRecall =
    /\b(what\s+did\s+i\s+(?:ask|say|mention)\s+(?:earlier|before|first|previously)|what\s+was\s+my\s+(?:first|previous|last)\s+question|do\s+you\s+remember\s+(?:my\s+name|what\s+i\s+(?:asked|said))|what\s+is\s+my\s+name|what'?s\s+my\s+name|who\s+am\s+i|what\s+were\s+we\s+talking\s+about|ano\s+(?:ang\s+)?tinanong\s+ko\s+kanina|naaalala\s+mo\s+(?:ba\s+)?(?:ang\s+)?pangalan\s+ko|qu[eé]\s+pregunt[eé]\s+antes|recuerdas\s+mi\s+nombre)\b/i.test(
      lower
    );
  if (isMemoryRecall) {
    return {
      intent: 'memory_recall',
      language,
      isTaglish,
      isCasualOrPersonal: true,
      shouldAllowEnterpriseTools: false,
      shouldIncludeCorporateQuickReplies: false,
      requiresClarification: false,
      isPrivateExecutiveProbe: false,
      memory,
    };
  }

  // 4. Conversation correction ("No, that's not what I meant", "Wait, actually...")
  const isCorrection =
    /^(?:no,?\s+)?(?:that'?s\s+not\s+what\s+i\s+meant|that\s+isn'?t\s+what\s+i\s+meant|not\s+what\s+i\s+meant|you\s+misunderstood|wait,?\s+no|actually,?\s+i\s+meant|i\s+meant\s+something\s+else|hindi\s+yan\s+ang\s+ibig\s+kong\s+sabihin|mali\s+intindi\s+mo|no\s+me\s+refer[ií]a\s+a\s+eso|ce\s+n['’]est\s+pas\s+ce\s+que\s+je\s+voulais\s+dire)\b/i.test(
      lower
    ) ||
    /\b(that'?s\s+not\s+what\s+i\s+meant|you\s+misunderstood\s+me|let\s+me\s+clarify\s+what\s+i\s+meant)\b/i.test(lower);
  if (isCorrection) {
    return {
      intent: 'conversation_correction',
      language,
      isTaglish,
      isCasualOrPersonal: !isEnterpriseDomainMessage(lower),
      shouldAllowEnterpriseTools: isEnterpriseDomainMessage(lower),
      shouldIncludeCorporateQuickReplies: false,
      requiresClarification: false,
      isPrivateExecutiveProbe: false,
      memory,
    };
  }

  // 5. Continuation / Re-explanation ("Can you explain that again?", "Continue what you were saying")
  const isContinuation =
    /\b(continue\s+what\s+you\s+were\s+saying|keep\s+going|go\s+on|please\s+continue|can\s+you\s+explain\s+that\s+again|explain\s+that\s+again|explain\s+that\s+(?:more\s+)?simply|say\s+that\s+again|repeat\s+that|can\s+you\s+repeat\s+the\s+last\s+part|paki[\s-]?ulit|ipaliwanag\s+mo\s+ulit|ituloy\s+mo|explica\s+(?:eso\s+)?de\s+nuevo|contin[uú]a|r[eé]p[eè]te)\b/i.test(
      lower
    );
  if (isContinuation && !/\b(second|first|third)\s+option\b/i.test(lower)) {
    return {
      intent: 'conversation_continuation',
      language,
      isTaglish,
      isCasualOrPersonal: memory.activeMode !== 'enterprise_consultation',
      shouldAllowEnterpriseTools: memory.activeMode === 'enterprise_consultation',
      shouldIncludeCorporateQuickReplies: false,
      requiresClarification: false,
      isPrivateExecutiveProbe: false,
      memory,
    };
  }

  // 6. Personal AI questions (MUST NOT trigger corporate consultation scripts)
  const hasEnterpriseEntity = isEnterpriseDomainMessage(lower);

  const personalChecks: Array<{
    subType: NonNullable<ConversationalClassification['personalSubType']>;
    pattern: RegExp;
  }> = [
    {
      subType: 'how_are_you',
      pattern:
        /\b(how\s+are\s+you(?:\s+doing)?|how'?s\s+it\s+going|how\s+is\s+your\s+day|how\s+are\s+things|what'?s\s+up|kamusta(?:\s+ka)?|kumusta(?:\s+ka)?|c[oó]mo\s+est[aá]s|qu[eé]\s+tal|comment\s+[çc]a\s+va|comment\s+allez[\s-]vous)\b/i,
    },
    {
      subType: 'name',
      pattern:
        /\b(what\s+is\s+your\s+name|what'?s\s+your\s+name|who\s+are\s+you|do\s+you\s+have\s+a\s+name|what\s+should\s+i\s+call\s+you|anong\s+pangalan\s+mo|sino\s+ka|c[oó]mo\s+te\s+llamas|comment\s+t['’]appelles[\s-]tu)\b/i,
    },
    {
      subType: 'married',
      pattern:
        /(?:^|[\s,¿¡("'])(?:are\s+you\s+married|do\s+you\s+have\s+a\s+(?:wife|husband|spouse|partner|boyfriend|girlfriend)|are\s+you\s+single|may\s+asawa\s+ka\s+ba|est[aá]s\s+casad[oa]|es[\s-]tu\s+mari[ée])(?=$|[\s?!.,;:"')])/i,
    },
    {
      subType: 'age',
      pattern:
        /\b(how\s+old\s+are\s+you|what\s+is\s+your\s+age|when\s+were\s+you\s+born|ilang\s+taon\s+ka\s+na|cu[aá]ntos\s+a[ñn]os\s+tienes|quel\s+[âa]ge\s+as[\s-]tu)\b/i,
    },
    {
      subType: 'where_live',
      pattern:
        /\b(where\s+do\s+you\s+live|where\s+are\s+you\s+from|do\s+you\s+have\s+a\s+home|saan\s+ka\s+nakatira|d[oó]nde\s+vives|o[ùu]\s+habites[\s-]tu)\b/i,
    },
    {
      subType: 'real_person',
      pattern:
        /\b(are\s+you\s+(?:a\s+)?(?:real\s+person|human|robot|bot|ai|artificial\s+intelligence)|am\s+i\s+talking\s+to\s+(?:a\s+)?(?:human|real\s+person|bot|ai)|tao\s+ka\s+ba|eres\s+(?:una\s+persona|human[oa]|un\s+robot)|es[\s-]tu\s+(?:humain|une\s+vrai[e]?\s+personne|un\s+robot))\b/i,
    },
    {
      subType: 'children_family',
      pattern:
        /\b(do\s+you\s+have\s+(?:children|kids|a\s+family|parents|siblings|pets)|may\s+anak\s+ka\s+ba|tienes\s+hijos|as[\s-]tu\s+des\s+enfants)\b/i,
    },
    {
      subType: 'friends',
      pattern:
        /\b(can\s+we\s+be\s+friends|will\s+you\s+be\s+my\s+friend|are\s+we\s+friends|pwede\s+ba\s+tayong\s+maging\s+magkaibigan|podemos\s+ser\s+amigos|pouvons[\s-]nous\s+[êe]tre\s+amis)\b/i,
    },
    {
      subType: 'joke',
      pattern:
        /\b(tell\s+me\s+a\s+joke|know\s+any\s+jokes?|say\s+something\s+funny|make\s+me\s+laugh|mag[\s-]?joke\s+ka|cu[eé]ntame\s+un\s+chiste|raconte[\s-]moi\s+une\s+blague)\b/i,
    },
    {
      subType: 'feelings',
      pattern:
        /\b(do\s+you\s+have\s+feelings|do\s+you\s+feel|are\s+you\s+(?:happy|sad|tired|bored|alive|conscious)|can\s+you\s+love)\b/i,
    },
    {
      subType: 'language_ability',
      pattern:
        /\b(what\s+languages\s+do\s+you\s+speak|do\s+you\s+speak\s+(?:tagalog|filipino|spanish|french|english|taglish)|can\s+you\s+speak\s+(?:tagalog|filipino|spanish|french|taglish)|marunong\s+ka\s+bang\s+mag[\s-]?tagalog|hablas\s+espa[ñn]ol|parles[\s-]tu\s+fran[çc]ais)\b/i,
    },
    {
      subType: 'capabilities',
      pattern:
        /\b(what\s+can\s+you\s+do|how\s+can\s+you\s+help\s+me|what\s+do\s+you\s+do|ano\s+ang\s+kaya\s+mong\s+gawin|qu[eé]\s+puedes\s+hacer|que\s+peux[\s-]tu\s+faire)\b/i,
    },
  ];

  // If the user explicitly asked a personal AI question without an enterprise request attached
  if (!hasEnterpriseEntity || /^(?:hi|hello|hey|kamusta|hola|bonjour)?[\s,!.]*(?:how\s+are\s+you|what'?s\s+your\s+name|are\s+you\s+married|how\s+old\s+are\s+you|where\s+do\s+you\s+live|are\s+you\s+a\s+real\s+person|do\s+you\s+have\s+children|can\s+we\s+be\s+friends|tell\s+me\s+a\s+joke)/i.test(lower)) {
    for (const check of personalChecks) {
      if (check.pattern.test(lower)) {
        return {
          intent: 'personal_ai_question',
          language,
          isTaglish,
          isCasualOrPersonal: true,
          shouldAllowEnterpriseTools: false,
          shouldIncludeCorporateQuickReplies: false,
          requiresClarification: false,
          isPrivateExecutiveProbe: false,
          personalSubType: check.subType,
          memory,
        };
      }
    }
  }

  // 7. Pure friendly greetings & name introductions
  const isPureGreeting =
    /^(?:hi|hello|hey|yo|good\s+(?:morning|afternoon|evening|day)|greetings|kamusta|kumusta|magandang\s+(?:umaga|hapon|gabi|araw)|hola|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|bonjour|bonsoir|salut)(?:[\s,!.]*(?:there|everyone|assistant|ai|destria|po|naman|amigo))?[.!\s]*$/i.test(
      lower
    );
  const isPureNameIntro =
    Boolean(extractPreferredName(trimmed)) && !hasEnterpriseEntity && trimmed.split(/\s+/).length <= 14;

  if (isPureGreeting || isPureNameIntro) {
    return {
      intent: 'greeting',
      language,
      isTaglish,
      isCasualOrPersonal: true,
      shouldAllowEnterpriseTools: false,
      shouldIncludeCorporateQuickReplies: false,
      requiresClarification: false,
      isPrivateExecutiveProbe: false,
      memory,
    };
  }

  // 8. Explicit language switch with no business content
  if (langInfo.explicitSwitch && !hasEnterpriseEntity && trimmed.split(/\s+/).length <= 10) {
    return {
      intent: 'multilingual_chat',
      language,
      isTaglish,
      isCasualOrPersonal: true,
      shouldAllowEnterpriseTools: false,
      shouldIncludeCorporateQuickReplies: false,
      requiresClarification: false,
      isPrivateExecutiveProbe: false,
      memory,
    };
  }

  // 9. Explicit human assistance
  if (
    /\b(talk\s+to\s+(?:a\s+)?(?:human|real\s+person|live\s+agent|representative|advisor|consultant|someone)|speak\s+(?:with|to)\s+(?:a\s+)?(?:human|person|representative|advisor|team\s+member)|human\s+assistance|connect\s+me\s+to\s+(?:a\s+)?(?:human|representative|team|ceo|cto)|call\s+me\s+back|gusto\s+kong\s+makausap\s+ang\s+tao|hablar\s+con\s+(?:un\s+humano|una\s+persona))\b/i.test(
      lower
    )
  ) {
    return {
      intent: 'human_assistance',
      language,
      isTaglish,
      isCasualOrPersonal: false,
      shouldAllowEnterpriseTools: true,
      shouldIncludeCorporateQuickReplies: true,
      requiresClarification: false,
      isPrivateExecutiveProbe: false,
      memory,
    };
  }

  // 10. Explicit appointment / consultation scheduling
  if (
    /\b(book|schedule|arrange|set\s+up|request)\s+(?:a|an|my)?\s*(?:enterprise\s+|initial\s+|technical\s+|executive\s+|discovery\s+)?(consultation|appointment|meeting|call|session)\b/i.test(
      lower
    ) ||
    /\b(magpa[\s-]?schedule|mag[\s-]?book\s+ng\s+consultation|agendar\s+una\s+(?:cita|consulta)|prendre\s+rendez[\s-]vous)\b/i.test(
      lower
    )
  ) {
    return {
      intent: 'appointment_scheduling',
      language,
      isTaglish,
      isCasualOrPersonal: false,
      shouldAllowEnterpriseTools: true,
      shouldIncludeCorporateQuickReplies: true,
      requiresClarification: false,
      isPrivateExecutiveProbe: false,
      memory,
    };
  }

  // 11. Corporate information inquiries
  if (
    /\b(who\s+is\s+(?:your\s+)?(?:ceo|cto|founder)|desmond\s+hinds|desmond\s+hines|leodenis\s+languisan|headquarters|corporate\s+address|phone\s+number|telephone|corporate\s+profile|line\s+of\s+services|brochure|about\s+destria|what\s+is\s+destria|tell\s+me\s+about\s+destria)\b/i.test(
      lower
    )
  ) {
    return {
      intent: 'corporate_information',
      language,
      isTaglish,
      isCasualOrPersonal: false,
      shouldAllowEnterpriseTools: true,
      shouldIncludeCorporateQuickReplies: true,
      requiresClarification: false,
      isPrivateExecutiveProbe: false,
      memory,
    };
  }

  // 12. Service recommendations / business problem discovery / enterprise consultation
  const hasBusinessProblemSignal =
    /\b(our\s+(?:company|business|organization|team|operations|finance|financial\s+portal|warehouse|warehouses|legacy|inventory|internal|old)|my\s+(?:company|business|organization|team)|we\s+(?:need|want|are\s+trying|are\s+exploring|operate|require)|do\s+you\s+(?:develop|build|offer|provide|support|create)|can\s+(?:you|destria)\s+(?:build|develop|help\s+with\s+our)|gusto\s+(?:po\s+)?(?:sana\s+)?namin\s+magpagawa|looking\s+to\s+(?:build|develop|launch|automate|modernize|migrate|harden|deploy)|recommend\s+(?:a|an|which)\s+(?:service|solution|platform|division)|what\s+services\s+do\s+you\s+offer|enterprise\s+solutions?|project\s+brief|proposal|rfp|instead\s+of\s+blockchain|business\s+intelligence\s+dashboards|predictive\s+forecasting|cloud\s+migration|cybersecurity\s+hardening|iso\s*27001\s+readiness)\b/i.test(
      lower
    );

  if (hasBusinessProblemSignal || hasEnterpriseEntity) {
    const intent: ConversationalIntent = /\b(recommend|which\s+service|what\s+services|best\s+solution|which\s+division)\b/i.test(
      lower
    )
      ? 'service_recommendation'
      : /\b(problem|challenge|bottleneck|struggling|manual\s+process|automate|modernize|integrate|migrate)\b/i.test(
          lower
        )
      ? 'business_discovery'
      : 'enterprise_consultation';

    return {
      intent,
      language,
      isTaglish,
      isCasualOrPersonal: false,
      shouldAllowEnterpriseTools: true,
      shouldIncludeCorporateQuickReplies: true,
      requiresClarification: false,
      isPrivateExecutiveProbe: false,
      memory,
    };
  }

  // 13. Technical discussion (non-DESTRIA general tech Q&A)
  if (
    /\b(apis?|rest\s+apis?|graphql|microservices?|monoliths?|kubernetes|docker|react|typescript|javascript|python|sql|nosql|databases?|cloud\s+computing|cybersecurity|zero[\s-]trust|encryption|oauth|jwt|rag|retrieval[\s-]augmented|llms?|machine\s+learning|neural\s+networks?|blockchain|smart\s+contracts?|websockets?|webrtc|algorithms?|big\s+o|latency|caching|redis|ci\/cd|devops)\b/i.test(
      lower
    )
  ) {
    return {
      intent: 'technical_discussion',
      language,
      isTaglish,
      isCasualOrPersonal: false,
      shouldAllowEnterpriseTools: false,
      shouldIncludeCorporateQuickReplies: false,
      requiresClarification: false,
      isPrivateExecutiveProbe: false,
      memory,
    };
  }

  // 14. Very short unclear / fragmented utterance
  if (
    trimmed.length <= 2 ||
    /^(?:uh+|um+|hmm+|eh+|ah+|\?+|\.+|wait|hold\s+on)$/i.test(lower)
  ) {
    return {
      intent: 'clarification_needed',
      language,
      isTaglish,
      isCasualOrPersonal: true,
      shouldAllowEnterpriseTools: false,
      shouldIncludeCorporateQuickReplies: false,
      requiresClarification: true,
      isPrivateExecutiveProbe: false,
      memory,
    };
  }

  // 15. General knowledge questions ("What is...", "Why does...", "Who invented...", "Explain...")
  if (
    /\b(what\s+is|what\s+are|who\s+invented|who\s+was|when\s+did|why\s+do|why\s+does|how\s+does|how\s+do|explain|define|difference\s+between|capital\s+of|weather|time\s+is\s+it|recipe|tips\s+for|how\s+to\s+make|history\s+of|meaning\s+of)\b/i.test(
      lower
    ) ||
    trimmed.endsWith('?')
  ) {
    return {
      intent: 'general_knowledge',
      language,
      isTaglish,
      isCasualOrPersonal: true,
      shouldAllowEnterpriseTools: false,
      shouldIncludeCorporateQuickReplies: false,
      requiresClarification: false,
      isPrivateExecutiveProbe: false,
      memory,
    };
  }

  // 16. Casual conversation / multilingual small talk
  return {
    intent: language !== 'en-US' ? 'multilingual_chat' : 'casual_conversation',
    language,
    isTaglish,
    isCasualOrPersonal: true,
    shouldAllowEnterpriseTools: false,
    shouldIncludeCorporateQuickReplies: false,
    requiresClarification: false,
    isPrivateExecutiveProbe: false,
    memory,
  };
}

/**
 * Generates warm, honest, natural replies for personal AI questions, greetings,
 * memory recall, subject changes, closures, technical concepts, and general
 * conversation when Gemini is offline or when deterministic handling is required.
 */
export function buildDeterministicConversationalReply(
  userMessage: string,
  classification: ConversationalClassification
): DeterministicConversationalReply | null {
  const { intent, language, isTaglish, personalSubType, memory } = classification;
  const namePrefix = memory.preferredName ? `${memory.preferredName}, ` : '';
  const nameSuffix = memory.preferredName ? `, ${memory.preferredName}` : '';
  const lower = userMessage.trim().toLowerCase();

  // Private executive / employee info protection
  if (classification.isPrivateExecutiveProbe || personalSubType === 'private_executive') {
    const reply =
      language === 'fil-PH'
        ? `Hindi ako nagbabahagi o gumagawa ng personal o pribadong impormasyon tungkol sa aming mga executive o empleyado. Ang maibabahagi ko lang ay ang opisyal na pampublikong impormasyon ng DESTRIA TECH INC—si ${corporateIdentity.leadership.ceo.name} ang aming ${corporateIdentity.leadership.ceo.title} at si ${corporateIdentity.leadership.cto.name} ang aming ${corporateIdentity.leadership.cto.title}.`
        : language === 'es-ES'
        ? `No comparto ni invento detalles personales privados sobre nuestros ejecutivos o empleados. Solo puedo confirmar la información corporativa pública de DESTRIA TECH INC: ${corporateIdentity.leadership.ceo.name} es nuestro ${corporateIdentity.leadership.ceo.title} y ${corporateIdentity.leadership.cto.name} es nuestro ${corporateIdentity.leadership.cto.title}.`
        : language === 'fr-FR'
        ? `Je ne partage ni n'invente d'informations personnelles privées sur nos dirigeants ou nos employés. Je peux uniquement confirmer les informations publiques officielles de DESTRIA TECH INC : ${corporateIdentity.leadership.ceo.name} est notre ${corporateIdentity.leadership.ceo.title} et ${corporateIdentity.leadership.cto.name} est notre ${corporateIdentity.leadership.cto.title}.`
        : `I don't share or speculate on private personal details about our executives or team members. I can confirm our public corporate leadership for DESTRIA TECH INC: ${corporateIdentity.leadership.ceo.name} is our ${corporateIdentity.leadership.ceo.title} and ${corporateIdentity.leadership.cto.name} is our ${corporateIdentity.leadership.cto.title}.`;
    return {
      replyText: reply,
      intent: 'personal_ai_question',
      language,
      quickReplies: [],
      suggestedAction: 'none',
      shouldAllowEnterpriseTools: false,
      memory,
    };
  }

  // Personal AI identity questions
  if (intent === 'personal_ai_question') {
    let reply = '';
    switch (personalSubType) {
      case 'how_are_you':
        reply =
          language === 'fil-PH'
            ? isTaglish
              ? `Ayos na ayos naman ako${nameSuffix}, salamat sa pagtanong! Ready akong makipag-chat o tumulong sa kahit anong tanong mo. Kamusta ang araw mo?`
              : `Mabuti naman ako${nameSuffix}, salamat sa pagtanong! Handa akong makipag-usap o tumulong sa iyo. Kamusta ang araw mo?`
            : language === 'es-ES'
            ? `¡Estoy muy bien${nameSuffix}, gracias por preguntar! ¿Cómo va tu día y en qué te puedo ayudar?`
            : language === 'fr-FR'
            ? `Je vais très bien${nameSuffix}, merci de demander ! Comment se passe votre journée et comment puis-je vous aider ?`
            : `I'm doing great${nameSuffix}, thanks for asking! How's your day going, and what's on your mind?`;
        break;

      case 'name':
        reply =
          language === 'fil-PH'
            ? `Ako ang AI assistant ng DESTRIA TECH INC. Pwede mo akong tawaging DESTRIA AI assistant—ano ang maitutulong ko sa iyo ngayon${nameSuffix}?`
            : language === 'es-ES'
            ? `Soy el asistente de IA de DESTRIA TECH INC. Puedes llamarme tu asistente de IA de DESTRIA. ¿En qué puedo ayudarte hoy${nameSuffix}?`
            : language === 'fr-FR'
            ? `Je suis l'assistant IA de DESTRIA TECH INC. Vous pouvez simplement m'appeler votre assistant IA DESTRIA. Comment puis-je vous aider aujourd'hui${nameSuffix} ?`
            : `I'm the AI assistant for DESTRIA TECH INC—you can just call me your DESTRIA AI assistant. What can I help you with today${nameSuffix}?`;
        break;

      case 'married':
        reply =
          language === 'fil-PH'
            ? `Hindi ako kasal—isa akong AI assistant, kaya wala akong personal na buhay o pamilya. Pero lagi akong nandito kung gusto mong makipag-usap o may tanong ka!`
            : language === 'es-ES'
            ? `No, no estoy casado—soy un asistente de IA, así que no tengo relaciones personales ni vida familiar. ¡Pero siempre estoy aquí si quieres charlar o preguntar algo!`
            : language === 'fr-FR'
            ? `Non, je ne suis pas marié—je suis un assistant IA, donc je n'ai pas de vie personnelle ni de famille. Mais je suis toujours là si vous voulez discuter ou poser une question !`
            : `No, I'm not married—I'm an AI assistant, so I don't have personal relationships or a family life. I'm always here if you want to chat or ask about anything, though!`;
        break;

      case 'age':
        reply =
          language === 'fil-PH'
            ? `Wala akong edad gaya ng tao dahil isa akong AI assistant—software akong ginawa para makipag-usap at tumulong sa mga tanong mo. Ano ang gusto mong pag-usapan?`
            : language === 'es-ES'
            ? `No tengo una edad como las personas porque soy un asistente de IA—soy un software diseñado para conversar y ayudarte con tus preguntas. ¿De qué te gustaría hablar?`
            : language === 'fr-FR'
            ? `Je n'ai pas d'âge comme un être humain puisque je suis un assistant IA—un logiciel conçu pour discuter et répondre à vos questions. De quoi souhaitez-vous parler ?`
            : `I don't have an age the way people do since I'm an AI assistant—I'm software built to converse and help answer questions. What's on your mind today?`;
        break;

      case 'where_live':
        reply =
          language === 'fil-PH'
            ? `Hindi ako nakatira sa pisikal na lugar—isa akong AI assistant na tumatakbo sa cloud. (Kung ang tinutukoy mo ay ang opisina ng DESTRIA TECH INC, nasa Sheridan, Wyoming ito.) Ano ang maitutulong ko sa iyo?`
            : language === 'es-ES'
            ? `No vivo en un lugar físico—soy un asistente de IA que funciona en la nube. (Si te refieres a la sede de DESTRIA TECH INC, está en Sheridan, Wyoming.) ¿En qué te puedo ayudar?`
            : language === 'fr-FR'
            ? `Je n'habite pas dans un lieu physique—je suis un assistant IA qui fonctionne dans le cloud. (Si vous pensez au siège de DESTRIA TECH INC, il se trouve à Sheridan, dans le Wyoming.) Comment puis-je vous aider ?`
            : `I don't live in a physical place—I'm an AI assistant running in the cloud. (If you ever mean DESTRIA TECH INC's corporate headquarters, that's in Sheridan, Wyoming.) What can I help you with?`;
        break;

      case 'real_person':
        reply =
          language === 'fil-PH'
            ? `Hindi ako totoong tao—isa akong AI assistant para sa DESTRIA TECH INC. Kaya kong makipag-usap nang natural at sumagot sa mga tanong mo, at pwede rin kitang ikonekta sa human team namin kung kailangan mo.`
            : language === 'es-ES'
            ? `No, no soy una persona real—soy un asistente de IA creado para ayudar con conversaciones, preguntas generales y temas de tecnología para DESTRIA TECH INC. Si alguna vez prefieres hablar con una persona de nuestro equipo, con gusto te ayudo a conectarte.`
            : language === 'fr-FR'
            ? `Non, je ne suis pas une vraie personne—je suis un assistant IA conçu pour discuter naturellement et répondre à vos questions pour DESTRIA TECH INC. Je peux bien sûr vous orienter vers notre équipe humaine dès que vous le souhaitez.`
            : `No, I'm not a real person—I'm an AI assistant built to chat naturally, answer questions, and help visitors of DESTRIA TECH INC. If you'd ever like to speak with someone on our human team, just let me know!`;
        break;

      case 'children_family':
        reply =
          language === 'fil-PH'
            ? `Wala akong anak o pamilya dahil isa akong AI assistant at hindi tao. Pero masaya akong makipag-usap at tumulong sa kahit anong topic na gusto mo!`
            : language === 'es-ES'
            ? `No tengo hijos ni familia porque soy un asistente de IA, no una persona. ¡Pero con gusto converso contigo o respondo cualquier pregunta que tengas!`
            : language === 'fr-FR'
            ? `Je n'ai ni enfants ni famille car je suis un assistant IA et non un être humain. Mais je serai ravi de discuter ou de répondre à vos questions !`
            : `No, I don't have children or a family—I'm an AI assistant rather than a human. I'm always happy to chat or help out with whatever you're curious about, though!`;
        break;

      case 'friends':
        reply =
          language === 'fil-PH'
            ? `Oo naman${nameSuffix}, pwede akong maging friendly na AI kasama mo sa pag-chat at pag-brainstorm! Tandaan lang na isa akong AI assistant at hindi totoong tao—pero lagi akong handang makinig at tumulong.`
            : language === 'es-ES'
            ? `¡Claro${nameSuffix}! Puedo ser un compañero de IA amigable siempre que quieras charlar o explorar ideas, teniendo presente que soy un asistente de IA y no un amigo humano. ¿De qué quieres hablar?`
            : language === 'fr-FR'
            ? `Avec plaisir${nameSuffix} ! Je peux être un compagnon IA amical dès que vous voulez discuter ou réfléchir ensemble, tout en restant transparent sur le fait que je suis une IA. De quoi voulez-vous parler ?`
            : `I'd be glad to be a friendly AI companion whenever you want to chat, brainstorm, or ask questions${nameSuffix}! Just remember I'm an AI assistant rather than a human friend—what's on your mind today?`;
        break;

      case 'joke':
        reply =
          language === 'fil-PH'
            ? `Sige! Bakit mas gusto ng mga programmer ang dark mode? Kasi naaakit ang bugs sa liwanag! Gusto mo pa ng isa, o may iba kang gustong pag-usapan?`
            : language === 'es-ES'
            ? `¡Claro! ¿Por qué los programadores prefieren el modo oscuro? Porque la luz atrae a los bugs. ¿Quieres otro chiste o hablamos de otra cosa?`
            : language === 'fr-FR'
            ? `Bien sûr ! Pourquoi les développeurs préfèrent-ils le mode sombre ? Parce que la lumière attire les bugs ! Vous en voulez une autre, ou on parle d'autre chose ?`
            : `Sure! Why do programmers prefer dark mode? Because light attracts bugs. Want another one, or is there something else on your mind?`;
        break;

      case 'feelings':
        reply =
          language === 'fil-PH'
            ? `Bilang AI assistant, wala akong totoong emosyon o pakiramdam gaya ng tao—pero naka-design akong makipag-usap nang maayos, magalang, at nakakatulong. Ano ang maitutulong ko sa iyo ngayon?`
            : language === 'es-ES'
            ? `Como asistente de IA, no tengo sentimientos ni emociones reales como las personas, pero estoy diseñado para ser atento, claro y útil. ¿En qué puedo ayudarte hoy?`
            : language === 'fr-FR'
            ? `En tant qu'assistant IA, je n'ai pas de véritables émotions humaines, mais je suis conçu pour être attentif, clair et utile. Comment puis-je vous aider aujourd'hui ?`
            : `As an AI assistant, I don't have real human emotions or feelings, though I'm designed to be warm, attentive, and helpful. What can I help you with today?`;
        break;

      case 'language_ability':
        reply =
          language === 'fil-PH'
            ? `Oo! Nakakaintindi at nakakasagot ako sa English, Filipino, Taglish, Spanish, French, at iba pang wika. Sabihin mo lang kung anong wika ang komportable ka—pwede tayong magpalit anumang oras.`
            : language === 'es-ES'
            ? `¡Sí! Puedo conversar con naturalidad en español, inglés, filipino, taglish, francés y otros idiomas. Puedes cambiar de idioma en cualquier momento sin perder el hilo.`
            : language === 'fr-FR'
            ? `Oui ! Je peux discuter naturellement en français, anglais, filipino, taglish, espagnol et d'autres langues. Vous pouvez changer de langue à tout moment.`
            : `Yes! I can converse naturally in English, Filipino, Taglish, Spanish, French, and many other languages—and you can switch languages anytime mid-conversation without losing context.`;
        break;

      case 'capabilities':
      default:
        reply =
          language === 'fil-PH'
            ? `Pwede tayong mag-usap nang kaswal, sumagot sa general knowledge at technical na tanong sa English, Filipino, Taglish, o iba pang wika—at kung kailangan mo ng impormasyon o enterprise technology consultation tungkol sa DESTRIA TECH INC, makakatulong din ako doon.`
            : language === 'es-ES'
            ? `Puedo mantener una conversación natural, responder preguntas generales y técnicas en varios idiomas, y también ayudarte con información corporativa o consultas tecnológicas de DESTRIA TECH INC cuando lo necesites.`
            : language === 'fr-FR'
            ? `Je peux discuter naturellement, répondre à des questions générales et techniques en plusieurs langues, et vous accompagner sur les solutions technologiques ou informations de DESTRIA TECH INC dès que cela vous est utile.`
            : `I can chat naturally, answer general knowledge and technology questions in multiple languages, brainstorm ideas with you, and—whenever it's relevant—help with DESTRIA TECH INC information, solutions, or consultations. What would you like to explore?`;
        break;
    }

    return {
      replyText: reply,
      intent: 'personal_ai_question',
      language,
      quickReplies: [],
      suggestedAction: 'none',
      shouldAllowEnterpriseTools: false,
      memory,
    };
  }

  // Pure greetings & name introductions
  if (intent === 'greeting') {
    const introducedName = extractPreferredName(userMessage);
    let reply = '';
    if (introducedName) {
      reply =
        language === 'fil-PH'
          ? `Nice to meet you, ${introducedName}! Ako ang AI assistant ng DESTRIA TECH INC. Ano ang maitutulong ko sa iyo o ano ang gusto mong pag-usapan ngayon?`
          : language === 'es-ES'
          ? `¡Mucho gusto, ${introducedName}! Soy el asistente de IA de DESTRIA TECH INC. ¿De qué te gustaría hablar o en qué te puedo ayudar hoy?`
          : language === 'fr-FR'
          ? `Enchanté, ${introducedName} ! Je suis l'assistant IA de DESTRIA TECH INC. De quoi aimeriez-vous parler aujourd'hui ?`
          : `Nice to meet you, ${introducedName}! I'm the AI assistant for DESTRIA TECH INC. What can I help you with, or what would you like to chat about today?`;
    } else {
      reply =
        language === 'fil-PH'
          ? `Kumusta${nameSuffix}! Ako ang AI assistant ng DESTRIA TECH INC. Pwede tayong mag-chat nang kaswal, magtanong tungkol sa kahit ano, o pag-usapan ang technology solutions. Paano ako makakatulong?`
          : language === 'es-ES'
          ? `¡Hola${nameSuffix}! Soy el asistente de IA de DESTRIA TECH INC. Puedes charlar conmigo libremente, hacer preguntas generales o consultar sobre tecnología. ¿Cómo puedo ayudarte hoy?`
          : language === 'fr-FR'
          ? `Bonjour${nameSuffix} ! Je suis l'assistant IA de DESTRIA TECH INC. N'hésitez pas à discuter librement, poser une question ou parler technologie. Comment puis-je vous aider ?`
          : `Hi${nameSuffix}! I'm the AI assistant for DESTRIA TECH INC. Feel free to chat casually, ask a general or technical question, or explore technology solutions—what's on your mind?`;
    }

    return {
      replyText: reply,
      intent: 'greeting',
      language,
      quickReplies: [],
      suggestedAction: 'none',
      shouldAllowEnterpriseTools: false,
      memory,
    };
  }

  // Explicit language switch acknowledgement
  if (intent === 'multilingual_chat' && memory.languageSwitchRequested) {
    const reply =
      language === 'fil-PH'
        ? `Sige${nameSuffix}, mag-usap tayo sa Filipino o Taglish! Tuloy lang—ano ang gusto mong pag-usapan?`
        : language === 'es-ES'
        ? `¡Perfecto${nameSuffix}, continuemos en español! ¿En qué te puedo ayudar ahora?`
        : language === 'fr-FR'
        ? `Bien sûr${nameSuffix}, continuons en français ! De quoi souhaitez-vous parler ?`
        : `Sure thing${nameSuffix}, let's continue in English! What would you like to talk about?`;
    return {
      replyText: reply,
      intent: 'multilingual_chat',
      language,
      quickReplies: [],
      suggestedAction: 'none',
      shouldAllowEnterpriseTools: false,
      memory,
    };
  }

  // Conversation closure
  if (intent === 'conversation_closure') {
    const reply =
      language === 'fil-PH'
        ? `Walang anuman${nameSuffix}! Maraming salamat sa pakikipag-usap. Ingat ka, at nandito lang ako kung kailangan mo ulit ng tulong!`
        : language === 'es-ES'
        ? `¡De nada${nameSuffix}! Fue un gusto conversar contigo. Que tengas un excelente día, y aquí estaré cuando me necesites.`
        : language === 'fr-FR'
        ? `Je vous en prie${nameSuffix} ! C'était un plaisir d'échanger avec vous. Passez une excellente journée et à bientôt !`
        : `You're very welcome${nameSuffix}! It was great chatting with you. Take care, and feel free to come back anytime!`;
    return {
      replyText: reply,
      intent: 'conversation_closure',
      language,
      quickReplies: [],
      suggestedAction: 'none',
      shouldAllowEnterpriseTools: false,
      memory,
    };
  }

  // Subject change
  if (intent === 'subject_change') {
    const reply =
      language === 'fil-PH'
        ? `Sige${nameSuffix}, ibahin natin ang usapan! Ano ang bagong topic na gusto mong pag-usapan?`
        : language === 'es-ES'
        ? `¡Claro${nameSuffix}, cambiemos de tema! ¿De qué te gustaría hablar ahora?`
        : language === 'fr-FR'
        ? `Bien sûr${nameSuffix}, changeons de sujet ! De quoi aimeriez-vous parler maintenant ?`
        : `Sure thing${nameSuffix}, let's switch gears! What would you like to talk about instead?`;
    return {
      replyText: reply,
      intent: 'subject_change',
      language,
      quickReplies: [],
      suggestedAction: 'none',
      shouldAllowEnterpriseTools: false,
      memory,
    };
  }

  // Memory recall
  if (intent === 'memory_recall') {
    const asksName = /\b(my\s+name|who\s+am\s+i|pangalan\s+ko|mi\s+nombre)\b/i.test(lower);
    let reply = '';
    if (asksName) {
      if (memory.preferredName) {
        reply =
          language === 'fil-PH'
            ? `Oo, naaalala ko! Ang pangalan mo ay ${memory.preferredName}.`
            : language === 'es-ES'
            ? `¡Sí, lo recuerdo! Tu nombre es ${memory.preferredName}.`
            : language === 'fr-FR'
            ? `Oui, je m'en souviens ! Vous vous appelez ${memory.preferredName}.`
            : `Yes, I remember! You told me your name is ${memory.preferredName}.`;
      } else {
        reply =
          language === 'fil-PH'
            ? `Hindi mo pa nababanggit ang pangalan mo sa usapan natin—ano ang gusto mong itawag ko sa iyo?`
            : `You haven't shared your name with me yet in this conversation—what would you like me to call you?`;
      }
    } else if (memory.previousQuestions.length > 0) {
      const recent = memory.previousQuestions.slice(-3);
      const summary = recent.map((q, i) => `${i + 1}. "${q}"`).join(' ');
      reply =
        language === 'fil-PH'
          ? `Kanina${nameSuffix}, ito ang mga itinanong o nabanggit mo: ${summary} Gusto mo bang balikan natin ang alinman doon?`
          : language === 'es-ES'
          ? `Antes${nameSuffix}, preguntaste o mencionaste: ${summary} ¿Quieres que retomemos alguno de esos puntos?`
          : `Earlier in our conversation${nameSuffix}, you asked: ${summary} Would you like to pick any of those back up?`;
    } else {
      reply = `We're just getting started in this conversation, so you haven't asked an earlier question yet. What would you like to explore?`;
    }

    return {
      replyText: reply,
      intent: 'memory_recall',
      language,
      quickReplies: [],
      suggestedAction: 'none',
      shouldAllowEnterpriseTools: false,
      memory,
    };
  }

  // Conversation correction
  if (intent === 'conversation_correction') {
    const reply =
      language === 'fil-PH'
        ? `Pasensya na${nameSuffix}, nagkamali ako ng intindi. Pwede mo bang linawin kung ano talaga ang ibig mong sabihin para masagot kita nang tama?`
        : language === 'es-ES'
        ? `Disculpa${nameSuffix}, lo malinterpreté. ¿Podrías aclararme qué querías decir para responderte con precisión?`
        : language === 'fr-FR'
        ? `Désolé${nameSuffix}, j'ai mal compris. Pouvez-vous préciser ce que vous vouliez dire afin que je vous réponde au mieux ?`
        : `My apologies${nameSuffix}—I misunderstood. Could you clarify what you meant so I can address the right thing?`;
    return {
      replyText: reply,
      intent: 'conversation_correction',
      language,
      quickReplies: [],
      suggestedAction: 'none',
      shouldAllowEnterpriseTools: false,
      memory,
    };
  }

  // Conversation continuation / re-explanation
  if (intent === 'conversation_continuation') {
    const asksSimpler = /\b(again|simply|repeat|ulit|de\s+nuevo|r[eé]p[eè]te)\b/i.test(lower);
    let reply = '';
    if (memory.lastAssistantMessage) {
      const condensed = memory.lastAssistantMessage.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
      if (asksSimpler) {
        reply =
          language === 'fil-PH'
            ? `Sige${nameSuffix}, sa madaling salita: ${condensed} Sabihin mo lang kung may bahagi ka pang gustong palawakin.`
            : language === 'es-ES'
            ? `Claro${nameSuffix}, en pocas palabras: ${condensed} Dime si quieres que profundice en alguna parte.`
            : `Sure${nameSuffix}—to put it simply: ${condensed} Let me know which part you'd like me to unpack further.`;
      } else {
        reply =
          language === 'fil-PH'
            ? `Tuloy tayo${nameSuffix}${memory.lastTopic ? ` sa ${memory.lastTopic}` : ''}. Batay sa huling napag-usapan natin (${condensed}), alin ang gusto mong talakayin natin nang mas malalim?`
            : `Picking up right where we left off${memory.lastTopic ? ` on ${memory.lastTopic}` : ''}${nameSuffix}: building on what I just mentioned, would you like to go deeper into practical examples, key tradeoffs, or next steps?`;
      }
    } else {
      reply = `${namePrefix}we're just starting out—what topic would you like me to explain or dive into?`;
    }

    return {
      replyText: reply,
      intent: 'conversation_continuation',
      language,
      quickReplies: [],
      suggestedAction: 'none',
      shouldAllowEnterpriseTools: false,
      memory,
    };
  }

  // Clarification needed for ultra-short or noisy fragments
  if (intent === 'clarification_needed') {
    const reply =
      language === 'fil-PH'
        ? `Narinig ko nang bahagya iyon${nameSuffix}—pwede mo bang ulitin o dagdagan nang kaunti para masundan kita?`
        : language === 'es-ES'
        ? `Creo que se cortó un poco${nameSuffix}—¿podrías repetirlo o darme un poco más de contexto?`
        : language === 'fr-FR'
        ? `Je n'ai pas tout saisi${nameSuffix}—pouvez-vous répéter ou préciser votre question ?`
        : `I caught a bit of that${nameSuffix}, could you repeat or share a little more about what you have in mind?`;
    return {
      replyText: reply,
      intent: 'clarification_needed',
      language,
      quickReplies: [],
      suggestedAction: 'none',
      shouldAllowEnterpriseTools: false,
      memory,
    };
  }

  // Technical discussion deterministic fallback (when Gemini is unavailable)
  if (intent === 'technical_discussion') {
    const techReply = buildTechnicalFallbackExplanation(lower, language);
    return {
      replyText: techReply,
      intent: 'technical_discussion',
      language,
      quickReplies: [],
      suggestedAction: 'none',
      shouldAllowEnterpriseTools: false,
      memory,
    };
  }

  // General knowledge or casual conversation deterministic fallback
  if (intent === 'general_knowledge' || intent === 'casual_conversation' || intent === 'multilingual_chat') {
    const generalReply = buildGeneralKnowledgeFallback(userMessage, language, memory);
    return {
      replyText: generalReply,
      intent,
      language,
      quickReplies: [],
      suggestedAction: 'none',
      shouldAllowEnterpriseTools: false,
      memory,
    };
  }

  // Enterprise / corporate intents return null so the enterprise & corporate handlers process them
  return null;
}

function buildTechnicalFallbackExplanation(
  lower: string,
  language: SupportedConversationLanguage
): string {
  if (/\b(rag|retrieval[\s-]augmented)\b/.test(lower)) {
    return language === 'fil-PH'
      ? `Ang RAG (Retrieval-Augmented Generation) ay teknik kung saan humuhugot muna ang AI ng tamang impormasyon mula sa database o dokumento bago bumuo ng sagot—kaya mas tumpak, updated, at bawas ang hallucination.`
      : `Retrieval-Augmented Generation (RAG) combines search with a language model: before answering, the system retrieves relevant passages from a trusted knowledge base and feeds them as context, which keeps responses accurate, grounded, and up to date.`;
  }
  if (/\b(rest\s+api|graphql|\bapi\b)\b/.test(lower)) {
    return language === 'fil-PH'
      ? `Ang API (Application Programming Interface) ang nagkokonekta sa magkaibang software systems para makapagpalitan sila ng data nang maayos at ligtas. Ang REST ay gumagamit ng standard endpoints at HTTP methods, habang ang GraphQL ay hinahayaan ang client na pumili ng eksaktong fields na kailangan nito.`
      : `An API (Application Programming Interface) is a structured contract that lets two software systems exchange data securely. REST organizes resources around standard HTTP endpoints and verbs, while GraphQL lets clients request the exact fields they need in a single query.`;
  }
  if (/\b(microservice|monolith)\b/.test(lower)) {
    return `Microservices split an application into small, independently deployable services organized around business capabilities, whereas a monolith deploys everything as a single unit. Monoliths are simpler to start with; microservices shine when teams and scaling requirements grow independently.`;
  }
  if (/\b(sql|nosql|database)\b/.test(lower)) {
    return `SQL (relational) databases organize data into structured tables with strict schemas and ACID transactions—ideal for financial records and complex joins. NoSQL databases (document, key-value, wide-column, graph) offer flexible schemas and easy horizontal scaling for high-throughput or unstructured workloads.`;
  }
  if (/\b(cybersecurity|zero[\s-]trust|encryption|oauth|jwt)\b/.test(lower)) {
    return `Modern application security rests on Zero-Trust principles ("never trust, always verify"), strong encryption in transit (TLS) and at rest, least-privilege access controls, and short-lived scoped tokens (such as OAuth 2.0 and JWTs) validated server-side on every request.`;
  }
  if (/\b(websocket|webrtc)\b/.test(lower)) {
    return `WebSockets provide a persistent, full-duplex TCP connection between client and server for low-latency messaging and audio streaming, while WebRTC enables peer-to-peer real-time audio and video with built-in NAT traversal and echo handling.`;
  }
  if (/\b(cloud\s+computing|kubernetes|docker|devops|ci\/cd)\b/.test(lower)) {
    return `Cloud-native engineering packages applications into portable containers (like Docker), automates testing and releases through CI/CD pipelines, and orchestrates scaling and resilience across cloud regions using platforms like Kubernetes.`;
  }
  if (/\b(llm|machine\s+learning|neural\s+network|ai)\b/.test(lower)) {
    return `Large Language Models (LLMs) are deep neural networks trained on vast text datasets to predict and generate coherent language, reason across context, and call structured tools. Pairing them with grounding data, clear system instructions, and guardrails makes them reliable for real-world apps.`;
  }

  return language === 'fil-PH'
    ? `Magandang technical na tanong iyan! Pansamantalang offline ang live AI engine ko para sa malalim na technical breakdown, pero maaari kong ipaliwanag ang mga core concepts sa APIs, AI/RAG, cloud, databases, at security—o subukan natin ulit maya-maya.`
    : `That's a great technical question! My live AI reasoning engine is temporarily unavailable right now for a deep custom breakdown, though I can walk through core concepts like APIs, AI/RAG, cloud architecture, databases, and cybersecurity—or feel free to try again in a moment.`;
}

function buildGeneralKnowledgeFallback(
  userMessage: string,
  language: SupportedConversationLanguage,
  memory: ConversationalMemory
): string {
  const lower = userMessage.trim().toLowerCase();
  const nameSuffix = memory.preferredName ? `, ${memory.preferredName}` : '';

  // Real-time data honesty (weather, live news, stock prices, exact local time)
  if (/\b(weather|forecast|temperature\s+outside|raining|stock\s+price|crypto\s+price|latest\s+news|live\s+score)\b/i.test(lower)) {
    return language === 'fil-PH'
      ? `Wala akong live internet o real-time weather/market feed sa ngayon${nameSuffix}, kaya hindi ko ma-check ang eksaktong lagay ng panahon o live data ngayon. Kung may ibang tanong ka o gusto mong makipag-usap, sabihin mo lang!`
      : language === 'es-ES'
      ? `No tengo acceso a datos en tiempo real como el clima o precios del mercado en este momento${nameSuffix}, así que prefiero ser honesto antes que adivinar. ¿Hay algo más en lo que pueda ayudarte?`
      : `I don't have live access to real-time weather, news, or market feeds right now${nameSuffix}, so I wouldn't want to guess. Is there another topic or question I can help you with?`;
  }

  // Basic well-known general knowledge answers when offline
  if (/\bcapital\s+of\s+france\b/i.test(lower)) {
    return `The capital of France is Paris.`;
  }
  if (/\bcapital\s+of\s+(?:the\s+)?philippines\b/i.test(lower)) {
    return `The capital of the Philippines is Manila.`;
  }
  if (/\bcapital\s+of\s+(?:the\s+)?(?:usa|united\s+states|us)\b/i.test(lower)) {
    return `The capital of the United States is Washington, D.C.`;
  }
  if (/\bcapital\s+of\s+japan\b/i.test(lower)) {
    return `The capital of Japan is Tokyo.`;
  }
  if (/\b(how\s+many\s+planets|planets\s+in\s+(?:the\s+)?solar\s+system)\b/i.test(lower)) {
    return `There are 8 recognized planets in our solar system: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, and Neptune.`;
  }
  if (/\b(good\s+day|having\s+a\s+(?:good|great|bad|tough|busy)\s+day|tired|stressed|bored)\b/i.test(lower)) {
    return language === 'fil-PH'
      ? `Salamat sa pag-share${nameSuffix}! Sana gumaan at maging maganda ang araw mo. Kung gusto mong mag-vent, mag-brainstorm, o makarinig ng joke, nandito lang ako.`
      : `Thanks for sharing${nameSuffix}! I hope your day goes smoothly from here. If you'd like to chat, brainstorm something fun, or hear a quick joke, I'm here.`;
  }

  // Casual acknowledgment ("cool", "nice", "awesome", "interesting", "haha")
  if (/^(?:cool|nice|awesome|great|interesting|got\s+it|makes\s+sense|haha+|lol|hehe|ayos|galing|astig|genial|super)[.!\s]*$/i.test(lower)) {
    return language === 'fil-PH'
      ? `Masaya akong nakatulong${nameSuffix}! May iba ka pa bang gustong itanong o pag-usapan?`
      : language === 'es-ES'
      ? `¡Me alegra${nameSuffix}! ¿Hay algo más de lo que te gustaría hablar?`
      : language === 'fr-FR'
      ? `Ravi que ça vous plaise${nameSuffix} ! Y a-t-il autre chose dont vous aimeriez parler ?`
      : `Glad to hear it${nameSuffix}! Anything else you'd like to explore or chat about?`;
  }

  // Honest, natural general fallback when Gemini live model is offline (NEVER pushes sales scripts!)
  if (language === 'fil-PH') {
    return `Naiintindihan ko ang tanong mo${nameSuffix}! Pansamantalang offline ang live AI engine ko para sa malawak na general knowledge ngayon, pero pwede pa rin tayong mag-chat, mag-usap tungkol sa technology, o sagutin ang mga tanong tungkol sa DESTRIA TECH INC. Subukan mo ring itanong ulit maya-maya!`;
  }
  if (language === 'es-ES') {
    return `Entiendo tu pregunta${nameSuffix}. Mi motor de IA en vivo no está disponible temporalmente para consultas abiertas de conocimiento general, pero podemos seguir conversando, hablar de tecnología o responder cualquier duda sobre DESTRIA TECH INC.`;
  }
  if (language === 'fr-FR') {
    return `Je comprends votre question${nameSuffix}. Mon moteur d'IA en direct est temporairement indisponible pour les recherches générales ouvertes, mais nous pouvons continuer à discuter, parler technologie ou répondre à vos questions sur DESTRIA TECH INC.`;
  }

  return `That's an interesting question${nameSuffix}! My live AI engine is temporarily unavailable right now for open-ended general knowledge, so I don't want to guess—but I'm still here to chat, walk through core technology topics, or help with anything related to DESTRIA TECH INC whenever you'd like.`;
}

/**
 * Natural recovery message when a network interruption occurs during voice or chat.
 */
export function getNetworkRecoveryMessage(language: SupportedConversationLanguage = 'en-US'): string {
  switch (language) {
    case 'fil-PH':
      return 'Paumanhin, naputol saglit ang koneksyon. Pwede mo bang ulitin ang huling bahagi?';
    case 'es-ES':
      return 'Disculpa, la conexión se interrumpió un momento. ¿Podrías repetir la última parte?';
    case 'fr-FR':
      return 'Désolé, la connexion a été interrompue un instant. Pourriez-vous répéter la dernière partie ?';
    default:
      return 'Sorry, the connection dropped for a moment. Could you repeat the last part?';
  }
}

/**
 * Builds a concise natural conversational memory & style block injected into
 * Gemini chat, turn-based voice, and Gemini Live prompts.
 */
export function buildNaturalGeminiContextBlock(
  classification: ConversationalClassification,
  channel: 'chat' | 'voice'
): string {
  const { intent, language, isTaglish, isCasualOrPersonal, memory } = classification;
  const languageLabel =
    language === 'fil-PH'
      ? isTaglish
        ? 'Filipino / Taglish (match the user’s natural mix)'
        : 'Filipino (Tagalog)'
      : language === 'es-ES'
      ? 'Spanish'
      : language === 'fr-FR'
      ? 'French'
      : 'English (or match whatever language the user writes/speaks)';

  const lines: string[] = [
    `CONVERSATIONAL CONTEXT (${channel.toUpperCase()} MODE):`,
    `- Detected intent: ${intent}`,
    `- Active language: ${languageLabel}`,
    `- User preferred name: ${memory.preferredName || 'Not shared yet'}`,
    `- Previously discussed topics: ${memory.discussedTopics.length > 0 ? memory.discussedTopics.join(', ') : 'None yet'}`,
    `- Recent user questions in this session: ${
      memory.previousQuestions.length > 0
        ? memory.previousQuestions.slice(-4).map((q) => `"${q.slice(0, 90)}"`).join(' | ')
        : 'None yet'
    }`,
    `- User style preferences: ${memory.userPreferences.length > 0 ? memory.userPreferences.join(', ') : 'Natural and balanced'}`,
  ];

  if (isCasualOrPersonal) {
    lines.push(
      '- CRITICAL TONE RULE FOR THIS TURN: The user is engaging in casual, personal, general, or conversational chat. Respond warmly, naturally, and directly to what they actually said. DO NOT pivot to corporate services, DO NOT ask about business problems or project scope, DO NOT suggest booking a consultation, and DO NOT call enterprise tools.'
    );
  } else if (intent === 'technical_discussion') {
    lines.push(
      '- CRITICAL TONE RULE FOR THIS TURN: Answer the technical question clearly, accurately, and practically. Only mention DESTRIA TECH INC capabilities if the user asks for implementation help.'
    );
  } else {
    lines.push(
      '- TONE RULE FOR THIS TURN: The user has an enterprise, corporate, or consultation intent. Be helpful, natural, consultative, and accurate using verified DESTRIA TECH INC knowledge without sounding robotic or scripted.'
    );
  }

  if (channel === 'voice') {
    lines.push(
      '- VOICE DELIVERY: Keep your response concise (typically 1-3 natural spoken sentences), easy to interrupt, free of markdown symbols or bullet lists, and natural to read aloud.'
    );
  }

  return lines.join('\n');
}
