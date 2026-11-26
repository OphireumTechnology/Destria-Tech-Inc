# DESTRIA TECH INC — Observability, Telemetry & Incident Monitoring Runbook

**Directive:** `DTI-MASTER-REPAIR-001`  
**Audit Date:** 2026-11-26

---

## 1. Structured Logging Standard (`src/server/logger.ts`, `server.ts`, `src/server/app.ts`)

All server telemetry emits single-line JSON logs with:
- `timestamp` (ISO-8601 UTC)
- `level` (`info` | `warn` | `error`)
- `service` (`destria-api`)
- `event` (canonical event identifier)
- `correlationId` (`opm-*` UUID per HTTP request, echoed in `X-Correlation-Id`)
- **Automatic PII & Secret Masking:** Email addresses are redacted (`ad***@destriatech.com`), and `classifyGeminiProviderError()` strips `AIzaSy...` keys and `Bearer ...` tokens prior to logging or recording in memory.

### Key Operational Events to Alert On
| Event Name | Severity | Meaning & Immediate Action |
| :--- | :---: | :--- |
| `server_startup_readiness` | `info` | Logged on boot by `server.ts` with non-secret readiness booleans (`databaseConfigured`, `frontDeskPersistenceMode`, `geminiConfigured`, `emailConfigured`, `calendarConfigured`, `databaseMigrationVersion: "008"`). Verify all production booleans are `true` after deploy. |
| `database_unavailable_error` | `error` | `503 DATABASE_UNAVAILABLE` triggered in strict production mode. Check Supabase connectivity, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and migrations `007`/`008`. |
| `gemini_chat_failed` / `voice_tts_failed` / `voice_transcription_failed` / `gemini_live_connect_failed` | `error` | Includes `category` (`INVALID_CREDENTIALS`, `UNSUPPORTED_MODEL`, `QUOTA_EXCEEDED`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `NETWORK_TIMEOUT`, etc.) and `retryable`. Alert immediately on `INVALID_CREDENTIALS`, `UNSUPPORTED_MODEL`, or `QUOTA_EXCEEDED`. |
| `admin_csrf_header_missing` | `warn` | Cookie-authenticated mutating request lacked `X-Requested-With` (`403 CSRF_CHECK_FAILED`). Investigate potential CSRF probe or misconfigured admin client. |
| `admin_auth_rejected_unauthenticated` / `admin_auth_forbidden_non_admin` | `warn` | Track spikes for brute-force attempts or expired/revoked sessions. |
| `transactional_email_unconfigured` / outbox `dead_letter` | `warn`/`error` | Indicates missing `RESEND_API_KEY` or exhausted 5-attempt delivery failures; inspect `/api/admin/notifications/outbox` and retry after fixing provider config. |

---

## 2. Health, Readiness & Admin Diagnostic Probes

1. **Liveness (`GET /healthz`):** Fast process check for Railway container orchestration (`HTTP 200`).
2. **Readiness (`GET /ready`):** Validates database readiness and production durability posture (`HTTP 200` when ready, `HTTP 503` when unconfigured/unavailable).
3. **Public Safe Health (`GET /api/health`):** Returns high-level service status and non-secret capability flags.
4. **Executive System Health (`GET /api/admin/system-health`, RBAC-protected):** Returns subsystem health (`database`, `clientPortal`, `frontDeskPersistence`, `emailOutbox`, `webhooks`, `calendar`, `gemini`, `payments`), outbox queue metrics, and the `deployment` parity block (`backendCommit`, `buildTimestamp`, `apiCompatibilityVersion: "2026.11-dti-v2"`, `databaseMigrationVersion: "008"`).
5. **AI Command Center (`GET /api/admin/ai/overview`, RBAC-protected):** Surfaces active voice/live sessions, turn latency percentiles, recent classified Gemini failures, commercial policy enforcement counts, and transcription feedback reports (zero secrets).

---

## 3. Recommended Production Alert Thresholds (Railway / External Monitor)

- **Uptime probe:** Poll `https://api.destriatech.com/healthz` every 60s; alert on 2 consecutive non-200 responses.
- **Readiness probe:** Poll `https://api.destriatech.com/ready` every 5m; alert on any `503`.
- **Error budget:** Alert if 5xx rate exceeds `1%` over a 5-minute window or any `INVALID_CREDENTIALS` / `QUOTA_EXCEEDED` event occurs.
- **Email outbox:** Alert if `dead_letter > 0` or `queued` records remain older than 10 minutes.
- **Emergency Voice Mitigation:** If Gemini Live WebSocket upstream degrades, toggle `geminiLiveEnabled: false` via `PATCH /api/admin/ai/config` to cleanly route clients to turn-based voice without restarting the service.
