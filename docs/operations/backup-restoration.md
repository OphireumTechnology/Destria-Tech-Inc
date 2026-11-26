# DESTRIA TECH INC — Backup, Migration & Disaster Recovery Runbook

**Directive:** `DTI-BULK-REPAIR-002` (DTI-015)  
**Updated:** 2026-11-26

---

## 1. Authoritative Data Stores Protected

1. **Supabase PostgreSQL (Primary Relational Store):**
   - Core operational records: `solution_requests`, `consultation_appointments`, `notification_records`, `notification_webhook_events`, `audit_logs`, `admin_users`
   - Client Portal commerce & projects: `portal_users`, `client_profiles`, `credit_wallets`, `portal_orders`, `portal_invoices`, `portal_payment_refunds`, `project_attachments`
   - AI Front Desk & Knowledge Management (`007` + `008`): `frontdesk_companies`, `frontdesk_client_profiles`, `ai_conversation_sessions`, `ai_conversation_turns`, `frontdesk_pending_submissions`, `frontdesk_project_inquiries`, `frontdesk_requirement_versions`, `frontdesk_executive_reviews`, `frontdesk_human_escalations`, `ai_knowledge_documents`, `ai_knowledge_versions`, `ai_quality_evaluations`, `schema_migration_metadata`
2. **Supabase Private Storage (`portal-vault`):** Isolated client uploads verified via SHA-256 checksums (`content_sha256`).

---

## 2. Additive SQL Migration Sequence (`001` through `008`)

Apply strictly in numerical order inside an isolated staging database first, then production only after executive approval and pre-migration snapshot capture:

1. `supabase/migrations/001_phase1_security_and_persistence.sql`
2. `supabase/migrations/002_client_portal_commerce.sql`
3. `supabase/migrations/003_enterprise_portal_stabilization.sql`
4. `supabase/migrations/004_dual_recipient_notifications.sql`
5. `supabase/migrations/005_enterprise_production_readiness.sql`
6. `supabase/migrations/006_ceo_identity_correction.sql`
7. `supabase/migrations/007_ai_frontdesk_platform.sql`
8. `supabase/migrations/008_ai_frontdesk_durability_hardening.sql`

Every migration is strictly additive and idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `ON CONFLICT DO NOTHING`) and enforces PostgreSQL Row-Level Security (RLS).

---

## 3. Proposed Recovery Objectives (Hosting-Dependent — Not Guaranteed Until Live Staging Verification)

| Metric | Proposed Target | Dependency |
| :--- | :--- | :--- |
| **Proposed RPO (Recovery Point Objective)** | `<= 15 minutes` (with Supabase PITR enabled) or `<= 24 hours` (daily automated backups only) | Requires Supabase Pro/PITR plan configuration on live project |
| **Proposed RTO (Recovery Time Objective)** | `<= 60 minutes` for full PostgreSQL restore + Railway backend verification | Must be measured during live staging restore drill |
| **Retention Policy** | 7-day PITR rolling window + 30-day encrypted daily backups + pre-migration snapshots | Configured in Supabase dashboard / encrypted object storage |

---

## 4. Isolated Backup & Restoration Procedure

### Pre-Migration & Scheduled Backup
1. Trigger a manual Supabase snapshot (or `pg_dump --format=custom --no-owner --no-privileges`) and record its SHA-256 digest (`sha256sum`).
2. Store encrypted backup artifacts outside the application runtime host (never inside Git or `public/`).

### Isolated Restoration Verification Steps
1. Provision an isolated disposable staging database / Supabase branch (NEVER test restore against production).
2. Restore the snapshot and verify the SHA-256 checksum prior to import.
3. Verify table counts, foreign keys, `pg_policies` RLS rules, and `schema_migration_metadata` (`'007'`, `'008'`).
4. Point staging Railway instance to the restored database and confirm:
   - `GET /ready` returns `HTTP 200`
   - `GET /api/admin/system-health` reports `database: HEALTHY`, `portalPersistence: HEALTHY`, `frontDeskPersistence.durable: true`, `deployment.databaseMigrationVersion: "008"`
   - Existing client inquiries, 25-section masterplans, executive reviews, escalations, and approved knowledge documents load intact without cross-client leakage
   - Already-`delivered` / `provider_accepted` email outbox records are NOT re-dispatched.

### Incident Recovery Scenarios
- **Backend Restart / Failed Deploy:** Redeploy last healthy Railway release (`docs/engineering/ROLLBACK_PLAN.md`); durable Front Desk & outbox records hydrate automatically from Supabase.
- **Database Outage:** Backend fails closed with HTTP `503 DATABASE_UNAVAILABLE` (zero false confirmations); recovers automatically upon DB restoration.
- **Interrupted Migration:** Because `001`–`008` are idempotent, re-run the interrupted migration safely after resolving the underlying error; never run destructive `DROP TABLE` rollbacks.
- **Provider Outage (Gemini / Resend / Calendar):** Gemini errors classify cleanly into 9 categories without leaking keys; Resend retries durably via `claim_retryable_notifications` up to 5 attempts; Calendar failures report honest `failed`/`unconfigured` states without fabricating Meet links.

---

## 5. Verification Status (Honest)
- **Locally Verified (`CI_VALIDATED`):** Isolated signed JSON snapshot backup -> SHA-256 tamper rejection -> full state wipe -> atomic restore -> full application retrieval verified in `tests/dti-bulk-repair-002-verification.test.ts`.
- **External Staging PostgreSQL Restore (`BLOCKED`):** Live `pg_dump` / Supabase PITR restoration drill requires external Supabase staging project access.
