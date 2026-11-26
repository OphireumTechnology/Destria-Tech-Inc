# DESTRIA TECH INC — Database & Persistence Acceptance Report

**Directive:** `DTI-MASTER-COMPLETION-003` (`DTI-C005`, `DTI-C006`, `DTI-C007`, `DTI-C030`)  
**Audit Date:** 2026-11-26  
**Honest Database Gate Status:** **`CI_VALIDATED` — Live PostgreSQL Staging Execution `BLOCKED (EXTERNAL)`**

---

## 1. Migration Inventory (`001` through `009`)
All 9 additive, idempotent SQL migrations are present, non-empty, RLS-enabled, and reconciled with server repositories:
- `001`–`004`: Core inquiries, appointments, admin users, audit logs, Client Portal commerce/wallets/documents.
- `005_enterprise_production_readiness.sql`: Atomic `claim_retryable_notifications` RPC, `notification_webhook_events`, `portal_payment_refunds`.
- `006_ceo_identity_correction.sql`: Canonical CEO identity **Desmond Hinds**.
- `007_ai_frontdesk_platform.sql`: Core AI Front Desk tables (`ai_conversation_sessions`, `frontdesk_project_inquiries`, `frontdesk_human_escalations`, `ai_quality_evaluations`, `ai_knowledge_documents`, etc.).
- `008_ai_frontdesk_durability_hardening.sql`: Reconciles `ai_conversation_sessions` (`dossier_version`, `dossier_json`, `updated_at`), sets `client_confirmed_at DEFAULT NOW()`, creates `frontdesk_pending_submissions`, adds `idempotency_key`, attaches explicit `service_role` RLS policies across all 11 `007` tables, and records `'007'` + `'008'` in `schema_migration_metadata`.
- `009_operational_hardening_and_durable_governance.sql` **(NEW in DTI-003)**: Creates `public.admin_revoked_sessions` (`jti`, `admin_email`, `revoked_at`, `expires_at`, `reason`) with `ENABLE ROW LEVEL SECURITY`, explicit `service_role` policy, `expires_at`/`admin_email` indexes, `purge_expired_admin_revoked_sessions()` cleanup function, and records `'009'` in `schema_migration_metadata`.

## 2. Volatile vs. Durable Storage Classification
| Storage Mechanism | Purpose & Classification | Production Policy |
| :--- | :--- | :--- |
| `SupabaseDatabaseRepository` + `SupabaseFrontDeskPersistenceAdapter` + `SupabasePortalRepository` | Primary durable operational persistence (sessions, pending confirmations, inquiries, masterplans, reviews, escalations, quality logs, KB, appointments, outbox, audit logs, revoked admin sessions) | **REQUIRED** in production; fails closed with HTTP `503 DATABASE_UNAVAILABLE` if unconfigured or unreachable |
| `FrontDeskStore` / `FrontDeskKnowledgeStore` internal `Map`s | Short-lived read-through cache synchronized via `*Durable` write-through methods | Always hydrated from & written through to PostgreSQL in strict mode |
| `AdminAuthService.revokedTokens` `Map` | Fast-path local cache backed by `admin_revoked_sessions` (`009`) via `revokeSessionTokenDurable()` & `isAdminSessionTokenRevoked()` | Revocations survive restarts and horizontal replicas; fails closed on DB lookup error in `NODE_ENV=production` |
| `SlidingWindowRateLimiter` `Map` | Per-instance abuse throttling | Acceptable single-instance throttle; Redis upgrade recommended if scaling horizontally |
| `SnapshotFrontDeskPersistenceAdapter` | Isolated automated test & local DR drill harness ONLY | Never used in production; upgraded to distinguish unkeyed SHA-256 checksums from real keyed **HMAC-SHA256** signatures (`crypto.timingSafeEqual`) |

## 3. Automated Proof Executed vs. External Staging Requirement
- **Executed Locally:** Static SQL `007`+`008` table/column/onConflict contract verification (`dti-bulk-repair-002-verification.test.ts` Suite 1), restart-survival + fail-closed `503` + `idempotencyKey` + `409` optimistic concurrency (`master-bulk-repair-dti001.test.ts` Sec 4), durable multi-instance `admin_revoked_sessions` logout verification (`dti-master-completion-003.test.ts` Suite 1), and keyed HMAC-SHA256 backup/tamper/downgrade/restore drill (`dti-master-completion-003.test.ts` Suite 2).
- **Blocked Externally (Honest Disclosure):** Static SQL parsing and local snapshot drills do **NOT** constitute live PostgreSQL execution acceptance. Applying `001`–`009` on an isolated Supabase PostgreSQL staging database, verifying live `pg_policies`, transaction isolation, restart survival on Railway, and executing a real `pg_dump`/PITR restore drill remain mandatory external blockers prior to `STAGING_ACCEPTED` and `PRODUCTION_ACCEPTED`.
