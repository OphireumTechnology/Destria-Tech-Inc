# DESTRIA TECH INC — Helix Integration & Unified AI Front Desk Development Plan

**Directive:** `DTI-HELIX-INTEGRATION-001` (Sections 2–22)  
**Plan Date:** 2026-11-26  
**Current Classification:** **`SOURCE_AUDITED`**  
**Next Required Gate:** **Owner Review & Written Approval (`DEVELOPMENT_APPROVED`)** before creating branch `feature/destria-ai-frontdesk` or editing any application source code.

---

## 1. Pre-Implementation Approval Decisions Requested From Owner
Before Phase 1 code implementation begins, confirm:
1. **Upstream Pin:** Approve extracting selectively from Helix **`v2.0.6`** (`da9e3f9fbb2511bd8a105d53ec7d4e1627e688dc`) to include `v1.9.8` MarianMT, `v2.0.3` `asyncio.Event` handoff, and `v2.0.6` Whisper beam tuning (or pin to `v1.9.2` `e4b257d7` if preferred).
2. **Local LLM Default & GPLv3 Guard:** Approve **`qwen2.5:7b-instruct` (Apache-2.0)** as default multilingual (EN + Filipino/Taglish) Ollama model and confirm disabling GPLv3 `espeak-ng` in initial container builds (`ALLOW_ESPEAK_GPL_FALLBACK=false`).
3. **Compute Target for Python Inference Worker:** Confirm target environment for `services/ai-inference` (e.g., dedicated private GPU VM / RunPod / Modal / AWS/GCP GPU instance connected privately to Railway; note Railway standard CPU containers lack NVIDIA GPUs and will have higher Whisper/Ollama latency — CPU vs GPU benchmark is included in Phase 6).
4. **Branch Authorization:** Confirm authorization to create `feature/destria-ai-frontdesk` off `main` (`2e238e6358524a2b7a2c5c4b2878bcdacd689ce2`) without touching `main`, DNS, Railway production, or production Supabase.

---

## 2. Phased Implementation Plan (Post-Approval Only)

| Phase | Workstream | Concrete Deliverables & Code Changes | Verification Gate |
| :---: | :--- | :--- | :--- |
| **Phase 1** | **Database Schema Extension (Migration `010`)** | Author additive, idempotent `supabase/migrations/010_frontdesk_unified_receptionist_and_agents.sql` (departments, human agents, atomic `claim_frontdesk_human_agent` PostgreSQL RPC with `FOR UPDATE SKIP LOCKED`, assignments with expiry, unified conversation messages, callbacks, holidays/hours, consent records, RLS + `service_role` policies). Preserve `001`–`009` untouched. | Static SQL + live isolated staging PostgreSQL migration test (clean install + upgrade from `009`) |
| **Phase 2** | **Isolated Python AI Inference Service (`services/ai-inference/`)** | Extract & harden `stt_whisper.py`, `tts_kokoro.py`, `vad_silero.py`, `translate.py`, and `llm_ollama.py` behind FastAPI with OpenAPI docs, `X-Service-Auth` shared-secret verification, model prewarming, `asyncio.Semaphore` bounded queues, timeouts, cancellation, circuit breakers, CPU/GPU config, `/v1/health`, `/v1/ready`, `Dockerfile.cpu`, `Dockerfile.gpu`, `docker-compose.yml`, and `THIRD_PARTY_NOTICES.md`. | `pytest` unit + mock-engine + timeout/queue-overflow/auth tests |
| **Phase 3** | **Unified Voice & Chat Gateway + Human-Agent Service (Express Backend)** | Implement `src/server/frontDeskUnifiedGateway.ts`, `src/server/services/localInferenceClient.ts` (strictly zero automatic paid Gemini fallback), `src/server/services/humanAgentRoutingService.ts`, and `src/server/services/businessHoursService.ts`. Wire all Section 16 unified routes (`/api/frontdesk/sessions/*`, `/departments`, `/availability`, `/appointments`) + authenticated Admin endpoints + browser voice WebSocket bridge (`/api/frontdesk/voice/stream`). | Integration, concurrency (atomic double-claim & double-booking), cross-channel voice↔chat memory, and outage/circuit-breaker tests |
| **Phase 4** | **Unified Website Voice/Chat UI & Admin Command Center Extensions** | Extend existing `AIFrontDeskPage.tsx` and `AIConsultantWidget.tsx` (zero duplicate competing widgets) with unified voice/chat toggle sharing one `sessionId`, audio waveform, listening/thinking/speaking states, barge-in interrupt button, mute, retry connection, department selector, callback/human-assistance request, and privacy/recording consent notice. Extend `AdminFrontDeskConsole.tsx` with employee presence management, department routing, callbacks, holidays/hours, and local AI worker health. | Typecheck, lint, clean-URL build, responsive desktop/mobile verification |
| **Phase 5** | **Comprehensive Security & Regression Verification** | Add unit, integration, concurrency, tenant-isolation, prompt-injection, audio size/rate-limit, secret-redaction, session-deletion, worker-restart, and circuit-breaker tests to DESTRIA's existing 184-test suite. Run `typecheck`, `lint`, `bun audit`, `build`, `build:server`, `verify:routing:dist`. | `CI_VERIFIED` (100% pass, `0` skipped, `0` vulns, `0` public/dist leaks) |
| **Phase 6** | **Staging Deployment, CPU/GPU Benchmarking & Live 30-Min Voice Soak** | Deploy to isolated staging (Railway + Supabase staging + private inference compute), benchmark CPU vs. GPU latency/VRAM/throughput, run live 30-minute physical microphone & speaker soak (voice↔chat switches, barge-ins, network drop/recovery), verify Resend + Google Calendar + Supabase backup/restore. | `STAGING_ACCEPTED` -> Submit for explicit owner `PRODUCTION_APPROVED` sign-off |

---

## 3. Non-Negotiable Preservation Rules
- Zero removal or regression of existing DESTRIA public website, animated backgrounds, `Desmond Hinds` corporate identity, zero public pricing, 25-section masterplan, 18-section executive report, 16-stage commercial governance, Client Portal, Admin Portal, Resend outbox, or Google Calendar sync.
- Zero invocation of paid Gemini APIs unless explicitly authorized by configuration (`AI_PROVIDER_MODE='gemini_authorized'`).
- Zero production merges, pushes, DNS edits, or production DB migrations without explicit owner approval.
