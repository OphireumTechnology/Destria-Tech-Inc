-- Additive first increment; review/staging only. Reuse existing session and turn tables.
BEGIN;
ALTER TABLE public.ai_conversation_turns ADD COLUMN IF NOT EXISTS source_channel text CHECK (source_channel IN ('ai_frontdesk_chat','ai_frontdesk_voice','widget_chat','widget_voice'));
CREATE TABLE IF NOT EXISTS public.frontdesk_departments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL UNIQUE,
 enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.frontdesk_human_agents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 department_id uuid NOT NULL REFERENCES public.frontdesk_departments(id),
 display_name text NOT NULL,
 availability_state text NOT NULL DEFAULT 'offline' CHECK (availability_state IN ('available','busy','break','offline')),
 last_assigned_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.frontdesk_agent_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 agent_id uuid NOT NULL REFERENCES public.frontdesk_human_agents(id),
 session_id uuid NOT NULL REFERENCES public.ai_conversation_sessions(id) ON DELETE CASCADE,
 state text NOT NULL DEFAULT 'offered' CHECK (state IN ('offered','accepted','released','expired')),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS frontdesk_one_active_agent ON public.frontdesk_agent_assignments(agent_id) WHERE state IN ('offered','accepted');
CREATE UNIQUE INDEX IF NOT EXISTS frontdesk_one_active_session ON public.frontdesk_agent_assignments(session_id) WHERE state IN ('offered','accepted');
CREATE TABLE IF NOT EXISTS public.frontdesk_callback_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id uuid NOT NULL REFERENCES public.ai_conversation_sessions(id) ON DELETE CASCADE,
 idempotency_key text NOT NULL,
 requested_at timestamptz NOT NULL DEFAULT now(),
 state text NOT NULL DEFAULT 'requested' CHECK (state IN ('requested','scheduled','completed','cancelled')),
 UNIQUE(session_id,idempotency_key)
);
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['frontdesk_departments','frontdesk_human_agents','frontdesk_agent_assignments','frontdesk_callback_requests'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role',t);
 END LOOP;
END $$;
COMMIT;
