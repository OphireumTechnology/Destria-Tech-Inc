# DESTRIA TECH INC — Production Hosting & DNS Repair Guide

**Directive:** `DTI-MASTER-REPAIR-001`  
**Audit Date:** 2026-11-26  
**Target Production Website:** `https://destriatech.com` (GitHub Pages — Verified `HTTP/2 200`)  
**Target Production API:** `https://api.destriatech.com` (Railway — Verified **NXDOMAIN** on external probe: `curl: (6) Could not resolve host: api.destriatech.com`)

---

## 1. Confirmed External Root Cause

Live network verification confirmed the split-hosting topology state:
- **Static Frontend (`https://destriatech.com`):** Resolving and serving `HTTP/2 200` via GitHub Pages (`public/CNAME` -> `destriatech.com`).
- **Dedicated Backend API (`https://api.destriatech.com`):** **Unprovisioned / NXDOMAIN.** Because GitHub Pages serves static files only, every `/api/*` request and `/api/voice/live` WebSocket connection from `https://destriatech.com` targets `https://api.destriatech.com` (resolved by `src/lib/apiClient.ts` and `.github/workflows/deploy-pages.yml`). Until the Railway backend service and DNS CNAME record are live, browser voice, chat, inquiry submission, appointment scheduling, Client Portal, and Admin Portal calls on `https://destriatech.com` will fail with DNS resolution errors (`ERR_NAME_NOT_RESOLVED`).

Code-level hardening already completed in this repository ensures that once Railway + DNS are provisioned:
- The frontend never falls back to `localhost:3000` on public production hostnames (`src/lib/apiClient.ts` + CI `dist/assets/` localhost scan).
- The voice engine runs a pre-flight `POST /api/voice/session` check (`checking_service` -> `service_unavailable`) rather than opening the microphone and looping into repeated network error speech when `api.destriatech.com` is unreachable.
- `server.ts` binds `0.0.0.0:${PORT || 3000}`, emits structured startup readiness telemetry (zero secrets), and exposes `/healthz`, `/ready`, `/health`, and `/api/health`.

---

## 2. Step-by-Step Railway Provisioning Procedure

1. **Create or Select the Railway Service:**
   - Connect Railway to `https://github.com/OphireumTechnology/Destria-Tech-Inc` on branch `main` (or the merged `repair/master-production-readiness` release branch).
   - Confirm Railway reads `railway.json`:
     - Build command: `npm ci && npm run build && npm run build:server`
     - Start command: `npm run start` (`node dist-server/server.mjs`)
     - Healthcheck path: `/healthz`
2. **Attach Custom Domain (`api.destriatech.com`):**
   - In Railway -> Service Settings -> Networking -> Custom Domains, add `api.destriatech.com`.
   - Copy the exact Railway CNAME target (for example `<service-id>.up.railway.app`).
3. **Configure DNS Record (External DNS Provider for `destriatech.com`):**
   - Create a `CNAME` record:
     - **Host / Name:** `api`
     - **Target / Value:** `<railway-generated-cname-target>`
     - **TTL:** `300` (5 minutes)
   - Wait for TLS certificate provisioning in Railway (auto-issued Let's Encrypt HTTPS certificate).

---

## 3. Required Production Environment Variables (Railway Secret Store Only)

Never commit secrets to Git, `.env.example`, or GitHub Pages build artifacts. Set these exclusively in Railway Variables:

| Variable | Required | Purpose |
| :--- | :---: | :--- |
| `NODE_ENV` | Yes | Set to `production` (activates strict fail-closed DB & Front Desk durability, HSTS, `Secure` cookies) |
| `TRUST_PROXY` | Yes | Set to `true` (enables accurate client IP rate-limiting behind Railway proxy) |
| `ALLOWED_ORIGINS` | Yes | `https://destriatech.com,https://www.destriatech.com` |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side Supabase service-role credential (enables durable inquiries, portal, and Front Desk storage) |
| `GEMINI_API_KEY` | Yes | Server-side Gemini API key (chat, voice, Gemini Live WS, neural TTS, transcription) |
| `ADMIN_SESSION_SECRET` | Yes | High-entropy random 64-char secret for HMAC-SHA256 admin sessions |
| `PORTAL_SIGNING_SECRET` | Yes | High-entropy random 64-char secret for Client Portal sessions |
| `ADMIN_BOOTSTRAP_EMAIL` | Recommended | Authorized executive admin email (only if DB `admin_users` bootstrap needed) |
| `ADMIN_BOOTSTRAP_PASSWORD` | Recommended | >= 16-char strong password (remove or rotate after DB admin provisioning) |
| `RESEND_API_KEY` | Yes | Transactional email dispatch via Resend |
| `RESEND_WEBHOOK_SECRET` | Yes | Svix HMAC-SHA256 webhook verification secret |
| `EMAIL_FROM` | Yes | Verified sender address on `destriatech.com` |
| `SERVICE_INQUIRY_RECIPIENTS` | Yes | Dual executive recipients (server-side only) |
| `EXECUTIVE_CONSULTATION_RECIPIENTS` | Yes | Dual executive recipients (server-side only) |
| `GOOGLE_CALENDAR_ID` | Optional | Executive consultation calendar ID |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Optional | Service account credentials JSON for free/busy check, create, reschedule, and cancel sync |

---

## 4. GitHub Repository Variables (GitHub Pages Deployment)

In GitHub -> Repository Settings -> Secrets and variables -> Actions -> Variables:
- Set `VITE_API_BASE_URL` = `https://api.destriatech.com` (also enforced as default fallback in `.github/workflows/deploy-pages.yml`).
- Never place `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `RESEND_API_KEY` in GitHub Pages frontend build environment variables.

---

## 5. Post-Provisioning Live Verification Commands

Run these exact checks after Railway + DNS propagation complete:

```bash
# 1. Verify DNS & TLS on api.destriatech.com
curl -iS https://api.destriatech.com/healthz
curl -iS https://api.destriatech.com/ready
curl -sS https://api.destriatech.com/api/health | jq .

# 2. Verify CORS preflight from https://destriatech.com
curl -iS -X OPTIONS https://api.destriatech.com/api/voice/session \
  -H "Origin: https://destriatech.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, X-API-Compatibility-Version, X-Requested-With"

# 3. Verify Voice Session Pre-Flight & Gemini Readiness
curl -sS -X POST https://api.destriatech.com/api/voice/session \
  -H "Origin: https://destriatech.com" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
```

Expected results before promoting beyond `CI_VALIDATED`:
- `/healthz` returns `HTTP 200`
- `/ready` returns `HTTP 200` with `database: true` and durable Front Desk persistence confirmed
- CORS preflight echoes `Access-Control-Allow-Origin: https://destriatech.com` and `Access-Control-Allow-Credentials: true`
- `/api/voice/session` returns `HTTP 200` with canonical `dti-*` session ID and honest Gemini capability flags.
