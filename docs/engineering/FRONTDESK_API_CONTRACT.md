# DESTRIA TECH INC — Unified AI Front Desk & Inference API Contract

**Directive:** `DTI-HELIX-INTEGRATION-001` (Sections 5, 6, 7, 16)  
**Contract Date:** 2026-11-26  
**Status:** **`SOURCE_AUDITED` (API Contract Blueprint — Pending Owner Approval Before Implementation)**  
**Compatibility Header:** `X-API-Compatibility-Version: 2026.11-dti-v2` (Additive `v2.1` routes preserve 100% backward compatibility with `API_ROUTE_INVENTORY.md`)

---

## 1. Backward Compatibility & Route Reconciliation

All existing DESTRIA TECH INC endpoints documented in `docs/engineering/API_ROUTE_INVENTORY.md` remain active and unchanged (including `/api/consultant/*`, `/api/voice/*`, `/api/frontdesk/session/:sessionId/*`, `/api/inquiries`, `/api/appointments/*`, `/api/portal/*`, and `/api/admin/*`).

The new unified routes below implement Section 16 of `DTI-HELIX-INTEGRATION-001` by routing both website chat and website voice through a single conversation gateway (`src/server/frontDeskUnifiedGateway.ts`), sharing one canonical `sessionId`, customer identity, turn history (`frontdesk_conversation_messages`), and business dossier (`ai_conversation_sessions`).

---

## 2. Public Unified Front Desk Gateway Routes (Express — `https://api.destriatech.com`)

| Method | Path | Auth & Scoping | Rate Limit | Status Codes | Contract Summary |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `POST` | `/api/frontdesk/sessions` | Public + signed `X-FrontDesk-Session-Token` returned | `aiLimiter` | `201`, `400`, `429`, `503` | Creates a unified voice+chat session (`sessionId`, `sessionToken`, `channel`, `locale`, `consentAccepted`), evaluates business hours/holiday status, and returns the greeting + active provider capability flags. |
| `GET` | `/api/frontdesk/sessions/:id` | `X-FrontDesk-Session-Token` (strictly scoped to `:id`) | Standard | `200`, `401`, `403`, `404`, `503` | Restores session dossier, active channel, escalation/assignment status, business hours state, and verified client context (zero cross-session reads). |
| `POST` | `/api/frontdesk/sessions/:id/messages` | `X-FrontDesk-Session-Token` + `Idempotency-Key` | `aiLimiter` | `200`, `400`, `401`, `409`, `429`, `503` | Submits an ordered text turn (`turnId`, `message`, optional `expectedTurnSequence`). Runs prompt-injection filter, approved KB retrieval, Ollama/local inference (never auto-falls back to paid Gemini), updates shared dossier, and returns assistant reply + department/intent metadata. |
| `GET` | `/api/frontdesk/sessions/:id/history` | `X-FrontDesk-Session-Token` | Standard | `200`, `401`, `403`, `404`, `503` | Returns ordered unified transcript (`turnSequence ASC`) across both `chat` and `voice` channels with pagination (`limit`, `afterSequence`). |
| `POST` | `/api/frontdesk/sessions/:id/voice` | `X-FrontDesk-Session-Token` + `Idempotency-Key` | `aiLimiter` | `200`, `400`, `401`, `413`, `415`, `429`, `503` | Single-turn HTTP audio upload fallback (`audio/wav`, `audio/webm`, `audio/pcm`; max 5 MB / 30s). Resamples to 16 kHz mono -> Python `/v1/vad` -> `/v1/stt` -> Unified Gateway -> `/v1/tts`. Returns transcript, reply text, audio payload/URL, and `generationEpoch`. |
| `WS` | `/api/frontdesk/voice/stream` | Origin allowlist + short-lived signed `sessionToken` query/protocol header | Per-IP & per-session cap | `101`, `401`, `403`, `429`, `503` | Primary low-latency browser voice channel. Accepts 16 kHz mono PCM16 frames (max 64 KB/frame), streams VAD events, partial/final STT transcripts, LLM text deltas, and chunked 24 kHz TTS PCM audio. Supports barge-in `{ type: "interrupt", generationEpoch }` and clean teardown. Fails closed (`503` / WS close `1013`) if Python inference worker is unavailable. |
| `POST` | `/api/frontdesk/sessions/:id/interrupt` | `X-FrontDesk-Session-Token` | `aiLimiter` | `200`, `401`, `404` | Cancels any in-flight LLM/TTS request via `AbortController`, increments `generationEpoch`, and notifies the Python inference worker to abort stale synthesis. |
| `POST` | `/api/frontdesk/sessions/:id/escalate` | `X-FrontDesk-Session-Token` + `Idempotency-Key` | `inquiryLimiter` | `201`, `200`, `400`, `401`, `409`, `429`, `503` | Invokes atomic PostgreSQL RPC `claim_frontdesk_human_agent` (`FOR UPDATE SKIP LOCKED`) for matching department & language. Returns `assigned` (with expiry window) or `callback_recommended` if after-hours, holiday, or all agents busy. |
| `POST` | `/api/frontdesk/sessions/:id/callback` | `X-FrontDesk-Session-Token` + `Idempotency-Key` | `inquiryLimiter` | `201`, `200`, `400`, `401`, `429`, `503` | Records a structured callback request in `frontdesk_callback_requests` (`visitorName`, `visitorEmail`, `visitorPhone`, `departmentSlug`, `preferredWindow`, `timezone`, `reason`) and queues durable Resend notification outbox. |
| `DELETE` | `/api/frontdesk/sessions/:id` | `X-FrontDesk-Session-Token` | `aiLimiter` | `200`, `401`, `404`, `503` | Alias to existing `DELETE /api/frontdesk/session/:sessionId` — deletes draft session, unified messages, and pending tokens durably while retaining formally submitted inquiries and audit logs. |
| `GET` | `/api/frontdesk/departments` | Public | Standard | `200`, `503` | Lists active corporate departments (`slug`, `displayName`, `description`, `supportedLanguages`, `currentlyOpen`, `availableAgentCount > 0` boolean flag — never leaks internal employee emails/phones). |
| `GET` | `/api/frontdesk/availability` | Public | Standard | `200`, `400`, `503` | Delegates to DESTRIA's existing DST-aware DB + Google Calendar availability engine (`calendarService.ts`) — strictly fail-closed on calendar outage (never fabricates open slots like Helix `gcal.py`). |
| `POST` | `/api/frontdesk/appointments` | Public or `X-FrontDesk-Session-Token` + `Idempotency-Key` + `clientConfirmed: true` | `inquiryLimiter` | `201`, `200`, `400`, `409`, `429`, `503` | Delegates to DESTRIA's existing transactional booking engine + Resend outbox + Google Calendar sync, linking the booked `referenceCode` back into the unified Front Desk session history. |
| `GET` | `/api/health` | Public | No | `200` | Safe high-level health payload (`status`, `apiVersion`, `providerMode`, zero secrets or internal hostnames). |
| `GET` | `/api/ready` | Public | No | `200`, `503` | Deep readiness probe reporting `databaseReady`, `durabilityReady`, `localInferenceReady`, and `voiceChannelReady`. Never reports `voiceChannelReady: true` if Python worker is unhealthy. |

### Canonical JSON Error Envelope (All Endpoints)
```json
{
  "error": {
    "code": "INFERENCE_SERVICE_UNAVAILABLE",
    "message": "Voice inference is temporarily unavailable. You may continue in text chat or request a callback.",
    "requestId": "req_01J...",
    "retryable": true
  }
}
```
Standardized error codes: `VALIDATION_FAILED` (`400`), `PROMPT_INJECTION_BLOCKED` (`400`), `UNAUTHORIZED_SESSION` (`401`), `FORBIDDEN_ORIGIN` (`403`), `CSRF_MISMATCH` (`403`), `SESSION_NOT_FOUND` (`404`), `TURN_SEQUENCE_CONFLICT` (`409`), `CALENDAR_SLOT_BUSY` (`409`), `AUDIO_PAYLOAD_TOO_LARGE` (`413`), `UNSUPPORTED_AUDIO_FORMAT` (`415`), `RATE_LIMIT_EXCEEDED` (`429`), `INFERENCE_SERVICE_UNAVAILABLE` (`503`), `CIRCUIT_BREAKER_OPEN` (`503`), `PAID_PROVIDER_NOT_AUTHORIZED` (`503`).

---

## 3. Authenticated Administrative Front Desk Extensions (RBAC + `HttpOnly` Cookie + CSRF)

All endpoints require `requireAdmin` (valid non-revoked session checked against `admin_revoked_sessions` migration `009`) plus `X-CSRF-Token` on state-changing requests. Unlike Helix's unauthenticated `PATCH /api/config`, **no admin endpoint ever mutates `.env` files or returns plaintext secrets**.

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` / `POST` / `PATCH` | `/api/admin/frontdesk/departments` | Manage corporate departments, routing keywords, SLA targets, and active state. |
| `GET` / `POST` / `PATCH` | `/api/admin/frontdesk/agents` | Manage human employees, language proficiencies, department assignments, max concurrency, and availability (`offline`, `available`, `busy`, `break`). |
| `POST` | `/api/admin/frontdesk/assignments/:id/accept` | Human agent confirms acceptance of an `offered` escalation before `expires_at`. |
| `POST` | `/api/admin/frontdesk/assignments/:id/release` | Releases a completed or declined escalation, atomically restoring agent capacity. |
| `GET` / `PATCH` | `/api/admin/frontdesk/callbacks` | View, assign, schedule, or complete visitor callback requests. |
| `GET` / `POST` / `PATCH` / `DELETE` | `/api/admin/frontdesk/schedule` | Manage corporate business hours (`frontdesk_holidays_and_hours`) and holiday overrides. |
| `GET` | `/api/admin/frontdesk/inference-health` | Proxies private `/v1/health` and `/v1/ready` metrics from the isolated Python inference worker (models loaded, queue depths, CPU/GPU memory, circuit breaker state) without exposing the worker publicly. |

---

## 4. Private Python AI Inference Service Contract (`services/ai-inference` — FastAPI + OpenAPI)

**Network Policy:** Private internal network ONLY (never publicly routed).  
**Authentication:** Mandatory `X-Service-Auth: Bearer <AI_INFERENCE_SHARED_SECRET>` verified via constant-time `hmac.compare_digest` on every route (excluding internal loopback liveness `/v1/livez`).  
**Reliability Guardrails:** Per-engine `asyncio.Semaphore` bounded queues, strict per-request timeouts, request cancellation propagation (`X-Request-Id`), and deterministic `429 QUEUE_FULL` / `503 MODEL_NOT_READY` / `504 INFERENCE_TIMEOUT` responses.

| Method | Internal Path | Input Contract | Output Contract | Latency / Timeout Budget |
| :--- | :--- | :--- | :--- | :---: |
| `GET` | `/v1/health` | Service auth header | `{ status, computeMode: "cpu"|"gpu", uptimeSec, models: {...}, queues: {...}, memoryMb, vramMb }` | `1s` |
| `GET` | `/v1/ready` | Service auth header | `200` only when Whisper, Silero VAD, Kokoro TTS, and Ollama reachability are prewarmed; else `503` | `2s` |
| `POST` | `/v1/vad` | `{ sessionId, sampleRate: 16000, pcm16Base64, resetState?: bool }` | `{ speechDetected: bool, probability: float, speechStart: bool, speechEnd: bool, latencyMs }` | `500ms` |
| `POST` | `/v1/stt` | Multipart PCM16/WAV (16 kHz mono, max 5 MB) + `languageHint?`, `beamSize?` | `{ text, language, languageProbability, segments: [...], durationSec, latencyMs }` | `10s` (GPU) / `20s` (CPU) |
| `POST` | `/v1/llm/reply` | `{ sessionId, requestId, systemPrompt, history: [...], userMessage, knowledgeContext: [...], temperature, maxTokens, stream?: bool }` | JSON `{ replyText, detectedIntent, suggestedDepartment, language, tokensGenerated, model, latencyMs }` or SSE token stream | `15s` (GPU) / `30s` (CPU) |
| `POST` | `/v1/tts` | `{ text, language, voiceId, speed, sampleRate: 24000, stream?: bool }` | Raw chunked PCM16 / WAV (`24 kHz`) with `X-Synthesis-Latency-Ms` header | `8s` |
| `POST` | `/v1/translate` | `{ text, sourceLang, targetLang }` | `{ translatedText, engine: "marianmt"|"ollama", latencyMs }` | `5s` |
| `POST` | `/v1/cancel/:requestId` | Service auth header | Cancels active generation task for `requestId` (`200` / `404`) | `500ms` |

---

## 5. Strict Security & Idempotency Rules
- **Idempotency Keys:** All mutating public endpoints (`messages`, `voice`, `escalate`, `callback`, `appointments`) accept `Idempotency-Key` (UUID/opaque string `<= 128` chars) and deduplicate retries safely via unique database constraints.
- **Audio Input Hardening:** Reject non-whitelisted MIME types (`415`), payloads exceeding `5 MB` or `30 seconds` (`413`), invalid WAV headers, or sample rates outside `8–48 kHz`.
- **Cross-Client Isolation:** Session tokens are cryptographically bound (`HMAC-SHA256`) to a specific `sessionId`. Authenticated Client Portal reads remain strictly bound to `ownerEmail`.
- **Zero Auto Paid Fallback:** If `AI_PROVIDER_MODE` is `'local_inference'` and `/v1/*` fails or trips the circuit breaker, the gateway returns `503 INFERENCE_SERVICE_UNAVAILABLE` (or governed deterministic callback assistance) — it **never** silently invokes paid Gemini APIs.
