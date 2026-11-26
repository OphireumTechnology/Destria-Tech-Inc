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

/**
 * M16 / M20 / M23 / M25 / M26: AI Front Desk Operational Persistence Store
 *
 * Manages:
 * - Active Front Desk sessions & single-use session-scoped submission confirmation tokens
 * - Submitted Project Inquiries with versioned requirements, masterplans & strict client ownership
 * - 16-Stage Executive Commercial Review workflow with human-only commercial approval & audit history
 * - Human Escalation handover requests
 * - AI Quality Evaluations & privacy-safe operational analytics
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

const CONFIRMATION_TTL_MS = 20 * 60 * 1000;

export class FrontDeskStore {
  private readonly sessions = new Map<string, FrontDeskSessionDossier>();
  private readonly pendingSubmissions = new Map<string, FrontDeskPendingSubmission>();
  private readonly inquiries = new Map<string, SubmittedFrontDeskInquiry>();
  private readonly escalations = new Map<string, HumanEscalationRecord>();
  private readonly qualityEvaluations: AiQualityEvaluationRecord[] = [];
  private totalFrontDeskTurns = 0;
  private totalMasterplansGenerated = 0;

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

  public recordTurn(
    sessionId: string,
    userMessage: string,
    options?: { isProjectDiscoveryTurn?: boolean; detectedLanguage?: string }
  ): FrontDeskSessionDossier {
    this.totalFrontDeskTurns += 1;
    const current = this.getOrCreateSession(sessionId);
    const updated = ingestUserTurnIntoDossier(current, userMessage, options);
    this.sessions.set(current.sessionId, updated);
    return updated;
  }

  public applySessionCorrections(
    sessionId: string,
    patch: Parameters<typeof applyClientDossierCorrections>[1]
  ): FrontDeskSessionDossier {
    const current = this.getOrCreateSession(sessionId);
    const updated = applyClientDossierCorrections(current, patch);
    this.sessions.set(current.sessionId, updated);
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
    return { dossier: updated, masterplan };
  }

  public prepareSubmissionConfirmation(sessionId: string): {
    ok: true;
    confirmationToken: string;
    dossier: FrontDeskSessionDossier;
    masterplan: PreliminaryProjectMasterplan;
  } | {
    ok: false;
    error: string;
    missingFields?: string[];
  } {
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
    this.pendingSubmissions.set(token, {
      confirmationToken: token,
      sessionId: dossier.sessionId,
      dossierSnapshotVersion: dossier.version,
      preparedAt: new Date(now).toISOString(),
      expiresAt: now + CONFIRMATION_TTL_MS,
    });

    dossier.leadStatus = 'Awaiting client confirmation';
    this.sessions.set(dossier.sessionId, dossier);

    return { ok: true, confirmationToken: token, dossier, masterplan };
  }

  public consumeSubmissionConfirmation(
    sessionId: string,
    confirmationToken: string
  ): { ok: true; pending: FrontDeskPendingSubmission } | { ok: false; error: string } {
    const now = Date.now();
    for (const [k, v] of this.pendingSubmissions.entries()) {
      if (now > v.expiresAt) this.pendingSubmissions.delete(k);
    }

    const pending = this.pendingSubmissions.get(confirmationToken);
    if (!pending) {
      return { ok: false, error: 'Invalid or expired confirmation token. Please review and prepare submission again.' };
    }
    // Strict cross-session isolation!
    if (pending.sessionId !== sessionId) {
      return { ok: false, error: 'Confirmation token does not belong to the active session.' };
    }
    this.pendingSubmissions.delete(confirmationToken);
    return { ok: true, pending };
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
  }): SubmittedFrontDeskInquiry {
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
    input.dossier.leadStatus = leadStatus;
    this.sessions.set(input.dossier.sessionId, input.dossier);
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

  public getInquiryByReference(referenceCode: string): SubmittedFrontDeskInquiry | null {
    return this.inquiries.get(referenceCode) || null;
  }

  /**
   * M23: Authenticated client owner submits corrections to their own inquiry.
   * Rejects cross-client access strictly!
   */
  public applyClientPortalCorrection(params: {
    referenceCode: string;
    authenticatedEmail: string;
    patch: Parameters<typeof applyClientDossierCorrections>[1];
    note?: string;
  }): { ok: true; record: SubmittedFrontDeskInquiry } | { ok: false; statusCode: number; error: string } {
    const record = this.inquiries.get(params.referenceCode);
    if (!record) {
      return { ok: false, statusCode: 404, error: 'Project inquiry not found.' };
    }
    if (record.ownerEmail !== params.authenticatedEmail.trim().toLowerCase()) {
      return { ok: false, statusCode: 403, error: 'Access denied: you may only update your own project inquiries.' };
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
  }): { ok: true; record: SubmittedFrontDeskInquiry } | { ok: false; error: string } {
    const record = this.inquiries.get(params.referenceCode);
    if (!record) {
      return { ok: false, error: `Inquiry "${params.referenceCode}" not found.` };
    }
    if (!EXECUTIVE_REVIEW_STAGES.includes(params.stage)) {
      return { ok: false, error: `Invalid executive review stage "${params.stage}".` };
    }
    // Governance rule: AI actors may NEVER independently approve commercial terms!
    if (params.approveCommercialTerms && /ai|bot|assistant|system/i.test(params.actorRole)) {
      return { ok: false, error: 'AI systems are strictly prohibited from independently approving commercial terms.' };
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

  public listHumanEscalations(statusFilter?: string): HumanEscalationRecord[] {
    let items = Array.from(this.escalations.values());
    if (statusFilter && statusFilter !== 'all') {
      items = items.filter((e) => e.status === statusFilter);
    }
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  public updateHumanEscalation(
    id: string,
    patch: { status?: HumanEscalationRecord['status']; assignedTo?: string; resolutionNotes?: string }
  ): HumanEscalationRecord | null {
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

  /**
   * M26: AI Quality Assurance Evaluation Recording
   */
  public recordQualityEvaluation(
    input: Omit<AiQualityEvaluationRecord, 'id' | 'createdAt'>
  ): AiQualityEvaluationRecord {
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

  public listQualityEvaluations(limit = 50): AiQualityEvaluationRecord[] {
    return this.qualityEvaluations.slice(0, Math.max(1, Math.min(100, limit)));
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
