# DESTRIA TECH INC — Security Architecture & Controls

## 1. Authentication & Role-Based Access Control (RBAC)
- **Administrator Console (`/api/admin/*`)**: Every administrative route enforces `authService.requireAdmin` using constant-time credential checks, signed short-lived HMAC tokens or verified Supabase Auth tokens cross-checked against `admin_users` / `ADMIN_ALLOWLIST_EMAILS`, and full audit logging in `audit_logs`.
- **Client Portal (`/api/portal/*`)**: Uses `scrypt` salted password hashing (`crypto.timingSafeEqual`), SHA-256 hashed session tokens stored in `HttpOnly; Secure; SameSite=None; Partitioned` cookies, and strict user-ownership scoping on every order, invoice, project, message, ticket, and file query.
- **Separation of Duties for Refunds**: `POST /api/admin/portal/payments/:paymentId/refund` requires `super_admin` authority or an explicit distinct `approvedBy` executive identifier for non-super-admin operators, enforces integer minor-unit bounds against remaining refundable amounts, and deduplicates via unique `idempotency_key`.

## 2. Fail-Closed Production Persistence & Payment Controls
- In `NODE_ENV=production`, Client Portal persistence refuses to fall back to in-memory storage if `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are absent (`UnconfiguredPortalRepository` returns `503 DATABASE_UNAVAILABLE`).
- Payment adapters never fabricate transaction IDs (`sbx_*` stubs removed), enforce 15-second `AbortController` timeouts, use canonical `https://destriatech.com/portal/orders/:id` return URLs, and gate live payment routing behind `PAYMENTS_LIVE_ENABLED=true`.
- GoTyme remains explicitly disabled (`deferred_merchant_onboarding`) until merchant API credentials are provisioned.

## 3. File Upload Isolation & Malware Quarantine Enforcement
- Uploads are restricted to an explicit extension/MIME allowlist, size-capped (15 MB), and verified by server-side magic-byte inspection rejecting PE/ELF executables, shell scripts, PHP, HTML, and SVG active payloads.
- Both `POST /api/portal/files/:fileId/sign` and `GET /api/portal/files/download/:fileId` enforce malware quarantine (`403 FILE_QUARANTINED`): `flagged` files are unconditionally blocked (even if an unexpired signed URL already existed), and `quarantined_unscanned` files are blocked in `production` or when `ENFORCE_MALWARE_QUARANTINE=true` until cleared to `clean` via `POST /api/admin/portal/files/:fileId/scan-status`.

## 4. Webhook Integrity, Privacy & Transport Hardening
- **Resend Webhooks (`/api/webhooks/email/resend`)**: Verified via Svix HMAC-SHA256 (`svix-id`, `svix-timestamp`, `svix-signature` with replay-window enforcement), timestamp-bounded (`normalizeWebhookTimestamp`), durably deduplicated in `notification_webhook_events`, and protected against out-of-order status downgrades.
- **Internal Recipient Privacy**: Internal notification addresses (`SERVICE_INQUIRY_RECIPIENTS`, `EXECUTIVE_CONSULTATION_RECIPIENTS`) remain strictly server-side, are never returned in public API responses, and are verified absent from compiled `dist/` bundles in CI.
- **HTTP Hardening**: Explicit CORS origin allowlist, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `CSP` on API routes, `HSTS` & `X-Frame-Options: DENY` in production, per-endpoint body size caps (`100kb` JSON default), sliding-window rate limiters, and HTTP server socket/header timeouts (`server.ts`).
