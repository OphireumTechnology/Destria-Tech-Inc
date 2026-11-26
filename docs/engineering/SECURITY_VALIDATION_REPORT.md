# DESTRIA TECH INC — Security Validation Report

**Directive:** `DTI-MASTER-REPAIR-001`  
**Audit Date:** 2026-11-26

---

## 1. Security Posture & Controls Audited

A full application-wide security audit was performed across the Express backend (`src/server/app.ts`, `src/server/auth.ts`, `src/server/frontDeskRepository.ts`, `src/server/frontDeskStore.ts`, `src/server/voiceLiveBridge.ts`, `src/server/aiToolsEngine.ts`, `src/server/aiRuntimeConfig.ts`, `src/server/portal/portalRoutes.ts`, `src/server/services/emailService.ts`), frontend application (`src/admin/*`, `src/components/*`, `src/lib/apiClient.ts`, `src/services/*`), public assets (`public/`), SQL migrations (`supabase/migrations/`), and CI/CD pipelines (`.github/workflows/`).

### Verified Controls
- **Admin Authentication & CSRF Hardening:** Login issues an HMAC-SHA256 signed session cookie (`dti_admin_session`, `HttpOnly`, `SameSite`, `Secure` in production) with constant-time verification (`crypto.timingSafeEqual`). All `sessionStorage`/`localStorage` storage of admin tokens was eliminated and banned permanently via `scripts/lint-codebase.mjs` (`no-webstorage-auth-token`). Mutating cookie-authenticated requests require `X-Requested-With: XMLHttpRequest` (`403 CSRF_CHECK_FAILED` if missing). `POST /api/admin/auth/logout` revokes the token `jti` immediately server-side and clears the cookie (`Max-Age=0`).
- **Public Asset Hygiene:** All 8 internal AI Studio `Paste_*` files under `public/assets/aistudio/` were deleted and permanently blocked across linter, routing check, and CI workflows so internal engineering prompts cannot be served publicly.
- **Secret Isolation & Error Redaction:** `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `ADMIN_SESSION_SECRET`, `PORTAL_SIGNING_SECRET`, and internal executive notification emails are strictly server-side and screened out of `dist/`. `classifyGeminiProviderError()` redacts any `AIzaSy...` API keys and `Bearer ...` tokens before logging or storing diagnostics.
- **Fail-Closed Durable Persistence:** Production strict mode rejects unconfigured Front Desk persistence with HTTP `503 DATABASE_UNAVAILABLE`. Migrations `001`–`008` are additive, idempotent, and enforce PostgreSQL Row-Level Security (RLS).
- **Rate-Limiting & Token Replay Safety:** Express uses trusted-proxy `req.ip` (blocking forged `X-Forwarded-For` rotation), WebSocket upgrades verify `Origin` and rightmost proxy hop behind `TRUST_PROXY`, and single-use confirmation tokens are consumed atomically before persistence.
- **URL, Mixed-Content & Script Injection Safety:** `src/lib/apiClient.ts` rejects embedded URL credentials, prevents `/api/api` duplication, enforces HTTPS/WSS on secure pages, and rejects localhost targets on production hostnames. JSON-LD `<script>` payloads escape `<` as `\u003c`.

---

## 2. Automated Security Proof-of-Concept Verification

All controls are verified automatically on every `npm run test:security` run (`tests/security-hardening-regression.test.ts` + `tests/master-bulk-repair-dti001.test.ts`):
1. **Admin Cookie Auth, CSRF 403 Block & Logout Revocation (`tests/master-bulk-repair-dti001.test.ts` Section 5)** — Confirmed `HttpOnly` cookie issuance, `403 CSRF_CHECK_FAILED` without `X-Requested-With`, `201` with header, and `401` after `POST /api/admin/auth/logout`.
2. **Fail-Closed 503 Production Mode, Optimistic Version 409 & Duplicate Approval 409 (`tests/master-bulk-repair-dti001.test.ts` Section 4)** — Confirmed production fails closed when durable DB is absent and blocks stale/duplicate mutations.
3. **Gemini API Key Redaction & Public Asset / Web Storage Screening (`tests/master-bulk-repair-dti001.test.ts` Sections 3 & 7)** — Confirmed zero leaked keys in classified error messages, zero `Paste_*` files in `public/`, and zero admin token web storage references in `src/`.
4. **Rate-Limit IP Spoofing, Cross-Session Token Hijacking & WebSocket Origin Blocking (`tests/security-hardening-regression.test.ts` PoCs 1–3)** — Confirmed `429`, `400`, and `403` enforcement.

---

## 3. Residual Risk & External Environment Requirements
- Production hosting on Railway must set `NODE_ENV=production`, `TRUST_PROXY=true`, `ALLOWED_ORIGINS`, `ADMIN_SESSION_SECRET`, `PORTAL_SIGNING_SECRET`, `RESEND_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `GEMINI_API_KEY` exclusively in Railway's encrypted secret store.
- Live TLS, HSTS, and cookie `Secure` flag delivery must be verified over HTTPS once `https://api.destriatech.com` is provisioned.
