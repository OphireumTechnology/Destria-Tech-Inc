# DESTRIA TECH INC — Production Rollback Plan

## 1. Rollback Triggers
Initiate immediate rollback if any of the following occur after deployment:
- `/healthz` or `/ready` fails continuously for > 2 minutes on Railway.
- Elevated 5xx rate (> 1%) on `/api/inquiries`, `/api/appointments`, `/api/consultant/confirm-tool`, or `/api/voice/*`.
- Gemini Live WebSocket upgrade failure spike or unexpected session disconnection loop.
- Any confirmed commercial pricing policy bypass or secret exposure in API responses.

## 2. Application Rollback Procedure
1. **Backend (Railway):**
   - Open Railway deployment history for `api.destriatech.com` and trigger **Redeploy** on the last known healthy release image.
   - If the issue is isolated to Gemini Live streaming, toggle `geminiLiveEnabled: false` via `PATCH /api/admin/ai/config` (Admin AI Command Center) as an immediate zero-downtime mitigation—clients will cleanly fall back to continuous turn-based voice mode (`/api/voice/process` + `/api/voice/speak`).
2. **Frontend (GitHub Pages):**
   - Revert the release commit on `main` (`git revert <merge-sha>`) and allow `.github/workflows/deploy-pages.yml` to rebuild and publish the prior verified bundle to `https://destriatech.com/`.
3. **Database (Supabase):**
   - Migrations `001` through `006` are strictly additive and backwards-compatible; **do not** run destructive `DROP TABLE` or `DROP COLUMN` statements during rollback.
   - If an emergency data adjustment is ever needed, restore from the latest Supabase PITR snapshot following `docs/operations/backup-restoration.md`.

## 3. Post-Rollback Verification
- Confirm `/healthz` and `/ready` return HTTP `200`.
- Verify homepage, `/resources`, `/corporate-profile`, `/portal/login`, and `/admin/login` load cleanly without console errors.
- Record root cause and corrective actions in `docs/engineering/MASTER_DEFECT_REGISTER.md` before scheduling the next release attempt.
