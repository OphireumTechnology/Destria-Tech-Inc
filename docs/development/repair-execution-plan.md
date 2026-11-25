# DESTRIA TECH INC — Enterprise Repair Execution Plan

**Branch Target:** `repair/core-stabilization-nov25`  
**Owner Approval Required Before Production Cutover:** Yes  
**Plan Date:** 2026-11-25  

---

## 1. Execution Workstreams

### Workstream A — Clean URL Routing, Error Containment & Static Hosting Integrity
- Reconcile all public, governance, client portal, and admin routes in `src/config/routeManifest.json` and `src/config/routes.ts`, adding `/portal/documents`.
- Eliminate `__dirname` compatibility failure in `vite.config.ts` so `enterpriseCleanRoutesPlugin` generates refresh-safe `<route>/index.html`, `dist/404.html`, and `dist/CNAME` reliably on every build.
- Add root React `ErrorBoundary` (`src/components/ErrorBoundary.tsx`) to prevent unhandled runtime exceptions from rendering blank screens or leaking stack traces.

### Workstream B — Responsive Layout & Floating UI Coordination (320px–2560px)
- Establish a shared CSS z-index layering contract (`--destria-z-*`) and horizontal overflow protection (`overflow-x: clip`) in `src/index.css`.
- Ensure zero overlap between the bottom-right AI Consultant launcher (`AIConsultantWidget.tsx`), the bottom-left sticky Service Assessment bar (`ServicesSection.tsx`), and footer legal/governance links (`Footer.tsx`).
- Harden mobile/tablet header spacing and scrollable mobile drawer behavior (`Header.tsx`, `PortalLayout.tsx`).

### Workstream C — Dedicated Backend API, Health Probes & Security Hardening
- Standardize canonical backend API origin to `https://api.destriatech.com` (`src/lib/apiClient.ts`) and remove legacy `ophireummultimedia.com` from default CORS allowlist (`src/server/app.ts`).
- Enforce 20-second `AbortController` request timeouts in `apiClient.ts` and `portalApi.ts`.
- Add `/healthz` (liveness), `/ready` (dependency readiness), and enhanced `/api/health` reporting.
- Apply strict API security headers (`Content-Security-Policy`, `Cross-Origin-Resource-Policy: same-site`, `X-Permitted-Cross-Domain-Policies: none`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`).

### Workstream D — Durable Supabase Persistence & Non-Destructive Schema Evolution
- Author additive, idempotent migration `supabase/migrations/003_enterprise_portal_stabilization.sql` (zero `DROP`/`TRUNCATE` statements).
- Upgrade `SupabasePortalRepository` to execute real parameterized queries and private Supabase Storage uploads/downloads.
- Implement fail-closed `UnconfiguredPortalRepository` so production (`NODE_ENV=production`) never silently persists Client Portal data into volatile container memory.

### Workstream E — Real Transactional Email & Complete Password Recovery Lifecycle
- Add clean-URL Client Portal email templates in `src/server/services/emailService.ts` (verification, password recovery, security alert, email change, lifecycle notifications).
- Wire real dispatch into `src/server/portal/portalRoutes.ts` with honest delivery status (`provider_accepted`, `unconfigured`, `failed`) and guaranteed session revocation + one-time token invalidation on password reset.

### Workstream F — Executive Consultation Pathways, AI Voice Integrity & File Security
- Implement distinct CEO (`Desmond Hines`) vs. CTO (`corporateIdentity.leadership.cto.name`) consultation pathways end-to-end and set default corporate timezone to `America/Denver`.
- Fix Gemini neural TTS double-WAV-wrapping bug in `/api/voice/speak` and replace simulated output waveform math with real Web Audio `AnalyserNode` metering in `aiVoiceService.ts`.
- Upgrade `@google/genai` to `^3.6.1`.
- Enforce server-side magic-byte file signature validation and SHA-256 / `quarantined_unscanned` metadata on portal uploads.

### Workstream G — Verification, Documentation & External Release Gates
- Author and execute automated acceptance & security regression tests (`tests/enterprise-stabilization.test.ts` plus updated `tests/deployment-integration.test.ts`).
- Publish all 8 mandatory governance/audit/operations documents and `walkthrough.md`.
- Hand off external provisioning, staging validation, live inbox/voice QA, backup restoration drill, and owner release sign-off before any production deployment.

---

## 2. Execution Gate Matrix

| Phase | Environment | Verification Requirement | Current Gate Status |
| :--- | :--- | :--- | :--- |
| **Phase 1: Source Repair & Build** | Local / CI | `tsc --noEmit`, Vite build, `build:server`, clean routing verification, full `node --test` suite | **Completed (`CI_VALIDATED`)** |
| **Phase 2: Git Branch & PR Review** | GitHub (`repair/core-stabilization-nov25`) | Commit changes, generate `package-lock.json`, run CI workflow & dependency CVE audit | **`BLOCKED` (No `.git`/remote in sandbox)** |
| **Phase 3: Staging Provisioning** | Railway Staging + Supabase Staging + Resend | Provision env vars, apply migration `003`, verify `/healthz` + `/ready` return 200 | **`BLOCKED` (Requires cloud credentials)** |
| **Phase 4: Live Acceptance QA** | Staging | Live inbox email receipt (SPF/DKIM/DMARC), live Gemini neural TTS listening test, 320px–2560px browser QA, backup restore drill | **`BLOCKED` (Pending Phase 3)** |
| **Phase 5: Production Release** | `destriatech.com` + `api.destriatech.com` | Executive Owner approval + Staging sign-off + Rollback readiness verification | **`OWNER_APPROVAL_REQUIRED`** |
