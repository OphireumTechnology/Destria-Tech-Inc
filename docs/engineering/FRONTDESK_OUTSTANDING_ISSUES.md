# DESTRIA TECH INC — Outstanding Issues, Risks & External Blockers Register

**Directive:** `DTI-HELIX-IMPLEMENTATION-002`  
**Register Date:** 2026-11-26  
**Current Classification:** **`CI_VERIFIED` (Local Non-Production)** | **`STAGING_READY` / `PRODUCTION`: `BLOCKED` by External Prerequisites**

---

## 1. Resolved Owner Decisions (`DTI-HELIX-IMPLEMENTATION-002`)

| ID | Decision | Approved Resolution (Enforced in Code) | Status |
| :---: | :--- | :--- | :---: |
| **DEC-01** | Upstream Helix Extraction Pin | Pinned to **`v2.0.6`** (`da9e3f9fbb2511bd8a105d53ec7d4e1627e688dc`, MIT). Attribution preserved in `services/ai-inference/THIRD_PARTY_NOTICES.md`. | **CLOSED (IMPLEMENTED)** |
| **DEC-02** | Default Local LLM & `espeak-ng` Policy | Default LLM set to **`qwen2.5:7b-instruct`** (Apache-2.0 via Ollama). **`espeak-ng` strictly disabled** (`ALLOW_ESPEAK_GPL_FALLBACK=false`, omitted from CPU/GPU Dockerfiles). | **CLOSED (IMPLEMENTED)** |
| **DEC-03** | Private Inference Compute Target | **Deferred** by owner. Service built for private internal network deployment only (`X-Service-Auth`, zero public exposure, zero automatic paid Gemini fallback). | **DEFERRED BY OWNER** |
| **DEC-04** | Non-Production Development Authorization | Approved on `feature/destria-ai-frontdesk` with zero production DB, DNS, or `main` changes. | **CLOSED (IMPLEMENTED)** |

---

## 2. Upstream Helix Security & Reliability Defects — Mitigated in Code

| Issue ID | Severity | Resolution Implemented & Verified | Status |
| :---: | :---: | :--- | :---: |
| **HLX-01** | CRITICAL | Replaced unauthenticated FastAPI/dashboard routes with constant-time `X-Service-Auth` Bearer checks on `services/ai-inference` and DESTRIA's existing `requireAdmin` + CSRF + token revocation on `/api/admin/frontdesk/*`. | **VERIFIED** |
| **HLX-02** | CRITICAL | Excluded `agent/api.py`; immutable Pydantic configuration in `services/ai-inference/app/config.py`; zero `.env` mutation or secret-return endpoints. | **VERIFIED** |
| **HLX-03** | HIGH | Excluded `agent/ari_agent.py` completely (zero Asterisk telephony bloat, zero hidden easter eggs). | **VERIFIED** |
| **HLX-04** | HIGH | Added 7 Python unit/runtime tests (`services/ai-inference/tests/`) + comprehensive unified gateway/WS/DB integration tests (`tests/dti-helix-implementation-002.test.ts`); 187/187 Node tests passing. | **VERIFIED** |
| **HLX-05** | HIGH | Disabled GPLv3 `espeak-ng` across runtime config, Kokoro engine, Dockerfiles, and automated tests (`ALLOW_ESPEAK_GPL_FALLBACK=false`). | **VERIFIED** |
| **HLX-06** | HIGH | Excluded Helix `gcal.py` and fake dashboard mocks; preserved DESTRIA fail-closed calendar availability (`503` on outage) and verified via test. | **VERIFIED** |
| **HLX-07** | MEDIUM | Replaced SQLite with idempotent PostgreSQL Migration `010` (`UUID`, `TIMESTAMPTZ`, `TEXT[]`, `JSONB`, RLS, and atomic `FOR UPDATE SKIP LOCKED` RPC `claim_frontdesk_human_agent`). | **VERIFIED** |
| **HLX-08** | MEDIUM | English, Filipino, and Taglish text/STT/LLM comprehension implemented and tested; Filipino neural Kokoro TTS pronunciation quality remains an open benchmark item once hosted GPU inference is provisioned. | **OPEN (HOSTED BENCHMARK)** |

---

## 3. Remaining External Infrastructure, Hosting & Tooling Blockers

| Blocker ID | Severity | Classification | Description | Required External / Owner Action |
| :---: | :---: | :---: | :--- | :--- |
| **EXT-01** | **HIGH (Prod Gate)** | **`BLOCKED`** | **`api.destriatech.com` DNS `ENOTFOUND` / `NXDOMAIN`:** Production API custom domain still lacks the DNS `CNAME` record pointing to the live Railway backend, which is the external root cause of production voice connectivity errors from `https://destriatech.com`. | Create DNS `CNAME` for `api.destriatech.com` -> Railway service target domain and confirm valid TLS certificate before production commissioning. |
| **EXT-02** | **MEDIUM (Tooling)** | **`BLOCKED`** | **Sandbox Workspace Lacks `.git` Metadata / Push Credentials:** All Phase 01–10 files are cleanly implemented and verified in the workspace, but direct `git push` to `origin/feature/destria-ai-frontdesk` cannot run from inside this credential-free sandbox. | Commit and push the verified workspace changes onto `feature/destria-ai-frontdesk` from an authorized local/CI Git checkout. Never merge directly into `main` prior to staging sign-off. |
| **EXT-03** | **MEDIUM (Staging Gate)** | **`BLOCKED` (Deferred)** | **Deferred Private Inference Hosting & Live Model Weights:** Owner explicitly deferred compute provisioning for `services/ai-inference` (Ollama `qwen2.5:7b-instruct` + Faster-Whisper + Kokoro + Silero). Real CPU vs. GPU latency benchmarks (`PERF-01`) and live Filipino TTS voice quality checks (`HLX-08`) cannot run until hosted. | Provision a private GPU host (16–24 GB VRAM recommended) or private CPU staging container on an internal network, configure `AI_INFERENCE_BASE_URL` + `AI_INFERENCE_SHARED_SECRET`, and run `PERF-01`. |
| **EXT-04** | **MEDIUM (Staging Gate)** | **`BLOCKED`** | **Live Staging Environment & Physical Browser Voice Soak (`SOAK-01`, `LOAD-01`, `DR-01`):** Staging Supabase database (`001`–`010`), Railway staging service, Resend staging key, Google Calendar staging service account, and physical desktop/mobile microphone/speaker 30-minute soak test are external to this sandbox. | Apply migrations `001`–`010` to an isolated staging Supabase project (never production), deploy `feature/destria-ai-frontdesk` to staging Railway, and complete `SOAK-01`, `LOAD-01`, and `DR-01`. |
| **EXT-05** | **LOW (Info)** | **`INCOMPLETE`** | **Live Supabase RPC Persistence Wiring in `FrontDeskOperationsStore`:** Migration `010` defines and verifies all PostgreSQL tables and `claim_frontdesk_human_agent` / `release_frontdesk_agent_assignment` / `expire_stale_frontdesk_assignments` RPCs; in-process atomic store fallback is verified in Node tests, and end-to-end staging verification against a live Supabase staging project should confirm `supabase.rpc(...)` round-trips for multi-replica Railway horizontal scaling. | Verify multi-replica `supabase.rpc('claim_frontdesk_human_agent', ...)` integration during Staging Acceptance (`STAGING_READY` -> `STAGING_ACCEPTED`). |
