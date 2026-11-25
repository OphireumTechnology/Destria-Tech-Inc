# DESTRIA TECH INC — Enterprise Source-Code Audit

**Document Classification:** Internal Engineering & Quality Assurance Artifact  
**Target System:** DESTRIA TECH INC Corporate Web Platform, Client Portal & Dedicated Backend API  
**Production Domains:** `https://destriatech.com/` (Frontend) · `https://api.destriatech.com` (Backend API)  
**GitHub Preview Origin:** `https://ophireumtechnology.github.io/Destria-Tech-Inc/`  
**Audit Date:** 2026-11-25  

---

## 1. Repository & Runtime Architecture Inventory

The application is a decoupled TypeScript full-stack platform consisting of:

1. **Public Corporate Website & Client Portal SPA (`src/`)**
   - Framework: React 19, React Router DOM (`BrowserRouter`), Vite 6, Tailwind CSS v4.
   - Routing Governance: `src/config/routeManifest.json`, `src/config/routes.ts`, `scripts/build-pages-routes.mjs`, `scripts/verify-clean-routing.mjs`, and `vite.config.ts` (`enterpriseCleanRoutesPlugin`).
   - Corporate Identity Single Source of Truth: `src/data/companyConfig.ts` (`corporateIdentity`, `COMPANY_CONFIG`, legal/commercial statements).
   - Client Portal SPA: `src/portal/` (`ClientPortalApp.tsx`, `PortalAuthContext.tsx`, `PortalRouter.tsx`, `portalApi.ts`, `components/PortalLayout.tsx`, `login/`, and `pages/`).
   - AI Consultant & Voice Interface: `src/components/consultant/AIConsultantWidget.tsx`, `src/services/aiConsultantService.ts`, `src/services/aiVoiceService.ts`, `src/components/consultant/AppointmentBookingModal.tsx`.

2. **Dedicated Express API Server (`server.ts`, `src/server/`)**
   - Core Server Factory: `src/server/app.ts` (`createApp`) with CORS allowlist, security headers, rate limiting, structured logging, health/readiness probes, AI chat/voice endpoints, inquiry intake, consultation booking, and admin RBAC routes.
   - Client Portal Router: `src/server/portal/portalRoutes.ts` (`createPortalRouter`), `src/server/portal/supabasePortalRepository.ts`, `src/server/portal/localPortalRepository.ts`, `src/server/portal/payments/paymentAdapters.ts`.
   - Core Services: `src/server/services/emailService.ts`, `src/server/services/calendarService.ts`, `src/server/aiCommercialPolicy.ts`, `src/server/validation.ts`, `src/server/auth.ts`.

3. **PostgreSQL / Supabase Schema & Migrations (`supabase/`)**
   - `supabase/schema.sql`
   - `supabase/migrations/001_phase1_security_and_persistence.sql`
   - `supabase/migrations/002_client_portal_commerce.sql`
   - `supabase/migrations/003_enterprise_portal_stabilization.sql` (added during this stabilization cycle)

---

## 2. Subsystem Audit Findings & Status

| Subsystem | Key Audit Findings (Pre-Repair) | Remediation Applied in Source | Current Status |
| :--- | :--- | :--- | :--- |
| **Clean URL Routing & Static Hosting** | `/portal/documents` missing from route manifest and router; `vite.config.ts` used `__dirname` under native Vite loader causing `dist/index.html` resolution failures; no root React `ErrorBoundary`. | Added `/portal/documents` across `routeManifest.json`, `routes.ts`, `ClientPortalApp.tsx`, and `PortalLayout.tsx`; replaced `__dirname` with `import.meta.dirname` in `vite.config.ts`; created and mounted `src/components/ErrorBoundary.tsx`. | `CI_VALIDATED` |
| **Responsive & Floating UI Coordination** | Mobile/tablet risk of bottom-right AI Consultant launcher overlapping footer legal links and bottom-left sticky Service Assessment bar; header spacing tight at 320px–1024px; no root `overflow-x: clip` or shared z-index token contract. | Defined `--destria-z-*` layer tokens and `overflow-x: clip` in `src/index.css`; hardened `Header.tsx`, `Footer.tsx`, `ServicesSection.tsx`, `AIConsultantWidget.tsx`, `PortalLayout.tsx`, and `App.tsx`. | `CODE_REPAIRED` (Pending live 320px–2560px browser visual QA in staging) |
| **API Client & CORS Governance** | `src/lib/apiClient.ts` defaulted to legacy `https://api.ophireummultimedia.com`; `src/server/app.ts` trusted `https://ophireummultimedia.com` by default; `apiFetchJson` and `portalRequest` lacked `AbortController` timeouts. | Migrated canonical API origin to `https://api.destriatech.com`; removed legacy `ophireummultimedia.com` from default CORS allowlist; enforced 20s `AbortController` timeouts across `apiClient.ts` and `portalApi.ts`. | `CI_VALIDATED` |
| **Durable Portal Persistence** | `SupabasePortalRepository` previously inherited volatile `LocalPortalRepository` memory without real Supabase auth/session/file/proposal queries; production fell back to volatile memory when DB env vars were absent. | Added additive migration `003_enterprise_portal_stabilization.sql`; implemented real parameterized Supabase queries + private Storage in `SupabasePortalRepository`; added fail-closed `UnconfiguredPortalRepository` returning HTTP `503 DATABASE_UNAVAILABLE` in production. | `CI_VALIDATED` (Live Supabase execution `BLOCKED` pending credentials) |
| **Transactional Email & Password Recovery** | Client Portal auth routes generated verification/reset tokens without invoking `TransactionalEmailService`, leaving users unable to receive real verification or password recovery emails. | Added portal email templates and dispatchers to `emailService.ts` with clean canonical URLs (`https://destriatech.com/portal/...`, zero `/#/`); wired into register, resend-verification, forgot-password, reset-password, change-password, and email-change flows with honest delivery statuses. | `CI_VALIDATED` (Live Resend inbox verification `BLOCKED` pending `RESEND_API_KEY` & verified domain) |
| **AI Voice Neural TTS & Metering** | `/api/voice/speak` unconditionally wrapped Gemini audio output in a second RIFF/WAVE header if Gemini returned encoded WAV; `aiVoiceService.ts` simulated output waveforms with `Math.sin`/`Math.random()`. | Added RIFF/WAVE header detection in `/api/voice/speak` to prevent double-wrapping; upgraded `aiVoiceService.ts` to decode Gemini WAV via Web Audio `AudioContext` + `AnalyserNode` for real output amplitude metering and explicit `VoiceEngineType` status. | `CI_VALIDATED` (Live neural voice listening QA `BLOCKED` pending `GEMINI_API_KEY` in staging) |
| **Executive Consultation Pathways** | Booking UI and backend lacked distinct CEO vs. CTO consultation pathways and defaulted availability/Calendar links to `Asia/Manila` instead of Destria's Cheyenne, Wyoming headquarters (`America/Denver`). | Added `executivePathway` (`'ceo' | 'cto' | 'advisory'`) end-to-end (UI, validation, API routing to Desmond Hines / CTO, DB migration 003); updated default timezone to `America/Denver`. | `CI_VALIDATED` |
| **File Upload Security** | Upload route verified extension/MIME allowlists and size, but did not inspect file magic bytes or track scan/quarantine metadata. | Added server-side magic-byte signature validation (`validateUploadedFileSignature`) rejecting spoofed executables/HTML scripts with `400 INVALID_FILE_SIGNATURE`; recorded `contentSha256`, `scanStatus: 'quarantined_unscanned'`, and blocked downloads of `'flagged'` files. | `CI_VALIDATED` (External AV engine `BLOCKED` pending infrastructure integration) |
| **Health Probes & Security Headers** | Missing `/healthz` and `/ready` probes; missing explicit API CSP, `Cross-Origin-Resource-Policy`, and `X-Permitted-Cross-Domain-Policies` headers. | Added `/healthz` (200), `/ready` (200/503), enhanced `/api/health`, and applied strict security headers across API responses. | `CI_VALIDATED` |
| **Supply Chain & Lockfile Governance** | `@google/genai` was behind the current release (`^1.29.0`); no committed `package-lock.json` exists in workspace, preventing `npm audit`. | Upgraded `@google/genai` to `^3.6.1`. Lockfile generation and full CVE scan remain tracked as a pre-release requirement. | `CODE_REPAIRED` / `BLOCKED` (lockfile required before release) |

---

## 3. Environment Constraints & Audit Honesty Statement

This audit was performed directly against the local workspace filesystem (`/app/applet`). The environment does **not** contain:
- A local `.git` repository or GitHub remote push/PR credentials;
- Live Railway, Supabase, Resend, Google Calendar, or Gemini API production secrets;
- Live staging or production URLs connected to the repaired branch.

Consequently, all source-code repairs and automated integration/security tests executed locally are recorded as `CODE_REPAIRED` or `CI_VALIDATED`, while external provisioning, migration execution, live inbox delivery, live neural audio listening, backup restoration drills, and production smoke checks are transparently recorded as `BLOCKED` or `OWNER_APPROVAL_REQUIRED`.
