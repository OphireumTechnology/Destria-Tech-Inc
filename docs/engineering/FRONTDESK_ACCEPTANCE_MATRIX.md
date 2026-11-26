# DESTRIA TECH INC — Helix Integration & Unified Front Desk Acceptance Matrix

**Directive:** `DTI-HELIX-INTEGRATION-001` (Sections 1–22)  
**Matrix Date:** 2026-11-26  
**Current Release Classification:** **`SOURCE_AUDITED`**  
**Next Gate:** **`DEVELOPMENT_APPROVED`** (Requires Owner Sign-Off Before Creating Branch or Editing Code)

---

## 1. Release Lifecycle Ladder Status (Section 21)

| Stage | Classification | Status | Gate Evidence |
| :---: | :--- | :---: | :--- |
| 1 | `SOURCE_AUDITED` | **COMPLETE (Current)** | Upstream Helix `v2.0.6` (`da9e3f9f`) & `v1.9.2` (`e4b257d7`) live-cloned & audited; Destria `main` (`2e238e63`) & migrations `001`–`009` audited; all 11 Section 20 docs authored; zero app files modified. |
| 2 | `DEVELOPMENT_APPROVED` | **PENDING OWNER** | Awaiting owner decisions on the 4 approval questions in `FRONTDESK_DEVELOPMENT_PLAN.md`. |
| 3 | `IMPLEMENTATION_IN_PROGRESS` | Not Started | Blocked by Stage 2 gate. |
| 4 | `CODE_READY` | Not Started | Phases 1–4 implemented on `feature/destria-ai-frontdesk`. |
| 5 | `CI_VERIFIED` | Not Started | 100% pass across existing 184 tests + new Python/Node/Security/DB suites, `0` lint/type/audit errors. |
| 6 | `STAGING_READY` | Not Started | Deployed to isolated staging (Railway + Supabase + private inference worker). |
| 7 | `STAGING_ACCEPTED` | Not Started | CPU/GPU benchmarks + 30-min physical browser voice soak + DR drill passed. |
| 8 | `PRODUCTION_APPROVED` | Not Started | Explicit owner written sign-off + external DNS/compute prerequisites resolved. |
| 9 | `PRODUCTION_COMMISSIONED` | Not Started | Live production verification after merge & rollout. |

---

## 2. Requirement-Level Traceability Matrix (Sections 1–20)

| Directive Section | Requirement Summary | Existing DESTRIA Baseline (`2e238e63`) | Planned Implementation Target | Verification Test IDs | Current Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Sec 2** | Mandatory source acquisition, commit/license verification, full audit, stop before editing code | Complete (`main` + `001`–`009` verified) | All 11 audit/plan docs under `docs/engineering/` | Manual audit + zero-code-diff verification | **`SOURCE_AUDITED` (PASS)** |
| **Sec 3** | Preserve existing website, animated tech backgrounds, Client/Admin portals, 25-sec masterplan, Resend, GCal, Supabase | 184 / 184 baseline tests passing | Strict non-destructive additive architecture | Full 184-test regression suite + `verify:routing:dist` | **PRESERVED** |
| **Sec 4** | Verify all 24 Helix paths, maintain attribution & license review, exclude telephony bloat | Verified 24 / 24 paths in live clone | `HELIX_EXTRACTION_MANIFEST.md`, `HELIX_LICENSE_REVIEW.md`, `services/ai-inference/THIRD_PARTY_NOTICES.md` | License & attribution audit | **`SOURCE_AUDITED`** |
| **Sec 5** | Separate Python FastAPI AI inference service (Ollama, Whisper, Silero, Kokoro, translation), CPU/GPU, prewarm, bounded queues, zero auto paid Gemini fallback | Existing Gemini behind explicit config | Phase 2: `services/ai-inference/` + `localInferenceClient.ts` | `PY-01`..`PY-05`, `GW-03` | **PLANNED (Pending Approval)** |
| **Sec 6** | Unified voice & chat gateway (shared session/identity/history/dossier, ordered turns, idempotency, voice↔chat switching, no cross-client memory) | Partial (separate `/api/voice/*` & `/api/frontdesk/session/*`) | Phase 3: `frontDeskUnifiedGateway.ts` + `frontdesk_conversation_messages` | `GW-01`, `GW-02`, `SEC-01` | **PLANNED (Pending Approval)** |
| **Sec 7** | Browser-native voice transport (AudioWorklet/WSS PCM16, VAD, partial/final STT, chunked TTS, echo/noise suppression, barge-in, stale audio cancellation, bounded reconnect) | Existing Gemini Live WS bridge (`/api/voice/live`) | Phase 3–4: `WS /api/frontdesk/voice/stream` + browser audio client | `GW-04`, `SOAK-01` | **PLANNED (Pending Approval)** |
| **Sec 8** | Preserve/adapt Helix v1.6–v1.9.2 reliability fixes (no startup/CUDA crashes, silent first audio, retry loops, stale audio, CORS/config crashes, conflicting assignments) | Existing fail-closed Express CORS & voice guards | Phase 2–3: Prewarm readiness, circuit breaker, `FOR UPDATE SKIP LOCKED`, `generationEpoch` | `PY-02`, `PY-03`, `GW-03`..`GW-06` | **PLANNED (Pending Approval)** |
| **Sec 9** | Human-like receptionist intelligence (transparent AI ID, pacing, clarification, frustration detection, EN/TL/Taglish, business hours, holidays, callbacks; no human impersonation or voice profiling) | Existing `VoiceContextEngine` + corporate guardrails | Phase 3: Enhanced prompt orchestration + `businessHoursService.ts` | `GW-07`, `GW-09` | **PLANNED (Pending Approval)** |
| **Sec 10** | Authorized corporate workflow (channel ID -> session -> intent -> context -> department -> answer/action -> qualification -> escalation/booking/callback -> audit) | Existing inquiry/consultation/masterplan/escalation flows | Phase 3: Unified workflow state machine across voice & chat | `GW-01`, `GW-05`, `GW-07` | **PLANNED (Pending Approval)** |
| **Sec 11** | Human-agent presence & routing (departments, availability states, atomic claiming, capacity, expiry, reassignment, callback fallback, Admin management) | Escalation tickets only (no employee presence/claiming) | Phase 1 & 3–4: Migration `010` + `humanAgentRoutingService.ts` + Admin Console tab | `GW-05`, `GW-06`, `DB-01` | **PLANNED (Pending Approval)** |
| **Sec 12** | Additive Supabase PostgreSQL schema (no SQLite, no PRAGMA, UUID/TIMESTAMPTZ/TEXT[]/JSONB, RLS, migration `010`) | Migrations `001`–`009` intact | Phase 1: `010_frontdesk_unified_receptionist_and_agents.sql` | `DB-01`, `SEC-01` | **PLANNED (Pending Approval)** |
| **Sec 13** | Corporate knowledge & commercial governance (approved public KB only, `internal_only` excluded, zero public pricing, CEO Desmond Hinds, zero invented staff) | Implemented & tested in `008` + `frontDeskRoutes.ts` | Reused directly inside unified gateway prompt builder | `SEC-02`, `GW-09` | **EXISTING + EXTENDED** |
| **Sec 14** | Unified website voice/chat UI & Admin Command Center extensions (no duplicate competing widgets, live states, barge-in, consent notice, mobile/desktop) | Existing `AIFrontDeskPage`, `AIConsultantWidget`, `AdminFrontDeskConsole` | Phase 4: Extend existing components cleanly | UI build, responsive & `SOAK-01` | **PLANNED (Pending Approval)** |
| **Sec 15** | Security, privacy & compliance (no public inference ports, private service auth, CORS, RBAC/CSRF, audio limits, consent, deletion, no `.env` writes, no easter eggs) | Strong Express RBAC/CSRF/RLS/revocation (`009`) | Phase 2–3: Private HMAC/Bearer worker auth, session token binding, consent table, strict audio validation | `SEC-01`..`SEC-05`, `PY-01` | **PLANNED (Pending Approval)** |
| **Sec 16** | Reconciled unified API & OpenAPI inference contracts | `API_ROUTE_INVENTORY.md` | `FRONTDESK_API_CONTRACT.md` implemented in Phases 2–3 | `GW-01`..`GW-09`, `PY-01`..`PY-04` | **DESIGNED (`SOURCE_AUDITED`)** |
| **Sec 17** | Isolated deployment architecture (GitHub Pages + Railway + Supabase + private Python worker; CPU vs GPU benchmark; optional Asterisk excluded) | GitHub Pages + Railway + Supabase | `FRONTDESK_DEPLOYMENT_GUIDE.md` executed in Phase 6 | `PERF-01`, `DR-01` | **DESIGNED (`SOURCE_AUDITED`)** |
| **Sec 18** | Operational controls, observability & safe rollback | `/api/admin/system-health` + structured logs | Add inference worker health proxy + circuit breaker metrics | `DR-01`, `PY-05` | **DESIGNED (`SOURCE_AUDITED`)** |
| **Sec 19** | Full automated + load + DR + 30-min physical browser voice soak verification | 184 / 184 baseline tests | `FRONTDESK_TEST_REPORT.md` test matrix in Phases 5–6 | All suites (`PY`, `GW`, `DB`, `SEC`, `PERF`, `LOAD`, `SOAK`, `DR`) | **PLANNED (Pending Approval)** |
| **Sec 20** | All 11 required engineering deliverables authored accurately | — | All 11 files created in `/docs/engineering/` | Complete file audit | **`SOURCE_AUDITED` (11/11 COMPLETE)** |
