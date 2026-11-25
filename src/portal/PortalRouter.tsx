import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface PortalRouterContextValue {
  path: string;
  query: URLSearchParams;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  exitToPublicSite: () => void;
}

const PortalRouterContext = createContext<PortalRouterContextValue | null>(null);

export interface PortalLocationLike {
  hostname: string;
  pathname: string;
  search: string;
  hash: string;
}

const GITHUB_PAGES_REPO_PREFIX = '/Destria-Tech-Inc';

export function resolveGitHubPagesRepoPrefix(hostname: string, pathname: string): string {
  if (
    hostname === 'ophireumtechnology.github.io' &&
    (pathname === GITHUB_PAGES_REPO_PREFIX || pathname.startsWith(`${GITHUB_PAGES_REPO_PREFIX}/`))
  ) {
    return GITHUB_PAGES_REPO_PREFIX;
  }
  return '';
}

export function isLoginTargetPath(target: string): boolean {
  const [pathname] = target.split('?');
  return pathname === '/portal/login' || pathname === '/portal/login/';
}

function normalizeLoginTarget(target: string): string {
  const [pathname, search = ''] = target.split('?');
  const cleanPath = pathname === '/portal/login/' ? '/portal/login' : pathname;
  return search ? `${cleanPath}?${search}` : cleanPath;
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
 * Resolves a clean canonical `/portal/login` URL when visiting legacy hash login URLs
 * (`#/portal/login`, `#/portal/login?next=...`) or trailing-slash `/portal/login/`.
 * Preserves query parameters and never alters non-portal hashes (e.g. `#access_token=...`, `#about`)
 * or other portal routes (`#/portal/verify-email?token=...`).
 */
export function resolveCanonicalPortalLoginUrl(loc: PortalLocationLike): string | null {
  const prefix = resolveGitHubPagesRepoPrefix(loc.hostname, loc.pathname);
  const hash = loc.hash || '';

  if (hash.startsWith('#/portal/login')) {
    const remainder = hash.slice('#/portal/login'.length);
    if (remainder === '' || remainder === '/' || remainder.startsWith('?') || remainder.startsWith('/?')) {
      const qIndex = remainder.indexOf('?');
      const hashSearch = qIndex >= 0 ? remainder.slice(qIndex) : '';
      const mergedSearch = mergeQueryStrings(loc.search, hashSearch);
      return `${prefix}/portal/login${mergedSearch}`;
    }
  }

  if (loc.pathname === `${prefix}/portal/login/`) {
    return `${prefix}/portal/login${loc.search}${hash}`;
  }

  return null;
}

export function canonicalizePortalLoginUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const canonicalUrl = resolveCanonicalPortalLoginUrl(window.location);
  if (!canonicalUrl) return false;
  window.history.replaceState(null, '', canonicalUrl);
  return true;
}

export function getCurrentPortalLocation(): { pathname: string; search: string } {
  if (typeof window === 'undefined') return { pathname: '/', search: '' };
  // Support hash fallback (#/portal/...) for static GitHub Pages deployments
  const hash = window.location.hash || '';
  if (hash.startsWith('#/portal')) {
    const clean = hash.slice(1);
    const [p, s = ''] = clean.split('?');
    return { pathname: p, search: s ? `?${s}` : '' };
  }
  const prefix = resolveGitHubPagesRepoPrefix(window.location.hostname, window.location.pathname);
  const rawPathname = window.location.pathname;
  const pathname =
    prefix && rawPathname.startsWith(`${prefix}/portal`)
      ? rawPathname.slice(prefix.length)
      : rawPathname;
  return { pathname, search: window.location.search };
}

export function isPortalRoute(pathname?: string): boolean {
  const target = pathname ?? getCurrentPortalLocation().pathname;
  return target === '/portal' || target.startsWith('/portal/');
}

export function navigateToPortalPath(to: string, replace = false) {
  if (typeof window === 'undefined') return;
  const cleanTarget = to.startsWith('/') ? to : `/${to}`;
  const prefix = resolveGitHubPagesRepoPrefix(window.location.hostname, window.location.pathname);
  const isStaticPagesHost =
    window.location.hostname.endsWith('github.io') ||
    ['destriatech.com', 'www.destriatech.com'].includes(window.location.hostname) ||
    (window.location.pathname.includes('/OMPNETWORK/') && !cleanTarget.startsWith('/OMPNETWORK'));

  if (isLoginTargetPath(cleanTarget)) {
    const nextUrl = `${prefix}${normalizeLoginTarget(cleanTarget)}`;
    if (replace) window.history.replaceState(null, '', nextUrl);
    else window.history.pushState(null, '', nextUrl);
  } else if (isStaticPagesHost && cleanTarget.startsWith('/portal')) {
    const nextUrl = `${prefix}/#${cleanTarget}`;
    if (replace) window.history.replaceState(null, '', nextUrl);
    else window.history.pushState(null, '', nextUrl);
  } else {
    const nextUrl = `${prefix}${cleanTarget}`;
    if (replace) window.history.replaceState(null, '', nextUrl);
    else window.history.pushState(null, '', nextUrl);
  }
  window.dispatchEvent(new Event('opm:routechange'));
}

export const PortalRouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loc, setLoc] = useState(getCurrentPortalLocation);

  useEffect(() => {
    const sync = () => {
      canonicalizePortalLoginUrl();
      setLoc(getCurrentPortalLocation());
    };
    sync();
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    window.addEventListener('opm:routechange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('opm:routechange', sync);
    };
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    navigateToPortalPath(to, Boolean(options?.replace));
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const exitToPublicSite = useCallback(() => {
    if (typeof window === 'undefined') return;
    const prefix = resolveGitHubPagesRepoPrefix(window.location.hostname, window.location.pathname);
    window.history.pushState(null, '', `${prefix}/`);
    window.dispatchEvent(new Event('opm:routechange'));
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  return (
    <PortalRouterContext.Provider
      value={{
        path: loc.pathname,
        query: new URLSearchParams(loc.search),
        navigate,
        exitToPublicSite,
      }}
    >
      {children}
    </PortalRouterContext.Provider>
  );
};

export function usePortalRouter(): PortalRouterContextValue {
  const ctx = useContext(PortalRouterContext);
  if (!ctx) {
    throw new Error('usePortalRouter must be used inside PortalRouterProvider');
  }
  return ctx;
}
