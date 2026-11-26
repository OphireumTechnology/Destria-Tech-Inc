import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAllStaticEntryRoutes } from './build-pages-routes.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SOURCE_SCAN_ROOTS = ['src', 'public', 'server.ts', 'index.html'];

// Narrowly scoped allowlist: ONLY the legacy hash-migration utility modules may
// inspect `#/` strings for one-way migration to clean URLs. Even in these files,
// HashRouter, createHashRouter, hashHistory, and writing `#/` are prohibited.
const LEGACY_MIGRATION_ALLOWLIST = new Set([
  'src/config/routes.ts',
  'src/portal/PortalRouter.tsx',
]);

const GLOBAL_FORBIDDEN_PATTERNS = [
  { name: 'HashRouter', regex: /\bHashRouter\b/ },
  { name: 'createHashRouter', regex: /\bcreateHashRouter\b/ },
  { name: 'hashHistory', regex: /\bhashHistory\b/ },
  { name: 'hash-assignment', regex: /\b(?:window\.)?location\.hash\s*=/ },
  { name: 'hash-portal-url', regex: /\/#\/portal\// },
  { name: 'hash-admin-url', regex: /\/#\/admin\// },
  { name: 'hash-replace-redirect', regex: /location\.replace\([^)]*['"`][^'"`]*\/#/ },
  { name: 'hash-history-push', regex: /(?:pushState|replaceState)\([^)]*['"`][^'"`]*\/#/ },
];

const STRICT_NON_MIGRATION_PATTERNS = [
  { name: 'legacy-hash-prefix', regex: /['"`]#\/(?:portal|admin)/ },
];

function collectFiles(entryPath, results = []) {
  const full = path.join(ROOT_DIR, entryPath);
  if (!existsSync(full)) return results;
  const stat = readdirSync(full, { withFileTypes: true });
  for (const item of stat) {
    if (item.name === 'node_modules' || item.name === 'dist') continue;
    const rel = path.join(entryPath, item.name);
    if (item.isDirectory()) {
      collectFiles(rel, results);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs|html|json)$/.test(item.name)) {
      results.push(rel);
    }
  }
  return results;
}

function scanSources() {
  const violations = [];
  const files = [];

  for (const target of SOURCE_SCAN_ROOTS) {
    const full = path.join(ROOT_DIR, target);
    if (!existsSync(full)) continue;
    if (target.includes('.')) {
      files.push(target);
    } else {
      collectFiles(target, files);
    }
  }

  for (const relPath of files) {
    const normalizedRel = relPath.replace(/\\/g, '/');
    const content = readFileSync(path.join(ROOT_DIR, normalizedRel), 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const rule of GLOBAL_FORBIDDEN_PATTERNS) {
        if (rule.regex.test(line)) {
          violations.push(`${normalizedRel}:${index + 1} matches forbidden pattern [${rule.name}]`);
        }
      }
      if (!LEGACY_MIGRATION_ALLOWLIST.has(normalizedRel)) {
        for (const rule of STRICT_NON_MIGRATION_PATTERNS) {
          if (rule.regex.test(line)) {
            violations.push(
              `${normalizedRel}:${index + 1} matches forbidden legacy hash pattern [${rule.name}]`
            );
          }
        }
      }
    });
  }

  const PROHIBITED_ASSET_REGEX =
    /^(?:Paste_|\.env(?:\.|$))|\.(?:pem|key|p12|pfx|sql|bak|dump|map)$|(?:secret|credential|service[-_]?account|private[-_]?key)/i;

  const checkNoSensitivePublicFiles = (dirRel) => {
    const full = path.join(ROOT_DIR, dirRel);
    if (!existsSync(full)) return;
    for (const item of readdirSync(full, { withFileTypes: true })) {
      const rel = path.join(dirRel, item.name);
      if (item.isDirectory()) {
        checkNoSensitivePublicFiles(rel);
      } else if (PROHIBITED_ASSET_REGEX.test(item.name)) {
        violations.push(`${rel.replace(/\\/g, '/')} is a prohibited sensitive or internal artifact in public assets`);
      }
    }
  };
  checkNoSensitivePublicFiles('public');

  return violations;
}

function verifyDistArtifact(requireDist) {
  const distDir = path.join(ROOT_DIR, 'dist');
  const distIndex = path.join(distDir, 'index.html');
  const violations = [];

  if (!existsSync(distIndex)) {
    if (requireDist) {
      violations.push('dist/index.html does not exist. Run `npm run build` before validating dist.');
    }
    return violations;
  }

  const manifest = JSON.parse(
    readFileSync(path.join(ROOT_DIR, 'src', 'config', 'routeManifest.json'), 'utf8')
  );
  const staticRoutes = getAllStaticEntryRoutes(manifest);

  const requiredFiles = ['index.html', '404.html', 'robots.txt', 'sitemap.xml'];
  if (process.env.VITE_OMIT_CNAME !== 'true') {
    requiredFiles.push('CNAME');
  }

  for (const file of requiredFiles) {
    if (!existsSync(path.join(distDir, file))) {
      violations.push(`Missing required production artifact: dist/${file}`);
    }
  }

  // Validate CNAME content
  const cnamePath = path.join(distDir, 'CNAME');
  if (process.env.VITE_OMIT_CNAME !== 'true' && existsSync(cnamePath)) {
    const cname = readFileSync(cnamePath, 'utf8').trim();
    if (cname !== manifest.customDomain) {
      violations.push(`dist/CNAME mismatch: expected "${manifest.customDomain}", got "${cname}"`);
    }
  }

  // Validate 404.html has zero hash redirects and boots compiled assets
  const notFoundPath = path.join(distDir, '404.html');
  if (existsSync(notFoundPath)) {
    const html404 = readFileSync(notFoundPath, 'utf8');
    if (html404.includes('/#/') || html404.includes("'#'") || html404.includes("'/#")) {
      violations.push('dist/404.html contains prohibited hash-based redirect logic');
    }
    if (html404.includes('/src/main.tsx')) {
      violations.push('dist/404.html references dev entrypoint /src/main.tsx');
    }
    if (!/src="[^"]*\/assets\/[^"]+\.js"/.test(html404)) {
      violations.push('dist/404.html does not reference a root-resolved compiled JS bundle');
    }
  }

  // Validate sitemap excludes private routes
  const sitemapPath = path.join(distDir, 'sitemap.xml');
  if (existsSync(sitemapPath)) {
    const sitemap = readFileSync(sitemapPath, 'utf8');
    if (/\/portal\b|\/admin\b|\/#\//i.test(sitemap)) {
      violations.push('dist/sitemap.xml must not contain /portal, /admin, or /#/ URLs');
    }
  }

  // Validate EVERY static route entry exists and resolves assets cleanly
  for (const routePath of staticRoutes) {
    const relDir = routePath.replace(/^\/+/, '');
    const entryFile = path.join(distDir, ...relDir.split('/'), 'index.html');
    if (!existsSync(entryFile)) {
      violations.push(`Missing static route entry point: dist/${relDir}/index.html`);
      continue;
    }
    const html = readFileSync(entryFile, 'utf8');
    if (html.includes('/src/main.tsx')) {
      violations.push(`dist/${relDir}/index.html references dev entrypoint /src/main.tsx`);
    }
    if (html.includes('src="./assets/') || html.includes('href="./assets/')) {
      violations.push(`dist/${relDir}/index.html contains broken relative ./assets/ reference`);
    }
    if (!/src="[^"]*\/assets\/[^"]+\.js"/.test(html)) {
      violations.push(`dist/${relDir}/index.html missing compiled JS asset script`);
    }
  }

  const PROHIBITED_DIST_REGEX =
    /^(?:Paste_|\.env(?:\.|$))|\.(?:pem|key|p12|pfx|sql|bak|dump|map)$|(?:secret|credential|service[-_]?account|private[-_]?key)/i;

  const checkNoSensitiveDistFiles = (dirAbs) => {
    if (!existsSync(dirAbs)) return;
    for (const item of readdirSync(dirAbs, { withFileTypes: true })) {
      const full = path.join(dirAbs, item.name);
      if (item.isDirectory()) {
        checkNoSensitiveDistFiles(full);
      } else if (PROHIBITED_DIST_REGEX.test(item.name)) {
        violations.push(`${path.relative(ROOT_DIR, full).replace(/\\/g, '/')} must never be emitted into dist/`);
      }
    }
  };
  checkNoSensitiveDistFiles(distDir);

  return violations;
}

const requireDist = process.argv.includes('--dist');
const sourceViolations = scanSources();
const distViolations = verifyDistArtifact(requireDist);
const allViolations = [...sourceViolations, ...distViolations];

if (allViolations.length > 0) {
  console.error('Clean URL routing validation FAILED:');
  for (const v of allViolations) {
    console.error(`  - ${v}`);
  }
  process.exit(1);
}

console.log(
  `[verify-clean-routing] PASSED (source scan clean${
    existsSync(path.join(ROOT_DIR, 'dist', 'index.html'))
      ? ' + all static route entries & GitHub Pages artifacts verified'
      : ''
  }).`
);
