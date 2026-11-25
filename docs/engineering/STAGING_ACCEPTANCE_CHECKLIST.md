# DESTRIA TECH INC — Staging Acceptance Checklist

This checklist defines the live external verification gates required to promote this release from **`CODE_READY`** (locally verified) to **`STAGING_ACCEPTED`** and **`PRODUCTION_READY`**.

## 1. GitHub & CI/CD Gates
- [ ] Push repaired commit(s) to the target GitHub branch (`https://github.com/OphireumTechnology/Destria-Tech-Inc`) and verify PR #11 merges cleanly with zero conflicts.
- [ ] Confirm GitHub Actions `CI Security & Stabilization Checks` workflow completes green on GitHub-hosted runners (`typecheck`, `lint`, `verify:routing`, `build`, `verify:routing:dist`, `test:unit`, `test:integration`, `test:security`, `build:server`).
- [ ] Confirm `VITE_API_BASE_URL` repository variable in GitHub Actions is set to `https://api.destriatech.com` (fallback default now also matches `https://api.destriatech.com`).

## 2. Database & Supabase Staging Gates
- [ ] Execute `supabase/migrations/006_ceo_identity_correction.sql` on staging Supabase and verify `Desmond Hinds` appears on authorized executive records without modifying historical audit logs.
- [ ] Verify `/ready` returns HTTP `200` against live staging Supabase with RLS policies active.

## 3. Live Gemini AI & Voice Duplex Gates
- [ ] Configure live server-side `GEMINI_API_KEY` in Railway staging environment (never exposed to frontend).
- [ ] Verify real browser microphone capture -> `wss://api.destriatech.com/api/voice/live` -> `gemini-3.8-live` audio response, barge-in interruption, live function calling, and real-time commercial pricing audio override.
- [ ] Verify Admin AI Command Center (`GET /api/admin/ai/overview`, `PATCH /api/admin/ai/config`, `POST /api/admin/ai/sessions/:sessionId/terminate`) with real RBAC credentials.

## 4. Dual-Recipient Transactional Email & Calendar Gates
- [ ] Configure live `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `SERVICE_INQUIRY_RECIPIENTS`, and `EXECUTIVE_CONSULTATION_RECIPIENTS` in Railway.
- [ ] Submit one test Service Inquiry and one test Executive Consultation via AI Consultant confirmation flow (`POST /api/consultant/confirm-tool`), confirming delivery to customer plus both `artaxsvcs@gmail.com` and `dhenze.languisan@gmail.com` and Svix webhook reconciliation to `delivered`.
- [ ] Verify `TRUST_PROXY=true` in Railway so rate limiting uses the proxy-appended client IP.
