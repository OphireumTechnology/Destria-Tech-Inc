import React from 'react';
import { AlertTriangle, RefreshCw, Home, Phone, Mail } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { corporateIdentity } from '../data/companyConfig';

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[DESTRIA TECH INC] Unhandled UI boundary error:', error?.message, info?.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.assign('/');
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-[#0B1F3B] text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-700/70 bg-[#111827] p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex items-center justify-between gap-4">
            <BrandLogo
              variant="horizontal"
              theme="dark"
              size="md"
              ring="gold"
              title={corporateIdentity.legalName}
              subtitle={corporateIdentity.networkName}
              eager
            />
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" />
              Recovery Mode
            </span>
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold text-white tracking-tight">
              We encountered an unexpected interface error
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Your workspace remains protected. Reload the page to restore the application cleanly, or return to the DESTRIA TECH INC homepage.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#00C2C7] hover:bg-[#00a8ad] text-[#0B1F3B] text-sm font-semibold transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Application
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-sm font-semibold transition-colors cursor-pointer"
            >
              <Home className="w-4 h-4" />
              Return to Homepage
            </button>
          </div>

          <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center gap-4 text-xs text-slate-400">
            <a
              href={corporateIdentity.contact.telephone.href}
              className="inline-flex items-center gap-1.5 text-[#00C2C7] hover:underline"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>{corporateIdentity.contact.telephone.display}</span>
            </a>
            <a
              href={`mailto:${corporateIdentity.contact.email}`}
              className="inline-flex items-center gap-1.5 hover:text-white"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>{corporateIdentity.contact.email}</span>
            </a>
          </div>
        </div>
      </div>
    );
  }
}
