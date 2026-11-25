import { apiUrl, createIdempotencyKey } from '../lib/apiClient';

/**
 * Portal API Client
 *
 * Security Architecture (Phase 2 & Enterprise Stabilization):
 * - Primary session authentication uses a server-issued `HttpOnly`, `Secure`,
 *   `SameSite=None` cookie (`opm_portal_session`) sent automatically via
 *   `credentials: 'include'`.
 * - No session token is ever written to `localStorage` or `sessionStorage`,
 *   eliminating XSS session-exfiltration risk.
 * - An optional in-memory bearer token is kept only in JS memory (cleared on
 *   page unload or logout) as a fallback for environments that block
 *   cross-site cookies.
 * - All state-changing requests send `X-Requested-With: XMLHttpRequest` to
 *   enforce server-side CSRF protection on cookie-authenticated endpoints.
 * - All requests enforce an AbortController timeout so unresponsive backends
 *   never leave portal actions hanging indefinitely.
 */
let inMemoryToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;
const DEFAULT_PORTAL_TIMEOUT_MS = 20_000;

export function getPortalToken(): string | null {
  return inMemoryToken;
}

export function setPortalToken(token: string | null): void {
  inMemoryToken = token ? token.trim() : null;
}

export function setPortalUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export class PortalApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'PortalApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function portalRequest<T = any>(
  path: string,
  options?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    idempotencyKey?: string;
    idempotent?: boolean;
    skipAuth?: boolean;
    timeoutMs?: number;
  }
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...(options?.headers || {}),
  };

  if (options?.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options?.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  } else if (options?.idempotent) {
    headers['Idempotency-Key'] = createIdempotencyKey('portal');
  }

  if (!options?.skipAuth) {
    const token = getPortalToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const normalizedPath = path.startsWith('/api/portal')
    ? path
    : `/api/portal${path.startsWith('/') ? path : `/${path}`}`;

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_PORTAL_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(apiUrl(normalizedPath), {
      method: options?.method || 'GET',
      headers,
      credentials: 'include',
      signal: controller.signal,
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new PortalApiError(
        504,
        'The request timed out while contacting the DESTRIA TECH INC Client Portal server. Please try again.',
        'REQUEST_TIMEOUT'
      );
    }
    throw new PortalApiError(
      503,
      'Unable to connect to the DESTRIA TECH INC Client Portal API. Please verify your network connection and try again.',
      'NETWORK_UNAVAILABLE'
    );
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.success === false) {
    if (response.status === 401 && !options?.skipAuth) {
      setPortalToken(null);
      if (unauthorizedHandler) {
        try {
          unauthorizedHandler();
        } catch {
          // Ignore callback errors
        }
      }
    }
    throw new PortalApiError(
      response.status,
      data?.error || `Portal request failed (HTTP ${response.status})`,
      data?.code,
      data?.details
    );
  }

  return data as T;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',').pop() || '' : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}

export async function uploadPortalFile(
  file: File,
  options?: {
    projectId?: string;
    category?: 'brief' | 'reference' | 'message_attachment' | 'support_attachment';
  }
): Promise<{ success: boolean; file: any }> {
  const contentBase64 = await readFileAsBase64(file);
  return portalRequest<{ success: boolean; file: any }>('/files/upload', {
    method: 'POST',
    timeoutMs: 45_000,
    body: {
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      contentBase64,
      projectId: options?.projectId,
      category: options?.category || 'reference',
    },
  });
}

export async function triggerSignedFileDownload(fileId: string): Promise<void> {
  const res = await portalRequest<{ downloadUrl: string }>(
    `/files/${encodeURIComponent(fileId)}/sign`,
    { method: 'POST' }
  );
  if (!res.downloadUrl) {
    throw new PortalApiError(500, 'Signed download URL was not returned by the server.');
  }
  const fullUrl = apiUrl(res.downloadUrl);
  const anchor = document.createElement('a');
  anchor.href = fullUrl;
  anchor.rel = 'noopener noreferrer';
  anchor.download = '';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export function formatMinorCurrency(amountMinor: number, currency: 'USD' | 'PHP' | string): string {
  const amount = (amountMinor || 0) / 100;
  if (currency === 'PHP') {
    return `₱${amount.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPortalDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function formatPortalDateTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
