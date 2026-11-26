# DESTRIA TECH INC — Production Release Manifest Specification

**Directive:** `DTI-MASTER-COMPLETION-003` (`DTI-C033`, `DTI-C035`)  
**Audit Date:** 2026-11-26  
**Manifest Generator:** `scripts/generate-release-manifest.mjs` (`npm run build:release-manifest`)  
**Artifact Output Path:** `dist/release-manifest.json` (non-sensitive public build provenance)

---

## 1. Release Artifact Provenance & Compatibility Contract

| Field | Current Verified Value | Source / Enforcement |
| :--- | :--- | :--- |
| **Application** | `DESTRIA TECH INC Enterprise Platform & AI Front Desk` | `metadata.json` / `package.json` |
| **Directive Baseline** | `DTI-MASTER-COMPLETION-003` | `scripts/generate-release-manifest.mjs` |
| **Package Version** | `0.0.0` (Node `>=20`, ESM TypeScript) | `package.json` |
| **API Compatibility Version** | `2026.11-dti-v2` | `src/lib/apiClient.ts` (`API_COMPATIBILITY_VERSION`) & `src/server/app.ts` |
| **Database Migration Target** | `009` (`009_operational_hardening_and_durable_governance.sql`) | `supabase/migrations/001`–`009` & `/api/admin/system-health` |
| **Frontend Static Build** | `npm run build && npm run build:pages-routes && npm run build:release-manifest` | `dist/` (`54` static routes + `404.html` + `CNAME` + `release-manifest.json`) |
| **Backend Production Artifact** | `npm run build:server` -> `dist-server/server.mjs` (`1.1 mb`), started via `npm run start:prod` (`node dist-server/server.mjs`) | `railway.json` & `package.json` (zero `devDependencies` required at runtime) |
| **Known Rollback Commit Reference** | `713014f119e59713d075ace6029776c99d02830a` | Verified prior `origin/main` SHA (`OphireumTechnology/Destria-Tech-Inc`) |
| **Target Commissioning Branch** | `repair/dti-final-development-commissioning` | Must be created & pushed externally (sandbox has no `.git` directory) |
| **Secrets Included in Manifest** | **NONE (`0` secrets)** | Enforced by generator & `npm run lint` |

---

## 2. Generated `dist/release-manifest.json` Verification
Verified execution of `npm run build:release-manifest` produced a clean, non-sensitive JSON manifest containing:
- `application`, `directive`, `generatedAt`, `gitCommit` (`GITHUB_SHA` in CI or `local-sandbox-no-git` locally)
- `apiCompatibilityVersion: "2026.11-dti-v2"`
- `databaseMigrationVersion: "009"`
- `migrations`: complete ordered array of all 9 SQL files (`001` through `009`)
- `rollbackReference: "713014f119e59713d075ace6029776c99d02830a"`
- `runtimeContract`: `{ frontendOrigin: "https://destriatech.com", backendApiBase: "https://api.destriatech.com", serverEntrypoint: "dist-server/server.mjs", startCommand: "npm run start:prod" }`

---

## 3. Rollback & Recovery Procedure
1. **Frontend Rollback (GitHub Pages):** Re-run `deploy-pages.yml` on the last known good commit (`713014f119e59713d075ace6029776c99d02830a`) or revert the merge commit on `main`.
2. **Backend Rollback (Railway):** Roll back to the previous verified Railway deployment artifact via Railway Deployments UI.
3. **Database Safety:** Migrations `007`, `008`, and `009` are strictly **additive and idempotent** (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `ON CONFLICT DO NOTHING`) so rolling back application code does not require destructive schema drops. If database restoration is required, use Supabase PITR or a verified `pg_dump` / keyed HMAC-SHA256 snapshot.
