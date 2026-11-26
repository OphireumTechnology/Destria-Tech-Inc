-- =============================================================================
-- Migration 008: AI Front Desk Durability, Schema Reconciliation & RLS Hardening
-- =============================================================================
-- Strictly additive & idempotent corrective migration extending
-- `007_ai_frontdesk_platform.sql` without altering historical migration history.
--
-- Reconciles and hardens:
--   1. `public.ai_conversation_sessions` (from 007): adds `dossier_version`,
--      `dossier_json`, and `updated_at` for lossless multi-instance hydration.
--   2. `public.frontdesk_pending_submissions`: durable single-use confirmation
--      tokens surviving backend restarts and multi-instance deployments.
--   3. `public.frontdesk_project_inquiries` (from 007): adds lossless JSON
--      hydration columns, defaults `client_confirmed_at` to NOW(), and indexes
--      `idempotency_key`, `session_key`, and `updated_at`.
--   4. `public.ai_knowledge_documents` (from 007): preserves canonical `id` and
--      `version` columns and adds `canonical_links`, `compliance_notice`, and
--      `versions_json`.
--   5. Complete `service_role` + strict client-owner RLS policies across all
--      Front Desk tables, `updated_at` triggers, and migration metadata `'008'`.
-- =============================================================================

-- 1. Extend `ai_conversation_sessions` (created in 007) for lossless dossier hydration
ALTER TABLE public.ai_conversation_sessions
  ADD COLUMN IF NOT EXISTS dossier_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS dossier_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ai_conversation_sessions_updated_at
  ON public.ai_conversation_sessions(updated_at DESC);

-- 2. Single-Use Session-Scoped Confirmation Tokens (survives restarts & multi-instance deploys)
CREATE TABLE IF NOT EXISTS public.frontdesk_pending_submissions (
  confirmation_token TEXT PRIMARY KEY,
  session_key TEXT NOT NULL,
  dossier_snapshot_version INTEGER NOT NULL DEFAULT 1,
  prepared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_frontdesk_pending_session
  ON public.frontdesk_pending_submissions(session_key);
CREATE INDEX IF NOT EXISTS idx_frontdesk_pending_expires
  ON public.frontdesk_pending_submissions(expires_at);

ALTER TABLE public.frontdesk_pending_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS frontdesk_pending_service_all ON public.frontdesk_pending_submissions;
CREATE POLICY frontdesk_pending_service_all
  ON public.frontdesk_pending_submissions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3. Lossless Hydration & Idempotency Columns on `frontdesk_project_inquiries` (created in 007)
ALTER TABLE public.frontdesk_project_inquiries
  ALTER COLUMN client_confirmed_at SET DEFAULT NOW();

ALTER TABLE public.frontdesk_project_inquiries
  ADD COLUMN IF NOT EXISTS session_key TEXT,
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS client_phone TEXT,
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS client_profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS business_discovery_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS project_requirements_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS consultation_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS consultation_date TEXT,
  ADD COLUMN IF NOT EXISTS consultation_slot TEXT,
  ADD COLUMN IF NOT EXISTS consultation_timezone TEXT,
  ADD COLUMN IF NOT EXISTS email_delivery_state TEXT NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS review_history_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS client_correction_history_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_frontdesk_inquiries_idempotency
  ON public.frontdesk_project_inquiries(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_frontdesk_inquiries_session_key
  ON public.frontdesk_project_inquiries(session_key);

CREATE INDEX IF NOT EXISTS idx_frontdesk_inquiries_updated_at
  ON public.frontdesk_project_inquiries(updated_at DESC);

-- 4. Extend `ai_knowledge_documents` (created in 007 with PK `id` and `version`)
ALTER TABLE public.ai_knowledge_documents
  ADD COLUMN IF NOT EXISTS canonical_links TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS compliance_notice TEXT,
  ADD COLUMN IF NOT EXISTS versions_json JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_status_visibility
  ON public.ai_knowledge_documents(status, visibility, updated_at DESC);

-- 5. Performance Indexes on Human Escalations & Quality Evaluations
CREATE INDEX IF NOT EXISTS idx_frontdesk_escalations_status
  ON public.frontdesk_human_escalations(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_frontdesk_escalations_session
  ON public.frontdesk_human_escalations(session_key);

CREATE INDEX IF NOT EXISTS idx_ai_quality_evals_created
  ON public.ai_quality_evaluations(created_at DESC);

-- 6. Complete Explicit `service_role` + Strict Client-Owner RLS Policies on 007/008 Tables
DO $$
DECLARE
  svc_tbl TEXT;
BEGIN
  FOREACH svc_tbl IN ARRAY ARRAY[
    'frontdesk_companies',
    'frontdesk_client_profiles',
    'ai_conversation_sessions',
    'ai_conversation_turns',
    'frontdesk_project_inquiries',
    'frontdesk_requirement_versions',
    'frontdesk_executive_reviews',
    'frontdesk_human_escalations',
    'ai_knowledge_documents',
    'ai_knowledge_versions',
    'ai_quality_evaluations'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_service_role_all ON public.%I;', svc_tbl, svc_tbl);
    EXECUTE format(
      'CREATE POLICY %I_service_role_all ON public.%I FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'');',
      svc_tbl,
      svc_tbl
    );
  END LOOP;
END;
$$;

-- Clients may ONLY read requirement versions belonging to their own normalized owner_email inquiry.
DROP POLICY IF EXISTS frontdesk_req_versions_client_read ON public.frontdesk_requirement_versions;
CREATE POLICY frontdesk_req_versions_client_read
  ON public.frontdesk_requirement_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.frontdesk_project_inquiries i
      WHERE i.id = frontdesk_requirement_versions.inquiry_id
        AND lower(i.owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- Clients may ONLY read client profile snapshots matching their own authenticated email.
DROP POLICY IF EXISTS frontdesk_client_profiles_client_read ON public.frontdesk_client_profiles;
CREATE POLICY frontdesk_client_profiles_client_read
  ON public.frontdesk_client_profiles
  FOR SELECT
  USING (
    lower(coalesce(email, '')) <> ''
    AND lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- 7. Automatic `updated_at` Timestamp Triggers (reconciled with exact 007 table names)
CREATE OR REPLACE FUNCTION public.dti_set_updated_at_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'frontdesk_companies',
    'frontdesk_client_profiles',
    'ai_conversation_sessions',
    'frontdesk_project_inquiries',
    'frontdesk_human_escalations',
    'ai_knowledge_documents'
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

-- 8. Record Schema Migration Metadata for Authorized System Health Inspection
CREATE TABLE IF NOT EXISTS public.schema_migration_metadata (
  migration_version TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.schema_migration_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schema_migration_metadata_service_all ON public.schema_migration_metadata;
CREATE POLICY schema_migration_metadata_service_all
  ON public.schema_migration_metadata
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

INSERT INTO public.schema_migration_metadata (migration_version, description)
VALUES
  ('007', 'AI Front Desk core platform tables, knowledge versioning, escalations, quality evaluations, and RLS'),
  ('008', 'AI Front Desk schema reconciliation, pending confirmation persistence, idempotency, triggers, and RLS hardening')
ON CONFLICT (migration_version) DO NOTHING;
