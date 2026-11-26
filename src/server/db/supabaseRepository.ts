import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AdminUserRecord,
  AppointmentRecord,
  AuditLogRecord,
  ConflictError,
  CreateAppointmentInput,
  CreateOutboxInput,
  CreateSolutionRequestInput,
  DatabaseRepository,
  DatabaseUnavailableError,
  EmailOutboxRecord,
  NotFoundError,
  NotificationWebhookEventRecord,
  SolutionRequestRecord,
  UpdateOutboxPatch,
} from './types';

function mapSolutionRequestRow(row: any): SolutionRequestRecord {
  const selectedServices = Array.isArray(row.selected_services_json) ? row.selected_services_json : [];
  const selectedOptionsMap =
    row.selected_options_json && typeof row.selected_options_json === 'object'
      ? row.selected_options_json
      : {};
  return {
    id: String(row.id),
    referenceCode: String(row.reference_code),
    idempotencyKey: row.idempotency_key || undefined,
    type: row.request_type === 'solution_builder' ? 'solution_builder' : 'contact_form',
    fullName: String(row.full_name),
    email: String(row.email),
    contactNumber: String(row.phone),
    company: String(row.organization),
    industry: row.industry || undefined,
    targetTimeline: row.target_timeline || undefined,
    selectedServices,
    selectedServiceIds: selectedServices.map((s: any) => String(s.id)).filter(Boolean),
    selectedOptionsMap,
    serviceId: selectedServices.map((s: any) => String(s.id)).join(', ') || 'general-consultation',
    serviceTitle: selectedServices.map((s: any) => String(s.title)).join(' + ') || 'General Consultation',
    estimatedOneTimeStartingUsd: Number(row.estimated_one_time_usd || 0),
    estimatedMonthlyStartingUsd: Number(row.estimated_monthly_usd || 0),
    estimatedBudget: row.estimated_budget_label || 'Subject to Formal Assessment',
    engagementScope: row.engagement_scope || undefined,
    submissionTimezone: row.submission_timezone || undefined,
    preferredCurrency: row.preferred_currency === 'PHP' ? 'PHP' : 'USD',
    phpConversionRate: row.php_conversion_rate ? Number(row.php_conversion_rate) : undefined,
    projectDescription: String(row.requirements_notes),
    fileName: row.attachment_filename || undefined,
    privacyConsent: Boolean(row.confidentiality_authorized),
    commercialPolicyConsent:
      row.commercial_policy_consent !== undefined
        ? Boolean(row.commercial_policy_consent)
        : Boolean(row.confidentiality_authorized),
    status: row.status || 'submitted',
    emailDeliveryStatus: row.email_delivery_status || 'pending',
    sourceChannel: row.source_channel || 'Public Website',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at || row.created_at),
  };
}

function mapAppointmentRow(row: any): AppointmentRecord {
  return {
    id: String(row.id),
    referenceCode: String(row.reference_code),
    idempotencyKey: row.idempotency_key || undefined,
    fullName: String(row.client_name || 'Client'),
    email: String(row.client_email || ''),
    phone: String(row.client_phone || ''),
    companyName: String(row.client_company || 'Enterprise Client'),
    briefReferenceCode: row.brief_reference_code || undefined,
    executivePathway:
      row.executive_pathway === 'ceo' || row.executive_pathway === 'cto'
        ? row.executive_pathway
        : 'advisory',
    consultationType: row.consultation_type,
    consultationPurpose: row.consultation_purpose || undefined,
    selectedSolution: row.selected_solution || undefined,
    scheduledDate: String(row.scheduled_date),
    scheduledTimeSlot: String(row.scheduled_time_slot),
    utcScheduledAt: row.utc_scheduled_at || undefined,
    durationMinutes: Number(row.duration_minutes || 30),
    clientTimezone: String(row.client_timezone || 'America/Denver'),
    meetingLink: row.meeting_link || undefined,
    meetingLocation: row.meeting_location || undefined,
    assignedConsultant: String(row.assigned_consultant || 'DESTRIA TECH INC Solutions Architecture Team'),
    status: row.status || 'pending_review',
    calendarSyncStatus: row.calendar_sync_status || 'unconfigured',
    calendarEventId: row.calendar_event_id || undefined,
    managementTokenHash: row.management_token_hash || undefined,
    sourceChannel: row.source_channel || 'Public Website',
    availabilityVerified:
      row.availability_verified !== undefined ? Boolean(row.availability_verified) : true,
    notes: row.notes || undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at || row.created_at),
  };
}

function mapOutboxRow(row: any): EmailOutboxRecord {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: String(row.id),
    dedupeKey: String(row.dedupe_key),
    entityType: row.entity_type,
    entityReference: String(row.entity_reference),
    recipientEmail: String(row.recipient_email),
    replyTo: row.reply_to || (typeof meta.replyTo === 'string' ? meta.replyTo : undefined),
    idempotencyKey:
      row.idempotency_key || (typeof meta.idempotencyKey === 'string' ? meta.idempotencyKey : undefined),
    requestSource:
      row.request_source || (typeof meta.requestSource === 'string' ? meta.requestSource : undefined),
    notificationType: row.notification_type,
    subject: String(row.subject),
    htmlBody: String(row.html_body),
    textBody: String(row.text_body),
    status: row.status,
    provider: String(row.provider || 'resend'),
    providerReference: row.provider_reference || undefined,
    deliveryAttempts: Number(row.delivery_attempts || 0),
    lastError: row.last_error || undefined,
    nextRetryAt: row.next_retry_at || undefined,
    lastAttemptAt:
      row.last_attempt_at || (typeof meta.lastAttemptAt === 'string' ? meta.lastAttemptAt : undefined),
    providerAcceptedAt:
      row.provider_accepted_at ||
      (typeof meta.providerAcceptedAt === 'string' ? meta.providerAcceptedAt : undefined),
    deliveredAt:
      row.delivered_at || (typeof meta.deliveredAt === 'string' ? meta.deliveredAt : undefined),
    sentAt: row.sent_at || undefined,
    claimedBy: row.claimed_by || undefined,
    claimedAt: row.claimed_at || undefined,
    leaseExpiresAt: row.lease_expires_at || undefined,
    eventRevision: row.event_revision !== undefined ? Number(row.event_revision) : 1,
    deadLetteredAt: row.dead_lettered_at || undefined,
    bouncedAt: row.bounced_at || undefined,
    complainedAt: row.complained_at || undefined,
    deliveryDelayedAt: row.delivery_delayed_at || undefined,
    lastWebhookEventId: row.last_webhook_event_id || undefined,
    lastWebhookEventAt: row.last_webhook_event_at || undefined,
    metadata: meta,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at || row.created_at),
  };
}

function mapWebhookEventRow(row: any): NotificationWebhookEventRecord {
  return {
    id: String(row.id),
    provider: String(row.provider || 'resend'),
    providerEventId: String(row.provider_event_id),
    eventType: String(row.event_type),
    providerMessageId: row.provider_message_id || undefined,
    eventTimestampUtc: String(row.event_timestamp_utc),
    reconciled: Boolean(row.reconciled),
    outboxId: row.outbox_id ? String(row.outbox_id) : undefined,
    payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
    receivedAt: String(row.received_at),
    reconciledAt: row.reconciled_at || undefined,
  };
}

function buildSolutionRequestDbPayload(input: CreateSolutionRequestInput): Record<string, unknown> {
  return {
    reference_code: input.referenceCode,
    idempotency_key: input.idempotencyKey || null,
    request_type: input.type,
    full_name: input.fullName,
    email: input.email,
    phone: input.contactNumber,
    organization: input.company,
    industry: input.industry || null,
    target_timeline: input.targetTimeline || null,
    selected_services_json: input.selectedServices,
    selected_options_json: input.selectedOptionsMap,
    estimated_one_time_usd: input.estimatedOneTimeStartingUsd,
    estimated_monthly_usd: input.estimatedMonthlyStartingUsd,
    preferred_currency: input.preferredCurrency,
    php_conversion_rate: input.phpConversionRate || null,
    estimated_budget_label: input.estimatedBudget,
    engagement_scope: input.engagementScope || null,
    submission_timezone: input.submissionTimezone || null,
    requirements_notes: input.projectDescription,
    attachment_filename: input.fileName || null,
    confidentiality_authorized: input.privacyConsent,
    commercial_policy_consent: Boolean(input.commercialPolicyConsent ?? input.privacyConsent),
    status: 'submitted',
    email_delivery_status: 'pending',
    source_channel: input.sourceChannel || 'Public Website',
    client_ip: input.clientIp || null,
  };
}

function buildAppointmentDbPayload(input: CreateAppointmentInput): Record<string, unknown> {
  return {
    reference_code: input.referenceCode,
    idempotency_key: input.idempotencyKey || null,
    client_name: input.fullName,
    client_email: input.email,
    client_phone: input.phone,
    client_company: input.companyName,
    brief_reference_code: input.briefReferenceCode || null,
    executive_pathway: input.executivePathway || 'advisory',
    consultation_type: input.consultationType,
    consultation_purpose: input.consultationPurpose || null,
    selected_solution: input.selectedSolution || null,
    scheduled_date: input.scheduledDate,
    scheduled_time_slot: input.scheduledTimeSlot,
    utc_scheduled_at: input.utcScheduledAt || null,
    duration_minutes: input.durationMinutes,
    client_timezone: input.clientTimezone,
    meeting_link: input.meetingLink || null,
    meeting_location: input.meetingLocation || null,
    assigned_consultant: input.assignedConsultant,
    status: input.status,
    calendar_sync_status: input.calendarSyncStatus,
    calendar_event_id: input.calendarEventId || null,
    management_token_hash: input.managementTokenHash,
    source_channel: input.sourceChannel || 'Public Website',
    availability_verified: input.availabilityVerified ?? true,
    notes: input.notes || null,
  };
}

function buildOutboxDbPayload(input: CreateOutboxInput): Record<string, unknown> {
  const enrichedMeta: Record<string, unknown> = {
    ...(input.metadata || {}),
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    ...(input.requestSource ? { requestSource: input.requestSource } : {}),
  };
  return {
    dedupe_key: input.dedupeKey,
    entity_type: input.entityType,
    entity_reference: input.entityReference,
    recipient_email: input.recipientEmail,
    reply_to: input.replyTo || null,
    idempotency_key: input.idempotencyKey || null,
    request_source: input.requestSource || null,
    notification_type: input.notificationType,
    subject: input.subject,
    html_body: input.htmlBody,
    text_body: input.textBody,
    status: 'queued',
    provider: 'resend',
    delivery_attempts: 0,
    event_revision: input.eventRevision ?? 1,
    metadata: enrichedMeta,
  };
}

export class SupabaseDatabaseRepository implements DatabaseRepository {
  public readonly isConfigured: boolean;
  private readonly client: SupabaseClient | null;

  constructor(supabaseUrl?: string, serviceRoleKey?: string) {
    const url = (supabaseUrl || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
    const key = (serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    this.isConfigured = Boolean(url && key && !url.includes('your-ompnetwork-id'));
    this.client = this.isConfigured
      ? createClient(url, key, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        })
      : null;
  }

  private getClient(): SupabaseClient {
    if (!this.client) {
      throw new DatabaseUnavailableError(
        'PostgreSQL/Supabase persistence is not configured on this server. Request could not be saved.'
      );
    }
    return this.client;
  }

  async ping(): Promise<{ ok: boolean; configured: boolean; latencyMs?: number; error?: string }> {
    if (!this.client) {
      return {
        ok: false,
        configured: false,
        error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured.',
      };
    }
    const start = Date.now();
    try {
      const { error } = await this.client.from('solution_requests').select('id', { count: 'exact', head: true }).limit(1);
      if (error) {
        return {
          ok: false,
          configured: true,
          latencyMs: Date.now() - start,
          error: error.message,
        };
      }
      return { ok: true, configured: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      return {
        ok: false,
        configured: true,
        latencyMs: Date.now() - start,
        error: err?.message || 'Database ping failed',
      };
    }
  }

  async findSolutionRequestByIdempotencyKey(key: string): Promise<SolutionRequestRecord | null> {
    const db = this.getClient();
    const { data, error } = await db
      .from('solution_requests')
      .select('*')
      .eq('idempotency_key', key)
      .maybeSingle();

    if (error) {
      throw new DatabaseUnavailableError(`Failed to query idempotency key: ${error.message}`);
    }
    return data ? mapSolutionRequestRow(data) : null;
  }

  async createSolutionRequest(input: CreateSolutionRequestInput): Promise<{
    record: SolutionRequestRecord;
    created: boolean;
  }> {
    const db = this.getClient();

    if (input.idempotencyKey) {
      const existing = await this.findSolutionRequestByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return { record: existing, created: false };
      }
    }

    const { data, error } = await db
      .from('solution_requests')
      .insert(buildSolutionRequestDbPayload(input))
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505' && input.idempotencyKey) {
        const raced = await this.findSolutionRequestByIdempotencyKey(input.idempotencyKey);
        if (raced) return { record: raced, created: false };
      }
      throw new DatabaseUnavailableError(`Failed to persist solution request: ${error.message}`);
    }

    return { record: mapSolutionRequestRow(data), created: true };
  }

  /**
   * ERR-010: Atomic transactional persistence of solution request + outbox notifications via PostgreSQL RPC.
   * Falls back cleanly to createSolutionRequest + atomic createOutboxRecord when migration 005 RPC is not yet deployed.
   */
  async createSolutionRequestWithOutbox(
    input: CreateSolutionRequestInput,
    outboxItems: CreateOutboxInput[]
  ): Promise<{
    record: SolutionRequestRecord;
    created: boolean;
    outboxRecords: EmailOutboxRecord[];
  }> {
    const db = this.getClient();
    const { data: rpcData, error: rpcError } = await db.rpc('register_solution_request_with_outbox', {
      p_request: buildSolutionRequestDbPayload(input),
      p_outbox_items: outboxItems.map(buildOutboxDbPayload),
    });

    if (!rpcError && rpcData && rpcData.record) {
      const record = mapSolutionRequestRow(rpcData.record);
      const created = Boolean(rpcData.created);
      const outboxRecords = await this.listOutboxByEntity('solution_request', record.referenceCode);
      return { record, created, outboxRecords };
    }

    // Fallback if migration 005 RPC has not been applied yet on target environment
    const isMissingRpc =
      rpcError &&
      (rpcError.code === 'PGRST202' ||
        rpcError.code === '42883' ||
        /function.*register_solution_request_with_outbox/i.test(rpcError.message || ''));

    if (rpcError && !isMissingRpc) {
      throw new DatabaseUnavailableError(`Transactional solution request persistence failed: ${rpcError.message}`);
    }

    const { record, created } = await this.createSolutionRequest(input);
    const outboxRecords: EmailOutboxRecord[] = [];
    if (created) {
      for (const item of outboxItems) {
        const res = await this.createOutboxRecord(item);
        outboxRecords.push(res.record);
      }
    } else {
      return {
        record,
        created: false,
        outboxRecords: await this.listOutboxByEntity('solution_request', record.referenceCode),
      };
    }
    return { record, created, outboxRecords };
  }

  async updateSolutionRequestEmailStatus(
    referenceCode: string,
    emailDeliveryStatus: 'pending' | 'sent' | 'failed' | 'unconfigured'
  ): Promise<void> {
    const db = this.getClient();
    const { error } = await db
      .from('solution_requests')
      .update({ email_delivery_status: emailDeliveryStatus, updated_at: new Date().toISOString() })
      .eq('reference_code', referenceCode);

    if (error) {
      throw new DatabaseUnavailableError(`Failed to update email delivery status: ${error.message}`);
    }
  }

  async listSolutionRequests(options: {
    limit: number;
    offset: number;
    status?: string;
  }): Promise<{ records: SolutionRequestRecord[]; total: number }> {
    const db = this.getClient();
    let query = db
      .from('solution_requests')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(options.offset, options.offset + options.limit - 1);

    if (options.status) {
      query = query.eq('status', options.status);
    }

    const { data, count, error } = await query;
    if (error) {
      throw new DatabaseUnavailableError(`Failed to list solution requests: ${error.message}`);
    }
    return {
      records: (data || []).map(mapSolutionRequestRow),
      total: Number(count ?? (data || []).length),
    };
  }

  async getBookedSlotsForDate(scheduledDate: string): Promise<string[]> {
    const db = this.getClient();
    const { data, error } = await db
      .from('consultation_appointments')
      .select('scheduled_time_slot')
      .eq('scheduled_date', scheduledDate)
      .in('status', ['pending_review', 'confirmed']);

    if (error) {
      throw new DatabaseUnavailableError(`Failed to inspect booked appointment slots: ${error.message}`);
    }
    return (data || []).map((r: any) => String(r.scheduled_time_slot));
  }

  async createAppointment(input: CreateAppointmentInput): Promise<{
    record: AppointmentRecord;
    created: boolean;
  }> {
    const db = this.getClient();

    if (input.idempotencyKey) {
      const { data: existing, error: idempErr } = await db
        .from('consultation_appointments')
        .select('*')
        .eq('idempotency_key', input.idempotencyKey)
        .maybeSingle();
      if (idempErr) {
        throw new DatabaseUnavailableError(`Failed to verify appointment idempotency: ${idempErr.message}`);
      }
      if (existing) {
        return { record: mapAppointmentRow(existing), created: false };
      }
    }

    const { data, error } = await db
      .from('consultation_appointments')
      .insert(buildAppointmentDbPayload(input))
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        // ERR-012: Distinguish concurrent idempotency_key collision from genuine slot conflict
        if (input.idempotencyKey) {
          const { data: raced } = await db
            .from('consultation_appointments')
            .select('*')
            .eq('idempotency_key', input.idempotencyKey)
            .maybeSingle();
          if (raced) {
            return { record: mapAppointmentRow(raced), created: false };
          }
        }
        throw new ConflictError(
          `The slot ${input.scheduledTimeSlot} on ${input.scheduledDate} has just been reserved. Please select another slot.`
        );
      }
      throw new DatabaseUnavailableError(`Failed to persist consultation request: ${error.message}`);
    }

    return { record: mapAppointmentRow(data), created: true };
  }

  /**
   * ERR-010: Atomic transactional persistence of appointment + outbox notifications via PostgreSQL RPC.
   */
  async createAppointmentWithOutbox(
    input: CreateAppointmentInput,
    outboxItems: CreateOutboxInput[]
  ): Promise<{
    record: AppointmentRecord;
    created: boolean;
    outboxRecords: EmailOutboxRecord[];
  }> {
    const db = this.getClient();
    const { data: rpcData, error: rpcError } = await db.rpc('register_appointment_with_outbox', {
      p_appointment: buildAppointmentDbPayload(input),
      p_outbox_items: outboxItems.map(buildOutboxDbPayload),
    });

    if (!rpcError && rpcData && rpcData.record) {
      const record = mapAppointmentRow(rpcData.record);
      const created = Boolean(rpcData.created);
      const outboxRecords = await this.listOutboxByEntity('appointment', record.referenceCode);
      return { record, created, outboxRecords };
    }

    if (rpcError?.code === '23505') {
      throw new ConflictError(
        `The slot ${input.scheduledTimeSlot} on ${input.scheduledDate} has just been reserved. Please select another slot.`
      );
    }

    const isMissingRpc =
      rpcError &&
      (rpcError.code === 'PGRST202' ||
        rpcError.code === '42883' ||
        /function.*register_appointment_with_outbox/i.test(rpcError.message || ''));

    if (rpcError && !isMissingRpc) {
      throw new DatabaseUnavailableError(`Transactional appointment persistence failed: ${rpcError.message}`);
    }

    const { record, created } = await this.createAppointment(input);
    const outboxRecords: EmailOutboxRecord[] = [];
    if (created) {
      for (const item of outboxItems) {
        const res = await this.createOutboxRecord(item);
        outboxRecords.push(res.record);
      }
    } else {
      return {
        record,
        created: false,
        outboxRecords: await this.listOutboxByEntity('appointment', record.referenceCode),
      };
    }
    return { record, created, outboxRecords };
  }

  async getAppointmentByReference(referenceCode: string): Promise<AppointmentRecord | null> {
    const db = this.getClient();
    const { data, error } = await db
      .from('consultation_appointments')
      .select('*')
      .eq('reference_code', referenceCode)
      .maybeSingle();

    if (error) {
      throw new DatabaseUnavailableError(`Failed to retrieve appointment: ${error.message}`);
    }
    return data ? mapAppointmentRow(data) : null;
  }

  async updateAppointment(
    referenceCode: string,
    patch: Partial<
      Pick<
        AppointmentRecord,
        'scheduledDate' | 'scheduledTimeSlot' | 'status' | 'meetingLink' | 'calendarSyncStatus' | 'calendarEventId' | 'notes'
      >
    >
  ): Promise<AppointmentRecord> {
    const db = this.getClient();
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.scheduledDate !== undefined) updatePayload.scheduled_date = patch.scheduledDate;
    if (patch.scheduledTimeSlot !== undefined) updatePayload.scheduled_time_slot = patch.scheduledTimeSlot;
    if (patch.status !== undefined) updatePayload.status = patch.status;
    if (patch.meetingLink !== undefined) updatePayload.meeting_link = patch.meetingLink;
    if (patch.calendarSyncStatus !== undefined) updatePayload.calendar_sync_status = patch.calendarSyncStatus;
    if (patch.calendarEventId !== undefined) updatePayload.calendar_event_id = patch.calendarEventId;
    if (patch.notes !== undefined) updatePayload.notes = patch.notes;

    const { data, error } = await db
      .from('consultation_appointments')
      .update(updatePayload)
      .eq('reference_code', referenceCode)
      .select('*')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictError('Requested replacement slot is already booked.');
      }
      throw new DatabaseUnavailableError(`Failed to update appointment: ${error.message}`);
    }
    if (!data) {
      throw new NotFoundError(`Appointment ${referenceCode} not found.`);
    }
    return mapAppointmentRow(data);
  }

  async listAppointments(options: { limit: number; offset: number }): Promise<{
    records: AppointmentRecord[];
    total: number;
  }> {
    const db = this.getClient();
    const { data, count, error } = await db
      .from('consultation_appointments')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(options.offset, options.offset + options.limit - 1);

    if (error) {
      throw new DatabaseUnavailableError(`Failed to list appointments: ${error.message}`);
    }
    return {
      records: (data || []).map(mapAppointmentRow),
      total: Number(count ?? (data || []).length),
    };
  }

  /**
   * ERR-012: Eliminates read-before-insert concurrency races via atomic INSERT + 23505 conflict recovery.
   */
  async createOutboxRecord(input: CreateOutboxInput): Promise<{ record: EmailOutboxRecord; created: boolean }> {
    const db = this.getClient();

    const { data, error } = await db
      .from('notification_records')
      .insert(buildOutboxDbPayload(input))
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        const { data: raced, error: selectErr } = await db
          .from('notification_records')
          .select('*')
          .eq('dedupe_key', input.dedupeKey)
          .maybeSingle();
        if (!selectErr && raced) {
          return { record: mapOutboxRow(raced), created: false };
        }
      }
      throw new DatabaseUnavailableError(`Failed to enqueue notification outbox: ${error.message}`);
    }
    return { record: mapOutboxRow(data), created: true };
  }

  async updateOutboxStatus(id: string, patch: UpdateOutboxPatch): Promise<void> {
    const db = this.getClient();
    const updatePayload: Record<string, unknown> = {
      status: patch.status,
      delivery_attempts: patch.deliveryAttempts,
      updated_at: new Date().toISOString(),
    };
    if (patch.lastError !== undefined) {
      updatePayload.last_error = patch.lastError || null;
    }
    if (patch.nextRetryAt !== undefined) {
      updatePayload.next_retry_at = patch.nextRetryAt || null;
    }
    if (patch.providerReference !== undefined) {
      updatePayload.provider_reference = patch.providerReference || null;
    }
    if (patch.sentAt !== undefined) {
      updatePayload.sent_at = patch.sentAt || null;
    }
    if (patch.lastAttemptAt !== undefined) {
      updatePayload.last_attempt_at = patch.lastAttemptAt || null;
    }
    if (patch.providerAcceptedAt !== undefined) {
      updatePayload.provider_accepted_at = patch.providerAcceptedAt || null;
    }
    if (patch.deliveredAt !== undefined) {
      updatePayload.delivered_at = patch.deliveredAt || null;
    }
    if (patch.claimedBy !== undefined) {
      updatePayload.claimed_by = patch.claimedBy;
    }
    if (patch.claimedAt !== undefined) {
      updatePayload.claimed_at = patch.claimedAt;
    }
    if (patch.leaseExpiresAt !== undefined) {
      updatePayload.lease_expires_at = patch.leaseExpiresAt;
    }
    if (patch.deadLetteredAt !== undefined) {
      updatePayload.dead_lettered_at = patch.deadLetteredAt;
    }
    if (patch.bouncedAt !== undefined) {
      updatePayload.bounced_at = patch.bouncedAt;
    }
    if (patch.complainedAt !== undefined) {
      updatePayload.complained_at = patch.complainedAt;
    }
    if (patch.deliveryDelayedAt !== undefined) {
      updatePayload.delivery_delayed_at = patch.deliveryDelayedAt;
    }
    if (patch.lastWebhookEventId !== undefined) {
      updatePayload.last_webhook_event_id = patch.lastWebhookEventId;
    }
    if (patch.lastWebhookEventAt !== undefined) {
      updatePayload.last_webhook_event_at = patch.lastWebhookEventAt;
    }

    const { error } = await db
      .from('notification_records')
      .update(updatePayload)
      .eq('id', id);

    if (error) {
      throw new DatabaseUnavailableError(`Failed to update outbox status: ${error.message}`);
    }
  }

  async listRetryableOutbox(limit = 20): Promise<EmailOutboxRecord[]> {
    const db = this.getClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await db
      .from('notification_records')
      .select('*')
      .in('status', ['queued', 'failed', 'retry_scheduled'])
      .lt('delivery_attempts', 5)
      .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      throw new DatabaseUnavailableError(`Failed to list retryable outbox records: ${error.message}`);
    }
    return (data || []).map(mapOutboxRow);
  }

  /**
   * ERR-002: Atomic multi-worker notification queue claiming via FOR UPDATE SKIP LOCKED RPC,
   * with lease expiration & stale claim recovery.
   */
  async claimRetryableOutbox(
    workerId: string,
    limit = 20,
    leaseSeconds = 120
  ): Promise<EmailOutboxRecord[]> {
    const db = this.getClient();
    const { data, error } = await db.rpc('claim_retryable_notifications', {
      p_worker_id: workerId,
      p_limit: limit,
      p_lease_seconds: leaseSeconds,
    });

    if (!error && Array.isArray(data)) {
      return data.map(mapOutboxRow);
    }

    const isMissingRpc =
      error &&
      (error.code === 'PGRST202' ||
        error.code === '42883' ||
        /function.*claim_retryable_notifications/i.test(error.message || ''));

    if (error && !isMissingRpc) {
      throw new DatabaseUnavailableError(`Failed to atomically claim notification outbox: ${error.message}`);
    }

    // Optimistic compare-and-swap fallback if migration 005 RPC is not yet deployed
    const candidates = await this.listRetryableOutbox(limit);
    const claimed: EmailOutboxRecord[] = [];
    const nowIso = new Date().toISOString();
    const leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();

    for (const candidate of candidates) {
      const { data: locked } = await db
        .from('notification_records')
        .update({
          status: 'processing',
          claimed_by: workerId,
          claimed_at: nowIso,
          lease_expires_at: leaseExpiresAt,
          updated_at: nowIso,
        })
        .eq('id', candidate.id)
        .in('status', ['queued', 'failed', 'retry_scheduled'])
        .select('*')
        .maybeSingle();

      if (locked) {
        claimed.push(mapOutboxRow(locked));
      }
    }

    return claimed;
  }

  async findOutboxByProviderReference(providerReference: string): Promise<EmailOutboxRecord | null> {
    const db = this.getClient();
    const { data, error } = await db
      .from('notification_records')
      .select('*')
      .eq('provider_reference', providerReference)
      .maybeSingle();

    if (error) {
      throw new DatabaseUnavailableError(`Failed to query outbox by provider reference: ${error.message}`);
    }
    return data ? mapOutboxRow(data) : null;
  }

  async getOutboxById(id: string): Promise<EmailOutboxRecord | null> {
    const db = this.getClient();
    const { data, error } = await db
      .from('notification_records')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new DatabaseUnavailableError(`Failed to query outbox by ID: ${error.message}`);
    }
    return data ? mapOutboxRow(data) : null;
  }

  async listOutboxByEntity(
    entityType: 'solution_request' | 'appointment',
    entityReference: string
  ): Promise<EmailOutboxRecord[]> {
    const db = this.getClient();
    const { data, error } = await db
      .from('notification_records')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_reference', entityReference)
      .order('created_at', { ascending: true });

    if (error) {
      throw new DatabaseUnavailableError(`Failed to list entity outbox records: ${error.message}`);
    }
    return (data || []).map(mapOutboxRow);
  }

  async listOutboxRecords(options: {
    limit: number;
    offset: number;
    status?: string;
    entityReference?: string;
  }): Promise<{ records: EmailOutboxRecord[]; total: number }> {
    const db = this.getClient();
    let query = db
      .from('notification_records')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(options.offset, options.offset + options.limit - 1);

    if (options.status) {
      query = query.eq('status', options.status);
    }
    if (options.entityReference) {
      query = query.eq('entity_reference', options.entityReference);
    }

    const { data, count, error } = await query;
    if (error) {
      throw new DatabaseUnavailableError(`Failed to list notification outbox records: ${error.message}`);
    }
    return {
      records: (data || []).map(mapOutboxRow),
      total: Number(count ?? (data || []).length),
    };
  }

  async recordWebhookEventOnce(input: {
    provider: string;
    providerEventId: string;
    eventType: string;
    providerMessageId?: string;
    eventTimestampUtc: string;
    payload: Record<string, unknown>;
  }): Promise<{ record: NotificationWebhookEventRecord; inserted: boolean }> {
    const db = this.getClient();
    const { data, error } = await db
      .from('notification_webhook_events')
      .insert({
        provider: input.provider,
        provider_event_id: input.providerEventId,
        event_type: input.eventType,
        provider_message_id: input.providerMessageId || null,
        event_timestamp_utc: input.eventTimestampUtc,
        reconciled: false,
        payload: input.payload,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        const { data: existing } = await db
          .from('notification_webhook_events')
          .select('*')
          .eq('provider', input.provider)
          .eq('provider_event_id', input.providerEventId)
          .maybeSingle();
        if (existing) {
          return { record: mapWebhookEventRow(existing), inserted: false };
        }
      }
      throw new DatabaseUnavailableError(`Failed to persist notification webhook event: ${error.message}`);
    }
    return { record: mapWebhookEventRow(data), inserted: true };
  }

  async listPendingWebhookEventsByMessageId(
    providerMessageId: string
  ): Promise<NotificationWebhookEventRecord[]> {
    const db = this.getClient();
    const { data, error } = await db
      .from('notification_webhook_events')
      .select('*')
      .eq('provider_message_id', providerMessageId)
      .eq('reconciled', false)
      .order('event_timestamp_utc', { ascending: true });

    if (error) {
      throw new DatabaseUnavailableError(`Failed to query pending webhook events: ${error.message}`);
    }
    return (data || []).map(mapWebhookEventRow);
  }

  async markWebhookEventReconciled(eventId: string, outboxId: string): Promise<void> {
    const db = this.getClient();
    const { error } = await db
      .from('notification_webhook_events')
      .update({
        reconciled: true,
        outbox_id: outboxId,
        reconciled_at: new Date().toISOString(),
      })
      .eq('id', eventId);

    if (error) {
      throw new DatabaseUnavailableError(`Failed to mark webhook event reconciled: ${error.message}`);
    }
  }

  async writeAuditLog(input: Omit<AuditLogRecord, 'id' | 'createdAt'>): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.from('audit_logs').insert({
        correlation_id: input.correlationId || null,
        actor: input.actor,
        actor_role: input.actorRole,
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId || null,
        details: input.details || {},
      });
    } catch {
      // Audit log persistence errors are logged by caller without masking primary response
    }
  }

  async listAuditLogs(options: { limit: number; offset: number }): Promise<{
    records: AuditLogRecord[];
    total: number;
  }> {
    const db = this.getClient();
    const { data, count, error } = await db
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(options.offset, options.offset + options.limit - 1);

    if (error) {
      throw new DatabaseUnavailableError(`Failed to list audit logs: ${error.message}`);
    }

    return {
      records: (data || []).map((row: any) => ({
        id: String(row.id),
        correlationId: row.correlation_id || undefined,
        actor: String(row.actor),
        actorRole: String(row.actor_role || 'system'),
        action: String(row.action),
        entityType: String(row.entity_type),
        entityId: row.entity_id || undefined,
        details: row.details || {},
        createdAt: String(row.created_at),
      })),
      total: Number(count ?? (data || []).length),
    };
  }

  async findActiveAdminByEmail(email: string, authUserId?: string): Promise<AdminUserRecord | null> {
    const normalized = email.trim().toLowerCase();
    // Allowlist bootstrap admin email from server-only env when matching admin_users table or configured env bootstrap
    if (this.client) {
      let query = this.client
        .from('admin_users')
        .select('*')
        .eq('is_active', true);

      if (authUserId) {
        query = query.or(`auth_user_id.eq.${authUserId},email.ilike.${normalized}`);
      } else {
        query = query.ilike('email', normalized);
      }

      const { data, error } = await query.maybeSingle();
      if (!error && data) {
        return {
          id: String(data.id),
          email: String(data.email),
          fullName: String(data.full_name),
          role: data.role === 'super_admin' ? 'super_admin' : 'admin',
          isActive: Boolean(data.is_active),
        };
      }
    }

    const bootstrapEmail = (process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
    const envAllowlist = (process.env.ADMIN_ALLOWLIST_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (
      normalized &&
      ((bootstrapEmail && normalized === bootstrapEmail) || envAllowlist.includes(normalized))
    ) {
      return {
        id: 'env-bootstrap-admin',
        email: normalized,
        fullName: 'DESTRIA TECH INC Administrator',
        role: 'super_admin',
        isActive: true,
      };
    }

    return null;
  }

  async verifySupabaseUserToken(token: string): Promise<{ id: string; email: string } | null> {
    if (!this.client || !token) return null;
    try {
      const { data, error } = await this.client.auth.getUser(token);
      if (error || !data?.user?.email) return null;
      return {
        id: data.user.id,
        email: data.user.email,
      };
    } catch {
      return null;
    }
  }

  async revokeAdminSessionToken(input: {
    jti: string;
    adminEmail: string;
    expiresAtIso: string;
    reason?: string;
  }): Promise<void> {
    if (!this.client || !input.jti) return;
    const { error } = await this.client.from('admin_revoked_sessions').upsert(
      {
        jti: input.jti,
        admin_email: input.adminEmail.trim().toLowerCase(),
        expires_at: input.expiresAtIso,
        reason: input.reason || 'logout',
      },
      { onConflict: 'jti' }
    );
    if (error) {
      throw new DatabaseUnavailableError(`Failed to persist revoked admin session token: ${error.message}`);
    }
  }

  async isAdminSessionTokenRevoked(jti: string): Promise<boolean> {
    if (!this.client || !jti) return false;
    const { data, error } = await this.client
      .from('admin_revoked_sessions')
      .select('jti, expires_at')
      .eq('jti', jti)
      .maybeSingle();
    if (error) {
      const isMissingTable =
        error.code === '42P01' || /relation.*admin_revoked_sessions.*does not exist/i.test(error.message || '');
      if (isMissingTable) return false;
      throw new DatabaseUnavailableError(`Failed to verify admin session revocation status: ${error.message}`);
    }
    return Boolean(data);
  }
}
