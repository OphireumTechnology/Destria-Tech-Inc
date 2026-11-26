-- =============================================================================
-- Migration 008: AI Front Desk Durability, Lossless Hydration & RLS Hardening
-- =============================================================================
-- Strictly additive & idempotent migration extending 007_ai_frontdesk_platform.sql.
-- Enables zero-data-loss multi-instance Supabase persistence for:
--   - Single-use Front Desk confirmation tokens (`frontdesk_pending_submissions`)
--   - Full hydration of `frontdesk_project_inquiries` across backend restarts
--   - Idempotent submission keys preventing duplicate inquiry writes
--   - Full metadata hydration of `ai_knowledge_documents` (canonical_links, compliance_notice)
--   - Complete RLS client-owner read policies, updated_at triggers, and query indexes
-- =============================================================================

-- 1. Single-Use Session-Scoped Confirmation Tokens (survives restarts & multi-instance deploys)
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

-- 2. Lossless Hydration & Idempotency Columns on `frontdesk_project_inquiries`
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

-- 3. Extend `ai_knowledge_documents` for Full Managed Knowledge Hydration
ALTER TABLE public.ai_knowledge_documents
  ADD COLUMN IF NOT EXISTS canonical_links TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS compliance_notice TEXT,
  ADD COLUMN IF NOT EXISTS versions_json JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 4. Performance Indexes on Human Escalations & Quality Evaluations
CREATE INDEX IF NOT EXISTS idx_frontdesk_escalations_status
  ON public.frontdesk_human_escalations(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_frontdesk_escalations_session
  ON public.frontdesk_human_escalations(session_key);

CREATE INDEX IF NOT EXISTS idx_ai_quality_evals_created
  ON public.ai_quality_evaluations(created_at DESC);

-- 5. Complete Client-Owner RLS Read Isolation on Child Tables
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

-- 6. Automatic `updated_at` Timestamp Triggers (idempotent)
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
    'frontdesk_sessions',
    'frontdesk_client_profiles',
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

-- 7. Record Schema Migration Metadata for Authorized System Health Inspection
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
VALUES ('008', 'AI Front Desk durability, pending confirmation persistence, idempotency, triggers, and RLS hardening')
ON CONFLICT (migration_version) DO NOTHING;
