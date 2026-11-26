import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  AiQualityEvaluationRecord,
  FrontDeskPendingSubmission,
  HumanEscalationRecord,
  SubmittedFrontDeskInquiry,
} from './frontDeskStore';
import type { FrontDeskSessionDossier } from './frontDeskEngine';
import type { ManagedKnowledgeDocument } from './frontDeskKnowledgeStore';

export class FrontDeskPersistenceUnavailableError extends Error {
  public readonly statusCode = 503;
  public readonly code = 'DATABASE_UNAVAILABLE';

  constructor(message = 'Durable database persistence is unavailable for AI Front Desk operations.') {
    super(message);
    this.name = 'FrontDeskPersistenceUnavailableError';
  }
}

export interface FrontDeskPersistenceStatus {
  mode: 'supabase' | 'memory' | 'unconfigured';
  durable: boolean;
  configured: boolean;
}

export interface FrontDeskPersistenceAdapter {
  readonly mode: 'supabase' | 'memory' | 'unconfigured';
  readonly isDurable: boolean;

  saveSession(dossier: FrontDeskSessionDossier): Promise<void>;
  loadSession(sessionKey: string): Promise<FrontDeskSessionDossier | null>;
  deleteSession?(sessionKey: string): Promise<boolean>;

  savePendingSubmission(pending: FrontDeskPendingSubmission): Promise<void>;
  consumePendingSubmission(
    sessionId: string,
    confirmationToken: string
  ): Promise<{ ok: true; pending: FrontDeskPendingSubmission } | { ok: false; error: string }>;

  saveInquiry(inquiry: SubmittedFrontDeskInquiry, idempotencyKey?: string): Promise<void>;
  loadInquiryByReference(referenceCode: string): Promise<SubmittedFrontDeskInquiry | null>;
  findInquiryByIdempotencyKey(idempotencyKey: string): Promise<SubmittedFrontDeskInquiry | null>;
  listInquiries(): Promise<SubmittedFrontDeskInquiry[]>;
  listInquiriesByOwnerEmail(ownerEmail: string): Promise<SubmittedFrontDeskInquiry[]>;

  saveEscalation(record: HumanEscalationRecord): Promise<void>;
  listEscalations(): Promise<HumanEscalationRecord[]>;

  saveQualityEvaluation(record: AiQualityEvaluationRecord): Promise<void>;
  listQualityEvaluations(limit?: number): Promise<AiQualityEvaluationRecord[]>;

  saveKnowledgeDocument(doc: ManagedKnowledgeDocument): Promise<void>;
  listKnowledgeDocuments(): Promise<ManagedKnowledgeDocument[]>;
}

/**
 * Shared in-memory snapshot backing store for isolated tests and restart-survival verification.
 */
export interface SharedFrontDeskBackingState {
  sessions: Map<string, FrontDeskSessionDossier>;
  pendingSubmissions: Map<string, FrontDeskPendingSubmission>;
  inquiries: Map<string, SubmittedFrontDeskInquiry>;
  idempotencyIndex: Map<string, string>;
  escalations: Map<string, HumanEscalationRecord>;
  qualityEvaluations: AiQualityEvaluationRecord[];
  knowledgeDocs: Map<string, ManagedKnowledgeDocument>;
}

export function createSharedFrontDeskBackingState(): SharedFrontDeskBackingState {
  return {
    sessions: new Map(),
    pendingSubmissions: new Map(),
    inquiries: new Map(),
    idempotencyIndex: new Map(),
    escalations: new Map(),
    qualityEvaluations: [],
    knowledgeDocs: new Map(),
  };
}

/**
 * Durable-capable adapter backed by an injectable shared state object (used in staging/restart tests
 * to verify zero data loss when FrontDeskStore/FrontDeskKnowledgeStore instances are recreated).
 */
export class SnapshotFrontDeskPersistenceAdapter implements FrontDeskPersistenceAdapter {
  public readonly mode = 'memory' as const;
  public readonly isDurable: boolean;

  constructor(
    private readonly backing: SharedFrontDeskBackingState = createSharedFrontDeskBackingState(),
    options?: { simulateDurable?: boolean }
  ) {
    this.isDurable = options?.simulateDurable ?? true;
  }

  async saveSession(dossier: FrontDeskSessionDossier): Promise<void> {
    this.backing.sessions.set(dossier.sessionId, structuredClone(dossier));
  }

  async loadSession(sessionKey: string): Promise<FrontDeskSessionDossier | null> {
    const found = this.backing.sessions.get(sessionKey);
    return found ? structuredClone(found) : null;
  }

  async deleteSession(sessionKey: string): Promise<boolean> {
    const existed = this.backing.sessions.delete(sessionKey);
    for (const [token, pending] of this.backing.pendingSubmissions.entries()) {
      if (pending.sessionId === sessionKey) {
        this.backing.pendingSubmissions.delete(token);
      }
    }
    return existed;
  }

  async savePendingSubmission(pending: FrontDeskPendingSubmission): Promise<void> {
    this.backing.pendingSubmissions.set(pending.confirmationToken, { ...pending });
  }

  async consumePendingSubmission(
    sessionId: string,
    confirmationToken: string
  ): Promise<{ ok: true; pending: FrontDeskPendingSubmission } | { ok: false; error: string }> {
    const now = Date.now();
    for (const [k, v] of this.backing.pendingSubmissions.entries()) {
      if (now > v.expiresAt) this.backing.pendingSubmissions.delete(k);
    }
    const pending = this.backing.pendingSubmissions.get(confirmationToken);
    if (!pending) {
      return {
        ok: false,
        error: 'Invalid or expired confirmation token. Please review and prepare submission again.',
      };
    }
    if (pending.sessionId !== sessionId) {
      return { ok: false, error: 'Confirmation token does not belong to the active session.' };
    }
    this.backing.pendingSubmissions.delete(confirmationToken);
    return { ok: true, pending: { ...pending } };
  }

  async saveInquiry(inquiry: SubmittedFrontDeskInquiry, idempotencyKey?: string): Promise<void> {
    this.backing.inquiries.set(inquiry.referenceCode, structuredClone(inquiry));
    if (idempotencyKey) {
      this.backing.idempotencyIndex.set(idempotencyKey, inquiry.referenceCode);
    }
  }

  async loadInquiryByReference(referenceCode: string): Promise<SubmittedFrontDeskInquiry | null> {
    const found = this.backing.inquiries.get(referenceCode);
    return found ? structuredClone(found) : null;
  }

  async findInquiryByIdempotencyKey(idempotencyKey: string): Promise<SubmittedFrontDeskInquiry | null> {
    const ref = this.backing.idempotencyIndex.get(idempotencyKey);
    if (!ref) return null;
    return this.loadInquiryByReference(ref);
  }

  async listInquiries(): Promise<SubmittedFrontDeskInquiry[]> {
    return Array.from(this.backing.inquiries.values()).map((r) => structuredClone(r));
  }

  async listInquiriesByOwnerEmail(ownerEmail: string): Promise<SubmittedFrontDeskInquiry[]> {
    const normalized = ownerEmail.trim().toLowerCase();
    return Array.from(this.backing.inquiries.values())
      .filter((r) => r.ownerEmail === normalized)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((r) => structuredClone(r));
  }

  async saveEscalation(record: HumanEscalationRecord): Promise<void> {
    this.backing.escalations.set(record.id, structuredClone(record));
  }

  async listEscalations(): Promise<HumanEscalationRecord[]> {
    return Array.from(this.backing.escalations.values())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((r) => structuredClone(r));
  }

  async saveQualityEvaluation(record: AiQualityEvaluationRecord): Promise<void> {
    this.backing.qualityEvaluations = [
      structuredClone(record),
      ...this.backing.qualityEvaluations.filter((e) => e.id !== record.id),
    ].slice(0, 250);
  }

  async listQualityEvaluations(limit = 50): Promise<AiQualityEvaluationRecord[]> {
    return this.backing.qualityEvaluations.slice(0, limit).map((r) => structuredClone(r));
  }

  async saveKnowledgeDocument(doc: ManagedKnowledgeDocument): Promise<void> {
    this.backing.knowledgeDocs.set(doc.id, structuredClone(doc));
  }

  async listKnowledgeDocuments(): Promise<ManagedKnowledgeDocument[]> {
    return Array.from(this.backing.knowledgeDocs.values()).map((d) => structuredClone(d));
  }

  /**
   * Exports a versioned backup snapshot with SHA-256 integrity checksum and, when
   * `signingKey` (or `process.env.BACKUP_SIGNING_SECRET`) is provided, an
   * authenticated HMAC-SHA256 signature. Explicitly distinguishes checksum-only
   * exports from HMAC-authenticated exports (never mislabels an unkeyed hash as signed).
   */
  public exportSignedBackupSnapshot(signingKey?: string): {
    schemaVersion: string;
    exportedAt: string;
    integrityMode: 'hmac-sha256' | 'sha256-checksum-only';
    checksumSha256: string;
    hmacSha256Signature: string | null;
    payloadJson: string;
    counts: {
      sessions: number;
      pendingSubmissions: number;
      inquiries: number;
      escalations: number;
      qualityEvaluations: number;
      knowledgeDocs: number;
    };
  } {
    const payload = {
      sessions: Array.from(this.backing.sessions.entries()),
      pendingSubmissions: Array.from(this.backing.pendingSubmissions.entries()),
      inquiries: Array.from(this.backing.inquiries.entries()),
      idempotencyIndex: Array.from(this.backing.idempotencyIndex.entries()),
      escalations: Array.from(this.backing.escalations.entries()),
      qualityEvaluations: this.backing.qualityEvaluations,
      knowledgeDocs: Array.from(this.backing.knowledgeDocs.entries()),
    };
    const payloadJson = JSON.stringify(payload);
    const checksumSha256 = crypto.createHash('sha256').update(payloadJson, 'utf8').digest('hex');
    const resolvedKey = (signingKey ?? process.env.BACKUP_SIGNING_SECRET ?? '').trim();
    const hmacSha256Signature = resolvedKey
      ? crypto.createHmac('sha256', resolvedKey).update(payloadJson, 'utf8').digest('hex')
      : null;

    return {
      schemaVersion: '009',
      exportedAt: new Date().toISOString(),
      integrityMode: hmacSha256Signature ? 'hmac-sha256' : 'sha256-checksum-only',
      checksumSha256,
      hmacSha256Signature,
      payloadJson,
      counts: {
        sessions: payload.sessions.length,
        pendingSubmissions: payload.pendingSubmissions.length,
        inquiries: payload.inquiries.length,
        escalations: payload.escalations.length,
        qualityEvaluations: payload.qualityEvaluations.length,
        knowledgeDocs: payload.knowledgeDocs.length,
      },
    };
  }

  /**
   * Verifies SHA-256 backup checksum (and HMAC-SHA256 authenticated signature
   * whenever `signingKey` / `BACKUP_SIGNING_SECRET` is configured or the snapshot
   * declares `hmac-sha256` integrity) and restores all persisted entities atomically.
   * Rejects tampered, mismatched-key, or downgraded snapshots without mutating state.
   */
  public restoreSignedBackupSnapshot(
    snapshot: {
      checksumSha256: string;
      payloadJson: string;
      integrityMode?: 'hmac-sha256' | 'sha256-checksum-only';
      hmacSha256Signature?: string | null;
    },
    signingKey?: string
  ): { ok: true; integrityMode: 'hmac-sha256' | 'sha256-checksum-only'; restoredCounts: Record<string, number> } | { ok: false; error: string } {
    const computedChecksum = crypto.createHash('sha256').update(snapshot.payloadJson, 'utf8').digest('hex');
    const a = Buffer.from(computedChecksum, 'utf8');
    const b = Buffer.from(String(snapshot.checksumSha256 || ''), 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, error: 'Backup snapshot integrity checksum mismatch; restore aborted.' };
    }

    const resolvedKey = (signingKey ?? process.env.BACKUP_SIGNING_SECRET ?? '').trim();
    const requiresHmac = Boolean(resolvedKey) || snapshot.integrityMode === 'hmac-sha256';
    if (requiresHmac) {
      if (!resolvedKey) {
        return {
          ok: false,
          error: 'Backup snapshot requires HMAC-SHA256 verification key; restore aborted.',
        };
      }
      const providedSig = String(snapshot.hmacSha256Signature || '');
      if (!providedSig) {
        return {
          ok: false,
          error: 'Unsigned backup snapshot rejected because HMAC-SHA256 authentication is required.',
        };
      }
      const expectedSig = crypto
        .createHmac('sha256', resolvedKey)
        .update(snapshot.payloadJson, 'utf8')
        .digest('hex');
      const sigA = Buffer.from(expectedSig, 'utf8');
      const sigB = Buffer.from(providedSig, 'utf8');
      if (sigA.length !== sigB.length || !crypto.timingSafeEqual(sigA, sigB)) {
        return {
          ok: false,
          error: 'Backup snapshot HMAC-SHA256 signature verification failed; restore aborted.',
        };
      }
    }

    try {
      const parsed = JSON.parse(snapshot.payloadJson);
      this.backing.sessions = new Map(parsed.sessions || []);
      this.backing.pendingSubmissions = new Map(parsed.pendingSubmissions || []);
      this.backing.inquiries = new Map(parsed.inquiries || []);
      this.backing.idempotencyIndex = new Map(parsed.idempotencyIndex || []);
      this.backing.escalations = new Map(parsed.escalations || []);
      this.backing.qualityEvaluations = Array.isArray(parsed.qualityEvaluations)
        ? parsed.qualityEvaluations
        : [];
      this.backing.knowledgeDocs = new Map(parsed.knowledgeDocs || []);
      return {
        ok: true,
        integrityMode: requiresHmac ? 'hmac-sha256' : 'sha256-checksum-only',
        restoredCounts: {
          sessions: this.backing.sessions.size,
          pendingSubmissions: this.backing.pendingSubmissions.size,
          inquiries: this.backing.inquiries.size,
          escalations: this.backing.escalations.size,
          qualityEvaluations: this.backing.qualityEvaluations.length,
          knowledgeDocs: this.backing.knowledgeDocs.size,
        },
      };
    } catch {
      return { ok: false, error: 'Backup snapshot JSON payload is malformed; restore aborted.' };
    }
  }
}

function mapInquiryRow(row: any): SubmittedFrontDeskInquiry {
  return {
    id: String(row.id),
    referenceCode: String(row.reference_code),
    sessionId: String(row.session_key || row.session_id || ''),
    ownerEmail: String(row.owner_email || '').trim().toLowerCase(),
    companyName: String(row.company_name || 'Prospective Client'),
    projectName: String(row.project_name || 'Customized Enterprise Project'),
    clientName: String(row.client_name || row.client_profile_json?.fullName || 'Prospective Client'),
    clientPhone: row.client_phone || row.client_profile_json?.phone || undefined,
    industry: row.industry || row.client_profile_json?.industry || undefined,
    leadStatus: row.lead_status,
    executiveReviewStage: row.executive_review_stage,
    completenessScore: Number(row.completeness_score || 0),
    dossierVersion: Number(row.current_version || 1),
    clientProfile: (row.client_profile_json && typeof row.client_profile_json === 'object'
      ? row.client_profile_json
      : {}) as SubmittedFrontDeskInquiry['clientProfile'],
    businessDiscovery: (row.business_discovery_json && typeof row.business_discovery_json === 'object'
      ? row.business_discovery_json
      : {}) as SubmittedFrontDeskInquiry['businessDiscovery'],
    projectRequirements: (row.project_requirements_json && typeof row.project_requirements_json === 'object'
      ? row.project_requirements_json
      : {
          intendedUsers: [],
          functionalRequirements: [],
          nonfunctionalRequirements: [],
          integrations: [],
          clientConcerns: [],
        }) as SubmittedFrontDeskInquiry['projectRequirements'],
    recommendation: row.recommendation_json || null,
    summary: row.summary_json || null,
    masterplan: row.masterplan_json,
    consultationReferenceCode: row.consultation_appointment_ref || row.consultation_reference_code || undefined,
    consultationStatus: (row.consultation_status || 'none') as SubmittedFrontDeskInquiry['consultationStatus'],
    consultationDate: row.consultation_date || undefined,
    consultationSlot: row.consultation_slot || undefined,
    consultationTimezone: row.consultation_timezone || undefined,
    emailDeliveryState: String(row.email_delivery_state || 'queued'),
    commercialApprovedBy: row.commercial_approved_by || undefined,
    commercialApprovedAt: row.commercial_approved_at || undefined,
    reviewHistory: Array.isArray(row.review_history_json) ? row.review_history_json : [],
    clientCorrectionHistory: Array.isArray(row.client_correction_history_json)
      ? row.client_correction_history_json
      : [],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapEscalationRow(row: any): HumanEscalationRecord {
  return {
    id: String(row.id),
    referenceCode: String(row.reference_code),
    sessionId: String(row.session_key || ''),
    clientName: String(row.client_name || 'Prospective Client'),
    clientEmail: row.client_email || undefined,
    clientPhone: row.client_phone || undefined,
    companyName: row.company_name || undefined,
    reason: String(row.reason || ''),
    requestedTrack: row.requested_track || 'general',
    preferredContactMethod: row.preferred_contact_method || 'email',
    status: row.status || 'open',
    assignedTo: row.assigned_to || undefined,
    resolutionNotes: row.resolution_notes || undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapQualityRow(row: any): AiQualityEvaluationRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_key || ''),
    channel: row.channel || 'ai_frontdesk_chat',
    rating: Number(row.rating || 5) as 1 | 2 | 3 | 4 | 5,
    naturalnessScore: Number(row.naturalness_score || 5) as 1 | 2 | 3 | 4 | 5,
    accuracyScore: Number(row.accuracy_score || 5) as 1 | 2 | 3 | 4 | 5,
    policyCompliancePassed: Boolean(row.policy_compliance_passed ?? true),
    evaluatorEmail: String(row.evaluator_email || 'admin'),
    notes: String(row.notes || ''),
    createdAt: String(row.created_at),
  };
}

function mapKnowledgeDocRow(row: any): ManagedKnowledgeDocument {
  return {
    id: String(row.id || row.doc_key),
    domain: row.domain,
    knowledgeType: row.knowledge_type || 'general_technical_knowledge',
    title: String(row.title),
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    summary: String(row.summary || ''),
    facts: Array.isArray(row.facts) ? row.facts : [],
    canonicalLinks: Array.isArray(row.canonical_links) ? row.canonical_links : [],
    complianceNotice: row.compliance_notice || undefined,
    sourceReference: String(row.source_reference || ''),
    status: (row.status === 'approved' || row.status === 'deactivated' ? row.status : 'draft'),
    visibility: row.visibility === 'internal_only' ? 'internal_only' : 'public',
    version: Number(row.version ?? row.current_version ?? 1),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    approvedBy: row.approved_by || undefined,
    approvedAt: row.approved_at || undefined,
    versions: Array.isArray(row.versions_json) ? row.versions_json : [],
  };
}

/**
 * Production Supabase PostgreSQL adapter for AI Front Desk & Managed Knowledge persistence.
 * Targets schema tables defined in migrations `007_ai_frontdesk_platform.sql` and
 * `008_ai_frontdesk_durability_hardening.sql`.
 */
export class SupabaseFrontDeskPersistenceAdapter implements FrontDeskPersistenceAdapter {
  public readonly mode = 'supabase' as const;
  private readonly client: SupabaseClient | null;

  constructor(
    supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  ) {
    const cleanUrl = supabaseUrl.trim();
    const cleanKey = serviceRoleKey.trim();
    if (cleanUrl && cleanKey) {
      this.client = createClient(cleanUrl, cleanKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    } else {
      this.client = null;
    }
  }

  public get isDurable(): boolean {
    return this.client !== null;
  }

  private getClient(): SupabaseClient {
    if (!this.client) {
      throw new FrontDeskPersistenceUnavailableError(
        'Supabase service_role credentials are not configured for AI Front Desk persistence.'
      );
    }
    return this.client;
  }

  async saveSession(dossier: FrontDeskSessionDossier): Promise<void> {
    const db = this.getClient();
    const now = dossier.updatedAt || new Date().toISOString();
    const { error } = await db.from('ai_conversation_sessions').upsert(
      {
        session_key: dossier.sessionId,
        channel: 'ai_frontdesk_chat',
        language: dossier.clientProfile?.preferredLanguage || 'en-US',
        discovery_active: Boolean(dossier.discoveryActive),
        lead_status: dossier.leadStatus,
        completeness_score: dossier.completeness.scorePercent,
        dossier_version: dossier.version,
        dossier_json: dossier,
        last_activity_at: now,
        updated_at: now,
      },
      { onConflict: 'session_key' }
    );
    if (error) {
      throw new FrontDeskPersistenceUnavailableError(`Failed to persist Front Desk session: ${error.message}`);
    }
  }

  async loadSession(sessionKey: string): Promise<FrontDeskSessionDossier | null> {
    const db = this.getClient();
    const { data, error } = await db
      .from('ai_conversation_sessions')
      .select('dossier_json')
      .eq('session_key', sessionKey)
      .maybeSingle();
    if (error) {
      throw new FrontDeskPersistenceUnavailableError(`Failed to load Front Desk session: ${error.message}`);
    }
    return data?.dossier_json ? (data.dossier_json as FrontDeskSessionDossier) : null;
  }

  async deleteSession(sessionKey: string): Promise<boolean> {
    const db = this.getClient();
    const { error: pendingErr } = await db
      .from('frontdesk_pending_submissions')
      .delete()
      .eq('session_key', sessionKey);
    if (pendingErr) {
      throw new FrontDeskPersistenceUnavailableError(
        `Failed to delete pending Front Desk confirmations: ${pendingErr.message}`
      );
    }
    const { data, error } = await db
      .from('ai_conversation_sessions')
      .delete()
      .eq('session_key', sessionKey)
      .select('session_key');
    if (error) {
      throw new FrontDeskPersistenceUnavailableError(`Failed to delete Front Desk session: ${error.message}`);
    }
    return Array.isArray(data) && data.length > 0;
  }

  async savePendingSubmission(pending: FrontDeskPendingSubmission): Promise<void> {
    const db = this.getClient();
    const { error } = await db.from('frontdesk_pending_submissions').upsert(
      {
        confirmation_token: pending.confirmationToken,
        session_key: pending.sessionId,
        dossier_snapshot_version: pending.dossierSnapshotVersion,
        prepared_at: pending.preparedAt,
        expires_at: new Date(pending.expiresAt).toISOString(),
        consumed_at: null,
      },
      { onConflict: 'confirmation_token' }
    );
    if (error) {
      throw new FrontDeskPersistenceUnavailableError(
        `Failed to persist pending confirmation token: ${error.message}`
      );
    }
  }

  async consumePendingSubmission(
    sessionId: string,
    confirmationToken: string
  ): Promise<{ ok: true; pending: FrontDeskPendingSubmission } | { ok: false; error: string }> {
    const db = this.getClient();
    const { data, error } = await db
      .from('frontdesk_pending_submissions')
      .select('*')
      .eq('confirmation_token', confirmationToken)
      .is('consumed_at', null)
      .maybeSingle();

    if (error) {
      throw new FrontDeskPersistenceUnavailableError(
        `Failed to validate pending confirmation token: ${error.message}`
      );
    }

    if (!data) {
      return {
        ok: false,
        error: 'Invalid or expired confirmation token. Please review and prepare submission again.',
      };
    }

    const expiresAtMs = new Date(data.expires_at).getTime();
    if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) {
      await db
        .from('frontdesk_pending_submissions')
        .delete()
        .eq('confirmation_token', confirmationToken);
      return {
        ok: false,
        error: 'Invalid or expired confirmation token. Please review and prepare submission again.',
      };
    }

    if (String(data.session_key) !== sessionId) {
      return { ok: false, error: 'Confirmation token does not belong to the active session.' };
    }

    // Atomic single-use claim using `.is('consumed_at', null)` guard
    const { data: claimed, error: updateErr } = await db
      .from('frontdesk_pending_submissions')
      .update({ consumed_at: new Date().toISOString() })
      .eq('confirmation_token', confirmationToken)
      .is('consumed_at', null)
      .select('*')
      .maybeSingle();

    if (updateErr) {
      throw new FrontDeskPersistenceUnavailableError(
        `Failed to consume pending confirmation token: ${updateErr.message}`
      );
    }
    if (!claimed) {
      return {
        ok: false,
        error: 'Confirmation token has already been used. Please review and prepare submission again.',
      };
    }

    return {
      ok: true,
      pending: {
        confirmationToken: String(claimed.confirmation_token),
        sessionId: String(claimed.session_key),
        dossierSnapshotVersion: Number(claimed.dossier_snapshot_version || 1),
        preparedAt: String(claimed.prepared_at),
        expiresAt: expiresAtMs,
      },
    };
  }

  async saveInquiry(inquiry: SubmittedFrontDeskInquiry, idempotencyKey?: string): Promise<void> {
    const db = this.getClient();
    const { error } = await db.from('frontdesk_project_inquiries').upsert(
      {
        id: inquiry.id,
        reference_code: inquiry.referenceCode,
        session_key: inquiry.sessionId,
        owner_email: inquiry.ownerEmail,
        company_name: inquiry.companyName,
        project_name: inquiry.projectName,
        client_name: inquiry.clientName,
        client_phone: inquiry.clientPhone || null,
        industry: inquiry.industry || null,
        lead_status: inquiry.leadStatus,
        executive_review_stage: inquiry.executiveReviewStage,
        completeness_score: inquiry.completenessScore,
        current_version: inquiry.dossierVersion,
        client_profile_json: inquiry.clientProfile,
        business_discovery_json: inquiry.businessDiscovery,
        project_requirements_json: inquiry.projectRequirements,
        recommendation_json: inquiry.recommendation,
        summary_json: inquiry.summary,
        masterplan_json: inquiry.masterplan,
        consultation_appointment_ref: inquiry.consultationReferenceCode || null,
        consultation_status: inquiry.consultationStatus || 'none',
        consultation_date: inquiry.consultationDate || null,
        consultation_slot: inquiry.consultationSlot || null,
        consultation_timezone: inquiry.consultationTimezone || null,
        email_delivery_state: inquiry.emailDeliveryState,
        commercial_approved_by: inquiry.commercialApprovedBy || null,
        commercial_approved_at: inquiry.commercialApprovedAt || null,
        review_history_json: inquiry.reviewHistory,
        client_correction_history_json: inquiry.clientCorrectionHistory,
        ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
        client_confirmed_at: inquiry.createdAt,
        created_at: inquiry.createdAt,
        updated_at: inquiry.updatedAt,
      },
      { onConflict: 'reference_code' }
    );
    if (error) {
      throw new FrontDeskPersistenceUnavailableError(`Failed to persist Front Desk inquiry: ${error.message}`);
    }
  }

  async loadInquiryByReference(referenceCode: string): Promise<SubmittedFrontDeskInquiry | null> {
    const db = this.getClient();
    const { data, error } = await db
      .from('frontdesk_project_inquiries')
      .select('*')
      .eq('reference_code', referenceCode)
      .maybeSingle();
    if (error) {
      throw new FrontDeskPersistenceUnavailableError(`Failed to query Front Desk inquiry: ${error.message}`);
    }
    return data ? mapInquiryRow(data) : null;
  }

  async findInquiryByIdempotencyKey(idempotencyKey: string): Promise<SubmittedFrontDeskInquiry | null> {
    const db = this.getClient();
    const { data, error } = await db
      .from('frontdesk_project_inquiries')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (error) {
      throw new FrontDeskPersistenceUnavailableError(
        `Failed to query inquiry by idempotency key: ${error.message}`
      );
    }
    return data ? mapInquiryRow(data) : null;
  }

  async listInquiries(): Promise<SubmittedFrontDeskInquiry[]> {
    const db = this.getClient();
    const { data, error } = await db
      .from('frontdesk_project_inquiries')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(500);
    if (error) {
      throw new FrontDeskPersistenceUnavailableError(`Failed to list Front Desk inquiries: ${error.message}`);
    }
    return (data || []).map(mapInquiryRow);
  }

  async listInquiriesByOwnerEmail(ownerEmail: string): Promise<SubmittedFrontDeskInquiry[]> {
    const db = this.getClient();
    const normalized = ownerEmail.trim().toLowerCase();
    const { data, error } = await db
      .from('frontdesk_project_inquiries')
      .select('*')
      .eq('owner_email', normalized)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) {
      throw new FrontDeskPersistenceUnavailableError(
        `Failed to list client Front Desk inquiries: ${error.message}`
      );
    }
    return (data || []).map(mapInquiryRow);
  }

  async saveEscalation(record: HumanEscalationRecord): Promise<void> {
    const db = this.getClient();
    const { error } = await db.from('frontdesk_human_escalations').upsert(
      {
        id: record.id,
        reference_code: record.referenceCode,
        session_key: record.sessionId,
        client_name: record.clientName,
        client_email: record.clientEmail || null,
        client_phone: record.clientPhone || null,
        company_name: record.companyName || null,
        reason: record.reason,
        requested_track: record.requestedTrack,
        preferred_contact_method: record.preferredContactMethod,
        status: record.status,
        assigned_to: record.assignedTo || null,
        resolution_notes: record.resolutionNotes || null,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
      { onConflict: 'reference_code' }
    );
    if (error) {
      throw new FrontDeskPersistenceUnavailableError(
        `Failed to persist human escalation record: ${error.message}`
      );
    }
  }

  async listEscalations(): Promise<HumanEscalationRecord[]> {
    const db = this.getClient();
    const { data, error } = await db
      .from('frontdesk_human_escalations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(250);
    if (error) {
      throw new FrontDeskPersistenceUnavailableError(`Failed to list human escalations: ${error.message}`);
    }
    return (data || []).map(mapEscalationRow);
  }

  async saveQualityEvaluation(record: AiQualityEvaluationRecord): Promise<void> {
    const db = this.getClient();
    const { error } = await db.from('ai_quality_evaluations').upsert(
      {
        id: record.id,
        session_key: record.sessionId,
        channel: record.channel,
        rating: record.rating,
        naturalness_score: record.naturalnessScore,
        accuracy_score: record.accuracyScore,
        policy_compliance_passed: record.policyCompliancePassed,
        evaluator_email: record.evaluatorEmail,
        notes: record.notes,
        created_at: record.createdAt,
      },
      { onConflict: 'id' }
    );
    if (error) {
      throw new FrontDeskPersistenceUnavailableError(
        `Failed to persist AI quality evaluation: ${error.message}`
      );
    }
  }

  async listQualityEvaluations(limit = 50): Promise<AiQualityEvaluationRecord[]> {
    const db = this.getClient();
    const { data, error } = await db
      .from('ai_quality_evaluations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(100, limit)));
    if (error) {
      throw new FrontDeskPersistenceUnavailableError(`Failed to list quality evaluations: ${error.message}`);
    }
    return (data || []).map(mapQualityRow);
  }

  async saveKnowledgeDocument(doc: ManagedKnowledgeDocument): Promise<void> {
    const db = this.getClient();
    const { error } = await db.from('ai_knowledge_documents').upsert(
      {
        id: doc.id,
        domain: doc.domain,
        knowledge_type: doc.knowledgeType,
        title: doc.title,
        summary: doc.summary,
        facts: doc.facts,
        keywords: doc.keywords,
        canonical_links: doc.canonicalLinks,
        compliance_notice: doc.complianceNotice || null,
        source_reference: doc.sourceReference,
        status: doc.status,
        visibility: doc.visibility,
        version: doc.version,
        approved_by: doc.approvedBy || null,
        approved_at: doc.approvedAt || null,
        versions_json: doc.versions,
        created_at: doc.createdAt,
        updated_at: doc.updatedAt,
      },
      { onConflict: 'id' }
    );
    if (error) {
      throw new FrontDeskPersistenceUnavailableError(`Failed to persist knowledge document: ${error.message}`);
    }
  }

  async listKnowledgeDocuments(): Promise<ManagedKnowledgeDocument[]> {
    const db = this.getClient();
    const { data, error } = await db
      .from('ai_knowledge_documents')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(500);
    if (error) {
      throw new FrontDeskPersistenceUnavailableError(`Failed to list knowledge documents: ${error.message}`);
    }
    return (data || []).map(mapKnowledgeDocRow);
  }
}
