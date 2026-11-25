import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import routeManifest from '../src/config/routeManifest.json';
import {
  ADMIN_STATIC_ROUTES,
  CANONICAL_ORIGIN,
  GOVERNANCE_STATIC_ROUTES,
  PORTAL_DYNAMIC_PREFIXES,
  PORTAL_STATIC_ROUTES,
  PUBLIC_SITEMAP_ROUTES,
  PUBLIC_STATIC_ROUTES,
  ROUTES,
  STATIC_ENTRY_ROUTES,
  buildAdminLoginWithNextRoute,
  buildCanonicalPublicUrl,
  buildCheckoutWithProposalRoute,
  buildGovernanceRoute,
  buildLoginWithNextRoute,
  buildOrderDetailRoute,
  buildProjectDetailRoute,
  buildStoreInquireRoute,
  buildStoreItemRoute,
  buildStoreSearchRoute,
  getRouteSeoMeta,
  isAuthCallbackHash,
  isRecognizedInternalRoute,
  normalizeRoutePathname,
  resolveApplicationBasePath,
  resolveLegacyHashMigration,
  resolveSafePostAdminLoginPath,
  resolveSafePostLoginPath,
} from '../src/config/routes';
import { createApp } from '../src/server/app';
import { LocalPortalRepository } from '../src/server/portal/localPortalRepository';
import {
  TransactionalEmailService,
  type EmailMessage,
  type EmailTransport,
} from '../src/server/services/emailService';
import type { DatabaseRepository, EmailOutboxRecord } from '../src/server/db/types';

const ROOT = process.cwd();

function collectRouteValues(obj: Record<string, unknown>): string[] {
  const results: string[] = [];
  for (const val of Object.values(obj)) {
    if (typeof val === 'string') results.push(val);
    else if (val && typeof val === 'object') results.push(...collectRouteValues(val as Record<string, unknown>));
  }
  return results;
}

test('Scenario 1-3: Centralized route architecture enforces enterprise clean URL conventions across all modules', () => {
  const allDefinedRoutes = collectRouteValues(ROUTES as unknown as Record<string, unknown>);
  assert.ok(allDefinedRoutes.length >= 45, 'Expected comprehensive enterprise route table');

  for (const route of allDefinedRoutes) {
    assert.ok(route.startsWith('/'), `Route must start with '/': ${route}`);
    assert.equal(route.includes('#'), false, `Route must never contain '#': ${route}`);
    assert.equal(route.includes('_'), false, `Route must use hyphens, never underscores: ${route}`);
    assert.equal(route.includes('//'), false, `Route must not contain duplicate slashes: ${route}`);
    assert.equal(route, route.toLowerCase(), `Route must be strictly lowercase: ${route}`);
    if (route !== '/') {
      assert.equal(route.endsWith('/'), false, `Route must not have unnecessary trailing slash: ${route}`);
    }
    assert.equal(/ophireum|opherium/i.test(route), false, `Route must not contain legacy corporate identifiers: ${route}`);
  }

  // Required canonical public, governance, client portal, and admin routes
  assert.equal(ROUTES.HOME, '/');
  assert.equal(ROUTES.ABOUT, '/about');
  assert.equal(ROUTES.SOLUTIONS, '/solutions');
  assert.equal(ROUTES.PORTFOLIO, '/portfolio');
  assert.equal(ROUTES.ENTERPRISE_SUITE, '/enterprise-suite');
  assert.equal(ROUTES.CONSULTATION, '/consultation');
  assert.equal(ROUTES.CONTACT, '/contact');
  assert.equal(ROUTES.GOVERNANCE.ROOT, '/governance');
  assert.equal(ROUTES.GOVERNANCE.PRIVACY_POLICY, '/privacy-policy');
  assert.equal(ROUTES.GOVERNANCE.TERMS_OF_SERVICE, '/terms-of-service');
  assert.equal(ROUTES.GOVERNANCE.COMMERCIAL_ENGAGEMENT_POLICY, '/commercial-engagement-policy');
  assert.equal(ROUTES.GOVERNANCE.AI_USAGE_DISCLAIMER, '/ai-usage-disclaimer');
  assert.equal(ROUTES.GOVERNANCE.INFORMATION_SECURITY, '/information-security');
  assert.equal(ROUTES.GOVERNANCE.CONFIDENTIALITY, '/confidentiality');
  assert.equal(ROUTES.PORTAL.LOGIN, '/portal/login');
  assert.equal(ROUTES.PORTAL.REGISTER, '/portal/register');
  assert.equal(ROUTES.PORTAL.FORGOT_PASSWORD, '/portal/forgot-password');
  assert.equal(ROUTES.PORTAL.RESET_PASSWORD, '/portal/reset-password');
  assert.equal(ROUTES.PORTAL.VERIFY_EMAIL, '/portal/verify-email');
  assert.equal(ROUTES.PORTAL.DASHBOARD, '/portal/dashboard');
  assert.equal(ROUTES.PORTAL.PROJECTS, '/portal/projects');
  assert.equal(ROUTES.PORTAL.PROPOSALS, '/portal/proposals');
  assert.equal(ROUTES.PORTAL.INVOICES, '/portal/invoices');
  assert.equal(ROUTES.PORTAL.DELIVERABLES, '/portal/deliverables');
  assert.equal(ROUTES.PORTAL.SUPPORT, '/portal/support');
  assert.equal(ROUTES.ADMIN.LOGIN, '/admin/login');
  assert.equal(ROUTES.ADMIN.DASHBOARD, '/admin/dashboard');
  assert.equal(ROUTES.ADMIN.APPOINTMENTS, '/admin/appointments');
  assert.equal(ROUTES.ADMIN.AUDIT_LOGS, '/admin/audit-logs');

  // Typed dynamic route builders encode parameters cleanly without hashes
  assert.equal(buildStoreItemRoute('ai-automation-suite'), '/portal/store/ai-automation-suite');
  assert.equal(buildStoreSearchRoute('cloud security'), '/portal/store?q=cloud%20security');
  assert.equal(buildStoreInquireRoute('AI Workforce'), '/portal/store?inquire=AI%20Workforce');
  assert.equal(buildOrderDetailRoute('ord_123'), '/portal/orders/ord_123');
  assert.equal(buildProjectDetailRoute('prj_456'), '/portal/projects/prj_456');
  assert.equal(buildCheckoutWithProposalRoute('prop_789'), '/portal/checkout?proposalId=prop_789');
  assert.equal(buildGovernanceRoute('privacy-policy'), '/privacy-policy');
  assert.equal(buildCanonicalPublicUrl('/about'), `${CANONICAL_ORIGIN}/about`);
  assert.equal(buildCanonicalPublicUrl('/'), `${CANONICAL_ORIGIN}/`);
});

test('Scenario 11-12: Legacy hash-based URL migration converts all recognized #/... routes safely and blocks open redirects & loops', () => {
  const migrationCases: Array<[string, string]> = [
    ['#/portal/register', '/portal/register'],
    ['#/portal/login', '/portal/login'],
    ['#/portal/login?next=%2Fportal%2Fdashboard', '/portal/login?next=%2Fportal%2Fdashboard'],
    ['#/portal/forgot-password', '/portal/forgot-password'],
    ['#/portal/reset-password?token=rst_abc123', '/portal/reset-password?token=rst_abc123'],
    ['#/portal/verify-email?token=vrf_xyz789', '/portal/verify-email?token=vrf_xyz789'],
    ['#/portal/dashboard', '/portal/dashboard'],
    ['#/portal/projects/prj_001', '/portal/projects/prj_001'],
    ['#/portal/orders/ord_001', '/portal/orders/ord_001'],
    ['#/portal/store/enterprise-ai', '/portal/store/enterprise-ai'],
    ['#/admin/login', '/admin/login'],
    ['#/admin/dashboard', '/admin/dashboard'],
    ['#/about', '/about'],
    ['#/privacy-policy', '/privacy-policy'],
    ['#/Portal/Register/', '/portal/register'],
  ];

  for (const [legacyHash, expectedCleanUrl] of migrationCases) {
    const resolved = resolveLegacyHashMigration({
      hostname: 'destriatech.com',
      pathname: '/',
      search: '',
      hash: legacyHash,
    });
    assert.equal(resolved, expectedCleanUrl, `Expected ${legacyHash} -> ${expectedCleanUrl}`);

    // Verify idempotency (second run on migrated URL returns null — zero redirect loops)
    const [nextPath, nextSearch = ''] = expectedCleanUrl.split('?');
    const secondPass = resolveLegacyHashMigration({
      hostname: 'destriatech.com',
      pathname: nextPath,
      search: nextSearch ? `?${nextSearch}` : '',
      hash: '',
    });
    assert.equal(secondPass, null, `Redirect loop detected for ${expectedCleanUrl}`);
  }

  // GitHub Pages repository subpath migration
  assert.equal(
    resolveApplicationBasePath('ophireumtechnology.github.io', '/Destria-Tech-Inc/portal/register'),
    '/Destria-Tech-Inc'
  );
  assert.equal(resolveApplicationBasePath('destriatech.com', '/portal/register'), '');
  assert.equal(
    resolveLegacyHashMigration({
      hostname: 'ophireumtechnology.github.io',
      pathname: '/Destria-Tech-Inc/',
      search: '',
      hash: '#/portal/register',
    }),
    '/Destria-Tech-Inc/portal/register'
  );

  // Trailing slash / duplicate slash / uppercase normalization on clean URLs
  assert.equal(
    resolveLegacyHashMigration({
      hostname: 'destriatech.com',
      pathname: '/Portal/Register/',
      search: '?ref=mail',
      hash: '',
    }),
    '/portal/register?ref=mail'
  );
  assert.equal(normalizeRoutePathname('//portal//orders//ord_ABC'), '/portal/orders/ord_ABC');

  // Preserve OAuth / Supabase auth callback fragments and valid in-page document anchors
  for (const preserved of [
    '#access_token=jwt_123&refresh_token=ref_456&type=recovery',
    '#recovery_token=abc123',
    '#error=access_denied&error_code=otp_expired',
    '#about',
    '#services',
    '#main-content',
  ]) {
    assert.equal(
      resolveLegacyHashMigration({
        hostname: 'destriatech.com',
        pathname: '/',
        search: '',
        hash: preserved,
      }),
      null,
      `Valid fragment ${preserved} must remain untouched`
    );
  }
  assert.equal(isAuthCallbackHash('#access_token=xyz&type=recovery'), true);
  assert.equal(isAuthCallbackHash('#/portal/register'), false);

  // Block open redirects and untrusted / unknown hash targets
  for (const malicious of [
    '#//evil.example/phish',
    '#/https://evil.example',
    '#/javascript:alert(1)',
    '#/../etc/passwd',
    '#/unknown-fictional-route',
    '#/portal/unknown-fictional-page',
  ]) {
    assert.equal(
      resolveLegacyHashMigration({
        hostname: 'destriatech.com',
        pathname: '/',
        search: '',
        hash: malicious,
      }),
      null,
      `Malicious or unrecognized hash ${malicious} must be rejected`
    );
  }
});

test('Scenario 13 & 19: Protected portal/admin login redirect helpers prevent open redirects and enforce clean routes', () => {
  assert.equal(buildLoginWithNextRoute('/portal/projects/prj_9'), '/portal/login?next=%2Fportal%2Fprojects%2Fprj_9');
  assert.equal(buildLoginWithNextRoute('//evil.example/steal'), '/portal/login');
  assert.equal(buildLoginWithNextRoute('https://evil.example/steal'), '/portal/login');
  assert.equal(buildLoginWithNextRoute('/portal/login'), '/portal/login');

  assert.equal(resolveSafePostLoginPath('/portal/invoices'), '/portal/invoices');
  assert.equal(resolveSafePostLoginPath('/portal/reset-password?token=123'), '/portal/dashboard');
  assert.equal(resolveSafePostLoginPath('//evil.example'), '/portal/dashboard');
  assert.equal(resolveSafePostLoginPath('/admin/dashboard'), '/portal/dashboard');

  assert.equal(buildAdminLoginWithNextRoute('/admin/audit-logs'), '/admin/login?next=%2Fadmin%2Faudit-logs');
  assert.equal(buildAdminLoginWithNextRoute('//evil.example'), '/admin/login');
  assert.equal(resolveSafePostAdminLoginPath('/admin/appointments'), '/admin/appointments');
  assert.equal(resolveSafePostAdminLoginPath('/portal/dashboard'), '/admin/dashboard');
  assert.equal(resolveSafePostAdminLoginPath('https://evil.example'), '/admin/dashboard');

  assert.equal(isRecognizedInternalRoute('/portal/orders/ord_123'), true);
  assert.equal(isRecognizedInternalRoute('/portal/orders/ord_123/extra'), false);
  assert.equal(isRecognizedInternalRoute('/unknown-page'), false);
});

test('Scenario 7-10 & 14: End-to-end Client Portal auth, recovery, AI assistant routing, Admin RBAC, and transactional emails use clean URLs', async () => {
  const portalRepo = new LocalPortalRepository({ persistDir: null });
  const { app } = createApp({
    portalRepo,
    sessionSecret: 'enterprise-routing-test-secret-0123456789abcdef',
  });

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const email = 'routing.audit@destriatech.com';
    const password = 'CleanRouting#2026!';
    const newPassword = 'UpdatedRouting#2026!';

    // 1. Register & verify email
    const regRes = await fetch(`${baseUrl}/api/portal/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Marcus',
        lastName: 'Reyes',
        companyName: 'Destria Enterprise Client',
        email,
        password,
      }),
    });
    assert.equal(regRes.status, 201);
    const regJson = (await regRes.json()) as { token?: string; devVerificationToken?: string };
    assert.ok(regJson.token);
    assert.ok(regJson.devVerificationToken);

    const verifyRes = await fetch(`${baseUrl}/api/portal/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: regJson.devVerificationToken }),
    });
    assert.equal(verifyRes.status, 200);

    // 2. Forgot password & reset password
    const forgotRes = await fetch(`${baseUrl}/api/portal/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    assert.equal(forgotRes.status, 200);
    const forgotJson = (await forgotRes.json()) as { devResetToken?: string };
    assert.ok(forgotJson.devResetToken);

    const resetRes = await fetch(`${baseUrl}/api/portal/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: forgotJson.devResetToken, newPassword }),
    });
    assert.equal(resetRes.status, 200);

    // 3. Login with reset password
    const loginRes = await fetch(`${baseUrl}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: newPassword }),
    });
    assert.equal(loginRes.status, 200);
    const loginJson = (await loginRes.json()) as { token: string };

    // 4. Scoped Portal Assistant returns clean non-hash suggestedRoute
    const askRes = await fetch(`${baseUrl}/api/portal/assistant/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${loginJson.token}`,
      },
      body: JSON.stringify({ question: 'Where can I view my invoices and billing?' }),
    });
    assert.equal(askRes.status, 200);
    const askJson = (await askRes.json()) as { suggestedRoute: string };
    assert.equal(askJson.suggestedRoute, ROUTES.PORTAL.ORDERS);
    assert.equal(isRecognizedInternalRoute(askJson.suggestedRoute), true);
    assert.equal(askJson.suggestedRoute.includes('#'), false);

    // 5. Notifications emitted by repository use clean non-hash linkPaths
    const notifRes = await fetch(`${baseUrl}/api/portal/notifications`, {
      headers: { Authorization: `Bearer ${loginJson.token}` },
    });
    assert.equal(notifRes.status, 200);
    const notifJson = (await notifRes.json()) as { notifications: Array<{ linkPath?: string }> };
    assert.ok(notifJson.notifications.length > 0);
    for (const notif of notifJson.notifications) {
      if (notif.linkPath) {
        assert.equal(notif.linkPath.includes('#'), false);
        assert.ok(notif.linkPath.startsWith('/portal'));
      }
    }

    // 6. Admin endpoints enforce RBAC authentication (401 when unauthenticated)
    const unauthAdminAppt = await fetch(`${baseUrl}/api/admin/appointments`);
    assert.equal(unauthAdminAppt.status, 401);
    const unauthAdminAudit = await fetch(`${baseUrl}/api/admin/audit-logs`);
    assert.equal(unauthAdminAudit.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // 7. Transactional email templates render canonical https://destriatech.com URLs and zero /#/
  const emailSource = fs.readFileSync(path.join(ROOT, 'src', 'server', 'services', 'emailService.ts'), 'utf8');
  assert.equal(emailSource.includes('/#/'), false, 'emailService.ts must never emit hash URLs');
  assert.ok(emailSource.includes('buildCanonicalPublicUrl(ROUTES.PORTAL.LOGIN)'));

  const sentMessages: EmailMessage[] = [];
  const captureTransport: EmailTransport = {
    isConfigured: true,
    async send(message: EmailMessage) {
      sentMessages.push(message);
      return { status: 'sent', providerReference: `cap_${sentMessages.length}` };
    },
  };
  const stubDb = {
    isConfigured: true,
    async createOutboxRecord(input: Omit<EmailOutboxRecord, 'id' | 'createdAt' | 'updatedAt'>) {
      const ts = new Date().toISOString();
      return {
        record: {
          ...input,
          id: `outbox_${Date.now()}`,
          status: 'pending' as const,
          deliveryAttempts: 0,
          createdAt: ts,
          updatedAt: ts,
        },
        isDuplicate: false,
      };
    },
    async updateOutboxStatus() {
      return;
    },
  } as unknown as DatabaseRepository;
  const emailService = new TransactionalEmailService(stubDb, captureTransport);
  await emailService.sendAppointmentNotifications(
    {
      id: 'apt_clean_001',
      referenceCode: 'DTI-APT-2026-CLEAN',
      fullName: 'Marcus Reyes',
      companyName: 'Destria Enterprise Client',
      email: 'marcus@example.com',
      phone: '+1 307 555 0100',
      scheduledDate: '2026-12-01',
      scheduledTimeSlot: '09:00 AM',
      durationMinutes: 45,
      clientTimezone: 'UTC',
      consultationType: 'video',
      assignedConsultant: 'DESTRIA Enterprise Advisory',
      status: 'pending_review',
      calendarSyncStatus: 'unconfigured',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    'created',
    'corr-clean-routing'
  );
  assert.ok(sentMessages.length >= 1, 'Expected transactional email to be rendered and captured');
  for (const msg of sentMessages) {
    assert.equal(msg.html.includes('/#/'), false, 'Rendered email HTML must never contain /#/');
    assert.equal(msg.text.includes('/#/'), false, 'Rendered email text must never contain /#/');
    assert.ok(msg.html.includes('https://destriatech.com/'), 'Rendered email HTML must link to https://destriatech.com/');
    assert.ok(
      msg.html.includes('https://destriatech.com/portal/login'),
      'Rendered email HTML must link to https://destriatech.com/portal/login'
    );
  }
});

test('Scenario 17: SEO metadata, robots.txt, sitemap.xml, CNAME, and web manifest enforce canonical clean URLs and exclude private routes', () => {
  // SEO metadata helper
  const homeMeta = getRouteSeoMeta('/');
  assert.equal(homeMeta.canonicalUrl, 'https://destriatech.com/');
  assert.equal(homeMeta.noIndex, undefined);

  const privacyMeta = getRouteSeoMeta('/privacy-policy');
  assert.equal(privacyMeta.canonicalUrl, 'https://destriatech.com/privacy-policy');
  assert.equal(privacyMeta.noIndex, undefined);

  const portalMeta = getRouteSeoMeta('/portal/register');
  assert.equal(portalMeta.canonicalUrl, 'https://destriatech.com/portal/register');
  assert.equal(portalMeta.noIndex, true);

  const adminMeta = getRouteSeoMeta('/admin/login');
  assert.equal(adminMeta.canonicalUrl, 'https://destriatech.com/admin/login');
  assert.equal(adminMeta.noIndex, true);

  // robots.txt
  const robotsTxt = fs.readFileSync(path.join(ROOT, 'public', 'robots.txt'), 'utf8');
  assert.match(robotsTxt, /Disallow:\s*\/portal\//);
  assert.match(robotsTxt, /Disallow:\s*\/admin\//);
  assert.match(robotsTxt, /Disallow:\s*\/api\//);
  assert.match(robotsTxt, /Sitemap:\s*https:\/\/destriatech\.com\/sitemap\.xml/);

  // sitemap.xml
  const sitemapXml = fs.readFileSync(path.join(ROOT, 'public', 'sitemap.xml'), 'utf8');
  assert.equal(sitemapXml.includes('#'), false, 'sitemap.xml must never contain hash fragments');
  assert.equal(sitemapXml.includes('/portal'), false, 'sitemap.xml must exclude /portal routes');
  assert.equal(sitemapXml.includes('/admin'), false, 'sitemap.xml must exclude /admin routes');
  for (const pubRoute of PUBLIC_SITEMAP_ROUTES) {
    assert.ok(
      sitemapXml.includes(`<loc>${buildCanonicalPublicUrl(pubRoute)}</loc>`),
      `Expected sitemap.xml to include ${buildCanonicalPublicUrl(pubRoute)}`
    );
  }

  // site.webmanifest
  const manifestJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'site.webmanifest'), 'utf8')) as {
    start_url: string;
    scope: string;
  };
  assert.equal(manifestJson.start_url, '/');
  assert.equal(manifestJson.scope, '/');
});

test('Scenario 1-6, 15, 16, 20: Real GitHub Pages static-hosting HTTP simulation verifies direct access, refresh, asset loading, and dynamic fallback with zero /#/', async () => {
  const distDir = path.join(ROOT, 'dist');
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    // Ensure dist exists even when `npm test` runs before `npm run build`
    execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'pipe' });
  }

  // Simulate exact GitHub Pages static file resolution semantics (ZERO server-side SPA rewrite!):
  // 1. Exact file match -> 200
  // 2. Directory + index.html match -> 200
  // 3. Otherwise -> serve dist/404.html with HTTP 404
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
  };

  const staticServer = http.createServer((req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const cleanPathname = decodeURIComponent(reqUrl.pathname).replace(/^\/+/, '');
    const candidate = path.resolve(distDir, cleanPathname);

    const serveFile = (filePath: string, status: number) => {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(status, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    };

    if (candidate.startsWith(distDir)) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return serveFile(candidate, 200);
      }
      const dirIndex = path.join(candidate, 'index.html');
      if (fs.existsSync(dirIndex) && fs.statSync(dirIndex).isFile()) {
        return serveFile(dirIndex, 200);
      }
    }

    const fallback404 = path.join(distDir, '404.html');
    return serveFile(fallback404, 404);
  });

  await new Promise<void>((resolve) => staticServer.listen(0, '127.0.0.1', () => resolve()));
  const port = (staticServer.address() as AddressInfo).port;
  const origin = `http://127.0.0.1:${port}`;

  try {
    // 1. Verify root + every single static route (public, governance, portal, admin) returns HTTP 200
    const allStaticRoutes = ['/', ...STATIC_ENTRY_ROUTES];
    let verifiedAssetPaths = new Set<string>();

    for (const route of allStaticRoutes) {
      const res = await fetch(`${origin}${route}`);
      assert.equal(res.status, 200, `Expected GitHub Pages HTTP 200 on direct load/refresh of ${route}`);
      const html = await res.text();
      assert.equal(html.includes('/#/'), false, `Rendered entry HTML for ${route} must not contain /#/`);
      assert.equal(html.includes('/src/main.tsx'), false, `Entry HTML for ${route} must not reference dev /src/main.tsx`);
      assert.ok(
        html.includes(`href="${buildCanonicalPublicUrl(route)}"`),
        `Entry HTML for ${route} must declare canonical URL ${buildCanonicalPublicUrl(route)}`
      );

      if (route.startsWith('/portal') || route.startsWith('/admin')) {
        assert.match(html, /name="robots" content="noindex, nofollow"/, `Private route ${route} must carry noindex`);
      }

      // Collect asset script/style references to confirm HTTP 200 asset resolution from nested paths
      for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) {
        verifiedAssetPaths.add(match[1]);
      }
    }

    assert.ok(verifiedAssetPaths.size >= 2, 'Expected compiled JS and CSS assets in built HTML');
    for (const assetPath of verifiedAssetPaths) {
      const assetRes = await fetch(`${origin}${assetPath}`);
      assert.equal(assetRes.status, 200, `Expected compiled asset ${assetPath} to return HTTP 200`);
    }

    // Verify branding logo & favicon resolve with HTTP 200
    const logoRes = await fetch(`${origin}/branding/destria-logo-512.png`);
    assert.equal(logoRes.status, 200);
    const robotsRes = await fetch(`${origin}/robots.txt`);
    assert.equal(robotsRes.status, 200);
    const sitemapRes = await fetch(`${origin}/sitemap.xml`);
    assert.equal(sitemapRes.status, 200);
    const cnameRes = await fetch(`${origin}/CNAME`);
    assert.equal(cnameRes.status, 200);
    assert.equal((await cnameRes.text()).trim(), routeManifest.customDomain);

    // 2. Verify dynamic routes & unknown routes serve clean SPA shell via 404.html WITHOUT /#/ redirect
    for (const dynamicOrUnknown of [
      '/portal/orders/ord_live_001',
      '/portal/projects/prj_live_002',
      '/portal/store/ai-workforce-systems',
      '/nonexistent-enterprise-route',
    ]) {
      const res = await fetch(`${origin}${dynamicOrUnknown}`);
      assert.equal(res.status, 404, `GitHub Pages edge serves 404.html for dynamic/unknown path ${dynamicOrUnknown}`);
      const html = await res.text();
      assert.equal(html.includes('/#/'), false, `404.html SPA shell must NEVER redirect ${dynamicOrUnknown} to /#/`);
      assert.match(html, /<div id="root"><\/div>/, `404.html must boot React SPA shell cleanly for ${dynamicOrUnknown}`);
      assert.match(html, /src="\/assets\//, `404.html must load root-resolved compiled JS bundle`);
    }
  } finally {
    await new Promise<void>((resolve) => staticServer.close(() => resolve()));
  }

  // Verify manifest counts match expected implementation scope
  assert.equal(PUBLIC_STATIC_ROUTES.length, 7);
  assert.equal(GOVERNANCE_STATIC_ROUTES.length, 11);
  assert.equal(PORTAL_STATIC_ROUTES.length, 26);
  assert.equal(PORTAL_DYNAMIC_PREFIXES.length, 3);
  assert.equal(ADMIN_STATIC_ROUTES.length, 5);
});

test('Scenario 18: Automated clean-URL source & dist regression gate script passes with zero violations', () => {
  const output = execFileSync('node', ['scripts/verify-clean-routing.mjs', '--dist'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.match(output, /\[verify-clean-routing\] PASS/);
});
