import manifest from './routeManifest.json';

export const CANONICAL_ORIGIN = manifest.canonicalOrigin;
export const CUSTOM_DOMAIN = manifest.customDomain;
export const GITHUB_PAGES_HOST = manifest.githubPagesHost;
export const GITHUB_PAGES_REPO_PREFIX = manifest.githubPagesRepoPrefix;

export const ROUTES = {
  HOME: '/',
  ABOUT: '/about',
  SOLUTIONS: '/solutions',
  PORTFOLIO: '/portfolio',
  ENTERPRISE_SUITE: '/enterprise-suite',
  CONSULTATION: '/consultation',
  CONTACT: '/contact',

  GOVERNANCE: {
    ROOT: '/governance',
    COMMERCIAL_ENGAGEMENT_POLICY: '/commercial-engagement-policy',
    TERMS_OF_SERVICE: '/terms-of-service',
    PRIVACY_POLICY: '/privacy-policy',
    COOKIE_POLICY: '/cookie-policy',
    TECHNOLOGY_SERVICES_DISCLAIMER: '/technology-services-disclaimer',
    AI_USAGE_DISCLAIMER: '/ai-usage-disclaimer',
    INTELLECTUAL_PROPERTY: '/intellectual-property',
    INFORMATION_SECURITY: '/information-security',
    ACCEPTABLE_USE_POLICY: '/acceptable-use-policy',
    CONFIDENTIALITY: '/confidentiality',
  },

  PORTAL: {
    ROOT: '/portal',
    LOGIN: '/portal/login',
    REGISTER: '/portal/register',
    FORGOT_PASSWORD: '/portal/forgot-password',
    RESET_PASSWORD: '/portal/reset-password',
    VERIFY_EMAIL: '/portal/verify-email',
    DASHBOARD: '/portal/dashboard',
    SERVICES: '/portal/services',
    STORE: '/portal/store',
    CART: '/portal/cart',
    PROPOSALS: '/portal/proposals',
    CHECKOUT: '/portal/checkout',
    ORDERS: '/portal/orders',
    PROJECTS: '/portal/projects',
    MESSAGES: '/portal/messages',
    CREDITS: '/portal/credits',
    SUBSCRIPTIONS: '/portal/subscriptions',
    INVOICES: '/portal/invoices',
    PAYMENTS: '/portal/payments',
    FILES: '/portal/files',
    DELIVERABLES: '/portal/deliverables',
    DOCUMENTS: '/portal/documents',
    SUPPORT: '/portal/support',
    NOTIFICATIONS: '/portal/notifications',
    PROFILE: '/portal/profile',
    SECURITY: '/portal/security',
    SETTINGS: '/portal/settings',
  },

  ADMIN: {
    ROOT: '/admin',
    LOGIN: '/admin/login',
    DASHBOARD: '/admin/dashboard',
    APPOINTMENTS: '/admin/appointments',
    AUDIT_LOGS: '/admin/audit-logs',
  },
} as const;

export const PUBLIC_SECTION_ROUTE_MAP: Record<string, string> = {
  hero: ROUTES.HOME,
  about: ROUTES.ABOUT,
  services: ROUTES.SOLUTIONS,
  portfolio: ROUTES.PORTFOLIO,
  architecture: ROUTES.ENTERPRISE_SUITE,
  consultation: ROUTES.CONSULTATION,
  contact: ROUTES.CONTACT,
};

export const PUBLIC_ROUTE_TO_SECTION_MAP: Record<string, string> = {
  [ROUTES.HOME]: 'hero',
  [ROUTES.ABOUT]: 'about',
  [ROUTES.SOLUTIONS]: 'services',
  [ROUTES.PORTFOLIO]: 'portfolio',
  [ROUTES.ENTERPRISE_SUITE]: 'architecture',
  [ROUTES.CONSULTATION]: 'contact',
  [ROUTES.CONTACT]: 'contact',
};

export const GOVERNANCE_ROUTE_ENTRIES = manifest.governanceRoutes;

export const GOVERNANCE_PATH_TO_SECTION_ID: Record<string, string> = Object.fromEntries(
  manifest.governanceRoutes.map((entry) => [entry.path, entry.sectionId])
);

export const GOVERNANCE_SECTION_ID_TO_PATH: Record<string, string> = {
  'commercial-engagement-policy': ROUTES.GOVERNANCE.COMMERCIAL_ENGAGEMENT_POLICY,
  'terms-of-use': ROUTES.GOVERNANCE.TERMS_OF_SERVICE,
  'privacy-policy': ROUTES.GOVERNANCE.PRIVACY_POLICY,
  'cookie-policy': ROUTES.GOVERNANCE.COOKIE_POLICY,
  'technology-services-disclaimer': ROUTES.GOVERNANCE.TECHNOLOGY_SERVICES_DISCLAIMER,
  'ai-usage-disclaimer': ROUTES.GOVERNANCE.AI_USAGE_DISCLAIMER,
  'intellectual-property-notice': ROUTES.GOVERNANCE.INTELLECTUAL_PROPERTY,
  'information-security-statement': ROUTES.GOVERNANCE.INFORMATION_SECURITY,
  'acceptable-use-policy': ROUTES.GOVERNANCE.ACCEPTABLE_USE_POLICY,
  'confidentiality-notice': ROUTES.GOVERNANCE.CONFIDENTIALITY,
};

export const PUBLIC_STATIC_ROUTES: readonly string[] = manifest.publicRoutes;
export const GOVERNANCE_STATIC_ROUTES: readonly string[] = manifest.governanceRoutes.map(
  (entry) => entry.path
);
export const PORTAL_STATIC_ROUTES: readonly string[] = manifest.portalStaticRoutes;
export const PORTAL_DYNAMIC_PREFIXES: readonly string[] = manifest.portalDynamicPrefixes;
export const ADMIN_STATIC_ROUTES: readonly string[] = manifest.adminStaticRoutes;

/**
 * All known static routes (excluding root `/`) that must have generated
 * `<route>/index.html` static entry files in `dist/` for GitHub Pages refresh safety.
 */
export const STATIC_ENTRY_ROUTES: readonly string[] = [
  ...PUBLIC_STATIC_ROUTES.filter((r) => r !== '/'),
  ...GOVERNANCE_STATIC_ROUTES,
  ...PORTAL_STATIC_ROUTES,
  ...ADMIN_STATIC_ROUTES,
];

/**
 * Public routes eligible for sitemap indexing (strictly excludes private portal & admin routes).
 */
export const PUBLIC_SITEMAP_ROUTES: readonly string[] = [
  ...PUBLIC_STATIC_ROUTES,
  ...GOVERNANCE_STATIC_ROUTES,
];

const RECOGNIZED_STATIC_ROUTE_SET = new Set<string>([
  ...PUBLIC_STATIC_ROUTES,
  ...GOVERNANCE_STATIC_ROUTES,
  ...PORTAL_STATIC_ROUTES,
  ...ADMIN_STATIC_ROUTES,
]);

export const PUBLIC_PORTAL_AUTH_ROUTES = new Set<string>([
  ROUTES.PORTAL.LOGIN,
  ROUTES.PORTAL.REGISTER,
  ROUTES.PORTAL.FORGOT_PASSWORD,
  ROUTES.PORTAL.RESET_PASSWORD,
  ROUTES.PORTAL.VERIFY_EMAIL,
]);

// ---------------------------------------------------------------------------
// Dynamic Route Builders (strict URI encoding, zero hash prefixes)
// ---------------------------------------------------------------------------

export function buildStoreItemRoute(slug: string): string {
  return `${ROUTES.PORTAL.STORE}/${encodeURIComponent(slug.trim())}`;
}

export function buildStoreSearchRoute(query: string): string {
  const trimmed = query.trim();
  return trimmed ? `${ROUTES.PORTAL.STORE}?q=${encodeURIComponent(trimmed)}` : ROUTES.PORTAL.STORE;
}

export function buildStoreInquireRoute(productName: string): string {
  return `${ROUTES.PORTAL.STORE}?inquire=${encodeURIComponent(productName.trim())}`;
}

export function buildOrderDetailRoute(orderId: string): string {
  return `${ROUTES.PORTAL.ORDERS}/${encodeURIComponent(orderId.trim())}`;
}

export function buildProjectDetailRoute(projectId: string): string {
  return `${ROUTES.PORTAL.PROJECTS}/${encodeURIComponent(projectId.trim())}`;
}

export function buildCheckoutWithProposalRoute(proposalId: string): string {
  return `${ROUTES.PORTAL.CHECKOUT}?proposalId=${encodeURIComponent(proposalId.trim())}`;
}

export function buildLoginWithNextRoute(nextPath?: string, reason?: string): string {
  const params = new URLSearchParams();
  if (nextPath && isSafeInternalPortalPath(nextPath) && !PUBLIC_PORTAL_AUTH_ROUTES.has(stripQueryAndHash(nextPath))) {
    params.set('next', nextPath);
  }
  if (reason) {
    params.set('reason', reason);
  }
  const qs = params.toString();
  return qs ? `${ROUTES.PORTAL.LOGIN}?${qs}` : ROUTES.PORTAL.LOGIN;
}

export function buildAdminLoginWithNextRoute(nextPath?: string): string {
  const params = new URLSearchParams();
  if (nextPath && isSafeInternalAdminPath(nextPath) && stripQueryAndHash(nextPath) !== ROUTES.ADMIN.LOGIN) {
    params.set('next', nextPath);
  }
  const qs = params.toString();
  return qs ? `${ROUTES.ADMIN.LOGIN}?${qs}` : ROUTES.ADMIN.LOGIN;
}

export function buildGovernanceRoute(sectionId?: string): string {
  if (!sectionId) return ROUTES.GOVERNANCE.ROOT;
  return GOVERNANCE_SECTION_ID_TO_PATH[sectionId] || ROUTES.GOVERNANCE.ROOT;
}

export function sectionIdToPublicRoute(sectionId: string): string {
  return PUBLIC_SECTION_ROUTE_MAP[sectionId] || ROUTES.HOME;
}

export function publicRouteToSectionId(pathname: string): string | null {
  const clean = normalizeRoutePathname(pathname);
  return PUBLIC_ROUTE_TO_SECTION_MAP[clean] ?? null;
}

export function buildCanonicalPublicUrl(routePath: string = ROUTES.HOME): string {
  const clean = normalizeRoutePathname(routePath);
  if (clean === ROUTES.HOME) return `${CANONICAL_ORIGIN}/`;
  return `${CANONICAL_ORIGIN}${clean}`;
}

// ---------------------------------------------------------------------------
// Path Normalization, Base Path & Security Validation
// ---------------------------------------------------------------------------

export interface LocationLike {
  hostname: string;
  pathname: string;
  search: string;
  hash: string;
}

export function resolveApplicationBasePath(hostname: string, pathname: string): string {
  if (
    hostname === GITHUB_PAGES_HOST &&
    (pathname === GITHUB_PAGES_REPO_PREFIX || pathname.startsWith(`${GITHUB_PAGES_REPO_PREFIX}/`))
  ) {
    return GITHUB_PAGES_REPO_PREFIX;
  }
  return '';
}

function stripQueryAndHash(target: string): string {
  return target.split(/[?#]/)[0] || '/';
}

/**
 * Normalizes a route pathname:
 * - ensures leading slash
 * - collapses duplicate slashes
 * - strips unnecessary trailing slash (except root `/`)
 * - lowercases static route segments while preserving dynamic identifier casing
 */
export function normalizeRoutePathname(rawPathname: string): string {
  if (!rawPathname || rawPathname === '/') return '/';
  let cleaned = rawPathname.replace(/\/{2,}/g, '/');
  if (!cleaned.startsWith('/')) cleaned = `/${cleaned}`;
  if (cleaned.length > 1 && cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }

  const lower = cleaned.toLowerCase();
  if (RECOGNIZED_STATIC_ROUTE_SET.has(lower)) {
    return lower;
  }

  for (const prefix of PORTAL_DYNAMIC_PREFIXES) {
    if (lower.startsWith(prefix) && cleaned.length > prefix.length) {
      const dynamicPart = cleaned.slice(prefix.length);
      return `${prefix}${dynamicPart}`;
    }
  }

  return cleaned;
}

export function isUnsafeRedirectTarget(rawTarget: string): boolean {
  if (!rawTarget) return true;
  if (/[\u0000-\u001F\u007F\\]/.test(rawTarget)) return true;
  if (rawTarget.startsWith('//') || rawTarget.includes('://')) return true;
  if (/^(javascript|data|vbscript|file):/i.test(rawTarget.trim())) return true;
  if (rawTarget.includes('..')) return true;
  return false;
}

/**
 * Checks whether a pathname matches an actually implemented static or dynamic
 * internal application route. Used to prevent open redirects and reject arbitrary
 * unknown hash fragments during legacy URL migration.
 */
export function isRecognizedInternalRoute(rawPathname: string): boolean {
  if (!rawPathname || isUnsafeRedirectTarget(rawPathname)) return false;
  const normalized = normalizeRoutePathname(rawPathname);
  if (RECOGNIZED_STATIC_ROUTE_SET.has(normalized)) return true;

  for (const prefix of PORTAL_DYNAMIC_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      const slugOrId = normalized.slice(prefix.length);
      if (slugOrId.length > 0 && !slugOrId.includes('/')) {
        return true;
      }
    }
  }

  return false;
}

export function isSafeInternalPortalPath(target: string | null | undefined): boolean {
  if (!target || isUnsafeRedirectTarget(target)) return false;
  const pathname = stripQueryAndHash(target);
  const normalized = normalizeRoutePathname(pathname);
  return (normalized === ROUTES.PORTAL.ROOT || normalized.startsWith(`${ROUTES.PORTAL.ROOT}/`)) &&
    isRecognizedInternalRoute(normalized);
}

export function isSafeInternalAdminPath(target: string | null | undefined): boolean {
  if (!target || isUnsafeRedirectTarget(target)) return false;
  const pathname = stripQueryAndHash(target);
  const normalized = normalizeRoutePathname(pathname);
  return (normalized === ROUTES.ADMIN.ROOT || normalized.startsWith(`${ROUTES.ADMIN.ROOT}/`)) &&
    isRecognizedInternalRoute(normalized);
}

export function resolveSafePostLoginPath(nextPath: string | null): string {
  if (
    nextPath &&
    isSafeInternalPortalPath(nextPath) &&
    !PUBLIC_PORTAL_AUTH_ROUTES.has(normalizeRoutePathname(stripQueryAndHash(nextPath)))
  ) {
    return nextPath;
  }
  return ROUTES.PORTAL.DASHBOARD;
}

export function resolveSafePostAdminLoginPath(nextPath: string | null): string {
  if (
    nextPath &&
    isSafeInternalAdminPath(nextPath) &&
    normalizeRoutePathname(stripQueryAndHash(nextPath)) !== ROUTES.ADMIN.LOGIN
  ) {
    return nextPath;
  }
  return ROUTES.ADMIN.DASHBOARD;
}

export function isPortalPathname(pathname: string): boolean {
  const normalized = normalizeRoutePathname(pathname);
  return normalized === ROUTES.PORTAL.ROOT || normalized.startsWith(`${ROUTES.PORTAL.ROOT}/`);
}

export function isAdminPathname(pathname: string): boolean {
  const normalized = normalizeRoutePathname(pathname);
  return normalized === ROUTES.ADMIN.ROOT || normalized.startsWith(`${ROUTES.ADMIN.ROOT}/`);
}

function mergeQueryStrings(baseSearch: string, extraSearch: string): string {
  const params = new URLSearchParams(baseSearch.startsWith('?') ? baseSearch.slice(1) : baseSearch);
  const extra = new URLSearchParams(extraSearch.startsWith('?') ? extraSearch.slice(1) : extraSearch);
  extra.forEach((value, key) => {
    if (!params.has(key)) {
      params.set(key, value);
    }
  });
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

/**
 * Checks whether a URL hash fragment is a legitimate authentication callback
 * (e.g., Supabase / OAuth `#access_token=...`, `#recovery_token=...`, `#error=...`)
 * that must NEVER be stripped or rewritten prior to authentication processing.
 */
export function isAuthCallbackHash(hash: string): boolean {
  if (!hash || !hash.startsWith('#')) return false;
  const body = hash.slice(1);
  if (body.startsWith('/')) return false;
  return /(^|&)(access_token|refresh_token|recovery_token|id_token|provider_token|token_type|type=recovery|type=signup|type=invite|type=magiclink|error|error_code)=/i.test(
    body
  );
}

/**
 * Resolves a clean canonical URL when visiting:
 * 1. Any recognized legacy hash-based application route (e.g. `#/portal/register`,
 *    `#/portal/login?next=...`, `#/portal/forgot-password`, `#/portal/verify-email?token=...`,
 *    `#/portal/reset-password?token=...`, `#/portal/dashboard`, `#/admin/login`, `#/about`).
 * 2. Recognized routes with unnecessary trailing slashes, duplicate slashes, or mixed casing
 *    (e.g., `/portal/register/`, `//portal//login`, `/Portal/Register`).
 *
 * Returns `null` when the URL is already canonical, or when the hash is a legitimate
 * in-page anchor (`#about`, `#services`) or authentication callback fragment
 * (`#access_token=...`, `#recovery_token=...`).
 */
export function resolveLegacyHashMigration(loc: LocationLike): string | null {
  const prefix = resolveApplicationBasePath(loc.hostname, loc.pathname);
  const hash = loc.hash || '';

  // 1. Controlled legacy hash-based route migration (`#/...`)
  if (hash.startsWith('#/') && !isAuthCallbackHash(hash)) {
    const rawHashRoute = hash.slice(1); // starts with '/'
    const qIndex = rawHashRoute.indexOf('?');
    const hashPathRaw = qIndex >= 0 ? rawHashRoute.slice(0, qIndex) : rawHashRoute;
    const hashSearch = qIndex >= 0 ? rawHashRoute.slice(qIndex) : '';

    if (!isUnsafeRedirectTarget(hashPathRaw) && isRecognizedInternalRoute(hashPathRaw)) {
      const canonicalPath = normalizeRoutePathname(hashPathRaw);
      const mergedSearch = mergeQueryStrings(loc.search, hashSearch);
      const fullTarget = `${prefix}${canonicalPath}${mergedSearch}`;
      const currentFull = `${loc.pathname}${loc.search}${loc.hash}`;
      return fullTarget === currentFull ? null : fullTarget;
    }
    return null;
  }

  // 2. Canonicalize trailing slashes, duplicate slashes, or uppercase segments on clean URLs
  const appPath =
    prefix && loc.pathname.startsWith(prefix)
      ? loc.pathname.slice(prefix.length) || '/'
      : loc.pathname || '/';

  if (appPath !== '/' && !isUnsafeRedirectTarget(appPath)) {
    const normalizedAppPath = normalizeRoutePathname(appPath);
    if (normalizedAppPath !== appPath && isRecognizedInternalRoute(normalizedAppPath)) {
      const targetPathname = `${prefix}${normalizedAppPath}`;
      const fullTarget = `${targetPathname}${loc.search}${hash}`;
      const currentFull = `${loc.pathname}${loc.search}${hash}`;
      return fullTarget === currentFull ? null : fullTarget;
    }
  }

  return null;
}

/**
 * Synchronously migrates recognized legacy hash routes (and non-canonical trailing slashes)
 * via `history.replaceState` before router initialization without adding history entries.
 */
export function migrateLegacyHashUrlBeforeBoot(): boolean {
  if (typeof window === 'undefined') return false;
  const canonicalUrl = resolveLegacyHashMigration(window.location);
  if (!canonicalUrl) return false;
  window.history.replaceState(null, '', canonicalUrl);
  return true;
}

/**
 * Removes sensitive callback query/hash parameters (`token`, `code`, `access_token`, etc.)
 * from the browser address bar AFTER the page has captured and processed them.
 */
export function scrubSensitiveAuthParamsFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const sensitiveKeys = [
    'token',
    'code',
    'access_token',
    'refresh_token',
    'recovery_token',
    'id_token',
    'token_hash',
  ];
  let changed = false;
  for (const key of sensitiveKeys) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (url.hash && isAuthCallbackHash(url.hash)) {
    url.hash = '';
    changed = true;
  }
  if (changed) {
    const cleanRelative = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(null, '', cleanRelative);
  }
}

export interface RouteSeoMeta {
  title: string;
  description: string;
  canonicalUrl: string;
  noIndex?: boolean;
}

export function getRouteSeoMeta(pathname: string): RouteSeoMeta {
  const clean = normalizeRoutePathname(pathname);

  if (isPortalPathname(clean)) {
    return {
      title: 'Client Portal | DESTRIA TECH INC (DESTRIA NETWORK)',
      description:
        'Authorized DESTRIA TECH INC Client Portal workspace for enterprise engagements, formal proposals, projects, and deliverables.',
      canonicalUrl: buildCanonicalPublicUrl(clean),
      noIndex: true,
    };
  }

  if (isAdminPathname(clean)) {
    return {
      title: 'Executive Administration | DESTRIA TECH INC',
      description: 'RBAC-protected DESTRIA TECH INC administrative operations console.',
      canonicalUrl: buildCanonicalPublicUrl(clean),
      noIndex: true,
    };
  }

  const governanceEntry = GOVERNANCE_ROUTE_ENTRIES.find((entry) => entry.path === clean);
  if (governanceEntry) {
    return {
      title: `${governanceEntry.title} | DESTRIA TECH INC`,
      description: `${governanceEntry.title} and corporate governance framework for DESTRIA TECH INC (Wyoming, USA).`,
      canonicalUrl: buildCanonicalPublicUrl(clean),
    };
  }

  switch (clean) {
    case ROUTES.ABOUT:
      return {
        title: 'About & Governance | DESTRIA TECH INC',
        description:
          'Corporate profile, Wyoming headquarters, executive leadership, and governance standards of DESTRIA TECH INC (DESTRIA NETWORK).',
        canonicalUrl: buildCanonicalPublicUrl(ROUTES.ABOUT),
      };
    case ROUTES.SOLUTIONS:
      return {
        title: 'Technology Solutions | DESTRIA TECH INC',
        description:
          'Customized enterprise AI systems, software engineering, cloud cybersecurity, blockchain infrastructure, and digital transformation solutions.',
        canonicalUrl: buildCanonicalPublicUrl(ROUTES.SOLUTIONS),
      };
    case ROUTES.PORTFOLIO:
      return {
        title: 'Portfolio & Blueprints | DESTRIA TECH INC',
        description:
          'Enterprise engineering architectures, creative multimedia pipelines, and digital transformation showcases by DESTRIA TECH INC.',
        canonicalUrl: buildCanonicalPublicUrl(ROUTES.PORTFOLIO),
      };
    case ROUTES.ENTERPRISE_SUITE:
      return {
        title: 'Enterprise Suite Architecture | DESTRIA TECH INC',
        description:
          'Explore the 8 integrated DESTRIA NETWORK enterprise pillars uniting software engineering, AI workforce systems, and client governance.',
        canonicalUrl: buildCanonicalPublicUrl(ROUTES.ENTERPRISE_SUITE),
      };
    case ROUTES.CONSULTATION:
    case ROUTES.CONTACT:
      return {
        title: 'Enterprise Consultation | DESTRIA TECH INC',
        description:
          'Request a customized enterprise technology consultation and formal project assessment with DESTRIA TECH INC.',
        canonicalUrl: buildCanonicalPublicUrl(clean),
      };
    default:
      return {
        title: 'DESTRIA TECH INC | Engineering Intelligent Solutions. Empowering Enterprise Transformation.',
        description:
          'DESTRIA TECH INC (DTI) & DESTRIA NETWORK is a Wyoming, USA technology corporation delivering customized enterprise software engineering, artificial intelligence systems, blockchain and Web3 infrastructure, cloud cybersecurity, digital modernization, and enterprise technology transformation.',
        canonicalUrl: buildCanonicalPublicUrl(ROUTES.HOME),
      };
  }
}
