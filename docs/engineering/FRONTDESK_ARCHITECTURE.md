# DESTRIA TECH INC — Unified AI Front Desk & Modular Local Inference Architecture

**Directive:** `DTI-HELIX-INTEGRATION-001` (Sections 5–17)  
**Audit Date:** 2026-11-26  
**Architecture Status:** **`SOURCE_AUDITED` (Blueprint Ready for Owner Approval)**

---

## 1. High-Level System Architecture (Zero Duplication, Strict Boundary Isolation)

```text
[Public Browser: https://destriatech.com (GitHub Pages)]
  ├── Existing Website + AIConsultantWidget + AIFrontDeskPage (Extended: unified Voice+Chat UI)
  ├── Existing ClientPortalApp (Preserved: owner-isolated inquiries & optimistic concurrency)
  └── Existing AdminPortalApp + AdminFrontDeskConsole (Extended: agents, departments, callbacks, AI worker health)
        │
        │ HTTPS / WSS ONLY (CORS allowlist + X-API-Compatibility-Version + HttpOnly admin cookies + CSRF)
        ▼
[DESTRIA Enterprise Backend & Unified Gateway: https://api.destriatech.com (Railway — Node.js/Express)]
  ├── Unified Front Desk Conversation Gateway (/api/frontdesk/sessions/* + WS /api/frontdesk/voice/stream)
  │     ├── Shared customer identity, conversation ID, ordered turn_id, idempotency_key
  │     ├── Seamless voice ↔ chat context continuity (reads/writes identical Supabase session & turn log)
  │     ├── Existing DESTRIA VoiceContextEngine, 25-Section Masterplan, 18-Section Exec Report, Commercial Policy
  │     ├── Existing Approved Public Knowledge Store (internal_only strictly excluded, prompt-injection 400 guard)
  │     ├── Human-Agent Presence & Atomic Assignment Service (PostgreSQL FOR UPDATE SKIP LOCKED + expiry)
  │     ├── Business-Hours, Holiday & Callback Orchestrator
  │     └── Provider Router:
  │           ├── PRIMARY (Local, Free): Private HTTP/WS client → DESTRIA AI Inference Service (HMAC/Bearer mTLS/Private Net)
  │           └── OPTIONAL (Explicit Opt-In ONLY): Existing Gemini Provider (NEVER automatic paid fallback!)
  ├── Existing Resend Outbox & Svix Webhooks (emailService.ts)
  ├── Existing Google Calendar DST-Aware Sync (calendarService.ts)
  └── Existing Supabase Repositories (Migrations 001–009 + Additive Migration 010)
        │                                                    │
        │ Server-only service_role (RLS enforced)            │ Private Authenticated Service-to-Service Link ONLY
        ▼                                                    ▼
[Supabase PostgreSQL + Auth]                    [Isolated Python AI Inference Service (services/ai-inference)]
  • Migrations 001–009 (preserved)                ├── FastAPI (OpenAPI documented, Bearer/HMAC service auth)
  • Migration 010 (additive):                     ├── Bounded asyncio.Semaphore worker queues + timeouts + circuit breaker
    - frontdesk_departments                       ├── Startup model prewarming + CPU/GPU auto-config
    - frontdesk_human_agents                      ├── /v1/vad        (Silero VAD v5 — 16 kHz PCM 512-sample windows)
    - frontdesk_agent_assignments                 ├── /v1/stt        (Faster-Whisper CTranslate2 — multilingual EN/TL/Taglish)
    - frontdesk_conversation_messages             ├── /v1/llm/reply  (Ollama — Qwen 2.5 / Llama 3.1 + grounded KB injection)
    - frontdesk_callback_requests                 ├── /v1/tts        (Kokoro-82M — 24 kHz chunked PCM/WAV)
    - frontdesk_holidays_and_hours                ├── /v1/translate  (MarianMT CTranslate2 fast-path + Ollama fallback)
    - frontdesk_consent_records                   └── /v1/health & /v1/ready (model readiness, queue depth, RSS/GPU VRAM)
                                                        │ Loopback / private bridge ONLY
                                                        ▼
                                                  [Ollama Local Runtime (127.0.0.1:11434)]
```

---

## 2. Core Architectural Guarantees
1. **No Paid Fallback Leakage:** `AI_PROVIDER_MODE` defaults to `'local_inference'` (or `'governed_deterministic'` when the local worker is offline). Existing Gemini integration stays intact under explicit `AI_PROVIDER_MODE='gemini_authorized'` ONLY — never triggered automatically on local worker failure.
2. **Unified Voice + Chat Continuity:** Both `POST /api/frontdesk/sessions/:id/messages` (chat) and `WS /api/frontdesk/voice/stream` / `POST /api/frontdesk/sessions/:id/voice` (voice) write ordered turns (`turn_sequence`, unique `turn_id`, `channel: 'chat' | 'voice'`) into the same `frontdesk_conversation_messages` and `ai_conversation_sessions` tables. Switching channels mid-conversation preserves full memory, requirements, masterplan draft, department routing, and escalation state.
3. **Browser-Native Voice Transport (Zero Asterisk/SIP Coupling):**
   - Browser captures audio via `AudioWorklet` (preferred) / `MediaRecorder` with `echoCancellation: true`, `noiseSuppression: true`, `autoGainControl: true`, downsampled to `16 kHz` mono PCM16 frames over authenticated WSS.
   - Server streams frames to Python `/v1/vad` for speech start/end & barge-in cancellation, then `/v1/stt` (Whisper) -> DESTRIA Enterprise Orchestrator (KB + policy + tools + Ollama `/v1/llm/reply`) -> sentence-chunked `/v1/tts` (Kokoro 24 kHz) back to browser `AudioContext` queue.
   - Barge-in (`POST /api/frontdesk/sessions/:id/interrupt` or WS `{ type: 'interrupt' }`) cancels in-flight LLM/TTS generation via `AbortController`, increments `generationEpoch`, and flushes browser playback buffers immediately so stale audio can never play.
4. **Honest Availability & Failure Isolation:** If the Python inference worker is unreachable, `/api/ready` marks `localInferenceReady: false`, voice pre-flight transitions cleanly to `service_unavailable` without opening the microphone or entering an error-speech loop, and text chat gracefully informs the visitor or offers callback/escalation without fabricating live AI responses.
5. **Strict Private Compute Isolation:** Ollama (`11434`), FastAPI inference worker (`8000`), and internal health diagnostics are NEVER exposed to the public internet. Only DESTRIA's Express API communicates with the inference worker over private networking with a shared `AI_INFERENCE_SHARED_SECRET` header and TLS.
6. **Optional Future Telephony Isolation:** Asterisk SIP/RTP remains completely excluded from website voice deployment; if ever requested later, it would connect as a separate optional adapter calling the same DESTRIA Conversation Gateway.
