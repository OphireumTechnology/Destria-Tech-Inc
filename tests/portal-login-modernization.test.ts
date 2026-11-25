import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server/app';
import { LocalPortalRepository } from '../src/server/portal/localPortalRepository';
import {
  isLoginTargetPath,
  resolveCanonicalPortalLoginUrl,
  resolveGitHubPagesRepoPrefix,
} from '../src/portal/PortalRouter';
import { resolveSafePostLoginPath } from '../src/portal/login/ClientPortalLoginPage';
import { resolvePortalLoginEmblemUrl } from '../src/portal/login/ClientPortalCorporatePanel';
import { mapLoginErrorMessage } from '../src/portal/login/ClientPortalLoginForm';
import { PortalApiError } from '../src/portal/portalApi';

const ROOT = process.cwd();

test('Portal Login Clean URL: canonicalizes legacy #/portal/login and trailing slashes without altering non-login hashes', () => {
  // Legacy hash login URL on custom domain
  assert.equal(
    resolveCanonicalPortalLoginUrl({
      hostname: 'destriatech.com',
      pathname: '/',
      search: '',
      hash: '#/portal/login',
    }),
    '/portal/login'
  );

  // Legacy hash login URL preserving next query parameter
  assert.equal(
    resolveCanonicalPortalLoginUrl({
      hostname: 'destriatech.com',
      pathname: '/',
      search: '',
      hash: '#/portal/login?next=%2Fportal%2Fdashboard',
    }),
    '/portal/login?next=%2Fportal%2Fdashboard'
  );

  // Legacy hash login URL merging outer search and hash query without duplication
  assert.equal(
    resolveCanonicalPortalLoginUrl({
      hostname: 'www.destriatech.com',
      pathname: '/',
      search: '?reason=session_expired',
      hash: '#/portal/login?next=%2Fportal%2Fprojects',
    }),
    '/portal/login?reason=session_expired&next=%2Fportal%2Fprojects'
  );

  // Trailing slash clean login URL normalizes while preserving query + non-portal callback hash
  assert.equal(
    resolveCanonicalPortalLoginUrl({
      hostname: 'destriatech.com',
      pathname: '/portal/login/',
      search: '?reason=session_expired',
      hash: '',
    }),
    '/portal/login?reason=session_expired'
  );

  // GitHub Pages repository subpath normalization
  assert.equal(
    resolveGitHubPagesRepoPrefix('ophireumtechnology.github.io', '/Destria-Tech-Inc/portal/login'),
    '/Destria-Tech-Inc'
  );
  assert.equal(
    resolveCanonicalPortalLoginUrl({
      hostname: 'ophireumtechnology.github.io',
      pathname: '/Destria-Tech-Inc/',
      search: '',
      hash: '#/portal/login?next=%2Fportal%2Forders',
    }),
    '/Destria-Tech-Inc/portal/login?next=%2Fportal%2Forders'
  );

  // Already clean login URL needs no replacement
  assert.equal(
    resolveCanonicalPortalLoginUrl({
      hostname: 'destriatech.com',
      pathname: '/portal/login',
      search: '',
      hash: '',
    }),
    null
  );

  // Enterprise-wide legacy hash URLs migrate cleanly to History API routes
  assert.equal(
    resolveCanonicalPortalLoginUrl({
      hostname: 'destriatech.com',
      pathname: '/',
      search: '',
      hash: '#/portal/verify-email?token=verify_123',
    }),
    '/portal/verify-email?token=verify_123'
  );
  assert.equal(
    resolveCanonicalPortalLoginUrl({
      hostname: 'destriatech.com',
      pathname: '/',
      search: '',
      hash: '#/portal/forgot-password',
    }),
    '/portal/forgot-password'
  );
  assert.equal(
    resolveCanonicalPortalLoginUrl({
      hostname: 'destriatech.com',
      pathname: '/',
      search: '',
      hash: '#/portal/register',
    }),
    '/portal/register'
  );

  // Must NEVER strip or rewrite OAuth/recovery/document-anchor hash fragments
  for (const preservedHash of [
    '#access_token=eyJhbGciOiJIUzI1NiJ9&type=recovery',
    '#recovery_token=abc123',
    '#about',
    '#services',
  ]) {
    assert.equal(
      resolveCanonicalPortalLoginUrl({
        hostname: 'destriatech.com',
        pathname: '/',
        search: '',
        hash: preservedHash,
      }),
      null,
      `Expected hash ${preservedHash} to remain untouched`
    );
  }

  // Login path matcher and safe post-login redirect validation
  assert.equal(isLoginTargetPath('/portal/login'), true);
  assert.equal(isLoginTargetPath('/portal/login?next=%2Fportal%2Fdashboard'), true);
  assert.equal(isLoginTargetPath('/portal/login/'), true);
  assert.equal(isLoginTargetPath('/portal/register'), false);

  assert.equal(resolveSafePostLoginPath('/portal/dashboard'), '/portal/dashboard');
  assert.equal(resolveSafePostLoginPath('/portal/orders/ord_123'), '/portal/orders/ord_123');
  assert.equal(resolveSafePostLoginPath('/portal/login'), '/portal/dashboard');
  assert.equal(resolveSafePostLoginPath('//evil.example/phish'), '/portal/dashboard');
  assert.equal(resolveSafePostLoginPath('https://evil.example/phish'), '/portal/dashboard');
  assert.equal(resolveSafePostLoginPath(null), '/portal/dashboard');
});

test('Portal Login Error Mapping: returns exact user-safe messages for all authentication failure classes without leaking internals', () => {
  const invalid = mapLoginErrorMessage(
    new PortalApiError(401, 'Invalid email or password (SQL_DEBUG_123)', 'INVALID_CREDENTIALS')
  );
  assert.equal(invalid.category, 'invalid_credentials');
  assert.equal(invalid.message, 'Unable to sign in. Please verify your credentials and try again.');

  const rateLimited = mapLoginErrorMessage(
    new PortalApiError(429, 'Too many attempts from 10.0.0.1', 'RATE_LIMITED')
  );
  assert.equal(rateLimited.category, 'rate_limited');
  assert.equal(rateLimited.message, 'Too many sign-in attempts. Please try again later.');

  const unavailable = mapLoginErrorMessage(
    new PortalApiError(503, 'Database connection refused at postgres://secret', 'SERVICE_UNAVAILABLE')
  );
  assert.equal(unavailable.category, 'service_unavailable');
  assert.equal(
    unavailable.message,
    'The authentication service is temporarily unavailable. Please try again shortly.'
  );

  const network = mapLoginErrorMessage(new TypeError('Failed to fetch'));
  assert.equal(network.category, 'network_error');
  assert.equal(
    network.message,
    'Unable to connect to the authentication service. Please check your connection and try again.'
  );

  const expired = mapLoginErrorMessage(
    new PortalApiError(401, 'JWT expired at line 42', 'SESSION_EXPIRED')
  );
  assert.equal(expired.category, 'session_expired');
  assert.equal(expired.message, 'Your session has expired. Please sign in again.');

  // Unknown unexpected error falls back safely without exposing raw error text
  const generic = mapLoginErrorMessage(
    new Error('TypeError: Cannot read properties of undefined (reading tokenSecret)')
  );
  assert.doesNotMatch(generic.message, /tokenSecret|TypeError|line 42/i);
});

test('Portal Login End-to-End Authentication Regression: real register, invalid password rejection, valid sign-in, session check, and logout', async () => {
  const portalRepo = new LocalPortalRepository({ persistDir: null });
  const { app } = createApp({
    portalRepo,
    sessionSecret: 'test-login-modernization-secret-0123456789',
  });

  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const email = 'enterprise.client@destriatech.com';
    const password = 'EnterpriseLogin#2026!';

    // 1. Create account
    const regRes = await fetch(`${baseUrl}/api/portal/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Elena',
        lastName: 'Vance',
        companyName: 'Destria Enterprise Partner',
        email,
        password,
      }),
    });
    assert.equal(regRes.status, 201);

    // 2. Reject wrong password cleanly (401)
    const badLoginRes = await fetch(`${baseUrl}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'WrongPassword#999' }),
    });
    assert.equal(badLoginRes.status, 401);

    // 3. Accept valid credentials (200) and issue session cookie + token
    const okLoginRes = await fetch(`${baseUrl}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(okLoginRes.status, 200);
    const loginBody = (await okLoginRes.json()) as { token?: string; user?: { email?: string } };
    assert.ok(loginBody.token, 'Expected bearer session token on login');
    assert.equal(loginBody.user?.email, email);
    const setCookie = okLoginRes.headers.get('set-cookie') || '';
    assert.match(setCookie, /HttpOnly/i);

    // 4. Verify authenticated session via /me
    const meRes = await fetch(`${baseUrl}/api/portal/auth/me`, {
      headers: { Authorization: `Bearer ${loginBody.token}` },
    });
    assert.equal(meRes.status, 200);
    const meBody = (await meRes.json()) as { user?: { email?: string } };
    assert.equal(meBody.user?.email, email);

    // 5. Logout revokes session
    const logoutRes = await fetch(`${baseUrl}/api/portal/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${loginBody.token}` },
    });
    assert.equal(logoutRes.status, 200);

    const postLogoutMe = await fetch(`${baseUrl}/api/portal/auth/me`, {
      headers: { Authorization: `Bearer ${loginBody.token}` },
    });
    assert.equal(postLogoutMe.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Portal Login Scope, Branding, Revised Copy, Legal Restraint, and Public Website Isolation Audit', () => {
  const loginDir = path.join(ROOT, 'src', 'portal', 'login');
  const expectedFiles = [
    'ClientPortalLoginPage.tsx',
    'ClientPortalLoginLayout.tsx',
    'ClientPortalCorporatePanel.tsx',
    'ClientPortalLoginForm.tsx',
    'ClientPortalTechnologyBackground.tsx',
    'ClientPortalContactInformation.tsx',
  ];

  let combinedLoginSource = '';
  for (const file of expectedFiles) {
    const fullPath = path.join(loginDir, file);
    assert.equal(fs.existsSync(fullPath), true, `Missing login module: ${file}`);
    combinedLoginSource += `\n${fs.readFileSync(fullPath, 'utf8')}`;
  }

  const normalizedSource = combinedLoginSource.replace(/\s+/g, ' ');

  // Required wording & corporate identity elements
  const requiredPhrases = [
    'Return to Corporate Website',
    'ENTERPRISE DIGITAL WORKSPACE',
    'Intelligent Technology.',
    'Connected Enterprise.',
    'Your dedicated digital workspace for enterprise technology engagements, formal proposals, project collaboration, and authorized deliverables.',
    "Access DESTRIA NETWORK to coordinate customized technology solutions and manage your organization&apos;s digital transformation engagements.",
    'Artificial Intelligence',
    'Enterprise Engineering',
    'Digital Transformation',
    'Welcome to DESTRIA NETWORK',
    'Sign in to access your enterprise workspace.',
    'Registered Email Address',
    'name@company.com',
    'Forgot your password?',
    'Sign In',
    'Signing in...',
    'New to DESTRIA NETWORK?',
    'Create a Client Account',
    'Access is restricted to authorized users. Account activity is subject to applicable platform policies.',
    'BRAND_ASSETS.primaryLogo',
    'prefers-reduced-motion: reduce',
    'aria-hidden="true"',
    'BackgroundFaultBoundary',
    '--portal-navy',
    '--portal-gold',
    '--portal-cyan',
  ];

  assert.equal(resolvePortalLoginEmblemUrl(), '/branding/destria-logo-512.png');

  for (const phrase of requiredPhrases) {
    assert.ok(
      normalizedSource.includes(phrase),
      `Expected Client Portal login module set to include: ${phrase}`
    );
  }

  // Prohibited legal/certification claims, pricing disclosures, and legacy identity
  const prohibitedPatterns = [
    /\bSOC\s*2\b/i,
    /\bISO\s*27001\b/i,
    /\bHIPAA\b/i,
    /\bPCI\s*DSS\b/i,
    /\b100%\s*secure\b/i,
    /\bindependently\s+audited\b/i,
    /\bguaranteed\b/i,
    /startingUsd|WELCOME10|₱|\$\d+/i,
    /ophireum|opherium|7567003|languisan|aeropark/i,
  ];

  for (const pattern of prohibitedPatterns) {
    assert.equal(
      pattern.test(combinedLoginSource),
      false,
      `Found prohibited pattern ${pattern} in Client Portal login modules`
    );
  }

  // Confirm AuthPages.tsx delegates PortalLoginPage cleanly while preserving other auth pages
  const authPagesSource = fs.readFileSync(path.join(ROOT, 'src', 'portal', 'pages', 'AuthPages.tsx'), 'utf8');
  assert.match(authPagesSource, /export \{ ClientPortalLoginPage as PortalLoginPage \} from '\.\.\/login\/ClientPortalLoginPage'/);
  assert.match(authPagesSource, /export const PortalRegisterPage/);
  assert.match(authPagesSource, /export const PortalVerifyEmailPage/);
  assert.match(authPagesSource, /export const PortalForgotPasswordPage/);

  // Confirm public website global CSS was NOT polluted with login-scoped variables
  const globalCss = fs.readFileSync(path.join(ROOT, 'src', 'index.css'), 'utf8');
  assert.equal(globalCss.includes('--portal-navy'), false);
  assert.equal(globalCss.includes('dti-portal-login-scope'), false);

  // Confirm public website core files exist and remain intact
  for (const rel of [
    'index.html',
    'src/App.tsx',
    'src/components/Header.tsx',
    'src/components/Hero.tsx',
    'src/components/Footer.tsx',
  ]) {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.equal(content.includes('dti-portal-login-scope'), false, `Public file ${rel} must stay isolated from login styles`);
  }
});

test('Production Build Refresh-Safe Entry: vite.config.ts emits dist clean route entries with root-resolved /assets/ and /branding/ paths', () => {
  const viteConfigSource = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
  assert.match(viteConfigSource, /enterpriseCleanRoutesPlugin/);
  assert.match(viteConfigSource, /generateStaticPagesRoutes/);

  const rootDistHtmlPath = path.join(ROOT, 'dist', 'index.html');
  const loginDistHtmlPath = path.join(ROOT, 'dist', 'portal', 'login', 'index.html');
  const registerDistHtmlPath = path.join(ROOT, 'dist', 'portal', 'register', 'index.html');

  if (fs.existsSync(rootDistHtmlPath)) {
    assert.equal(
      fs.existsSync(loginDistHtmlPath),
      true,
      'Expected dist/portal/login/index.html to be emitted alongside dist/index.html'
    );
    assert.equal(
      fs.existsSync(registerDistHtmlPath),
      true,
      'Expected dist/portal/register/index.html to be emitted alongside dist/index.html'
    );

    const rootHtml = fs.readFileSync(rootDistHtmlPath, 'utf8');
    const loginHtml = fs.readFileSync(loginDistHtmlPath, 'utf8');
    const registerHtml = fs.readFileSync(registerDistHtmlPath, 'utf8');

    assert.match(rootHtml, /src="\/assets\//);
    assert.match(loginHtml, /src="\/assets\//);
    assert.match(loginHtml, /href="\/assets\//);
    assert.match(loginHtml, /href="\/branding\//);
    assert.match(registerHtml, /src="\/assets\//);
    assert.equal(loginHtml.includes('src="./assets/'), false, 'Nested login HTML must not retain single-dot ./assets/ paths');
    assert.equal(loginHtml.includes('/src/main.tsx'), false, 'Production login HTML must not reference dev /src/main.tsx');
    assert.equal(loginHtml.includes('/#/'), false, 'Production login HTML must not contain hash-routing /#/ links');
    assert.equal(registerHtml.includes('/#/'), false, 'Production register HTML must not contain hash-routing /#/ links');
  }
});
