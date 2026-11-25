# DESTRIA TECH INC — Environment Variable Manifest

All secrets MUST be provisioned strictly through Railway / deployment environment managers and NEVER committed to source control or exposed in `VITE_*` client bundles.

## 1. Core Runtime & CORS
| Variable | Scope | Required (Prod) | Purpose |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Server | Yes (`production`) | Enables strict production fail-closed persistence, HSTS, `X-Frame-Options`, and quarantine enforcement. |
| `PORT` | Server | Optional (default `3000`) | Listening TCP port (`1-65535`). |
| `APP_VERSION` | Server | Optional | Release identifier surfaced in `/healthz`, `/ready`, and `/api/admin/system-health`. |
| `ALLOWED_ORIGINS` | Server | Recommended | Comma-separated CORS allowlist (defaults include `https://destriatech.com`, `https://www.destriatech.com`, `https://ophireumtechnology.github.io`, and Railway domain). |
| `PUBLIC_ORIGIN` / `APP_BASE_URL` | Server | Yes | Canonical public URL (`https://destriatech.com`) for transactional email links and payment return URLs. |

## 2. Database & Client Portal Storage (Supabase)
| Variable | Scope | Required (Prod) | Purpose |
| :--- | :--- | :--- | :--- |
| `SUPABASE_URL` | Server | Yes | Supabase project REST/PostgreSQL URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server (Secret) | Yes | Server-side privileged key (NEVER expose to frontend). |
| `PORTAL_STORAGE_BUCKET` | Server | Optional (default `portal-vault`) | Private Supabase Storage bucket for isolated client files. |
| `PORTAL_SIGNING_SECRET` | Server (Secret) | Yes (32+ chars) | HMAC secret for short-lived signed file download URLs. |
| `ENFORCE_MALWARE_QUARANTINE` | Server | Default `true` in `production` | Blocks downloading/signing unscanned attachments until cleared as `clean`. |

## 3. Administrator RBAC Authentication
| Variable | Scope | Required (Prod) | Purpose |
| :--- | :--- | :--- | :--- |
| `ADMIN_SESSION_SECRET` | Server (Secret) | Yes (32+ chars) | HMAC signing secret for administrator sessions. |
| `ADMIN_ALLOWLIST_EMAILS` | Server | Recommended | Comma-separated allowlist for Supabase-authenticated admin users. |
| `ADMIN_BOOTSTRAP_EMAIL` | Server | Optional | Bootstrap administrator login email when Supabase Auth is unavailable. |
| `ADMIN_BOOTSTRAP_PASSWORD` | Server (Secret) | Optional | Bootstrap administrator password. |

## 4. Automated Dual-Recipient & Transactional Email (Resend)
| Variable | Scope | Required (Prod) | Purpose |
| :--- | :--- | :--- | :--- |
| `EMAIL_PROVIDER` | Server | Yes (`resend`) | Transactional email transport selection. |
| `RESEND_API_KEY` | Server (Secret) | Yes | Resend API key (`re_...`). |
| `RESEND_WEBHOOK_SECRET` | Server (Secret) | Yes | Svix HMAC-SHA256 secret (`whsec_...`) verifying `/api/webhooks/email/resend`. |
| `EMAIL_FROM` | Server | Yes | Verified sender identity (e.g., `DESTRIA TECH INC <notifications@destriatech.com>`). |
| `SERVICE_INQUIRY_RECIPIENTS` | Server (Internal) | Yes | Comma-separated authorized internal notification recipients (never exposed publicly). |
| `EXECUTIVE_CONSULTATION_RECIPIENTS` | Server (Internal) | Yes | Comma-separated authorized internal consultation recipients (never exposed publicly). |
| `SERVICE_INQUIRY_EMAIL_ENABLED` | Server | Default `true` | Feature switch for service inquiry internal notifications. |
| `EXECUTIVE_CONSULTATION_EMAIL_ENABLED` | Server | Default `true` | Feature switch for executive consultation internal notifications. |
| `ADMIN_NOTIFICATION_EMAIL` | Server | Optional | Fallback legacy admin notification inbox. |

## 5. Payment Gateways (Sandbox Default, Live Explicitly Gated)
| Variable | Scope | Required (Prod) | Purpose |
| :--- | :--- | :--- | :--- |
| `PAYMENTS_LIVE_ENABLED` | Server | Default `false` | Must be explicitly `true` alongside live keys to route transactions to live payment endpoints. |
| `XENDIT_SECRET_KEY_TEST` / `_LIVE` | Server (Secret) | If Xendit enabled | Xendit API secret key for Invoice creation, S2S status verification, and refunds. |
| `XENDIT_WEBHOOK_TOKEN_TEST` / `_LIVE` | Server (Secret) | If Xendit enabled | Xendit callback verification token. |
| `PAYPAL_CLIENT_ID_SANDBOX` / `_LIVE` | Server | If PayPal enabled | PayPal REST OAuth2 client ID. |
| `PAYPAL_CLIENT_SECRET_SANDBOX` / `_LIVE` | Server (Secret) | If PayPal enabled | PayPal REST OAuth2 client secret. |
| `PAYPAL_WEBHOOK_SECRET_SANDBOX` / `_LIVE` | Server (Secret) | If PayPal enabled | PayPal webhook verification secret. |
| `MAYA_PUBLIC_KEY_TEST` / `_LIVE` | Server | If Maya enabled | Maya Checkout public key. |
| `MAYA_SECRET_KEY_TEST` / `_LIVE` | Server (Secret) | If Maya enabled | Maya Checkout secret key for status checks and refunds. |
| `MAYA_WEBHOOK_SECRET_TEST` / `_LIVE` | Server (Secret) | If Maya enabled | Maya webhook signature secret. |
| `PAYMONGO_SECRET_KEY_TEST` / `_LIVE` | Server (Secret) | If PayMongo enabled | PayMongo API secret key. |
| `PAYMONGO_WEBHOOK_SECRET_TEST` / `_LIVE` | Server (Secret) | If PayMongo enabled | PayMongo webhook signature secret. |
| `CARD_GATEWAY_BASE_URL` | Server | If Card Gateway enabled | PCI-compliant hosted card gateway base URL. |
| `CARD_GATEWAY_SECRET_KEY_TEST` / `_LIVE` | Server (Secret) | If Card Gateway enabled | Hosted card gateway secret key. |
| `CARD_GATEWAY_WEBHOOK_SECRET_TEST` / `_LIVE` | Server (Secret) | If Card Gateway enabled | Hosted card gateway webhook secret. |
| `GOTYME_API_SECRET_TEST` / `GOTYME_WEBHOOK_SECRET_TEST` | Server (Deferred) | No | Reserved for future GoTyme merchant API onboarding (adapter intentionally disabled). |

## 6. AI Consultant & Calendar Integrations
| Variable | Scope | Required (Prod) | Purpose |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Server (Secret) | Optional | Server-side Gemini AI Corporate Consultant, voice processing, TTS, and transcription. |
| `GOOGLE_CALENDAR_ID` | Server | Optional | Target Google Calendar ID for verified consultation scheduling. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Server (Secret) | Optional | Service account credentials JSON for Google Calendar API. |

## 7. Frontend Build-Time Public Variables (`VITE_*`)
| Variable | Scope | Purpose |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Public Client | Hosted Railway API origin when frontend is deployed statically on GitHub Pages. |
| `VITE_PUBLIC_ORIGIN` | Public Client | Canonical origin (`https://destriatech.com`). |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Public Client | Optional public Supabase client config (never put service role key here). |
| `VITE_CORPORATE_*` | Public Client | Optional public corporate metadata overrides (`EMAIL`, `PHONE`, `ADDRESS`, etc.). |
