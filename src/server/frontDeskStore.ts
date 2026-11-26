import crypto from 'crypto';
import {
  EXECUTIVE_REVIEW_STAGES,
  ExecutiveReviewStage,
  FrontDeskConversationSummary,
  FrontDeskSessionDossier,
  LeadQualificationStatus,
  PreliminaryProjectMasterplan,
  PreliminarySolutionRecommendation,
  applyClientDossierCorrections,
  createEmptyDossier,
  generatePreliminaryMasterplan,
  ingestUserTurnIntoDossier,
} from './frontDeskEngine';
import {
  FrontDeskPersistenceAdapter,
  FrontDeskPersistenceStatus,
  FrontDeskPersistenceUnavailableError,
} from './frontDeskRepository';

/**
 * M16 / M20 / M23 / M25 / M26: AI Front Desk Operational Persistence Store
 *
 * Manages:
 * - Active Front Desk sessions & single-use session-scoped submission confirmation tokens
 * - Submitted Project Inquiries with versioned requirements, masterplans & strict client ownership
 * - 16-Stage Executive Commercial Review workflow with human-only commercial approval & audit history
 * - Human Escalation handover requests
 * - AI Quality Evaluations & privacy-safe operational analytics
 *
 * Durability Guarantees:
 * - Supports write-through Supabase PostgreSQL persistence via `FrontDeskPersistenceAdapter`.
 * - In `productionStrictMode` (NODE_ENV === 'production'), refuses to silently persist production
 *   inquiries, escalations, reviews, or evaluations in volatile memory if no durable adapter is configured.
 */

export interface FrontDeskPendingSubmission {
  confirmationToken: string;
  sessionId: string;
  dossierSnapshotVersion: number;
  preparedAt: string;
  expiresAt: number;
}

export interface CommercialReviewAuditEntry {
  stage: ExecutiveReviewStage;
  leadStatus: LeadQualificationStatus;
  actorEmail: string;
  actorRole: string;
  notes: string;
  approvedCommercially?: boolean;
  recordedAt: string;
}

export interface SubmittedFrontDeskInquiry {
  id: string;
  referenceCode: string;
  sessionId: string;
  ownerEmail: string; // normalized lowercase for strict Client Portal ownership isolation
  companyName: string;
  projectName: string;
  clientName: string;
  clientPhone?: string;
  industry?: string;
  leadStatus: LeadQualificationStatus;
  executiveReviewStage: ExecutiveReviewStage;
  completenessScore: number;
  dossierVersion: number;
  clientProfile: FrontDeskSessionDossier['clientProfile'];
  businessDiscovery: FrontDeskSessionDossier['businessDiscovery'];
  projectRequirements: FrontDeskSessionDossier['projectRequirements'];
  recommendation: PreliminarySolutionRecommendation | null;
  summary: FrontDeskConversationSummary | null;
  masterplan: PreliminaryProjectMasterplan;
  consultationReferenceCode?: string;
  consultationStatus?: 'confirmed' | 'pending_review' | 'none';
  consultationDate?: string;
  consultationSlot?: string;
  consultationTimezone?: string;
  emailDeliveryState: string;
  commercialApprovedBy?: string;
  commercialApprovedAt?: string;
  reviewHistory: CommercialReviewAuditEntry[];
  clientCorrectionHistory: Array<{
    version: number;
    correctedByEmail: string;
    note: string;
    correctedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface HumanEscalationRecord {
  id: string;
  referenceCode: string;
  sessionId: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  companyName?: string;
  reason: string;
  requestedTrack: 'ceo' | 'cto' | 'pricing' | 'technical' | 'general';
  preferredContactMethod: 'telephone' | 'email' | 'scheduled_consultation';
  status: 'open' | 'in_progress' | 'resolved';
  assignedTo?: string;
  resolutionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiQualityEvaluationRecord {
  id: string;
  sessionId: string;
  channel: 'ai_frontdesk_chat' | 'ai_frontdesk_voice' | 'widget_chat' | 'widget_voice';
  rating: 1 | 2 | 3 | 4 | 5;
  naturalnessScore: 1 | 2 | 3 | 4 | 5;
  accuracyScore: 1 | 2 | 3 | 4 | 5;
  policyCompliancePassed: boolean;
  evaluatorEmail: string;
  notes: string;
  createdAt: string;
}

export interface FrontDeskStoreOptions {
  persistence?: FrontDeskPersistenceAdapter | null;
  productionStrictMode?: boolean;
}

const CONFIRMATION_TTL_MS = 20 * 60 * 1000;

export class FrontDeskStore {
  private readonly sessions = new Map<string, FrontDeskSessionDossier>();
  private readonly pendingSubmissions = new Map<string, FrontDeskPendingSubmission>();
  private readonly inquiries = new Map<string, SubmittedFrontDeskInquiry>();
  private readonly idempotencyIndex = new Map<string, string>();
  private readonly escalations = new Map<string, HumanEscalationRecord>();
  private readonly qualityEvaluations: AiQualityEvaluationRecord[] = [];
  private readonly persistence: FrontDeskPersistenceAdapter | null;
  private readonly productionStrictMode: boolean;
  private totalFrontDeskTurns = 0;
  private totalMasterplansGenerated = 0;

  constructor(options: FrontDeskStoreOptions = {}) {
    this.persistence = options.persistence ?? null;
    this.productionStrictMode = Boolean(options.productionStrictMode);
  }

  public getPersistenceStatus(): FrontDeskPersistenceStatus {
    if (this.persistence && this.persistence.isDurable) {
      return {
        mode: this.persistence.mode,
        durable: true,
        configured: true,
      };
    }
    if (this.productionStrictMode) {
      return {
        mode: 'unconfigured',
        durable: false,
        configured: false,
      };
    }
    return {
      mode: 'memory',
      durable: false,
      configured: true,
    };
  }

  public assertDurablePersistenceAvailable(operation: string): void {
    if (this.productionStrictMode && (!this.persistence || !this.persistence.isDurable)) {
      throw new FrontDeskPersistenceUnavailableError(
        `AI Front Desk ${operation} requires durable Supabase persistence in production. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`
      );
    }
  }

  public getOrCreateSession(sessionId: string): FrontDeskSessionDossier {
    const cleanId = sessionId.trim() || `dti-fd-${crypto.randomBytes(6).toString('hex')}`;
    let existing = this.sessions.get(cleanId);
    if (!existing) {
      existing = createEmptyDossier(cleanId);
      this.sessions.set(cleanId, existing);
      if (this.sessions.size > 1000) {
        const oldest = this.sessions.keys().next().value;
        if (oldest) this.sessions.delete(oldest);
      }
    }
    return existing;
  }

  public async getOrCreateSessionDurable(sessionId: string): Promise<FrontDeskSessionDossier> {
    this.assertDurablePersistenceAvailable('session retrieval');
    const cleanId = sessionId.trim() || `dti-fd-${crypto.randomBytes(6).toString('hex')}`;
    const cached = this.sessions.get(cleanId);
    if (cached) return cached;
    if (this.persistence?.isDurable) {
      const persisted = await this.persistence.loadSession(cleanId);
      if (persisted) {
        this.sessions.set(cleanId, persisted);
        return persisted;
      }
    }
    return this.getOrCreateSession(cleanId);
  }

  public recordTurn(
    sessionId: string,
    userMessage: string,
    options?: { isProjectDiscoveryTurn?: boolean; detectedLanguage?: string }
  ): FrontDeskSessionDossier {
    this.totalFrontDeskTurns += 1;
    const current = this.getOrCreateSession(sessionId);
    const updated = ingestUserTurnIntoDossier(current, userMessage, options);
    this.sessions.set(current.sessionId, updated);
    if (this.persistence?.isDurable) {
      void this.persistence.saveSession(updated).catch(() => {});
    }
    return updated;
  }

  public async recordTurnDurable(
    sessionId: string,
    userMessage: string,
    options?: { isProjectDiscoveryTurn?: boolean; detectedLanguage?: string }
  ): Promise<FrontDeskSessionDossier> {
    this.totalFrontDeskTurns += 1;
    const current = await this.getOrCreateSessionDurable(sessionId);
    const updated = ingestUserTurnIntoDossier(current, userMessage, options);
    this.sessions.set(current.sessionId, updated);
    if (this.persistence?.isDurable) {
      await this.persistence.saveSession(updated);
    }
    return updated;
  }

  public applySessionCorrections(
    sessionId: string,
    patch: Parameters<typeof applyClientDossierCorrections>[1]
  ): FrontDeskSessionDossier {
    const current = this.getOrCreateSession(sessionId);
    const updated = applyClientDossierCorrections(current, patch);
    this.sessions.set(current.sessionId, updated);
    if (this.persistence?.isDurable) {
      void this.persistence.saveSession(updated).catch(() => {});
    }
    return updated;
  }

  public async applySessionCorrectionsDurable(
    sessionId: string,
    patch: Parameters<typeof applyClientDossierCorrections>[1]
  ): Promise<FrontDeskSessionDossier> {
    const current = await this.getOrCreateSessionDurable(sessionId);
    const updated = applyClientDossierCorrections(current, patch);
    this.sessions.set(current.sessionId, updated);
    if (this.persistence?.isDurable) {
      await this.persistence.saveSession(updated);
    }
    return updated;
  }

  public generateAndStoreMasterplan(sessionId: string): {
    dossier: FrontDeskSessionDossier;
    masterplan: PreliminaryProjectMasterplan;
  } {
    const current = this.getOrCreateSession(sessionId);
    const masterplan = generatePreliminaryMasterplan(current);
    const updated: FrontDeskSessionDossier = {
      ...current,
      discoveryActive: true,
      masterplan,
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(current.sessionId, updated);
    this.totalMasterplansGenerated += 1;
    if (this.persistence?.isDurable) {
      void this.persistence.saveSession(updated).catch(() => {});
    }
    return { dossier: updated, masterplan };
  }

  public async generateAndStoreMasterplanDurable(sessionId: string): Promise<{
    dossier: FrontDeskSessionDossier;
    masterplan: PreliminaryProjectMasterplan;
  }> {
    const current = await this.getOrCreateSessionDurable(sessionId);
    const masterplan = generatePreliminaryMasterplan(current);
    const updated: FrontDeskSessionDossier = {
      ...current,
      discoveryActive: true,
      masterplan,
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(current.sessionId, updated);
    this.totalMasterplansGenerated += 1;
    if (this.persistence?.isDurable) {
      await this.persistence.saveSession(updated);
    }
    return { dossier: updated, masterplan };
  }

  public prepareSubmissionConfirmation(sessionId: string):
    | {
        ok: true;
        confirmationToken: string;
        dossier: FrontDeskSessionDossier;
        masterplan: PreliminaryProjectMasterplan;
      }
    | {
        ok: false;
        error: string;
        missingFields?: string[];
      } {
    this.assertDurablePersistenceAvailable('submission preparation');
    const { dossier, masterplan } = this.generateAndStoreMasterplan(sessionId);
    const missing: string[] = [];
    if (!dossier.clientProfile.fullName || dossier.clientProfile.fullName.trim().length < 2) {
      missing.push('fullName');
    }
    if (!dossier.clientProfile.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(dossier.clientProfile.email)) {
      missing.push('email');
    }
    if (!dossier.projectRequirements.businessProblem && dossier.projectRequirements.functionalRequirements.length === 0) {
      missing.push('projectRequirements');
    }

    if (missing.length > 0) {
      return {
        ok: false,
        error: `Please provide valid required information before preparing submission: ${missing.join(', ')}.`,
        missingFields: missing,
      };
    }

    const token = `dti-fd-cfm-${crypto.randomBytes(12).toString('hex')}`;
    const now = Date.now();
    const pending: FrontDeskPendingSubmission = {
      confirmationToken: token,
      sessionId: dossier.sessionId,
      dossierSnapshotVersion: dossier.version,
      preparedAt: new Date(now).toISOString(),
      expiresAt: now + CONFIRMATION_TTL_MS,
    };
    this.pendingSubmissions.set(token, pending);

    dossier.leadStatus = 'Awaiting client confirmation';
    this.sessions.set(dossier.sessionId, dossier);

    return { ok: true, confirmationToken: token, dossier, masterplan };
  }

  public async prepareSubmissionConfirmationDurable(sessionId: string): Promise<
    | {
        ok: true;
        confirmationToken: string;
        dossier: FrontDeskSessionDossier;
        masterplan: PreliminaryProjectMasterplan;
      }
    | {
        ok: false;
        error: string;
        missingFields?: string[];
      }
  > {
    this.assertDurablePersistenceAvailable('submission preparation');
    await this.getOrCreateSessionDurable(sessionId);
    const prepared = this.prepareSubmissionConfirmation(sessionId);
    if (!prepared.ok) return prepared;

    if (this.persistence?.isDurable) {
      const pending = this.pendingSubmissions.get(prepared.confirmationToken);
      if (pending) {
        await this.persistence.savePendingSubmission(pending);
      }
      await this.persistence.saveSession(prepared.dossier);
    }
    return prepared;
  }

  public consumeSubmissionConfirmation(
    sessionId: string,
    confirmationToken: string
  ): { ok: true; pending: FrontDeskPendingSubmission } | { ok: false; error: string } {
    this.assertDurablePersistenceAvailable('submission authorization');
    const now = Date.now();
    for (const [k, v] of this.pendingSubmissions.entries()) {
      if (now > v.expiresAt) this.pendingSubmissions.delete(k);
    }

    const pending = this.pendingSubmissions.get(confirmationToken);
    if (!pending) {
      return { ok: false, error: 'Invalid or expired confirmation token. Please review and prepare submission again.' };
    }
    if (pending.sessionId !== sessionId) {
      return { ok: false, error: 'Confirmation token does not belong to the active session.' };
    }
    this.pendingSubmissions.delete(confirmationToken);
    return { ok: true, pending };
  }

  public async consumeSubmissionConfirmationDurable(
    sessionId: string,
    confirmationToken: string
  ): Promise<{ ok: true; pending: FrontDeskPendingSubmission } | { ok: false; error: string }> {
    this.assertDurablePersistenceAvailable('submission authorization');
    if (this.persistence?.isDurable) {
      const outcome = await this.persistence.consumePendingSubmission(sessionId, confirmationToken);
      if (outcome.ok) {
        this.pendingSubmissions.delete(confirmationToken);
      }
      return outcome;
    }
    return this.consumeSubmissionConfirmation(sessionId, confirmationToken);
  }

  public async findInquiryByIdempotencyKeyDurable(
    idempotencyKey?: string
  ): Promise<SubmittedFrontDeskInquiry | null> {
    if (!idempotencyKey) return null;
    const cachedRef = this.idempotencyIndex.get(idempotencyKey);
    if (cachedRef) {
      const hit = this.inquiries.get(cachedRef);
      if (hit) return hit;
    }
    if (this.persistence?.isDurable) {
      const persisted = await this.persistence.findInquiryByIdempotencyKey(idempotencyKey);
      if (persisted) {
        this.inquiries.set(persisted.referenceCode, persisted);
        this.idempotencyIndex.set(idempotencyKey, persisted.referenceCode);
        return persisted;
      }
    }
    return null;
  }

  public saveSubmittedInquiry(input: {
    referenceCode: string;
    dossier: FrontDeskSessionDossier;
    masterplan: PreliminaryProjectMasterplan;
    consultation?: {
      referenceCode?: string;
      status: 'confirmed' | 'pending_review';
      scheduledDate?: string;
      scheduledTimeSlot?: string;
      clientTimezone?: string;
    };
    emailDeliveryState: string;
    idempotencyKey?: string;
  }): SubmittedFrontDeskInquiry {
    this.assertDurablePersistenceAvailable('inquiry submission');

    if (input.idempotencyKey) {
      const existingRef = this.idempotencyIndex.get(input.idempotencyKey);
      if (existingRef && this.inquiries.has(existingRef)) {
        return this.inquiries.get(existingRef)!;
      }
    }

    const now = new Date().toISOString();
    const ownerEmail = (input.dossier.clientProfile.email || '').trim().toLowerCase();
    const leadStatus: LeadQualificationStatus = input.consultation
      ? input.consultation.status === 'confirmed'
        ? 'Consultation scheduled'
        : 'Consultation requested'
      : 'Qualified project inquiry';

    const record: SubmittedFrontDeskInquiry = {
      id: crypto.randomUUID(),
      referenceCode: input.referenceCode,
      sessionId: input.dossier.sessionId,
      ownerEmail,
      companyName: input.dossier.clientProfile.companyName || 'Prospective Client',
      projectName:
        input.dossier.projectRequirements.projectName ||
        input.dossier.projectRequirements.applicationType ||
        'Customized Enterprise Project',
      clientName: input.dossier.clientProfile.fullName || 'Prospective Client',
      clientPhone: input.dossier.clientProfile.phone,
      industry: input.dossier.clientProfile.industry,
      leadStatus,
      executiveReviewStage: 'Project inquiry received',
      completenessScore: input.dossier.completeness.scorePercent,
      dossierVersion: input.dossier.version,
      clientProfile: { ...input.dossier.clientProfile },
      businessDiscovery: { ...input.dossier.businessDiscovery },
      projectRequirements: { ...input.dossier.projectRequirements },
      recommendation: input.dossier.recommendation,
      summary: input.dossier.summary,
      masterplan: input.masterplan,
      consultationReferenceCode: input.consultation?.referenceCode,
      consultationStatus: input.consultation ? input.consultation.status : 'none',
      consultationDate: input.consultation?.scheduledDate,
      consultationSlot: input.consultation?.scheduledTimeSlot,
      consultationTimezone: input.consultation?.clientTimezone,
      emailDeliveryState: input.emailDeliveryState,
      reviewHistory: [
        {
          stage: 'Project inquiry received',
          leadStatus,
          actorEmail: 'system:ai_frontdesk_authorized_submission',
          actorRole: 'system',
          notes: 'Client explicitly confirmed project summary and authorized inquiry submission.',
          recordedAt: now,
        },
      ],
      clientCorrectionHistory: [],
      createdAt: now,
      updatedAt: now,
    };

    this.inquiries.set(record.referenceCode, record);
    if (input.idempotencyKey) {
      this.idempotencyIndex.set(input.idempotencyKey, record.referenceCode);
    }
    input.dossier.leadStatus = leadStatus;
    this.sessions.set(input.dossier.sessionId, input.dossier);
    return record;
  }

  public async saveSubmittedInquiryDurable(
    input: Parameters<FrontDeskStore['saveSubmittedInquiry']>[0]
  ): Promise<SubmittedFrontDeskInquiry> {
    this.assertDurablePersistenceAvailable('inquiry submission');
    if (input.idempotencyKey) {
      const existing = await this.findInquiryByIdempotencyKeyDurable(input.idempotencyKey);
      if (existing) return existing;
    }
    const record = this.saveSubmittedInquiry(input);
    if (this.persistence?.isDurable) {
      await this.persistence.saveInquiry(record, input.idempotencyKey);
      await this.persistence.saveSession(input.dossier);
    }
    return record;
  }

  public listInquiriesForAdmin(filters?: {
    query?: string;
    leadStatus?: string;
    reviewStage?: string;
    limit?: number;
    offset?: number;
  }): { records: SubmittedFrontDeskInquiry[]; total: number } {
    let items = Array.from(this.inquiries.values());
    if (filters?.query) {
      const q = filters.query.trim().toLowerCase();
      items = items.filter(
        (r) =>
          r.referenceCode.toLowerCase().includes(q) ||
          r.companyName.toLowerCase().includes(q) ||
          r.clientName.toLowerCase().includes(q) ||
          r.ownerEmail.includes(q) ||
          r.projectName.toLowerCase().includes(q)
      );
    }
    if (filters?.leadStatus && filters.leadStatus !== 'all') {
      items = items.filter((r) => r.leadStatus === filters.leadStatus);
    }
    if (filters?.reviewStage && filters.reviewStage !== 'all') {
      items = items.filter((r) => r.executiveReviewStage === filters.reviewStage);
    }
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const total = items.length;
    const offset = Math.max(0, filters?.offset ?? 0);
    const limit = Math.max(1, Math.min(100, filters?.limit ?? 25));
    return { records: items.slice(offset, offset + limit), total };
  }

  public async listInquiriesForAdminDurable(filters?: {
    query?: string;
    leadStatus?: string;
    reviewStage?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ records: SubmittedFrontDeskInquiry[]; total: number }> {
    this.assertDurablePersistenceAvailable('admin inquiry listing');
    if (this.persistence?.isDurable) {
      const persisted = await this.persistence.listInquiries();
      for (const rec of persisted) {
        this.inquiries.set(rec.referenceCode, rec);
      }
    }
    return this.listInquiriesForAdmin(filters);
  }

  /**
   * M23: Strict Client Portal ownership isolation — returns ONLY records matching normalized client email.
   */
  public listInquiriesForClientEmail(clientEmail: string): SubmittedFrontDeskInquiry[] {
    const normalized = clientEmail.trim().toLowerCase();
    if (!normalized) return [];
    return Array.from(this.inquiries.values())
      .filter((r) => r.ownerEmail === normalized)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  public async listInquiriesForClientEmailDurable(clientEmail: string): Promise<SubmittedFrontDeskInquiry[]> {
    this.assertDurablePersistenceAvailable('client inquiry listing');
    const normalized = clientEmail.trim().toLowerCase();
    if (!normalized) return [];
    if (this.persistence?.isDurable) {
      const rows = await this.persistence.listInquiriesByOwnerEmail(normalized);
      for (const r of rows) {
        this.inquiries.set(r.referenceCode, r);
      }
      return rows;
    }
    return this.listInquiriesForClientEmail(normalized);
  }

  public getInquiryByReference(referenceCode: string): SubmittedFrontDeskInquiry | null {
    return this.inquiries.get(referenceCode) || null;
  }

  public async getInquiryByReferenceDurable(referenceCode: string): Promise<SubmittedFrontDeskInquiry | null> {
    this.assertDurablePersistenceAvailable('inquiry retrieval');
    if (this.persistence?.isDurable) {
      const persisted = await this.persistence.loadInquiryByReference(referenceCode);
      if (persisted) {
        this.inquiries.set(persisted.referenceCode, persisted);
        return persisted;
      }
    }
    return this.getInquiryByReference(referenceCode);
  }

  /**
   * M23: Authenticated client owner submits corrections to their own inquiry.
   * Rejects cross-client access strictly and optionally validates optimistic `expectedVersion`.
   */
  public applyClientPortalCorrection(params: {
    referenceCode: string;
    authenticatedEmail: string;
    patch: Parameters<typeof applyClientDossierCorrections>[1];
    note?: string;
    expectedVersion?: number;
  }): { ok: true; record: SubmittedFrontDeskInquiry } | { ok: false; statusCode: number; error: string } {
    this.assertDurablePersistenceAvailable('client inquiry correction');
    const record = this.inquiries.get(params.referenceCode);
    if (!record) {
      return { ok: false, statusCode: 404, error: 'Project inquiry not found.' };
    }
    if (record.ownerEmail !== params.authenticatedEmail.trim().toLowerCase()) {
      return { ok: false, statusCode: 403, error: 'Access denied: you may only update your own project inquiries.' };
    }
    if (
      typeof params.expectedVersion === 'number' &&
      Number.isInteger(params.expectedVersion) &&
      params.expectedVersion !== record.dossierVersion
    ) {
      return {
        ok: false,
        statusCode: 409,
        error: `Version conflict: inquiry is currently at version ${record.dossierVersion}. Please refresh before applying changes.`,
      };
    }

    const baseSession = this.getOrCreateSession(record.sessionId);
    const hydrated: FrontDeskSessionDossier = {
      ...baseSession,
      discoveryActive: true,
      clientProfile: { ...record.clientProfile },
      businessDiscovery: { ...record.businessDiscovery },
      projectRequirements: { ...record.projectRequirements },
      masterplan: record.masterplan,
      version: record.dossierVersion,
    };

    const updatedDossier = applyClientDossierCorrections(hydrated, params.patch);
    const updatedMasterplan = generatePreliminaryMasterplan(updatedDossier);
    const now = new Date().toISOString();

    const updatedRecord: SubmittedFrontDeskInquiry = {
      ...record,
      companyName: updatedDossier.clientProfile.companyName || record.companyName,
      projectName: updatedDossier.projectRequirements.projectName || record.projectName,
      clientName: updatedDossier.clientProfile.fullName || record.clientName,
      clientPhone: updatedDossier.clientProfile.phone,
      industry: updatedDossier.clientProfile.industry,
      completenessScore: updatedDossier.completeness.scorePercent,
      dossierVersion: updatedDossier.version,
      clientProfile: { ...updatedDossier.clientProfile },
      businessDiscovery: { ...updatedDossier.businessDiscovery },
      projectRequirements: { ...updatedDossier.projectRequirements },
      recommendation: updatedDossier.recommendation,
      summary: updatedDossier.summary,
      masterplan: updatedMasterplan,
      clientCorrectionHistory: [
        ...record.clientCorrectionHistory,
        {
          version: updatedDossier.version,
          correctedByEmail: params.authenticatedEmail.trim().toLowerCase(),
          note: (params.note || 'Client updated project profile or requirements via Client Portal.').slice(0, 300),
          correctedAt: now,
        },
      ],
      updatedAt: now,
    };

    this.inquiries.set(record.referenceCode, updatedRecord);
    this.sessions.set(record.sessionId, updatedDossier);
    return { ok: true, record: updatedRecord };
  }

  public async applyClientPortalCorrectionDurable(
    params: Parameters<FrontDeskStore['applyClientPortalCorrection']>[0]
  ): Promise<{ ok: true; record: SubmittedFrontDeskInquiry } | { ok: false; statusCode: number; error: string }> {
    this.assertDurablePersistenceAvailable('client inquiry correction');
    if (this.persistence?.isDurable) {
      const persisted = await this.persistence.loadInquiryByReference(params.referenceCode);
      if (persisted) {
        this.inquiries.set(persisted.referenceCode, persisted);
      }
    }
    const outcome = this.applyClientPortalCorrection(params);
    if (outcome.ok && this.persistence?.isDurable) {
      await this.persistence.saveInquiry(outcome.record);
    }
    return outcome;
  }

  /**
   * M25: 16-Stage Executive Commercial Review Workflow Update (Human Admin Only!)
   */
  public advanceExecutiveCommercialReview(params: {
    referenceCode: string;
    stage: ExecutiveReviewStage;
    leadStatus?: LeadQualificationStatus;
    notes: string;
    actorEmail: string;
    actorRole: string;
    approveCommercialTerms?: boolean;
  }): { ok: true; record: SubmittedFrontDeskInquiry } | { ok: false; error: string; statusCode?: number } {
    this.assertDurablePersistenceAvailable('executive commercial review');
    const record = this.inquiries.get(params.referenceCode);
    if (!record) {
      return { ok: false, statusCode: 404, error: `Inquiry "${params.referenceCode}" not found.` };
    }
    if (!EXECUTIVE_REVIEW_STAGES.includes(params.stage)) {
      return { ok: false, statusCode: 400, error: `Invalid executive review stage "${params.stage}".` };
    }
    // Governance rule: AI actors may NEVER independently approve commercial terms!
    if (params.approveCommercialTerms && /ai|bot|assistant|system/i.test(params.actorRole)) {
      return {
        ok: false,
        statusCode: 403,
        error: 'AI systems are strictly prohibited from independently approving commercial terms.',
      };
    }
    // Prevent silent duplicate commercial approval overwriting original executive sign-off
    if (params.approveCommercialTerms && record.commercialApprovedBy) {
      return {
        ok: false,
        statusCode: 409,
        error: `Commercial terms for "${params.referenceCode}" were already approved by ${record.commercialApprovedBy} at ${record.commercialApprovedAt}.`,
      };
    }

    const now = new Date().toISOString();
    const nextLeadStatus = params.leadStatus || record.leadStatus;
    const entry: CommercialReviewAuditEntry = {
      stage: params.stage,
      leadStatus: nextLeadStatus,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
      notes: (params.notes || `Stage updated to ${params.stage}`).slice(0, 500),
      approvedCommercially: Boolean(params.approveCommercialTerms),
      recordedAt: now,
    };

    const updated: SubmittedFrontDeskInquiry = {
      ...record,
      executiveReviewStage: params.stage,
      leadStatus: nextLeadStatus,
      commercialApprovedBy: params.approveCommercialTerms ? params.actorEmail : record.commercialApprovedBy,
      commercialApprovedAt: params.approveCommercialTerms ? now : record.commercialApprovedAt,
      reviewHistory: [...record.reviewHistory, entry],
      updatedAt: now,
    };
    this.inquiries.set(record.referenceCode, updated);
    return { ok: true, record: updated };
  }

  public async advanceExecutiveCommercialReviewDurable(
    params: Parameters<FrontDeskStore['advanceExecutiveCommercialReview']>[0]
  ): Promise<{ ok: true; record: SubmittedFrontDeskInquiry } | { ok: false; error: string; statusCode?: number }> {
    this.assertDurablePersistenceAvailable('executive commercial review');
    if (this.persistence?.isDurable) {
      const persisted = await this.persistence.loadInquiryByReference(params.referenceCode);
      if (persisted) {
        this.inquiries.set(persisted.referenceCode, persisted);
      }
    }
    const outcome = this.advanceExecutiveCommercialReview(params);
    if (outcome.ok && this.persistence?.isDurable) {
      await this.persistence.saveInquiry(outcome.record);
    }
    return outcome;
  }

  /**
   * M23: Human Escalation Handover
   */
  public createHumanEscalation(input: {
    sessionId: string;
    clientName: string;
    clientEmail?: string;
    clientPhone?: string;
    companyName?: string;
    reason: string;
    requestedTrack?: HumanEscalationRecord['requestedTrack'];
    preferredContactMethod?: HumanEscalationRecord['preferredContactMethod'];
  }): HumanEscalationRecord {
    this.assertDurablePersistenceAvailable('human escalation creation');
    const now = new Date().toISOString();
    const ref = `DTI-ESC-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const record: HumanEscalationRecord = {
      id: crypto.randomUUID(),
      referenceCode: ref,
      sessionId: input.sessionId,
      clientName: input.clientName.trim().slice(0, 120) || 'Prospective Client',
      clientEmail: input.clientEmail?.trim().toLowerCase().slice(0, 180),
      clientPhone: input.clientPhone?.trim().slice(0, 40),
      companyName: input.companyName?.trim().slice(0, 140),
      reason: input.reason.trim().slice(0, 500),
      requestedTrack: input.requestedTrack || 'general',
      preferredContactMethod: input.preferredContactMethod || 'email',
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
    this.escalations.set(record.id, record);
    return record;
  }

  public async createHumanEscalationDurable(
    input: Parameters<FrontDeskStore['createHumanEscalation']>[0]
  ): Promise<HumanEscalationRecord> {
    this.assertDurablePersistenceAvailable('human escalation creation');
    const record = this.createHumanEscalation(input);
    if (this.persistence?.isDurable) {
      await this.persistence.saveEscalation(record);
    }
    return record;
  }

  public listHumanEscalations(statusFilter?: string): HumanEscalationRecord[] {
    let items = Array.from(this.escalations.values());
    if (statusFilter && statusFilter !== 'all') {
      items = items.filter((e) => e.status === statusFilter);
    }
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  public async listHumanEscalationsDurable(statusFilter?: string): Promise<HumanEscalationRecord[]> {
    this.assertDurablePersistenceAvailable('human escalation listing');
    if (this.persistence?.isDurable) {
      const persisted = await this.persistence.listEscalations();
      for (const e of persisted) {
        this.escalations.set(e.id, e);
      }
    }
    return this.listHumanEscalations(statusFilter);
  }

  public updateHumanEscalation(
    id: string,
    patch: { status?: HumanEscalationRecord['status']; assignedTo?: string; resolutionNotes?: string }
  ): HumanEscalationRecord | null {
    this.assertDurablePersistenceAvailable('human escalation update');
    const existing = this.escalations.get(id);
    if (!existing) return null;
    const updated: HumanEscalationRecord = {
      ...existing,
      status: patch.status || existing.status,
      assignedTo: patch.assignedTo !== undefined ? patch.assignedTo.slice(0, 120) : existing.assignedTo,
      resolutionNotes:
        patch.resolutionNotes !== undefined ? patch.resolutionNotes.slice(0, 500) : existing.resolutionNotes,
      updatedAt: new Date().toISOString(),
    };
    this.escalations.set(id, updated);
    return updated;
  }

  public async updateHumanEscalationDurable(
    id: string,
    patch: { status?: HumanEscalationRecord['status']; assignedTo?: string; resolutionNotes?: string }
  ): Promise<HumanEscalationRecord | null> {
    this.assertDurablePersistenceAvailable('human escalation update');
    if (this.persistence?.isDurable && !this.escalations.has(id)) {
      const persisted = await this.persistence.listEscalations();
      for (const e of persisted) this.escalations.set(e.id, e);
    }
    const updated = this.updateHumanEscalation(id, patch);
    if (updated && this.persistence?.isDurable) {
      await this.persistence.saveEscalation(updated);
    }
    return updated;
  }

  /**
   * M26: AI Quality Assurance Evaluation Recording
   */
  public recordQualityEvaluation(
    input: Omit<AiQualityEvaluationRecord, 'id' | 'createdAt'>
  ): AiQualityEvaluationRecord {
    this.assertDurablePersistenceAvailable('quality evaluation recording');
    const rec: AiQualityEvaluationRecord = {
      ...input,
      id: crypto.randomUUID(),
      notes: input.notes.slice(0, 500),
      createdAt: new Date().toISOString(),
    };
    this.qualityEvaluations.unshift(rec);
    if (this.qualityEvaluations.length > 250) {
      this.qualityEvaluations.pop();
    }
    return rec;
  }

  public async recordQualityEvaluationDurable(
    input: Omit<AiQualityEvaluationRecord, 'id' | 'createdAt'>
  ): Promise<AiQualityEvaluationRecord> {
    this.assertDurablePersistenceAvailable('quality evaluation recording');
    const rec = this.recordQualityEvaluation(input);
    if (this.persistence?.isDurable) {
      await this.persistence.saveQualityEvaluation(rec);
    }
    return rec;
  }

  public listQualityEvaluations(limit = 50): AiQualityEvaluationRecord[] {
    return this.qualityEvaluations.slice(0, Math.max(1, Math.min(100, limit)));
  }

  public async listQualityEvaluationsDurable(limit = 50): Promise<AiQualityEvaluationRecord[]> {
    this.assertDurablePersistenceAvailable('quality evaluation listing');
    if (this.persistence?.isDurable) {
      const persisted = await this.persistence.listQualityEvaluations(limit);
      this.qualityEvaluations.splice(0, this.qualityEvaluations.length, ...persisted);
      return persisted;
    }
    return this.listQualityEvaluations(limit);
  }

  /**
   * M25: Privacy-Safe Operational Analytics (Section 33)
   * Strictly aggregated counts & averages—NEVER exposes raw private chat transcripts.
   */
  public getPrivacySafeAnalytics() {
    const sessionsArr = Array.from(this.sessions.values());
    const inquiriesArr = Array.from(this.inquiries.values());
    const escalationsArr = Array.from(this.escalations.values());

    const discoverySessions = sessionsArr.filter((s) => s.discoveryActive);
    const avgCompleteness =
      discoverySessions.length > 0
        ? Math.round(
            discoverySessions.reduce((sum, s) => sum + s.completeness.scorePercent, 0) /
              discoverySessions.length
          )
        : 0;

    const leadFunnel: Record<string, number> = {};
    for (const inq of inquiriesArr) {
      leadFunnel[inq.leadStatus] = (leadFunnel[inq.leadStatus] || 0) + 1;
    }

    const reviewStageBreakdown: Record<string, number> = {};
    for (const inq of inquiriesArr) {
      reviewStageBreakdown[inq.executiveReviewStage] =
        (reviewStageBreakdown[inq.executiveReviewStage] || 0) + 1;
    }

    const avgQualityRating =
      this.qualityEvaluations.length > 0
        ? Number(
            (
              this.qualityEvaluations.reduce((s, e) => s + e.rating, 0) /
              this.qualityEvaluations.length
            ).toFixed(2)
          )
        : null;

    return {
      totalSessions: sessionsArr.length,
      totalFrontDeskTurns: this.totalFrontDeskTurns,
      discoverySessionsCount: discoverySessions.length,
      averageRequirementsCompletenessPercent: avgCompleteness,
      totalMasterplansGenerated: this.totalMasterplansGenerated,
      qualifiedInquiriesCount: inquiriesArr.length,
      consultationRequestsLinkedCount: inquiriesArr.filter((i) => i.consultationStatus !== 'none').length,
      confirmedConsultationsLinkedCount: inquiriesArr.filter((i) => i.consultationStatus === 'confirmed').length,
      humanEscalationsCount: escalationsArr.length,
      openHumanEscalationsCount: escalationsArr.filter((e) => e.status === 'open').length,
      leadFunnel,
      reviewStageBreakdown,
      qualityEvaluationsCount: this.qualityEvaluations.length,
      averageQualityRating: avgQualityRating,
      persistence: this.getPersistenceStatus(),
      policyCompliancePassRate:
        this.qualityEvaluations.length > 0
          ? Math.round(
              (this.qualityEvaluations.filter((e) => e.policyCompliancePassed).length /
                this.qualityEvaluations.length) *
                100
            )
          : 100,
    };
  }
}
