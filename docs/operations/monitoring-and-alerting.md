# DESTRIA TECH INC — Monitoring, Health Probes & Alerting Runbook

## 1. Health & Readiness Endpoints
- **`GET /healthz`** (Liveness): Fast process probe returning HTTP `200` with `uptimeSeconds`, `version`, and `correlationId`. Configure Railway/container liveness probes against `/healthz`.
- **`GET /ready`** (Readiness): Checks PostgreSQL connectivity (`db.ping()`) and durable Client Portal persistence (`portalRepo.mode !== 'unconfigured'`). Returns HTTP `200` only when ready, otherwise HTTP `503`.
- **`GET /api/health`** & **`GET /health`**: Public diagnostic overview exposing non-secret subsystem configuration status (`healthy | degraded | unconfigured`).
- **`GET /api/admin/system-health`** (RBAC Admin Only): Returns normalized operational states (`HEALTHY`, `DEGRADED`, `UNAVAILABLE`, `UNCONFIGURED`) across `database`, `portalPersistence`, `emailDelivery` (including outbox queue counters: `queued`, `providerAccepted`, `delivered`, `failed`, `deadLetter`, `bouncedOrComplained`), `emailWebhooks`, `calendar`, `aiConsultant`, and `payments`.

## 2. Structured Logging Standards
- Service identifier: `destria-api` (`src/server/logger.ts`).
- Every HTTP request is assigned an `X-Request-Id` correlation ID propagated across database audit logs, email dispatch, and webhook handlers.
- Automatic recursive PII/secret redaction masks `email`, `phone`, `contactNumber`, `authorization`, `cookie`, `token`, `secret`, `password`, and API key formats (`AIza...`, `re_...`).

## 3. Recommended Production Alert Thresholds
| Signal | Condition | Severity | Operator Action |
| :--- | :--- | :--- | :--- |
| Readiness Probe Failure | `GET /ready` returns `503` for > 2 consecutive checks | Critical | Check `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and Supabase PostgreSQL health. |
| Email Dead-Letter Queue | `subsystems.emailDelivery.queueSummary.deadLetter > 0` | High | Open `/admin/dashboard` -> **Notification Ops**, inspect `lastError`, verify Resend domain/API key, and trigger controlled manual retry (`POST /api/admin/notifications/:id/retry`). |
| Email Webhook Signature Rejections | Spike in `resend_webhook_signature_rejected` log events | High | Verify `RESEND_WEBHOOK_SECRET` matches Resend/Svix signing secret or investigate spoofing attempts. |
| Payment Webhook Reconciliation Errors | HTTP `422` or `401` on `/api/portal/webhooks/:provider` | High | Verify provider webhook secrets and run `POST /api/admin/portal/payments/:paymentId/verify` to reconcile status server-to-server. |
| Malware Quarantine Alerts | Files marked `flagged` via `/api/admin/portal/files/:fileId/scan-status` | High | Keep file quarantined (`403 FILE_QUARANTINED` enforced on signing and download) and review audit trail. |
