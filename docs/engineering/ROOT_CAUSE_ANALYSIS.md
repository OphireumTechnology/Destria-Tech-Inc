# DESTRIA TECH INC — Root Cause Analysis (RCA)

This document records the exact technical root causes identified through code inspection and failing test reproduction prior to applying surgical fixes.

## 1. Speech Normalization & Intent Accuracy (`src/server/voiceContextEngine.ts`)
- **Symptom:** Benchmark 1 achieved 89.3% (25/28) against the mandatory `>= 95%` threshold, and `normalizeSpokenUtterance('Destrea Tech and Oferium')` failed to match `/DESTRIA TECH.*Ophireum/i`.
- **Root Causes:**
  1. `normalizeSpokenUtterance()` only stripped leading filler words and lacked phonetic brand normalization rules for common speech-to-text transcriptions (`Destrea Tech` / `Destriya Tech`, `Oferium` / `Ophirium`).
  2. `isUnclearOrNoisyTranscript()` anchored repeated filler tokens inside a single group without allowing whitespace/punctuation between tokens, causing `"hmm mm ??"` to return `false` and fall through to generic discovery routing.
  3. `detectAffirmativeBookingIntent()` checked `(open|show|start|launch) (the )?(booking|scheduling|appointment|calendar)` without permitting `"consultation"` before `"booking"`, causing `"Please open the consultation booking form..."` to miss booking intent and fall through to catalog keyword scoring.
  4. Multi-clause enterprise instructions containing bare `"Q3"` timelines and explicit capability keywords (`web portal`, `role-based access`, `analytics dashboards`, `automated API alerts`) were not extracted into context or acknowledged in the structured fallback reply.

## 2. Contextual Follow-Up Memory & Escalation Precedence (`src/server/voiceContextEngine.ts`)
- **Symptom:** Benchmark 2 achieved 90.0% (18/20), failing on `[Memory extraction: client name & company]` and `[Human escalation follow-up]`.
- **Root Causes:**
  1. `extractClientContextFromUtterance()` matched `(?:my\s+name\s+is|i\s+am|...)` without case-insensitive prefix matching. Because the user utterance began with capitalized `"My name is Carlos Mendoza..."`, `clientName` remained `undefined`. Additionally, `"Pacific Logistics Group"` triggered catalog matching on `"Logistics"` instead of acknowledging the client's contact introduction.
  2. `isHumanEscalation` did not recognize `"call your solutions team directly"`, causing `"Actually I would rather call your solutions team directly."` to skip Step 1 (human escalation) and match Step 2 (`isCorrection` triggered by `"Actually"`).

## 3. Authorized Gemini Tool Execution & Confirmation Endpoint (`src/server/aiToolsEngine.ts`, `src/server/app.ts`)
- **Symptom:** Tools Suite failed on `collect_project_requirements`, `prepare_service_inquiry`, and `/api/consultant/confirm-tool`.
- **Root Causes:**
  1. `handleCollectProjectRequirements()` returned `{ capturedRequirements }` instead of `{ requirements, capturedRequirements }`.
  2. `handleRecommendTechnologySolutions()` only checked `args.businessObjective`, dropping `args.businessObjectives`.
  3. `handlePrepareServiceInquiry()` passed `{ type: 'service_inquiry', selectedServiceIds: [] }` to `validateInquiryPayload()`. In `src/server/validation.ts`, any `type` other than `'contact_inquiry'` / `'contact_form'` defaults to `'solution_builder'`, which strictly requires at least one valid catalog service ID—causing valid AI-prepared inquiries to fail validation with `ok: false`.
  4. `POST /api/consultant/confirm-tool` in `src/server/app.ts` only accepted `kind === 'consultation_request' | 'service_inquiry'`, rejecting the `'consultation' | 'inquiry'` values sent by `src/services/aiConsultantService.ts` in production and by the test suite, and returned HTTP `201` rather than `200`.

## 4. Gemini Live WebSocket Bridge Protocol & Process Hang (`src/server/voiceLiveBridge.ts`, `src/services/aiVoiceService.ts`)
- **Symptom:** Live Bridge Suite timed out waiting for `ready`, failed on `tool_event.eventType`, and hung the Node test process for up to 5 minutes.
- **Root Causes:**
  1. Session registration and `{ type: 'ready' }` emission were bound exclusively inside `callbacks.onopen`. When an SDK or deterministic mock resolves `ai.live.connect()` without invoking `callbacks.onopen`, `ready` is never emitted.
  2. `voiceLiveBridge.ts` emitted `{ type: 'tool_event', toolName, event: outcome.uiEvent }`, omitting top-level `eventType` and `payload` that both `src/services/aiVoiceService.ts` and the test suite read.
  3. `idleTimeoutTimer` (5 minutes) and `sessionTtlTimer` (20 minutes) were active ref'd Node timers, and `bridge.close()` called `wss.close()` without invoking per-connection `cleanup()` or terminating open `wss.clients`.
  4. Duplicate `init` messages and client disconnects occurring while `await ai.live.connect()` was pending were unguarded.

## 5. Rate-Limit IP Spoofing & CI/CD Drift (`src/server/app.ts`, `src/server/voiceLiveBridge.ts`, `.github/workflows/`)
- **Root Causes:**
  1. Both `getClientIp()` and `getUpgradeClientIp()` extracted the leftmost `X-Forwarded-For` address, allowing any client to forge rotating `X-Forwarded-For` headers and bypass rate limiting.
  2. `.github/workflows/deploy-pages.yml` still carried legacy fallback `https://api.ophireummultimedia.com` instead of `https://api.destriatech.com`.
  3. `package.json` aliased `"lint"` to `tsc --noEmit` and duplicated `"test:unit"` / `"test:security"` as identical full-suite runs.
