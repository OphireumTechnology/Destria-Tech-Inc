# DESTRIA TECH INC — Backend API & WebSocket Route Inventory

All HTTP routes are mounted in `src/server/app.ts` (plus portal routes in `src/server/portal/portalRoutes.ts`) and WebSocket upgrade handling is attached in `src/server/voiceLiveBridge.ts`.

## 1. Health, Readiness & Public Catalog
| Method | Path | Auth | Rate Limited | Status Contract | Purpose |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `GET` | `/healthz` | Public | No | `200` | Lightweight process liveness check |
| `GET` | `/ready` | Public | No | `200` / `503` | Deep readiness probe (DB, config, environment) |
| `GET` | `/health`, `/api/health` | Public | No | `200` | Service health & safe configuration flags (zero secrets) |
| `GET` | `/api/catalog` | Public | No | `200` | Official 10-division catalog (customized engagement basis, zero public pricing) |

## 2. Service Inquiries & Executive Consultations
| Method | Path | Auth | Rate Limited | Status Contract | Purpose |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `POST` | `/api/inquiries` | Public | Yes (`inquiryLimiter`) | `201` / `200` / `400` / `429` | Validates, persists inquiry + atomic outbox for customer + dual executive recipients |
| `GET` | `/api/appointments/availability` | Public | No | `200` / `400` | Queries real booked slots and calendar availability |
| `POST` | `/api/appointments` | Public | Yes (`inquiryLimiter`) | `201` / `200` / `400` / `409` / `429` | Persists consultation request + atomic outbox + optional calendar sync |
| `POST` | `/api/appointments/:referenceCode/reschedule` | Token (`managementToken`) | Yes | `200` / `400` / `403` / `404` | Client self-service reschedule with token verification |
| `PATCH` | `/api/appointments/:referenceCode/cancel` | Token (`managementToken`) | Yes | `200` / `400` / `403` / `404` | Client self-service cancellation with token verification |

## 3. AI Solutions Consultant (Chat, Voice & Gemini Live)
| Method | Path | Auth | Rate Limited | Status Contract | Purpose |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `POST` | `/api/consultant/chat` | Public | Yes (`aiLimiter`) | `200` / `400` / `429` | Commercial-policy-enforced Gemini 4 Hydrogen chat + authorized tools |
| `POST` | `/api/consultant/confirm-tool` | Public (session + single-use token) | Yes (`inquiryLimiter`) | `200` / `400` / `429` | Explicit `clientConfirmed: true` submission for prepared consultation/inquiry (`consultation`/`consultation_request`, `inquiry`/`service_inquiry`) |
| `POST` | `/api/voice/session` | Public | No | `200` | Negotiates server voice session & Live duplex capability flags |
| `POST` | `/api/voice/transcription-feedback` | Public | Yes (`aiLimiter`) | `201` / `400` / `429` | Records client speech-transcription correction report for Admin AI diagnostics |
| `POST` | `/api/voice/process` | Public | Yes (`aiLimiter`) | `200` / `400` / `429` | Continuous turn-based voice comprehension, commercial guardrails, tools & contextual memory |
| `POST` | `/api/voice/speak` | Public | Yes (`aiLimiter`) | `200` / `400` / `429` / `503` | Server-side neural TTS (`gemini-3.8-flash-lite-tts`) |
| `POST` | `/api/voice/transcribe` | Public | Yes (`aiLimiter`) | `200` / `400` / `429` / `503` | Server-side audio transcription fallback |
| `WS` | `/api/voice/live` | Origin-verified WS | Yes (per-IP/min) | `101` / `403` / `429` | Full-duplex Gemini Live WebSocket bridge (`16kHz` PCM in -> `24kHz` PCM out, live tool calling, real-time commercial policy audio override) |

## 4. Admin Portal & AI Command Center (RBAC Protected)
| Method | Path | Auth | Rate Limited | Status Contract | Purpose |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `POST` | `/api/admin/auth/login` | Credentials | Yes (`adminLoginLimiter`) | `200` / `401` / `429` | Admin login issuing signed HMAC-SHA256 session token |
| `GET` | `/api/admin/auth/me` | `requireAdmin` | No | `200` / `401` | Authenticated admin session identity |
| `GET` | `/api/admin/inquiries` | `requireAdmin` | No | `200` / `401` | Paginated service inquiry management |
| `GET` | `/api/admin/appointments` | `requireAdmin` | No | `200` / `401` | Paginated consultation request management |
| `GET` | `/api/admin/audit-logs` | `requireAdmin` | No | `200` / `401` | Paginated immutable audit log feed |
| `GET` | `/api/admin/notifications/outbox` | `requireAdmin` | No | `200` / `401` | Notification outbox status & dual-recipient visibility |
| `POST` | `/api/admin/notifications/retry` | `requireAdmin` | No | `200` / `401` | Manual retry trigger for failed outbox records |
| `GET` | `/api/admin/ai/overview` | `requireAdmin` | No | `200` / `401` | AI Command Center health, active sessions, telemetry & transcription feedback (zero raw API keys) |
| `PATCH` | `/api/admin/ai/config` | `requireAdmin` | No | `200` / `400` / `401` | Allowlist-validated model/voice/budget configuration (rejects deprecated models & API key injection) |
| `POST` | `/api/admin/ai/sessions/:sessionId/terminate` | `requireAdmin` | No | `200` / `400` / `401` | Force-terminates an active AI voice/live session with audit logging |

## 5. Webhooks & Client Portal Commerce (`/api/portal/*`, `/api/webhooks/*`)
- Resend delivery webhook verifies HMAC-SHA256 Svix signatures (`verifyResendWebhookSignature`) with 5-minute replay tolerance and monotonic state transitions (`delivered`, `delivery_delayed`, `bounced`, `complained`).
- Client Portal routes under `/api/portal/*` enforce hashed session tokens (`HttpOnly` cookie or Bearer token), RBAC ownership checks, and verified payment gateway webhook signatures.
