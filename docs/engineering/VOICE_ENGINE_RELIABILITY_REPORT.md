# DESTRIA TECH INC — Voice Engine Reliability Report

**Directive:** `DTI-MASTER-REPAIR-001`  
**Audit Date:** 2026-11-26  
**Audited Modules:** `src/services/aiVoiceService.ts`, `src/server/voiceContextEngine.ts`, `src/server/voiceLiveBridge.ts`, `src/components/consultant/AIConsultantWidget.tsx`, `src/components/frontdesk/AIFrontDeskPage.tsx`

---

## 1. Confirmed Defects Repaired

| Defect | Prior Failure Mode | Implemented Repair | Verification |
| :--- | :--- | :--- | :--- |
| **False-Positive `listening` State on Unreachable Backend** | Clicking Voice immediately opened microphone hardware and transitioned into `listening` even when `/api/voice/session` was unreachable (`NXDOMAIN` / `503`), causing users to speak into a dead session and hear repeated fallback errors. | Added `checking_service` pre-flight state in `AIVoiceService.startSession()`. The client MUST verify `POST /api/voice/session` BEFORE requesting `getUserMedia()` or starting `SpeechRecognition`. If unreachable, the session fails fast to `service_unavailable` with zero microphone access and an honest banner. | `tests/master-bulk-repair-dti001.test.ts` Section 2 |
| **Concurrent `startSession()` Race** | Rapid double-clicks on the Voice CTA could invoke overlapping `startSession()` flows, leaking media streams or causing state thrashing. | Added `startInFlightPromise` concurrency mutex so simultaneous start calls share the single active initialization promise. | `src/services/aiVoiceService.ts` |
| **Lost Spoken Questions on Transient Outage** | When `/api/voice/process` exhausted its retry budget and opened the circuit breaker (`service_unavailable`), the user's unanswered spoken question was lost. | Preserved `lastUnansweredQuestion` across circuit-breaker trips and exposed `retryLastUnansweredQuestion()`, wired to a manual **Retry Last Question** button in both `AIConsultantWidget.tsx` and `AIFrontDeskPage.tsx`. | `tests/master-bulk-repair-dti001.test.ts` Section 2 |
| **WebSocket Mixed-Content / Path Construction** | Manual string replacement in `tryConnectGeminiLive()` could produce malformed URLs on non-standard API bases. | Replaced manual string construction with `buildWebSocketUrl(wsPath)` from `src/lib/apiClient.ts` enforcing `wss:` on HTTPS origins. | `tests/master-bulk-repair-dti001.test.ts` Section 1 & `tests/voice-continuous-conversation.test.ts` |
| **Unstructured Gemini Live Upstream Error Logging** | Upstream Live bridge errors logged raw error strings without operational categorization. | Wired `classifyGeminiProviderError()` into `src/server/voiceLiveBridge.ts` and `src/server/voiceContextEngine.ts` with API-key/token redaction. | `tests/master-bulk-repair-dti001.test.ts` Section 3 |

---

## 2. Deterministic Voice State Machine

```
idle -> checking_service -> connecting -> greeting -> listening <-> user_speaking -> processing -> ai_speaking -> listening
                                 |                                                       |
                                 v                                                       v
                        service_unavailable <------- (circuit breaker / outage) --- reconnecting
                                 |
                           (manual retry / Retry Last Question)
                                 v
                           checking_service
```

Key invariants verified by automated tests:
1. `service_unavailable` NEVER loops spoken error messages (`maxConsecutiveNetworkFailures = 2`, 20s cooldown, acoustic self-echo guard).
2. `stopSession()` unconditionally stops all `MediaStream` tracks, closes WebAudio contexts, aborts in-flight `fetch()` controllers, closes `WebSocket` connections, and increments `sessionSeq` so stale callbacks are dropped.
3. Duplicate final speech recognition bursts within `1800ms` are deduplicated, while explicit manual `retryLastUnansweredQuestion()` resets the dedupe window so legitimate retries always execute.

---

## 3. Honest Verification Boundary

- **Locally Verified (`CI_VALIDATED`):**
  - 25-scenario continuous conversation harness (`tests/voice-continuous-conversation.test.ts`)
  - Gemini Live bridge lifecycle, Origin 403, tool calls, commercial policy audio override, admin termination (`tests/gemini-live-upgrade.test.ts`)
  - Pre-flight backend failure isolation, zero mic leak, unanswered question preservation & recovery (`tests/master-bulk-repair-dti001.test.ts`)
  - Speech Intent Recognition Benchmark 1 (**28/28 = 100%**) and Contextual Follow-Up Memory Benchmark 2 (**20/20 = 100%**)
- **Pending Live Hardware & Hosted Validation (`BLOCKED` in local sandbox):**
  - 30-minute real browser microphone soak test across Chrome, Safari, Edge, and mobile browsers against live `wss://api.destriatech.com/api/voice/live` with a live `GEMINI_API_KEY`.
