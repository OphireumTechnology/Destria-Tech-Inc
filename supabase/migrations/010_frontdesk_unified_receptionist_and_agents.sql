-- =============================================================================
-- DESTRIA TECH INC — Migration 010: Unified AI Front Desk, Receptionist Ops,
--                    Human-Agent Atomic Routing, Schedule, Callbacks & Consent
-- Directive: DTI-HELIX-IMPLEMENTATION-002 (Phase 02)
-- Reconciles commit 9635c0bca147da8b22a8e372f42daf85e59b56ab cleanly & idempotently
-- =============================================================================
-- Governance Notice:
--   - Strictly additive & idempotent on top of Migrations 001–009 and the
--     initial 010 review increment from commit 9635c0bc.
--   - Reuses existing `ai_conversation_sessions`, `ai_conversation_turns`,
--     `frontdesk_client_profiles`, `frontdesk_project_inquiries`,
--     `frontdesk_human_escalations`, `consultation_appointments`, `audit_logs`,
--     and `schema_migration_metadata` without dropping or resetting any table.
--   - Enforces PostgreSQL native UUID, TIMESTAMPTZ, TEXT[], JSONB, atomic
--     FOR UPDATE SKIP LOCKED claiming, Row Level Security, and customer
--     ownership isolation.
--   - Review/staging migration ONLY — do NOT apply to production without
--     separate written executive authorization and verified DB backup.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Unified Voice & Chat Conversation Tracking + Persistent Customer Memory
--    (Reconciles `schema.sql` and `007`/`008` columns on `ai_conversation_sessions`
--     and extends `ai_conversation_turns` cleanly without data loss)
-- -----------------------------------------------------------------------------
ALTER TABLE public.ai_conversation_sessions
  ADD COLUMN IF NOT EXISTS session_key TEXT,
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'ai_frontdesk_chat',
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en-US',
  ADD COLUMN IF NOT EXISTS discovery_active BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lead_status TEXT NOT NULL DEFAULT 'New visitor',
  ADD COLUMN IF NOT EXISTS completeness_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS turn_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS active_channel TEXT NOT NULL DEFAULT 'ai_frontdesk_chat'
    CHECK (active_channel IN ('ai_frontdesk_chat', 'ai_frontdesk_voice', 'widget_chat', 'widget_voice')),
  ADD COLUMN IF NOT EXISTS active_department_slug TEXT,
  ADD COLUMN IF NOT EXISTS verified_client_email TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_memory_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS generation_epoch INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consent_recorded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_provider_used TEXT;

-- If base schema.sql created `session_token NOT NULL`, ensure it has a safe default and backfill `session_key`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_conversation_sessions' AND column_name = 'session_token'
  ) THEN
    EXECUTE 'ALTER TABLE public.ai_conversation_sessions ALTER COLUMN session_token SET DEFAULT gen_random_uuid()::text';
    EXECUTE 'UPDATE public.ai_conversation_sessions SET session_key = COALESCE(session_key, session_token, id::text) WHERE session_key IS NULL';
  ELSE
    EXECUTE 'UPDATE public.ai_conversation_sessions SET session_key = COALESCE(session_key, id::text) WHERE session_key IS NULL';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_conversation_sessions_session_key
  ON public.ai_conversation_sessions (session_key);

CREATE INDEX IF NOT EXISTS idx_ai_conversation_sessions_verified_email
  ON public.ai_conversation_sessions (LOWER(verified_client_email))
  WHERE verified_client_email IS NOT NULL;

-- Reconciles 9635c0bc `source_channel` and adds ordering, idempotency & metadata
ALTER TABLE public.ai_conversation_turns
  ADD COLUMN IF NOT EXISTS source_channel TEXT
    CHECK (source_channel IN ('ai_frontdesk_chat', 'ai_frontdesk_voice', 'widget_chat', 'widget_voice')),
  ADD COLUMN IF NOT EXISTS turn_sequence INTEGER,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS department_slug TEXT,
  ADD COLUMN IF NOT EXISTS provider_used TEXT,
  ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_conversation_turns_idempotency
  ON public.ai_conversation_turns (session_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_conversation_turns_session_seq
  ON public.ai_conversation_turns (session_id, turn_sequence)
  WHERE turn_sequence IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_conversation_turns_session_seq_asc
  ON public.ai_conversation_turns (session_id, turn_sequence ASC, created_at ASC);

-- -----------------------------------------------------------------------------
-- 2. Corporate Departments (Reconciles 9635c0bc & adds routing metadata)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frontdesk_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE public.frontdesk_departments
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS routing_keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS supported_languages TEXT[] NOT NULL DEFAULT ARRAY['en-US', 'fil-PH']::TEXT[],
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS default_sla_minutes INTEGER NOT NULL DEFAULT 30 CHECK (default_sla_minutes > 0),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.frontdesk_departments
SET slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '_', 'g'))
WHERE slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_frontdesk_departments_slug
  ON public.frontdesk_departments (slug)
  WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_frontdesk_departments_enabled_priority
  ON public.frontdesk_departments (enabled, priority ASC);

-- Seed canonical DESTRIA corporate functional departments (zero invented staff!)
INSERT INTO public.frontdesk_departments (name, slug, description, routing_keywords, supported_languages, priority, default_sla_minutes, enabled)
VALUES
  ('Enterprise Solutions & Architecture', 'enterprise_solutions', 'Custom software engineering, enterprise architecture, ERP/CRM, cloud platforms, and preliminary masterplans.', ARRAY['software', 'architecture', 'erp', 'crm', 'cloud', 'platform', 'web', 'mobile', 'masterplan', 'project'], ARRAY['en-US', 'fil-PH'], 10, 30, TRUE),
  ('AI, Automation & Data Engineering', 'ai_automation', 'Applied AI systems, intelligent workflows, voice/chat automation, analytics, and data pipelines.', ARRAY['ai', 'automation', 'chatbot', 'voice', 'agent', 'analytics', 'machine learning', 'workflow'], ARRAY['en-US', 'fil-PH'], 20, 30, TRUE),
  ('Cybersecurity, Compliance & Infrastructure', 'cybersecurity_infrastructure', 'Security audits, cloud hardening, zero-trust governance, DevOps, and compliance architecture.', ARRAY['security', 'cybersecurity', 'audit', 'compliance', 'devops', 'infrastructure', 'encryption'], ARRAY['en-US', 'fil-PH'], 30, 20, TRUE),
  ('Executive Consultations & Commercial Desk', 'executive_consultations', 'Executive discovery scheduling, strategic partnerships, and formal commercial scope review.', ARRAY['consultation', 'executive', 'meeting', 'schedule', 'appointment', 'proposal', 'quote', 'pricing', 'partnership'], ARRAY['en-US', 'fil-PH'], 40, 30, TRUE),
  ('Client Support & Front Desk Operations', 'client_support', 'General corporate inquiries, returning client assistance, and human escalation routing.', ARRAY['support', 'help', 'human', 'representative', 'callback', 'status', 'inquiry'], ARRAY['en-US', 'fil-PH'], 50, 30, TRUE)
ON CONFLICT (name) DO UPDATE SET
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  routing_keywords = EXCLUDED.routing_keywords,
  supported_languages = EXCLUDED.supported_languages,
  priority = EXCLUDED.priority,
  default_sla_minutes = EXCLUDED.default_sla_minutes;

-- -----------------------------------------------------------------------------
-- 3. Human-Agent Presence & Capacity (Reconciles 9635c0bc & adds multi-session / lang)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frontdesk_human_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.frontdesk_departments(id),
  display_name TEXT NOT NULL,
  availability_state TEXT NOT NULL DEFAULT 'offline'
    CHECK (availability_state IN ('available', 'busy', 'break', 'offline')),
  last_assigned_at TIMESTAMPTZ
);

ALTER TABLE public.frontdesk_human_agents
  ADD COLUMN IF NOT EXISTS agent_code TEXT,
  ADD COLUMN IF NOT EXISTS admin_user_email TEXT,
  ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'en-US',
  ADD COLUMN IF NOT EXISTS supported_languages TEXT[] NOT NULL DEFAULT ARRAY['en-US', 'fil-PH']::TEXT[],
  ADD COLUMN IF NOT EXISTS secondary_department_slugs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS max_concurrent_sessions INTEGER NOT NULL DEFAULT 1 CHECK (max_concurrent_sessions >= 1),
  ADD COLUMN IF NOT EXISTS active_session_count INTEGER NOT NULL DEFAULT 0 CHECK (active_session_count >= 0),
  ADD COLUMN IF NOT EXISTS current_session_key TEXT,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS state_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_frontdesk_human_agents_code
  ON public.frontdesk_human_agents (agent_code)
  WHERE agent_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_frontdesk_human_agents_availability
  ON public.frontdesk_human_agents (availability_state, department_id, last_assigned_at ASC NULLS FIRST);

-- -----------------------------------------------------------------------------
-- 4. Atomic Human-Agent Assignments (Reconciles 9635c0bc partial unique indexes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frontdesk_agent_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.frontdesk_human_agents(id),
  session_id UUID NOT NULL REFERENCES public.ai_conversation_sessions(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'offered'
    CHECK (state IN ('offered', 'accepted', 'released', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.frontdesk_agent_assignments
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS department_slug TEXT,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reassignment_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS frontdesk_one_active_agent
  ON public.frontdesk_agent_assignments (agent_id)
  WHERE state IN ('offered', 'accepted');

CREATE UNIQUE INDEX IF NOT EXISTS frontdesk_one_active_session
  ON public.frontdesk_agent_assignments (session_id)
  WHERE state IN ('offered', 'accepted');

CREATE UNIQUE INDEX IF NOT EXISTS idx_frontdesk_agent_assignments_idempotency
  ON public.frontdesk_agent_assignments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_frontdesk_agent_assignments_expiry
  ON public.frontdesk_agent_assignments (state, expires_at)
  WHERE state = 'offered';

-- -----------------------------------------------------------------------------
-- 5. Callback Requests (Reconciles 9635c0bc & adds contact/schedule details)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frontdesk_callback_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.ai_conversation_sessions(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  state TEXT NOT NULL DEFAULT 'requested'
    CHECK (state IN ('requested', 'scheduled', 'completed', 'cancelled')),
  UNIQUE (session_id, idempotency_key)
);

ALTER TABLE public.frontdesk_callback_requests
  ADD COLUMN IF NOT EXISTS reference_code TEXT,
  ADD COLUMN IF NOT EXISTS department_slug TEXT NOT NULL DEFAULT 'client_support',
  ADD COLUMN IF NOT EXISTS visitor_name TEXT NOT NULL DEFAULT 'Prospective Client',
  ADD COLUMN IF NOT EXISTS visitor_email TEXT,
  ADD COLUMN IF NOT EXISTS visitor_phone TEXT,
  ADD COLUMN IF NOT EXISTS preferred_window TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Manila',
  ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES public.frontdesk_human_agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_frontdesk_callbacks_reference_code
  ON public.frontdesk_callback_requests (reference_code)
  WHERE reference_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_frontdesk_callbacks_state_requested
  ON public.frontdesk_callback_requests (state, requested_at DESC);

-- -----------------------------------------------------------------------------
-- 6. Business-Hours Configuration & Holiday Management
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frontdesk_holidays_and_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type TEXT NOT NULL CHECK (record_type IN ('business_hours', 'holiday')),
  timezone TEXT NOT NULL DEFAULT 'Asia/Manila',
  day_of_week SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),
  open_time TIME,
  close_time TIME,
  holiday_date DATE,
  holiday_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (record_type = 'business_hours' AND day_of_week IS NOT NULL AND open_time IS NOT NULL AND close_time IS NOT NULL AND open_time < close_time)
    OR
    (record_type = 'holiday' AND holiday_date IS NOT NULL AND holiday_name IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_frontdesk_business_hours_day
  ON public.frontdesk_holidays_and_hours (day_of_week, timezone)
  WHERE record_type = 'business_hours';

CREATE UNIQUE INDEX IF NOT EXISTS idx_frontdesk_holidays_date
  ON public.frontdesk_holidays_and_hours (holiday_date)
  WHERE record_type = 'holiday';

-- Seed default Mon–Fri 09:00–18:00 Asia/Manila corporate reception hours (idempotent)
INSERT INTO public.frontdesk_holidays_and_hours (record_type, timezone, day_of_week, open_time, close_time, is_active)
VALUES
  ('business_hours', 'Asia/Manila', 1, '09:00', '18:00', TRUE),
  ('business_hours', 'Asia/Manila', 2, '09:00', '18:00', TRUE),
  ('business_hours', 'Asia/Manila', 3, '09:00', '18:00', TRUE),
  ('business_hours', 'Asia/Manila', 4, '09:00', '18:00', TRUE),
  ('business_hours', 'Asia/Manila', 5, '09:00', '18:00', TRUE)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 7. Privacy, Voice Processing & Recording Consent Audit Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frontdesk_consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.ai_conversation_sessions(id) ON DELETE CASCADE,
  session_key TEXT NOT NULL,
  owner_email TEXT,
  consent_type TEXT NOT NULL CHECK (
    consent_type IN ('voice_processing', 'transcript_storage', 'callback_contact', 'inquiry_submission')
  ),
  granted BOOLEAN NOT NULL,
  policy_version TEXT NOT NULL DEFAULT '2026.11-dti-privacy-v1',
  ip_hash TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_frontdesk_consent_session
  ON public.frontdesk_consent_records (session_id, consent_type, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_frontdesk_consent_owner_email
  ON public.frontdesk_consent_records (LOWER(owner_email))
  WHERE owner_email IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 8. Atomic PostgreSQL RPCs for Human-Agent Claiming, Acceptance, Release & Expiry
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_stale_frontdesk_assignments()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count INTEGER := 0;
BEGIN
  WITH expired_rows AS (
    UPDATE public.frontdesk_agent_assignments
    SET state = 'expired',
        released_at = NOW(),
        updated_at = NOW()
    WHERE state = 'offered'
      AND expires_at <= NOW()
    RETURNING agent_id
  ),
  agent_deltas AS (
    SELECT agent_id, COUNT(*)::INTEGER AS cnt
    FROM expired_rows
    GROUP BY agent_id
  ),
  updated_agents AS (
    UPDATE public.frontdesk_human_agents a
    SET active_session_count = GREATEST(0, a.active_session_count - d.cnt),
        availability_state = CASE
          WHEN a.availability_state = 'busy'
               AND GREATEST(0, a.active_session_count - d.cnt) < a.max_concurrent_sessions
            THEN 'available'
          ELSE a.availability_state
        END,
        current_session_key = CASE
          WHEN GREATEST(0, a.active_session_count - d.cnt) = 0 THEN NULL
          ELSE a.current_session_key
        END,
        state_changed_at = NOW(),
        updated_at = NOW()
    FROM agent_deltas d
    WHERE a.id = d.agent_id
    RETURNING a.id
  )
  SELECT COUNT(*) INTO expired_count FROM expired_rows;

  RETURN expired_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_frontdesk_human_agent(
  p_session_id UUID,
  p_session_key TEXT,
  p_department_slug TEXT,
  p_preferred_language TEXT DEFAULT 'en-US',
  p_expiry_seconds INTEGER DEFAULT 90,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  assignment_id UUID,
  agent_id UUID,
  agent_display_name TEXT,
  department_slug TEXT,
  assignment_state TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing RECORD;
  v_agent RECORD;
  v_assignment_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- 1. First expire any stale unaccepted offers so capacity is always accurate
  PERFORM public.expire_stale_frontdesk_assignments();

  -- 2. Idempotent replay check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT a.id, a.agent_id, h.display_name, COALESCE(a.department_slug, p_department_slug) AS resolved_dept_slug, a.state, a.expires_at
    INTO v_existing
    FROM public.frontdesk_agent_assignments a
    JOIN public.frontdesk_human_agents h ON h.id = a.agent_id
    WHERE a.idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
      RETURN QUERY SELECT v_existing.id, v_existing.agent_id, v_existing.display_name, v_existing.resolved_dept_slug, v_existing.state, v_existing.expires_at;
      RETURN;
    END IF;
  END IF;

  -- 3. Prevent duplicate active assignment for the same session
  SELECT a.id, a.agent_id, h.display_name, COALESCE(a.department_slug, p_department_slug) AS resolved_dept_slug, a.state, a.expires_at
  INTO v_existing
  FROM public.frontdesk_agent_assignments a
  JOIN public.frontdesk_human_agents h ON h.id = a.agent_id
  WHERE a.session_id = p_session_id
    AND a.state IN ('offered', 'accepted')
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.agent_id, v_existing.display_name, v_existing.resolved_dept_slug, v_existing.state, v_existing.expires_at;
    RETURN;
  END IF;

  -- 4. Atomically claim the longest-idle matching available agent using FOR UPDATE SKIP LOCKED
  SELECT h.id, h.display_name, d.slug AS dept_slug
  INTO v_agent
  FROM public.frontdesk_human_agents h
  JOIN public.frontdesk_departments d ON d.id = h.department_id
  WHERE d.enabled = TRUE
    AND h.availability_state = 'available'
    AND h.active_session_count < h.max_concurrent_sessions
    AND (
      d.slug = p_department_slug
      OR p_department_slug = ANY(h.secondary_department_slugs)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.frontdesk_agent_assignments active_a
      WHERE active_a.agent_id = h.id
        AND active_a.state IN ('offered', 'accepted')
    )
  ORDER BY
    (CASE WHEN d.slug = p_department_slug THEN 0 ELSE 1 END) ASC,
    (CASE WHEN LOWER(h.preferred_language) = LOWER(p_preferred_language) THEN 0
          WHEN p_preferred_language = ANY(h.supported_languages) THEN 1
          ELSE 2 END) ASC,
    h.last_assigned_at ASC NULLS FIRST,
    h.created_at ASC
  FOR UPDATE OF h SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_expires_at := NOW() + make_interval(secs => GREATEST(15, LEAST(600, COALESCE(p_expiry_seconds, 90))));

  INSERT INTO public.frontdesk_agent_assignments (
    agent_id,
    session_id,
    state,
    expires_at,
    idempotency_key,
    department_slug
  )
  VALUES (
    v_agent.id,
    p_session_id,
    'offered',
    v_expires_at,
    p_idempotency_key,
    COALESCE(p_department_slug, v_agent.dept_slug)
  )
  RETURNING id INTO v_assignment_id;

  UPDATE public.frontdesk_human_agents
  SET active_session_count = active_session_count + 1,
      availability_state = CASE
        WHEN active_session_count + 1 >= max_concurrent_sessions THEN 'busy'
        ELSE availability_state
      END,
      current_session_key = p_session_key,
      last_assigned_at = NOW(),
      state_changed_at = NOW(),
      updated_at = NOW()
  WHERE id = v_agent.id;

  RETURN QUERY
    SELECT v_assignment_id, v_agent.id, v_agent.display_name, COALESCE(p_department_slug, v_agent.dept_slug), 'offered'::TEXT, v_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_frontdesk_agent_assignment(
  p_assignment_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_id UUID;
BEGIN
  UPDATE public.frontdesk_agent_assignments
  SET state = 'released',
      released_at = NOW(),
      notes = COALESCE(p_notes, notes),
      updated_at = NOW()
  WHERE id = p_assignment_id
    AND state IN ('offered', 'accepted')
  RETURNING agent_id INTO v_agent_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE public.frontdesk_human_agents
  SET active_session_count = GREATEST(0, active_session_count - 1),
      availability_state = CASE
        WHEN availability_state = 'busy' AND GREATEST(0, active_session_count - 1) < max_concurrent_sessions
          THEN 'available'
        ELSE availability_state
      END,
      current_session_key = CASE
        WHEN GREATEST(0, active_session_count - 1) = 0 THEN NULL
        ELSE current_session_key
      END,
      state_changed_at = NOW(),
      updated_at = NOW()
  WHERE id = v_agent_id;

  RETURN TRUE;
END;
$$;

-- -----------------------------------------------------------------------------
-- 9. Row-Level Security, Privilege Revocation & Customer Ownership Isolation
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'frontdesk_departments',
    'frontdesk_human_agents',
    'frontdesk_agent_assignments',
    'frontdesk_callback_requests',
    'frontdesk_holidays_and_hours',
    'frontdesk_consent_records'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated;', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_service_role_all ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY %I_service_role_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
      t,
      t
    );
  END LOOP;
END;
$$;

-- Customer ownership isolation: verified clients can only read their own consent & callback records
DROP POLICY IF EXISTS frontdesk_consent_client_own_select ON public.frontdesk_consent_records;
CREATE POLICY frontdesk_consent_client_own_select
  ON public.frontdesk_consent_records
  FOR SELECT
  TO authenticated
  USING (
    owner_email IS NOT NULL
    AND LOWER(owner_email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
  );

DROP POLICY IF EXISTS frontdesk_callbacks_client_own_select ON public.frontdesk_callback_requests;
CREATE POLICY frontdesk_callbacks_client_own_select
  ON public.frontdesk_callback_requests
  FOR SELECT
  TO authenticated
  USING (
    visitor_email IS NOT NULL
    AND LOWER(visitor_email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
  );

-- Restrict SECURITY DEFINER RPC execution strictly to `service_role`
REVOKE ALL ON FUNCTION public.expire_stale_frontdesk_assignments() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_frontdesk_human_agent(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_frontdesk_agent_assignment(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_frontdesk_assignments() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_frontdesk_human_agent(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_frontdesk_agent_assignment(UUID, TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- 10. Automatic `updated_at` Triggers & Schema Migration Metadata
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'frontdesk_departments',
    'frontdesk_human_agents',
    'frontdesk_agent_assignments',
    'frontdesk_callback_requests',
    'frontdesk_holidays_and_hours'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.dti_set_updated_at_timestamp();',
      tbl,
      tbl
    );
  END LOOP;
END;
$$;

INSERT INTO public.schema_migration_metadata (migration_version, description)
VALUES (
  '010',
  'Unified voice/chat session continuity, customer memory, corporate departments, human-agent presence & atomic FOR UPDATE SKIP LOCKED assignment RPCs, business hours/holidays, callbacks, privacy consent, and RLS hardening'
)
ON CONFLICT (migration_version) DO NOTHING;

COMMIT;
