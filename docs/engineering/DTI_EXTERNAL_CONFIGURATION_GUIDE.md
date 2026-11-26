# DESTRIA TECH INC — External Infrastructure & Environment Configuration Manifest

**Directive:** `DTI-MASTER-COMPLETION-003` (Section 38)  
**Audit Date:** 2026-11-26  
**Security Rule:** Zero secret values appear in this document or `.env.example`.

---

## 1. Source-Reconciled Environment Variable Manifest

| Variable | Required In | Secret? | Provider / Source | Purpose | Missing-Configuration Behavior |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `NODE_ENV` | Railway (Staging/Prod) | No | Railway | Runtime mode (`production`) | Defaults to `development` |
| `PORT` | Railway (auto-injected) | No | Railway | HTTP listen port (`0.0.0.0:${PORT}`) | Defaults to `3000` |
| `TRUST_PROXY` | Railway (`1` or `true`) | No | Railway | Enables trusted proxy hop IP extraction | Express still trusts 1 hop; WS bridge uses `RAILWAY_ENVIRONMENT` / `TRUST_PROXY` |
| `SUPABASE_URL` | Railway (Mandatory) | No | Supabase | Server PostgreSQL & Auth endpoint | DB enters `unconfigured`; `/ready` returns `503` |
| `SUPABASE_SERVICE_ROLE_KEY` | Railway (Mandatory) | **YES** | Supabase | Privileged server-only DB access (bypasses anon RLS) | DB unconfigured; Front Desk fails closed `503` in strict prod |
| `FRONTDESK_PRODUCTION_STRICT` | Railway (`true`) | No | DESTRIA Ops | Forces fail-closed `503` if durable Front Desk DB missing | Defaults to `true` when `NODE_ENV=production` |
| `GEMINI_API_KEY` | Railway (Mandatory for AI) | **YES** | Google AI Studio / GCP | Server-side Gemini Chat, TTS, and Live API calls | Provider status reports `UNCONFIGURED`; governed fallback active |
| `GEMINI_LIVE_ENABLED` | Railway (`true`) | No | DESTRIA Ops | Toggles Gemini Live WebSocket bridge | Defaults to `true` |
| `GEMINI_LIVE_MODEL` | Railway | No | DESTRIA Ops | Approved Live model (`gemini-3.8-live`) | Defaults to `gemini-3.8-live` |
| `GEMINI_VOICE_NAME` | Railway | No | DESTRIA Ops | Approved voice (`Kore`, `Aoede`, etc.) | Defaults to `Kore` |
| `RESEND_API_KEY` | Railway (Mandatory for Email) | **YES** | Resend | Transactional email dispatch | Outbox marks `unconfigured`; zero fabricated delivery claims |
| `RESEND_WEBHOOK_SECRET` | Railway (Mandatory for Webhooks) | **YES** | Resend (Svix) | Verifies delivery/bounce webhook signatures | Webhook endpoint rejects unverified deliveries |
| `EMAIL_FROM` | Railway | No | Resend verified domain | Authorized sender identity (`noreply@destriatech.com`) | Uses configured fallback domain |
| `SERVICE_INQUIRY_RECIPIENTS` | Railway | No | DESTRIA Ops | Authorized executive inquiry recipient list | Uses default dual-recipient policy |
| `EXECUTIVE_CONSULTATION_RECIPIENTS` | Railway | No | DESTRIA Ops | Authorized executive consultation recipient list | Uses default dual-recipient policy |
| `GOOGLE_CALENDAR_ID` | Railway (Mandatory for Cal) | No | Google Workspace | Target executive consultation calendar ID | Calendar status reports `UNCONFIGURED`; bookings marked `pending_review` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Railway (Mandatory for Cal) | **YES** | Google Cloud IAM | Server-side Calendar OAuth2/JWT credentials | Calendar sync disabled; zero fabricated Meet links |
| `ADMIN_SESSION_SECRET` | Railway (Mandatory) | **YES** | Generated 32+ byte hex | HMAC signing key for `dti_admin_session` cookie/JWT | Ephemeral random key per boot (invalidates sessions across replicas!) |
| `ADMIN_BOOTSTRAP_EMAIL` | Railway | No | DESTRIA Ops | Bootstrap super-admin email | Bootstrap login disabled (`503 AUTH_NOT_CONFIGURED`) unless Supabase Auth admin used |
| `ADMIN_BOOTSTRAP_PASSWORD` | Railway | **YES** | DESTRIA Ops (12+ chars) | Bootstrap super-admin password | Bootstrap login disabled |
| `PORTAL_SIGNING_SECRET` | Railway (Mandatory) | **YES** | Generated 32+ byte hex | Client Portal document & token HMAC signing | Fails secure in production |
| `BACKUP_SIGNING_SECRET` | Railway / DR Ops | **YES** | Generated 32+ byte hex | HMAC-SHA256 authentication key for snapshot integrity | Snapshots explicitly downgrade to `sha256-checksum-only` |
| `ALLOWED_ORIGINS` | Railway | No | DESTRIA Ops | Comma-separated CORS allowlist (`https://destriatech.com,https://www.destriatech.com`) | Uses built-in canonical DESTRIA origins |
| `APP_BASE_URL` / `PUBLIC_ORIGIN` | Railway | No | DESTRIA Ops | Canonical frontend URL (`https://destriatech.com`) | Defaults to `https://destriatech.com` |
| `VITE_API_BASE_URL` | GitHub Actions Vars (Mandatory) | No | Railway custom domain | Frontend API target (`https://api.destriatech.com`) | `deploy-pages.yml` defaults to `https://api.destriatech.com` |
| `VITE_SUPABASE_URL` | GitHub Actions Vars | No | Supabase | Public Supabase Auth URL for Client Portal | Client Portal Auth unavailable |
| `VITE_SUPABASE_ANON_KEY` | GitHub Actions Vars | No (Public) | Supabase | Public Supabase anon key (RLS-restricted) | Client Portal Auth unavailable |

---

## 2. Owner Provisioning Runbook (Exact External Actions Required)

1. **Git Branch & CI Validation:**
   - Commit the verified workspace changes onto `repair/dti-final-development-commissioning`, push to GitHub, open a PR against `main`, and verify `.github/workflows/ci.yml` passes all checks (without auto-deploying production).
2. **Railway Backend Service Provisioning:**
   - Create/verify the dedicated DESTRIA TECH INC backend service in Railway pointing to `OphireumTechnology/Destria-Tech-Inc`.
   - Confirm `railway.json` runs `npm run build:server` and starts `npm run start:prod` (`node dist-server/server.mjs` — zero `devDependencies` required at runtime), with healthcheck path `/api/health`.
   - Configure all Railway variables listed in Section 1 above.
3. **DNS & TLS Configuration (`api.destriatech.com`):**
   - Add custom domain `api.destriatech.com` in Railway Networking, obtain the Railway CNAME target, and create the `api` CNAME record in the `destriatech.com` DNS zone.
   - Verify TLS issuance and confirm `curl -fsS https://api.destriatech.com/healthz` and `/ready` return HTTP `200` with `databaseMigrationVersion: "009"`.
4. **Supabase Database Migrations (`001`–`009`):**
   - Apply migrations `001` through `009` in order on staging first, then production only after staging acceptance & owner approval.
   - Verify `SELECT migration_id FROM public.schema_migration_metadata ORDER BY migration_id;` includes `007`, `008`, `009` and verify `pg_policies` confirms `service_role` policies on all tables.
5. **External Provider Commissioning:**
   - Verify live Gemini API key (`providerStatus: "READY"`), Resend domain SPF/DKIM/DMARC + Svix webhook delivery, and Google Calendar staging event create/reschedule/cancel.
