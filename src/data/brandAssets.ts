/**
 * Centralized Official Brand Asset Registry — DESTRIA TECH INC (DTI)
 *
 * Single source of truth for all approved logo, favicon, manifest, document,
 * brand identity board, and email template brand URLs across DESTRIA NETWORK.
 *
 * All files in `public/branding/` are direct Lanczos-resized derivatives of the
 * official company master emblem (`Destria_Tech_Network_PNG_1fb4bee5.png`, 1254x1254)
 * with zero redesign, recoloring, or artwork alteration.
 */

const rawBaseUrl =
  typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL
    ? import.meta.env.BASE_URL
    : '/';

const normalizedBase = rawBaseUrl.endsWith('/') ? rawBaseUrl : `${rawBaseUrl}/`;

const configuredOrigin =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_PUBLIC_ORIGIN) ||
  (typeof process !== 'undefined' && process.env && process.env.PUBLIC_ORIGIN) ||
  '';

/**
 * Canonical public HTTPS origin for DESTRIA TECH INC.
 * Configurable via VITE_PUBLIC_ORIGIN / PUBLIC_ORIGIN once corporate domain is officially verified.
 * Remains empty string when unconfirmed to avoid publishing an unverified domain.
 */
export const CANONICAL_BRAND_ORIGIN = configuredOrigin.replace(/\/+$/, '');

export const BRAND_ASSETS = {
  /** Official 512x512 high-DPI circular emblem for all UI surfaces */
  primaryLogo: `${normalizedBase}branding/destria-logo-512.png`,
  /** Official 1024x1024 high-resolution asset for print documents & hero displays */
  highResLogo: `${normalizedBase}branding/destria-logo-1024.png`,
  /** Official 1254x1254 unmodified master emblem */
  masterLogo: `${normalizedBase}branding/destria-logo-master.png`,
  /** Official Destria Tech Inc Brand Identity Board */
  brandBoard: `${normalizedBase}branding/destria-brand-identity-board.png`,
  /** Official application & favicon icons */
  icon192: `${normalizedBase}branding/destria-logo-192.png`,
  icon512: `${normalizedBase}branding/destria-logo-512.png`,
  appleTouchIcon: `${normalizedBase}branding/apple-touch-icon.png`,
  favicon32: `${normalizedBase}branding/favicon-32x32.png`,
  favicon16: `${normalizedBase}branding/favicon-16x16.png`,
  faviconIco: `${normalizedBase}favicon.ico`,
  /** Hosted logo URLs (absolute when PUBLIC_ORIGIN / VITE_PUBLIC_ORIGIN is configured, else root-relative) */
  hostedPrimaryLogoUrl: CANONICAL_BRAND_ORIGIN
    ? `${CANONICAL_BRAND_ORIGIN}/branding/destria-logo-512.png`
    : '/branding/destria-logo-512.png',
  hostedHighResLogoUrl: CANONICAL_BRAND_ORIGIN
    ? `${CANONICAL_BRAND_ORIGIN}/branding/destria-logo-1024.png`
    : '/branding/destria-logo-1024.png',
  /** Standard descriptive alt text */
  altText: 'DESTRIA TECH INC (DTI) — DESTRIA NETWORK Official Emblem',
} as const;

/**
 * Resolves an absolute URL for the official logo suitable for standalone downloaded
 * HTML documents (invoices/receipts) so the logo loads reliably when opened locally.
 */
export function resolveAbsoluteLogoUrl(): string {
  if (typeof window !== 'undefined' && window.location && /^https?:$/i.test(window.location.protocol)) {
    const cleanPath = BRAND_ASSETS.primaryLogo.startsWith('/')
      ? BRAND_ASSETS.primaryLogo
      : `/${BRAND_ASSETS.primaryLogo.replace(/^\.\//, '')}`;
    return `${window.location.origin}${cleanPath}`;
  }
  return BRAND_ASSETS.hostedPrimaryLogoUrl;
}
