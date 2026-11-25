import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function loadRouteManifest() {
  const manifestPath = path.join(ROOT_DIR, 'src', 'config', 'routeManifest.json');
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

export function getAllStaticEntryRoutes(manifest = loadRouteManifest()) {
  const publicRoutes = manifest.publicRoutes.filter((r) => r !== '/');
  const governanceRoutes = manifest.governanceRoutes.map((entry) => entry.path);
  return [
    ...publicRoutes,
    ...governanceRoutes,
    ...manifest.portalStaticRoutes,
    ...manifest.adminStaticRoutes,
  ];
}

function buildRouteSpecificHtml(baseHtml, routePath, manifest) {
  const canonicalOrigin = manifest.canonicalOrigin.replace(/\/+$/, '');
  const canonicalUrl = routePath === '/' ? `${canonicalOrigin}/` : `${canonicalOrigin}${routePath}`;
  const isPrivateRoute =
    routePath === '/portal' ||
    routePath.startsWith('/portal/') ||
    routePath === '/admin' ||
    routePath.startsWith('/admin/');

  let html = baseHtml
    .replace(
      /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
      `<link rel="canonical" href="${canonicalUrl}" />`
    )
    .replace(
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:url" content="${canonicalUrl}" />`
    );

  if (routePath === '/corporate-profile') {
    const profileTitle = 'Corporate Profile | DESTRIA TECH INC';
    const profileDesc =
      'View and download the official DESTRIA TECH INC Corporate Profile. Explore our enterprise technology solutions, corporate leadership, governance and digital innovation capabilities.';
    const coverImageUrl = `${canonicalOrigin}/branding/corporate-profile-cover.webp`;

    html = html
      .replace(/<title>[^<]*<\/title>/i, `<title>${profileTitle}</title>`)
      .replace(
        /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
        `<meta name="description" content="${profileDesc}" />`
      )
      .replace(
        /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
        `<meta property="og:title" content="${profileTitle}" />`
      )
      .replace(
        /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
        `<meta property="og:description" content="${profileDesc}" />`
      )
      .replace(
        /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
        `<meta property="og:image" content="${coverImageUrl}" />`
      )
      .replace(
        /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
        `<meta name="twitter:title" content="${profileTitle}" />`
      )
      .replace(
        /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
        `<meta name="twitter:description" content="${profileDesc}" />`
      )
      .replace(
        /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
        `<meta name="twitter:image" content="${coverImageUrl}" />`
      );
  } else if (routePath === '/resources') {
    const resourcesTitle = 'Corporate Resources & Services Brochure | DESTRIA TECH INC';
    const resourcesDesc =
      'Access and download official DESTRIA TECH INC corporate resources, including our 8-page Corporate Summary and Enterprise Technology Services brochure and 17-page Corporate Profile PDF.';
    const coverImageUrl = `${canonicalOrigin}/resources/thumbnails/destria-tech-line-of-services-cover.webp`;

    html = html
      .replace(/<title>[^<]*<\/title>/i, `<title>${resourcesTitle}</title>`)
      .replace(
        /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
        `<meta name="description" content="${resourcesDesc}" />`
      )
      .replace(
        /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
        `<meta property="og:title" content="${resourcesTitle}" />`
      )
      .replace(
        /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
        `<meta property="og:description" content="${resourcesDesc}" />`
      )
      .replace(
        /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
        `<meta property="og:image" content="${coverImageUrl}" />`
      )
      .replace(
        /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
        `<meta name="twitter:title" content="${resourcesTitle}" />`
      )
      .replace(
        /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
        `<meta name="twitter:description" content="${resourcesDesc}" />`
      )
      .replace(
        /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
        `<meta name="twitter:image" content="${coverImageUrl}" />`
      );
  }

  if (isPrivateRoute && !/<meta\s+name="robots"/i.test(html)) {
    html = html.replace(
      /<\/head>/i,
      '    <meta name="robots" content="noindex, nofollow" />\n  </head>'
    );
  }

  return html;
}

/**
 * Generates refresh-safe static `<route>/index.html` entry files for all known
 * static routes in `src/config/routeManifest.json`, plus a clean SPA fallback
 * `dist/404.html` (zero `#/` hash redirects) and `dist/CNAME` for GitHub Pages.
 */
export function generateStaticPagesRoutes(distDir = path.join(ROOT_DIR, 'dist')) {
  const rootIndexPath = path.join(distDir, 'index.html');
  if (!existsSync(rootIndexPath)) {
    throw new Error(`Cannot generate static routes: missing ${rootIndexPath}`);
  }

  const manifest = loadRouteManifest();
  const rootHtml = readFileSync(rootIndexPath, 'utf8');
  const staticRoutes = getAllStaticEntryRoutes(manifest);

  for (const routePath of staticRoutes) {
    const cleanRel = routePath.replace(/^\/+/, '');
    if (!cleanRel) continue;
    const routeDir = path.join(distDir, ...cleanRel.split('/'));
    mkdirSync(routeDir, { recursive: true });
    const routeHtml = buildRouteSpecificHtml(rootHtml, routePath, manifest);
    writeFileSync(path.join(routeDir, 'index.html'), routeHtml, 'utf8');
  }

  // Dynamic routes (e.g. /portal/orders/:id, /portal/projects/:id, /portal/store/:slug)
  // and unknown paths receive the compiled SPA shell directly via dist/404.html
  // with NO hash redirect, preserving clean URLs in the browser address bar.
  let fallbackHtml = rootHtml;
  if (!/<meta\s+name="robots"/i.test(fallbackHtml)) {
    fallbackHtml = fallbackHtml.replace(
      /<\/head>/i,
      '    <meta name="robots" content="noindex, nofollow" />\n  </head>'
    );
  }
  writeFileSync(path.join(distDir, '404.html'), fallbackHtml, 'utf8');

  const cnamePath = path.join(distDir, 'CNAME');
  if (process.env.VITE_OMIT_CNAME === 'true') {
    if (existsSync(cnamePath)) unlinkSync(cnamePath);
  } else {
    writeFileSync(cnamePath, `${manifest.customDomain}\n`, 'utf8');
  }

  return {
    generatedCount: staticRoutes.length,
    routes: staticRoutes,
    distDir,
  };
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  const result = generateStaticPagesRoutes();
  console.log(
    `[destria-pages] Generated ${result.generatedCount} static route entry points + dist/404.html + dist/CNAME.`
  );
}
