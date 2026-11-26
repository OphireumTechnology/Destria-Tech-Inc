import crypto from 'crypto';
import express, { NextFunction, Request, Response, Router } from 'express';
import {
  OrderStatus,
  PaymentProviderId,
  PortalCurrency,
  PortalRepository,
  PortalUserRecord,
  ProductRecord,
  SupportTicketCategory,
  USD_TO_PHP_REFERENCE_RATE,
  formatMinorMoney,
  usdToPhpMinor,
} from './types';
import { PaymentGatewayRegistry } from './payments/paymentAdapters';
import { logStructured } from '../logger';
import {
  corporateIdentity,
  COMMERCIAL_ENGAGEMENT_STATEMENT,
  CORPORATE_SERVICE_STATEMENT,
} from '../../data/companyConfig';
import {
  classifyCommercialPolicyIntent,
  enforceCommercialPolicyOnOutput,
} from '../aiCommercialPolicy';
import { ROUTES, buildCanonicalPublicUrl, buildOrderDetailRoute } from '../../config/routes';
import type { TransactionalEmailService } from '../services/emailService';
import type { FrontDeskStore } from '../frontDeskStore';
import { FrontDeskPersistenceUnavailableError } from '../frontDeskRepository';

function sanitizeProductForPublicCatalog(product: ProductRecord) {
  return {
    ...product,
    engagementLabel: 'Customized Enterprise Solution',
    assessmentBasis: 'Subject to Formal Assessment',
    proposalRequired: true,
    packages: product.packages.map((pkg) => ({
      id: pkg.id,
      productId: pkg.productId,
      name: pkg.name,
      tierCode: pkg.tierCode,
      isCustomQuote: true,
      engagementLabel: 'Customized Enterprise Solution',
      assessmentBasis: 'Subject to Formal Assessment',
      proposalRequired: true,
      billingType: pkg.billingType,
      creditsIncluded: pkg.creditsIncluded,
      turnaroundLabel: pkg.turnaroundLabel,
      validityDays: pkg.validityDays,
      revisionLimit: pkg.revisionLimit,
      usageLimits: pkg.usageLimits,
      deliveryConditions: pkg.deliveryConditions,
      supportLevel: pkg.supportLevel,
      features: pkg.features,
      isPopular: pkg.isPopular,
    })),
  };
}

export interface PortalAuthenticatedRequest extends Request {
  portalUser?: PortalUserRecord;
  portalSessionTokenHash?: string;
}

const ALLOWED_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'mp4',
  'mov',
  'pdf',
  'docx',
  'xlsx',
  'pptx',
  'zip',
]);

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream', // allowed ONLY when extension is strictly in ALLOWED_EXTENSIONS
]);

const SUPPORT_CATEGORIES: SupportTicketCategory[] = [
  'Account Access',
  'Orders',
  'Payments',
  'Billing',
  'Project Status',
  'Technical Support',
  'Service Inquiry',
  'Refund Request',
  'Other',
];

const PAYMENT_PROVIDERS: PaymentProviderId[] = [
  'credit_card',
  'debit_card',
  'paypal',
  'xendit',
  'maya',
  'paymongo',
  'gotyme',
];

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB per file in JSON base64 payload

/**
 * Server-side magic-byte signature verification.
 * Rejects spoofed executables/scripts (PE MZ, ELF, Mach-O, shebang, PHP/HTML script tags)
 * and verifies file content headers match the declared extension.
 */
export function validateUploadedFileSignature(
  ext: string,
  buffer: Buffer
): { ok: true } | { ok: false; reason: string } {
  if (buffer.length < 4) {
    return { ok: false, reason: 'Uploaded file is too small or corrupted.' };
  }

  // Reject executable & script payloads regardless of extension
  const startsWithMz = buffer[0] === 0x4d && buffer[1] === 0x5a; // Windows PE/EXE/DLL
  const startsWithElf =
    buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46; // Linux ELF
  const startsWithShebang = buffer[0] === 0x23 && buffer[1] === 0x21; // #! script
  const headText = buffer.subarray(0, Math.min(buffer.length, 256)).toString('utf8').trimStart().toLowerCase();
  const containsDangerousMarkup =
    headText.startsWith('<!doctype html') ||
    headText.startsWith('<html') ||
    headText.startsWith('<script') ||
    headText.startsWith('<?php') ||
    headText.startsWith('<svg');

  if (startsWithMz || startsWithElf || startsWithShebang || containsDangerousMarkup) {
    return {
      ok: false,
      reason: 'File rejected: executable binary or active script content is prohibited.',
    };
  }

  switch (ext) {
    case 'pdf':
      if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return { ok: true };
      return { ok: false, reason: 'File signature does not match PDF format (%PDF-).' };
    case 'png':
      if (
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
      ) {
        return { ok: true };
      }
      return { ok: false, reason: 'File signature does not match PNG format.' };
    case 'jpg':
    case 'jpeg':
      if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ok: true };
      return { ok: false, reason: 'File signature does not match JPEG format.' };
    case 'webp':
      if (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      ) {
        return { ok: true };
      }
      return { ok: false, reason: 'File signature does not match WEBP format.' };
    case 'zip':
    case 'docx':
    case 'xlsx':
    case 'pptx':
      if (buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)) {
        return { ok: true };
      }
      return { ok: false, reason: `File signature does not match OOXML/ZIP archive format (.${ext}).` };
    case 'mp4':
    case 'mov':
      if (buffer.length >= 8 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
        return { ok: true };
      }
      return { ok: false, reason: `File signature does not match ISO media container (.${ext}).` };
    default:
      return { ok: false, reason: `Unsupported file extension (.${ext}).` };
  }
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash?: string): boolean {
  if (!storedHash || !storedHash.startsWith('scrypt:')) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const [, salt, expectedHex] = parts;
  const actualBuf = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

function sanitizeText(val: unknown, maxLen = 500): string {
  if (typeof val !== 'string') return '';
  return val.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLen);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

class BoundedRateLimiter {
  private readonly buckets = new Map<string, number[]>();
  constructor(private readonly windowMs: number, private readonly maxHits: number, private readonly maxKeys = 5000) {}

  allow(key: string): boolean {
    const now = Date.now();
    const recent = (this.buckets.get(key) || []).filter((ts) => now - ts < this.windowMs);
    if (recent.length >= this.maxHits) {
      this.buckets.set(key, recent);
      return false;
    }
    recent.push(now);
    this.buckets.set(key, recent);
    if (this.buckets.size > this.maxKeys) {
      const oldest = this.buckets.keys().next().value;
      if (oldest) this.buckets.delete(oldest);
    }
    return true;
  }
}

const PORTAL_SESSION_COOKIE = 'opm_portal_session';

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (key) result[key] = decodeURIComponent(val);
  }
  return result;
}

function setPortalSessionCookie(res: Response, rawToken: string): void {
  const attributes = [
    `${PORTAL_SESSION_COOKIE}=${encodeURIComponent(rawToken)}`,
    'HttpOnly',
    'Path=/api/portal',
    'SameSite=None',
    'Secure',
    'Partitioned',
    `Max-Age=${7 * 24 * 60 * 60}`,
  ];
  res.setHeader('Set-Cookie', attributes.join('; '));
}

function clearPortalSessionCookie(res: Response): void {
  const attributes = [
    `${PORTAL_SESSION_COOKIE}=`,
    'HttpOnly',
    'Path=/api/portal',
    'SameSite=None',
    'Secure',
    'Partitioned',
    'Max-Age=0',
  ];
  res.setHeader('Set-Cookie', attributes.join('; '));
}

export function createPortalRouter(options: {
  repo: PortalRepository;
  paymentRegistry?: PaymentGatewayRegistry;
  signingSecret?: string;
  emailService?: TransactionalEmailService;
  frontDeskStore?: FrontDeskStore;
}): Router {
  const router = Router();
  const repo = options.repo;
  const emailService = options.emailService;
  const frontDeskStore = options.frontDeskStore;
  const paymentRegistry = options.paymentRegistry || new PaymentGatewayRegistry();

  // Fail closed when durable production persistence is unconfigured
  router.use((_req: Request, res: Response, next: NextFunction) => {
    if (repo.mode === 'unconfigured') {
      res.status(503).json({
        success: false,
        code: 'DATABASE_UNAVAILABLE',
        error:
          'Client Portal durable persistence is not configured on this server. Production in-memory fallback is disabled.',
      });
      return;
    }
    next();
  });

  const configuredSigningSecret = (
    options.signingSecret ||
    process.env.PORTAL_SIGNING_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    ''
  ).trim();
  const isProd = process.env.NODE_ENV === 'production';
  const hasStrongSigningSecret = configuredSigningSecret.length >= 32;
  if (isProd && !hasStrongSigningSecret) {
    logStructured('warn', 'portal_signing_secret_missing_in_production', {
      message: 'PORTAL_SIGNING_SECRET (32+ chars) is required in production for signed file downloads.',
    });
  }
  const signingSecret = configuredSigningSecret || crypto.randomBytes(32).toString('hex');

  const isDevHelperEnabled = !isProd;
  const authLimiter = new BoundedRateLimiter(15 * 60 * 1000, 30);
  const writeLimiter = new BoundedRateLimiter(15 * 60 * 1000, 120);

  function signDownloadUrlToken(fileId: string, userId: string, expUnix: number): string {
    return crypto
      .createHmac('sha256', signingSecret)
      .update(`${fileId}:${userId}:${expUnix}`, 'utf8')
      .digest('hex');
  }

  function verifyDownloadUrlToken(fileId: string, userId: string, expUnix: number, sig: string): boolean {
    if (isProd && !hasStrongSigningSecret) return false;
    if (!Number.isFinite(expUnix) || expUnix < Math.floor(Date.now() / 1000)) return false;
    const expected = signDownloadUrlToken(fileId, userId, expUnix);
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(sig, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  async function verifyOwnedAttachmentIds(userId: string, attachmentIds: string[]): Promise<boolean> {
    if (attachmentIds.length === 0) return true;
    const owned = await repo.listAttachments(userId);
    const ownedSet = new Set(owned.map((a) => a.id));
    return attachmentIds.every((id) => ownedSet.has(id));
  }

  function isCsrfSafeForCookieAuth(req: Request): boolean {
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method.toUpperCase())) {
      return true;
    }
    const xrw = String(req.headers['x-requested-with'] || '').trim();
    if (xrw === 'XMLHttpRequest' || xrw === 'fetch') {
      return true;
    }
    const origin = String(req.headers.origin || '').trim().replace(/\/$/, '');
    if (!origin) return false;
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
    if (host && (origin === `https://${host}` || origin === `http://${host}`)) {
      return true;
    }
    const allowed = (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean);
    return allowed.includes(origin);
  }

  async function requirePortalClient(req: PortalAuthenticatedRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization || '';
    let rawToken = '';
    let authSource: 'bearer' | 'cookie' | null = null;

    if (authHeader.startsWith('Bearer ')) {
      rawToken = authHeader.slice(7).trim();
      if (rawToken) authSource = 'bearer';
    }
    if (!rawToken) {
      const cookies = parseCookies(req.headers.cookie);
      if (cookies[PORTAL_SESSION_COOKIE]) {
        rawToken = cookies[PORTAL_SESSION_COOKIE].trim();
        if (rawToken) authSource = 'cookie';
      }
    }

    if (!rawToken || !authSource) {
      res.status(401).json({ success: false, code: 'UNAUTHORIZED', error: 'Authentication required. Please sign in to the Client Portal.' });
      return;
    }

    if (authSource === 'cookie' && !isCsrfSafeForCookieAuth(req)) {
      res.status(403).json({
        success: false,
        code: 'CSRF_CHECK_FAILED',
        error: 'State-changing cookie request failed CSRF validation.',
      });
      return;
    }

    const tokenHash = sha256Hex(rawToken);
    const session = await repo.findActiveSessionByTokenHash(tokenHash);
    if (!session) {
      res.status(401).json({ success: false, code: 'SESSION_EXPIRED', error: 'Your session has expired or been revoked. Please sign in again.' });
      return;
    }
    const user = await repo.findUserById(session.userId);
    if (!user || user.accountStatus === 'closed') {
      res.status(403).json({ success: false, code: 'ACCOUNT_INACTIVE', error: 'This client account is no longer active.' });
      return;
    }
    req.portalUser = user;
    req.portalSessionTokenHash = tokenHash;
    next();
  }

  async function computeCartSummary(userId: string) {
    const cart = await repo.getCart(userId);
    const activeItems: Array<{
      id: string;
      productId: string;
      packageId: string;
      productSlug: string;
      productName: string;
      packageName: string;
      billingType: 'one_time' | 'subscription_monthly' | 'credit_pack';
      quantity: number;
      unitPriceMinor: number;
      lineTotalMinor: number;
      creditsIncluded: number;
      revisionLimit: number;
      isCustomQuote: boolean;
      savedForLater: boolean;
    }> = [];
    const savedItems: typeof activeItems = [];

    for (const item of cart.items) {
      const found = await repo.getPackageById(item.packageId);
      if (!found) continue;
      const unitPriceMinor =
        cart.currency === 'PHP' ? found.pkg.pricePhpMinor : found.pkg.priceUsdMinor;
      const hydrated = {
        id: item.id,
        productId: found.product.id,
        packageId: found.pkg.id,
        productSlug: found.product.slug,
        productName: found.product.name,
        packageName: found.pkg.name,
        billingType: found.pkg.billingType,
        quantity: item.quantity,
        unitPriceMinor,
        lineTotalMinor: unitPriceMinor * item.quantity,
        creditsIncluded: found.pkg.creditsIncluded,
        revisionLimit: found.pkg.revisionLimit,
        isCustomQuote: found.pkg.isCustomQuote,
        savedForLater: item.savedForLater,
      };
      if (item.savedForLater) savedItems.push(hydrated);
      else activeItems.push(hydrated);
    }

    const subtotalMinor = activeItems.reduce((sum, i) => sum + i.lineTotalMinor, 0);
    let discountMinor = 0;
    let appliedDiscountCode: string | undefined;
    let discountDescription: string | undefined;

    if (cart.discountCode) {
      const codeRec = await repo.getDiscountCode(cart.discountCode);
      if (codeRec) {
        const minSub =
          cart.currency === 'PHP'
            ? usdToPhpMinor(codeRec.minSubtotalUsdMinor)
            : codeRec.minSubtotalUsdMinor;
        if (subtotalMinor >= minSub) {
          appliedDiscountCode = codeRec.code;
          discountDescription = codeRec.description;
          if (codeRec.discountType === 'percent') {
            discountMinor = Math.round((subtotalMinor * codeRec.value) / 100);
          } else {
            discountMinor =
              cart.currency === 'PHP' ? usdToPhpMinor(codeRec.value) : codeRec.value;
          }
          discountMinor = Math.min(discountMinor, subtotalMinor);
        }
      }
    }

    const taxableMinor = Math.max(0, subtotalMinor - discountMinor);
    // Transparent tax line item (0% until tax-registered VAT toggle enabled by operations)
    const taxMinor = 0;
    const totalMinor = taxableMinor + taxMinor;

    return {
      id: cart.id,
      currency: cart.currency,
      fxRateReference: USD_TO_PHP_REFERENCE_RATE,
      items: activeItems,
      savedItems,
      subtotalMinor,
      discountCode: appliedDiscountCode,
      discountDescription,
      discountMinor,
      taxMinor,
      totalMinor,
    };
  }

  // =========================================================================
  // 1. PUBLIC CLIENT AUTHENTICATION ROUTES
  // =========================================================================

  router.post('/auth/register', async (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    if (!authLimiter.allow(`reg:${ip}`)) {
      res.status(429).json({ success: false, error: 'Too many registration attempts. Please try again shortly.' });
      return;
    }

    const email = sanitizeText(req.body?.email, 254).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const firstName = sanitizeText(req.body?.firstName, 80);
    const lastName = sanitizeText(req.body?.lastName, 80);
    const companyName = sanitizeText(req.body?.companyName, 120);
    const phone = sanitizeText(req.body?.phone, 40);

    if (!isValidEmail(email)) {
      res.status(400).json({ success: false, error: 'Please provide a valid email address.' });
      return;
    }
    if (!firstName || firstName.length < 2) {
      res.status(400).json({ success: false, error: 'Please enter your first name.' });
      return;
    }
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({ success: false, error: 'Password must be between 8 and 128 characters.' });
      return;
    }

    const existing = await repo.findUserByEmail(email);
    if (existing) {
      res.status(409).json({ success: false, error: 'An account with this email address already exists.' });
      return;
    }

    const verificationToken = crypto.randomBytes(24).toString('hex');
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { user, profile } = await repo.createUser({
      email,
      passwordHash: hashPassword(password),
      firstName,
      lastName,
      companyName,
      phone,
      verificationTokenHash: sha256Hex(verificationToken),
      verificationTokenExpiresAt: verificationExpiresAt,
    });

    const rawSessionToken = crypto.randomBytes(32).toString('hex');
    await repo.createSession({
      userId: user.id,
      tokenHash: sha256Hex(rawSessionToken),
      userAgent: sanitizeText(req.headers['user-agent'], 200) || 'Browser',
      ipAddress: ip,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    setPortalSessionCookie(res, rawSessionToken);

    const emailDispatch = emailService
      ? await emailService.sendPortalVerificationEmail({
          to: user.email,
          fullName: profile.fullName || firstName,
          verificationToken,
          correlationId: (req as any).correlationId,
        })
      : { deliveryStatus: 'unconfigured' as const, provider: 'resend' };

    logStructured('info', 'portal_client_registered', {
      userId: user.id,
      mode: repo.mode,
      emailDeliveryStatus: emailDispatch.deliveryStatus,
    });

    res.status(201).json({
      success: true,
      token: rawSessionToken,
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        accountStatus: user.accountStatus,
      },
      profile,
      emailDelivery: emailDispatch,
      verificationNotice:
        emailDispatch.deliveryStatus === 'provider_accepted'
          ? 'Account created. Verification email has been accepted by our mail provider for delivery.'
          : 'Account created. Transactional email delivery is currently unconfigured or deferred; please use the verification screen or contact support.',
      ...(isDevHelperEnabled ? { devVerificationToken: verificationToken } : {}),
    });
  });

  router.post('/auth/login', async (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    if (!authLimiter.allow(`login:${ip}`)) {
      res.status(429).json({ success: false, error: 'Too many login attempts. Please wait before trying again.' });
      return;
    }

    const email = sanitizeText(req.body?.email, 254).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!isValidEmail(email) || !password) {
      res.status(400).json({ success: false, error: 'Email and password are required.' });
      return;
    }

    const user = await repo.findUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ success: false, error: 'Invalid email address or password.' });
      return;
    }
    if (user.accountStatus === 'closed') {
      res.status(403).json({ success: false, error: 'This account has been closed.' });
      return;
    }

    const rawSessionToken = crypto.randomBytes(32).toString('hex');
    await repo.createSession({
      userId: user.id,
      tokenHash: sha256Hex(rawSessionToken),
      userAgent: sanitizeText(req.headers['user-agent'], 200) || 'Browser',
      ipAddress: ip,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    setPortalSessionCookie(res, rawSessionToken);
    const profile = await repo.getProfile(user.id);
    res.status(200).json({
      success: true,
      token: rawSessionToken,
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        accountStatus: user.accountStatus,
      },
      profile,
    });
  });

  router.post('/auth/verify-email', async (req: Request, res: Response) => {
    const token = sanitizeText(req.body?.token, 200);
    if (!token) {
      res.status(400).json({ success: false, error: 'Verification token is required.' });
      return;
    }
    const verifiedUser = await repo.verifyEmailByTokenHash(sha256Hex(token));
    if (!verifiedUser) {
      res.status(400).json({ success: false, error: 'Invalid or expired verification token.' });
      return;
    }
    res.status(200).json({
      success: true,
      emailVerified: true,
      email: verifiedUser.email,
    });
  });

  router.post('/auth/resend-verification', requirePortalClient, async (req: PortalAuthenticatedRequest, res: Response) => {
    const user = req.portalUser!;
    if (user.emailVerified) {
      res.status(200).json({ success: true, message: 'Your email address is already verified.' });
      return;
    }
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await repo.setVerificationToken(user.id, sha256Hex(token), expiresAt);
    const profile = await repo.getProfile(user.id);
    const emailDispatch = emailService
      ? await emailService.sendPortalVerificationEmail({
          to: user.email,
          fullName: profile?.fullName || user.email.split('@')[0],
          verificationToken: token,
          correlationId: (req as any).correlationId,
        })
      : { deliveryStatus: 'unconfigured' as const, provider: 'resend' };

    res.status(200).json({
      success: true,
      emailDelivery: emailDispatch,
      message:
        emailDispatch.deliveryStatus === 'provider_accepted'
          ? 'A new verification email has been accepted for delivery.'
          : 'A new verification code was generated, but transactional email delivery is currently unavailable on this server.',
      ...(isDevHelperEnabled ? { devVerificationToken: token } : {}),
    });
  });

  router.post('/auth/forgot-password', async (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    if (!authLimiter.allow(`forgot:${ip}`)) {
      res.status(429).json({ success: false, error: 'Too many recovery requests. Please try again later.' });
      return;
    }
    const email = sanitizeText(req.body?.email, 254).toLowerCase();
    if (!isValidEmail(email)) {
      res.status(400).json({ success: false, error: 'Enter a valid email address.' });
      return;
    }
    const user = await repo.findUserByEmail(email);
    let devResetToken: string | undefined;
    let deliveryStatus:
      | 'request_accepted'
      | 'provider_accepted'
      | 'failed'
      | 'unconfigured' = 'request_accepted';
    if (user) {
      const token = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await repo.setResetToken(user.id, sha256Hex(token), expiresAt);
      devResetToken = token;
      const profile = await repo.getProfile(user.id);
      if (emailService) {
        const dispatch = await emailService.sendPortalPasswordRecoveryEmail({
          to: user.email,
          fullName: profile?.fullName || user.email.split('@')[0],
          resetToken: token,
          correlationId: (req as any).correlationId,
        });
        deliveryStatus =
          dispatch.deliveryStatus === 'provider_accepted' ||
          dispatch.deliveryStatus === 'failed' ||
          dispatch.deliveryStatus === 'unconfigured'
            ? dispatch.deliveryStatus
            : 'request_accepted';
      } else {
        deliveryStatus = 'unconfigured';
      }
    }
    // Uniform anti-enumeration response regardless of whether account exists
    res.status(200).json({
      success: true,
      deliveryState: isProd ? 'request_accepted' : deliveryStatus,
      message: 'If an account matches that email, password recovery instructions have been issued.',
      ...(isDevHelperEnabled && devResetToken ? { devResetToken } : {}),
    });
  });

  router.post('/auth/reset-password', async (req: Request, res: Response) => {
    const token = sanitizeText(req.body?.token, 200);
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (!token || newPassword.length < 8 || newPassword.length > 128) {
      res.status(400).json({ success: false, error: 'Valid reset token and password (8+ characters) are required.' });
      return;
    }
    const user = await repo.resetPasswordByTokenHash(sha256Hex(token), hashPassword(newPassword));
    if (!user) {
      res.status(400).json({ success: false, error: 'Reset token is invalid or has expired.' });
      return;
    }
    if (emailService) {
      const profile = await repo.getProfile(user.id);
      await emailService.sendPortalSecurityAlertEmail({
        to: user.email,
        fullName: profile?.fullName || user.email.split('@')[0],
        eventTitle: 'Your Client Portal Password Was Reset',
        eventDetails:
          'Your DESTRIA TECH INC Client Portal password was reset via a single-use recovery token and all prior active sessions were revoked.',
        correlationId: (req as any).correlationId,
      });
    }
    res.status(200).json({ success: true, message: 'Password updated. All previous sessions have been revoked. Please sign in.' });
  });

  router.post('/auth/logout', requirePortalClient, async (req: PortalAuthenticatedRequest, res: Response) => {
    if (req.portalSessionTokenHash) {
      await repo.revokeSessionByTokenHash(req.portalSessionTokenHash);
    }
    clearPortalSessionCookie(res);
    res.status(200).json({ success: true });
  });

  router.post('/auth/logout-all', requirePortalClient, async (req: PortalAuthenticatedRequest, res: Response) => {
    await repo.revokeAllUserSessions(req.portalUser!.id);
    clearPortalSessionCookie(res);
    res.status(200).json({ success: true });
  });

  router.get('/auth/me', requirePortalClient, async (req: PortalAuthenticatedRequest, res: Response) => {
    const user = req.portalUser!;
    const [profile, wallet, notifications, cart] = await Promise.all([
      repo.getProfile(user.id),
      repo.getWallet(user.id),
      repo.listNotifications(user.id),
      repo.getCart(user.id),
    ]);
    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        pendingEmail: user.pendingEmail,
        accountStatus: user.accountStatus,
        createdAt: user.createdAt,
      },
      profile,
      wallet,
      unreadNotifications: notifications.filter((n) => !n.isRead).length,
      cartItemCount: cart.items.filter((i) => !i.savedForLater).reduce((s, i) => s + i.quantity, 0),
    });
  });

  // =========================================================================
  // 2. PAYMENT WEBHOOKS (SERVER-TO-SERVER CRYPTOGRAPHICALLY VERIFIED)
  // =========================================================================

  router.post('/webhooks/:provider', async (req: Request, res: Response) => {
    const provider = req.params.provider as PaymentProviderId;
    if (!PAYMENT_PROVIDERS.includes(provider)) {
      res.status(404).json({ success: false, error: 'Unknown payment provider.' });
      return;
    }
    const adapter = paymentRegistry.getAdapter(provider);
    if (!adapter) {
      res.status(404).json({ success: false, error: 'Provider adapter not found.' });
      return;
    }
    const adapterConfig = adapter.getConfig();
    if (isProd && adapterConfig.integrationStatus === 'deferred_merchant_onboarding') {
      res.status(503).json({
        success: false,
        error: `${adapterConfig.displayName} is deferred and cannot process production webhooks.`,
      });
      return;
    }

    const rawBody = typeof (req as any).rawBody === 'string' ? (req as any).rawBody : JSON.stringify(req.body || {});
    const verified = adapter.verifyWebhook(req.headers, rawBody, (req.body || {}) as Record<string, unknown>);
    if (!verified.verified || !verified.providerEventId || !verified.orderId || !verified.amountMinor || !verified.currency || !verified.status) {
      res.status(401).json({ success: false, error: verified.error || 'Webhook verification failed.' });
      return;
    }

    try {
      const outcome = await repo.recordWebhookAndConfirmPayment({
        provider,
        providerEventId: verified.providerEventId,
        orderId: verified.orderId,
        providerTransactionId: verified.providerTransactionId || verified.providerEventId,
        amountMinor: verified.amountMinor,
        currency: verified.currency,
        eventStatus: verified.status,
        payloadSummary: {
          eventId: verified.providerEventId,
          orderId: verified.orderId,
          amountMinor: verified.amountMinor,
          currency: verified.currency,
          status: verified.status,
        },
      });
      res.status(200).json({
        success: true,
        deduplicated: outcome.deduplicated,
        orderNumber: outcome.order?.orderNumber,
        creditsAllocated: outcome.creditsAllocated,
        projectReference: outcome.projectCreated?.referenceNumber,
      });
    } catch (err: any) {
      res.status(422).json({ success: false, error: err?.message || 'Webhook reconciliation error' });
    }
  });

  // =========================================================================
  // 3. SIGNED EXPIRING FILE DOWNLOAD (HMAC VERIFIED, NO PUBLIC ACCESS)
  // =========================================================================

  router.get('/files/download/:fileId', async (req: Request, res: Response) => {
    const fileId = sanitizeText(req.params.fileId, 80);
    const uid = sanitizeText(req.query.uid, 80);
    const exp = Number(req.query.exp);
    const sig = sanitizeText(req.query.sig, 128);

    if (!fileId || !uid || !sig || !verifyDownloadUrlToken(fileId, uid, exp, sig)) {
      res.status(403).json({ success: false, error: 'Download link is invalid or has expired.' });
      return;
    }

    const found = await repo.getAttachmentById(uid, fileId);
    if (!found) {
      res.status(404).json({ success: false, error: 'File not found.' });
      return;
    }

    const enforceStrictQuarantine = isProd || process.env.ENFORCE_MALWARE_QUARANTINE === 'true';
    const scanStatus = found.record.scanStatus || 'quarantined_unscanned';
    if (scanStatus === 'flagged' || (enforceStrictQuarantine && scanStatus !== 'clean')) {
      res.status(403).json({
        success: false,
        code: 'FILE_QUARANTINED',
        scanStatus,
        error:
          scanStatus === 'flagged'
            ? 'This file has been flagged by security screening and cannot be downloaded.'
            : 'This file is quarantined pending security screening clearance and cannot be downloaded yet.',
      });
      return;
    }

    const safeFileName = found.record.fileName.replace(/["\\\r\n]/g, '_');
    res.setHeader('Content-Type', found.record.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(found.buffer);
  });

  // =========================================================================
  // 4. PROTECTED CLIENT PORTAL ENDPOINTS (requirePortalClient)
  // =========================================================================

  router.use(requirePortalClient);

  // Dashboard Overview
  router.get('/dashboard', async (req: PortalAuthenticatedRequest, res: Response) => {
    const userId = req.portalUser!.id;
    const [
      profile,
      orders,
      projects,
      wallet,
      tickets,
      activities,
      products,
      notifications,
      subscriptions,
      customInquiries,
      approvedProposals,
    ] = await Promise.all([
      repo.getProfile(userId),
      repo.listOrders(userId),
      repo.listProjects(userId),
      repo.getWallet(userId),
      repo.listSupportTickets(userId),
      repo.listActivities(userId, 12),
      repo.listProducts(),
      repo.listNotifications(userId),
      repo.listSubscriptions(userId),
      repo.listCustomInquiries(userId),
      repo.listApprovedProposals(userId),
    ]);

    const activeOrders = orders.filter((o) => !['completed', 'cancelled'].includes(o.fulfillmentStatus)).length;
    const pendingPayments = orders.filter((o) => ['unpaid', 'pending', 'processing'].includes(o.paymentStatus)).length;
    const activeProjects = projects.filter((p) => p.currentStage !== 'project_completed').length;
    const completedProjects = projects.filter((p) => p.currentStage === 'project_completed').length;
    const openSupportRequests = tickets.filter((t) => ['open', 'in_progress', 'waiting_for_client'].includes(t.status)).length;

    res.status(200).json({
      success: true,
      profile,
      metrics: {
        activeOrders,
        activeProjects,
        availableCredits: wallet.availableCredits,
        pendingCredits: wallet.pendingCredits,
        completedProjects,
        pendingPayments,
        openSupportRequests,
        serviceInquiriesCount: customInquiries.length,
        approvedProposalsCount: approvedProposals.filter((p) => p.status === 'approved').length,
      },
      recentOrders: orders.slice(0, 5),
      activeProjectsList: projects.filter((p) => p.currentStage !== 'project_completed').slice(0, 5),
      recentActivities: activities,
      recommendedServices: products
        .filter((p) => p.isFeatured)
        .slice(0, 6)
        .map(sanitizeProductForPublicCatalog),
      unreadNotifications: notifications.filter((n) => !n.isRead).length,
      activeSubscriptionsCount: subscriptions.filter((s) => s.status === 'active').length,
      commercialEngagementStatement: COMMERCIAL_ENGAGEMENT_STATEMENT,
    });
  });

  // Technology Solutions Directory (Zero Advertised Public Pricing)
  router.get('/catalog', async (req: PortalAuthenticatedRequest, res: Response) => {
    const categorySlug = sanitizeText(req.query.category, 80) || undefined;
    const search = sanitizeText(req.query.q, 120) || undefined;
    const [categories, products] = await Promise.all([
      repo.listCategories(),
      repo.listProducts({ categorySlug, search }),
    ]);
    res.status(200).json({
      success: true,
      categories,
      products: products.map(sanitizeProductForPublicCatalog),
      commercialPolicy: corporateIdentity.commercialPolicy,
      corporateServiceStatement: CORPORATE_SERVICE_STATEMENT,
      commercialEngagementStatement: COMMERCIAL_ENGAGEMENT_STATEMENT,
    });
  });

  router.get('/catalog/:slug', async (req: PortalAuthenticatedRequest, res: Response) => {
    const slug = sanitizeText(req.params.slug, 120);
    const product = await repo.getProductBySlug(slug);
    if (!product) {
      res.status(404).json({ success: false, error: 'Technology solution not found.' });
      return;
    }
    res.status(200).json({
      success: true,
      product: sanitizeProductForPublicCatalog(product),
      commercialPolicy: corporateIdentity.commercialPolicy,
      commercialEngagementStatement: COMMERCIAL_ENGAGEMENT_STATEMENT,
    });
  });

  router.post('/custom-inquiries', async (req: PortalAuthenticatedRequest, res: Response) => {
    const userId = req.portalUser!.id;
    const companyName = sanitizeText(req.body?.companyName, 140);
    const contactPerson = sanitizeText(req.body?.contactPerson, 120);
    const email = sanitizeText(req.body?.email, 254).toLowerCase();
    const requiredServices = Array.isArray(req.body?.requiredServices)
      ? req.body.requiredServices.map((s: unknown) => sanitizeText(s, 100)).filter(Boolean)
      : [];
    const estimatedMonthlyVolume = sanitizeText(req.body?.estimatedMonthlyVolume, 120);
    const projectDescription = sanitizeText(req.body?.projectDescription, 2000);
    const budgetRange = 'Subject to Formal Assessment';
    const expectedSchedule = sanitizeText(req.body?.expectedSchedule, 120);
    const supportingFileIds = Array.isArray(req.body?.supportingFileIds)
      ? req.body.supportingFileIds.map((s: unknown) => sanitizeText(s, 80)).filter(Boolean)
      : [];

    if (!companyName || !contactPerson || !isValidEmail(email) || !projectDescription) {
      res.status(400).json({
        success: false,
        error: 'Company name, contact person, valid email, and project description are required.',
      });
      return;
    }

    if (!(await verifyOwnedAttachmentIds(userId, supportingFileIds))) {
      res.status(403).json({
        success: false,
        error: 'One or more referenced supporting files do not belong to your account.',
      });
      return;
    }

    const inquiry = await repo.createCustomInquiry({
      userId,
      companyName,
      contactPerson,
      email,
      requiredServices: requiredServices.length > 0 ? requiredServices : ['Customized Enterprise Solution'],
      estimatedMonthlyVolume,
      projectDescription,
      budgetRange,
      expectedSchedule,
      supportingFileIds,
    });

    res.status(201).json({ success: true, inquiry });
  });

  router.get('/custom-inquiries', async (req: PortalAuthenticatedRequest, res: Response) => {
    const inquiries = await repo.listCustomInquiries(req.portalUser!.id);
    res.status(200).json({ success: true, inquiries });
  });

  // M23: Client-Owned AI Front Desk Project Inquiries, Preliminary Masterplans & Inline Corrections
  // SECURITY: Strictly scoped to req.portalUser.email — cross-client access is impossible.
  router.get('/frontdesk/inquiries', async (req: PortalAuthenticatedRequest, res: Response) => {
    try {
      const clientEmail = req.portalUser!.email;
      const records = frontDeskStore ? await frontDeskStore.listInquiriesForClientEmailDurable(clientEmail) : [];
      res.status(200).json({
        success: true,
        count: records.length,
        inquiries: records,
        commercialEngagementStatement: COMMERCIAL_ENGAGEMENT_STATEMENT,
      });
    } catch (err) {
      if (err instanceof FrontDeskPersistenceUnavailableError) {
        res.status(503).json({ success: false, code: err.code, error: err.message });
        return;
      }
      throw err;
    }
  });

  router.patch('/frontdesk/inquiries/:referenceCode/corrections', async (req: PortalAuthenticatedRequest, res: Response) => {
    if (!frontDeskStore) {
      res.status(503).json({ success: false, error: 'AI Front Desk inquiry store is not enabled.' });
      return;
    }
    try {
      const referenceCode = sanitizeText(req.params.referenceCode, 80);
      const clientEmail = req.portalUser!.email;
      const patch = req.body?.patch && typeof req.body.patch === 'object' ? req.body.patch : {};
      const note = sanitizeText(req.body?.note, 300) || undefined;
      const expectedVersion =
        typeof req.body?.expectedVersion === 'number' && Number.isFinite(req.body.expectedVersion)
          ? Math.floor(req.body.expectedVersion)
          : undefined;

      const outcome = await frontDeskStore.applyClientPortalCorrectionDurable({
        referenceCode,
        authenticatedEmail: clientEmail,
        patch,
        note,
        expectedVersion,
      });

      if (outcome.ok === false) {
        res.status(outcome.statusCode).json({ success: false, error: outcome.error });
        return;
      }

      res.status(200).json({
        success: true,
        inquiry: outcome.record,
        message: 'Your inquiry profile and preliminary project masterplan have been updated.',
      });
    } catch (err) {
      if (err instanceof FrontDeskPersistenceUnavailableError) {
        res.status(503).json({ success: false, code: err.code, error: err.message });
        return;
      }
      throw err;
    }
  });

  // Server-Authorized Formal Proposals (Scoped strictly to authenticated client)
  router.get('/proposals', async (req: PortalAuthenticatedRequest, res: Response) => {
    const proposals = await repo.listApprovedProposals(req.portalUser!.id);
    res.status(200).json({
      success: true,
      proposals,
      commercialEngagementStatement: COMMERCIAL_ENGAGEMENT_STATEMENT,
    });
  });

  // Shopping Cart (Server-Authoritative Totals)
  router.get('/cart', async (req: PortalAuthenticatedRequest, res: Response) => {
    const summary = await computeCartSummary(req.portalUser!.id);
    res.status(200).json({ success: true, cart: summary });
  });

  router.post('/cart/items', async (_req: PortalAuthenticatedRequest, res: Response) => {
    res.status(403).json({
      success: false,
      code: 'APPROVED_PROPOSAL_REQUIRED',
      error:
        'DESTRIA TECH INC delivers customized enterprise solutions exclusively. Public self-service checkout is disabled; please submit a service inquiry or consultation request to receive a formal approved proposal.',
    });
  });

  router.patch('/cart/items/:itemId', async (req: PortalAuthenticatedRequest, res: Response) => {
    const userId = req.portalUser!.id;
    const itemId = sanitizeText(req.params.itemId, 80);
    const cart = await repo.getCart(userId);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) {
      res.status(404).json({ success: false, error: 'Cart item not found.' });
      return;
    }
    if (typeof req.body?.quantity === 'number') {
      const qty = Math.floor(req.body.quantity);
      if (qty <= 0) {
        cart.items = cart.items.filter((i) => i.id !== itemId);
      } else {
        item.quantity = Math.min(25, qty);
      }
    }
    if (typeof req.body?.savedForLater === 'boolean') {
      item.savedForLater = req.body.savedForLater;
    }
    item.updatedAt = new Date().toISOString();
    await repo.saveCart(cart);
    const summary = await computeCartSummary(userId);
    res.status(200).json({ success: true, cart: summary });
  });

  router.delete('/cart/items/:itemId', async (req: PortalAuthenticatedRequest, res: Response) => {
    const userId = req.portalUser!.id;
    const itemId = sanitizeText(req.params.itemId, 80);
    const cart = await repo.getCart(userId);
    cart.items = cart.items.filter((i) => i.id !== itemId);
    await repo.saveCart(cart);
    const summary = await computeCartSummary(userId);
    res.status(200).json({ success: true, cart: summary });
  });

  router.patch('/cart/preferences', async (req: PortalAuthenticatedRequest, res: Response) => {
    const userId = req.portalUser!.id;
    const cart = await repo.getCart(userId);
    if (req.body?.discountCode !== undefined) {
      const code = sanitizeText(req.body.discountCode, 40).toUpperCase();
      if (code) {
        res.status(400).json({
          success: false,
          code: 'PUBLIC_DISCOUNTS_DISABLED',
          error:
            'DESTRIA TECH INC does not advertise public discounts or promotional pricing. Commercial terms are determined exclusively within formal approved proposals.',
        });
        return;
      }
      cart.discountCode = undefined;
    }
    await repo.saveCart(cart);
    const summary = await computeCartSummary(userId);
    res.status(200).json({ success: true, cart: summary });
  });

  // Payment Providers Registry (Used strictly for authorized approved proposals)
  router.get('/payment-providers', (_req: PortalAuthenticatedRequest, res: Response) => {
    res.status(200).json({
      success: true,
      providers: paymentRegistry.listConfigs(),
    });
  });

  // Authorized Commercial Proposal Settlement -> Server-Authoritative Order & Invoice Creation
  // Public unapproved catalog checkout is strictly disabled (requires server-verified ApprovedProposal).
  router.post('/checkout', async (req: PortalAuthenticatedRequest, res: Response) => {
    const userId = req.portalUser!.id;
    if (!writeLimiter.allow(`checkout:${userId}`)) {
      res.status(429).json({ success: false, error: 'Too many settlement requests. Please wait briefly.' });
      return;
    }

    const idempotencyKey =
      sanitizeText(req.headers['idempotency-key'], 120) ||
      sanitizeText(req.body?.idempotencyKey, 120) ||
      undefined;
    if (idempotencyKey) {
      const existing = await repo.findOrderByIdempotencyKey(userId, idempotencyKey);
      if (existing) {
        const invoices = await repo.listInvoices(userId);
        const payments = await repo.listPayments(userId);
        res.status(200).json({
          success: true,
          deduplicated: true,
          order: existing,
          invoice: invoices.find((i) => i.orderId === existing.id),
          payment: payments.find((p) => p.orderId === existing.id),
        });
        return;
      }
    }

    const approvedProposalId = sanitizeText(req.body?.approvedProposalId, 120);
    if (!approvedProposalId) {
      res.status(403).json({
        success: false,
        code: 'APPROVED_PROPOSAL_REQUIRED',
        error:
          'Public self-checkout is disabled. An authorized DESTRIA TECH INC formal commercial proposal is required following consultation and technical assessment.',
      });
      return;
    }

    const proposal = await repo.getApprovedProposalById(userId, approvedProposalId);
    if (!proposal || proposal.status !== 'approved' || proposal.items.length === 0) {
      res.status(403).json({
        success: false,
        code: 'APPROVED_PROPOSAL_REQUIRED',
        error:
          'Approved commercial proposal not found, already settled, or not authorized for your account.',
      });
      return;
    }

    if (proposal.expiresAt && Date.parse(proposal.expiresAt) < Date.now()) {
      res.status(403).json({
        success: false,
        code: 'PROPOSAL_EXPIRED',
        error: 'This formal commercial proposal has expired. Please contact DESTRIA TECH INC for renewal.',
      });
      return;
    }

    const paymentProvider = sanitizeText(req.body?.paymentProvider, 40) as PaymentProviderId;
    if (!PAYMENT_PROVIDERS.includes(paymentProvider)) {
      res.status(400).json({ success: false, error: 'Please select a valid payment method.' });
      return;
    }

    const billing = req.body?.billingDetails || {};
    const fullName = sanitizeText(billing.fullName, 140);
    const email = sanitizeText(billing.email, 254).toLowerCase();
    const phone = sanitizeText(billing.phone, 40);
    const companyName = sanitizeText(billing.companyName, 140);
    const taxId = sanitizeText(billing.taxId, 60);
    const address = sanitizeText(billing.address, 400);

    if (!fullName || !isValidEmail(email)) {
      res.status(400).json({ success: false, error: 'Billing full name and a valid billing email are required.' });
      return;
    }

    const reqInfo = req.body?.projectRequirements || {};
    const referenceFileIds = Array.isArray(reqInfo.referenceFileIds)
      ? reqInfo.referenceFileIds.map((id: unknown) => sanitizeText(id, 80)).filter(Boolean)
      : [];
    if (!(await verifyOwnedAttachmentIds(userId, referenceFileIds))) {
      res.status(403).json({
        success: false,
        error: 'One or more attached reference files do not belong to your account.',
      });
      return;
    }
    const projectRequirements = {
      title: sanitizeText(reqInfo.title, 160) || proposal.title,
      instructions: sanitizeText(reqInfo.instructions, 3000) || proposal.scopeSummary,
      deliveryExpectation: sanitizeText(reqInfo.deliveryExpectation, 160),
      creativeBrief: sanitizeText(reqInfo.creativeBrief, 3000),
      specialInstructions: sanitizeText(reqInfo.specialInstructions, 1500),
      referenceFileIds,
    };

    // ALWAYS compute settlement totals strictly from the server-stored Approved Proposal — NEVER trust browser amounts!
    const ts = new Date().toISOString();
    const { order, invoice, payment } = await repo.createOrder({
      userId,
      currency: proposal.currency,
      fxRateSnapshot: proposal.fxRateSnapshot,
      subtotalMinor: proposal.subtotalMinor,
      discountMinor: 0,
      taxMinor: proposal.taxMinor,
      totalMinor: proposal.totalMinor,
      paymentProvider,
      paymentStatus: 'pending',
      fulfillmentStatus: 'pending_payment',
      billingDetails: { fullName, email, phone, companyName, taxId, address },
      projectRequirements,
      idempotencyKey,
      items: proposal.items.map((item) => ({
        id: crypto.randomUUID(),
        orderId: '',
        productId: item.productId,
        packageId: item.packageId,
        productSlug: item.productSlug,
        productName: item.productName,
        packageName: item.packageName,
        billingType: item.billingType,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
        lineTotalMinor: item.lineTotalMinor,
        creditsAllocated: item.creditsAllocated,
        revisionLimit: item.revisionLimit,
      })),
      timeline: [
        {
          status: 'pending_payment' as OrderStatus,
          label: `Authorized Engagement Created (${proposal.proposalNumber}) — Pending Payment Verification`,
          note: `Server-verified approved proposal total ${formatMinorMoney(proposal.totalMinor, proposal.currency)}.`,
          timestamp: ts,
        },
      ],
    });

    await repo.markProposalAccepted(userId, proposal.id, order.id);

    const adapter = paymentRegistry.getAdapter(paymentProvider)!;
    const canonicalOrderUrl = buildCanonicalPublicUrl(buildOrderDetailRoute(order.id));
    const paymentInitiation = await adapter.initiatePayment({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amountMinor: order.totalMinor,
      currency: order.currency,
      customerEmail: email,
      idempotencyKey: payment.idempotencyKey,
      returnUrl: canonicalOrderUrl,
      cancelUrl: canonicalOrderUrl,
    });

    const updatedPayment =
      (await repo.updatePaymentInitiation?.(payment.id, {
        providerTransactionId: paymentInitiation.providerTransactionId,
        checkoutUrl: paymentInitiation.checkoutUrl,
        environment: paymentInitiation.environment,
        status: !paymentInitiation.initiated && paymentInitiation.environment !== 'disabled' ? 'failed' : undefined,
        failureReason: !paymentInitiation.initiated ? paymentInitiation.message : undefined,
      })) || payment;

    res.status(201).json({
      success: true,
      proposalNumber: proposal.proposalNumber,
      order,
      invoice,
      payment: updatedPayment,
      paymentInitiation,
    });
  });

  // Orders
  router.get('/orders', async (req: PortalAuthenticatedRequest, res: Response) => {
    const orders = await repo.listOrders(req.portalUser!.id);
    res.status(200).json({ success: true, orders });
  });

  router.get('/orders/:orderId', async (req: PortalAuthenticatedRequest, res: Response) => {
    const userId = req.portalUser!.id;
    const order = await repo.getOrderById(userId, sanitizeText(req.params.orderId, 80));
    if (!order) {
      res.status(404).json({ success: false, error: 'Order not found.' });
      return;
    }
    const [invoices, payments, projects] = await Promise.all([
      repo.listInvoices(userId),
      repo.listPayments(userId),
      repo.listProjects(userId),
    ]);
    res.status(200).json({
      success: true,
      order,
      invoice: invoices.find((i) => i.orderId === order.id) || null,
      payment: payments.find((p) => p.orderId === order.id) || null,
      linkedProjects: projects.filter((p) => p.orderId === order.id),
    });
  });

  router.post('/orders/:orderId/cancel', async (req: PortalAuthenticatedRequest, res: Response) => {
    const reason = sanitizeText(req.body?.reason, 500) || 'Requested by client via portal';
    const updated = await repo.requestOrderCancellation(
      req.portalUser!.id,
      sanitizeText(req.params.orderId, 80),
      reason
    );
    if (!updated) {
      res.status(404).json({ success: false, error: 'Order not found.' });
      return;
    }
    res.status(200).json({ success: true, order: updated });
  });

  // Financial Records: Invoices & Payments
  router.get('/invoices', async (req: PortalAuthenticatedRequest, res: Response) => {
    const invoices = await repo.listInvoices(req.portalUser!.id);
    res.status(200).json({ success: true, invoices });
  });

  router.get('/invoices/:invoiceId', async (req: PortalAuthenticatedRequest, res: Response) => {
    const invoice = await repo.getInvoiceById(req.portalUser!.id, sanitizeText(req.params.invoiceId, 80));
    if (!invoice) {
      res.status(404).json({ success: false, error: 'Invoice not found.' });
      return;
    }
    res.status(200).json({ success: true, invoice });
  });

  router.get('/payments', async (req: PortalAuthenticatedRequest, res: Response) => {
    const payments = await repo.listPayments(req.portalUser!.id);
    res.status(200).json({ success: true, payments });
  });

  // Credits & Atomic Ledger (Read + Server-Authorized Service Usage Debit only — NEVER client credit top-up!)
  router.get('/credits', async (req: PortalAuthenticatedRequest, res: Response) => {
    const userId = req.portalUser!.id;
    const [wallet, transactions] = await Promise.all([
      repo.getWallet(userId),
      repo.listCreditTransactions(userId),
    ]);
    res.status(200).json({ success: true, wallet, transactions });
  });

  router.post('/credits/redeem', async (req: PortalAuthenticatedRequest, res: Response) => {
    const userId = req.portalUser!.id;
    const creditsCost = Number(req.body?.creditsCost);
    const serviceDescription = sanitizeText(req.body?.serviceDescription, 200);
    const relatedProjectId = sanitizeText(req.body?.relatedProjectId, 80) || undefined;
    const idempotencyKey = sanitizeText(req.headers['idempotency-key'] || req.body?.idempotencyKey, 120) || undefined;

    if (!Number.isInteger(creditsCost) || creditsCost <= 0 || !serviceDescription) {
      res.status(400).json({ success: false, error: 'Valid positive credit amount and service description are required.' });
      return;
    }
    if (relatedProjectId) {
      const ownedProject = await repo.getProjectDetail(userId, relatedProjectId);
      if (!ownedProject) {
        res.status(403).json({ success: false, error: 'Referenced project does not belong to your account.' });
        return;
      }
    }

    try {
      const result = await repo.applyCreditLedgerEntry({
        userId,
        transactionType: 'service_usage',
        amount: -creditsCost,
        description: serviceDescription,
        relatedProjectId,
        idempotencyKey,
      });
      res.status(200).json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message || 'Unable to redeem credits.' });
    }
  });

  // Subscriptions
  router.get('/subscriptions', async (req: PortalAuthenticatedRequest, res: Response) => {
    const subscriptions = await repo.listSubscriptions(req.portalUser!.id);
    res.status(200).json({ success: true, subscriptions });
  });

  router.post('/subscriptions/:subscriptionId/cancel', async (req: PortalAuthenticatedRequest, res: Response) => {
    const updated = await repo.requestSubscriptionCancel(
      req.portalUser!.id,
      sanitizeText(req.params.subscriptionId, 80)
    );
    if (!updated) {
      res.status(404).json({ success: false, error: 'Subscription not found.' });
      return;
    }
    res.status(200).json({ success: true, subscription: updated });
  });

  // Projects, Discussions, Deliverables & Revisions
  router.get('/projects', async (req: PortalAuthenticatedRequest, res: Response) => {
    const projects = await repo.listProjects(req.portalUser!.id);
    res.status(200).json({ success: true, projects });
  });

  router.post('/projects', async (req: PortalAuthenticatedRequest, res: Response) => {
    const userId = req.portalUser!.id;
    const title = sanitizeText(req.body?.title, 160);
    const serviceName = sanitizeText(req.body?.serviceName, 140) || 'Multimedia Production';
    const description = sanitizeText(req.body?.description, 3000);
    const objectives = sanitizeText(req.body?.objectives, 1500);
    const preferredStyle = sanitizeText(req.body?.preferredStyle, 500);
    const brandRequirements = sanitizeText(req.body?.brandRequirements, 1000);
    const targetAudience = sanitizeText(req.body?.targetAudience, 500);
    const deliverableRequirements = sanitizeText(req.body?.deliverableRequirements, 1000);
    const requestedDeadline = sanitizeText(req.body?.requestedDeadline, 60);
    const orderId = sanitizeText(req.body?.orderId, 80) || undefined;

    if (!title || !description) {
      res.status(400).json({ success: false, error: 'Project title and description are required.' });
      return;
    }

    let orderNumber: string | undefined;
    let revisionLimit = 2;
    if (orderId) {
      const linkedOrder = await repo.getOrderById(userId, orderId);
      if (!linkedOrder) {
        res.status(404).json({ success: false, error: 'Linked order not found.' });
        return;
      }
      orderNumber = linkedOrder.orderNumber;
      revisionLimit = linkedOrder.items[0]?.revisionLimit || 2;
    }

    const created = await repo.createProject({
      userId,
      orderId,
      orderNumber,
      serviceName,
      title,
      description,
      objectives,
      preferredStyle,
      brandRequirements,
      targetAudience,
      deliverableRequirements,
      requestedDeadline,
      revisionLimit,
    });

    res.status(201).json({ success: true, ...created });
  });

  router.get('/projects/:projectId', async (req: PortalAuthenticatedRequest, res: Response) => {
    const userId = req.portalUser!.id;
    const projectId = sanitizeText(req.params.projectId, 80);
    const detail = await repo.getProjectDetail(userId, projectId);
    if (!detail) {
      res.status(404).json({ success: false, error: 'Project workspace not found.' });
      return;
    }
    await repo.markProjectMessagesRead(userId, projectId);
    res.status(200).json({ success: true, ...detail });
  });

  router.post('/projects/:projectId/messages', async (req: PortalAuthenticatedRequest, res: Response) => {
    const userId = req.portalUser!.id;
    const projectId = sanitizeText(req.params.projectId, 80);
    const body = sanitizeText(req.body?.body, 4000);
    const attachmentIds = Array.isArray(req.body?.attachmentIds)
      ? req.body.attachmentIds.map((id: unknown) => sanitizeText(id, 80)).filter(Boolean)
      : [];

    if (!body && attachmentIds.length === 0) {
      res.status(400).json({ success: false, error: 'Message text or an attachment is required.' });
      return;
    }
    if (!(await verifyOwnedAttachmentIds(userId, attachmentIds))) {
      res.status(403).json({ success: false, error: 'One or more attached files do not belong to your account.' });
      return;
    }

    const profile = await repo.getProfile(userId);
    const message = await repo.addProjectMessage({
      userId,
      projectId,
      senderName: profile?.fullName || req.portalUser!.email,
      body: body || 'Attached project file(s).',
      attachmentIds,
    });

    if (!message) {
      res.status(404).json({ success: false, error: 'Project not found.' });
      return;
    }

    res.status(201).json({ success: true, message });
  });

  router.get('/messages', async (req: PortalAuthenticatedRequest, res: Response) => {
    const messages = await repo.listAllUserMessages(req.portalUser!.id);
    res.status(200).json({ success: true, messages });
  });

  router.post('/projects/:projectId/revisions', async (req: PortalAuthenticatedRequest, res: Response) => {
    const userId = req.portalUser!.id;
    const projectId = sanitizeText(req.params.projectId, 80);
    const deliverableId = sanitizeText(req.body?.deliverableId, 80) || undefined;
    const description = sanitizeText(req.body?.description, 3000);
    const attachmentIds = Array.isArray(req.body?.attachmentIds)
      ? req.body.attachmentIds.map((id: unknown) => sanitizeText(id, 80)).filter(Boolean)
      : [];

    if (!description || description.length < 5) {
      res.status(400).json({ success: false, error: 'Please describe the requested changes clearly.' });
      return;
    }
    if (!(await verifyOwnedAttachmentIds(userId, attachmentIds))) {
      res.status(403).json({ success: false, error: 'One or more attached files do not belong to your account.' });
      return;
    }

    const result = await repo.createRevisionRequest({
      userId,
      projectId,
      deliverableId,
      description,
      attachmentIds,
    });

    if (result.error) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.status(201).json({ success: true, revision: result.revision });
  });

  router.post('/projects/:projectId/deliverables/:deliverableId/approve', async (req: PortalAuthenticatedRequest, res: Response) => {
    const updated = await repo.approveDeliverable(
      req.portalUser!.id,
      sanitizeText(req.params.projectId, 80),
      sanitizeText(req.params.deliverableId, 80),
      sanitizeText(req.body?.note, 500)
    );
    if (!updated) {
      res.status(404).json({ success: false, error: 'Deliverable not found.' });
      return;
    }
    res.status(200).json({ success: true, deliverable: updated });
  });

  // Secure File Uploads & Expiring Signed Links
  router.get('/files', async (req: PortalAuthenticatedRequest, res: Response) => {
    const projectId = sanitizeText(req.query.projectId, 80) || undefined;
    const files = await repo.listAttachments(req.portalUser!.id, projectId);
    res.status(200).json({ success: true, files });
  });

  router.post('/files/upload', express.json({ limit: '22mb' }), async (req: PortalAuthenticatedRequest, res: Response) => {
    const userId = req.portalUser!.id;
    if (!writeLimiter.allow(`upload:${userId}`)) {
      res.status(429).json({ success: false, error: 'Upload rate limit reached. Please wait briefly.' });
      return;
    }

    const rawFileName = sanitizeText(req.body?.fileName, 180);
    const mimeType = sanitizeText(req.body?.mimeType, 120).toLowerCase();
    const contentBase64 = typeof req.body?.contentBase64 === 'string' ? req.body.contentBase64 : '';
    const projectId = sanitizeText(req.body?.projectId, 80) || undefined;
    const categoryRaw = sanitizeText(req.body?.category, 40);
    const category = (['brief', 'reference', 'message_attachment', 'support_attachment'].includes(categoryRaw)
      ? categoryRaw
      : 'reference') as 'brief' | 'reference' | 'message_attachment' | 'support_attachment';

    if (!rawFileName || !contentBase64) {
      res.status(400).json({ success: false, error: 'File name and file payload are required.' });
      return;
    }

    const baseName = rawFileName.replace(/[/\\]/g, '_');
    const ext = baseName.includes('.') ? baseName.split('.').pop()!.toLowerCase() : '';
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      res.status(400).json({
        success: false,
        error: `Unsupported file type (.${ext || 'unknown'}). Allowed: JPG, PNG, WEBP, MP4, MOV, PDF, DOCX, XLSX, PPTX, ZIP.`,
      });
      return;
    }
    if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
      res.status(400).json({ success: false, error: `Unsupported MIME type: ${mimeType}` });
      return;
    }

    if (projectId) {
      const ownedProject = await repo.getProjectDetail(userId, projectId);
      if (!ownedProject) {
        res.status(404).json({ success: false, error: 'Target project not found.' });
        return;
      }
    }

    const cleanBase64 = contentBase64.includes(',') ? contentBase64.split(',').pop()! : contentBase64;
    const buffer = Buffer.from(cleanBase64, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
      res.status(413).json({
        success: false,
        error: `File exceeds maximum allowed size (${MAX_UPLOAD_BYTES / (1024 * 1024)} MB) or is empty.`,
      });
      return;
    }

    const signatureCheck = validateUploadedFileSignature(ext, buffer);
    if (signatureCheck.ok === false) {
      logStructured('warn', 'portal_file_upload_signature_rejected', {
        userId,
        fileName: baseName,
        extension: ext,
        reason: signatureCheck.reason,
      });
      res.status(400).json({
        success: false,
        code: 'INVALID_FILE_SIGNATURE',
        error: signatureCheck.reason,
      });
      return;
    }

    const contentSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const existingFiles = await repo.listAttachments(userId, projectId);
    const priorVersions = existingFiles.filter((f) => f.fileName.toLowerCase() === baseName.toLowerCase()).length;
    const storedFileName = `${userId}_${crypto.randomUUID()}.${ext}`;

    const file = await repo.saveAttachment(
      {
        userId,
        projectId,
        fileName: baseName,
        storedFileName,
        mimeType: mimeType || 'application/octet-stream',
        extension: ext,
        sizeBytes: buffer.length,
        category,
        version: priorVersions + 1,
        uploadedByRole: 'client',
        scanStatus: 'quarantined_unscanned',
        quarantineReason:
          'Automated antivirus/malware scanner is not integrated in this runtime; file signature verified and stored in private isolated vault.',
        contentSha256,
      },
      buffer
    );

    res.status(201).json({ success: true, file });
  });

  router.post('/files/:fileId/sign', async (req: PortalAuthenticatedRequest, res: Response) => {
    if (isProd && !hasStrongSigningSecret) {
      res.status(503).json({
        success: false,
        error: 'Signed download service is unavailable until PORTAL_SIGNING_SECRET is configured.',
      });
      return;
    }
    const userId = req.portalUser!.id;
    const fileId = sanitizeText(req.params.fileId, 80);
    const found = await repo.getAttachmentById(userId, fileId);
    if (!found) {
      res.status(404).json({ success: false, error: 'File not found or access denied.' });
      return;
    }
    const enforceStrictQuarantine = isProd || process.env.ENFORCE_MALWARE_QUARANTINE === 'true';
    const scanStatus = found.record.scanStatus || 'quarantined_unscanned';
    if (scanStatus === 'flagged' || (enforceStrictQuarantine && scanStatus !== 'clean')) {
      res.status(403).json({
        success: false,
        code: 'FILE_QUARANTINED',
        scanStatus,
        error:
          scanStatus === 'flagged'
            ? 'This file has been flagged by security screening and cannot be downloaded.'
            : 'This file is quarantined pending security screening clearance and cannot be downloaded yet.',
      });
      return;
    }
    const exp = Math.floor(Date.now() / 1000) + 300; // 5-minute signed link
    const sig = signDownloadUrlToken(fileId, userId, exp);
    res.status(200).json({
      success: true,
      downloadUrl: `/api/portal/files/download/${encodeURIComponent(fileId)}?uid=${encodeURIComponent(userId)}&exp=${exp}&sig=${sig}`,
      expiresAt: new Date(exp * 1000).toISOString(),
      scanStatus,
    });
  });

  // Support Tickets
  router.get('/support', async (req: PortalAuthenticatedRequest, res: Response) => {
    const tickets = await repo.listSupportTickets(req.portalUser!.id);
    res.status(200).json({ success: true, tickets, categories: SUPPORT_CATEGORIES });
  });

  router.post('/support', async (req: PortalAuthenticatedRequest, res: Response) => {
    const userId = req.portalUser!.id;
    const category = sanitizeText(req.body?.category, 60) as SupportTicketCategory;
    const subject = sanitizeText(req.body?.subject, 160);
    const body = sanitizeText(req.body?.body, 3000);
    const attachmentIds = Array.isArray(req.body?.attachmentIds)
      ? req.body.attachmentIds.map((id: unknown) => sanitizeText(id, 80)).filter(Boolean)
      : [];

    if (!SUPPORT_CATEGORIES.includes(category) || !subject || !body) {
      res.status(400).json({ success: false, error: 'Category, subject, and issue description are required.' });
      return;
    }
    if (!(await verifyOwnedAttachmentIds(userId, attachmentIds))) {
      res.status(403).json({ success: false, error: 'One or more attached files do not belong to your account.' });
      return;
    }

    const relatedOrderId = sanitizeText(req.body?.relatedOrderId, 80) || undefined;
    const relatedProjectId = sanitizeText(req.body?.relatedProjectId, 80) || undefined;
    if (relatedOrderId) {
      const ownedOrder = await repo.getOrderById(userId, relatedOrderId);
      if (!ownedOrder) {
        res.status(403).json({ success: false, error: 'Referenced order does not belong to your account.' });
        return;
      }
    }
    if (relatedProjectId) {
      const ownedProject = await repo.getProjectDetail(userId, relatedProjectId);
      if (!ownedProject) {
        res.status(403).json({ success: false, error: 'Referenced project does not belong to your account.' });
        return;
      }
    }

    const profile = await repo.getProfile(userId);
    const ticket = await repo.createSupportTicket({
      userId,
      senderName: profile?.fullName || req.portalUser!.email,
      category,
      subject,
      body,
      attachmentIds,
      relatedOrderId,
      relatedProjectId,
    });

    res.status(201).json({ success: true, ticket });
  });

  router.post('/support/:ticketId/reply', async (req: PortalAuthenticatedRequest, res: Response) => {
    const userId = req.portalUser!.id;
    const ticketId = sanitizeText(req.params.ticketId, 80);
    const body = sanitizeText(req.body?.body, 3000);
    const attachmentIds = Array.isArray(req.body?.attachmentIds)
      ? req.body.attachmentIds.map((id: unknown) => sanitizeText(id, 80)).filter(Boolean)
      : [];
    if (!body) {
      res.status(400).json({ success: false, error: 'Reply message is required.' });
      return;
    }
    if (!(await verifyOwnedAttachmentIds(userId, attachmentIds))) {
      res.status(403).json({ success: false, error: 'One or more attached files do not belong to your account.' });
      return;
    }
    const profile = await repo.getProfile(userId);
    const ticket = await repo.replySupportTicket(
      userId,
      ticketId,
      profile?.fullName || req.portalUser!.email,
      body,
      attachmentIds
    );
    if (!ticket) {
      res.status(404).json({ success: false, error: 'Support ticket not found.' });
      return;
    }
    res.status(200).json({ success: true, ticket });
  });

  // Notifications
  router.get('/notifications', async (req: PortalAuthenticatedRequest, res: Response) => {
    const notifications = await repo.listNotifications(req.portalUser!.id);
    res.status(200).json({ success: true, notifications });
  });

  router.post('/notifications/:id/read', async (req: PortalAuthenticatedRequest, res: Response) => {
    const ok = await repo.markNotificationRead(req.portalUser!.id, sanitizeText(req.params.id, 80));
    if (!ok) {
      res.status(404).json({ success: false, error: 'Notification not found.' });
      return;
    }
    res.status(200).json({ success: true });
  });

  router.post('/notifications/read-all', async (req: PortalAuthenticatedRequest, res: Response) => {
    await repo.markAllNotificationsRead(req.portalUser!.id);
    res.status(200).json({ success: true });
  });

  // Profile, Addresses & Settings
  router.get('/profile', async (req: PortalAuthenticatedRequest, res: Response) => {
    const userId = req.portalUser!.id;
    const [profile, addresses] = await Promise.all([repo.getProfile(userId), repo.listAddresses(userId)]);
    res.status(200).json({ success: true, profile, addresses });
  });

  router.patch('/profile', async (req: PortalAuthenticatedRequest, res: Response) => {
    const userId = req.portalUser!.id;
    const patch: Record<string, unknown> = {};
    if (typeof req.body?.firstName === 'string') patch.firstName = sanitizeText(req.body.firstName, 80);
    if (typeof req.body?.lastName === 'string') patch.lastName = sanitizeText(req.body.lastName, 80);
    if (typeof req.body?.phone === 'string') patch.phone = sanitizeText(req.body.phone, 40);
    if (typeof req.body?.companyName === 'string') patch.companyName = sanitizeText(req.body.companyName, 140);
    if (typeof req.body?.taxId === 'string') patch.taxId = sanitizeText(req.body.taxId, 60);
    if (typeof req.body?.timezone === 'string') patch.timezone = sanitizeText(req.body.timezone, 60);
    if (typeof req.body?.avatarUrl === 'string') {
      const cleanUrl = sanitizeText(req.body.avatarUrl, 400);
      if (!cleanUrl || /^https?:\/\//i.test(cleanUrl)) patch.avatarUrl = cleanUrl;
    }
    if (req.body?.preferredCurrency === 'USD' || req.body?.preferredCurrency === 'PHP') {
      patch.preferredCurrency = req.body.preferredCurrency;
    }
    if (req.body?.notificationPreferences && typeof req.body.notificationPreferences === 'object') {
      const np = req.body.notificationPreferences;
      patch.notificationPreferences = {
        emailOrders: Boolean(np.emailOrders),
        emailProjects: Boolean(np.emailProjects),
        emailMessages: Boolean(np.emailMessages),
        emailBilling: Boolean(np.emailBilling),
        inAppAll: Boolean(np.inAppAll),
      };
    }

    const profile = await repo.updateProfile(userId, patch);
    res.status(200).json({ success: true, profile });
  });

  router.post('/addresses', async (req: PortalAuthenticatedRequest, res: Response) => {
    const userId = req.portalUser!.id;
    const line1 = sanitizeText(req.body?.line1, 200);
    const city = sanitizeText(req.body?.city, 100);
    if (!line1 || !city) {
      res.status(400).json({ success: false, error: 'Street address and city are required.' });
      return;
    }
    const address = await repo.upsertAddress(userId, {
      id: sanitizeText(req.body?.id, 80) || undefined,
      label: sanitizeText(req.body?.label, 60) || 'Billing Address',
      line1,
      line2: sanitizeText(req.body?.line2, 200),
      city,
      stateProvince: sanitizeText(req.body?.stateProvince, 100),
      postalCode: sanitizeText(req.body?.postalCode, 30),
      country: sanitizeText(req.body?.country, 80) || 'Philippines',
      isDefault: Boolean(req.body?.isDefault),
    });
    res.status(200).json({ success: true, address });
  });

  router.delete('/addresses/:addressId', async (req: PortalAuthenticatedRequest, res: Response) => {
    const ok = await repo.deleteAddress(req.portalUser!.id, sanitizeText(req.params.addressId, 80));
    if (!ok) {
      res.status(404).json({ success: false, error: 'Address not found.' });
      return;
    }
    res.status(200).json({ success: true });
  });

  // Security Settings (Reauthentication Required for Sensitive Changes)
  router.get('/security/sessions', async (req: PortalAuthenticatedRequest, res: Response) => {
    const sessions = await repo.listUserSessions(req.portalUser!.id);
    res.status(200).json({
      success: true,
      sessions: sessions.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        expiresAt: s.expiresAt,
        isCurrent: s.tokenHash === req.portalSessionTokenHash,
      })),
    });
  });

  router.delete('/security/sessions/:sessionId', async (req: PortalAuthenticatedRequest, res: Response) => {
    const ok = await repo.revokeSessionById(req.portalUser!.id, sanitizeText(req.params.sessionId, 80));
    if (!ok) {
      res.status(404).json({ success: false, error: 'Session not found.' });
      return;
    }
    res.status(200).json({ success: true });
  });

  router.post('/security/change-password', async (req: PortalAuthenticatedRequest, res: Response) => {
    const user = req.portalUser!;
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      res.status(403).json({ success: false, error: 'Current password verification failed.' });
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      res.status(400).json({ success: false, error: 'New password must be between 8 and 128 characters.' });
      return;
    }
    await repo.updatePassword(user.id, hashPassword(newPassword));
    if (req.portalSessionTokenHash) {
      await repo.revokeOtherUserSessions(user.id, req.portalSessionTokenHash);
    }
    if (emailService) {
      const profile = await repo.getProfile(user.id);
      await emailService.sendPortalSecurityAlertEmail({
        to: user.email,
        fullName: profile?.fullName || user.email.split('@')[0],
        eventTitle: 'Client Portal Password Updated',
        eventDetails:
          'Your Client Portal password was changed from Security Settings and all other active sessions were signed out.',
        correlationId: (req as any).correlationId,
      });
    }
    res.status(200).json({
      success: true,
      message: 'Password updated successfully. All other active sessions have been signed out.',
    });
  });

  router.post('/security/request-email-change', async (req: PortalAuthenticatedRequest, res: Response) => {
    const user = req.portalUser!;
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newEmail = sanitizeText(req.body?.newEmail, 254).toLowerCase();
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      res.status(403).json({ success: false, error: 'Current password verification is required to change your email.' });
      return;
    }
    if (!isValidEmail(newEmail)) {
      res.status(400).json({ success: false, error: 'Please provide a valid new email address.' });
      return;
    }
    const taken = await repo.findUserByEmail(newEmail);
    if (taken && taken.id !== user.id) {
      res.status(409).json({ success: false, error: 'That email address is already registered.' });
      return;
    }
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await repo.requestEmailChange(user.id, newEmail, sha256Hex(token), expiresAt);
    const profile = await repo.getProfile(user.id);
    const emailDispatch = emailService
      ? await emailService.sendPortalEmailChangeEmail({
          to: newEmail,
          fullName: profile?.fullName || user.email.split('@')[0],
          confirmationToken: token,
          correlationId: (req as any).correlationId,
        })
      : { deliveryStatus: 'unconfigured' as const, provider: 'resend' };
    res.status(200).json({
      success: true,
      emailDelivery: emailDispatch,
      message:
        emailDispatch.deliveryStatus === 'provider_accepted'
          ? 'Verification email accepted for delivery to confirm your new email address.'
          : 'Verification code issued to confirm your new email address.',
      ...(isDevHelperEnabled ? { devEmailChangeToken: token } : {}),
    });
  });

  router.post('/security/confirm-email-change', async (req: PortalAuthenticatedRequest, res: Response) => {
    const token = sanitizeText(req.body?.token, 200);
    const updated = await repo.confirmEmailChange(req.portalUser!.id, sha256Hex(token));
    if (!updated) {
      res.status(400).json({ success: false, error: 'Invalid email change verification token.' });
      return;
    }
    res.status(200).json({ success: true, email: updated.email });
  });

  router.post('/security/request-closure', async (req: PortalAuthenticatedRequest, res: Response) => {
    const user = req.portalUser!;
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const reason = sanitizeText(req.body?.reason, 500);
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      res.status(403).json({ success: false, error: 'Password confirmation is required before requesting account closure.' });
      return;
    }
    const updated = await repo.requestAccountClosure(user.id, reason);
    res.status(200).json({
      success: true,
      accountStatus: updated.accountStatus,
      message: 'Account closure request submitted. Our compliance team will process closure while preserving statutory financial records.',
    });
  });

  // Permission-Scoped Client Portal Assistant (Read-Only Guidance + Commercial Policy Enforced)
  router.post('/assistant/ask', async (req: PortalAuthenticatedRequest, res: Response) => {
    const userId = req.portalUser!.id;
    const rawQuestion = sanitizeText(req.body?.question, 800);
    const question = rawQuestion.toLowerCase();
    if (!question) {
      res.status(400).json({ success: false, error: 'Please enter a question.' });
      return;
    }

    // 1. Authoritative Commercial Policy & Corporate Identity Guardrail Check
    const policy = classifyCommercialPolicyIntent(rawQuestion);
    if (policy.approvedResponse) {
      res.status(200).json({
        success: true,
        answer: policy.approvedResponse,
        suggestedRoute: policy.isPricingRestricted ? ROUTES.PORTAL.STORE : ROUTES.PORTAL.SUPPORT,
        policyEnforced: policy.isPricingRestricted,
        scopeNotice:
          'Read-only corporate guidance governed by DESTRIA TECH INC commercial policy. Informational only.',
      });
      return;
    }

    const [orders, projects, wallet, files, proposals] = await Promise.all([
      repo.listOrders(userId),
      repo.listProjects(userId),
      repo.getWallet(userId),
      repo.listAttachments(userId),
      repo.listApprovedProposals(userId),
    ]);

    let answer =
      'I can help you explore customized technology solution frameworks, submit service inquiries, check your approved proposals, track active project workspaces, locate private files, or contact Support Center. For official commercial inquiries, email info@destriatech.com or call +1 (307) 419-4277.';
    let suggestedRoute: string = ROUTES.PORTAL.STORE;

    if (question.includes('proposal') || question.includes('inquiry')) {
      answer =
        proposals.length > 0
          ? `You have ${proposals.length} authorized commercial proposal(s) on file. Review them in the Service Inquiries & Proposals workspace.`
          : 'You can initiate a customized enterprise Service Inquiry directly from the Technology Solutions Directory to request a consultation and formal proposal.';
      suggestedRoute = ROUTES.PORTAL.CART;
    } else if (question.includes('order') || question.includes('payment') || question.includes('invoice')) {
      answer =
        orders.length > 0
          ? `You currently have ${orders.length} authorized engagement order(s). Your latest record is ${orders[0].orderNumber} (${orders[0].fulfillmentStatus.replace(/_/g, ' ')}, payment: ${orders[0].paymentStatus.replace(/_/g, ' ')}). Payments are confirmed exclusively via verified server webhooks.`
          : 'You do not have an authorized engagement order yet. Explore our Technology Solutions Directory and submit a Service Inquiry to coordinate a consultation and formal proposal.';
      suggestedRoute = ROUTES.PORTAL.ORDERS;
    } else if (question.includes('credit') || question.includes('balance')) {
      answer = `Your authorized account ledger currently shows ${wallet.availableCredits.toLocaleString()} available credits, ${wallet.pendingCredits.toLocaleString()} pending credits, and ${wallet.usedCredits.toLocaleString()} used credits.`;
      suggestedRoute = ROUTES.PORTAL.CREDITS;
    } else if (question.includes('project') || question.includes('brief') || question.includes('revision')) {
      answer =
        projects.length > 0
          ? `You have ${projects.length} project workspace(s). Latest: ${projects[0].referenceNumber} — "${projects[0].title}" (${projects[0].progressPercent}% progress, ${projects[0].revisionsUsed}/${projects[0].revisionLimit} revisions used).`
          : 'You can create or review project requirements inside Project Workspaces once an engagement is initiated.';
      suggestedRoute = ROUTES.PORTAL.PROJECTS;
    } else if (question.includes('file') || question.includes('deliverable') || question.includes('download')) {
      answer = `You have ${files.length} private file(s) stored in your Deliverables & File Vault. All downloads use time-limited signed URLs restricted strictly to your account.`;
      suggestedRoute = ROUTES.PORTAL.FILES;
    } else if (question.includes('support') || question.includes('refund') || question.includes('help')) {
      answer =
        'For engagement support, authorized billing questions, or technical assistance, open a ticket in Support Center, email info@destriatech.com, or call +1 (307) 419-4277.';
      suggestedRoute = ROUTES.PORTAL.SUPPORT;
    }

    const enforced = enforceCommercialPolicyOnOutput(answer, rawQuestion);

    res.status(200).json({
      success: true,
      answer: enforced.replyText,
      suggestedRoute,
      policyEnforced: enforced.enforced,
      scopeNotice: 'Read-only client guidance scoped strictly to your authenticated account.',
    });
  });

  return router;
}
