# DESTRIA TECH INC — Requirements Traceability Matrix (RTM)

- **Instruction ID:** `DTI-MASTER-REPAIR-001`
- **Repository:** `https://github.com/OphireumTechnology/Destria-Tech-Inc`
- **Canonical Production Origin:** `https://destriatech.com`
- **Release Classification:** `CODE_READY_EXTERNAL_INTEGRATION_BLOCKED`
- **Machine-Readable Companion:** [`requirements-traceability-matrix.json`](./requirements-traceability-matrix.json)

---

## 1. Honest Verification Scorecard

| Metric | Count | Percentage | Notes |
| --- | ---: | ---: | --- |
| Total Confirmed Defects (`ERR-001` – `ERR-018`) | 18 | 100.0% | 12 mandatory directive defects + 6 additional verified codebase defects |
| Repaired in Source Code & Additive SQL Migration | 18 / 18 | 100.0% | Zero stub shortcuts; all changes compiled and linted |
| Verified via Automated Local / Mocked Regression Tests | 18 / 18 | 100.0% | Executed via `node --test` against real Express app & repositories |
| Verified Against Live External Services | 0 / 18 | 0.0% | Blocked by environment boundary (no live Supabase, Resend, Payment, or Git push credentials in sandbox) |
| Defects Requiring Owner Live Staging Verification | 10 / 18 | 55.6% | Require applying migration `005` on Supabase and testing live Resend/Payment/Voice staging keys |

> **Honesty Statement:** This build is classified **`CODE_READY_EXTERNAL_INTEGRATION_BLOCKED`** (not `PRODUCTION_COMMISSIONED`). Automated tests prove code correctness, security controls, state machines, and protocol compliance locally, but the repository owner must apply SQL migrations `001`–`005` in Supabase, configure live staging secrets in Railway, and execute live staging end-to-end verification before production cutover.

---

## 2. Defect-to-Implementation Traceability Table

| ID | Group | Severity | Defect Summary | Primary Files Modified | Automated Verification | Live Staging Needed? |
| --- | --- | --- | --- | --- | --- | --- |
| **ERR-001** | Mandatory | Critical | Reject Resend responses missing `body.id`; parse HTTP 429 `Retry-After` backoff | `src/server/services/emailService.ts` | `VERIFIED_LOCAL_AUTOMATED` | Yes (Live Resend key) |
| **ERR-002** | Mandatory | Critical | Atomic lease claiming, expired lease recovery, bounded 5-attempt `dead_letter`, bounce/complaint suppression | `supabase/migrations/005_enterprise_production_readiness.sql`, `src/server/db/supabaseRepository.ts`, `src/server/services/emailService.ts`, `server.ts` | `VERIFIED_LOCAL_AUTOMATED` | Yes (Apply migration `005`) |
| **ERR-003** | Mandatory | High | Deterministic SHA-256 recipient-identity-bound `idempotencyKey` | `src/server/services/emailService.ts`, `supabase/migrations/005_enterprise_production_readiness.sql` | `VERIFIED_LOCAL_AUTOMATED` | No |
| **ERR-004** | Mandatory | High | Separate `provider_accepted` (HTTP 2xx) from webhook-confirmed `delivered` | `src/server/services/emailService.ts`, `src/server/db/types.ts`, `src/server/app.ts` | `VERIFIED_LOCAL_AUTOMATED` | Yes (Live Resend webhook) |
| **ERR-005** | Mandatory | High | Normalize Svix/Resend timestamps, enforce replay window, persist webhook dedupe | `src/server/services/emailService.ts`, `src/server/app.ts`, `src/server/db/supabaseRepository.ts`, `supabase/migrations/005_enterprise_production_readiness.sql` | `VERIFIED_LOCAL_AUTOMATED` | Yes (Live `RESEND_WEBHOOK_SECRET`) |
| **ERR-006** | Mandatory | High | Guard against out-of-order state regression, preserve original `deliveredAt`, reconcile early webhooks | `src/server/services/emailService.ts`, `src/server/db/supabaseRepository.ts` | `VERIFIED_LOCAL_AUTOMATED` | No |
| **ERR-007** | Mandatory | Critical | Replace `sbx_*` stubs with provider HTTP integrations (Xendit, PayPal, Maya, PayMongo, Card) with 15s timeout, live gate, and honest GoTyme deferral | `src/server/portal/payments/paymentAdapters.ts`, `src/server/portal/portalRoutes.ts`, `src/server/app.ts` | `VERIFIED_LOCAL_AUTOMATED` | Yes (Live sandbox keys) |
| **ERR-008** | Mandatory | High | Server-to-server payment verification endpoint (`POST /api/admin/portal/payments/:paymentId/verify`) | `src/server/portal/payments/paymentAdapters.ts`, `src/server/app.ts` | `VERIFIED_LOCAL_AUTOMATED` | Yes (Live sandbox keys) |
| **ERR-009** | Mandatory | Critical | RBAC-authorized, idempotent, over-refund-protected refunds (`POST /api/admin/portal/payments/:paymentId/refund`) + `portal_payment_refunds` RLS table | `supabase/migrations/005_enterprise_production_readiness.sql`, `src/server/portal/types.ts`, `src/server/portal/*PortalRepository.ts`, `src/server/app.ts` | `VERIFIED_LOCAL_AUTOMATED` | Yes (Apply migration `005` + sandbox) |
| **ERR-010** | Mandatory | Critical | Atomic intake registration + outbox persistence RPCs (`register_solution_request_with_outbox`, `register_appointment_with_outbox`) | `supabase/migrations/005_enterprise_production_readiness.sql`, `src/server/db/supabaseRepository.ts`, `src/server/services/emailService.ts`, `src/server/app.ts` | `VERIFIED_LOCAL_AUTOMATED` | Yes (Apply migration `005`) |
| **ERR-011** | Mandatory | High | Duplicate intake submissions return real persisted outbox delivery status (no fabricated `sent`) | `src/server/services/emailService.ts`, `src/server/app.ts` | `VERIFIED_LOCAL_AUTOMATED` | No |
| **ERR-012** | Mandatory | High | Constraint-specific appointment idempotency recovery (prevent swallowing unrelated `23505` errors) | `supabase/migrations/005_enterprise_production_readiness.sql`, `src/server/db/supabaseRepository.ts` | `VERIFIED_LOCAL_AUTOMATED` | Yes (Apply migration `005`) |
| **ERR-013** | Additional | Critical | Enforce `403 FILE_QUARANTINED` on both `POST /files/:fileId/sign` and `GET /files/download/:fileId` + admin scan clearance endpoint | `src/server/portal/portalRoutes.ts`, `src/server/portal/*PortalRepository.ts`, `src/server/app.ts` | `VERIFIED_LOCAL_AUTOMATED` | No |
| **ERR-014** | Additional | Medium | Close `outputAudioContext` in `stopSession()`, add 5-min idle cleanup timer & response latency metric | `src/services/aiVoiceService.ts` | `VERIFIED_LOCAL_AUTOMATED` | Yes (Live browser audio test) |
| **ERR-015** | Additional | High | HTTP slowloris timeouts (`requestTimeout`, `headersTimeout`, `keepAliveTimeout`), unique `workerId`, graceful `SIGTERM`/`SIGINT` shutdown | `server.ts` | `VERIFIED_LOCAL_AUTOMATED` | No |
| **ERR-016** | Additional | Low | Standardize logger service name to `destria-api` and add unified `--brand-*` CSS root token aliases | `src/server/logger.ts`, `src/index.css` | `VERIFIED_LOCAL_AUTOMATED` | No |
| **ERR-017** | Additional | Medium | Add Notification Ops (outbox table + controlled Retry) and System Health sub-tabs to Executive Console | `src/admin/AdminPortalApp.tsx`, `src/server/app.ts` | `VERIFIED_LOCAL_AUTOMATED` | No |
| **ERR-018** | Additional | High | Canonical `https://destriatech.com/portal/orders/:id` return/cancel URLs and durable persistence of `providerTransactionId` & `checkoutUrl` | `src/server/portal/portalRoutes.ts`, `src/server/portal/*PortalRepository.ts` | `VERIFIED_LOCAL_AUTOMATED` | No |

---

## 3. Preserved Non-Functional & Governance Invariants

- **Zero UI Redesign:** Public website, hero, logo, typography, animations, palette, footer, and clean URL routing remain preserved.
- **Zero Hash Routing (`/#/`):** Verified across source and production `dist/` output via `npm run verify:routing` and `npm run verify:routing:dist`.
- **Zero Internal Recipient or Secret Leakage:** Internal notification addresses (`artaxsvcs@gmail.com`, `dhenze.languisan@gmail.com`) and all server credentials stay strictly server-side; public contact remains `info@destriatech.com`.
- **CI/CD Hygiene:** `.github/workflows/ci.yml` enforces TypeScript checks, build, routing verification, automated test execution, SQL migration hygiene, and production bundle zero-leakage scanning.
