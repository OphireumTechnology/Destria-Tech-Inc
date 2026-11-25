# DESTRIA TECH INC — Security Validation Report

## 1. Security Posture & Controls Audited
A full Tier 3 security audit was performed across the backend Express server (`src/server/app.ts`, `src/server/voiceLiveBridge.ts`, `src/server/aiToolsEngine.ts`, `src/server/aiRuntimeConfig.ts`, `src/server/auth.ts`, `src/server/portal/portalRoutes.ts`, `src/server/services/emailService.ts`), frontend components (`src/`), and CI/CD pipelines (`.github/workflows/`).

### Verified Controls
- **Authentication & RBAC:** Admin routes (`/api/admin/*`) enforce `authService.requireAdmin` with HMAC-SHA256 signed session tokens and constant-time signature comparison (`crypto.timingSafeEqual`). Client Portal routes (`/api/portal/*`) enforce SHA-256 hashed session tokens (`HttpOnly` cookies or Bearer headers) with ownership checks.
- **Secret Isolation:** `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `ADMIN_SESSION_SECRET`, `PORTAL_SIGNING_SECRET`, and internal executive notification emails (`artaxsvcs@gmail.com`, `dhenze.languisan@gmail.com`) are strictly server-side and screened out of `dist/` builds by both automated tests and CI workflows.
- **Database Safety:** All Supabase queries use `@supabase/supabase-js` parameterized client calls; zero raw SQL string interpolation exists in runtime code. Migrations `001` through `006` are additive, idempotent, and enforce Row-Level Security (RLS).
- **Webhook Integrity:** Resend delivery webhooks verify Svix HMAC-SHA256 signatures with a 5-minute replay tolerance window; payment gateway adapters verify provider signatures over raw payloads.
- **HTTP Security Headers:** Express disables `x-powered-by` and emits `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Resource-Policy`, API `Content-Security-Policy`, and production `HSTS` + `X-Frame-Options: DENY`.

## 2. Security Issues Found & Remediated During This Audit
1. **Rate-Limit Bypass via Untrusted `X-Forwarded-For` Header (`src/server/app.ts`, `src/server/voiceLiveBridge.ts`):**
   - *Finding:* Both `getClientIp()` and `getUpgradeClientIp()` extracted the leftmost value from `X-Forwarded-For`, allowing an external client to forge rotating IP headers and bypass rate limits.
   - *Remediation:* Switched Express `getClientIp()` to rely on `req.ip` (governed by `app.set('trust proxy', 1)`), and restricted WebSocket `getUpgradeClientIp()` to honor `X-Forwarded-For` only when `TRUST_PROXY` or `RAILWAY_ENVIRONMENT` is set, taking the rightmost proxy-appended hop.
   - *Verification:* Automated regression test (`PoC 1` in `tests/security-hardening-regression.test.ts`) confirms rotating forged `X-Forwarded-For` headers trigger HTTP `429` at the configured threshold.
2. **AI Confirmation Token Race Window & Endpoint Contract (`src/server/aiToolsEngine.ts`, `src/server/app.ts`):**
   - *Finding:* Single-use confirmation tokens were deleted after async DB persistence, creating a narrow concurrent replay window, and `/api/consultant/confirm-tool` rejected the frontend's `kind: 'inquiry' | 'consultation'` values.
   - *Remediation:* Consumed tokens atomically prior to persistence, maintained strict session ownership checks (`pending.sessionId === sessionId`), and restored full compatibility with canonical and shorthand confirmation kinds.
   - *Verification:* Automated regression test (`PoC 2` in `tests/security-hardening-regression.test.ts`) confirms cross-session token hijacking and post-use token replay are both rejected with HTTP `400`.
3. **JSON-LD Script Breakout Defense-in-Depth (`src/components/ResourcesPage.tsx`, `src/components/CorporateProfilePage.tsx`):**
   - *Finding:* Static JSON-LD payloads rendered via `dangerouslySetInnerHTML` did not escape `<` characters.
   - *Remediation:* Escaped `<` as `\u003c` and enforced the rule permanently in `scripts/lint-codebase.mjs`.
4. **Legacy API Domain Fallback in Deployment Pipeline (`.github/workflows/deploy-pages.yml`):**
   - *Finding:* Default `VITE_API_BASE_URL` fell back to `https://api.ophireummultimedia.com`.
   - *Remediation:* Updated default to `https://api.destriatech.com` and added workflow lint enforcement.

## 3. Residual Risk & External Environment Requirements
- Production deployment must configure `ALLOWED_ORIGINS`, `TRUST_PROXY=true` (behind Railway/proxy), `RESEND_WEBHOOK_SECRET`, `ADMIN_SESSION_SECRET`, and `PORTAL_SIGNING_SECRET` exclusively in hosting provider secret stores.
