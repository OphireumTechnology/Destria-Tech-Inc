# DESTRIA TECH INC — Unified AI Front Desk Supabase PostgreSQL Design (Migration `010`)

**Directive:** `DTI-HELIX-INTEGRATION-001` (Sections 11 & 12)  
**Audit Date:** 2026-11-26  
**Schema Status:** **`SOURCE_AUDITED` (Additive Design Blueprint — NOT YET CREATED OR APPLIED)**

---

## 1. Reconciliation With Existing Migrations `001`–`009`
All 9 existing Supabase migrations (`001` through `009`) on `main` (`2e238e6358524a2b7a2c5c4b2878bcdacd689ce2`) are preserved untouched:
- `001`–`006`: Core `solution_requests`, `consultation_appointments`, `admin_users`, `audit_logs`, `notification_records`, Client Portal commerce/wallets/documents, `claim_retryable_notifications` RPC, canonical CEO **Desmond Hinds**.
- `007`–`008`: `ai_conversation_sessions` (`session_key`, `dossier_version`, `dossier_json`), `frontdesk_pending_submissions`, `frontdesk_project_inquiries` (`idempotency_key`), `frontdesk_human_escalations`, `ai_quality_evaluations`, `ai_knowledge_documents`, `service_role` RLS on all tables.
- `009`: `admin_revoked_sessions` (durable multi-instance admin logout revocation + `purge_expired_admin_revoked_sessions()`).

**No existing table is dropped, renamed, or reset.** All Helix SQLite constructs (`PRAGMA`, `aiosqlite`, `better-sqlite3`, comma-separated text lists, naive `DATETIME`, Linux `strftime`) are replaced with native PostgreSQL types (`UUID`, `TIMESTAMPTZ`, `TEXT[]`, `JSONB`, `FOR UPDATE SKIP LOCKED`).

---

## 2. Planned Additive Migration `010_frontdesk_unified_receptionist_and_agents.sql`

| New Table / Object | Primary / Unique Keys | Purpose & Key Columns | Indexes & Constraints |
| :--- | :--- | :--- | :--- |
| **`public.frontdesk_departments`** | `id UUID PK`, `slug TEXT UNIQUE` | Configurable corporate departments (no invented staff). Columns: `slug`, `display_name`, `description`, `routing_keywords TEXT[]`, `supported_languages TEXT[]`, `priority INT`, `is_active BOOLEAN`, `default_sla_minutes INT`, `created_at/updated_at TIMESTAMPTZ`. | `idx_fd_departments_active_priority (is_active, priority)` |
| **`public.frontdesk_human_agents`** | `id UUID PK`, `agent_code TEXT UNIQUE`, `admin_user_email TEXT` | Employee presence & capacity (adapted from Helix `AgentProfile`). Columns: `display_name`, `email`, `availability_state TEXT CHECK (IN ('offline','available','busy','break'))`, `preferred_language TEXT`, `supported_languages TEXT[]`, `department_slugs TEXT[]`, `max_concurrent_sessions INT DEFAULT 1 CHECK (>=1)`, `active_session_count INT DEFAULT 0 CHECK (>=0 AND <= max_concurrent_sessions)`, `current_session_key TEXT`, `last_offered_at TIMESTAMPTZ`, `last_heartbeat_at TIMESTAMPTZ`, `state_changed_at TIMESTAMPTZ`. | `idx_fd_agents_availability (availability_state, last_offered_at ASC NULLS FIRST)` |
| **`public.frontdesk_agent_assignments`** | `id UUID PK`, `idempotency_key TEXT UNIQUE` | Auditable atomic handoff lifecycle (replaces Helix single-column busy flag with expiry & confirmation). Columns: `session_key TEXT REFERENCES ai_conversation_sessions(session_key) ON DELETE CASCADE`, `agent_id UUID REFERENCES frontdesk_human_agents(id)`, `department_slug TEXT`, `status TEXT CHECK (IN ('offered','accepted','declined','expired','completed','released'))`, `offered_at`, `expires_at TIMESTAMPTZ`, `accepted_at`, `released_at`, `reassignment_count INT DEFAULT 0`, `notes TEXT`. | `idx_fd_assignments_session`, `idx_fd_assignments_expiry (status, expires_at)` |
| **`public.frontdesk_conversation_messages`** | `id UUID PK`, `turn_id TEXT UNIQUE`, `idempotency_key TEXT UNIQUE` | Unified ordered voice + chat transcript & memory log. Columns: `session_key TEXT REFERENCES ai_conversation_sessions(session_key) ON DELETE CASCADE`, `turn_sequence INT NOT NULL`, `channel TEXT CHECK (IN ('chat','voice'))`, `role TEXT CHECK (IN ('visitor','assistant','system','human_agent'))`, `content TEXT NOT NULL`, `detected_language TEXT`, `intent TEXT`, `department_slug TEXT`, `provider_used TEXT`, `latency_ms INT`, `metadata_json JSONB`, `created_at TIMESTAMPTZ`. | `UNIQUE (session_key, turn_sequence)`, `idx_fd_messages_session_seq (session_key, turn_sequence ASC)` |
| **`public.frontdesk_callback_requests`** | `id UUID PK`, `reference_code TEXT UNIQUE`, `idempotency_key TEXT UNIQUE` | Structured callback fallback when after-hours, holiday, or all agents busy. Columns: `session_key`, `department_slug`, `visitor_name`, `visitor_email`, `visitor_phone`, `preferred_window`, `timezone`, `reason`, `status TEXT CHECK (IN ('pending','scheduled','completed','cancelled'))`, `assigned_agent_id UUID`, `created_at/updated_at TIMESTAMPTZ`. | `idx_fd_callbacks_status_created (status, created_at DESC)` |
| **`public.frontdesk_holidays_and_hours`** | `id UUID PK`, `record_type TEXT`, `holiday_date DATE` | Configurable corporate business hours & holidays (replaces Helix `Holiday` + `.env` hours). Columns: `record_type CHECK (IN ('business_hours','holiday'))`, `timezone TEXT`, `day_of_week SMALLINT`, `open_time TIME`, `close_time TIME`, `holiday_date DATE`, `holiday_name TEXT`, `is_active BOOLEAN`. | `UNIQUE NULLS NOT DISTINCT (record_type, holiday_date, day_of_week)` |
| **`public.frontdesk_consent_records`** | `id UUID PK` | Explicit privacy, microphone, transcription, and data-retention consent log. Columns: `session_key`, `owner_email`, `consent_type TEXT CHECK (IN ('voice_processing','transcript_storage','callback_contact','inquiry_submission'))`, `granted BOOLEAN`, `policy_version TEXT`, `ip_hash TEXT`, `recorded_at TIMESTAMPTZ`, `expires_at TIMESTAMPTZ`. | `idx_fd_consent_session (session_key, consent_type)` |
| **RPC `public.claim_frontdesk_human_agent(...)`** | PostgreSQL `SECURITY DEFINER` function | Atomic longest-idle claiming with **`SELECT ... FOR UPDATE SKIP LOCKED`** filtering `availability_state = 'available' AND active_session_count < max_concurrent_sessions`, ranking exact department match -> preferred language -> supported language -> `last_offered_at ASC NULLS FIRST`, atomically incrementing `active_session_count`, setting `availability_state = 'busy'` when at capacity, inserting an `offered` assignment row with `expires_at`, and returning the claimed assignment. | Eliminates concurrent double-assignment race conditions across horizontal Railway replicas |
| **RPC `public.expire_stale_frontdesk_assignments()`** | PostgreSQL cleanup function | Expires unaccepted `offered` assignments past `expires_at`, decrements `active_session_count`, restores `available` state, and flags sessions for reassignment or callback fallback. | Prevents stuck busy employees on missed handoffs |

---

## 3. Row-Level Security, Tenant Isolation & Retention Rules
- Every new table executes `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` with explicit `service_role` full-access policies (`TO service_role USING (true) WITH CHECK (true)`), matching migrations `008` and `009`.
- Public `anon` and authenticated client roles have **zero direct table access**; all reads/writes pass through DESTRIA's Express backend enforcing session-token scoping (anonymous sessions), `ownerEmail` isolation (Client Portal), and `requireAdmin` + CSRF (Admin Command Center).
- `DELETE /api/frontdesk/session/:sessionId` cascades cleanly to `frontdesk_conversation_messages`, `frontdesk_pending_submissions`, and draft consent state while preserving formally submitted `frontdesk_project_inquiries` and compliance `audit_logs`.
- Migration metadata inserts `'010'` into `public.schema_migration_metadata` (`ON CONFLICT DO NOTHING`).
