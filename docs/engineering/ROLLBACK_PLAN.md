# DESTRIA TECH INC — Production Rollback Plan

**Directive:** `DTI-MASTER-REPAIR-001`  
**Audit Date:** 2026-11-26

---

## 1. Rollback Triggers
Initiate immediate rollback if any of the following occur after deployment:
- `/healthz` or `/ready` fails continuously for > 2 minutes on Railway (`api.destriatech.com`).
- Elevated 5xx rate (> 1%) on `/api/inquiries`, `/api/appointments`, `/api/frontdesk/*`, `/api/consultant/*`, or `/api/voice/*`.
- Unexpected `503 DATABASE_UNAVAILABLE` errors after deploy (verify `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and migrations `007`/`008` first).
- Gemini Live WebSocket upgrade failure spike or sustained `INVALID_CREDENTIALS` / `UNSUPPORTED_MODEL` errors.
- Any confirmed commercial pricing policy bypass, admin auth regression, or secret exposure.

## 2. Application Rollback Procedure
1. **Backend (Railway — `api.destriatech.com`):**
   - Open Railway deployment history and click **Redeploy** on the last known healthy release image.
   - If the issue is isolated to Gemini Live streaming, toggle `geminiLiveEnabled: false` via `PATCH /api/admin/ai/config` (Admin AI Command Center) as a zero-downtime mitigation—clients cleanly fall back to continuous turn-based voice mode (`/api/voice/process` + `/api/voice/speak`).
2. **Frontend (GitHub Pages — `destriatech.com`):**
   - Revert the release commit on `main` (`git revert <merge-sha>`) and allow `.github/workflows/deploy-pages.yml` to rebuild and publish the prior verified bundle.
3. **Database (Supabase):**
   - Migrations `001` through `008` are strictly additive and backwards-compatible (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, RLS policies); **never** execute destructive `DROP TABLE` or `DROP COLUMN` statements during rollback.
   - Prior application versions continue operating safely against schema `008`. For emergency point-in-time data recovery, restore from Supabase PITR following `docs/operations/backup-restoration.md`.

## 3. Post-Rollback Verification
- Confirm `GET /healthz` and `GET /ready` return HTTP `200`.
- Verify `/`, `/ai-frontdesk`, `/resources`, `/corporate-profile`, `/portal/login`, and `/admin/login` load cleanly without console errors.
- Document root cause and remediation in `docs/engineering/MASTER_DEFECT_REGISTER.md` prior to re-attempting release.
