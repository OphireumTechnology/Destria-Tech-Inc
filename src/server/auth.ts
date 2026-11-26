import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { DatabaseRepository, AdminUserRecord } from './db/types';
import { logStructured } from './logger';

export const ADMIN_SESSION_COOKIE_NAME = 'dti_admin_session';

export interface AuthenticatedAdminRequest extends Request {
  adminUser?: AdminUserRecord;
  adminAuthSource?: 'bearer' | 'cookie';
  adminRawToken?: string;
  correlationId?: string;
}

interface SessionTokenPayload {
  sub: string;
  email: string;
  role: 'admin' | 'super_admin';
  jti?: string;
  exp: number;
}

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(value);
      } catch {
        result[key] = value;
      }
    }
  }
  return result;
}

export function setAdminSessionCookie(
  req: Request,
  res: Response,
  token: string,
  maxAgeSeconds = 3600
): void {
  const isSecureContext =
    process.env.NODE_ENV === 'production' ||
    req.secure ||
    String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';

  const parts = [
    `${ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${Math.max(60, Math.floor(maxAgeSeconds))}`,
  ];
  if (isSecureContext) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.append('Set-Cookie', parts.join('; '));
}

export function clearAdminSessionCookie(req: Request, res: Response): void {
  const isSecureContext =
    process.env.NODE_ENV === 'production' ||
    req.secure ||
    String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';

  const parts = [
    `${ADMIN_SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (isSecureContext) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.append('Set-Cookie', parts.join('; '));
}

export class AdminAuthService {
  private readonly sessionSecret: string;
  private readonly revokedTokens = new Map<string, number>();

  constructor(private readonly db: DatabaseRepository, sessionSecret?: string) {
    // Only read from server environment; generate ephemeral random key in non-configured dev instances
    // so an attacker cannot forge tokens with a static fallback string.
    this.sessionSecret =
      sessionSecret ||
      process.env.ADMIN_SESSION_SECRET ||
      crypto.randomBytes(32).toString('hex');
  }

  private pruneRevokedTokens(): void {
    const nowSec = Math.floor(Date.now() / 1000);
    for (const [id, exp] of this.revokedTokens.entries()) {
      if (exp < nowSec) {
        this.revokedTokens.delete(id);
      }
    }
  }

  public isBootstrapLoginConfigured(): boolean {
    const email = (process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim();
    const pass = (process.env.ADMIN_BOOTSTRAP_PASSWORD || '').trim();
    return Boolean(email && pass && pass.length >= 12);
  }

  public issueSessionToken(admin: AdminUserRecord, ttlSeconds = 3600): string {
    const payload: SessionTokenPayload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      jti: crypto.randomBytes(12).toString('hex'),
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto
      .createHmac('sha256', this.sessionSecret)
      .update(encodedPayload)
      .digest('base64url');
    return `${encodedPayload}.${sig}`;
  }

  public revokeSessionToken(token: string): boolean {
    const payload = this.verifySessionToken(token);
    if (!payload) return false;
    this.pruneRevokedTokens();
    const key = payload.jti || crypto.createHash('sha256').update(token).digest('hex');
    this.revokedTokens.set(key, payload.exp);
    return true;
  }

  /**
   * Revokes an admin session token locally and durably in the backing database
   * (`admin_revoked_sessions`, migration 009) so logouts persist across restarts
   * and multiple backend replicas.
   */
  public async revokeSessionTokenDurable(
    token: string,
    reason = 'logout'
  ): Promise<{ revoked: boolean; durable: boolean }> {
    const payload = this.verifySessionToken(token);
    if (!payload) return { revoked: false, durable: false };
    this.pruneRevokedTokens();
    const key = payload.jti || crypto.createHash('sha256').update(token).digest('hex');
    this.revokedTokens.set(key, payload.exp);

    if (typeof this.db.revokeAdminSessionToken === 'function') {
      try {
        await this.db.revokeAdminSessionToken({
          jti: key,
          adminEmail: payload.email,
          expiresAtIso: new Date(payload.exp * 1000).toISOString(),
          reason,
        });
        return { revoked: true, durable: true };
      } catch (err: any) {
        logStructured('warn', 'admin_session_durable_revocation_failed', {
          email: payload.email,
          error: err?.message,
        });
        return { revoked: true, durable: false };
      }
    }
    return { revoked: true, durable: false };
  }

  public verifySessionToken(token: string): SessionTokenPayload | null {
    if (!token || !token.includes('.')) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encodedPayload, providedSig] = parts;

    const expectedSig = crypto
      .createHmac('sha256', this.sessionSecret)
      .update(encodedPayload)
      .digest('base64url');

    const providedBuf = Buffer.from(providedSig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (providedBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) return null;

    try {
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SessionTokenPayload;
      if (!payload || typeof payload.email !== 'string' || typeof payload.exp !== 'number') {
        return null;
      }
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }
      const key = payload.jti || crypto.createHash('sha256').update(token).digest('hex');
      if (this.revokedTokens.has(key)) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  public verifyBootstrapCredentials(email: string, password: string): boolean {
    const expectedEmail = (process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
    const expectedPass = (process.env.ADMIN_BOOTSTRAP_PASSWORD || '').trim();
    if (!expectedEmail || !expectedPass || expectedPass.length < 12) {
      return false;
    }
    const emailMatches = email.trim().toLowerCase() === expectedEmail;
    const passBuf = Buffer.from(password, 'utf8');
    const expectedBuf = Buffer.from(expectedPass, 'utf8');
    if (passBuf.length !== expectedBuf.length) {
      return false;
    }
    return emailMatches && crypto.timingSafeEqual(passBuf, expectedBuf);
  }

  public extractTokenFromRequest(req: Request): { token: string; source: 'bearer' | 'cookie' } | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length).trim();
      if (token) return { token, source: 'bearer' };
    }
    const cookies = parseCookieHeader(req.headers.cookie);
    const cookieToken = (cookies[ADMIN_SESSION_COOKIE_NAME] || '').trim();
    if (cookieToken) {
      return { token: cookieToken, source: 'cookie' };
    }
    return null;
  }

  public async resolveAuthenticatedPrincipal(req: Request): Promise<{
    authenticated: boolean;
    adminUser?: AdminUserRecord;
    identityEmail?: string;
    authSource?: 'bearer' | 'cookie';
    rawToken?: string;
  }> {
    const extracted = this.extractTokenFromRequest(req);
    if (!extracted) {
      return { authenticated: false };
    }
    const { token, source } = extracted;

    // 1. Check server-signed admin session token (+ durable multi-instance revocation store)
    const sessionPayload = this.verifySessionToken(token);
    if (sessionPayload) {
      const key = sessionPayload.jti || crypto.createHash('sha256').update(token).digest('hex');
      if (typeof this.db.isAdminSessionTokenRevoked === 'function') {
        try {
          const isRevokedDurably = await this.db.isAdminSessionTokenRevoked(key);
          if (isRevokedDurably) {
            this.revokedTokens.set(key, sessionPayload.exp);
            return { authenticated: false };
          }
        } catch (err: any) {
          logStructured('warn', 'admin_session_revocation_lookup_error', {
            error: err?.message,
          });
          if (process.env.NODE_ENV === 'production') {
            return { authenticated: false };
          }
        }
      }

      const adminRecord = await this.db.findActiveAdminByEmail(sessionPayload.email);
      if (adminRecord && (adminRecord.role === 'admin' || adminRecord.role === 'super_admin')) {
        return {
          authenticated: true,
          adminUser: adminRecord,
          identityEmail: adminRecord.email,
          authSource: source,
          rawToken: token,
        };
      }
      return {
        authenticated: true,
        identityEmail: sessionPayload.email,
        authSource: source,
        rawToken: token,
      };
    }

    // 2. Check Supabase-issued JWT via server-side auth.getUser(token) + admin_users RBAC lookup
    const supaUser = await this.db.verifySupabaseUserToken(token);
    if (supaUser) {
      const adminRecord = await this.db.findActiveAdminByEmail(supaUser.email, supaUser.id);
      if (adminRecord && adminRecord.isActive) {
        return {
          authenticated: true,
          adminUser: adminRecord,
          identityEmail: supaUser.email,
          authSource: source,
          rawToken: token,
        };
      }
      return {
        authenticated: true,
        identityEmail: supaUser.email,
        authSource: source,
        rawToken: token,
      };
    }

    return { authenticated: false };
  }

  public requireAdmin = async (
    req: AuthenticatedAdminRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const resolved = await this.resolveAuthenticatedPrincipal(req);
      if (!resolved.authenticated) {
        logStructured('warn', 'admin_auth_rejected_unauthenticated', {
          correlationId: req.correlationId,
          path: req.path,
          ip: req.ip,
        });
        res.status(401).json({
          success: false,
          code: 'UNAUTHORIZED',
          error: 'Authentication required to access administrative resources.',
        });
        return;
      }

      if (!resolved.adminUser) {
        logStructured('warn', 'admin_auth_forbidden_non_admin', {
          correlationId: req.correlationId,
          path: req.path,
          email: resolved.identityEmail,
          ip: req.ip,
        });
        res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          error: 'Insufficient privileges. Administrator role required.',
        });
        return;
      }

      // CSRF defense-in-depth on state-mutating requests authenticated exclusively via cookie
      const isMutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
      if (isMutating && resolved.authSource === 'cookie') {
        const xrw = String(req.headers['x-requested-with'] || '').trim();
        if (!xrw) {
          logStructured('warn', 'admin_csrf_header_missing', {
            correlationId: req.correlationId,
            path: req.path,
            email: resolved.adminUser.email,
          });
          res.status(403).json({
            success: false,
            code: 'CSRF_CHECK_FAILED',
            error: 'Missing required CSRF protection header on cookie-authenticated administrative mutation.',
          });
          return;
        }
      }

      req.adminUser = resolved.adminUser;
      req.adminAuthSource = resolved.authSource;
      req.adminRawToken = resolved.rawToken;
      next();
    } catch (err: any) {
      logStructured('error', 'admin_auth_middleware_error', {
        correlationId: req.correlationId,
        error: err?.message,
      });
      res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        error: 'Unable to validate administrative credentials.',
      });
    }
  };
}
