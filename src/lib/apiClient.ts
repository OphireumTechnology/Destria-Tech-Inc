export const PRODUCTION_RAILWAY_API_URL = 'https://api.destriatech.com';

const STATIC_FRONTEND_HOSTNAMES = new Set([
  'destriatech.com',
  'www.destriatech.com',
  'ophireumtechnology.github.io',
]);

/**
 * Sanitizes and normalizes an API base URL (removes trailing slashes, rejects non-http(s) schemes).
 */
export function normalizeApiBaseUrl(raw?: string | null): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) return '';
  return trimmed.replace(/\/+$/, '');
}

/**
 * Resolves the API base URL for browser and test environments:
 * 1. Explicit VITE_API_BASE_URL build-time override always wins.
 * 2. Local development (localhost / 127.0.0.1) uses relative `/api/*` against local Express + Vite server.
 * 3. Static GitHub Pages origins automatically target the dedicated DESTRIA TECH INC backend API.
 * 4. Same-origin deployments (e.g., running directly on Railway or AI Studio preview) use relative `/api/*`.
 */
export function resolveApiBaseUrl(options?: {
  envBaseUrl?: string;
  hostname?: string;
}): string {
  const envUrl = normalizeApiBaseUrl(
    options?.envBaseUrl !== undefined
      ? options.envBaseUrl
      : (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL
  );
  if (envUrl) return envUrl;

  const host = (
    options?.hostname !== undefined
      ? options.hostname
      : typeof window !== 'undefined'
        ? window.location.hostname
        : ''
  )
    .trim()
    .toLowerCase();

  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return '';
  }

  if (STATIC_FRONTEND_HOSTNAMES.has(host)) {
    return PRODUCTION_RAILWAY_API_URL;
  }

  return '';
}

/**
 * Builds an absolute or relative API endpoint URL safely.
 */
export function buildApiUrl(path: string, baseUrl?: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const resolvedBase =
    baseUrl !== undefined ? normalizeApiBaseUrl(baseUrl) : resolveApiBaseUrl();
  return resolvedBase ? `${resolvedBase}${normalizedPath}` : normalizedPath;
}

export function apiUrl(path: string): string {
  return buildApiUrl(path);
}

/**
 * Performs a fetch against the configured API origin with standardized JSON error handling and timeout.
 */
export async function apiFetchJson<T = unknown>(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<{ ok: boolean; status: number; data: T }> {
  const timeoutMs = init?.timeoutMs ?? 20_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(apiUrl(path), {
      ...init,
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
