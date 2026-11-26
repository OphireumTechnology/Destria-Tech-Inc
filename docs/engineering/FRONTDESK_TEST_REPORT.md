# DESTRIA TECH INC — Unified AI Front Desk Test Baseline & Verification Plan

**Directive:** `DTI-HELIX-INTEGRATION-001` (Section 19 & Section 20)  
**Report Date:** 2026-11-26  
**Current Classification:** **`SOURCE_AUDITED`**  
**Post-Integration Tests Executed:** **NONE (Audit & Planning Gate Only — Zero Application Source Code Modified)**

---

## 1. Honest Pre-Implementation Baseline (Verified Live)

| Codebase / Component | Automated Test Suites | Test Cases | Current Status | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **DESTRIA TECH INC (`main` `2e238e63` + workspace)** | **41** | **184** | **184 / 184 Passing** | Verified prior to audit gate (`npm run typecheck`, `npm run lint`, `npm run build`, `npm run build:server`, `bun audit`: 0 errors, 0 vulnerabilities). |
| **Upstream Helix (`v2.0.6` `da9e3f9f` / `v1.9.2` `e4b257d7`)** | **0** | **0** | **No Test Suite Exists** | Confirmed by full directory traversal of upstream clone; zero `pytest`, `jest`, `vitest`, or integration tests exist in Helix. |
| **Planned Unified Front Desk + Python AI Inference** | **0** | **0** | **Not Yet Implemented** | Blocked pending Owner Approval (`DEVELOPMENT_APPROVED`) per Sections 2 & 22. |

> **Honesty Commitment:** No post-integration test results are claimed or simulated here. Every test suite listed in Section 2 below MUST be written and executed with real runtime output during Phases 1–6 before advancing to `CI_VERIFIED` or `STAGING_ACCEPTED`.

---

## 2. Mandatory Post-Approval Test Matrix (Section 19 & Section 8 Reliability Repairs)

### A. Python AI Inference Service (`services/ai-inference/tests/` — `pytest`)
| Suite ID | Coverage Scope | Pass Criteria |
| :--- | :--- | :--- |
| `PY-01` | **Authentication & Config Validation** | Rejects missing/invalid `X-Service-Auth` with `401`; catches invalid env configuration at startup without crashing silently; never writes `.env` files. |
| `PY-02` | **Model Startup, Prewarming & CPU/GPU Fallback** | Verifies `/v1/ready` returns `503` before prewarm and `200` after; verifies clean CPU fallback when CUDA libraries are absent (Helix v1.6–v1.9.2 CUDA crash prevention). |
| `PY-03` | **Bounded Queues, Timeouts & Request Cancellation** | Saturating `asyncio.Semaphore` returns deterministic `429 QUEUE_FULL`; slow mock inference triggers `504`; `/v1/cancel/:requestId` aborts in-flight generation cleanly. |
| `PY-04` | **VAD, STT, TTS & Translation Unit Contracts** | Validates 16 kHz PCM16 Silero VAD framing, Whisper empty/noise/hallucination filtering + `beam_size` validation, Kokoro 24 kHz chunking with `ALLOW_ESPEAK_GPL_FALLBACK=false`, and MarianMT -> Ollama translation fallback. |
| `PY-05` | **Resource & Memory Boundedness** | Repeated synthesis/transcription cycles verify zero unbounded buffer retention and accurate `/v1/health` memory/queue telemetry. |

### B. Unified Gateway, Concurrency & Reliability Tests (Node/Express — `tests/`)
| Suite ID | Coverage Scope | Pass Criteria |
| :--- | :--- | :--- |
| `GW-01` | **Unified Voice ↔ Chat Context Continuity** | Start session in chat -> switch to voice -> switch back to chat -> verify single `sessionId`, strictly ordered `turn_sequence`, preserved requirements, and zero lost context. |
| `GW-02` | **Idempotency & Duplicate Transcript Prevention** | Replaying identical `Idempotency-Key` on `messages`, `voice`, `escalate`, `callback`, and `appointments` returns cached result without duplicate DB rows or duplicate emails. |
| `GW-03` | **No Automatic Paid Gemini Fallback** | With `AI_PROVIDER_MODE='local_inference'` and mock Python worker returning `503`/timeout, verify Gemini SDK is invoked `0` times, circuit breaker opens cleanly, and `/api/ready` reports `voiceChannelReady: false`. |
| `GW-04` | **Barge-In & Stale Audio Cancellation** | Trigger `POST /api/frontdesk/sessions/:id/interrupt` or WS `interrupt` mid-response; verify `AbortController` fires, `generationEpoch` increments, and stale TTS frames are discarded. |
| `GW-05` | **Atomic Human-Agent Assignment Race Condition** | Fire 10 concurrent escalation requests against 1 `available` human agent; verify PostgreSQL `claim_frontdesk_human_agent` (`FOR UPDATE SKIP LOCKED`) grants exactly 1 assignment and routes 9 others to next agent or callback fallback. |
| `GW-06` | **Assignment Expiry & Recovery** | Advance clock past `expires_at` on unaccepted `offered` assignment; verify `expire_stale_frontdesk_assignments()` restores agent to `available` and decrements `active_session_count`. |
| `GW-07` | **Business Hours, Holidays & Callback Orchestration** | Verify after-hours and holiday dates bypass live human claiming and present honest callback scheduling backed by `frontdesk_callback_requests` + Resend outbox. |
| `GW-08` | **Google Calendar Failure Honesty** | Simulate Google Calendar `HttpError`; verify `/api/frontdesk/availability` fails closed with `503` (never returning empty `busy_periods = []` like Helix `gcal.py`). |
| `GW-09` | **Human-Like Receptionist & Policy Guardrails** | Verify transparent AI disclosure, zero human-emotion impersonation, zero unauthorized public pricing, canonical CEO **Desmond Hinds**, zero invented staff, and English + Filipino/Taglish language adaptation. |

### C. Database Migration & Security Regression Suites
| Suite ID | Coverage Scope | Pass Criteria |
| :--- | :--- | :--- |
| `DB-01` | **Migration `010` Clean Install & Upgrade** | Run `001`–`010` on empty PostgreSQL and apply `010` on top of existing `009` snapshot; re-run `010` twice to prove full idempotency and zero data loss. |
| `SEC-01` | **Cross-Session & Cross-Tenant Isolation** | Session A token attempting to read/write/delete Session B returns `403`; Client A cannot access Client B inquiries; `anon` role has zero direct Supabase table access under RLS. |
| `SEC-02` | **Prompt Injection & Internal KB Leakage** | Malicious prompt injection attempts blocked (`400`); `internal_only` KB documents never appear in LLM prompt payloads or visitor replies; zero Helix easter eggs exist anywhere in codebase. |
| `SEC-03` | **Audio Upload Abuse & Rate Limiting** | Oversized (`>5 MB`), invalid MIME, malformed WAV, and rapid-fire requests rejected with `413` / `415` / `429`. |
| `SEC-04` | **Admin Auth, CSRF & Secret Redaction** | Unauthenticated `/api/admin/frontdesk/*` returns `401`; missing CSRF returns `403`; revoked logout cookie returns `401`; zero secrets in logs, `/api/health`, or compiled `dist/`. |
| `SEC-05` | **Privacy Consent & Session Deletion** | `DELETE /api/frontdesk/sessions/:id` cascades draft turns and pending tokens while preserving compliance audit logs and formally submitted inquiries. |

### D. Staging Performance, Load, Disaster Recovery & Real-Browser Voice Soak (Phase 6 — `STAGING_ACCEPTED`)
| Test ID | Scope | Acceptance Target |
| :--- | :--- | :--- |
| `PERF-01` | **CPU vs. GPU Latency Benchmark** | Measure real P50/P95 latency for VAD, Whisper STT, Ollama TTFT (`qwen2.5:7b-instruct`), and Kokoro TTS on both CPU and GPU staging hosts; document measured numbers honestly. |
| `LOAD-01` | **Concurrent Voice & Chat Load** | Sustained concurrent sessions with bounded queue behavior, zero OOM crashes, zero dropped DB writes, and clean `429`/`503` backpressure when capacity is reached. |
| `SOAK-01` | **30-Minute Physical Browser Microphone & Speaker Soak** | Real desktop & mobile browsers over HTTPS/WSS: test mic permission deny/grant, natural turn-taking, echo suppression, barge-in interruption, mid-call voice→chat→voice switching, network drop + bounded reconnection, and clean teardown. |
| `DR-01` | **Worker Restart & Database Recovery Drill** | Kill and restart Python inference worker mid-session -> verify browser shows honest unavailable/recovery state (no infinite retry loop), recovers cleanly after worker prewarm; verify Supabase staging backup/restore preserves `001`–`010` state. |

---

## 3. Existing DESTRIA Regression Preservation Guarantee
Every phase MUST continue running the complete existing DESTRIA verification suite (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run build:server`, `npm run verify:routing:dist`, and `bun audit`) with **zero regressions** to the 184 baseline tests.
