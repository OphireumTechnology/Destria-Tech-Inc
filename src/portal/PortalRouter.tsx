import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ROUTES,
  isPortalPathname,
  migrateLegacyHashUrlBeforeBoot,
  normalizeRoutePathname,
  resolveApplicationBasePath,
  resolveLegacyHashMigration,
  type LocationLike,
} from '../config/routes';

interface PortalRouterContextValue {
  path: string;
  query: URLSearchParams;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  exitToPublicSite: () => void;
}

const PortalRouterContext = createContext<PortalRouterContextValue | null>(null);

export type PortalLocationLike = LocationLike;

export function resolveGitHubPagesRepoPrefix(hostname: string, pathname: string): string {
  return resolveApplicationBasePath(hostname, pathname);
}

export function isLoginTargetPath(target: string): boolean {
  const [pathname] = target.split('?');
  return normalizeRoutePathname(pathname) === ROUTES.PORTAL.LOGIN;
}

/**
 * Resolves a clean canonical URL for recognized legacy hash URLs (including
 * `#/portal/login`, `#/portal/register`, `#/portal/forgot-password`,
 * `#/portal/reset-password`, `#/portal/verify-email`, etc.) and trailing slashes.
 * Preserves query parameters and never alters OAuth/recovery/anchor hashes.
 */
export function resolveCanonicalPortalLoginUrl(loc: PortalLocationLike): string | null {
  return resolveLegacyHashMigration(loc);
}

export function canonicalizePortalLoginUrl(): boolean {
  return migrateLegacyHashUrlBeforeBoot();
}

export function getCurrentPortalLocation(): { pathname: string; search: string } {
  if (typeof window === 'undefined') return { pathname: ROUTES.HOME, search: '' };
  const prefix = resolveApplicationBasePath(window.location.hostname, window.location.pathname);
  const rawPathname = window.location.pathname;
  const stripped =
    prefix && rawPathname.startsWith(prefix) ? rawPathname.slice(prefix.length) || '/' : rawPathname;
  return {
    pathname: normalizeRoutePathname(stripped),
    search: window.location.search,
  };
}

export function isPortalRoute(pathname?: string): boolean {
  const target = pathname ?? getCurrentPortalLocation().pathname;
  return isPortalPathname(target);
}

/**
 * Clean history-based portal navigation helper (never generates hash URLs).
 */
export function navigateToPortalPath(to: string, replace = false): void {
  if (typeof window === 'undefined') return;
  const cleanTarget = to.startsWith('/') ? to : `/${to}`;
  const [rawPath, rawSearch = ''] = cleanTarget.split('?');
  const normalizedPath = normalizeRoutePathname(rawPath);
  const prefix = resolveApplicationBasePath(window.location.hostname, window.location.pathname);
  const nextUrl = `${prefix}${normalizedPath}${rawSearch ? `?${rawSearch}` : ''}`;

  if (replace) {
    window.history.replaceState(null, '', nextUrl);
  } else {
    window.history.pushState(null, '', nextUrl);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export const PortalRouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const rrNavigate = useNavigate();

  useEffect(() => {
    const migrated = migrateLegacyHashUrlBeforeBoot();
    if (migrated && typeof window !== 'undefined') {
      const current = getCurrentPortalLocation();
      rrNavigate(`${current.pathname}${current.search}`, { replace: true });
    }
  }, [location.pathname, location.search, location.hash, rrNavigate]);

  const normalizedPath = useMemo(
    () => normalizeRoutePathname(location.pathname),
    [location.pathname]
  );

  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const navigate = useCallback(
    (to: string, options?: { replace?: boolean }) => {
      const cleanTarget = to.startsWith('/') ? to : `/${to}`;
      const [rawPath, rawSearch = ''] = cleanTarget.split('?');
      const normalized = normalizeRoutePathname(rawPath);
      const targetUrl = rawSearch ? `${normalized}?${rawSearch}` : normalized;
      rrNavigate(targetUrl, { replace: Boolean(options?.replace) });
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    },
    [rrNavigate]
  );

  const exitToPublicSite = useCallback(() => {
    rrNavigate(ROUTES.HOME);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [rrNavigate]);

  return (
    <PortalRouterContext.Provider
      value={{
        path: normalizedPath,
        query,
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
