-- =============================================================================
-- DESTRIA TECH INC — Migration 007: AI Front Desk Platform Schema Blueprint
-- =============================================================================
-- Governance Notice:
--   - Reuses existing tables (`solution_requests`, `consultation_appointments`,
--     `email_outbox`, `audit_logs`, `admin_users`, `portal_users`) without
--     duplicating or destructively modifying existing columns.
--   - Reviewable migration blueprint only; do NOT execute against production
--     without explicit executive approval and backup verification.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Client Profiles & Companies (M08 / M20)
CREATE TABLE IF NOT EXISTS public.frontdesk_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  location TEXT,
  country TEXT,
  employee_count TEXT,
  branch_locations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.frontdesk_client_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.frontdesk_companies(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  position TEXT,
  decision_making_role TEXT,
  preferred_communication_method TEXT DEFAULT 'email',
  preferred_language TEXT DEFAULT 'en-US',
  timezone TEXT DEFAULT 'UTC',
  consent_granted BOOLEAN NOT NULL DEFAULT FALSE,
  consent_granted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_frontdesk_client_profiles_email_lower
  ON public.frontdesk_client_profiles (LOWER(email));

-- 2. AI Conversation Sessions & Turns (M01-M05) — NO raw voice audio stored by default!
CREATE TABLE IF NOT EXISTS public.ai_conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key TEXT NOT NULL UNIQUE,
  client_profile_id UUID REFERENCES public.frontdesk_client_profiles(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('ai_frontdesk_chat', 'ai_frontdesk_voice', 'widget_chat', 'widget_voice')),
  language TEXT NOT NULL DEFAULT 'en-US',
  discovery_active BOOLEAN NOT NULL DEFAULT FALSE,
  lead_status TEXT NOT NULL DEFAULT 'New visitor',
  completeness_score INTEGER NOT NULL DEFAULT 0 CHECK (completeness_score BETWEEN 0 AND 100),
  turn_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_conversation_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.ai_conversation_sessions(id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'ai')),
  detected_intent TEXT,
  language TEXT,
  message_text TEXT NOT NULL,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, turn_id, sender)
);

CREATE INDEX IF NOT EXISTS idx_ai_conversation_turns_session_created
  ON public.ai_conversation_turns (session_id, created_at DESC);

-- 3. Front Desk Project Inquiries, Versioned Requirements, Recommendations & 25-Section Masterplans
CREATE TABLE IF NOT EXISTS public.frontdesk_project_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code TEXT NOT NULL UNIQUE,
  idempotency_key TEXT UNIQUE,
  session_id UUID REFERENCES public.ai_conversation_sessions(id) ON DELETE SET NULL,
  client_profile_id UUID REFERENCES public.frontdesk_client_profiles(id) ON DELETE SET NULL,
  owner_email TEXT NOT NULL,
  solution_request_ref TEXT,
  consultation_appointment_ref TEXT,
  company_name TEXT NOT NULL,
  project_name TEXT NOT NULL,
  application_type TEXT,
  lead_status TEXT NOT NULL DEFAULT 'Qualified project inquiry',
  executive_review_stage TEXT NOT NULL DEFAULT 'Project inquiry received',
  completeness_score INTEGER NOT NULL DEFAULT 0 CHECK (completeness_score BETWEEN 0 AND 100),
  current_version INTEGER NOT NULL DEFAULT 1,
  client_confirmed_at TIMESTAMPTZ NOT NULL,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommendation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  masterplan_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  commercial_approved_by TEXT,
  commercial_approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_frontdesk_inquiries_owner_email
  ON public.frontdesk_project_inquiries (LOWER(owner_email));
CREATE INDEX IF NOT EXISTS idx_frontdesk_inquiries_lead_status
  ON public.frontdesk_project_inquiries (lead_status, executive_review_stage);

CREATE TABLE IF NOT EXISTS public.frontdesk_requirement_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES public.frontdesk_project_inquiries(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  changed_by_email TEXT NOT NULL,
  change_note TEXT,
  requirements_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (inquiry_id, version_number)
);

-- 4. 16-Stage Executive Commercial Review Audit History (Section 25)
CREATE TABLE IF NOT EXISTS public.frontdesk_executive_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES public.frontdesk_project_inquiries(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  lead_status TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  approved_commercially BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Human Escalations (M23 / Section 32)
CREATE TABLE IF NOT EXISTS public.frontdesk_human_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code TEXT NOT NULL UNIQUE,
  session_key TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  company_name TEXT,
  reason TEXT NOT NULL,
  requested_track TEXT NOT NULL DEFAULT 'general',
  preferred_contact_method TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  assigned_to TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Admin-Controlled Versioned AI Knowledge Documents (M22 / Section 27)
CREATE TABLE IF NOT EXISTS public.ai_knowledge_documents (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  knowledge_type TEXT NOT NULL CHECK (knowledge_type IN ('verified_corporate_offering', 'general_technical_knowledge')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  facts JSONB NOT NULL DEFAULT '[]'::jsonb,
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'deactivated')),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'internal_only')),
  version INTEGER NOT NULL DEFAULT 1,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_knowledge_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id TEXT NOT NULL REFERENCES public.ai_knowledge_documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot_json JSONB NOT NULL,
  updated_by TEXT NOT NULL,
  change_note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version)
);

-- 7. AI Quality Evaluations (M26)
CREATE TABLE IF NOT EXISTS public.ai_quality_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key TEXT NOT NULL,
  channel TEXT NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  naturalness_score SMALLINT NOT NULL CHECK (naturalness_score BETWEEN 1 AND 5),
  accuracy_score SMALLINT NOT NULL CHECK (accuracy_score BETWEEN 1 AND 5),
  policy_compliance_passed BOOLEAN NOT NULL DEFAULT TRUE,
  evaluator_email TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Row-Level Security (Strict Client Ownership Isolation + Service-Role Admin Operations)
ALTER TABLE public.frontdesk_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frontdesk_client_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversation_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frontdesk_project_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frontdesk_requirement_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frontdesk_executive_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frontdesk_human_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_knowledge_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_quality_evaluations ENABLE ROW LEVEL SECURITY;

-- Clients can ONLY select their own inquiries via authenticated JWT email claim
DROP POLICY IF EXISTS frontdesk_inquiries_client_own_select ON public.frontdesk_project_inquiries;
CREATE POLICY frontdesk_inquiries_client_own_select
  ON public.frontdesk_project_inquiries
  FOR SELECT
  USING (LOWER(owner_email) = LOWER(COALESCE(auth.jwt() ->> 'email', '')));

-- Public read access ONLY for approved + public knowledge documents
DROP POLICY IF EXISTS ai_knowledge_public_approved_select ON public.ai_knowledge_documents;
CREATE POLICY ai_knowledge_public_approved_select
  ON public.ai_knowledge_documents
  FOR SELECT
  USING (status = 'approved' AND visibility = 'public');
