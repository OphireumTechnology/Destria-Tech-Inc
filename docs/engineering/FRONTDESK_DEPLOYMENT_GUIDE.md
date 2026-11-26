# DESTRIA TECH INC — Unified AI Front Desk & Inference Deployment Guide

**Directive:** `DTI-HELIX-INTEGRATION-001` (Sections 17 & 18)  
**Guide Date:** 2026-11-26  
**Deployment Status:** **`SOURCE_AUDITED` (Infrastructure Blueprint — NO Staging or Production Changes Executed)**

---

## 1. Target Multi-Tier Deployment Topology

| Tier | Hosting Platform | Public Exposure | Responsibilities |
| :--- | :--- | :---: | :--- |
| **1. Public Frontend SPA** | **GitHub Pages** (`https://destriatech.com`) | Public HTTPS | Existing DESTRIA website, unified Voice+Chat AI Front Desk UI, AI Consultant Widget, Client Portal, Admin Command Center. Built with `VITE_API_BASE_URL=https://api.destriatech.com`. |
| **2. Enterprise Backend & Unified Gateway** | **Railway** (`https://api.destriatech.com`) | Public HTTPS / WSS (CORS allowlist + rate limits + RBAC/CSRF) | Node.js/Express enterprise orchestration, unified conversation gateway, browser voice WebSocket proxy, human-agent routing, business hours/callbacks, Resend outbox, Google Calendar sync, Supabase persistence. |
| **3. Persistent Database & Auth** | **Supabase PostgreSQL** | Private (server-side `service_role` only; RLS enabled on all tables) | Preserved migrations `001`–`009` + planned additive migration `010` (departments, human agents, atomic assignments, unified conversation messages, callbacks, schedule/holidays, consent records). |
| **4. Isolated AI Inference Service** | **Private GPU/CPU Worker** (`services/ai-inference`) | **PRIVATE NETWORK ONLY (Zero Public Ingress)** | FastAPI worker running Faster-Whisper STT, Silero VAD, Kokoro TTS, MarianMT translation, and private loopback Ollama (`127.0.0.1:11434`). Authenticates Railway calls via `X-Service-Auth` shared secret over private TLS/VPN/Tailscale/Railway private networking. |
| **5. Optional Telephony (Excluded)** | **Not Deployed** | N/A | Asterisk SIP/RTP (`network_mode: host`, UDP `20000-20100`) is **strictly excluded** from website voice deployment. May only be added later as a separate isolated adapter if phone-line reception is explicitly commissioned. |

---

## 2. Strict Network & Secret Isolation Rules
1. **Zero Public Inference Ports:** Never bind or expose Ollama (`11434`) or the Python FastAPI inference worker (`8000`) to `0.0.0.0` on a public internet interface. All traffic MUST originate exclusively from DESTRIA's Railway Express backend over a private link.
2. **Service-to-Service Authentication:** Configure a high-entropy `AI_INFERENCE_SHARED_SECRET` (min 32 bytes) in both Railway and the private inference host. Rotate quarterly without `.env` file self-mutation.
3. **Zero Paid API Leakage:** Set `AI_PROVIDER_MODE=local_inference` in staging/production when using the local inference worker. Preserve existing `GEMINI_API_KEY` only for explicitly authorized `AI_PROVIDER_MODE=gemini_authorized` operation; the backend will refuse automatic paid fallback when `AI_PROVIDER_MODE=local_inference`.
4. **No Helix Runtime `.env` Mutation:** All configuration is injected immutably through Railway / container environment variables or stored in Supabase tables (`frontdesk_departments`, `frontdesk_holidays_and_hours`), never by writing to `.env` on disk.

---

## 3. Compute Sizing & CPU vs. GPU Architecture Plan

Standard Railway containers do **not** provide NVIDIA GPUs. Running Whisper + Ollama (`7B` model) + Kokoro TTS simultaneously on CPU-only containers will introduce multi-second latency and risk OOM under concurrent visitors.

| Profile | Target Hardware | Expected Real-Time Suitability | Recommended Use |
| :--- | :--- | :--- | :--- |
| **CPU Profile (`Dockerfile.cpu`)** | 8+ vCPU, 16 GB RAM (e.g., dedicated CPU VM / large Railway service for smoke tests) | Whisper `small` (`int8`), Silero VAD (fast), Kokoro CPU (`<1s` short chunks), Ollama `qwen2.5:3b` or `7b-q4_K_M` (`3–10s` TTFT). Single-concurrency only. | Local CI, functional integration tests, low-concurrency staging smoke tests. |
| **GPU Profile (`Dockerfile.gpu` — Recommended for Live Voice)** | 1× NVIDIA L4 / RTX 4000 Ada / T4 (`16–24 GB VRAM`), 8 vCPU, 32 GB RAM (e.g., private GCP/AWS GPU VM, Modal, or RunPod private endpoint) | Whisper `medium`/`large-v3-turbo` (`float16`, `<350ms`), Silero VAD (`<5ms`), Kokoro GPU (`<150ms`), Ollama `qwen2.5:7b-instruct` (`<400ms` TTFT). Supports concurrent website voice turns naturally. | Staging voice soak (`SOAK-01`) and production website voice receptionist. |

**Mandatory Phase 6 Benchmark Deliverable:** Before requesting `PRODUCTION_APPROVED`, both CPU and GPU configurations will be benchmarked with real measured P50/P95 latencies, RAM/VRAM usage, and concurrency caps recorded in `FRONTDESK_TEST_REPORT.md`.

---

## 4. Planned Environment Variables (Defined in `.env.example` Post-Approval — Zero Secrets Committed)

### DESTRIA Express Backend (Railway)
```env
AI_PROVIDER_MODE=local_inference            # local_inference | governed_deterministic | gemini_authorized
AI_INFERENCE_BASE_URL=https://inference.internal.destriatech.local
AI_INFERENCE_SHARED_SECRET=                 # >= 32-byte shared secret
AI_INFERENCE_TIMEOUT_MS=15000
AI_INFERENCE_CB_FAILURE_THRESHOLD=5
AI_INFERENCE_CB_RESET_MS=30000
FRONTDESK_SESSION_TOKEN_SECRET=             # HMAC secret binding visitor sessionId
FRONTDESK_MAX_AUDIO_BYTES=5242880           # 5 MB hard cap
FRONTDESK_ASSIGNMENT_EXPIRY_SEC=90          # Auto-release unaccepted agent offers
```

### Python AI Inference Worker (`services/ai-inference`)
```env
INFERENCE_HOST=127.0.0.1                    # Or private interface IP only
INFERENCE_PORT=8000
AI_INFERENCE_SHARED_SECRET=                 # Must match Express backend
COMPUTE_DEVICE=auto                         # auto | cuda | cpu
WHISPER_MODEL=small                         # small (CPU) or large-v3-turbo (GPU)
WHISPER_COMPUTE_TYPE=int8                   # int8 (CPU) or float16 (GPU)
WHISPER_BEAM_SIZE=2                         # Validated range 1..5
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b-instruct            # Apache-2.0 multilingual EN/TL/Taglish
ALLOW_ESPEAK_GPL_FALLBACK=false             # GPLv3 isolation guard
MAX_CONCURRENT_STT=2
MAX_CONCURRENT_LLM=2
MAX_CONCURRENT_TTS=4
PREWARM_MODELS_ON_STARTUP=true
```

---

## 5. Staged Rollout & Rollback Procedure (Post-Approval)

1. **Staging First (Zero Production Impact):**
   - Apply `010_frontdesk_unified_receptionist_and_agents.sql` to an isolated staging Supabase database (snapshot taken beforehand).
   - Deploy `services/ai-inference` to private staging compute and confirm `/v1/ready` returns `200`.
   - Deploy branch `feature/destria-ai-frontdesk` to staging Railway (`AI_PROVIDER_MODE=local_inference`) and staging frontend preview.
   - Complete Phase 6 benchmarks, 30-minute real-browser voice soak, and disaster-recovery drill (`STAGING_ACCEPTED`).
2. **Production Gate:**
   - Resolve pre-existing external production blocker (`api.destriatech.com` DNS CNAME -> Railway custom domain, documented in `PRODUCTION_HOSTING_AND_DNS_REPAIR_GUIDE.md`).
   - Require explicit written owner sign-off (`PRODUCTION_APPROVED`) before merging `feature/destria-ai-frontdesk` to `main` or applying migration `010` to production Supabase.
3. **Instant Safe Rollback:**
   - **Code Rollback:** Revert Railway deployment to previous commit (`2e238e63`) or switch `AI_PROVIDER_MODE=governed_deterministic` to immediately disable local inference without breaking text consultation, booking, Client Portal, or Admin Portal.
   - **Database Safety:** Migration `010` is strictly additive (`CREATE TABLE IF NOT EXISTS` / new RPCs); rolling back application code leaves existing `001`–`009` tables 100% compatible without destructive `DROP TABLE` operations.
