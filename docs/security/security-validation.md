# DESTRIA TECH INC — Security Validation & Hardening Report

**Assessment Date:** 2026-11-25  
**Overall Security Gate:** Code-level controls `CI_VALIDATED` · Production infrastructure & lockfile audit `BLOCKED` pending external provisioning  

---

## 1. Authentication, Session & Access Control Controls

- **Client Portal Sessions (`src/server/portal/portalRoutes.ts`, `src/portal/portalApi.ts`):**
  - Primary authentication uses server-issued `HttpOnly`, `Secure`, `SameSite=None`, `Partitioned` session cookies (`opm_portal_session`) with SHA-256 hashed tokens stored server-side.
  - Zero session tokens are written to `localStorage` or `sessionStorage`.
  - State-changing cookie requests require CSRF verification (`X-Requested-With` or allowlisted `Origin`).
- **Password Security & Recovery:**
  - Passwords hashed with per-user random salt using `crypto.scryptSync` and verified via `crypto.timingSafeEqual`.
  - Password reset tokens are single-use, time-bounded, SHA-256 hashed in persistence, and invalidate all active user sessions upon completion.
  - `POST /api/portal/auth/forgot-password` returns a uniform anti-enumeration response without leaking account existence.
  - Development helper tokens (`devVerificationToken`, `devResetToken`) are strictly omitted when `NODE_ENV === 'production'`.
- **Admin RBAC (`src/server/auth.ts`, `src/server/app.ts`):**
  - Administrative routes (`/api/admin/*`) enforce `401` for unauthenticated callers and `403` for authenticated non-admin accounts, with every administrative access logged in `audit_logs`.
- **Multi-Tenant Isolation:**
  - Portal orders, invoices, projects, attachments, tickets, and notifications are scoped to `req.portalUser.id`; cross-account file IDs and references are rejected with `403` / `404`.

---

## 2. Persistence, Secrets & Fail-Closed Production Guards

- **Fail-Closed Production Guard:** When `NODE_ENV === 'production'` and `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing, `createApp()` binds `UnconfiguredPortalRepository`. All `/api/portal/*` endpoints immediately return HTTP `503 DATABASE_UNAVAILABLE` rather than falling back to volatile in-memory storage.
- **Secret Isolation:** Verified by automated static scan (`tests/deployment-integration.test.ts`) that no client-side file references `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_BOOTSTRAP_PASSWORD`, `ADMIN_SESSION_SECRET`, `RESEND_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`, or `GEMINI_API_KEY`.
- **Signed File Downloads:** 5-minute expiring HMAC-SHA256 download URLs fail closed with `503` in production if `PORTAL_SIGNING_SECRET` (`>= 32` chars) is absent.
- **Database Row-Level Security (RLS):** Migrations `001`, `002`, and `003` enable RLS across public tables with zero permissive `USING (true)` policies.

---

## 3. File Upload Content Inspection & Quarantine

- **Magic-Byte Signature Verification (`validateUploadedFileSignature` in `portalRoutes.ts`):**
  - Blocks Windows PE (`MZ`), Linux ELF (`\x7fELF`), Mach-O, shell scripts (`#!`), HTML/script tags, PHP tags, and SVG script payloads even when renamed with benign extensions (`.pdf`, `.png`, `.jpg`, etc.), returning `400 INVALID_FILE_SIGNATURE`.
  - Verifies expected file headers for PDF, PNG, JPEG, WEBP, ZIP/DOCX/XLSX/PPTX, and MP4/MOV uploads.
- **Integrity & Quarantine Metadata:** Every accepted upload records its `contentSha256` digest and `scanStatus: 'quarantined_unscanned'` because an external antivirus engine is not connected in this runtime. Downloads of `'flagged'` files are explicitly blocked with `403 FILE_QUARANTINED`.

---

## 4. Network, Transport & Browser Security Headers

- **Strict CORS Allowlist (`src/server/app.ts`):** Permits only official Destria origins (`https://destriatech.com`, `https://www.destriatech.com`, `https://ophireumtechnology.github.io`, plus local dev origins when not in production). Legacy `https://ophireummultimedia.com` and arbitrary third-party `*.github.io` origins are rejected with `403`.
- **HTTP Response Hardening:**
  - `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'` on API/health endpoints
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Cross-Origin-Resource-Policy: same-site`
  - `X-Permitted-Cross-Domain-Policies: none`
- **API Timeout Resilience:** Frontend API clients (`apiClient.ts`, `portalApi.ts`) enforce 20-second `AbortController` timeouts (45s for file uploads) to prevent stalled client connections.

---

## 5. Open Security Prerequisites Before Production Launch

| Item | Status | Required Action |
| :--- | :---: | :--- |
| **Lockfile & Automated Dependency Vulnerability Audit** | `BLOCKED` | Generate and commit `package-lock.json`, then run `npm audit --omit=dev` in CI and remediate any high/critical advisories before production deployment. |
| **External Antivirus / Malware Scanning** | `BLOCKED` | Integrate a real cloud AV scanner (e.g., ClamAV worker or managed object-storage malware scan) to transition `project_attachments.scan_status` from `quarantined_unscanned` to `clean` or `flagged`. |
| **Domain Email Authentication (SPF/DKIM/DMARC)** | `BLOCKED` | Verify Resend DNS records for `destriatech.com` and validate live inbox delivery prior to enabling production portal onboarding. |
| **Live Staging Penetration & Auth Abuse Check** | `BLOCKED` | Verify Railway proxy IP forwarding (`trust proxy`), rate limits, TLS 1.3, and HSTS headers on `https://api.destriatech.com` in staging. |
