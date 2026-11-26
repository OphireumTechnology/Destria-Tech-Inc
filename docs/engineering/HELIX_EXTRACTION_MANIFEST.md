# DESTRIA TECH INC — Upstream Helix Source Extraction & Attribution Manifest

**Directive:** `DTI-HELIX-INTEGRATION-001` (Section 4)  
**Upstream Repository:** `https://github.com/ClownRyda/helix-ai-virtual-receptionist`  
**Verified Upstream Pin:** Tag `v2.0.6` (`da9e3f9fbb2511bd8a105d53ec7d4e1627e688dc`) | Directive reference `v1.9.2` (`e4b257d735262486aec0f5d018b09fe2ecacc8bb`)  
**Upstream License:** MIT License (`Copyright (c) 2026 Helix AI Virtual Receptionist`)  
**Extraction Status:** **`AUDITED ONLY — ZERO FILES EXTRACTED INTO WORKSPACE PENDING OWNER APPROVAL`**

---

## 1. File-by-File Verification & Extraction Disposition (All 24 Section 4 Paths)

| # | Upstream Path | Exists in Upstream? | Line / File Count | Classification | Planned Disposition in DESTRIA TECH INC |
| :-: | :--- | :---: | :---: | :---: | :--- |
| 1 | `agent/main.py` | **YES** | 79 lines | **ADAPT (PATTERN ONLY)** | Do NOT import Asterisk `ARIAgent` boot loop. Build clean FastAPI lifespan entrypoint `services/ai-inference/app/main.py` with model prewarm & graceful shutdown. |
| 2 | `agent/api.py` | **YES** | 1,107 lines | **INCOMPATIBLE / REJECT AS-IS** | Zero auth, mutates `.env`, exposes `vtiger_access_key`, Asterisk-coupled. Keep only `/api/health` history ring-buffer concept (`v2.0.2`) inside authenticated worker `/v1/health` & `/v1/ready`. |
| 3 | `agent/config.py` | **YES** | 170 lines | **ADAPT** | Extract Pydantic v2 `BaseSettings` structure for Whisper/Kokoro/Silero/Ollama/CPU-GPU/queue limits into `services/ai-inference/app/config.py`; drop Asterisk/SIP/vTiger settings. |
| 4 | `agent/database.py` | **YES** | 207 lines | **INCOMPATIBLE (SQLITE)** | Do NOT extract SQLite/SQLAlchemy layer. Translate `AgentProfile`, `RoutingRule`, and `Holiday` schemas into Supabase PostgreSQL migration `010`. |
| 5 | `agent/ari_agent.py` | **YES** | 3,449 lines | **REJECT (TELEPHONY + EASTER EGGS)** | Tightly coupled to Asterisk ARI/UDP RTP and contains unauthorized `SECRET_GAME` & `TOP_SECRET` modes. **Do NOT extract.** Only reference `asyncio.Event` handoff notification pattern (`v2.0.3`). |
| 6 | `agent/stt/whisper_engine.py` | **YES** | 117 lines | **EXTRACT & HARDEN** | Extract into `services/ai-inference/app/engines/stt_whisper.py` with MIT attribution; add startup prewarm, multilingual support (EN/TL/Taglish), sample-rate validation/resampling, bounded concurrency, and timeout cancellation. |
| 7 | `agent/tts/kokoro_engine.py` | **YES** | 247 lines | **EXTRACT & HARDEN** | Extract into `services/ai-inference/app/engines/tts_kokoro.py` with MIT attribution; emit native 24 kHz PCM/WAV chunks for browser streaming, add prewarm & sentence chunking, isolate GPLv3 `espeak-ng` per `HELIX_LICENSE_REVIEW.md`. |
| 8 | `agent/vad/silero_engine.py` | **YES** | 221 lines | **EXTRACT & HARDEN** | Extract `FixedVADIterator` + Silero VAD wrapper into `services/ai-inference/app/engines/vad_silero.py` (preserving both Helix MIT and upstream `whisper_streaming` MIT notices); expose stateless/session-scoped VAD endpoints for browser audio frames. |
| 9 | `agent/llm/intent_engine.py` | **YES** | 314 lines | **ADAPT (OLLAMA CLIENT ONLY)** | Discard `faq.txt` and narrow 4-intent prompt. Adapt async Ollama client call wrapper into `services/ai-inference/app/engines/llm_ollama.py` with strict timeout, prompt-injection delimiters, and structured JSON output compatible with DESTRIA's existing `voiceContextEngine.ts` & grounded KB. |
| 10 | `agent/llm/translate_engine.py` | **YES** | 346 lines | **EXTRACT & EXTEND** | Extract MarianMT CTranslate2 fast-path + Ollama fallback + `langdetect` wrapper into `services/ai-inference/app/engines/translate.py` with MIT attribution; extend language normalization for Filipino (`tl`/`fil`) via Ollama fallback. |
| 11 | `agent/routing/agents.py` | **YES** | 376 lines | **ADAPT TO TS + POSTGRESQL** | Port longest-idle queue+language ranking and atomic conditional claim (`availability_state='available' AND current_session_id IS NULL`) into DESTRIA TypeScript repository + Supabase PostgreSQL `FOR UPDATE SKIP LOCKED` RPC with assignment expiry & human acceptance confirmation. |
| 12 | `agent/routing/router.py` | **YES** | 208 lines | **ADAPT TO TS + POSTGRESQL** | Port priority-ordered department keyword routing + business-hours/holiday evaluation into DESTRIA's unified orchestration service without inventing staff or hardcoding Asterisk extensions (`1001`/`1002`/`1003`). |
| 13 | `agent/gcal/gcal.py` | **YES** | 223 lines | **DO NOT REPLACE DESTRIA** | DESTRIA's `src/server/services/calendarService.ts` is already superior (service account JWT, DST-aware UTC, reschedule/cancel, no fake slots on error). Only adapt natural `slots_to_speech` phrasing helper if helpful (fixing Linux-only `%-d` formatting). |
| 14 | `dashboard/client/src/pages/` | **YES** | 10 TSX pages | **REFERENCE ONLY (NO COPY)** | Do NOT import competing React app or Asterisk/Voicemail/Campaign pages. Reference Agents/Routing/Settings UX patterns when extending DESTRIA's existing `src/admin/AdminFrontDeskConsole.tsx`. |
| 15 | `dashboard/client/src/lib/queryClient.ts` | **YES** | 39 lines | **REJECT (REDUNDANT)** | DESTRIA already has hardened `src/lib/apiClient.ts` (`API_COMPATIBILITY_VERSION`, HTTPS/WSS validation, credential stripping, `X-Requested-With` CSRF headers). |
| 16 | `dashboard/server/` | **YES** | 5 TS files | **REJECT (INSECURE + MOCKS)** | Contains unauthenticated proxy, `better-sqlite3`, and hardcoded `mockCalls`/`mockAgents`. DESTRIA Express backend (`src/server/app.ts`) remains the single backend. |
| 17 | `docker/Dockerfile.agent` | **YES** | 54 lines | **ADAPT** | Use as reference for `services/ai-inference/Dockerfile.gpu` and `Dockerfile.cpu` (non-root user, pinned dependencies, no UDP RTP `20000-20100`, no SQLite volume). |
| 18 | `docker/Dockerfile.agent.windows` | **YES** | 44 lines | **REFERENCE ONLY** | Optional local developer GPU reference; production inference targets Linux containers. |
| 19 | `docker/docker-compose.yml` | **YES** | 134 lines | **ADAPT (DROP ASTERISK/HOST NET)** | Create isolated `services/ai-inference/docker-compose.yml` for private internal bridge networking (`ollama` + `ai-inference` only; no `network_mode: host`, no `asterisk`, no duplicate dashboard). |
| 20 | `docker/docker-compose.windows.yml` | **YES** | 132 lines | **REFERENCE ONLY** | Optional local dev reference only. |
| 21 | `scripts/onboard.sh` | **YES** | 1,161 lines | **REJECT (PBX INSTALLER)** | Installs Asterisk, nginx, systemd, and SQLite interactively — incompatible with Railway + Supabase + containerized inference deployment. |
| 22 | `scripts/onboard-windows.ps1` | **YES** | 402 lines | **REJECT (PBX INSTALLER)** | Windows Asterisk onboarding script — not applicable. |
| 23 | `scripts/update-live-install.sh` | **YES** | 83 lines | **REJECT (BARE-METAL MUTATOR)** | Runs `git pull` directly on live host — incompatible with CI-gated immutable container releases. |
| 24 | `scripts/fix-live-env.sh` | **YES** | 52 lines | **REJECT (LIVE `.env` MUTATOR)** | Mutates host `.env` directly — incompatible with secret-managed cloud deployments. |

---

## 2. Mandatory Upstream Attribution Plan (Upon Approval)
When extraction is approved, create `THIRD_PARTY_NOTICES.md` (and preserve file-header MIT notices in `services/ai-inference/app/engines/`) citing:
1. `helix-ai-virtual-receptionist` (`v2.0.6`, commit `da9e3f9fbb2511bd8a105d53ec7d4e1627e688dc`) — MIT License, `Copyright (c) 2026 Helix AI Virtual Receptionist`.
2. `whisper_streaming` (`FixedVADIterator` inside `silero_engine.py`) — MIT License.
