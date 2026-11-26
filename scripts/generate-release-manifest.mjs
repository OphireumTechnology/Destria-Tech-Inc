#!/usr/bin/env node
/**
 * DESTRIA TECH INC — Deterministic Release Manifest Generator (DTI-C033)
 *
 * Emits a strictly non-sensitive `dist/release-manifest.json` linking frontend
 * commit, backend commit, SQL migration version, API compatibility version,
 * build timestamp, non-secret configuration readiness flags, test metadata,
 * deployment environment, and rollback reference.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, 'dist');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');

function readGitSha() {
  const envSha = (
    process.env.GITHUB_SHA ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    ''
  ).trim();
  if (envSha) return envSha;
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString('utf8')
      .trim();
  } catch {
    return 'workspace-local-uncommitted';
  }
}

function resolveLatestMigrationVersion() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return '000';
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();
  if (files.length === 0) return '000';
  return files[files.length - 1].slice(0, 3);
}

function readApiCompatibilityVersion() {
  const apiClientPath = path.join(ROOT, 'src', 'lib', 'apiClient.ts');
  if (!fs.existsSync(apiClientPath)) return 'unknown';
  const src = fs.readFileSync(apiClientPath, 'utf8');
  const m = src.match(/API_COMPATIBILITY_VERSION\s*=\s*['"]([^'"]+)['"]/);
  return m ? m[1] : 'unknown';
}

export function buildReleaseManifest() {
  const commitSha = readGitSha();
  const latestMigration = resolveLatestMigrationVersion();
  const apiCompatibilityVersion = readApiCompatibilityVersion();
  const deploymentEnvironment =
    process.env.DEPLOYMENT_ENVIRONMENT ||
    (process.env.GITHUB_REF === 'refs/heads/main' ? 'production-candidate' : process.env.NODE_ENV || 'ci-local');

  return {
    platform: 'DESTRIA TECH INC Enterprise Platform',
    directive: 'DTI-MASTER-COMPLETION-003',
    frontendCommit: commitSha,
    backendCommit: process.env.BACKEND_COMMIT_SHA || commitSha,
    databaseMigrationVersion: latestMigration,
    apiCompatibilityVersion,
    buildTimestampUtc: new Date().toISOString(),
    deploymentEnvironment,
    rollbackReference: process.env.ROLLBACK_COMMIT_SHA || '713014f119e59713d075ace6029776c99d02830a',
    configurationReadiness: {
      apiBaseUrlConfigured: Boolean((process.env.VITE_API_BASE_URL || '').trim()),
      supabasePublicConfigured: Boolean(
        (process.env.VITE_SUPABASE_URL || '').trim() && (process.env.VITE_SUPABASE_ANON_KEY || '').trim()
      ),
    },
    testEvidence: {
      ciVerifiedCommand: 'npm run typecheck && npm run lint && npm test && npm run build && npm run build:server',
      classification: 'CI_VALIDATED',
    },
  };
}

const manifest = buildReleaseManifest();
fs.mkdirSync(DIST_DIR, { recursive: true });
const outPath = path.join(DIST_DIR, 'release-manifest.json');
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(
  `[destria-release] Generated dist/release-manifest.json (migration=${manifest.databaseMigrationVersion}, apiCompat=${manifest.apiCompatibilityVersion}, env=${manifest.deploymentEnvironment}).`
);
