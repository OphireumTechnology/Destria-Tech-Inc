# DESTRIA TECH INC — Upstream Helix Source Code Audit

**Directive:** `DTI-HELIX-INTEGRATION-001` (Section 2 Mandatory Source Acquisition & Audit Gate)  
**Audit Date:** 2026-11-26  
**Release Classification:** **`SOURCE_AUDITED`** *(Implementation paused pending explicit owner approval)*

---

## 1. Verified Upstream & Target Repository Provenance

| Repository | Verified URL | Verified Commit / Tag | License | Verification Method |
| :--- | :--- | :--- | :---: | :--- |
| **Upstream Reference (Helix)** | `https://github.com/ClownRyda/helix-ai-virtual-receptionist` | **Latest tag `v2.0.6`:** commit `da9e3f9fbb2511bd8a105d53ec7d4e1627e688dc` (tag `97400e4edbd5ed00046e2c8bf75985b92bbfb7b`)<br>**Directive reference tag `v1.9.2`:** commit `e4b257d735262486aec0f5d018b09fe2ecacc8bb` | **MIT License** (`Copyright (c) 2026 Helix AI Virtual Receptionist`) | Live `git clone` & source inspection (NOT README/changelog inference) |
| **Target Repository (DESTRIA TECH INC)** | `https://github.com/OphireumTechnology/Destria-Tech-Inc` | **Remote `main` HEAD:** `2e238e6358524a2b7a2c5c4b2878bcdacd689ce2` (`docs: update API documentation and operational metrics`)<br>Includes migrations `001`–`009` and `DTI-MASTER-COMPLETION-003` hardening (`184 / 184` passing tests in workspace) | Proprietary (DESTRIA TECH INC) | Live `git clone` of `main` + full workspace inspection |

### Version Delta (`v1.9.2` -> `v2.0.6`, 27 commits)
Upstream Helix advanced beyond `v1.9.2` with meaningful reliability upgrades worth selectively reviewing:
- `v1.9.3` (`f1bade5`): RTP port allocation lock (telephony-only).
- `v1.9.4`–`v1.9.6` (`6374e79`, `fece31c`, `e8c4acb`): Active call registry route ordering & Kokoro config alignment.
- `v1.9.8` (`7eef695`): **MarianMT CTranslate2 translation fast-path** with Ollama fallback and startup prewarm.
- `v2.0.1`–`v2.0.3` (`d3ab4f5`, `377c436`, `5ff2909`): Snapshot-safe active session iteration, in-memory `/api/health` history ring buffer, and `asyncio.Event` signaling replacing polling wait loops for handoffs.
- `v2.0.5`–`v2.0.6` (`4521f9b`, `da9e3f9`): Docker agent healthcheck and configurable live Whisper `beam_size` tuning.

**Recommendation on Pinning:** Pin upstream extraction strictly to verified commit **`da9e3f9fbb2511bd8a105d53ec7d4e1627e688dc` (`v2.0.6`)** (or `e4b257d7` if owner prefers `v1.9.2`), extracting ONLY clean inference/routing patterns while discarding all Asterisk/SIP/RTP/vTiger/Easter-egg code.

---

## 2. Capability Comparison: Helix vs. Existing DESTRIA TECH INC Platform

| Functional Domain | Helix (`v2.0.6`) Implementation | Existing DESTRIA TECH INC (`main`) | Overlap & Architectural Decision |
| :--- | :--- | :--- | :--- |
| **Speech-to-Text (STT)** | Local `faster-whisper` (CTranslate2, PCM16 -> text + lang + confidence) | Server-side Gemini transcription (`/api/voice/transcribe`, `gemini-3.5-transcribe`) + browser Web Speech API | **NEW CAPABILITY (ADAPT):** Extract into isolated Python FastAPI inference worker with multilingual model (`small`/`medium`/`large-v3-turbo`) to support EN + Filipino/Taglish without paid APIs. |
| **Voice Activity Detection (VAD)** | Local `silero-vad` (PyTorch, 512-sample windows at 16 kHz, `<1 ms` CPU) | Browser energy/SpeechRecognition turn detection | **NEW CAPABILITY (ADAPT):** Extract into Python inference worker for deterministic server-side turn-end & barge-in detection on browser PCM WebSocket frames. |
| **Text-to-Speech (TTS)** | Local `kokoro` (82M neural TTS, 24 kHz -> 16 kHz, EN/ES/FR/IT) + `espeak-ng` fallback (DE/RO/HE) | Gemini neural TTS (`/api/voice/speak`, `gemini-3.8-flash-lite-tts`) + browser `speechSynthesis` | **NEW CAPABILITY (ADAPT WITH LICENSE CARE):** Extract Kokoro-82M (`Apache-2.0`) at native 24 kHz for browser audio; isolate/avoid GPLv3 `espeak-ng` contamination (see `HELIX_LICENSE_REVIEW.md`). |
| **Local LLM Reasoning & Translation** | `ollama` Python client (`llama3.1:8b`), basic 4-intent JSON classifier (`schedule/transfer/info/faq`), flat `faq.txt`, MarianMT CTranslate2 | Full bilingual EN/TL/Taglish `voiceContextEngine.ts`, 12 schema-validated tools, 25-section masterplan, 18-section exec report, grounded Supabase KB | **ADAPT INFERENCE ONLY — PRESERVE DESTRIA ORCHESTRATION:** Use Ollama solely as a local pluggable LLM provider inside DESTRIA's existing enterprise orchestration, knowledge base, and commercial governance engine. Never replace DESTRIA's prompt guardrails or KB with `faq.txt`. |
| **Media Transport** | Asterisk ARI WebSocket + UDP RTP `slin16` (`20000-20100/udp`), `PJSIP/` channel transfers | Browser WebSocket (`/api/voice/live`) + HTTP voice endpoints + `aiVoiceService.ts` | **INCOMPATIBLE (REJECT):** Do NOT import `ari_agent.py` SIP/RTP/Asterisk telephony into website voice. Build browser WebSocket PCM streaming on DESTRIA's gateway. |
| **Human-Agent Presence & Atomic Claim** | `agent/routing/agents.py`: `available/busy/break/offline`, queue + language ranking, conditional `UPDATE ... WHERE availability_state='available' AND current_call_id IS NULL` | `frontdesk_human_escalations` ticket queue (no live employee presence/capacity atomic claiming yet) | **VALUABLE PATTERN (RE-IMPLEMENT IN POSTGRESQL/TS):** Adapt Helix's atomic longest-idle claiming + `asyncio.Event` acceptance model into Supabase PostgreSQL (`FOR UPDATE SKIP LOCKED` + expiry + acceptance confirmation) & DESTRIA Express/Admin Portal. |
| **Database Layer** | SQLite (`aiosqlite` + `PRAGMA table_info` + CSV strings) and `better-sqlite3` (`data.db`) | Supabase PostgreSQL with 9 reconciled migrations (`001`–`009`), RLS, `service_role` policies, fail-closed `503` | **INCOMPATIBLE (REJECT SQLITE):** Replace all SQLite persistence with additive Supabase PostgreSQL migration `010`. |
| **Google Calendar** | Local OAuth files (`credentials.json`/`token.json`), swallows `freebusy` errors into `busy_periods=[]`, Linux-only `strftime("%-d")` | `src/server/services/calendarService.ts`: service-account JWT, DST-aware UTC, `409 SLOT_CONFLICT`, reschedule/cancel sync, zero fake slots/Meet links | **PRESERVE DESTRIA:** Keep DESTRIA's superior `calendarService.ts`; only optionally borrow slot-to-natural-speech helper phrasing. |
| **Admin Dashboard** | Separate Express + React/Vite app (`dashboard/`) with **zero auth** and hardcoded `mockCalls`/`mockAgents` fallbacks | DESTRIA `AdminPortalApp.tsx` + `AdminFrontDeskConsole.tsx` with `HttpOnly` cookie, CSRF `403`, durable `009` revocation, live DB queries | **REJECT SEPARATE DASHBOARD:** Extend DESTRIA's existing `AdminFrontDeskConsole.tsx` with agent presence, department routing, callback queue, and local AI worker health. |
| **Automated Test Suite** | **0 automated tests** in entire Helix repository | **`184 / 184` passing tests across `41` suites** (unit, integration, security, concurrency) | **DEFECT IN UPSTREAM:** Every extracted/adapted module MUST ship with dedicated unit, integration, concurrency, and security regression tests. |

---

## 3. Critical Security Risks, Defects & Operational Gaps Found in Helix Source

| Severity | Finding | Exact Helix Source Location | Remediation Required Before/During Integration |
| :---: | :--- | :--- | :--- |
| **CRITICAL** | **Zero Authentication / RBAC on All API & Dashboard Endpoints** | `agent/api.py` (all routes), `dashboard/server/routes.ts` | Require authenticated service-to-service Bearer/HMAC secret on Python worker (private network only); route all browser/admin access exclusively through DESTRIA's authenticated Express gateway (`requireAdmin` + CSRF + `HttpOnly` cookie). |
| **CRITICAL** | **Plaintext Secret Exposure & `.env` Rewrite Injection Risk** | `agent/api.py:801, 853–873` (`GET/PATCH /api/config` exposes `vtiger_access_key` and mutates `.env` via regex) | **DO NOT EXTRACT** `.env` mutation or config secret endpoints. All configuration stays in immutable Railway/container environment variables and Supabase tables. |
| **CRITICAL** | **Unauthorized Hidden Easter Eggs ("20 Questions" & "TOP SECRET MODE")** | `agent/ari_agent.py:68–737` (`SECRET_GAME_TRIGGER_PHRASES`, `TOP_SECRET_SYSTEM_PROMPT`) | **DO NOT EXTRACT** `ari_agent.py`. Zero hidden trigger phrases or non-corporate personas permitted in DESTRIA TECH INC. |
| **HIGH** | **Fabricated Availability on Google Calendar Outage & Mock Dashboard Fallback** | `agent/gcal/gcal.py:92–95` (`except HttpError: busy_periods = []`); `dashboard/server/routes.ts:5–120` | Reject both patterns. Preserve DESTRIA's fail-honest `availabilityVerified: false` and fail-closed `503` behavior. |
| **HIGH** | **GPLv3 Contamination Risk (`espeak-ng` / `libespeak-ng-dev`)** | `docker/Dockerfile.agent:18–19`, `agent/tts/kokoro_engine.py` | Review and isolate `espeak-ng` usage (see `HELIX_LICENSE_REVIEW.md`); prefer pure Apache-2.0/MIT phonemizer paths or strict out-of-process container boundary. |
| **HIGH** | **Cold-Start Model Loading, Unbounded Concurrency & Missing Timeouts** | `agent/stt/whisper_engine.py:13`, `agent/tts/kokoro_engine.py:66`, `agent/llm/intent_engine.py` | Implement startup model prewarming, bounded `asyncio.Semaphore` worker queues, explicit per-request timeouts, cancellation tokens, and circuit breakers. |
| **MEDIUM** | **SQLite-Only Primitives (`PRAGMA`, CSV columns, naive `datetime.utcnow()`, Linux `%-d`)** | `agent/database.py:177–186`, `agent/routing/agents.py`, `agent/gcal/gcal.py:126` | Replace with PostgreSQL `TIMESTAMPTZ`, `TEXT[]` arrays, `FOR UPDATE SKIP LOCKED`, and portable date formatting. |
| **MEDIUM** | **Missing Filipino / Tagalog / Taglish Support in Helix** | `agent/llm/translate_engine.py:42–50`, `agent/tts/kokoro_engine.py:34–40` | Configure multilingual Whisper (`auto_detect_language=True`) + multilingual Ollama model (`qwen2.5:7b-instruct` or `llama3.1:8b`); benchmark Filipino TTS fallback cleanly. |
| **MEDIUM** | **Zero Automated Tests in Upstream Helix** | Entire `/tmp/helix-audit` tree (`0` test files) | Build full pytest suite for Python worker + Node/TS integration, concurrency, and security tests in DESTRIA repo. |
