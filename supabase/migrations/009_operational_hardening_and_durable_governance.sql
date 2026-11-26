-- =============================================================================
-- Migration 009: Operational Hardening & Durable Governance
-- Directive: DTI-MASTER-COMPLETION-003
-- =============================================================================
-- Additive, idempotent migration providing:
--   1. Durable multi-instance admin session revocation (`admin_revoked_sessions`)
--      so logged-out admin JWT/cookie tokens remain invalid across Railway
--      restarts and horizontal replicas.
--   2. Strict Row-Level Security with explicit `service_role` policy.
--   3. Safe cleanup helper `purge_expired_admin_revoked_sessions()`.
--   4. Migration tracking record `'009'` in `schema_migration_metadata`.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_revoked_sessions (
  jti TEXT PRIMARY KEY,
  admin_email TEXT NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL DEFAULT 'logout'
);

CREATE INDEX IF NOT EXISTS idx_admin_revoked_sessions_expires_at
  ON public.admin_revoked_sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_admin_revoked_sessions_admin_email
  ON public.admin_revoked_sessions (admin_email);

ALTER TABLE public.admin_revoked_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_revoked_sessions'
      AND policyname = 'service_role_all_admin_revoked_sessions'
  ) THEN
    EXECUTE 'CREATE POLICY service_role_all_admin_revoked_sessions ON public.admin_revoked_sessions FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.purge_expired_admin_revoked_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.admin_revoked_sessions
  WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

INSERT INTO public.schema_migration_metadata (migration_version, description)
VALUES (
  '009',
  'Durable multi-instance admin session revocation (admin_revoked_sessions), RLS hardening, and operational governance'
)
ON CONFLICT (migration_version) DO NOTHING;
