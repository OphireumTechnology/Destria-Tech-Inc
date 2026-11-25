export class DatabaseUnavailableError extends Error {
  public readonly statusCode = 503;
  public readonly code = 'DATABASE_UNAVAILABLE';
  constructor(message = 'Secure database persistence is not configured or unreachable.') {
    super(message);
    this.name = 'DatabaseUnavailableError';
  }
}

export class ConflictError extends Error {
  public readonly statusCode = 409;
  public readonly code = 'SLOT_CONFLICT';
  constructor(message = 'The requested resource conflicts with an existing record.') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class NotFoundError extends Error {
  public readonly statusCode = 404;
  public readonly code = 'NOT_FOUND';
  constructor(message = 'Requested record was not found.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export interface SelectedServiceSnapshot {
  id: string;
  title: string;
  engagementLabel?: string;
  assessmentBasis?: string;
  deliveryType?: string;
  startingUsd?: number;
  monthlyUsd?: number;
  model?: string;
  selectedOptionIds: string[];
}

export type RequestSourceChannel = 'Public Website' | 'AI Chat' | 'AI Voice';

export type NotificationOutboxStatus =
  | 'queued'
  | 'processing'
  | 'provider_accepted'
  | 'sent'
  | 'delivered'
  | 'delivery_delayed'
  | 'retry_scheduled'
  | 'failed'
  | 'bounced'
  | 'complained'
  | 'dead_letter'
  | 'unconfigured';

export interface SolutionRequestRecord {
  id: string;
  referenceCode: string;
  idempotencyKey?: string;
  type: 'contact_form' | 'contact_inquiry' | 'solution_builder';
  fullName: string;
  email: string;
  contactNumber: string;
  company: string;
  industry?: string;
  targetTimeline?: string;
  selectedServices: SelectedServiceSnapshot[];
  selectedServiceIds: string[];
  selectedOptionsMap: Record<string, string[]>;
  serviceId: string;
  serviceTitle: string;
  estimatedOneTimeStartingUsd: number;
  estimatedMonthlyStartingUsd: number;
  estimatedBudget: string;
  engagementScope?: string;
  submissionTimezone?: string;
  preferredCurrency: 'USD' | 'PHP';
  phpConversionRate?: number;
  projectDescription: string;
  fileName?: string;
  privacyConsent: boolean;
  commercialPolicyConsent?: boolean;
  status: 'submitted' | 'under_review' | 'proposal_sent' | 'archived';
  emailDeliveryStatus: 'pending' | 'sent' | 'failed' | 'unconfigured';
  sourceChannel: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentRecord {
  id: string;
  referenceCode: string;
  idempotencyKey?: string;
  fullName: string;
  email: string;
  phone: string;
  companyName: string;
  briefReferenceCode?: string;
  executivePathway?: 'ceo' | 'cto' | 'advisory';
  consultationType: 'video' | 'phone' | 'in_person';
  consultationPurpose?: string;
  selectedSolution?: string;
  scheduledDate: string;
  scheduledTimeSlot: string;
  utcScheduledAt?: string;
  durationMinutes: number;
  clientTimezone: string;
  meetingLink?: string;
  meetingLocation?: string;
  assignedConsultant: string;
  status: 'pending_review' | 'confirmed' | 'rescheduled' | 'cancelled' | 'completed';
  calendarSyncStatus: 'synced' | 'pending' | 'failed' | 'unconfigured';
  calendarEventId?: string;
  managementTokenHash?: string;
  sourceChannel?: string;
  availabilityVerified?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailOutboxRecord {
  id: string;
  dedupeKey: string;
  entityType: 'solution_request' | 'appointment';
  entityReference: string;
  recipientEmail: string;
  replyTo?: string;
  idempotencyKey?: string;
  requestSource?: string;
  notificationType:
    | 'customer_confirmation'
    | 'admin_alert'
    | 'appointment_request'
    | 'appointment_update';
  subject: string;
  htmlBody: string;
  textBody: string;
  status: NotificationOutboxStatus;
  provider: string;
  providerReference?: string;
  deliveryAttempts: number;
  lastError?: string;
  nextRetryAt?: string;
  lastAttemptAt?: string;
  providerAcceptedAt?: string;
  deliveredAt?: string;
  sentAt?: string;
  claimedBy?: string;
  claimedAt?: string;
  leaseExpiresAt?: string;
  eventRevision?: number;
  deadLetteredAt?: string;
  bouncedAt?: string;
  complainedAt?: string;
  deliveryDelayedAt?: string;
  lastWebhookEventId?: string;
  lastWebhookEventAt?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOutboxInput {
  dedupeKey: string;
  entityType: 'solution_request' | 'appointment';
  entityReference: string;
  recipientEmail: string;
  replyTo?: string;
  idempotencyKey?: string;
  requestSource?: string;
  notificationType: EmailOutboxRecord['notificationType'];
  subject: string;
  htmlBody: string;
  textBody: string;
  eventRevision?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateOutboxPatch {
  status: NotificationOutboxStatus;
  providerReference?: string;
  deliveryAttempts: number;
  lastError?: string | null;
  nextRetryAt?: string | null;
  lastAttemptAt?: string | null;
  providerAcceptedAt?: string | null;
  deliveredAt?: string | null;
  sentAt?: string | null;
  claimedBy?: string | null;
  claimedAt?: string | null;
  leaseExpiresAt?: string | null;
  deadLetteredAt?: string | null;
  bouncedAt?: string | null;
  complainedAt?: string | null;
  deliveryDelayedAt?: string | null;
  lastWebhookEventId?: string | null;
  lastWebhookEventAt?: string | null;
}

export interface NotificationWebhookEventRecord {
  id: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  providerMessageId?: string;
  eventTimestampUtc: string;
  reconciled: boolean;
  outboxId?: string;
  payload: Record<string, unknown>;
  receivedAt: string;
  reconciledAt?: string;
}

export interface AuditLogRecord {
  id: string;
  correlationId?: string;
  actor: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface AdminUserRecord {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'super_admin';
  isActive: boolean;
}

export interface CreateSolutionRequestInput {
  referenceCode: string;
  idempotencyKey?: string;
  type: 'contact_form' | 'contact_inquiry' | 'solution_builder';
  fullName: string;
  email: string;
  contactNumber: string;
  company: string;
  industry?: string;
  targetTimeline?: string;
  selectedServices: SelectedServiceSnapshot[];
  selectedServiceIds: string[];
  selectedOptionsMap: Record<string, string[]>;
  serviceId: string;
  serviceTitle: string;
  estimatedOneTimeStartingUsd: number;
  estimatedMonthlyStartingUsd: number;
  estimatedBudget: string;
  engagementScope?: string;
  submissionTimezone?: string;
  preferredCurrency: 'USD' | 'PHP';
  phpConversionRate?: number;
  projectDescription: string;
  fileName?: string;
  privacyConsent: boolean;
  commercialPolicyConsent?: boolean;
  sourceChannel?: string;
  clientIp?: string;
}

export interface CreateAppointmentInput {
  referenceCode: string;
  idempotencyKey?: string;
  fullName: string;
  email: string;
  phone: string;
  companyName: string;
  briefReferenceCode?: string;
  executivePathway?: 'ceo' | 'cto' | 'advisory';
  consultationType: 'video' | 'phone' | 'in_person';
  consultationPurpose?: string;
  selectedSolution?: string;
  scheduledDate: string;
  scheduledTimeSlot: string;
  utcScheduledAt?: string;
  durationMinutes: number;
  clientTimezone: string;
  meetingLink?: string;
  meetingLocation?: string;
  assignedConsultant: string;
  status: 'pending_review' | 'confirmed';
  calendarSyncStatus: 'synced' | 'pending' | 'failed' | 'unconfigured';
  calendarEventId?: string;
  managementTokenHash: string;
  sourceChannel?: string;
  availabilityVerified?: boolean;
  notes?: string;
}

export interface DatabaseRepository {
  readonly isConfigured: boolean;
  ping(): Promise<{ ok: boolean; configured: boolean; latencyMs?: number; error?: string }>;

  findSolutionRequestByIdempotencyKey(key: string): Promise<SolutionRequestRecord | null>;
  createSolutionRequest(input: CreateSolutionRequestInput): Promise<{
    record: SolutionRequestRecord;
    created: boolean;
  }>;
  createSolutionRequestWithOutbox?(
    input: CreateSolutionRequestInput,
    outboxItems: CreateOutboxInput[]
  ): Promise<{
    record: SolutionRequestRecord;
    created: boolean;
    outboxRecords: EmailOutboxRecord[];
  }>;
  updateSolutionRequestEmailStatus(
    referenceCode: string,
    emailDeliveryStatus: 'pending' | 'sent' | 'failed' | 'unconfigured'
  ): Promise<void>;
  listSolutionRequests(options: {
    limit: number;
    offset: number;
    status?: string;
  }): Promise<{ records: SolutionRequestRecord[]; total: number }>;

  getBookedSlotsForDate(scheduledDate: string): Promise<string[]>;
  createAppointment(input: CreateAppointmentInput): Promise<{
    record: AppointmentRecord;
    created: boolean;
  }>;
  createAppointmentWithOutbox?(
    input: CreateAppointmentInput,
    outboxItems: CreateOutboxInput[]
  ): Promise<{
    record: AppointmentRecord;
    created: boolean;
    outboxRecords: EmailOutboxRecord[];
  }>;
  getAppointmentByReference(referenceCode: string): Promise<AppointmentRecord | null>;
  updateAppointment(
    referenceCode: string,
    patch: Partial<
      Pick<
        AppointmentRecord,
        'scheduledDate' | 'scheduledTimeSlot' | 'status' | 'meetingLink' | 'calendarSyncStatus' | 'calendarEventId' | 'notes'
      >
    >
  ): Promise<AppointmentRecord>;
  listAppointments(options: { limit: number; offset: number }): Promise<{
    records: AppointmentRecord[];
    total: number;
  }>;

  createOutboxRecord(input: CreateOutboxInput): Promise<{ record: EmailOutboxRecord; created: boolean }>;
  updateOutboxStatus(id: string, patch: UpdateOutboxPatch): Promise<void>;
  listRetryableOutbox(limit?: number): Promise<EmailOutboxRecord[]>;
  claimRetryableOutbox?(
    workerId: string,
    limit?: number,
    leaseSeconds?: number
  ): Promise<EmailOutboxRecord[]>;
  findOutboxByProviderReference?(providerReference: string): Promise<EmailOutboxRecord | null>;
  getOutboxById?(id: string): Promise<EmailOutboxRecord | null>;
  listOutboxByEntity?(
    entityType: 'solution_request' | 'appointment',
    entityReference: string
  ): Promise<EmailOutboxRecord[]>;
  listOutboxRecords?(options: {
    limit: number;
    offset: number;
    status?: string;
    entityReference?: string;
  }): Promise<{ records: EmailOutboxRecord[]; total: number }>;

  recordWebhookEventOnce?(input: {
    provider: string;
    providerEventId: string;
    eventType: string;
    providerMessageId?: string;
    eventTimestampUtc: string;
    payload: Record<string, unknown>;
  }): Promise<{ record: NotificationWebhookEventRecord; inserted: boolean }>;
  listPendingWebhookEventsByMessageId?(
    providerMessageId: string
  ): Promise<NotificationWebhookEventRecord[]>;
  markWebhookEventReconciled?(eventId: string, outboxId: string): Promise<void>;

  writeAuditLog(input: Omit<AuditLogRecord, 'id' | 'createdAt'>): Promise<void>;
  listAuditLogs(options: { limit: number; offset: number }): Promise<{
    records: AuditLogRecord[];
    total: number;
  }>;

  findActiveAdminByEmail(email: string, authUserId?: string): Promise<AdminUserRecord | null>;
  verifySupabaseUserToken(token: string): Promise<{ id: string; email: string } | null>;
}
