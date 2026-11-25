import crypto from 'crypto';
import { PaymentProviderId, PortalCurrency } from '../types';

export interface PaymentProviderConfigView {
  provider: PaymentProviderId;
  displayName: string;
  category: 'card' | 'ewallet' | 'international' | 'bank';
  description: string;
  supportedCurrencies: PortalCurrency[];
  paymentMethods: string[];
  mode: 'disabled' | 'sandbox' | 'live';
  isEnabled: boolean;
  integrationStatus:
    | 'configured_live'
    | 'configured_sandbox'
    | 'awaiting_credentials'
    | 'deferred_merchant_onboarding';
  webhookPath: string;
  requiredEnvVars: string[];
  lastVerifiedAt: string | null;
  unavailableMessage: string;
}

export interface PaymentInitiationRequest {
  orderId: string;
  orderNumber: string;
  amountMinor: number;
  currency: PortalCurrency;
  customerEmail: string;
  idempotencyKey: string;
  returnUrl: string;
  cancelUrl?: string;
}

export interface PaymentInitiationResult {
  initiated: boolean;
  provider: PaymentProviderId;
  environment: 'disabled' | 'sandbox' | 'live';
  providerTransactionId?: string;
  checkoutUrl?: string;
  httpStatus?: number;
  message: string;
}

export interface VerifiedWebhookPayload {
  verified: boolean;
  providerEventId?: string;
  orderId?: string;
  providerTransactionId?: string;
  amountMinor?: number;
  currency?: PortalCurrency;
  status?: 'paid' | 'failed' | 'refunded';
  error?: string;
}

export interface PaymentStatusVerificationResult {
  supported: boolean;
  verified: boolean;
  provider: PaymentProviderId;
  providerTransactionId: string;
  status: 'paid' | 'pending' | 'processing' | 'failed' | 'expired' | 'refunded' | 'unverified_provider_disabled' | 'verification_failed';
  rawStatus?: string;
  amountMinor?: number;
  currency?: PortalCurrency;
  httpStatus?: number;
  message: string;
}

export interface PaymentRefundRequest {
  providerTransactionId: string;
  amountMinor: number;
  currency: PortalCurrency;
  reason: string;
  idempotencyKey: string;
}

export interface PaymentRefundResult {
  supported: boolean;
  refunded: boolean;
  provider: PaymentProviderId;
  providerRefundId?: string;
  status: 'succeeded' | 'pending' | 'failed' | 'unsupported';
  httpStatus?: number;
  message: string;
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
export type GatewayFetchLike = FetchLike;

export interface PaymentProviderAdapter {
  readonly provider: PaymentProviderId;
  getConfig(): PaymentProviderConfigView;
  initiatePayment(req: PaymentInitiationRequest): Promise<PaymentInitiationResult>;
  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
    parsedBody: Record<string, unknown>
  ): VerifiedWebhookPayload;
  verifyPaymentStatus(providerTransactionId: string): Promise<PaymentStatusVerificationResult>;
  initiateRefund(
    providerTransactionIdOrReq: string | PaymentRefundRequest,
    amountMinor?: number,
    reason?: string
  ): Promise<PaymentRefundResult>;
}

const DEFAULT_GATEWAY_TIMEOUT_MS = 15_000;

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function getHeader(headers: Record<string, string | string[] | undefined>, name: string): string {
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) {
      return Array.isArray(v) ? String(v[0] || '') : String(v || '');
    }
  }
  return '';
}

function formatMajorAmount(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

function normalizeProviderStatus(raw: string): PaymentStatusVerificationResult['status'] {
  const s = raw.trim().toLowerCase();
  if (['paid', 'settled', 'completed', 'succeeded', 'captured', 'payment_success'].includes(s)) {
    return 'paid';
  }
  if (['refunded', 'partially_refunded'].includes(s)) return 'refunded';
  if (['expired', 'voided', 'cancelled', 'canceled'].includes(s)) return 'expired';
  if (['failed', 'declined', 'payment_failed'].includes(s)) return 'failed';
  if (['processing', 'authorized', 'approved', 'awaiting_capture'].includes(s)) return 'processing';
  return 'pending';
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_GATEWAY_TIMEOUT_MS
): Promise<{ ok: boolean; status: number; body: Record<string, any>; rawError?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const body = (await response.json().catch(() => ({}))) as Record<string, any>;
    return { ok: response.ok, status: response.status, body };
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError' || /abort|timeout/i.test(String(err?.message || ''));
    return {
      ok: false,
      status: 0,
      body: {},
      rawError: isTimeout
        ? `Payment gateway request timed out after ${timeoutMs}ms.`
        : err?.message || 'Network failure communicating with payment gateway.',
    };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeRefundArgs(
  providerTransactionIdOrReq: string | PaymentRefundRequest,
  amountMinor?: number,
  reason?: string
): PaymentRefundRequest {
  if (typeof providerTransactionIdOrReq === 'object') {
    return providerTransactionIdOrReq;
  }
  return {
    providerTransactionId: providerTransactionIdOrReq,
    amountMinor: Number(amountMinor || 0),
    currency: 'PHP',
    reason: reason || 'Authorized operations refund',
    idempotencyKey: `refund-${providerTransactionIdOrReq}-${amountMinor || 0}`,
  };
}

function buildWebhookVerifier(
  secretEnvVars: string[],
  signatureHeader: string,
  scheme: 'hmac_sha256' | 'static_token'
) {
  return (
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
    parsedBody: Record<string, unknown>
  ): VerifiedWebhookPayload => {
    const secret = secretEnvVars
      .map((name) => (process.env[name] || '').trim())
      .find(Boolean);
    if (!secret) {
      return {
        verified: false,
        error: `Webhook verification secret (${secretEnvVars[0]}) is not configured on the server.`,
      };
    }
    const provided = getHeader(headers, signatureHeader).trim();
    if (!provided) {
      return { verified: false, error: `Missing webhook signature header: ${signatureHeader}` };
    }
    let valid = false;
    if (scheme === 'static_token') {
      valid = constantTimeEquals(provided, secret);
    } else {
      const expectedHmac = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
      const cleanProvided = provided.replace(/^sha256=/i, '');
      valid = constantTimeEquals(cleanProvided, expectedHmac);
    }
    if (!valid) {
      return { verified: false, error: 'Webhook signature verification failed.' };
    }
    const providerEventId = String(parsedBody.eventId || parsedBody.id || '').trim();
    const orderId = String(parsedBody.orderId || parsedBody.external_id || '').trim();
    const providerTransactionId = String(
      parsedBody.transactionId || parsedBody.payment_id || providerEventId
    ).trim();
    const amountMinor = Number(parsedBody.amountMinor);
    const currency =
      parsedBody.currency === 'PHP' ? 'PHP' : parsedBody.currency === 'USD' ? 'USD' : undefined;
    const rawStatus = String(parsedBody.status || '').toLowerCase();
    const status =
      rawStatus === 'paid' || rawStatus === 'succeeded' || rawStatus === 'completed' || rawStatus === 'settled'
        ? 'paid'
        : rawStatus === 'refunded'
        ? 'refunded'
        : rawStatus === 'failed' || rawStatus === 'expired'
        ? 'failed'
        : undefined;

    if (!providerEventId || !orderId || !Number.isInteger(amountMinor) || amountMinor <= 0 || !currency || !status) {
      return { verified: false, error: 'Webhook payload is missing required verified transaction fields.' };
    }
    return {
      verified: true,
      providerEventId,
      orderId,
      providerTransactionId,
      amountMinor,
      currency,
      status,
    };
  };
}

function resolveModeAndCredentials(spec: {
  liveKeyEnvVar: string;
  testKeyEnvVar: string;
  liveWebhookEnvVar: string;
  testWebhookEnvVar: string;
  deferred?: boolean;
}): {
  mode: 'disabled' | 'sandbox' | 'live';
  integrationStatus: PaymentProviderConfigView['integrationStatus'];
  apiKey: string;
} {
  if (spec.deferred) {
    return {
      mode: 'disabled',
      integrationStatus: 'deferred_merchant_onboarding',
      apiKey: '',
    };
  }
  const liveEnabled = (process.env.PAYMENTS_LIVE_ENABLED || '').trim().toLowerCase() === 'true';
  const liveKey = (process.env[spec.liveKeyEnvVar] || '').trim();
  const liveWebhook = (process.env[spec.liveWebhookEnvVar] || '').trim();
  if (liveEnabled && liveKey && liveWebhook) {
    return { mode: 'live', integrationStatus: 'configured_live', apiKey: liveKey };
  }

  const testKey = (process.env[spec.testKeyEnvVar] || '').trim();
  const testWebhook = (process.env[spec.testWebhookEnvVar] || '').trim();
  if (testKey && testWebhook) {
    return { mode: 'sandbox', integrationStatus: 'configured_sandbox', apiKey: testKey };
  }

  return { mode: 'disabled', integrationStatus: 'awaiting_credentials', apiKey: '' };
}

function createXenditAdapter(fetchImpl: FetchLike): PaymentProviderAdapter {
  const verifyWebhook = buildWebhookVerifier(
    ['XENDIT_WEBHOOK_TOKEN_LIVE', 'XENDIT_WEBHOOK_TOKEN_TEST'],
    'x-callback-token',
    'static_token'
  );
  const baseUrl = (process.env.XENDIT_API_BASE_URL || 'https://api.xendit.co').replace(/\/+$/, '');

  const resolveAuth = () =>
    resolveModeAndCredentials({
      liveKeyEnvVar: 'XENDIT_SECRET_KEY_LIVE',
      testKeyEnvVar: 'XENDIT_SECRET_KEY_TEST',
      liveWebhookEnvVar: 'XENDIT_WEBHOOK_TOKEN_LIVE',
      testWebhookEnvVar: 'XENDIT_WEBHOOK_TOKEN_TEST',
    });

  return {
    provider: 'xendit',
    getConfig(): PaymentProviderConfigView {
      const { mode, integrationStatus } = resolveAuth();
      return {
        provider: 'xendit',
        displayName: 'Xendit (Philippines)',
        category: 'ewallet',
        description: 'Primary Philippine gateway supporting QR Ph, e-wallets, online banking, and cards upon merchant activation.',
        supportedCurrencies: ['PHP'],
        paymentMethods: ['QR Ph', 'GCash', 'Maya', 'Online Banking', 'Cards'],
        mode,
        isEnabled: mode !== 'disabled',
        integrationStatus,
        webhookPath: '/api/portal/webhooks/xendit',
        requiredEnvVars: ['XENDIT_SECRET_KEY_TEST', 'XENDIT_WEBHOOK_TOKEN_TEST'],
        lastVerifiedAt: null,
        unavailableMessage:
          'Xendit (Philippines) is awaiting verified merchant API credentials and webhook token configuration.',
      };
    },
    async initiatePayment(req: PaymentInitiationRequest): Promise<PaymentInitiationResult> {
      const { mode, apiKey } = resolveAuth();
      if (mode === 'disabled' || !apiKey) {
        return {
          initiated: false,
          provider: 'xendit',
          environment: 'disabled',
          message: this.getConfig().unavailableMessage,
        };
      }
      if (!Number.isInteger(req.amountMinor) || req.amountMinor <= 0) {
        return {
          initiated: false,
          provider: 'xendit',
          environment: mode,
          message: 'Payment amount must be a positive integer in minor currency units.',
        };
      }
      const basicAuth = Buffer.from(`${apiKey}:`).toString('base64');
      const res = await fetchWithTimeout(fetchImpl, `${baseUrl}/v2/invoices`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': req.idempotencyKey,
        },
        body: JSON.stringify({
          external_id: req.orderId,
          amount: Number(formatMajorAmount(req.amountMinor)),
          currency: req.currency,
          payer_email: req.customerEmail,
          description: `DESTRIA TECH INC Order ${req.orderNumber}`,
          success_redirect_url: req.returnUrl,
          failure_redirect_url: req.cancelUrl || req.returnUrl,
        }),
      });

      const txnId = typeof res.body.id === 'string' ? res.body.id.trim() : '';
      const checkoutUrl = typeof res.body.invoice_url === 'string' ? res.body.invoice_url.trim() : '';

      if (!res.ok || !txnId || !checkoutUrl) {
        return {
          initiated: false,
          provider: 'xendit',
          environment: mode,
          httpStatus: res.status || undefined,
          message:
            res.rawError ||
            res.body.message ||
            `Xendit invoice creation failed (HTTP ${res.status}) or omitted hosted checkout URL.`,
        };
      }

      return {
        initiated: true,
        provider: 'xendit',
        environment: mode,
        providerTransactionId: txnId,
        checkoutUrl,
        httpStatus: res.status,
        message: `Xendit ${mode} hosted checkout session created.`,
      };
    },
    verifyWebhook,
    async verifyPaymentStatus(providerTransactionId: string): Promise<PaymentStatusVerificationResult> {
      const { mode, apiKey } = resolveAuth();
      if (mode === 'disabled' || !apiKey) {
        return {
          supported: false,
          verified: false,
          provider: 'xendit',
          providerTransactionId,
          status: 'unverified_provider_disabled',
          message: 'Xendit server-to-server status verification requires configured merchant API credentials.',
        };
      }
      const basicAuth = Buffer.from(`${apiKey}:`).toString('base64');
      const res = await fetchWithTimeout(
        fetchImpl,
        `${baseUrl}/v2/invoices/${encodeURIComponent(providerTransactionId)}`,
        {
          method: 'GET',
          headers: { Authorization: `Basic ${basicAuth}` },
        }
      );
      if (!res.ok || typeof res.body.status !== 'string') {
        return {
          supported: true,
          verified: false,
          provider: 'xendit',
          providerTransactionId,
          status: 'verification_failed',
          httpStatus: res.status || undefined,
          message: res.rawError || res.body.message || `Xendit status lookup failed (HTTP ${res.status}).`,
        };
      }
      const normalized = normalizeProviderStatus(res.body.status);
      const amountMinor =
        typeof res.body.amount === 'number' && Number.isFinite(res.body.amount)
          ? Math.round(res.body.amount * 100)
          : undefined;
      const currency = res.body.currency === 'PHP' || res.body.currency === 'USD' ? res.body.currency : undefined;
      return {
        supported: true,
        verified: true,
        provider: 'xendit',
        providerTransactionId,
        status: normalized,
        rawStatus: res.body.status,
        amountMinor,
        currency,
        httpStatus: res.status,
        message: `Verified Xendit invoice status: ${res.body.status}.`,
      };
    },
    async initiateRefund(
      providerTransactionIdOrReq: string | PaymentRefundRequest,
      amountMinor?: number,
      reason?: string
    ): Promise<PaymentRefundResult> {
      const req = normalizeRefundArgs(providerTransactionIdOrReq, amountMinor, reason);
      const { mode, apiKey } = resolveAuth();
      if (mode === 'disabled' || !apiKey) {
        return {
          supported: false,
          refunded: false,
          provider: 'xendit',
          status: 'unsupported',
          message: 'Xendit refund processing requires configured merchant API credentials.',
        };
      }
      if (!Number.isInteger(req.amountMinor) || req.amountMinor <= 0) {
        return {
          supported: true,
          refunded: false,
          provider: 'xendit',
          status: 'failed',
          message: 'Refund amount must be a positive integer in minor currency units.',
        };
      }
      const basicAuth = Buffer.from(`${apiKey}:`).toString('base64');
      const res = await fetchWithTimeout(fetchImpl, `${baseUrl}/refunds`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': req.idempotencyKey,
        },
        body: JSON.stringify({
          invoice_id: req.providerTransactionId,
          amount: Number(formatMajorAmount(req.amountMinor)),
          currency: req.currency,
          reason: 'REQUESTED_BY_CUSTOMER',
          metadata: { operationsReason: req.reason },
        }),
      });
      const refundId = typeof res.body.id === 'string' ? res.body.id.trim() : '';
      if (!res.ok || !refundId) {
        return {
          supported: true,
          refunded: false,
          provider: 'xendit',
          status: 'failed',
          httpStatus: res.status || undefined,
          message: res.rawError || res.body.message || `Xendit refund failed (HTTP ${res.status}).`,
        };
      }
      const rawStatus = String(res.body.status || 'SUCCEEDED').toLowerCase();
      return {
        supported: true,
        refunded: rawStatus === 'succeeded' || rawStatus === 'pending',
        provider: 'xendit',
        providerRefundId: refundId,
        status: rawStatus === 'pending' ? 'pending' : 'succeeded',
        httpStatus: res.status,
        message: `Xendit refund ${refundId} accepted (${res.body.status || 'SUCCEEDED'}).`,
      };
    },
  };
}

function createPayPalAdapter(fetchImpl: FetchLike): PaymentProviderAdapter {
  const verifyWebhook = buildWebhookVerifier(
    ['PAYPAL_WEBHOOK_SECRET_LIVE', 'PAYPAL_WEBHOOK_SECRET_SANDBOX'],
    'x-paypal-webhook-signature',
    'hmac_sha256'
  );

  const resolveAuth = () => {
    const resolved = resolveModeAndCredentials({
      liveKeyEnvVar: 'PAYPAL_CLIENT_SECRET_LIVE',
      testKeyEnvVar: 'PAYPAL_CLIENT_SECRET_SANDBOX',
      liveWebhookEnvVar: 'PAYPAL_WEBHOOK_SECRET_LIVE',
      testWebhookEnvVar: 'PAYPAL_WEBHOOK_SECRET_SANDBOX',
    });
    const clientId = (
      (resolved.mode === 'live'
        ? process.env.PAYPAL_CLIENT_ID_LIVE || process.env.PAYPAL_CLIENT_ID
        : process.env.PAYPAL_CLIENT_ID_SANDBOX || process.env.PAYPAL_CLIENT_ID || 'sandbox-client') || ''
    ).trim();
    const baseUrl = (
      resolved.mode === 'live'
        ? process.env.PAYPAL_API_BASE_URL || 'https://api-m.paypal.com'
        : process.env.PAYPAL_API_BASE_URL || 'https://api-m.sandbox.paypal.com'
    ).replace(/\/+$/, '');
    return { ...resolved, clientId, baseUrl };
  };

  async function obtainAccessToken(baseUrl: string, clientId: string, clientSecret: string): Promise<string | null> {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenRes = await fetchWithTimeout(fetchImpl, `${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!tokenRes.ok || typeof tokenRes.body.access_token !== 'string') return null;
    return tokenRes.body.access_token.trim() || null;
  }

  return {
    provider: 'paypal',
    getConfig(): PaymentProviderConfigView {
      const { mode, integrationStatus } = resolveAuth();
      return {
        provider: 'paypal',
        displayName: 'PayPal',
        category: 'international',
        description: 'International hosted checkout supporting USD and PHP commercial settlements.',
        supportedCurrencies: ['USD', 'PHP'],
        paymentMethods: ['PayPal Balance', 'International Cards'],
        mode,
        isEnabled: mode !== 'disabled',
        integrationStatus,
        webhookPath: '/api/portal/webhooks/paypal',
        requiredEnvVars: ['PAYPAL_CLIENT_SECRET_SANDBOX', 'PAYPAL_WEBHOOK_SECRET_SANDBOX'],
        lastVerifiedAt: null,
        unavailableMessage:
          'PayPal hosted checkout is awaiting verified merchant API credentials and webhook secret configuration.',
      };
    },
    async initiatePayment(req: PaymentInitiationRequest): Promise<PaymentInitiationResult> {
      const { mode, apiKey, clientId, baseUrl } = resolveAuth();
      if (mode === 'disabled' || !apiKey) {
        return {
          initiated: false,
          provider: 'paypal',
          environment: 'disabled',
          message: this.getConfig().unavailableMessage,
        };
      }
      const accessToken = await obtainAccessToken(baseUrl, clientId, apiKey);
      if (!accessToken) {
        return {
          initiated: false,
          provider: 'paypal',
          environment: mode,
          message: 'PayPal OAuth2 token acquisition failed.',
        };
      }
      const res = await fetchWithTimeout(fetchImpl, `${baseUrl}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': req.idempotencyKey,
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [
            {
              reference_id: req.orderId,
              custom_id: req.orderNumber,
              amount: {
                currency_code: req.currency,
                value: formatMajorAmount(req.amountMinor),
              },
            },
          ],
          application_context: {
            brand_name: 'DESTRIA TECH INC',
            return_url: req.returnUrl,
            cancel_url: req.cancelUrl || req.returnUrl,
          },
        }),
      });
      const txnId = typeof res.body.id === 'string' ? res.body.id.trim() : '';
      const approveLink = Array.isArray(res.body.links)
        ? res.body.links.find((l: any) => l?.rel === 'approve' && typeof l?.href === 'string')?.href
        : '';
      if (!res.ok || !txnId || !approveLink) {
        return {
          initiated: false,
          provider: 'paypal',
          environment: mode,
          httpStatus: res.status || undefined,
          message:
            res.rawError ||
            res.body.message ||
            `PayPal order creation failed (HTTP ${res.status}) or omitted approval URL.`,
        };
      }
      return {
        initiated: true,
        provider: 'paypal',
        environment: mode,
        providerTransactionId: txnId,
        checkoutUrl: approveLink,
        httpStatus: res.status,
        message: `PayPal ${mode} hosted checkout order created.`,
      };
    },
    verifyWebhook,
    async verifyPaymentStatus(providerTransactionId: string): Promise<PaymentStatusVerificationResult> {
      const { mode, apiKey, clientId, baseUrl } = resolveAuth();
      if (mode === 'disabled' || !apiKey) {
        return {
          supported: false,
          verified: false,
          provider: 'paypal',
          providerTransactionId,
          status: 'unverified_provider_disabled',
          message: 'PayPal server-to-server verification requires active API credentials.',
        };
      }
      const accessToken = await obtainAccessToken(baseUrl, clientId, apiKey);
      if (!accessToken) {
        return {
          supported: true,
          verified: false,
          provider: 'paypal',
          providerTransactionId,
          status: 'verification_failed',
          message: 'PayPal OAuth2 authentication failed during status verification.',
        };
      }
      const res = await fetchWithTimeout(
        fetchImpl,
        `${baseUrl}/v2/checkout/orders/${encodeURIComponent(providerTransactionId)}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (!res.ok || typeof res.body.status !== 'string') {
        return {
          supported: true,
          verified: false,
          provider: 'paypal',
          providerTransactionId,
          status: 'verification_failed',
          httpStatus: res.status || undefined,
          message: res.rawError || res.body.message || `PayPal order lookup failed (HTTP ${res.status}).`,
        };
      }
      const unitAmt = res.body.purchase_units?.[0]?.amount;
      const amountMinor =
        unitAmt?.value && Number.isFinite(Number(unitAmt.value))
          ? Math.round(Number(unitAmt.value) * 100)
          : undefined;
      const currency =
        unitAmt?.currency_code === 'PHP' || unitAmt?.currency_code === 'USD'
          ? unitAmt.currency_code
          : undefined;
      return {
        supported: true,
        verified: true,
        provider: 'paypal',
        providerTransactionId,
        status: normalizeProviderStatus(res.body.status),
        rawStatus: res.body.status,
        amountMinor,
        currency,
        httpStatus: res.status,
        message: `Verified PayPal order status: ${res.body.status}.`,
      };
    },
    async initiateRefund(
      providerTransactionIdOrReq: string | PaymentRefundRequest,
      amountMinor?: number,
      reason?: string
    ): Promise<PaymentRefundResult> {
      const req = normalizeRefundArgs(providerTransactionIdOrReq, amountMinor, reason);
      const { mode, apiKey, clientId, baseUrl } = resolveAuth();
      if (mode === 'disabled' || !apiKey) {
        return {
          supported: false,
          refunded: false,
          provider: 'paypal',
          status: 'unsupported',
          message: 'PayPal refund processing requires configured merchant credentials.',
        };
      }
      const accessToken = await obtainAccessToken(baseUrl, clientId, apiKey);
      if (!accessToken) {
        return {
          supported: true,
          refunded: false,
          provider: 'paypal',
          status: 'failed',
          message: 'PayPal OAuth2 authentication failed during refund processing.',
        };
      }
      const res = await fetchWithTimeout(
        fetchImpl,
        `${baseUrl}/v2/payments/captures/${encodeURIComponent(req.providerTransactionId)}/refund`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'PayPal-Request-Id': req.idempotencyKey,
          },
          body: JSON.stringify({
            amount: {
              value: formatMajorAmount(req.amountMinor),
              currency_code: req.currency,
            },
            note_to_payer: req.reason.slice(0, 255),
          }),
        }
      );
      const refundId = typeof res.body.id === 'string' ? res.body.id.trim() : '';
      if (!res.ok || !refundId) {
        return {
          supported: true,
          refunded: false,
          provider: 'paypal',
          status: 'failed',
          httpStatus: res.status || undefined,
          message: res.rawError || res.body.message || `PayPal refund failed (HTTP ${res.status}).`,
        };
      }
      const rawStatus = String(res.body.status || 'COMPLETED').toLowerCase();
      return {
        supported: true,
        refunded: rawStatus === 'completed' || rawStatus === 'pending',
        provider: 'paypal',
        providerRefundId: refundId,
        status: rawStatus === 'pending' ? 'pending' : 'succeeded',
        httpStatus: res.status,
        message: `PayPal refund ${refundId} processed (${res.body.status || 'COMPLETED'}).`,
      };
    },
  };
}

function createMayaAdapter(fetchImpl: FetchLike): PaymentProviderAdapter {
  const verifyWebhook = buildWebhookVerifier(
    ['MAYA_WEBHOOK_SECRET_LIVE', 'MAYA_WEBHOOK_SECRET_TEST'],
    'x-maya-signature',
    'hmac_sha256'
  );

  const resolveAuth = () => {
    const resolved = resolveModeAndCredentials({
      liveKeyEnvVar: 'MAYA_SECRET_KEY_LIVE',
      testKeyEnvVar: 'MAYA_SECRET_KEY_TEST',
      liveWebhookEnvVar: 'MAYA_WEBHOOK_SECRET_LIVE',
      testWebhookEnvVar: 'MAYA_WEBHOOK_SECRET_TEST',
    });
    const baseUrl = (
      resolved.mode === 'live'
        ? process.env.MAYA_API_BASE_URL || 'https://pg.paymaya.com'
        : process.env.MAYA_API_BASE_URL || 'https://pg-sandbox.paymaya.com'
    ).replace(/\/+$/, '');
    return { ...resolved, baseUrl };
  };

  return {
    provider: 'maya',
    getConfig(): PaymentProviderConfigView {
      const { mode, integrationStatus } = resolveAuth();
      return {
        provider: 'maya',
        displayName: 'Maya Checkout',
        category: 'ewallet',
        description: 'Direct Maya Wallet, QR Ph, and card checkout prepared for Philippine merchant settlements.',
        supportedCurrencies: ['PHP'],
        paymentMethods: ['Maya Wallet', 'QR Ph', 'Cards'],
        mode,
        isEnabled: mode !== 'disabled',
        integrationStatus,
        webhookPath: '/api/portal/webhooks/maya',
        requiredEnvVars: ['MAYA_SECRET_KEY_TEST', 'MAYA_WEBHOOK_SECRET_TEST'],
        lastVerifiedAt: null,
        unavailableMessage:
          'Maya Checkout is awaiting verified merchant API credentials and webhook secret configuration.',
      };
    },
    async initiatePayment(req: PaymentInitiationRequest): Promise<PaymentInitiationResult> {
      const { mode, apiKey, baseUrl } = resolveAuth();
      if (mode === 'disabled' || !apiKey) {
        return {
          initiated: false,
          provider: 'maya',
          environment: 'disabled',
          message: this.getConfig().unavailableMessage,
        };
      }
      const basicAuth = Buffer.from(`${apiKey}:`).toString('base64');
      const res = await fetchWithTimeout(fetchImpl, `${baseUrl}/checkout/v1/checkouts`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': req.idempotencyKey,
        },
        body: JSON.stringify({
          totalAmount: {
            value: Number(formatMajorAmount(req.amountMinor)),
            currency: req.currency,
          },
          buyer: { contact: { email: req.customerEmail } },
          requestReferenceNumber: req.orderId,
          redirectUrl: {
            success: req.returnUrl,
            failure: req.cancelUrl || req.returnUrl,
            cancel: req.cancelUrl || req.returnUrl,
          },
        }),
      });
      const txnId = typeof res.body.checkoutId === 'string' ? res.body.checkoutId.trim() : '';
      const checkoutUrl = typeof res.body.redirectUrl === 'string' ? res.body.redirectUrl.trim() : '';
      if (!res.ok || !txnId || !checkoutUrl) {
        return {
          initiated: false,
          provider: 'maya',
          environment: mode,
          httpStatus: res.status || undefined,
          message:
            res.rawError ||
            res.body.message ||
            `Maya checkout creation failed (HTTP ${res.status}) or omitted redirect URL.`,
        };
      }
      return {
        initiated: true,
        provider: 'maya',
        environment: mode,
        providerTransactionId: txnId,
        checkoutUrl,
        httpStatus: res.status,
        message: `Maya ${mode} hosted checkout session created.`,
      };
    },
    verifyWebhook,
    async verifyPaymentStatus(providerTransactionId: string): Promise<PaymentStatusVerificationResult> {
      const { mode, apiKey, baseUrl } = resolveAuth();
      if (mode === 'disabled' || !apiKey) {
        return {
          supported: false,
          verified: false,
          provider: 'maya',
          providerTransactionId,
          status: 'unverified_provider_disabled',
          message: 'Maya server-to-server status verification requires configured merchant credentials.',
        };
      }
      const basicAuth = Buffer.from(`${apiKey}:`).toString('base64');
      const res = await fetchWithTimeout(
        fetchImpl,
        `${baseUrl}/payments/v1/payments/${encodeURIComponent(providerTransactionId)}`,
        {
          method: 'GET',
          headers: { Authorization: `Basic ${basicAuth}` },
        }
      );
      if (!res.ok || typeof res.body.status !== 'string') {
        return {
          supported: true,
          verified: false,
          provider: 'maya',
          providerTransactionId,
          status: 'verification_failed',
          httpStatus: res.status || undefined,
          message: res.rawError || res.body.message || `Maya status lookup failed (HTTP ${res.status}).`,
        };
      }
      return {
        supported: true,
        verified: true,
        provider: 'maya',
        providerTransactionId,
        status: normalizeProviderStatus(res.body.status),
        rawStatus: res.body.status,
        httpStatus: res.status,
        message: `Verified Maya payment status: ${res.body.status}.`,
      };
    },
    async initiateRefund(
      providerTransactionIdOrReq: string | PaymentRefundRequest,
      amountMinor?: number,
      reason?: string
    ): Promise<PaymentRefundResult> {
      const req = normalizeRefundArgs(providerTransactionIdOrReq, amountMinor, reason);
      const { mode, apiKey, baseUrl } = resolveAuth();
      if (mode === 'disabled' || !apiKey) {
        return {
          supported: false,
          refunded: false,
          provider: 'maya',
          status: 'unsupported',
          message: 'Maya refund processing requires configured merchant credentials.',
        };
      }
      const basicAuth = Buffer.from(`${apiKey}:`).toString('base64');
      const res = await fetchWithTimeout(
        fetchImpl,
        `${baseUrl}/payments/v1/payments/${encodeURIComponent(req.providerTransactionId)}/refunds`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': req.idempotencyKey,
          },
          body: JSON.stringify({
            totalAmount: {
              amount: formatMajorAmount(req.amountMinor),
              currency: req.currency,
            },
            reason: req.reason,
            requestReferenceNumber: req.idempotencyKey,
          }),
        }
      );
      const refundId = typeof res.body.id === 'string' ? res.body.id.trim() : '';
      if (!res.ok || !refundId) {
        return {
          supported: true,
          refunded: false,
          provider: 'maya',
          status: 'failed',
          httpStatus: res.status || undefined,
          message: res.rawError || res.body.message || `Maya refund failed (HTTP ${res.status}).`,
        };
      }
      return {
        supported: true,
        refunded: true,
        provider: 'maya',
        providerRefundId: refundId,
        status: 'succeeded',
        httpStatus: res.status,
        message: `Maya refund ${refundId} accepted.`,
      };
    },
  };
}

function createPayMongoAdapter(fetchImpl: FetchLike): PaymentProviderAdapter {
  const verifyWebhook = buildWebhookVerifier(
    ['PAYMONGO_WEBHOOK_SECRET_LIVE', 'PAYMONGO_WEBHOOK_SECRET_TEST'],
    'paymongo-signature',
    'hmac_sha256'
  );
  const baseUrl = (process.env.PAYMONGO_API_BASE_URL || 'https://api.paymongo.com/v1').replace(/\/+$/, '');

  const resolveAuth = () =>
    resolveModeAndCredentials({
      liveKeyEnvVar: 'PAYMONGO_SECRET_KEY_LIVE',
      testKeyEnvVar: 'PAYMONGO_SECRET_KEY_TEST',
      liveWebhookEnvVar: 'PAYMONGO_WEBHOOK_SECRET_LIVE',
      testWebhookEnvVar: 'PAYMONGO_WEBHOOK_SECRET_TEST',
    });

  return {
    provider: 'paymongo',
    getConfig(): PaymentProviderConfigView {
      const { mode, integrationStatus } = resolveAuth();
      return {
        provider: 'paymongo',
        displayName: 'PayMongo',
        category: 'ewallet',
        description: 'Philippine payment gateway supporting GCash, Maya, GrabPay, and cards upon merchant onboarding.',
        supportedCurrencies: ['PHP'],
        paymentMethods: ['GCash', 'Maya', 'GrabPay', 'Cards'],
        mode,
        isEnabled: mode !== 'disabled',
        integrationStatus,
        webhookPath: '/api/portal/webhooks/paymongo',
        requiredEnvVars: ['PAYMONGO_SECRET_KEY_TEST', 'PAYMONGO_WEBHOOK_SECRET_TEST'],
        lastVerifiedAt: null,
        unavailableMessage:
          'PayMongo is awaiting verified merchant API credentials and webhook secret configuration.',
      };
    },
    async initiatePayment(req: PaymentInitiationRequest): Promise<PaymentInitiationResult> {
      const { mode, apiKey } = resolveAuth();
      if (mode === 'disabled' || !apiKey) {
        return {
          initiated: false,
          provider: 'paymongo',
          environment: 'disabled',
          message: this.getConfig().unavailableMessage,
        };
      }
      const basicAuth = Buffer.from(`${apiKey}:`).toString('base64');
      const res = await fetchWithTimeout(fetchImpl, `${baseUrl}/checkout_sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': req.idempotencyKey,
        },
        body: JSON.stringify({
          data: {
            attributes: {
              reference_number: req.orderNumber,
              description: `DESTRIA TECH INC Order ${req.orderNumber}`,
              line_items: [
                {
                  currency: req.currency,
                  amount: req.amountMinor,
                  name: `Order ${req.orderNumber}`,
                  quantity: 1,
                },
              ],
              payment_method_types: ['gcash', 'paymaya', 'grab_pay', 'card'],
              success_url: req.returnUrl,
              cancel_url: req.cancelUrl || req.returnUrl,
              metadata: { orderId: req.orderId, customerEmail: req.customerEmail },
            },
          },
        }),
      });
      const txnId = typeof res.body?.data?.id === 'string' ? res.body.data.id.trim() : '';
      const checkoutUrl =
        typeof res.body?.data?.attributes?.checkout_url === 'string'
          ? res.body.data.attributes.checkout_url.trim()
          : '';
      if (!res.ok || !txnId || !checkoutUrl) {
        return {
          initiated: false,
          provider: 'paymongo',
          environment: mode,
          httpStatus: res.status || undefined,
          message:
            res.rawError ||
            res.body?.errors?.[0]?.detail ||
            `PayMongo checkout session creation failed (HTTP ${res.status}).`,
        };
      }
      return {
        initiated: true,
        provider: 'paymongo',
        environment: mode,
        providerTransactionId: txnId,
        checkoutUrl,
        httpStatus: res.status,
        message: `PayMongo ${mode} checkout session created.`,
      };
    },
    verifyWebhook,
    async verifyPaymentStatus(providerTransactionId: string): Promise<PaymentStatusVerificationResult> {
      const { mode, apiKey } = resolveAuth();
      if (mode === 'disabled' || !apiKey) {
        return {
          supported: false,
          verified: false,
          provider: 'paymongo',
          providerTransactionId,
          status: 'unverified_provider_disabled',
          message: 'PayMongo status verification requires configured merchant API credentials.',
        };
      }
      const basicAuth = Buffer.from(`${apiKey}:`).toString('base64');
      const res = await fetchWithTimeout(
        fetchImpl,
        `${baseUrl}/checkout_sessions/${encodeURIComponent(providerTransactionId)}`,
        {
          method: 'GET',
          headers: { Authorization: `Basic ${basicAuth}` },
        }
      );
      const attrs = res.body?.data?.attributes;
      const rawStatus = String(attrs?.payment_intent?.attributes?.status || attrs?.status || '').trim();
      if (!res.ok || !rawStatus) {
        return {
          supported: true,
          verified: false,
          provider: 'paymongo',
          providerTransactionId,
          status: 'verification_failed',
          httpStatus: res.status || undefined,
          message: res.rawError || `PayMongo status verification failed (HTTP ${res.status}).`,
        };
      }
      return {
        supported: true,
        verified: true,
        provider: 'paymongo',
        providerTransactionId,
        status: normalizeProviderStatus(rawStatus),
        rawStatus,
        httpStatus: res.status,
        message: `Verified PayMongo checkout status: ${rawStatus}.`,
      };
    },
    async initiateRefund(
      providerTransactionIdOrReq: string | PaymentRefundRequest,
      amountMinor?: number,
      reason?: string
    ): Promise<PaymentRefundResult> {
      const req = normalizeRefundArgs(providerTransactionIdOrReq, amountMinor, reason);
      const { mode, apiKey } = resolveAuth();
      if (mode === 'disabled' || !apiKey) {
        return {
          supported: false,
          refunded: false,
          provider: 'paymongo',
          status: 'unsupported',
          message: 'PayMongo refund processing requires configured merchant credentials.',
        };
      }
      const basicAuth = Buffer.from(`${apiKey}:`).toString('base64');
      const res = await fetchWithTimeout(fetchImpl, `${baseUrl}/refunds`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': req.idempotencyKey,
        },
        body: JSON.stringify({
          data: {
            attributes: {
              amount: req.amountMinor,
              payment_id: req.providerTransactionId,
              reason: 'requested_by_customer',
              notes: req.reason,
            },
          },
        }),
      });
      const refundId = typeof res.body?.data?.id === 'string' ? res.body.data.id.trim() : '';
      if (!res.ok || !refundId) {
        return {
          supported: true,
          refunded: false,
          provider: 'paymongo',
          status: 'failed',
          httpStatus: res.status || undefined,
          message: res.rawError || res.body?.errors?.[0]?.detail || `PayMongo refund failed (HTTP ${res.status}).`,
        };
      }
      return {
        supported: true,
        refunded: true,
        provider: 'paymongo',
        providerRefundId: refundId,
        status: 'succeeded',
        httpStatus: res.status,
        message: `PayMongo refund ${refundId} created.`,
      };
    },
  };
}

function createHostedCardAdapter(
  provider: 'credit_card' | 'debit_card',
  displayName: string,
  description: string,
  paymentMethods: string[],
  fetchImpl: FetchLike
): PaymentProviderAdapter {
  const verifyWebhook = buildWebhookVerifier(
    ['CARD_GATEWAY_WEBHOOK_SECRET_LIVE', 'CARD_GATEWAY_WEBHOOK_SECRET_TEST'],
    'x-gateway-signature',
    'hmac_sha256'
  );

  const resolveAuth = () => {
    const resolved = resolveModeAndCredentials({
      liveKeyEnvVar: 'CARD_GATEWAY_SECRET_KEY_LIVE',
      testKeyEnvVar: 'CARD_GATEWAY_SECRET_KEY_TEST',
      liveWebhookEnvVar: 'CARD_GATEWAY_WEBHOOK_SECRET_LIVE',
      testWebhookEnvVar: 'CARD_GATEWAY_WEBHOOK_SECRET_TEST',
    });
    const baseUrl = (process.env.CARD_GATEWAY_BASE_URL || '').trim().replace(/\/+$/, '');
    return { ...resolved, baseUrl };
  };

  return {
    provider,
    getConfig(): PaymentProviderConfigView {
      const { mode, integrationStatus } = resolveAuth();
      return {
        provider,
        displayName,
        category: 'card',
        description,
        supportedCurrencies: ['USD', 'PHP'],
        paymentMethods,
        mode,
        isEnabled: mode !== 'disabled',
        integrationStatus,
        webhookPath: `/api/portal/webhooks/${provider}`,
        requiredEnvVars: ['CARD_GATEWAY_SECRET_KEY_TEST', 'CARD_GATEWAY_WEBHOOK_SECRET_TEST', 'CARD_GATEWAY_BASE_URL'],
        lastVerifiedAt: null,
        unavailableMessage: `${displayName} is awaiting verified PCI-compliant acquiring gateway credentials and endpoint configuration.`,
      };
    },
    async initiatePayment(req: PaymentInitiationRequest): Promise<PaymentInitiationResult> {
      const { mode, apiKey, baseUrl } = resolveAuth();
      if (mode === 'disabled' || !apiKey || !baseUrl) {
        return {
          initiated: false,
          provider,
          environment: 'disabled',
          message: this.getConfig().unavailableMessage,
        };
      }
      const res = await fetchWithTimeout(fetchImpl, `${baseUrl}/v1/checkout/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': req.idempotencyKey,
        },
        body: JSON.stringify({
          orderId: req.orderId,
          orderNumber: req.orderNumber,
          amountMinor: req.amountMinor,
          currency: req.currency,
          customerEmail: req.customerEmail,
          cardType: provider,
          returnUrl: req.returnUrl,
          cancelUrl: req.cancelUrl || req.returnUrl,
        }),
      });
      const txnId = typeof res.body.id === 'string' ? res.body.id.trim() : '';
      const checkoutUrl = typeof res.body.checkoutUrl === 'string' ? res.body.checkoutUrl.trim() : '';
      if (!res.ok || !txnId || !checkoutUrl) {
        return {
          initiated: false,
          provider,
          environment: mode,
          httpStatus: res.status || undefined,
          message: res.rawError || res.body.message || `${displayName} checkout creation failed (HTTP ${res.status}).`,
        };
      }
      return {
        initiated: true,
        provider,
        environment: mode,
        providerTransactionId: txnId,
        checkoutUrl,
        httpStatus: res.status,
        message: `${displayName} ${mode} hosted checkout session created.`,
      };
    },
    verifyWebhook,
    async verifyPaymentStatus(providerTransactionId: string): Promise<PaymentStatusVerificationResult> {
      const { mode, apiKey, baseUrl } = resolveAuth();
      if (mode === 'disabled' || !apiKey || !baseUrl) {
        return {
          supported: false,
          verified: false,
          provider,
          providerTransactionId,
          status: 'unverified_provider_disabled',
          message: `${displayName} status verification requires configured acquiring gateway credentials.`,
        };
      }
      const res = await fetchWithTimeout(
        fetchImpl,
        `${baseUrl}/v1/payments/${encodeURIComponent(providerTransactionId)}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );
      if (!res.ok || typeof res.body.status !== 'string') {
        return {
          supported: true,
          verified: false,
          provider,
          providerTransactionId,
          status: 'verification_failed',
          httpStatus: res.status || undefined,
          message: res.rawError || res.body.message || `${displayName} status verification failed (HTTP ${res.status}).`,
        };
      }
      return {
        supported: true,
        verified: true,
        provider,
        providerTransactionId,
        status: normalizeProviderStatus(res.body.status),
        rawStatus: res.body.status,
        amountMinor: typeof res.body.amountMinor === 'number' ? res.body.amountMinor : undefined,
        currency: res.body.currency === 'PHP' || res.body.currency === 'USD' ? res.body.currency : undefined,
        httpStatus: res.status,
        message: `Verified ${displayName} transaction status: ${res.body.status}.`,
      };
    },
    async initiateRefund(
      providerTransactionIdOrReq: string | PaymentRefundRequest,
      amountMinor?: number,
      reason?: string
    ): Promise<PaymentRefundResult> {
      const req = normalizeRefundArgs(providerTransactionIdOrReq, amountMinor, reason);
      const { mode, apiKey, baseUrl } = resolveAuth();
      if (mode === 'disabled' || !apiKey || !baseUrl) {
        return {
          supported: false,
          refunded: false,
          provider,
          status: 'unsupported',
          message: `${displayName} refund processing requires configured acquiring gateway credentials.`,
        };
      }
      const res = await fetchWithTimeout(fetchImpl, `${baseUrl}/v1/refunds`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': req.idempotencyKey,
        },
        body: JSON.stringify({
          transactionId: req.providerTransactionId,
          amountMinor: req.amountMinor,
          currency: req.currency,
          reason: req.reason,
        }),
      });
      const refundId = typeof res.body.id === 'string' ? res.body.id.trim() : '';
      if (!res.ok || !refundId) {
        return {
          supported: true,
          refunded: false,
          provider,
          status: 'failed',
          httpStatus: res.status || undefined,
          message: res.rawError || res.body.message || `${displayName} refund failed (HTTP ${res.status}).`,
        };
      }
      return {
        supported: true,
        refunded: true,
        provider,
        providerRefundId: refundId,
        status: 'succeeded',
        httpStatus: res.status,
        message: `${displayName} refund ${refundId} created.`,
      };
    },
  };
}

function createDeferredGoTymeAdapter(): PaymentProviderAdapter {
  const verifyWebhook = buildWebhookVerifier(
    ['GOTYME_WEBHOOK_SECRET_TEST'],
    'x-gotyme-signature',
    'hmac_sha256'
  );
  return {
    provider: 'gotyme',
    getConfig(): PaymentProviderConfigView {
      return {
        provider: 'gotyme',
        displayName: 'GoTyme Bank',
        category: 'bank',
        description:
          'Direct GoTyme integration slot reserved pending direct merchant partnership and official bank API credentials.',
        supportedCurrencies: ['PHP'],
        paymentMethods: ['GoTyme Direct'],
        mode: 'disabled',
        isEnabled: false,
        integrationStatus: 'deferred_merchant_onboarding',
        webhookPath: '/api/portal/webhooks/gotyme',
        requiredEnvVars: ['GOTYME_API_SECRET_TEST', 'GOTYME_WEBHOOK_SECRET_TEST'],
        lastVerifiedAt: null,
        unavailableMessage:
          'GoTyme Bank is reserved for direct merchant onboarding and is disabled until official merchant API credentials are onboarded.',
      };
    },
    async initiatePayment(): Promise<PaymentInitiationResult> {
      return {
        initiated: false,
        provider: 'gotyme',
        environment: 'disabled',
        message: this.getConfig().unavailableMessage,
      };
    },
    verifyWebhook,
    async verifyPaymentStatus(providerTransactionId: string): Promise<PaymentStatusVerificationResult> {
      return {
        supported: false,
        verified: false,
        provider: 'gotyme',
        providerTransactionId,
        status: 'unverified_provider_disabled',
        message: this.getConfig().unavailableMessage,
      };
    },
    async initiateRefund(): Promise<PaymentRefundResult> {
      return {
        supported: false,
        refunded: false,
        provider: 'gotyme',
        status: 'unsupported',
        message: this.getConfig().unavailableMessage,
      };
    },
  };
}

export class PaymentGatewayRegistry {
  private readonly adapters: Map<PaymentProviderId, PaymentProviderAdapter>;

  constructor(fetchImplOrOptions: FetchLike | { fetchImpl?: FetchLike } = fetch) {
    const fetchImpl: FetchLike =
      typeof fetchImplOrOptions === 'function'
        ? fetchImplOrOptions
        : fetchImplOrOptions?.fetchImpl || fetch;
    const list: PaymentProviderAdapter[] = [
      createXenditAdapter(fetchImpl),
      createPayPalAdapter(fetchImpl),
      createHostedCardAdapter(
        'credit_card',
        'Credit Card (Hosted Checkout)',
        'PCI-compliant tokenized Visa, Mastercard, and JCB checkout routed through an approved acquiring gateway.',
        ['Visa', 'Mastercard', 'JCB'],
        fetchImpl
      ),
      createHostedCardAdapter(
        'debit_card',
        'Debit Card (Hosted Checkout)',
        '3DS-authenticated debit card checkout via PCI-compliant hosted fields (zero card storage on Destria Tech Inc servers).',
        ['Visa Debit', 'Mastercard Debit'],
        fetchImpl
      ),
      createMayaAdapter(fetchImpl),
      createPayMongoAdapter(fetchImpl),
      createDeferredGoTymeAdapter(),
    ];

    this.adapters = new Map(list.map((a) => [a.provider, a]));
  }

  public listConfigs(): PaymentProviderConfigView[] {
    return Array.from(this.adapters.values()).map((a) => a.getConfig());
  }

  public getAdapter(provider: PaymentProviderId): PaymentProviderAdapter | undefined {
    return this.adapters.get(provider);
  }
}
