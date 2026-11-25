# DESTRIA TECH INC — Backup, Migration & Restoration Runbook

## 1. Authoritative Data Stores
1. **Supabase PostgreSQL**: Stores `solution_requests`, `consultation_appointments`, `notification_records`, `notification_webhook_events`, `audit_logs`, `admin_users`, and all Client Portal commerce/project tables including `portal_payment_refunds`.
2. **Supabase Private Storage (`portal-vault`)**: Stores isolated client uploads referenced by `project_attachments.stored_file_name` and verified via SHA-256 checksums (`content_sha256`).

## 2. Additive SQL Migration Sequence
Apply migrations strictly in numerical order inside the Supabase SQL Editor or Supabase CLI:
1. `supabase/migrations/001_phase1_stabilization.sql`
2. `supabase/migrations/002_client_portal_schema.sql`
3. `supabase/migrations/003_dual_recipient_notifications.sql`
4. `supabase/migrations/004_client_portal_hardening.sql`
5. `supabase/migrations/005_enterprise_production_readiness.sql`

All migrations use idempotent guards (`IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, safe constraint replacements) and enable Row-Level Security (`RLS`) on every new table.

## 3. Backup & Point-in-Time Recovery (PITR) Policy
- **Automated Daily Backups**: Enable Supabase daily automated backups and Point-in-Time Recovery (PITR) on the production project before onboarding live client engagements.
- **Pre-Migration Snapshot**: Always capture a manual database backup/dump prior to applying new migrations in staging or production.
- **Zero-Data-Loss Outbox Recovery**: Because inquiry/consultation records and outbox rows are persisted atomically via `register_solution_request_with_outbox` and `register_appointment_with_outbox`, restoring PostgreSQL preserves exact notification state; expired `processing` leases automatically recover via `claim_retryable_notifications` on worker startup.

## 4. Restoration Verification Checklist
1. Restore PostgreSQL snapshot to an isolated staging branch/instance first.
2. Verify schema presence (`notification_webhook_events`, `portal_payment_refunds`, RPC `claim_retryable_notifications`).
3. Confirm `GET /ready` returns `200` and `GET /api/admin/system-health` reports `database: HEALTHY` and `portalPersistence: HEALTHY`.
4. Verify no duplicate emails are dispatched for already `delivered` or `provider_accepted` outbox records.
