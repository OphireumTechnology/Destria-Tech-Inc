-- ============================================================================
-- DESTRIA TECH INC — Additive Migration 004
-- Dual-Recipient Service Inquiry & Executive Consultation Notifications
-- Strictly additive & idempotent (safe to re-run on live PostgreSQL/Supabase)
-- ============================================================================

-- 1. Extend durable notification_records (email outbox) for independent
--    dual-recipient delivery, Reply-To preservation, and verified webhook tracking
ALTER TABLE public.notification_records
  ADD COLUMN IF NOT EXISTS reply_to text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS request_source text,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_notification_records_provider_ref
  ON public.notification_records (provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_records_entity_ref
  ON public.notification_records (entity_type, entity_reference);

-- 2. Extend solution_requests for engagement scope, client timezone,
--    and commercial policy consent auditability
ALTER TABLE public.solution_requests
  ADD COLUMN IF NOT EXISTS engagement_scope text,
  ADD COLUMN IF NOT EXISTS submission_timezone text,
  ADD COLUMN IF NOT EXISTS commercial_policy_consent boolean NOT NULL DEFAULT false;

-- 3. Extend consultation_appointments for consultation purpose, selected solution,
--    equivalent UTC schedule, source channel (Public Website / AI Chat / AI Voice),
--    and availability verification flag
ALTER TABLE public.consultation_appointments
  ADD COLUMN IF NOT EXISTS consultation_purpose text,
  ADD COLUMN IF NOT EXISTS selected_solution text,
  ADD COLUMN IF NOT EXISTS utc_scheduled_at text,
  ADD COLUMN IF NOT EXISTS source_channel text NOT NULL DEFAULT 'Public Website',
  ADD COLUMN IF NOT EXISTS availability_verified boolean NOT NULL DEFAULT true;
