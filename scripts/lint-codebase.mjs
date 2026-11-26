#!/usr/bin/env node
/**
 * DESTRIA TECH INC — Independent Static Linter & Security Policy Checker
 *
 * Distinct from `tsc --noEmit` (typecheck). Uses esbuild syntax parsing plus
 * comment-stripped static analysis to enforce code quality, architectural
 * boundaries, security rules, Gemini model governance, and corporate identity
 * invariants across source files and GitHub Actions workflows.
 */

import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';

const ROOT = process.cwd();
const SCAN_DIRS = ['src', 'scripts'];
const ROOT_FILES = ['server.ts'];
const WORKFLOW_DIR = '.github/workflows';
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

/** @type {Array<{ file: string; line: number; rule: string; message: string }>} */
const violations = [];

function addViolation(file, line, rule, message) {
  violations.push({
    file: path.relative(ROOT, file),
    line,
    rule,
    message,
  });
}

function collectFiles(dirPath, allowedExts = SOURCE_EXTENSIONS) {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, allowedExts));
    } else if (allowedExts.has(path.extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

function getLineNumber(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

/**
 * Strips single-line and block comments while preserving line breaks so line
 * numbers remain accurate for static rule matching.
 */
function stripCommentsPreservingLines(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (_m, prefix) => `${prefix}`);
}

function lintSourceFile(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  if (rel === 'scripts/lint-codebase.mjs') return;

  const content = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath);
  const loader = ext === '.tsx' ? 'tsx' : ext === '.ts' ? 'ts' : 'js';

  // 1. Native syntax & JSX parse check via esbuild
  try {
    esbuild.transformSync(content, {
      loader,
      sourcefile: rel,
      format: 'esm',
    });
  } catch (err) {
    const firstErr = Array.isArray(err?.errors) ? err.errors[0] : null;
    addViolation(
      filePath,
      firstErr?.location?.line || 1,
      'syntax-error',
      firstErr?.text || err?.message || 'Syntax error'
    );
    return;
  }

  const codeOnly = stripCommentsPreservingLines(content);
  const isFrontend = rel.startsWith('src/') && !rel.startsWith('src/server/');
  const isRuntimeCode = rel.startsWith('src/') || rel === 'server.ts';

  // 2. Prohibited dynamic code execution
  const evalMatch = codeOnly.match(/\beval\s*\(/);
  if (evalMatch && evalMatch.index !== undefined) {
    addViolation(filePath, getLineNumber(codeOnly, evalMatch.index), 'no-eval', 'Use of eval() is prohibited.');
  }
  const fnMatch = codeOnly.match(/\bnew\s+Function\s*\(/);
  if (fnMatch && fnMatch.index !== undefined) {
    addViolation(
      filePath,
      getLineNumber(codeOnly, fnMatch.index),
      'no-new-func',
      'Use of new Function() is prohibited.'
    );
  }

  // 3. Frontend security & architectural boundaries
  if (isFrontend) {
    const sdkImport = codeOnly.match(/from\s+['"]@google\/genai(?:\/[^'"]*)?['"]/);
    if (sdkImport && sdkImport.index !== undefined) {
      addViolation(
        filePath,
        getLineNumber(codeOnly, sdkImport.index),
        'no-client-ai-sdk',
        'Frontend code must never import @google/genai directly; route Gemini calls through server endpoints.'
      );
    }

    const serverImport = codeOnly.match(/from\s+['"][^'"]*\/server(?:\/[^'"]*)?['"]/);
    if (serverImport && serverImport.index !== undefined) {
      addViolation(
        filePath,
        getLineNumber(codeOnly, serverImport.index),
        'no-client-server-import',
        'Frontend code must never import server-only modules.'
      );
    }

    const keyRef = codeOnly.match(/\bGEMINI_API_KEY\b/);
    if (keyRef && keyRef.index !== undefined) {
      addViolation(
        filePath,
        getLineNumber(codeOnly, keyRef.index),
        'no-client-gemini-key',
        'Frontend files must never reference GEMINI_API_KEY.'
      );
    }

    const dialogCall = codeOnly.match(/\bwindow\.(alert|confirm|prompt)\s*\(/);
    if (dialogCall && dialogCall.index !== undefined) {
      addViolation(
        filePath,
        getLineNumber(codeOnly, dialogCall.index),
        'no-window-dialog',
        `Avoid window.${dialogCall[1]}() in embedded enterprise web apps.`
      );
    }

    const webStorageToken = codeOnly.match(
      /\b(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\s*\(\s*['"`][^'"`]*(?:admin_token|portal_token|auth_token|bearer_token|session_token)[^'"`]*['"`]/i
    );
    if (webStorageToken && webStorageToken.index !== undefined) {
      addViolation(
        filePath,
        getLineNumber(codeOnly, webStorageToken.index),
        'no-webstorage-auth-token',
        'Authentication/session tokens must never be stored in localStorage or sessionStorage; use HttpOnly cookies and in-memory state.'
      );
    }
  }

  // 4. TSX JSX security rules (target="_blank" noopener & dangerouslySetInnerHTML guard)
  if (ext === '.tsx') {
    const anchorRegex = /<a\b[^>]*target\s*=\s*["']_blank["'][^>]*>/g;
    let m;
    while ((m = anchorRegex.exec(codeOnly)) !== null) {
      if (!/rel\s*=\s*["'][^"']*noopener/i.test(m[0])) {
        addViolation(
          filePath,
          getLineNumber(codeOnly, m.index),
          'jsx-no-target-blank',
          'Links with target="_blank" must include rel="noopener noreferrer".'
        );
      }
    }

    const rawHtmlRegex = /dangerouslySetInnerHTML\s*=\s*\{\{[\s\S]*?\}\}/g;
    while ((m = rawHtmlRegex.exec(codeOnly)) !== null) {
      if (!m[0].includes('JSON.stringify') || !m[0].includes('\\u003c')) {
        addViolation(
          filePath,
          getLineNumber(codeOnly, m.index),
          'no-unsafe-dangerously-set-inner-html',
          'dangerouslySetInnerHTML is restricted to JSON-LD payloads with `<` escaped as \\u003c.'
        );
      }
    }
  }

  // 5. Runtime governance, model allowlist, proxy safety & secret screening
  if (isRuntimeCode) {
    const deprecatedModel = codeOnly.match(/\b(gemini-1\.5-[a-z0-9.-]+|gemini-2\.0-[a-z0-9.-]+|gemini-pro)\b/i);
    if (deprecatedModel && deprecatedModel.index !== undefined) {
      addViolation(
        filePath,
        getLineNumber(codeOnly, deprecatedModel.index),
        'no-deprecated-gemini-model',
        `Deprecated Gemini model reference "${deprecatedModel[0]}" is prohibited.`
      );
    }

    const legacyApi = codeOnly.match(/api\.ophireummultimedia\.com/i);
    if (legacyApi && legacyApi.index !== undefined) {
      addViolation(
        filePath,
        getLineNumber(codeOnly, legacyApi.index),
        'no-legacy-api-domain',
        'Legacy domain api.ophireummultimedia.com must be replaced with api.destriatech.com.'
      );
    }

    const wrongCeo = content.match(/Desmond\s+Hines/i);
    if (wrongCeo && wrongCeo.index !== undefined) {
      addViolation(
        filePath,
        getLineNumber(content, wrongCeo.index),
        'corporate-identity-ceo',
        'Outdated CEO name "Desmond Hines" detected; canonical name is "Desmond Hinds".'
      );
    }

    const secretPatterns = [
      { name: 'google-api-key', regex: /\bAIzaSy[0-9A-Za-z_-]{20,}\b/ },
      { name: 'stripe-live-key', regex: /\bsk_live_[0-9A-Za-z]{16,}\b/ },
      { name: 'github-pat', regex: /\bghp_[0-9A-Za-z]{24,}\b/ },
      { name: 'resend-key', regex: /\bre_[0-9A-Za-z_]{24,}\b/ },
    ];
    for (const sp of secretPatterns) {
      const sm = codeOnly.match(sp.regex);
      if (sm && sm.index !== undefined) {
        addViolation(
          filePath,
          getLineNumber(codeOnly, sm.index),
          `no-hardcoded-secret-${sp.name}`,
          `Potential hardcoded secret (${sp.name}) detected in runtime source.`
        );
      }
    }

    const rawXff = codeOnly.match(/x-forwarded-for[\s\S]{0,120}\.split\(['"],['"]\)\[0\]/i);
    if (rawXff && rawXff.index !== undefined) {
      addViolation(
        filePath,
        getLineNumber(codeOnly, rawXff.index),
        'no-untrusted-xff-leftmost',
        'Do not trust leftmost X-Forwarded-For directly; rely on Express trust proxy req.ip or rightmost trusted proxy hop.'
      );
    }
  }
}

function lintWorkflows() {
  const wfDir = path.join(ROOT, WORKFLOW_DIR);
  const wfFiles = collectFiles(wfDir, new Set(['.yml', '.yaml']));
  for (const wf of wfFiles) {
    const lines = fs.readFileSync(wf, 'utf8').split(/\r?\n/);
    lines.forEach((lineText, idx) => {
      // Allow negative-assertion grep screening steps that explicitly block leaks in dist/
      if (/^\s*if\s+grep\s+-rnE\b/.test(lineText)) return;

      if (/api\.ophireummultimedia\.com/i.test(lineText)) {
        addViolation(
          wf,
          idx + 1,
          'workflow-no-legacy-api-domain',
          'Workflow references legacy domain api.ophireummultimedia.com instead of api.destriatech.com.'
        );
      }
      if (/Desmond\s+Hines/i.test(lineText)) {
        addViolation(
          wf,
          idx + 1,
          'workflow-corporate-identity-ceo',
          'Outdated CEO name "Desmond Hines" detected in workflow.'
        );
      }
    });
  }
}

const PROHIBITED_PUBLIC_ASSET_PATTERNS = [
  { rule: 'no-proprietary-public-paste', regex: /^Paste_/i, msg: 'Internal AI Studio prompt paste files (Paste_*) must never be committed or published in public/.' },
  { rule: 'no-public-env-file', regex: /^\.env(?:\.|$)/i, msg: 'Environment files (.env*) must never be stored in public/.' },
  { rule: 'no-public-private-key', regex: /\.(?:pem|key|p12|pfx)$/i, msg: 'Private key or certificate files must never be stored in public/.' },
  { rule: 'no-public-database-artifact', regex: /\.(?:sql|bak|dump)$/i, msg: 'Database migrations, backups, or SQL dumps must never be stored in public/.' },
  { rule: 'no-public-source-map', regex: /\.map$/i, msg: 'JavaScript/CSS source maps must not be published in public/.' },
  { rule: 'no-public-secret-filename', regex: /(?:secret|credential|service[-_]?account|private[-_]?key)/i, msg: 'Potential secret or credential file must never be stored in public/.' },
];

function lintPublicAssets() {
  const publicDir = path.join(ROOT, 'public');
  if (!fs.existsSync(publicDir)) return;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        for (const check of PROHIBITED_PUBLIC_ASSET_PATTERNS) {
          if (check.regex.test(entry.name)) {
            addViolation(full, 1, check.rule, check.msg);
            break;
          }
        }
      }
    }
  };
  walk(publicDir);
}

const filesToLint = [
  ...SCAN_DIRS.flatMap((d) => collectFiles(path.join(ROOT, d))),
  ...ROOT_FILES.map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f)),
];

for (const file of filesToLint) {
  lintSourceFile(file);
}
lintWorkflows();
lintPublicAssets();

if (violations.length > 0) {
  console.error(`\n[DESTRIA LINT] Failed with ${violations.length} violation(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.message}`);
  }
  console.error('');
  process.exit(1);
}

console.log(
  `[DESTRIA LINT] Passed: ${filesToLint.length} source files + GitHub workflows + public assets verified with 0 violations.`
);
