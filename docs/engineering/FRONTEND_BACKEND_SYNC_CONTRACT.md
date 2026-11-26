# DESTRIA TECH INC — Frontend-Backend Synchronization Contract

**Directive:** `DTI-MASTER-REPAIR-001`  
**API Compatibility Version:** `2026.11-dti-v2` (`API_COMPATIBILITY_VERSION` in `src/lib/apiClient.ts` & `src/server/app.ts`)  
**Audit Date:** 2026-11-26

---

## 1. Origin Resolution & Mixed-Content Safety (`src/lib/apiClient.ts`)

All frontend HTTP and WebSocket traffic resolves its target through `src/lib/apiClient.ts`:
- **`normalizeApiBaseUrl(raw)`:** Strips trailing slashes and trailing `/api` suffixes (preventing `/api/api/*` duplication), rejects non-HTTP(S) schemes, and rejects URLs containing embedded credentials (`user:pass@host`).
- **`resolveApiBaseUrl()`:**
  1. On public production hosts (`destriatech.com`, `www.destriatech.com`, `ophireumtechnology.github.io`), any accidentally baked `localhost` / `127.0.0.1` URL is automatically rejected and overridden to `https://api.destriatech.com`.
  2. When loaded on an `https:` origin, any non-local `http:` API URL is upgraded to `https:` to prevent mixed-content blocking.
  3. On local development (`localhost` / `127.0.0.1`), relative `/api/*` paths are used against the local Express + Vite server.
- **`buildWebSocketUrl(wsPath)`:** Derives `wss:` whenever the resolved API base or page protocol is HTTPS, and strips duplicate `/api/api` segments.
- **`validateApiConfiguration()`:** Returns `{ valid, baseUrl, mode, issues }` for startup diagnostics and CI verification.

---

## 2. Compatibility Headers & CORS Contract (`src/server/app.ts`)

- **Request Header:** `apiFetchJson()` attaches `X-API-Compatibility-Version: 2026.11-dti-v2` to API requests.
- **CORS Allowed Headers:** `Content-Type`, `Authorization`, `X-Requested-With`, `X-API-Compatibility-Version`, `Idempotency-Key`, `X-Correlation-Id`.
- **CORS Exposed Headers:** `X-Correlation-Id`, `X-API-Compatibility-Version`.
- **Credentials Mode:** `Access-Control-Allow-Credentials: true` for allowlisted origins (`https://destriatech.com`, `https://www.destriatech.com`, and configured `ALLOWED_ORIGINS`). Wildcard `*` is never paired with credentials.

---

## 3. Authentication & Cookie Continuity Contract

| Surface | Transport | Storage Policy | CSRF Protection |
| :--- | :--- | :--- | :--- |
| **Admin Portal (`/api/admin/*`)** | `HttpOnly` cookie `dti_admin_session` (`SameSite=Lax` / `None; Secure` in prod) + optional in-memory Bearer token | **Zero Web Storage:** `localStorage` and `sessionStorage` are prohibited for admin tokens (enforced by `scripts/lint-codebase.mjs` rule `no-webstorage-auth-token`) | Cookie-authenticated mutating requests (`POST`/`PATCH`/`PUT`/`DELETE`) require `X-Requested-With: XMLHttpRequest` (returns `403 CSRF_CHECK_FAILED` if omitted) |
| **Admin Logout (`POST /api/admin/auth/logout`)** | Cookie or Bearer | Revokes token `jti` server-side immediately + clears `dti_admin_session` cookie (`Max-Age=0`) | Requires `X-Requested-With: XMLHttpRequest` on cookie auth |
| **Client Portal (`/api/portal/*`)** | `HttpOnly` cookie `dti_portal_session` + Bearer support | Server-side SHA-256 hashed session token in database | Strict email/owner isolation on inquiries, orders, invoices, documents |

---

## 4. Deployment & Version Parity Telemetry

`GET /api/admin/system-health` returns a structured `deployment` block so operators can detect frontend/backend version drift immediately:

```json
{
  "deployment": {
    "backendCommit": "<RAILWAY_GIT_COMMIT_SHA | GITHUB_SHA | workspace-local>",
    "buildTimestamp": "<ISO-8601>",
    "apiCompatibilityVersion": "2026.11-dti-v2",
    "databaseMigrationVersion": "008",
    "nodeEnv": "production"
  }
}
```

---

## 5. Error & Concurrency Contract

- **`503 DATABASE_UNAVAILABLE`:** Returned fail-closed in `productionStrictMode` when durable Supabase persistence is unconfigured or unreachable on Front Desk, Inquiry, Appointment, or Portal endpoints.
- **`409 CONFLICT`:** Returned for:
  - Double-booked appointment slots (`CALENDAR_SLOT_BUSY` or DB slot conflict)
  - Optimistic concurrency mismatches (`expectedVersion !== dossierVersion` on `PATCH /api/portal/frontdesk/inquiries/:referenceCode`)
  - Duplicate executive commercial terms approvals on `PATCH /api/admin/frontdesk/inquiries/:referenceCode/review`
- **Idempotency:** `POST /api/frontdesk/submit` honors `idempotencyKey` (body or `Idempotency-Key` header) and safely returns `200 OK` with `deduplicated: true` on network retry without duplicating database rows or notification outbox records.
