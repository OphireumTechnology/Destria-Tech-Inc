-- =============================================================================
-- DESTRIA TECH INC (DESTRIA NETWORK)
-- Migration 003: Enterprise Portal Stabilization, Durable Auth/Sessions,
--                File Security Quarantine Metadata & Executive Consultation Routing
--
-- Safety Guarantee: Strictly additive, idempotent DDL. Zero DROP/TRUNCATE/DELETE.
-- Preserves all existing tables, rows, financial records, and RLS policies.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Executive Consultation Pathway on consultation_appointments
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.consultation_appointments
  ADD COLUMN IF NOT EXISTS executive_pathway TEXT NOT NULL DEFAULT 'advisory'
    CHECK (executive_pathway IN ('ceo', 'cto', 'advisory'));

CREATE INDEX IF NOT EXISTS idx_consultation_appointments_pathway
  ON public.consultation_appointments (executive_pathway, scheduled_date DESC);

-- -----------------------------------------------------------------------------
-- 2. File Security Quarantine & Integrity Metadata on project_attachments
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.project_attachments
  ADD COLUMN IF NOT EXISTS scan_status TEXT NOT NULL DEFAULT 'quarantined_unscanned'
    CHECK (scan_status IN ('quarantined_unscanned', 'clean', 'flagged'));

ALTER TABLE IF EXISTS public.project_attachments
  ADD COLUMN IF NOT EXISTS quarantine_reason TEXT;

ALTER TABLE IF EXISTS public.project_attachments
  ADD COLUMN IF NOT EXISTS content_sha256 TEXT;

CREATE INDEX IF NOT EXISTS idx_project_attachments_scan_status
  ON public.project_attachments (scan_status, uploaded_at DESC);

-- -----------------------------------------------------------------------------
-- 3. Durable Portal Client Authentication Accounts (Backend-Verified)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_auth_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin', 'super_admin')),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verification_token_hash TEXT,
  email_verification_expires_at TIMESTAMPTZ,
  password_reset_token_hash TEXT,
  password_reset_expires_at TIMESTAMPTZ,
  pending_email TEXT,
  pending_email_token_hash TEXT,
  pending_email_expires_at TIMESTAMPTZ,
  account_status TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'pending_closure', 'suspended')),
  closure_requested_at TIMESTAMPTZ,
  closure_reason TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_auth_users_email_lower
  ON public.portal_auth_users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_portal_auth_users_ver_hash
  ON public.portal_auth_users (email_verification_token_hash)
  WHERE email_verification_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_auth_users_reset_hash
  ON public.portal_auth_users (password_reset_token_hash)
  WHERE password_reset_token_hash IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. Durable Portal Sessions (Single-Use Revocation & Device Tracking)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.portal_auth_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_portal_sessions_user_active
  ON public.portal_sessions (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

-- -----------------------------------------------------------------------------
-- 5. Custom Enterprise Package Inquiries & Server-Authorized Proposals
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_package_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  company_name TEXT,
  requested_service TEXT NOT NULL,
  project_goals TEXT NOT NULL,
  budget_range TEXT,
  preferred_timeline TEXT,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'in_review', 'proposal_sent', 'approved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_package_inquiries_user
  ON public.custom_package_inquiries (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.approved_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_number TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  scope_summary TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'PHP')),
  items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal_minor BIGINT NOT NULL DEFAULT 0,
  total_minor BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved', 'accepted', 'expired', 'revoked')),
  approved_by TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_order_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approved_proposals_user
  ON public.approved_proposals (user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 6. Portal Transactional Email Delivery Outbox / Audit Log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  recipient_email TEXT NOT NULL,
  email_type TEXT NOT NULL
    CHECK (email_type IN (
      'verification',
      'password_recovery',
      'email_change',
      'security_alert',
      'proposal_notification',
      'project_update',
      'support_update',
      'invoice_notification'
    )),
  subject TEXT NOT NULL,
  delivery_status TEXT NOT NULL
    CHECK (delivery_status IN (
      'request_accepted',
      'queued',
      'provider_accepted',
      'failed',
      'delivery_unverified',
      'unconfigured'
    )),
  provider TEXT NOT NULL DEFAULT 'resend',
  provider_message_id TEXT,
  error_message TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_email_outbox_recipient
  ON public.portal_email_outbox (recipient_email, created_at DESC);

-- -----------------------------------------------------------------------------
-- 7. Row-Level Security (Strict Server-Role / Owner Isolation)
-- -----------------------------------------------------------------------------
ALTER TABLE public.portal_auth_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_package_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approved_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_email_outbox ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; anonymous/authenticated browser clients have zero direct access
-- to sensitive auth hashes, session tokens, or email outbox tables.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'custom_package_inquiries' AND policyname = 'inquiries_owner_select'
  ) THEN
    CREATE POLICY inquiries_owner_select ON public.custom_package_inquiries
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'approved_proposals' AND policyname = 'proposals_owner_select'
  ) THEN
    CREATE POLICY proposals_owner_select ON public.approved_proposals
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END
$$;
