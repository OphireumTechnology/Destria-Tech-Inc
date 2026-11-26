# DESTRIA TECH INC — Outstanding Issues, Risks & Owner Blockers Register

**Directive:** `DTI-HELIX-INTEGRATION-001` (Section 20)  
**Register Date:** 2026-11-26  
**Release Classification:** **`SOURCE_AUDITED`**

---

## 1. Owner Approval Decisions Required Before Phase 1 Implementation (`DEVELOPMENT_APPROVED` Gate)

| ID | Decision Required | Recommended Option | Impact if Deferred |
| :---: | :--- | :--- | :--- |
| **DEC-01** | **Upstream Helix Extraction Pin:** Extract selectively from latest `v2.0.6` (`da9e3f9fbb2511bd8a105d53ec7d4e1627e688dc`) vs. directive reference `v1.9.2` (`e4b257d735262486aec0f5d018b09fe2ecacc8bb`)? | **`v2.0.6`** (adds `v1.9.8` MarianMT fast-path, `v2.0.3` `asyncio.Event` handoff, `v2.0.5` healthcheck, `v2.0.6` Whisper `beam_size` tuning; same MIT license). | Cannot freeze `THIRD_PARTY_NOTICES.md` or begin selective extraction. |
| **DEC-02** | **Default Local LLM & GPLv3 `espeak-ng` Policy:** Approve `qwen2.5:7b-instruct` (Apache-2.0) as default multilingual Ollama model and disable GPLv3 `espeak-ng` (`ALLOW_ESPEAK_GPL_FALLBACK=false`) in initial builds? | **Approve both** (eliminates Meta Llama community license ambiguity & GPLv3 copyleft risk while improving English/Filipino/Taglish accuracy). | Blocks Phase 2 `Dockerfile` and model prewarm config. |
| **DEC-03** | **Private Inference Compute Target:** Specify the staging/production hosting target for `services/ai-inference` (private GPU VM / Modal / RunPod / GCP-AWS GPU vs. CPU-only container). | **Private GPU host (16–24 GB VRAM)** for staging voice soak & production; CPU profile used only for CI/local dev. | Standard Railway CPU containers lack GPUs and will have multi-second voice latency. |
| **DEC-04** | **Development Branch Creation:** Confirm authorization to create `feature/destria-ai-frontdesk` off `main` (`2e238e63`) and begin Phase 1 code work. | **Approve** (zero impact on `main`, production DB, or production hosting). | Hard stop per Sections 2 & 22 until approved. |

---

## 2. Critical Upstream Helix Security, Quality & Legal Defects (Mitigated by Selective Extraction Plan)

| Issue ID | Severity | Upstream Source Location | Verified Defect / Risk | Planned Resolution |
| :---: | :---: | :--- | :--- | :--- |
| **HLX-01** | **CRITICAL** | `agent/api.py`, `dashboard/server/routes.ts` | **Zero authentication** on all FastAPI and dashboard endpoints. | Never expose inference service publicly; enforce `X-Service-Auth` shared secret on FastAPI and DESTRIA's existing `requireAdmin` + CSRF + `admin_revoked_sessions` on Admin routes. |
| **HLX-02** | **CRITICAL** | `agent/api.py:801, 853–873` | `GET /api/config` exposes `vtiger_access_key` in plaintext; `PATCH /api/config` mutates `.env` files on disk via regex. | **Exclude** `agent/api.py` entirely; author clean FastAPI inference service from scratch with immutable env config and zero secret return endpoints. |
| **HLX-03** | **HIGH** | `agent/ari_agent.py:68–737` | Contains undocumented **hidden easter eggs** (`SECRET_GAME_TRIGGER_PHRASES` "20 Questions" and `TOP_SECRET_SYSTEM_PROMPT`) plus 3,449 lines of Asterisk SIP/RTP coupling. | **Exclude** `agent/ari_agent.py` completely; implement clean corporate browser voice gateway in Express. |
| **HLX-04** | **HIGH** | Entire Helix repository | **Zero automated tests** (`0` test files across Python and TypeScript). | Author full `pytest` + Vitest/Node unit, integration, concurrency, security, load, and soak suites (`FRONTDESK_TEST_REPORT.md`). |
| **HLX-05** | **HIGH** | `docker/Dockerfile.agent`, `agent/tts/kokoro_engine.py` | **GPLv3 `espeak-ng` / `libespeak-ng-dev`** dependency used for OOD phoneme fallback and DE/RO/HE synthesis. | Isolate Python worker in separate microservice container and disable `espeak-ng` by default (`ALLOW_ESPEAK_GPL_FALLBACK=false`) pending legal review. |
| **HLX-06** | **HIGH** | `agent/gcal/gcal.py:92–95`, `dashboard/server/routes.ts:5–120` | `gcal.py` catches `HttpError` and sets `busy_periods = []` (fabricating open slots during outages) + Linux-only `strftime("%-d")`; dashboard serves hardcoded fake `mockCalls`/`mockAgents`/`mockAppointments` when agent is down. | **Exclude** both; keep DESTRIA's fail-closed `calendarService.ts` and strict fail-closed backend routes. |
| **HLX-07** | **MEDIUM** | `agent/database.py`, `agent/routing/agents.py` | SQLite-only (`aiosqlite`, `PRAGMA`, CSV lists, naive UTC timestamps, non-atomic busy flag). | Replace with additive PostgreSQL Migration `010` (`UUID`, `TIMESTAMPTZ`, `TEXT[]`, `JSONB`, RLS, and atomic `FOR UPDATE SKIP LOCKED` RPC). |
| **HLX-08** | **MEDIUM** | `agent/tts/kokoro_engine.py`, `agent/llm/translate_engine.py` | **Filipino (`tl`/`fil`) TTS Gap:** Helix supports 9 languages (EN, ES, FR, IT, PT, DE, RO, HE, JA) and omits native Filipino TTS voices. | Multilingual Whisper STT + `qwen2.5:7b-instruct` natively handle English, Filipino, and Taglish comprehension & text responses; Filipino voice synthesis pronunciation must be honestly benchmarked in Phase 6 (and paired with clean text display or an evaluated Apache/MIT Filipino TTS voice if needed). |

---

## 3. Pre-Existing External Infrastructure & Workspace Blockers (Carried Forward Honestly)

| Blocker ID | Severity | Description | Required Owner / External Action |
| :---: | :---: | :--- | :--- |
| **EXT-01** | **HIGH (Prod Gate)** | **`api.destriatech.com` DNS `NXDOMAIN`:** Production custom API domain does not yet resolve to the live Railway deployment (documented in `PRODUCTION_HOSTING_AND_DNS_REPAIR_GUIDE.md`). | Add DNS `CNAME` record for `api.destriatech.com` -> Railway target domain and verify TLS before production commissioning. |
| **EXT-02** | **MEDIUM (Tooling)** | **Sandbox Workspace Lacks `.git` Metadata:** The local AI Studio build workspace does not contain a `.git` directory or GitHub push credentials (`origin` cannot be branched/pushed directly from inside this sandbox without repo credentials or applying patches via GitHub/local checkout). | Either provide Git checkout/branch workflow outside sandbox or authorize workspace-level code implementation ready to be committed onto `feature/destria-ai-frontdesk` in `OphireumTechnology/Destria-Tech-Inc`. |
| **EXT-03** | **MEDIUM (Staging Gate)** | **Live Staging Infrastructure Credentials Not Present in Sandbox:** Staging Supabase project, Railway staging environment, private GPU inference host, Resend staging key, and Google Calendar staging service account are external to this workspace. | Provision staging targets before Phase 6 (`STAGING_READY` / `STAGING_ACCEPTED`) execution. |
