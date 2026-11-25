# DESTRIA TECH INC — Backup, Recovery & Rollback Readiness Runbook

**Status:** `BLOCKED` (Live database backup restoration drill has **not** been executed because no live Supabase PostgreSQL instance is provisioned in this workspace)  
**Owner:** DESTRIA TECH INC Infrastructure & Engineering Operations  
**Last Updated:** 2026-11-25  

---

## 1. Recovery Objectives (Target SLA)

| Metric | Target | Notes |
| :--- | :--- | :--- |
| **RPO (Recovery Point Objective)** | `<= 15 minutes` (PITR) / `<= 24 hours` (Daily Snapshot) | Requires Supabase Pro/Team Point-in-Time Recovery (PITR) enabled before production launch. |
| **RTO (Recovery Time Objective)** | `<= 60 minutes` | Includes database restoration, Railway backend redeploy/rollback, and `/ready` + smoke verification. |

---

## 2. Pre-Deployment Backup Procedure (Mandatory Before Applying Migration `003`)

1. **Create Manual Logical Backup Snapshot (PostgreSQL):**
   ```bash
   pg_dump "$SUPABASE_DB_URL" \
     --format=custom \
     --no-owner \
     --no-privileges \
     --file="destria_pre_migration003_$(date -u +%Y%m%dT%H%M%SZ).dump"
   ```
2. **Verify Dump Archive Integrity:**
   ```bash
   pg_restore --list destria_pre_migration003_*.dump | head -n 40
   ```
3. **Export Private Storage Object Inventory:**
   - Record object manifest and SHA-256 checksums for the `portal-private-files` Supabase Storage bucket.
4. **Apply Migration `003_enterprise_portal_stabilization.sql`:**
   - Migration `003` is strictly additive (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE POLICY` guarded safely). No existing tables or rows are dropped or truncated.

---

## 3. Staging Backup Restoration Drill Protocol (Required Before Go-Live)

> **Honesty Declaration:** This restoration drill has **NOT** been executed yet. Production release is blocked until a live restoration drill is completed against a non-production Supabase staging project and signed off with timestamps and row-count parity evidence.

1. Restore the latest logical dump or PITR snapshot into an isolated **Supabase Staging Clone** project:
   ```bash
   pg_restore --dbname="$STAGING_CLONE_DB_URL" --clean --if-exists --no-owner destria_pre_migration003_*.dump
   ```
2. Verify row counts and schema integrity across critical tables:
   - `solution_requests`, `consultation_appointments`, `email_outbox`, `audit_logs`, `admin_users`
   - `portal_auth_users`, `portal_sessions`, `client_profiles`, `billing_addresses`
   - `orders`, `payments`, `invoices`, `credit_wallets`, `projects`, `project_attachments`, `approved_proposals`, `custom_package_inquiries`
3. Verify RLS policies remain active (`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';`).
4. Point a staging Railway instance at the restored database and confirm `GET /ready` returns `200 OK` and a test client login + signed file download succeeds.

---

## 4. Application Rollback Plan

### Frontend Rollback (GitHub Pages — `destriatech.com`)
1. Revert the merge commit on `main` (or re-run the prior known-good `deploy-pages.yml` workflow artifact).
2. Confirm `dist/CNAME` contains `destriatech.com` and run `npm run verify:routing:dist`.
3. Verify `https://destriatech.com/`, `https://destriatech.com/portal/login`, and `https://destriatech.com/portal/documents` resolve with HTTP 200 and zero `/#/` redirects.

### Backend Rollback (Railway — `api.destriatech.com`)
1. Trigger instant Railway deployment rollback to the previous verified release container.
2. Because Migration `003` is strictly additive (new columns have safe defaults/nullability and new tables are non-breaking), rolling back the Node.js application container does **not** require destructive database down-migrations.
3. Verify `GET https://api.destriatech.com/healthz` and `GET https://api.destriatech.com/ready` return `200 OK`.
4. Review structured logs (`x-request-id`) for 15 minutes post-rollback before declaring incident closure.
