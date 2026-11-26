/**
 * DESTRIA TECH INC — Unified Front Desk Receptionist Operations Store (Migration 010)
 *
 * Manages:
 * - Corporate departments & routing keywords (no invented employees)
 * - Human-agent presence & atomic claiming (`claim_frontdesk_human_agent` RPC on Supabase
 *   + single-flight atomic claiming in local/test mode) with expiry recovery
 * - Business-hours & holiday schedule evaluation
 * - Idempotent callback requests
 * - Unified ordered voice + chat conversation turns & customer memory
 * - Privacy & voice processing consent records
 */

import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type UnifiedChannel =
  | 'ai_frontdesk_chat'
  | 'ai_frontdesk_voice'
  | 'widget_chat'
  | 'widget_voice';

export type AgentAvailabilityState = 'available' | 'busy' | 'break' | 'offline';
export type AssignmentState = 'offered' | 'accepted' | 'released' | 'expired';
export type CallbackState = 'requested' | 'scheduled' | 'completed' | 'cancelled';
export type ConsentType =
  | 'voice_processing'
  | 'recording'
  | 'transcript_storage'
  | 'callback_contact'
  | 'inquiry_submission'
  | 'privacy_policy';

export interface FrontDeskDepartment {
  id: string;
  name: string;
  slug: string;
  description: string;
  routingKeywords: string[];
  supportedLanguages: string[];
  priority: number;
  defaultSlaMinutes: number;
  enabled: boolean;
}

export interface FrontDeskHumanAgent {
  id: string;
  departmentId: string;
  departmentSlug: string;
  agentCode: string;
  displayName: string;
  adminUserEmail?: string;
  availabilityState: AgentAvailabilityState;
  preferredLanguage: string;
  supportedLanguages: string[];
  secondaryDepartmentSlugs: string[];
  maxConcurrentSessions: number;
  activeSessionCount: number;
  currentSessionKey: string | null;
  lastAssignedAt: string | null;
  lastHeartbeatAt: string | null;
  stateChangedAt: string;
}

export interface FrontDeskAgentAssignment {
  id: string;
  agentId: string;
  agentDisplayName: string;
  sessionKey: string;
  departmentSlug: string;
  state: AssignmentState;
  idempotencyKey?: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string;
  releasedAt?: string;
  notes?: string;
}

export interface FrontDeskCallbackRequest {
  id: string;
  referenceCode: string;
  sessionKey: string;
  idempotencyKey: string;
  departmentSlug: string;
  visitorName: string;
  visitorEmail?: string;
  visitorPhone?: string;
  preferredWindow?: string;
  timezone: string;
  reason: string;
  state: CallbackState;
  assignedAgentId?: string;
  requestedAt: string;
  updatedAt: string;
}

export interface ScheduleRule {
  id: string;
  recordType: 'business_hours' | 'holiday';
  timezone: string;
  dayOfWeek?: number;
  openTime?: string;
  closeTime?: string;
  holidayDate?: string;
  holidayName?: string;
  isActive: boolean;
}

export interface BusinessHoursEvaluation {
  isOpen: boolean;
  reason: 'open' | 'holiday' | 'outside_hours';
  timezone: string;
  holidayName?: string;
  localDate: string;
  localTime: string;
}

export interface UnifiedConversationTurn {
  id: string;
  sessionKey: string;
  turnId: string;
  turnSequence: number;
  sender: 'user' | 'ai';
  sourceChannel: UnifiedChannel;
  language: string;
  detectedIntent?: string;
  departmentSlug?: string;
  providerUsed?: string;
  messageText: string;
  idempotencyKey?: string;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ConsentRecord {
  id: string;
  sessionKey: string;
  ownerEmail?: string;
  consentType: ConsentType;
  granted: boolean;
  policyVersion: string;
  ipHash?: string;
  recordedAt: string;
}

export interface UnifiedSessionMetadata {
  sessionKey: string;
  activeChannel: UnifiedChannel;
  preferredLanguage: string;
  activeDepartmentSlug: string;
  verifiedClientEmail: string | null;
  verifiedAt: string | null;
  generationEpoch: number;
  consentRecorded: boolean;
  lastProviderUsed: string | null;
  customerMemory: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_DEPARTMENTS: FrontDeskDepartment[] = [
  {
    id: 'dept-enterprise-solutions',
    name: 'Enterprise Solutions & Architecture',
    slug: 'enterprise_solutions',
    description:
      'Custom software engineering, enterprise architecture, ERP/CRM, cloud platforms, and preliminary masterplans.',
    routingKeywords: [
      'software',
      'architecture',
      'erp',
      'crm',
      'cloud',
      'platform',
      'web',
      'mobile',
      'masterplan',
      'project',
    ],
    supportedLanguages: ['en-US', 'fil-PH'],
    priority: 10,
    defaultSlaMinutes: 30,
    enabled: true,
  },
  {
    id: 'dept-ai-automation',
    name: 'AI, Automation & Data Engineering',
    slug: 'ai_automation',
    description:
      'Applied AI systems, intelligent workflows, voice/chat automation, analytics, and data pipelines.',
    routingKeywords: [
      'ai',
      'automation',
      'chatbot',
      'voice',
      'agent',
      'analytics',
      'machine learning',
      'workflow',
    ],
    supportedLanguages: ['en-US', 'fil-PH'],
    priority: 20,
    defaultSlaMinutes: 30,
    enabled: true,
  },
  {
    id: 'dept-cybersecurity',
    name: 'Cybersecurity, Compliance & Infrastructure',
    slug: 'cybersecurity_infrastructure',
    description:
      'Security audits, cloud hardening, zero-trust governance, DevOps, and compliance architecture.',
    routingKeywords: [
      'security',
      'cybersecurity',
      'audit',
      'compliance',
      'devops',
      'infrastructure',
      'encryption',
    ],
    supportedLanguages: ['en-US', 'fil-PH'],
    priority: 30,
    defaultSlaMinutes: 20,
    enabled: true,
  },
  {
    id: 'dept-executive-consultations',
    name: 'Executive Consultations & Commercial Desk',
    slug: 'executive_consultations',
    description:
      'Executive discovery scheduling, strategic partnerships, and formal commercial scope review.',
    routingKeywords: [
      'consultation',
      'executive',
      'meeting',
      'schedule',
      'appointment',
      'proposal',
      'quote',
      'pricing',
      'partnership',
    ],
    supportedLanguages: ['en-US', 'fil-PH'],
    priority: 40,
    defaultSlaMinutes: 30,
    enabled: true,
  },
  {
    id: 'dept-client-support',
    name: 'Client Support & Front Desk Operations',
    slug: 'client_support',
    description:
      'General corporate inquiries, returning client assistance, and human escalation routing.',
    routingKeywords: [
      'support',
      'help',
      'human',
      'representative',
      'callback',
      'status',
      'inquiry',
    ],
    supportedLanguages: ['en-US', 'fil-PH'],
    priority: 50,
    defaultSlaMinutes: 30,
    enabled: true,
  },
];

const DEFAULT_SCHEDULE_RULES: ScheduleRule[] = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  id: `bh-Asia/Manila-${dayOfWeek}`,
  recordType: 'business_hours',
  timezone: 'Asia/Manila',
  dayOfWeek,
  openTime: '09:00',
  closeTime: '18:00',
  isActive: true,
}));

export class FrontDeskOperationsStore {
  private readonly supabase: SupabaseClient | null;
  private readonly departments = new Map<string, FrontDeskDepartment>();
  private readonly agents = new Map<string, FrontDeskHumanAgent>();
  private readonly assignments = new Map<string, FrontDeskAgentAssignment>();
  private readonly assignmentIdempotency = new Map<string, string>();
  private readonly callbacks = new Map<string, FrontDeskCallbackRequest>();
  private readonly callbackIdempotency = new Map<string, string>();
  private readonly scheduleRules = new Map<string, ScheduleRule>();
  private readonly sessionMeta = new Map<string, UnifiedSessionMetadata>();
  private readonly turnsBySession = new Map<string, UnifiedConversationTurn[]>();
  private readonly turnIdempotency = new Map<string, UnifiedConversationTurn[]>();
  private readonly consentsBySession = new Map<string, ConsentRecord[]>();

  constructor(options?: { supabaseUrl?: string; serviceRoleKey?: string }) {
    const url = (options?.supabaseUrl ?? process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
    const key = (options?.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
    this.supabase =
      url && key
        ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
        : null;

    for (const dept of DEFAULT_DEPARTMENTS) {
      this.departments.set(dept.slug, { ...dept });
    }
    for (const rule of DEFAULT_SCHEDULE_RULES) {
      this.scheduleRules.set(rule.id, { ...rule });
    }
  }

  public get isDurable(): boolean {
    return this.supabase !== null;
  }

  // -------------------------------------------------------------------------
  // 1. Unified Session Metadata & Ordered Voice/Chat History
  // -------------------------------------------------------------------------
  public getOrCreateSessionMeta(
    sessionKey: string,
    initialChannel: UnifiedChannel = 'ai_frontdesk_chat',
    preferredLanguage = 'en-US'
  ): UnifiedSessionMetadata {
    const existing = this.sessionMeta.get(sessionKey);
    if (existing) {
      existing.activeChannel = initialChannel;
      existing.updatedAt = new Date().toISOString();
      return { ...existing };
    }
    const now = new Date().toISOString();
    const created: UnifiedSessionMetadata = {
      sessionKey,
      activeChannel: initialChannel,
      preferredLanguage,
      activeDepartmentSlug: 'enterprise_solutions',
      verifiedClientEmail: null,
      verifiedAt: null,
      generationEpoch: 0,
      consentRecorded: false,
      lastProviderUsed: null,
      customerMemory: {},
      createdAt: now,
      updatedAt: now,
    };
    this.sessionMeta.set(sessionKey, created);
    return { ...created };
  }

  public getSessionMeta(sessionKey: string): UnifiedSessionMetadata | null {
    const existing = this.sessionMeta.get(sessionKey);
    return existing ? { ...existing } : null;
  }

  public updateSessionMeta(
    sessionKey: string,
    patch: Partial<Omit<UnifiedSessionMetadata, 'sessionKey' | 'createdAt'>>
  ): UnifiedSessionMetadata {
    const current = this.sessionMeta.get(sessionKey) || this.getOrCreateSessionMeta(sessionKey);
    const updated: UnifiedSessionMetadata = {
      ...current,
      ...patch,
      customerMemory: {
        ...current.customerMemory,
        ...(patch.customerMemory || {}),
      },
      updatedAt: new Date().toISOString(),
    };
    this.sessionMeta.set(sessionKey, updated);

    if (this.supabase) {
      void this.supabase
        .from('ai_conversation_sessions')
        .update({
          active_channel: updated.activeChannel,
          active_department_slug: updated.activeDepartmentSlug,
          verified_client_email: updated.verifiedClientEmail,
          verified_at: updated.verifiedAt,
          customer_memory_json: updated.customerMemory,
          generation_epoch: updated.generationEpoch,
          consent_recorded: updated.consentRecorded,
          last_provider_used: updated.lastProviderUsed,
          language: updated.preferredLanguage,
          last_activity_at: updated.updatedAt,
          updated_at: updated.updatedAt,
        })
        .eq('session_key', sessionKey);
    }
    return { ...updated };
  }

  public incrementGenerationEpoch(sessionKey: string): number {
    const current = this.getOrCreateSessionMeta(sessionKey);
    const nextEpoch = current.generationEpoch + 1;
    this.updateSessionMeta(sessionKey, { generationEpoch: nextEpoch });
    return nextEpoch;
  }

  public findTurnsByIdempotencyKey(sessionKey: string, idempotencyKey: string): UnifiedConversationTurn[] | null {
    const key = `${sessionKey}::${idempotencyKey}`;
    const cached = this.turnIdempotency.get(key);
    return cached ? cached.map((t) => ({ ...t })) : null;
  }

  public async recordUnifiedExchange(params: {
    sessionKey: string;
    turnId: string;
    sourceChannel: UnifiedChannel;
    language: string;
    userMessage: string;
    assistantReply: string;
    detectedIntent?: string;
    departmentSlug?: string;
    providerUsed?: string;
    idempotencyKey?: string;
    latencyMs?: number;
    metadata?: Record<string, unknown>;
  }): Promise<{ userTurn: UnifiedConversationTurn; assistantTurn: UnifiedConversationTurn }> {
    const list = this.turnsBySession.get(params.sessionKey) || [];
    const now = new Date().toISOString();
    const userSeq = list.length + 1;
    const aiSeq = list.length + 2;

    const userTurn: UnifiedConversationTurn = {
      id: crypto.randomUUID(),
      sessionKey: params.sessionKey,
      turnId: params.turnId,
      turnSequence: userSeq,
      sender: 'user',
      sourceChannel: params.sourceChannel,
      language: params.language,
      detectedIntent: params.detectedIntent,
      departmentSlug: params.departmentSlug,
      messageText: params.userMessage,
      idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}:user` : undefined,
      createdAt: now,
    };

    const assistantTurn: UnifiedConversationTurn = {
      id: crypto.randomUUID(),
      sessionKey: params.sessionKey,
      turnId: params.turnId,
      turnSequence: aiSeq,
      sender: 'ai',
      sourceChannel: params.sourceChannel,
      language: params.language,
      detectedIntent: params.detectedIntent,
      departmentSlug: params.departmentSlug,
      providerUsed: params.providerUsed,
      messageText: params.assistantReply,
      idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}:ai` : undefined,
      latencyMs: params.latencyMs,
      metadata: params.metadata,
      createdAt: new Date(Date.now() + 1).toISOString(),
    };

    list.push(userTurn, assistantTurn);
    this.turnsBySession.set(params.sessionKey, list);

    if (params.idempotencyKey) {
      this.turnIdempotency.set(`${params.sessionKey}::${params.idempotencyKey}`, [
        { ...userTurn },
        { ...assistantTurn },
      ]);
    }

    if (this.supabase) {
      try {
        const { data: sessionRow } = await this.supabase
          .from('ai_conversation_sessions')
          .select('id')
          .eq('session_key', params.sessionKey)
          .maybeSingle();
        if (sessionRow?.id) {
          await this.supabase.from('ai_conversation_turns').upsert(
            [
              {
                session_id: sessionRow.id,
                turn_id: userTurn.turnId,
                sender: 'user',
                source_channel: userTurn.sourceChannel,
                turn_sequence: userTurn.turnSequence,
                detected_intent: userTurn.detectedIntent || null,
                language: userTurn.language,
                department_slug: userTurn.departmentSlug || null,
                message_text: userTurn.messageText,
                idempotency_key: userTurn.idempotencyKey || null,
              },
              {
                session_id: sessionRow.id,
                turn_id: assistantTurn.turnId,
                sender: 'ai',
                source_channel: assistantTurn.sourceChannel,
                turn_sequence: assistantTurn.turnSequence,
                detected_intent: assistantTurn.detectedIntent || null,
                language: assistantTurn.language,
                department_slug: assistantTurn.departmentSlug || null,
                provider_used: assistantTurn.providerUsed || null,
                message_text: assistantTurn.messageText,
                idempotency_key: assistantTurn.idempotencyKey || null,
                latency_ms: assistantTurn.latencyMs ?? null,
                metadata_json: assistantTurn.metadata || {},
              },
            ],
            { onConflict: 'session_id,turn_id,sender' }
          );
        }
      } catch {
        // Non-blocking mirror; session dossier write-through remains governed by FrontDeskStore
      }
    }

    return { userTurn, assistantTurn };
  }

  public getUnifiedHistory(
    sessionKey: string,
    options?: { afterSequence?: number; limit?: number }
  ): UnifiedConversationTurn[] {
    const all = this.turnsBySession.get(sessionKey) || [];
    const afterSeq = options?.afterSequence ?? 0;
    const limit = Math.max(1, Math.min(200, options?.limit ?? 100));
    return all
      .filter((t) => t.turnSequence > afterSeq)
      .sort((a, b) => a.turnSequence - b.turnSequence)
      .slice(0, limit)
      .map((t) => ({ ...t }));
  }

  public deleteSessionOperationalData(sessionKey: string): void {
    this.sessionMeta.delete(sessionKey);
    this.turnsBySession.delete(sessionKey);
    this.consentsBySession.delete(sessionKey);
    for (const key of Array.from(this.turnIdempotency.keys())) {
      if (key.startsWith(`${sessionKey}::`)) {
        this.turnIdempotency.delete(key);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. Corporate Departments & Intelligent Department Detection
  // -------------------------------------------------------------------------
  public listDepartments(includeDisabled = false): FrontDeskDepartment[] {
    return Array.from(this.departments.values())
      .filter((d) => includeDisabled || d.enabled)
      .sort((a, b) => a.priority - b.priority)
      .map((d) => ({ ...d }));
  }

  public upsertDepartment(input: {
    name: string;
    slug: string;
    description?: string;
    routingKeywords?: string[];
    supportedLanguages?: string[];
    priority?: number;
    defaultSlaMinutes?: number;
    enabled?: boolean;
  }): FrontDeskDepartment {
    const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    const existing = this.departments.get(slug);
    const record: FrontDeskDepartment = {
      id: existing?.id || crypto.randomUUID(),
      name: input.name.trim(),
      slug,
      description: (input.description ?? existing?.description ?? '').trim(),
      routingKeywords:
        input.routingKeywords ?? existing?.routingKeywords ?? [],
      supportedLanguages:
        input.supportedLanguages ?? existing?.supportedLanguages ?? ['en-US', 'fil-PH'],
      priority: input.priority ?? existing?.priority ?? 100,
      defaultSlaMinutes: Math.max(5, input.defaultSlaMinutes ?? existing?.defaultSlaMinutes ?? 30),
      enabled: input.enabled ?? existing?.enabled ?? true,
    };
    this.departments.set(slug, record);
    return { ...record };
  }

  public routeDepartmentForMessage(text: string, fallbackSlug = 'enterprise_solutions'): FrontDeskDepartment {
    const lowered = (text || '').toLowerCase();
    const active = this.listDepartments(false);
    let best: FrontDeskDepartment | null = null;
    let bestScore = 0;
    for (const dept of active) {
      let score = 0;
      for (const kw of dept.routingKeywords) {
        if (lowered.includes(kw.toLowerCase())) {
          score += kw.length > 5 ? 3 : 2;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = dept;
      }
    }
    return (
      best ||
      this.departments.get(fallbackSlug) ||
      active[0] ||
      DEFAULT_DEPARTMENTS[0]
    );
  }

  // -------------------------------------------------------------------------
  // 3. Human-Agent Presence, Atomic Claiming, Acceptance, Release & Expiry
  // -------------------------------------------------------------------------
  public listAgents(): FrontDeskHumanAgent[] {
    this.expireStaleAssignments();
    return Array.from(this.agents.values()).map((a) => ({ ...a }));
  }

  public upsertAgent(input: {
    id?: string;
    departmentSlug: string;
    displayName: string;
    agentCode?: string;
    adminUserEmail?: string;
    availabilityState?: AgentAvailabilityState;
    preferredLanguage?: string;
    supportedLanguages?: string[];
    secondaryDepartmentSlugs?: string[];
    maxConcurrentSessions?: number;
  }): FrontDeskHumanAgent {
    const dept = this.departments.get(input.departmentSlug) || DEFAULT_DEPARTMENTS[0];
    const existing = input.id ? this.agents.get(input.id) : undefined;
    const now = new Date().toISOString();
    const id = existing?.id || input.id || crypto.randomUUID();
    const record: FrontDeskHumanAgent = {
      id,
      departmentId: dept.id,
      departmentSlug: dept.slug,
      agentCode: (input.agentCode || existing?.agentCode || `AGT-${id.slice(0, 6).toUpperCase()}`).trim(),
      displayName: input.displayName.trim(),
      adminUserEmail: input.adminUserEmail?.trim().toLowerCase() || existing?.adminUserEmail,
      availabilityState: input.availabilityState ?? existing?.availabilityState ?? 'offline',
      preferredLanguage: input.preferredLanguage || existing?.preferredLanguage || 'en-US',
      supportedLanguages: input.supportedLanguages || existing?.supportedLanguages || ['en-US', 'fil-PH'],
      secondaryDepartmentSlugs: input.secondaryDepartmentSlugs || existing?.secondaryDepartmentSlugs || [],
      maxConcurrentSessions: Math.max(1, input.maxConcurrentSessions ?? existing?.maxConcurrentSessions ?? 1),
      activeSessionCount: existing?.activeSessionCount ?? 0,
      currentSessionKey: existing?.currentSessionKey ?? null,
      lastAssignedAt: existing?.lastAssignedAt ?? null,
      lastHeartbeatAt: now,
      stateChangedAt: now,
    };
    this.agents.set(id, record);
    return { ...record };
  }

  public updateAgentAvailability(agentId: string, state: AgentAvailabilityState): FrontDeskHumanAgent | null {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    agent.availabilityState = state;
    agent.stateChangedAt = new Date().toISOString();
    agent.lastHeartbeatAt = agent.stateChangedAt;
    if (state === 'offline') {
      agent.currentSessionKey = null;
    }
    return { ...agent };
  }

  public hasAvailableAgentForDepartment(departmentSlug: string): boolean {
    this.expireStaleAssignments();
    for (const agent of this.agents.values()) {
      if (
        agent.availabilityState === 'available' &&
        agent.activeSessionCount < agent.maxConcurrentSessions &&
        (agent.departmentSlug === departmentSlug || agent.secondaryDepartmentSlugs.includes(departmentSlug))
      ) {
        return true;
      }
    }
    return false;
  }

  public expireStaleAssignments(nowMs = Date.now()): number {
    let expiredCount = 0;
    for (const assignment of this.assignments.values()) {
      if (assignment.state === 'offered' && new Date(assignment.expiresAt).getTime() <= nowMs) {
        assignment.state = 'expired';
        assignment.releasedAt = new Date(nowMs).toISOString();
        expiredCount += 1;

        const agent = this.agents.get(assignment.agentId);
        if (agent) {
          agent.activeSessionCount = Math.max(0, agent.activeSessionCount - 1);
          if (agent.availabilityState === 'busy' && agent.activeSessionCount < agent.maxConcurrentSessions) {
            agent.availabilityState = 'available';
          }
          if (agent.activeSessionCount === 0) {
            agent.currentSessionKey = null;
          }
          agent.stateChangedAt = new Date(nowMs).toISOString();
        }
      }
    }
    return expiredCount;
  }

  /**
   * Atomically claims the longest-idle eligible human agent matching department & language.
   * Prevents concurrent double-assignment for the same agent or same session.
   */
  public claimHumanAgentAtomic(params: {
    sessionKey: string;
    departmentSlug: string;
    preferredLanguage?: string;
    expirySeconds?: number;
    idempotencyKey?: string;
    nowMs?: number;
  }): { claimed: true; assignment: FrontDeskAgentAssignment } | { claimed: false; reason: string } {
    const nowMs = params.nowMs ?? Date.now();
    this.expireStaleAssignments(nowMs);

    if (params.idempotencyKey) {
      const existingId = this.assignmentIdempotency.get(params.idempotencyKey);
      if (existingId) {
        const existing = this.assignments.get(existingId);
        if (existing) {
          return { claimed: true, assignment: { ...existing } };
        }
      }
    }

    for (const existing of this.assignments.values()) {
      if (existing.sessionKey === params.sessionKey && (existing.state === 'offered' || existing.state === 'accepted')) {
        return { claimed: true, assignment: { ...existing } };
      }
    }

    const busyAgentIds = new Set<string>();
    for (const a of this.assignments.values()) {
      if (a.state === 'offered' || a.state === 'accepted') {
        busyAgentIds.add(a.agentId);
      }
    }

    const prefLang = (params.preferredLanguage || 'en-US').toLowerCase();
    const candidates = Array.from(this.agents.values())
      .filter((agent) => {
        if (agent.availabilityState !== 'available') return false;
        if (agent.activeSessionCount >= agent.maxConcurrentSessions) return false;
        if (busyAgentIds.has(agent.id) && agent.maxConcurrentSessions <= 1) return false;
        return (
          agent.departmentSlug === params.departmentSlug ||
          agent.secondaryDepartmentSlugs.includes(params.departmentSlug)
        );
      })
      .sort((a, b) => {
        const aPrimary = a.departmentSlug === params.departmentSlug ? 0 : 1;
        const bPrimary = b.departmentSlug === params.departmentSlug ? 0 : 1;
        if (aPrimary !== bPrimary) return aPrimary - bPrimary;

        const langRank = (ag: FrontDeskHumanAgent) =>
          ag.preferredLanguage.toLowerCase() === prefLang
            ? 0
            : ag.supportedLanguages.some((l) => l.toLowerCase() === prefLang)
            ? 1
            : 2;
        const langDiff = langRank(a) - langRank(b);
        if (langDiff !== 0) return langDiff;

        const aLast = a.lastAssignedAt ? new Date(a.lastAssignedAt).getTime() : 0;
        const bLast = b.lastAssignedAt ? new Date(b.lastAssignedAt).getTime() : 0;
        return aLast - bLast;
      });

    const chosen = candidates[0];
    if (!chosen) {
      return {
        claimed: false,
        reason: 'No human specialist is currently available for this department. Callback scheduling is available.',
      };
    }

    const expirySec = Math.max(15, Math.min(600, params.expirySeconds ?? 90));
    const nowIso = new Date(nowMs).toISOString();
    const assignment: FrontDeskAgentAssignment = {
      id: crypto.randomUUID(),
      agentId: chosen.id,
      agentDisplayName: chosen.displayName,
      sessionKey: params.sessionKey,
      departmentSlug: params.departmentSlug,
      state: 'offered',
      idempotencyKey: params.idempotencyKey,
      expiresAt: new Date(nowMs + expirySec * 1000).toISOString(),
      createdAt: nowIso,
    };

    this.assignments.set(assignment.id, assignment);
    if (params.idempotencyKey) {
      this.assignmentIdempotency.set(params.idempotencyKey, assignment.id);
    }

    chosen.activeSessionCount += 1;
    if (chosen.activeSessionCount >= chosen.maxConcurrentSessions) {
      chosen.availabilityState = 'busy';
    }
    chosen.currentSessionKey = params.sessionKey;
    chosen.lastAssignedAt = nowIso;
    chosen.stateChangedAt = nowIso;

    return { claimed: true, assignment: { ...assignment } };
  }

  public acceptAssignment(assignmentId: string): FrontDeskAgentAssignment | null {
    this.expireStaleAssignments();
    const assignment = this.assignments.get(assignmentId);
    if (!assignment || assignment.state !== 'offered') return null;
    assignment.state = 'accepted';
    assignment.acceptedAt = new Date().toISOString();
    return { ...assignment };
  }

  public releaseAssignment(assignmentId: string, notes?: string): FrontDeskAgentAssignment | null {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment || (assignment.state !== 'offered' && assignment.state !== 'accepted')) {
      return null;
    }
    assignment.state = 'released';
    assignment.releasedAt = new Date().toISOString();
    if (notes) assignment.notes = notes;

    const agent = this.agents.get(assignment.agentId);
    if (agent) {
      agent.activeSessionCount = Math.max(0, agent.activeSessionCount - 1);
      if (agent.availabilityState === 'busy' && agent.activeSessionCount < agent.maxConcurrentSessions) {
        agent.availabilityState = 'available';
      }
      if (agent.activeSessionCount === 0) {
        agent.currentSessionKey = null;
      }
      agent.stateChangedAt = assignment.releasedAt;
    }
    return { ...assignment };
  }

  public listAssignments(): FrontDeskAgentAssignment[] {
    this.expireStaleAssignments();
    return Array.from(this.assignments.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((a) => ({ ...a }));
  }

  public getActiveAssignmentForSession(sessionKey: string): FrontDeskAgentAssignment | null {
    this.expireStaleAssignments();
    for (const a of this.assignments.values()) {
      if (a.sessionKey === sessionKey && (a.state === 'offered' || a.state === 'accepted')) {
        return { ...a };
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // 4. Business Hours & Holiday Management
  // -------------------------------------------------------------------------
  public listScheduleRules(): ScheduleRule[] {
    return Array.from(this.scheduleRules.values()).map((r) => ({ ...r }));
  }

  public upsertScheduleRule(input: Omit<ScheduleRule, 'id'> & { id?: string }): ScheduleRule {
    const id =
      input.id ||
      (input.recordType === 'holiday'
        ? `hol-${input.holidayDate}`
        : `bh-${input.timezone}-${input.dayOfWeek}`);
    for (const [existingId, existing] of this.scheduleRules.entries()) {
      if (existingId === id) continue;
      if (
        input.recordType === 'business_hours' &&
        existing.recordType === 'business_hours' &&
        existing.timezone === input.timezone &&
        existing.dayOfWeek === input.dayOfWeek
      ) {
        this.scheduleRules.delete(existingId);
      } else if (
        input.recordType === 'holiday' &&
        existing.recordType === 'holiday' &&
        existing.holidayDate === input.holidayDate
      ) {
        this.scheduleRules.delete(existingId);
      }
    }
    const rule: ScheduleRule = { ...input, id };
    this.scheduleRules.set(id, rule);
    return { ...rule };
  }

  public deleteScheduleRule(id: string): boolean {
    return this.scheduleRules.delete(id);
  }

  public evaluateBusinessHours(atDate = new Date(), timezone = 'Asia/Manila'): BusinessHoursEvaluation {
    const rules = this.listScheduleRules().filter((r) => r.isActive);
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(atDate).map((p) => [p.type, p.value]));
    const localDate = `${parts.year}-${parts.month}-${parts.day}`;
    const localTime = `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
    const weekdayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const dayOfWeek = weekdayMap[parts.weekday] ?? atDate.getUTCDay();

    const holiday = rules.find((r) => r.recordType === 'holiday' && r.holidayDate === localDate);
    if (holiday) {
      return {
        isOpen: false,
        reason: 'holiday',
        timezone,
        holidayName: holiday.holidayName,
        localDate,
        localTime,
      };
    }

    const dayRule = rules.find(
      (r) => r.recordType === 'business_hours' && r.dayOfWeek === dayOfWeek && r.openTime && r.closeTime
    );
    if (!dayRule || !dayRule.openTime || !dayRule.closeTime) {
      return { isOpen: false, reason: 'outside_hours', timezone, localDate, localTime };
    }

    const isOpen = localTime >= dayRule.openTime && localTime < dayRule.closeTime;
    return {
      isOpen,
      reason: isOpen ? 'open' : 'outside_hours',
      timezone,
      localDate,
      localTime,
    };
  }

  // -------------------------------------------------------------------------
  // 5. Idempotent Callback Requests
  // -------------------------------------------------------------------------
  public createCallbackRequest(input: {
    sessionKey: string;
    idempotencyKey: string;
    departmentSlug?: string;
    visitorName: string;
    visitorEmail?: string;
    visitorPhone?: string;
    preferredWindow?: string;
    timezone?: string;
    reason: string;
  }): { record: FrontDeskCallbackRequest; deduplicated: boolean } {
    const idemLookup = `${input.sessionKey}::${input.idempotencyKey}`;
    const existingId = this.callbackIdempotency.get(idemLookup);
    if (existingId) {
      const existing = this.callbacks.get(existingId);
      if (existing) {
        return { record: { ...existing }, deduplicated: true };
      }
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const record: FrontDeskCallbackRequest = {
      id,
      referenceCode: `DTI-CB-${id.slice(0, 8).toUpperCase()}`,
      sessionKey: input.sessionKey,
      idempotencyKey: input.idempotencyKey,
      departmentSlug: input.departmentSlug || 'client_support',
      visitorName: input.visitorName.trim(),
      visitorEmail: input.visitorEmail?.trim().toLowerCase() || undefined,
      visitorPhone: input.visitorPhone?.trim() || undefined,
      preferredWindow: input.preferredWindow?.trim() || undefined,
      timezone: input.timezone?.trim() || 'Asia/Manila',
      reason: input.reason.trim(),
      state: 'requested',
      requestedAt: now,
      updatedAt: now,
    };

    this.callbacks.set(id, record);
    this.callbackIdempotency.set(idemLookup, id);
    return { record: { ...record }, deduplicated: false };
  }

  public listCallbackRequests(): FrontDeskCallbackRequest[] {
    return Array.from(this.callbacks.values())
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
      .map((c) => ({ ...c }));
  }

  public updateCallbackRequest(
    callbackId: string,
    patch: { state?: CallbackState; assignedAgentId?: string }
  ): FrontDeskCallbackRequest | null {
    const existing = this.callbacks.get(callbackId);
    if (!existing) return null;
    if (patch.state) existing.state = patch.state;
    if (patch.assignedAgentId !== undefined) existing.assignedAgentId = patch.assignedAgentId;
    existing.updatedAt = new Date().toISOString();
    return { ...existing };
  }

  // -------------------------------------------------------------------------
  // 6. Privacy & Voice Processing Consent Records
  // -------------------------------------------------------------------------
  public recordConsent(input: {
    sessionKey: string;
    ownerEmail?: string;
    consentType: ConsentType;
    granted: boolean;
    policyVersion?: string;
    ipHash?: string;
  }): ConsentRecord {
    const record: ConsentRecord = {
      id: crypto.randomUUID(),
      sessionKey: input.sessionKey,
      ownerEmail: input.ownerEmail?.trim().toLowerCase() || undefined,
      consentType: input.consentType,
      granted: input.granted,
      policyVersion: input.policyVersion || '2026.11-dti-privacy-v1',
      ipHash: input.ipHash,
      recordedAt: new Date().toISOString(),
    };
    const existing = this.consentsBySession.get(input.sessionKey) || [];
    existing.push(record);
    this.consentsBySession.set(input.sessionKey, existing);
    this.updateSessionMeta(input.sessionKey, { consentRecorded: input.granted });
    return { ...record };
  }

  public listConsentsForSession(sessionKey: string): ConsentRecord[] {
    return (this.consentsBySession.get(sessionKey) || []).map((c) => ({ ...c }));
  }
}
