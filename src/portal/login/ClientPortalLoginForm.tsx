import React, { useRef, useState } from 'react';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { PortalApiError } from '../portalApi';

export interface LoginErrorPresentation {
  message: string;
  category:
    | 'invalid_credentials'
    | 'service_unavailable'
    | 'network_error'
    | 'session_expired'
    | 'rate_limited';
}

/**
 * Maps authentication API and connectivity errors into concise, legally cautious,
 * privacy-safe user messages per Section 15 without exposing stack traces,
 * database errors, secrets, or account enumeration details.
 */
export function mapLoginErrorMessage(err: unknown): LoginErrorPresentation {
  if (err instanceof PortalApiError) {
    if (err.status === 429) {
      return {
        category: 'rate_limited',
        message: 'Too many sign-in attempts. Please try again later.',
      };
    }
    if (err.status >= 500 || err.status === 0) {
      return {
        category: 'service_unavailable',
        message: 'The authentication service is temporarily unavailable. Please try again shortly.',
      };
    }
    if (err.code === 'SESSION_EXPIRED') {
      return {
        category: 'session_expired',
        message: 'Your session has expired. Please sign in again.',
      };
    }
    return {
      category: 'invalid_credentials',
      message: 'Unable to sign in. Please verify your credentials and try again.',
    };
  }

  if (err instanceof TypeError) {
    return {
      category: 'network_error',
      message:
        'Unable to connect to the authentication service. Please check your connection and try again.',
    };
  }

  if (err && typeof err === 'object' && 'message' in err) {
    const raw = String((err as { message?: unknown }).message || '').toLowerCase();
    if (raw.includes('network') || raw.includes('failed to fetch') || raw.includes('offline')) {
      return {
        category: 'network_error',
        message:
          'Unable to connect to the authentication service. Please check your connection and try again.',
      };
    }
    if (raw.includes('too many') || raw.includes('rate limit')) {
      return {
        category: 'rate_limited',
        message: 'Too many sign-in attempts. Please try again later.',
      };
    }
    if (raw.includes('expired')) {
      return {
        category: 'session_expired',
        message: 'Your session has expired. Please sign in again.',
      };
    }
    if (raw.includes('unavailable') || raw.includes('timeout')) {
      return {
        category: 'service_unavailable',
        message: 'The authentication service is temporarily unavailable. Please try again shortly.',
      };
    }
  }

  return {
    category: 'invalid_credentials',
    message: 'Unable to sign in. Please verify your credentials and try again.',
  };
}

interface ClientPortalLoginFormProps {
  onAuthenticate: (email: string, password: string) => Promise<void>;
  onNavigateForgotPassword: () => void;
  onNavigateRegister: () => void;
  initialNotice?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ClientPortalLoginForm: React.FC<ClientPortalLoginFormProps> = ({
  onAuthenticate,
  onNavigateForgotPassword,
  onNavigateRegister,
  initialNotice = '',
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(initialNotice);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const inFlightRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (inFlightRef.current || busy) return;

    const trimmedEmail = email.trim();
    let hasValidationError = false;

    if (!trimmedEmail) {
      setEmailError('Please enter your registered email address.');
      hasValidationError = true;
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setEmailError('Please enter a valid email address.');
      hasValidationError = true;
    } else {
      setEmailError('');
    }

    if (!password) {
      setPasswordError('Please enter your password.');
      hasValidationError = true;
    } else {
      setPasswordError('');
    }

    if (hasValidationError) {
      setFormError('');
      return;
    }

    inFlightRef.current = true;
    setBusy(true);
    setFormError('');

    try {
      await onAuthenticate(trimmedEmail, password);
    } catch (err) {
      const mapped = mapLoginErrorMessage(err);
      setFormError(mapped.message);
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="portal-login-heading"
      className="w-full max-w-[440px] rounded-[18px] border border-[#E2E8F0] bg-white p-7 sm:p-10 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(11,31,59,0.08)]"
    >
      {/* Header */}
      <div>
        <h1
          id="portal-login-heading"
          className="text-[22px] sm:text-[24px] font-bold tracking-[-0.02em] text-[#0F172A] leading-tight"
        >
          Welcome to DESTRIA NETWORK
        </h1>
        <p className="mt-2 text-[14.5px] text-[#64748B] leading-relaxed">
          Sign in to access your enterprise workspace.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-5">
        {formError && (
          <div
            role="alert"
            aria-live="assertive"
            className="flex items-start gap-2.5 rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-3 text-[13px] leading-snug text-[#B91C1C]"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{formError}</span>
          </div>
        )}

        {/* Email Field */}
        <div>
          <label
            htmlFor="portal-login-email"
            className="block text-[13px] font-semibold text-[#0F172A] mb-2"
          >
            Registered Email Address
          </label>
          <input
            id="portal-login-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            disabled={busy}
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? 'portal-login-email-error' : undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError('');
            }}
            placeholder="name@company.com"
            className={`w-full h-[50px] px-4 text-[15px] bg-white rounded-[10px] text-[#0F172A] placeholder:text-[#94A3B8] transition-colors duration-150 focus:outline-none focus:ring-2 disabled:bg-[#F8FAFC] disabled:text-[#64748B] ${
              emailError
                ? 'border border-[#B91C1C] focus:border-[#B91C1C] focus:ring-[#B91C1C]/15'
                : 'border border-[#E2E8F0] hover:border-[#CBD5E1] focus:border-[#0B1F3B] focus:ring-[#0B1F3B]/15'
            }`}
          />
          {emailError && (
            <p
              id="portal-login-email-error"
              role="alert"
              className="mt-1.5 text-[12.5px] text-[#B91C1C]"
            >
              {emailError}
            </p>
          )}
        </div>

        {/* Password Field */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <label
              htmlFor="portal-login-password"
              className="block text-[13px] font-semibold text-[#0F172A]"
            >
              Password
            </label>
            <button
              type="button"
              onClick={onNavigateForgotPassword}
              className="text-[13px] font-medium text-[#0B1F3B] hover:text-[#008C90] hover:underline underline-offset-4 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1F3B] rounded whitespace-nowrap"
            >
              Forgot your password?
            </button>
          </div>
          <div className="relative">
            <input
              id="portal-login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              disabled={busy}
              aria-invalid={Boolean(passwordError)}
              aria-describedby={passwordError ? 'portal-login-password-error' : undefined}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError('');
              }}
              placeholder="Enter your password"
              className={`w-full h-[50px] pl-4 pr-12 text-[15px] bg-white rounded-[10px] text-[#0F172A] placeholder:text-[#94A3B8] transition-colors duration-150 focus:outline-none focus:ring-2 disabled:bg-[#F8FAFC] disabled:text-[#64748B] ${
                passwordError
                  ? 'border border-[#B91C1C] focus:border-[#B91C1C] focus:ring-[#B91C1C]/15'
                  : 'border border-[#E2E8F0] hover:border-[#CBD5E1] focus:border-[#0B1F3B] focus:ring-[#0B1F3B]/15'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              disabled={busy}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute right-0 top-0 h-[50px] w-11 flex items-center justify-center text-[#64748B] hover:text-[#0F172A] transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0B1F3B] rounded-r-[10px] disabled:opacity-50"
            >
              {showPassword ? (
                <EyeOff className="w-[18px] h-[18px]" aria-hidden="true" />
              ) : (
                <Eye className="w-[18px] h-[18px]" aria-hidden="true" />
              )}
            </button>
          </div>
          {passwordError && (
            <p
              id="portal-login-password-error"
              role="alert"
              className="mt-1.5 text-[12.5px] text-[#B91C1C]"
            >
              {passwordError}
            </p>
          )}
        </div>

        {/* Primary Sign In Button */}
        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="w-full h-[50px] px-6 rounded-[10px] bg-[#0B1F3B] hover:bg-[#081529] active:bg-[#061020] disabled:opacity-65 disabled:cursor-not-allowed text-white text-[15px] font-semibold tracking-[0.01em] transition-colors duration-150 cursor-pointer flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0B1F3B]"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />}
          <span>{busy ? 'Signing in...' : 'Sign In'}</span>
        </button>
      </form>

      {/* Registration Section */}
      <div className="mt-7 pt-6 border-t border-[#E2E8F0] text-center text-[14px] text-[#64748B]">
        <span>New to DESTRIA NETWORK?</span>{' '}
        <button
          type="button"
          onClick={onNavigateRegister}
          className="font-semibold text-[#0B1F3B] hover:text-[#008C90] hover:underline underline-offset-4 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1F3B] rounded whitespace-nowrap"
        >
          Create a Client Account
        </button>
      </div>

      {/* Authentication Footer Notice */}
      <p className="mt-6 pt-5 border-t border-[#F1F5F9] text-center text-[12px] text-[#64748B] leading-relaxed">
        Access is restricted to authorized users. Account activity is subject to applicable
        platform policies.
      </p>
    </section>
  );
};

export default ClientPortalLoginForm;
