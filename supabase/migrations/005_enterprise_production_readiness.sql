-- ============================================================================
-- DESTRIA TECH INC — Additive Migration 005
-- Enterprise Production Readiness:
--   1. Atomic Notification Queue Claiming (FOR UPDATE SKIP LOCKED + Lease Recovery)
--   2. Durable Webhook Deduplication & Out-of-Order / Pending Reconciliation
--   3. Transactional Request + Outbox Registration RPCs (ACID)
--   4. Authorized Payment Refund Ledger (Integer Minor Units, Idempotent)
-- Strictly additive & idempotent (safe to re-run on live PostgreSQL/Supabase)
-- ============================================================================

-- 1. Extend notification_records for atomic worker leases, dead-lettering,
--    distinct provider_accepted vs webhook-confirmed delivered states, and bounce/complaint tracking.
ALTER TABLE public.notification_records
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS event_revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS complained_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_delayed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_webhook_event_id text,
  ADD COLUMN IF NOT EXISTS last_webhook_event_at timestamptz;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'notification_records'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.notification_records DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.notification_records
  ADD CONSTRAINT notification_records_status_check
  CHECK (
    status IN (
      'queued',
      'processing',
      'provider_accepted',
      'sent',
      'delivered',
      'delivery_delayed',
      'retry_scheduled',
      'failed',
      'bounced',
      'complained',
      'dead_letter',
      'unconfigured'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_records_dedupe_key_unique
  ON public.notification_records (dedupe_key);

CREATE INDEX IF NOT EXISTS idx_notification_records_claimable
  ON public.notification_records (status, next_retry_at, lease_expires_at, created_at)
  WHERE status IN ('queued', 'failed', 'retry_scheduled', 'processing');

CREATE INDEX IF NOT EXISTS idx_notification_records_status_created
  ON public.notification_records (status, created_at DESC);

-- 2. Partial unique indexes for idempotent inquiry & consultation submission
CREATE UNIQUE INDEX IF NOT EXISTS idx_solution_requests_idempotency_key
  ON public.solution_requests (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_consultation_appointments_idempotency_key
  ON public.consultation_appointments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3. Durable notification webhook event deduplication & pending reconciliation table
CREATE TABLE IF NOT EXISTS public.notification_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'resend',
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  provider_message_id text,
  event_timestamp_utc timestamptz NOT NULL,
  reconciled boolean NOT NULL DEFAULT false,
  outbox_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  reconciled_at timestamptz,
  CONSTRAINT notification_webhook_events_provider_event_unique UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_webhook_events_pending_msg
  ON public.notification_webhook_events (provider_message_id)
  WHERE reconciled = false AND provider_message_id IS NOT NULL;

ALTER TABLE public.notification_webhook_events ENABLE ROW LEVEL SECURITY;

-- 4. Durable authorized payment refund ledger (integer minor currency units)
CREATE TABLE IF NOT EXISTS public.portal_payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id text NOT NULL,
  order_id text NOT NULL,
  provider text NOT NULL,
  provider_transaction_id text,
  provider_refund_id text,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency IN ('USD', 'PHP')),
  reason text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  idempotency_key text NOT NULL UNIQUE,
  requested_by text NOT NULL,
  approved_by text,
  provider_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_payment_refunds_payment_id
  ON public.portal_payment_refunds (payment_id, created_at DESC);

ALTER TABLE public.portal_payment_refunds ENABLE ROW LEVEL SECURITY;

-- 5. Atomic notification queue claim RPC using FOR UPDATE SKIP LOCKED
--    Claims due queued/retry_scheduled/failed rows (< 5 attempts) AND recovers expired processing leases.
--    Never claims bounced, complained, delivered, provider_accepted, or dead_letter rows.
CREATE OR REPLACE FUNCTION public.claim_retryable_notifications(
  p_worker_id text,
  p_limit integer DEFAULT 20,
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.notification_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_lease_until timestamptz := v_now + make_interval(secs => GREATEST(15, LEAST(COALESCE(p_lease_seconds, 120), 900)));
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT nr.id
    FROM public.notification_records nr
    WHERE (
      (
        nr.status IN ('queued', 'failed', 'retry_scheduled')
        AND nr.delivery_attempts < 5
        AND (nr.next_retry_at IS NULL OR nr.next_retry_at <= v_now)
      )
      OR (
        nr.status = 'processing'
        AND nr.lease_expires_at IS NOT NULL
        AND nr.lease_expires_at <= v_now
        AND nr.delivery_attempts < 5
      )
    )
    ORDER BY nr.created_at ASC
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.notification_records nr
  SET
    status = 'processing',
    claimed_by = p_worker_id,
    claimed_at = v_now,
    lease_expires_at = v_lease_until,
    updated_at = v_now
  FROM candidate
  WHERE nr.id = candidate.id
  RETURNING nr.*;
END;
$$;

-- 6. Atomic transactional registration of solution request + outbox records
CREATE OR REPLACE FUNCTION public.register_solution_request_with_outbox(
  p_request jsonb,
  p_outbox_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.solution_requests%ROWTYPE;
  v_inserted public.solution_requests%ROWTYPE;
  v_created boolean := false;
  v_idemp text := NULLIF(BTRIM(COALESCE(p_request->>'idempotency_key', '')), '');
  v_item jsonb;
  v_outbox_count integer := 0;
BEGIN
  IF v_idemp IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.solution_requests
    WHERE idempotency_key = v_idemp
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'created', false,
        'record', to_jsonb(v_existing),
        'enqueued_outbox_count', 0
      );
    END IF;
  END IF;

  INSERT INTO public.solution_requests (
    reference_code,
    idempotency_key,
    request_type,
    full_name,
    email,
    phone,
    organization,
    industry,
    target_timeline,
    selected_services_json,
    selected_options_json,
    estimated_one_time_usd,
    estimated_monthly_usd,
    preferred_currency,
    php_conversion_rate,
    estimated_budget_label,
    engagement_scope,
    submission_timezone,
    requirements_notes,
    attachment_filename,
    confidentiality_authorized,
    commercial_policy_consent,
    status,
    email_delivery_status,
    source_channel,
    client_ip
  )
  VALUES (
    p_request->>'reference_code',
    v_idemp,
    COALESCE(p_request->>'request_type', 'contact_form'),
    p_request->>'full_name',
    p_request->>'email',
    p_request->>'phone',
    p_request->>'organization',
    NULLIF(p_request->>'industry', ''),
    NULLIF(p_request->>'target_timeline', ''),
    COALESCE(p_request->'selected_services_json', '[]'::jsonb),
    COALESCE(p_request->'selected_options_json', '{}'::jsonb),
    COALESCE((p_request->>'estimated_one_time_usd')::numeric, 0),
    COALESCE((p_request->>'estimated_monthly_usd')::numeric, 0),
    COALESCE(p_request->>'preferred_currency', 'USD'),
    NULLIF(p_request->>'php_conversion_rate', '')::numeric,
    COALESCE(p_request->>'estimated_budget_label', 'Subject to Formal Assessment'),
    NULLIF(p_request->>'engagement_scope', ''),
    NULLIF(p_request->>'submission_timezone', ''),
    p_request->>'requirements_notes',
    NULLIF(p_request->>'attachment_filename', ''),
    COALESCE((p_request->>'confidentiality_authorized')::boolean, false),
    COALESCE((p_request->>'commercial_policy_consent')::boolean, false),
    'submitted',
    'pending',
    COALESCE(p_request->>'source_channel', 'Public Website'),
    NULLIF(p_request->>'client_ip', '')
  )
  RETURNING * INTO v_inserted;

  v_created := true;

  IF p_outbox_items IS NOT NULL AND jsonb_typeof(p_outbox_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_outbox_items)
    LOOP
      INSERT INTO public.notification_records (
        dedupe_key,
        entity_type,
        entity_reference,
        recipient_email,
        reply_to,
        idempotency_key,
        request_source,
        notification_type,
        subject,
        html_body,
        text_body,
        status,
        provider,
        delivery_attempts,
        event_revision,
        metadata
      )
      VALUES (
        v_item->>'dedupe_key',
        v_item->>'entity_type',
        v_item->>'entity_reference',
        v_item->>'recipient_email',
        NULLIF(v_item->>'reply_to', ''),
        NULLIF(v_item->>'idempotency_key', ''),
        NULLIF(v_item->>'request_source', ''),
        v_item->>'notification_type',
        v_item->>'subject',
        v_item->>'html_body',
        v_item->>'text_body',
        'queued',
        'resend',
        0,
        COALESCE((v_item->>'event_revision')::integer, 1),
        COALESCE(v_item->'metadata', '{}'::jsonb)
      )
      ON CONFLICT (dedupe_key) DO NOTHING;

      v_outbox_count := v_outbox_count + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'created', v_created,
    'record', to_jsonb(v_inserted),
    'enqueued_outbox_count', v_outbox_count
  );
EXCEPTION
  WHEN unique_violation THEN
    IF v_idemp IS NOT NULL THEN
      SELECT * INTO v_existing
      FROM public.solution_requests
      WHERE idempotency_key = v_idemp
      LIMIT 1;
      IF FOUND THEN
        RETURN jsonb_build_object(
          'created', false,
          'record', to_jsonb(v_existing),
          'enqueued_outbox_count', 0
        );
      END IF;
    END IF;
    RAISE;
END;
$$;

-- 7. Atomic transactional registration of consultation appointment + outbox records
CREATE OR REPLACE FUNCTION public.register_appointment_with_outbox(
  p_appointment jsonb,
  p_outbox_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.consultation_appointments%ROWTYPE;
  v_inserted public.consultation_appointments%ROWTYPE;
  v_idemp text := NULLIF(BTRIM(COALESCE(p_appointment->>'idempotency_key', '')), '');
  v_item jsonb;
  v_outbox_count integer := 0;
BEGIN
  IF v_idemp IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.consultation_appointments
    WHERE idempotency_key = v_idemp
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'created', false,
        'record', to_jsonb(v_existing),
        'enqueued_outbox_count', 0
      );
    END IF;
  END IF;

  INSERT INTO public.consultation_appointments (
    reference_code,
    idempotency_key,
    client_name,
    client_email,
    client_phone,
    client_company,
    brief_reference_code,
    executive_pathway,
    consultation_type,
    consultation_purpose,
    selected_solution,
    scheduled_date,
    scheduled_time_slot,
    utc_scheduled_at,
    duration_minutes,
    client_timezone,
    meeting_link,
    meeting_location,
    assigned_consultant,
    status,
    calendar_sync_status,
    calendar_event_id,
    management_token_hash,
    source_channel,
    availability_verified,
    notes
  )
  VALUES (
    p_appointment->>'reference_code',
    v_idemp,
    p_appointment->>'client_name',
    p_appointment->>'client_email',
    p_appointment->>'client_phone',
    p_appointment->>'client_company',
    NULLIF(p_appointment->>'brief_reference_code', ''),
    COALESCE(p_appointment->>'executive_pathway', 'advisory'),
    p_appointment->>'consultation_type',
    NULLIF(p_appointment->>'consultation_purpose', ''),
    NULLIF(p_appointment->>'selected_solution', ''),
    p_appointment->>'scheduled_date',
    p_appointment->>'scheduled_time_slot',
    NULLIF(p_appointment->>'utc_scheduled_at', ''),
    COALESCE((p_appointment->>'duration_minutes')::integer, 30),
    COALESCE(p_appointment->>'client_timezone', 'America/Denver'),
    NULLIF(p_appointment->>'meeting_link', ''),
    NULLIF(p_appointment->>'meeting_location', ''),
    COALESCE(p_appointment->>'assigned_consultant', 'DESTRIA TECH INC Solutions Architecture Team'),
    COALESCE(p_appointment->>'status', 'pending_review'),
    COALESCE(p_appointment->>'calendar_sync_status', 'unconfigured'),
    NULLIF(p_appointment->>'calendar_event_id', ''),
    p_appointment->>'management_token_hash',
    COALESCE(p_appointment->>'source_channel', 'Public Website'),
    COALESCE((p_appointment->>'availability_verified')::boolean, true),
    NULLIF(p_appointment->>'notes', '')
  )
  RETURNING * INTO v_inserted;

  IF p_outbox_items IS NOT NULL AND jsonb_typeof(p_outbox_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_outbox_items)
    LOOP
      INSERT INTO public.notification_records (
        dedupe_key,
        entity_type,
        entity_reference,
        recipient_email,
        reply_to,
        idempotency_key,
        request_source,
        notification_type,
        subject,
        html_body,
        text_body,
        status,
        provider,
        delivery_attempts,
        event_revision,
        metadata
      )
      VALUES (
        v_item->>'dedupe_key',
        v_item->>'entity_type',
        v_item->>'entity_reference',
        v_item->>'recipient_email',
        NULLIF(v_item->>'reply_to', ''),
        NULLIF(v_item->>'idempotency_key', ''),
        NULLIF(v_item->>'request_source', ''),
        v_item->>'notification_type',
        v_item->>'subject',
        v_item->>'html_body',
        v_item->>'text_body',
        'queued',
        'resend',
        0,
        COALESCE((v_item->>'event_revision')::integer, 1),
        COALESCE(v_item->'metadata', '{}'::jsonb)
      )
      ON CONFLICT (dedupe_key) DO NOTHING;

      v_outbox_count := v_outbox_count + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'created', true,
    'record', to_jsonb(v_inserted),
    'enqueued_outbox_count', v_outbox_count
  );
EXCEPTION
  WHEN unique_violation THEN
    IF v_idemp IS NOT NULL THEN
      SELECT * INTO v_existing
      FROM public.consultation_appointments
      WHERE idempotency_key = v_idemp
      LIMIT 1;
      IF FOUND THEN
        RETURN jsonb_build_object(
          'created', false,
          'record', to_jsonb(v_existing),
          'enqueued_outbox_count', 0
        );
      END IF;
    END IF;
    RAISE;
END;
$$;
