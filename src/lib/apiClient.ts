export const PRODUCTION_RAILWAY_API_URL = 'https://api.destriatech.com';
export const API_COMPATIBILITY_VERSION = '2026.11-dti-v2';

const STATIC_FRONTEND_HOSTNAMES = new Set([
  'destriatech.com',
  'www.destriatech.com',
  'ophireumtechnology.github.io',
]);

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export interface ApiConfigurationValidation {
  valid: boolean;
  baseUrl: string;
  mode: 'same_origin' | 'remote_api';
  issues: string[];
}

function isLocalHostname(hostname: string): boolean {
  const clean = hostname.trim().toLowerCase();
  return LOCAL_HOSTNAMES.has(clean) || clean.endsWith('.local');
}

/**
 * Sanitizes and normalizes an API base URL (removes trailing slashes and trailing `/api`
 * duplication, rejects non-http(s) schemes and embedded credentials).
 */
export function normalizeApiBaseUrl(raw?: string | null): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) return '';
    // Strip trailing slashes and a trailing `/api` path suffix so `buildApiUrl('/api/...')` never produces `/api/api/...`
    let cleanedPath = parsed.pathname.replace(/\/+$/, '');
    if (cleanedPath.toLowerCase() === '/api') {
      cleanedPath = '';
    }
    return `${parsed.protocol}//${parsed.host}${cleanedPath}`;
  } catch {
    return '';
  }
}

/**
 * Resolves the API base URL for browser and test environments:
 * 1. Explicit VITE_API_BASE_URL build-time override wins (unless pointing to localhost on a public production domain).
 * 2. Local development (localhost / 127.0.0.1) uses relative `/api/*` against local Express + Vite server.
 * 3. Static GitHub Pages origins automatically target the dedicated DESTRIA TECH INC backend API.
 * 4. Same-origin deployments (e.g., running directly on Railway or AI Studio preview) use relative `/api/*`.
 */
export function resolveApiBaseUrl(options?: {
  envBaseUrl?: string;
  hostname?: string;
  protocol?: string;
}): string {
  const host = (
    options?.hostname !== undefined
      ? options.hostname
      : typeof window !== 'undefined'
        ? window.location.hostname
        : ''
  )
    .trim()
    .toLowerCase();

  const pageProtocol = (
    options?.protocol !== undefined
      ? options.protocol
      : typeof window !== 'undefined'
        ? window.location.protocol
        : ''
  )
    .trim()
    .toLowerCase();

  const rawEnv =
    options?.envBaseUrl !== undefined
      ? options.envBaseUrl
      : (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL;
  const envUrl = normalizeApiBaseUrl(rawEnv);

  if (envUrl) {
    try {
      const parsed = new URL(envUrl);
      const isPublicProductionSite = STATIC_FRONTEND_HOSTNAMES.has(host);
      // Reject localhost API targets accidentally baked into a public production frontend
      if (isPublicProductionSite && isLocalHostname(parsed.hostname)) {
        return PRODUCTION_RAILWAY_API_URL;
      }
      // Enforce HTTPS when loaded on an HTTPS public origin
      if (pageProtocol === 'https:' && parsed.protocol === 'http:' && !isLocalHostname(parsed.hostname)) {
        parsed.protocol = 'https:';
        return parsed.toString().replace(/\/+$/, '');
      }
      return envUrl;
    } catch {
      // Fall through to host-based resolution
    }
  }

  if (!host || isLocalHostname(host)) {
    return '';
  }

  if (STATIC_FRONTEND_HOSTNAMES.has(host)) {
    return PRODUCTION_RAILWAY_API_URL;
  }

  return '';
}

/**
 * Validates the effective frontend API configuration and reports actionable operational issues
 * (e.g. invalid URL scheme, localhost target on production domain, insecure HTTP on HTTPS page).
 */
export function validateApiConfiguration(options?: {
  envBaseUrl?: string;
  hostname?: string;
  protocol?: string;
}): ApiConfigurationValidation {
  const issues: string[] = [];
  const rawEnv =
    options?.envBaseUrl !== undefined
      ? options.envBaseUrl
      : (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL;
  const host = (
    options?.hostname !== undefined
      ? options.hostname
      : typeof window !== 'undefined'
        ? window.location.hostname
        : ''
  )
    .trim()
    .toLowerCase();
  const protocol = (
    options?.protocol !== undefined
      ? options.protocol
      : typeof window !== 'undefined'
        ? window.location.protocol
        : ''
  )
    .trim()
    .toLowerCase();

  if (rawEnv && rawEnv.trim()) {
    const normalized = normalizeApiBaseUrl(rawEnv);
    if (!normalized) {
      issues.push('VITE_API_BASE_URL is malformed or uses an unsupported scheme.');
    } else {
      try {
        const parsed = new URL(normalized);
        if (STATIC_FRONTEND_HOSTNAMES.has(host) && isLocalHostname(parsed.hostname)) {
          issues.push('Production frontend cannot target a localhost API base URL.');
        }
        if (protocol === 'https:' && parsed.protocol === 'http:' && !isLocalHostname(parsed.hostname)) {
          issues.push('Insecure HTTP API URL configured on an HTTPS origin; HTTPS is required.');
        }
      } catch {
        issues.push('VITE_API_BASE_URL could not be parsed as a valid URL.');
      }
    }
  }

  const baseUrl = resolveApiBaseUrl(options);
  return {
    valid: issues.length === 0,
    baseUrl,
    mode: baseUrl ? 'remote_api' : 'same_origin',
    issues,
  };
}

/**
 * Builds an absolute or relative API endpoint URL safely, preventing duplicate `/api/api` segments.
 */
export function buildApiUrl(path: string, baseUrl?: string): string {
  const trimmedPath = (path || '/').trim();
  const normalizedPath = (trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`).replace(
    /^\/api\/api(?=\/|$)/i,
    '/api'
  );
  const resolvedBase =
    baseUrl !== undefined ? normalizeApiBaseUrl(baseUrl) : resolveApiBaseUrl();
  if (!resolvedBase) return normalizedPath;
  if (resolvedBase.toLowerCase().endsWith('/api') && normalizedPath.toLowerCase().startsWith('/api')) {
    return `${resolvedBase}${normalizedPath.slice(4)}`;
  }
  return `${resolvedBase}${normalizedPath}`;
}

/**
 * Builds a validated WebSocket URL (`ws:` or `wss:`), enforcing `wss:` whenever the API base
 * or browser origin uses HTTPS and preventing duplicate `/api/api` segments.
 */
export function buildWebSocketUrl(
  wsPath: string,
  options?: { baseUrl?: string; locationHost?: string; locationProtocol?: string }
): string {
  const normalizedPath = (wsPath.startsWith('/') ? wsPath : `/${wsPath}`).replace(
    /^\/api\/api(?=\/|$)/i,
    '/api'
  );
  const resolvedBase =
    options?.baseUrl !== undefined ? normalizeApiBaseUrl(options.baseUrl) : resolveApiBaseUrl();

  if (resolvedBase) {
    try {
      const parsed = new URL(resolvedBase);
      const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      const basePath = parsed.pathname.replace(/\/+$/, '');
      return `${wsProto}//${parsed.host}${basePath}${normalizedPath}`;
    } catch {
      return '';
    }
  }

  const locHost =
    options?.locationHost !== undefined
      ? options.locationHost
      : typeof window !== 'undefined'
        ? window.location?.host || ''
        : '';
  if (!locHost) return '';

  const locProto = (
    options?.locationProtocol !== undefined
      ? options.locationProtocol
      : typeof window !== 'undefined'
        ? window.location?.protocol || 'http:'
        : 'http:'
  ).toLowerCase();
  const wsProto = locProto === 'https:' ? 'wss:' : 'ws:';
  return `${wsProto}//${locHost}${normalizedPath}`;
}

export function apiUrl(path: string): string {
  return buildApiUrl(path);
}

/**
 * Performs a fetch against the configured API origin with standardized JSON error handling,
 * compatibility version header, and bounded timeout.
 */
export async function apiFetchJson<T = unknown>(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<{ ok: boolean; status: number; data: T }> {
  const timeoutMs = init?.timeoutMs ?? 20_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const mergedHeaders = new Headers(init?.headers || {});
    if (!mergedHeaders.has('X-API-Compatibility-Version')) {
      mergedHeaders.set('X-API-Compatibility-Version', API_COMPATIBILITY_VERSION);
    }

    const response = await fetch(apiUrl(path), {
      ...init,
      headers: mergedHeaders,
      signal: init?.signal || controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as T;
    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function createIdempotencyKey(prefix = 'dti'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
