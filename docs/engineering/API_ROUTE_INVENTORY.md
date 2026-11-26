# DESTRIA TECH INC — Backend API & WebSocket Route Inventory

**Directive:** `DTI-MASTER-REPAIR-001`  
**API Compatibility Version Header:** `X-API-Compatibility-Version: 2026.11-dti-v2`  
All HTTP routes are mounted in `src/server/app.ts` and `src/server/portal/portalRoutes.ts`; WebSocket upgrade handling is attached in `src/server/voiceLiveBridge.ts`.

---

## 1. Health, Readiness & Public Catalog
| Method | Path | Auth | Rate Limited | Status Contract | Purpose |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `GET` | `/healthz` | Public | No | `200` | Lightweight process liveness check |
| `GET` | `/ready` | Public | No | `200` / `503` | Deep readiness probe (DB, durability, config) |
| `GET` | `/health`, `/api/health` | Public | No | `200` | Service health & safe configuration flags (zero secrets) |
| `GET` | `/api/catalog` | Public | No | `200` | Official 10-division catalog (customized engagement basis, zero public pricing) |

## 2. Service Inquiries & Executive Consultations
| Method | Path | Auth | Rate Limited | Status Contract | Purpose |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `POST` | `/api/inquiries` | Public | Yes (`inquiryLimiter`) | `201` / `200` / `400` / `429` | Validates, persists inquiry + atomic outbox for customer + dual executive recipients |
| `GET` | `/api/appointments/availability` | Public | No | `200` / `400` | Queries booked DB slots & calendar availability |
| `POST` | `/api/appointments` | Public | Yes (`inquiryLimiter`) | `201` / `200` / `400` / `409` / `429` | Checks DB + Google Calendar free/busy (`409 CALENDAR_SLOT_BUSY`), persists consultation + outbox + DST-aware calendar sync |
| `PATCH` | `/api/appointments/:referenceCode` | Token (`managementToken`) or Admin | Yes | `200` / `400` / `401` / `404` / `409` | Self-service or admin cancel (`cancelConsultationEvent`) & reschedule (`checkSlotAvailability` + `updateConsultationEvent`) |

## 3. AI Solutions Consultant (Chat, Voice & Gemini Live)
| Method | Path | Auth | Rate Limited | Status Contract | Purpose |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `POST` | `/api/consultant/chat` | Public | Yes (`aiLimiter`) | `200` / `400` / `429` | Commercial-policy-enforced `gemini-4-hydrogen` chat + authorized tools + classified error telemetry |
| `POST` | `/api/consultant/confirm-tool` | Public (session + single-use token) | Yes (`inquiryLimiter`) | `200` / `400` / `429` | Explicit `clientConfirmed: true` submission (`consultation`/`consultation_request`, `inquiry`/`service_inquiry`) |
| `POST` | `/api/voice/session` | Public | No | `200` | Pre-flight voice backend verification & Live duplex capability negotiation |
| `POST` | `/api/voice/transcription-feedback` | Public | Yes (`aiLimiter`) | `201` / `400` / `429` | Records client speech-transcription correction report |
| `POST` | `/api/voice/process` | Public | Yes (`aiLimiter`) | `200` / `400` / `429` | Continuous turn-based voice comprehension, commercial guardrails, tools & contextual memory |
| `POST` | `/api/voice/speak` | Public | Yes (`aiLimiter`) | `200` / `400` / `429` / `502` / `503` | Server-side neural TTS (`gemini-3.8-flash-lite-tts`) with classified errors |
| `POST` | `/api/voice/transcribe` | Public | Yes (`aiLimiter`) | `200` / `400` / `429` / `502` / `503` | Server-side audio transcription (`gemini-3.5-transcribe`) with classified errors |
| `WS` | `/api/voice/live` | Origin-verified WS | Yes (per-IP/min) | `101` / `403` / `429` | Full-duplex Gemini Live WebSocket bridge (`16kHz` PCM in -> `24kHz` PCM out) |

## 4. AI Front Desk Platform (Durable Write-Through — Fails Closed `503` in Prod if Unconfigured)
| Method | Path | Auth | Rate Limited | Status Contract | Purpose |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `GET` | `/api/frontdesk/knowledge/public` | Public | No | `200` / `503` | Retrieves approved public Front Desk knowledge entries |
| `GET` | `/api/frontdesk/session/:sessionId` | Public | No | `200` / `400` / `503` | Hydrates or creates durable Front Desk session dossier |
| `PATCH` | `/api/frontdesk/session/:sessionId` | Public | Yes (`aiLimiter`) | `200` / `400` / `503` | Applies client dossier corrections durably |
| `POST` | `/api/frontdesk/masterplan` | Public | Yes (`aiLimiter`) | `200` / `400` / `503` | Generates & persists Preliminary Project Masterplan |
| `POST` | `/api/frontdesk/prepare-submission` | Public | Yes (`aiLimiter`) | `200` / `400` / `503` | Issues persistent single-use `confirmationToken` (survives restarts) |
| `POST` | `/api/frontdesk/submit` | Public (single-use token + `clientConfirmed`) | Yes (`inquiryLimiter`) | `201` / `200` / `400` / `429` / `503` | Submits inquiry durably with `idempotencyKey` replay deduplication + dual-recipient outbox |
| `POST` | `/api/frontdesk/escalate` | Public | Yes (`inquiryLimiter`) | `201` / `400` / `503` | Creates persistent human escalation ticket |

## 5. Admin Portal, Front Desk Console & AI Command Center (RBAC + HttpOnly Cookie + CSRF)
| Method | Path | Auth | Rate Limited | Status Contract | Purpose |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `POST` | `/api/admin/auth/login` | Credentials | Yes (`adminLoginLimiter`) | `200` / `401` / `429` | Authenticates admin, sets `dti_admin_session` `HttpOnly` cookie + returns memory token |
| `POST` | `/api/admin/auth/logout` | Cookie/Bearer (`requireAdmin` + CSRF) | No | `200` / `401` / `403` | Revokes token `jti` server-side & clears `dti_admin_session` cookie (`Max-Age=0`) |
| `GET` | `/api/admin/auth/session`, `/api/admin/auth/me` | `requireAdmin` | No | `200` / `401` / `403` | Returns authenticated admin principal & `authSource` (`cookie` \| `bearer`) |
| `GET` | `/api/admin/system-health` | `requireAdmin` | No | `200` / `401` | Subsystem health, outbox counts, `frontDeskPersistence`, and `deployment` parity block |
| `GET` | `/api/admin/inquiries`, `/api/admin/appointments`, `/api/admin/audit-logs`, `/api/admin/notifications/outbox` | `requireAdmin` | No | `200` / `401` | Paginated operations management |
| `GET`/`PATCH` | `/api/admin/frontdesk/inquiries`, `/review` | `requireAdmin` (+ CSRF) | No | `200` / `400` / `403` / `409` / `503` | 16-stage executive review workflow with duplicate commercial approval `409` guard |
| `GET`/`POST`/`PATCH` | `/api/admin/frontdesk/escalations`, `/quality`, `/knowledge` | `requireAdmin` (+ CSRF) | No | `200` / `201` / `400` / `403` / `503` | Durable escalations, QA evaluations, and managed KB governance |
| `GET`/`PATCH`/`POST` | `/api/admin/ai/overview`, `/config`, `/sessions/:id/terminate` | `requireAdmin` (+ CSRF) | No | `200` / `400` / `401` / `403` | AI Command Center telemetry, allowlist-guarded runtime config, and session termination |

## 6. Client Portal & Webhooks (`/api/portal/*`, `/api/webhooks/*`)
- `GET /api/portal/frontdesk/inquiries` & `PATCH /api/portal/frontdesk/inquiries/:referenceCode`: Durable owner-isolated reads and optimistic `expectedVersion` (`409`) client edits.
- Resend delivery webhooks verify Svix HMAC-SHA256 signatures with 5-minute replay tolerance.
