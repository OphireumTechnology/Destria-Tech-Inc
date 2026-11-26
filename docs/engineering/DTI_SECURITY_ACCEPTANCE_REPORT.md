# DESTRIA TECH INC — Security & Confidentiality Acceptance Report

**Directive:** `DTI-MASTER-COMPLETION-003` (`DTI-C026`, `DTI-C027`, `DTI-C030`)  
**Audit Date:** 2026-11-26  
**Automated Security Gate Status:** **PASS (`36 / 36` security tests, `0` lint violations, `0` dependency vulnerabilities)**  
**Hosted Staging Security Status:** **`BLOCKED (EXTERNAL)`** — live HTTPS cross-origin cookie validation, live Supabase `pg_policies` inspection, and live TLS/header audit require provisioned Railway + Supabase staging.

---

## 1. Security Hardening Completed in `DTI-MASTER-COMPLETION-003`

| Security Control | Implementation Details | Automated Proof |
| :--- | :--- | :--- |
| **Confidential Public Asset & Build Artifact Protection (`DTI-C027`)** | Deleted internal prompt dumps (`Paste_November_27__2026_-_2_04AM_13b24ae1`, `Paste_November_27__2026_-_2_23AM_13b24ae1`, and all prior `Paste_*` files). Expanded static and build-time scanners (`scripts/lint-codebase.mjs`, `scripts/verify-clean-routing.mjs`, `.github/workflows/ci.yml`, `.github/workflows/deploy-pages.yml`) to fail on `Paste_*`, `.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.sql`, `*.bak`, `*.dump`, `*.map`, and `*secret*`/`*credential*`/`*service-account*`/`*private-key*` filenames in `public/` or `dist/`. | `npm run lint` (`0` violations across `103` files), `npm run verify:routing:dist`, `tests/dti-master-completion-003.test.ts` Suite 4 |
| **Durable Multi-Instance Admin Session Revocation (`DTI-C026`, Migration `009`)** | Added `supabase/migrations/009_operational_hardening_and_durable_governance.sql` (`public.admin_revoked_sessions` with RLS + explicit `service_role` policy + `purge_expired_admin_revoked_sessions()`). Extended `SupabaseDatabaseRepository` and `AdminAuthService` (`revokeSessionTokenDurable()`, async durable check in `resolveAuthenticatedPrincipal()` that fails closed on DB lookup error in `NODE_ENV=production`). | `tests/dti-master-completion-003.test.ts` Suite 1 (simulated restart/replica blocks replayed token with HTTP `401`) |
| **Privacy Draft Session Deletion & Security Event Telemetry (`DTI-C011`, `DTI-C028`)** | Implemented `DELETE /api/frontdesk/session/:sessionId` (`deleteSessionDurable()`) to purge draft session dossiers and immediately invalidate pending confirmation tokens; added live measured security-event counters (`authFailures401`, `forbiddenOrCsrf403`, `rateLimitHits429`, `corsOriginBlocked`) and `deploymentVersion` structured logging. | `tests/dti-master-completion-003.test.ts` Suite 5 |
| **Authenticated Backup Snapshot Integrity (`DTI-C030`)** | Upgraded `exportSignedBackupSnapshot(signingKey?)` and `restoreSignedBackupSnapshot(snapshot, signingKey?)` in `src/server/frontDeskRepository.ts` to produce true keyed **HMAC-SHA256** signatures (`integrityMode: 'hmac-sha256'`) verified with `crypto.timingSafeEqual`, while explicitly labeling unkeyed exports as `sha256-checksum-only` and rejecting tampered payloads, wrong keys, and unsigned downgrades. | `tests/dti-master-completion-003.test.ts` Suite 2 |
| **Admin `HttpOnly` Cookie Auth & CSRF Protection** | Admin login issues `HttpOnly` cookie `dti_admin_session` with zero `sessionStorage`/`localStorage` persistence (`no-webstorage-auth-token` lint rule enforced). Cookie-authenticated mutations require `X-Requested-With` (`403 CSRF_CHECK_FAILED`). | `tests/master-bulk-repair-dti001.test.ts` Sec 5 & Sec 7 |
| **API Key Redaction & URL Safety** | `classifyGeminiProviderError()` strips `AIzaSy...` and `Bearer` tokens before logging across all 8 canonical provider states. `src/lib/apiClient.ts` strips embedded URL credentials, upgrades HTTP->HTTPS/WSS on secure origins, and blocks `localhost` targets in production bundles. | `tests/dti-master-completion-003.test.ts` Suite 3, `tests/master-bulk-repair-dti001.test.ts` Sec 1 & 3 |
| **Knowledge Prompt-Injection & Internal Isolation** | `/api/admin/frontdesk/knowledge` rejects prompt-override payloads with HTTP `400`; `/api/frontdesk/knowledge/public` excludes all `internal_only` records. | `tests/dti-bulk-repair-002-verification.test.ts` Suite 4 |
| **Rate-Limit Anti-Spoofing, Single-Use Tokens & WS Origin Guard** | Express limiters rely on trusted-proxy `req.ip` (`429` under `X-Forwarded-For` spoofing); AI confirmation tokens are session-bound & single-use (`400` on replay/hijack); Live WebSocket upgrades enforce `Origin` allowlist (`403`). | `tests/security-hardening-regression.test.ts` PoCs 1–3 |
| **Dependency Vulnerability Audit** | Executed `bun audit` across all `273` installed packages. | **PASS — `0` vulnerabilities** |

---

## 2. Honest Caveats & Required External Security Actions
1. **Historical Public Exposure Notice:** Deleting `Paste_*` files locally prevents future leaks in this workspace and upcoming builds, but does **not** retroactively purge prior git commits or previously deployed GitHub Pages artifacts. After pushing the repaired branch and deploying a clean `dist/`, the repository owner should inspect public commit history if confidential prompt text was previously committed.
2. **Hosted Cross-Origin Cookie Verification:** Live HTTPS `SameSite=None; Secure; HttpOnly` cookie delivery between `https://destriatech.com` and `https://api.destriatech.com` must be verified in real browsers once Railway + DNS are live.
3. **Live Database RLS Audit:** Execute `SELECT tablename, policyname, roles FROM pg_policies WHERE schemaname = 'public';` on staging Supabase after applying migrations `001`–`009` to confirm every operational table is protected by RLS and explicit `service_role` policies.
4. **Secret Hygiene:** Populate all secrets (`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `ADMIN_SESSION_SECRET`, `PORTAL_SIGNING_SECRET`, `BACKUP_SIGNING_SECRET`) solely in Railway environment secrets — never in repository files or GitHub Pages variables.
