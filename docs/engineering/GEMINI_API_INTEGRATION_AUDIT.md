# DESTRIA TECH INC — Gemini API Integration & Model Governance Audit

**Directive:** `DTI-MASTER-REPAIR-001`  
**Audit Date:** 2026-11-26  
**Audited Modules:** `src/server/aiRuntimeConfig.ts`, `src/server/app.ts`, `src/server/voiceContextEngine.ts`, `src/server/voiceLiveBridge.ts`, `src/server/aiToolsEngine.ts`, `scripts/lint-codebase.mjs`

---

## 1. Approved Model Governance & SDK Compliance

| Capability | Approved Model ID | Enforced Location | Notes |
| :--- | :--- | :--- | :--- |
| Enterprise Text Chat & Reasoning | `gemini-4-hydrogen` | `src/server/aiRuntimeConfig.ts` | Default; zero deprecated sampling params (`temperature`/`topP`/`topK`) sent |
| Full-Duplex Live Voice | `gemini-3.8-live` | `src/server/aiRuntimeConfig.ts`, `src/server/voiceLiveBridge.ts` | 16kHz PCM input -> 24kHz PCM output via server-only WS bridge |
| Live Extended Thinking (Optional Admin Toggle) | `gemini-3.8-live-extended-thinking` | `src/server/aiRuntimeConfig.ts` | Allowlisted for Admin AI Command Center |
| Neural Text-to-Speech | `gemini-3.8-flash-lite-tts` | `src/server/app.ts` (`/api/voice/speak`) | Server-side female neural voice (`Kore`) |
| Audio Transcription | `gemini-3.5-transcribe` | `src/server/app.ts` (`/api/voice/transcribe`) | Server-side audio transcription fallback |

**SDK & Client-Boundary Guarantees (Enforced by `scripts/lint-codebase.mjs`):**
- `@google/genai` is imported strictly in `src/server/*` — zero frontend imports exist anywhere in `src/components/`, `src/services/`, `src/admin/`, or `src/portal/`.
- `GEMINI_API_KEY` is read exclusively server-side and never included in `dist/`, client bundles, or `/api/admin/ai/overview` responses.
- Custom SDK header `'User-Agent': 'aistudio-build'` is attached at client initialization in `src/server/app.ts`.
- Admin runtime updates (`PATCH /api/admin/ai/config`) reject deprecated model IDs (e.g., `gemini-1.5-*`, `gemini-2.0-*`) and reject any attempt to inject API keys via config payloads.

---

## 2. Structured Gemini Error Classification (`classifyGeminiProviderError`)

Added in `src/server/aiRuntimeConfig.ts` and wired into `/api/consultant/chat`, `/api/voice/speak`, `/api/voice/transcribe`, `src/server/voiceContextEngine.ts`, and `src/server/voiceLiveBridge.ts`:

| Category | Typical Trigger | Retryable | Safe Operator Handling |
| :--- | :--- | :---: | :--- |
| `INVALID_CREDENTIALS` | HTTP 401/403, `API_KEY_INVALID`, `PERMISSION_DENIED` | No | Logs category without exposing key; instructs admin to verify `GEMINI_API_KEY` |
| `UNSUPPORTED_MODEL` | HTTP 404, model not found / deprecated | No | Surfaces model mismatch in Admin AI Command Center telemetry |
| `QUOTA_EXCEEDED` | Billing / insufficient quota `RESOURCE_EXHAUSTED` | No | Fails gracefully to deterministic policy-safe response |
| `RATE_LIMITED` | HTTP 429 / transient `RESOURCE_EXHAUSTED` | Yes | Retryable with bounded backoff |
| `PROVIDER_UNAVAILABLE` | HTTP 500/502/503/504 | Yes | Triggers fallback without leaking stack traces |
| `INVALID_REQUEST` | HTTP 400 / `INVALID_ARGUMENT` | No | Surfaces schema/payload defect cleanly |
| `NETWORK_TIMEOUT` | Request timeout / `ETIMEDOUT` / abort | Yes | Bounded 9.5s timeout guard prevents worker hangs |
| `MALFORMED_RESPONSE` | Invalid JSON / empty upstream payload | Yes | Falls back cleanly to structured response |
| `UNKNOWN_PROVIDER_ERROR` | Any other unclassified exception | Yes | Redacted safe summary logged |

**Secret Redaction Verification:** `classifyGeminiProviderError()` strips `AIzaSy...` API keys and `Bearer ...` tokens before storing failure records or emitting structured logs (verified in `tests/master-bulk-repair-dti001.test.ts` Section 3).

---

## 3. Commercial Policy & Tool Safety Enforcement

- **Zero Public Pricing Guardrail:** Enforced deterministically BEFORE Gemini inference and post-validated AFTER Gemini output across text chat, turn-based voice, and Gemini Live audio transcripts (English + Tagalog/Taglish).
- **Explicit Client Confirmation Gate:** `submit_consultation_request` and `submit_service_inquiry` NEVER execute autonomously; they require a single-use session-bound `confirmationToken` and `clientConfirmed: true`.
- **External Provider Verification Status:** Live Gemini API calls against Google's hosted endpoints are **`BLOCKED`** in this local sandbox because no live production `GEMINI_API_KEY` is provisioned here; must be verified on Railway staging per `docs/engineering/STAGING_ACCEPTANCE_CHECKLIST.md`.
