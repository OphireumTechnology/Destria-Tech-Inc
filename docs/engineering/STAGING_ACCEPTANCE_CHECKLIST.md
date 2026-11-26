# DESTRIA TECH INC — Staging & Production Acceptance Checklist

**Directive:** `DTI-MASTER-REPAIR-001`  
**Current Classification:** **`CI_VALIDATED`** (Local builds, linting, routing, security PoCs, and `175/175` automated tests passed).  
This checklist defines every live external verification gate required to progress from **`CI_VALIDATED`** -> **`STAGING_ACCEPTED`** -> **`PRODUCTION_ACCEPTED`**.

---

## 1. Git & GitHub Actions Gates (`BLOCKED` — No `.git` in local sandbox)
- [ ] Commit all verified changes to branch `repair/master-production-readiness` in `https://github.com/OphireumTechnology/Destria-Tech-Inc` and open PR into `main`.
- [ ] Verify GitHub Actions `CI Security & Stabilization Checks` passes 100% (`verify:routing`, `typecheck`, `lint`, `build`, `verify:routing:dist`, `test:unit`, `test:integration`, `test:security`, `build:server`, migration `007`/`008` checks, zero `Paste_*`, zero `localhost:3000` in `dist/assets/`).
- [ ] Confirm GitHub Actions variable `VITE_API_BASE_URL` = `https://api.destriatech.com`.

## 2. Production API Hosting & DNS Gates (`BLOCKED` — `api.destriatech.com` Confirmed NXDOMAIN)
- [ ] Provision Railway backend service from `OphireumTechnology/Destria-Tech-Inc` using `railway.json` (`npm run build && npm run build:server`, `npm run start`).
- [ ] Attach custom domain `api.destriatech.com` in Railway and create the DNS `CNAME` record (`api` -> `<railway-target>`).
- [ ] Configure required secrets in Railway secret store (`NODE_ENV=production`, `TRUST_PROXY=true`, `ALLOWED_ORIGINS`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `ADMIN_SESSION_SECRET`, `PORTAL_SIGNING_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, dual executive recipient lists, optional Google Calendar credentials).
- [ ] Verify `GET https://api.destriatech.com/healthz` (`200`), `GET https://api.destriatech.com/ready` (`200`), and CORS preflight from `https://destriatech.com`.

## 3. Supabase Database & Migration Gates (`BLOCKED` — External DB)
- [ ] Execute `supabase/migrations/007_ai_frontdesk_platform.sql` and `supabase/migrations/008_ai_frontdesk_durability_hardening.sql` on staging/production Supabase PostgreSQL.
- [ ] Confirm `frontdesk_pending_submissions`, `idempotency_key`, `record_json`, triggers, and RLS policies exist in `pg_policies`.
- [ ] Submit a staging AI Front Desk inquiry, restart the Railway container, and verify the inquiry, confirmation token consumption, and knowledge documents survive the restart intact.

## 4. Live Admin Auth & Deployment Parity Gates (`BLOCKED` — External Hosting)
- [ ] Sign in at `https://destriatech.com/admin/login` and verify `dti_admin_session` cookie carries `HttpOnly; Secure; SameSite` and zero tokens appear in `localStorage` or `sessionStorage`.
- [ ] Inspect `GET https://api.destriatech.com/api/admin/system-health` and confirm `deployment.databaseMigrationVersion === "008"`, `deployment.apiCompatibilityVersion === "2026.11-dti-v2"`, and `subsystems.frontDeskPersistence.durable === true`.
- [ ] Click Sign Out and confirm `POST /api/admin/auth/logout` invalidates the session immediately.

## 5. Live Gemini AI, Voice Duplex & 30-Minute Microphone Soak (`BLOCKED` — External Key & Hardware)
- [ ] Verify real browser microphone capture -> `POST https://api.destriatech.com/api/voice/session` -> `wss://api.destriatech.com/api/voice/live` (`gemini-3.8-live`) across Chrome, Safari, Edge, and mobile browsers.
- [ ] Complete a 30-minute continuous voice soak test verifying barge-in interruption, zero self-echo loops, unanswered-question manual retry recovery, and zero memory leaks.
- [ ] Verify all 10 mandatory conversational prompts live against `gemini-4-hydrogen` (zero pricing leakage in English/Tagalog, **Desmond Hinds** identity accuracy).

## 6. Live Email & Google Calendar Gates (`BLOCKED` — External Providers)
- [ ] Submit one staging Service Inquiry and one staging Executive Consultation, verifying real inbox delivery to client + both executive recipients and Resend Svix webhook reconciliation to `delivered`.
- [ ] Verify Google Calendar free/busy conflict (`409`), booking event creation, DST timezone accuracy, client reschedule sync, and cancellation sync.
