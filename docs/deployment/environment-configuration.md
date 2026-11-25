# DESTRIA TECH INC — Environment & Infrastructure Configuration Standard

**Target Frontend:** GitHub Pages (`https://destriatech.com/`, Preview `https://ophireumtechnology.github.io/Destria-Tech-Inc/`)  
**Target Backend API:** Dedicated Railway Service (`https://api.destriatech.com`)  
**Target Database & Private Object Storage:** Supabase PostgreSQL + Private Storage Bucket (`portal-private-files`)  

---

## 1. Environment Variable Matrix

> **Security Rule:** Never commit real secrets, API keys, service role tokens, or signing keys to source control or client bundles. Only variables prefixed with `VITE_` are exposed to the frontend build.

### Frontend Build Variables (GitHub Actions / Vite)

| Variable | Required | Production Value / Format | Purpose |
| :--- | :---: | :--- | :--- |
| `VITE_API_BASE_URL` | Yes | `https://api.destriatech.com` | Canonical backend API origin for all public & portal requests. |
| `VITE_BASE_PATH` | Optional | `/` (custom domain) or `/Destria-Tech-Inc/` (GitHub Pages subpath) | Router basename and Vite asset base path. |
| `VITE_PUBLIC_SITE_URL` | Optional | `https://destriatech.com` | Canonical public URL used for SEO/canonical links. |

### Backend Server Variables (Railway Service)

| Variable | Required in Production | Format / Example | Security Classification | Purpose |
| :--- | :---: | :--- | :--- | :--- |
| `NODE_ENV` | Yes | `production` | Non-secret | Enforces production fail-closed DB guards, hides dev tokens, enforces strong signing secrets. |
| `PORT` | Managed by Railway | `3000` (or Railway injected port) | Non-secret | Express HTTP listener port. |
| `ALLOWED_ORIGINS` | Yes | `https://destriatech.com,https://www.destriatech.com,https://ophireumtechnology.github.io` | Non-secret | Strict CORS allowlist (never `*`). |
| `SUPABASE_URL` | **Mandatory** | `https://<project-ref>.supabase.co` | Config | Supabase project API URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Mandatory** | `<service-role-secret>` | **Critical Secret** | Server-side privileged PostgreSQL + private Storage access. |
| `PORTAL_STORAGE_BUCKET` | Recommended | `portal-private-files` | Config | Private Supabase Storage bucket (public access disabled). |
| `PORTAL_SIGNING_SECRET` | **Mandatory** | Random 64-char hex (`>=32` chars) | **Critical Secret** | HMAC-SHA256 signing key for 5-minute expiring file download URLs. |
| `ADMIN_SESSION_SECRET` | **Mandatory** | Random 64-char hex (`>=32` chars) | **Critical Secret** | HMAC signing key for executive admin sessions. |
| `ADMIN_BOOTSTRAP_EMAIL` | Optional | `executive@destriatech.com` | Restricted | Emergency admin login identifier (prefer Supabase Auth admin table). |
| `ADMIN_BOOTSTRAP_PASSWORD` | Optional | Strong unique passphrase | **Critical Secret** | Emergency admin bootstrap credential (rotate/disable once SSO/Supabase Auth active). |
| `RESEND_API_KEY` | **Mandatory** | `re_<live-key>` | **Critical Secret** | Real transactional email dispatch (portal verification, password reset, security alerts, inquiries). |
| `EMAIL_FROM` | **Mandatory** | `DESTRIA TECH INC <info@destriatech.com>` | Config | Verified Resend sender domain (`destriatech.com` with SPF, DKIM, DMARC). |
| `GEMINI_API_KEY` | **Mandatory for AI/Voice** | `<gemini-api-key>` | **Critical Secret** | Server-side Gemini 4 / Neural TTS (`gemini-3.8-flash-lite-tts`) / STT (`gemini-3.5-transcribe`). |
| `GOOGLE_CALENDAR_ID` | Optional | `<calendar-id>` | Config | Real Google Calendar consultation sync. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Optional | Service account JSON string | **Critical Secret** | Server-side Google Calendar API authentication. |
| `PAYMENT_*` Adapter Keys | Optional (per gateway) | Per `paymentAdapters.ts` | **Critical Secret** | Payment gateway credentials & webhook HMAC secrets (remain disabled until configured). |

---

## 2. Fail-Closed Production Rules

1. **Database Unconfigured (`SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` absent):**
   - `GET /healthz` returns `200 OK` (process liveness).
   - `GET /ready` returns `503 Service Unavailable` (`ready: false`).
   - `GET /api/health` returns `status: 'unconfigured'` with `dependencies.portalPersistence.mode: 'unconfigured'`.
   - Every `/api/portal/*` endpoint returns `503 DATABASE_UNAVAILABLE` via `UnconfiguredPortalRepository` (zero silent fallback to volatile memory).
   - Public `/api/inquiries` and `/api/appointments` return `503 DATABASE_UNAVAILABLE`.
2. **Missing `PORTAL_SIGNING_SECRET` in Production:**
   - Signed download endpoint (`POST /api/portal/files/:fileId/sign`) fails closed with `503`.
3. **Missing `RESEND_API_KEY`:**
   - System never claims an email was delivered; API returns `emailDeliveryStatus: 'unconfigured'` and logs a structured warning.

---

## 3. DNS & Email Authentication Prerequisites (`BLOCKED` — External Infrastructure)

Before staging or production acceptance:
- Point `CNAME api.destriatech.com` to the dedicated Railway service domain with automatic TLS enabled.
- Confirm `destriatech.com` DNS records for Resend: **SPF**, **DKIM**, and **DMARC (`p=quarantine` or `p=reject`)**.
- Create private Supabase Storage bucket `portal-private-files` with **Public bucket = OFF**.
- Apply SQL migrations in strict order: `001` -> `002` -> `003_enterprise_portal_stabilization.sql`.
