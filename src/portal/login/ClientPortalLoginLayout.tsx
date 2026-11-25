import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { BRAND_ASSETS } from '../../data/brandAssets';
import { corporateIdentity } from '../../data/companyConfig';
import {
  ClientPortalCorporatePanel,
  resolvePortalLoginEmblemUrl,
} from './ClientPortalCorporatePanel';
import { ClientPortalContactInformation } from './ClientPortalContactInformation';

interface ClientPortalLoginLayoutProps {
  onReturnToWebsite: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  children: React.ReactNode;
}

const SCOPED_LOGIN_STYLES = `
.dti-portal-login-scope {
  --portal-navy: #0B1F3B;
  --portal-deep-navy: #081529;
  --portal-graphite: #111827;
  --portal-gold: #D4AF37;
  --portal-cyan: #00C2C7;
  --portal-background: #F5F7FA;
  --portal-surface: #FFFFFF;
  --portal-border: #E2E8F0;
  --portal-text-primary: #0F172A;
  --portal-text-secondary: #64748B;
  --portal-success: #047857;
  --portal-error: #B91C1C;
}

@keyframes dtiLoginMeshDrift {
  0%, 100% {
    transform: translate3d(0, 0, 0);
  }
  50% {
    transform: translate3d(0, -6px, 0);
  }
}

@keyframes dtiLoginNodePulse {
  0%, 100% {
    opacity: 0.72;
  }
  50% {
    opacity: 1;
  }
}

@keyframes dtiLoginParticleFloat {
  0%, 100% {
    transform: translate3d(0, 0, 0);
    opacity: 0.35;
  }
  50% {
    transform: translate3d(8px, -10px, 0);
    opacity: 0.85;
  }
}

.dti-portal-login-scope .dti-login-mesh-drift {
  animation: dtiLoginMeshDrift 18s ease-in-out infinite;
  will-change: transform;
}

.dti-portal-login-scope .dti-login-node-pulse {
  animation: dtiLoginNodePulse 6.5s ease-in-out infinite;
}

.dti-portal-login-scope .dti-login-particle-float {
  animation: dtiLoginParticleFloat 10s ease-in-out infinite;
  will-change: transform, opacity;
}

@media (prefers-reduced-motion: reduce) {
  .dti-portal-login-scope .dti-login-mesh-drift,
  .dti-portal-login-scope .dti-login-node-pulse,
  .dti-portal-login-scope .dti-login-particle-float {
    animation: none !important;
    transform: none !important;
  }
}
`;

export const ClientPortalLoginLayout: React.FC<ClientPortalLoginLayoutProps> = ({
  onReturnToWebsite,
  children,
}) => {
  const emblemSrc = resolvePortalLoginEmblemUrl();

  return (
    <div
      className="dti-portal-login-scope min-h-screen w-full overflow-x-hidden grid lg:grid-cols-[minmax(380px,38%)_1fr]"
      style={{
        backgroundColor: 'var(--portal-background)',
        color: 'var(--portal-text-primary)',
      }}
    >
      {/* Login-scoped CSS variables & animation keyframes (never affects public site) */}
      <style>{SCOPED_LOGIN_STYLES}</style>

      {/* Desktop Left Corporate Identity Panel (~38% width) */}
      <ClientPortalCorporatePanel onReturnToWebsite={onReturnToWebsite} />

      {/* Right Authentication Area + Compact Mobile Corporate Header */}
      <main className="flex flex-col min-w-0">
        {/* Compact Mobile / Tablet Corporate Header (< lg) */}
        <header
          className="lg:hidden px-4 sm:px-6 py-4 text-white border-b border-white/10"
          style={{
            backgroundColor: 'var(--portal-navy)',
            backgroundImage:
              'linear-gradient(135deg, var(--portal-navy) 0%, var(--portal-deep-navy) 100%)',
          }}
        >
          <div className="max-w-[440px] mx-auto space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full p-[1.5px] bg-gradient-to-tr from-[#B8923A] via-[#D4AF37] to-[#00C2C7]/75 shrink-0 select-none">
                  <img
                    src={emblemSrc}
                    alt={BRAND_ASSETS.altText}
                    loading="eager"
                    decoding="sync"
                    draggable={false}
                    className="w-full h-full object-cover rounded-full bg-white"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-bold tracking-[0.02em] text-white leading-tight truncate">
                    {corporateIdentity.legalName}
                  </p>
                  <p className="text-[10px] font-semibold tracking-[0.1em] text-[#D4AF37] leading-tight mt-0.5 truncate">
                    {corporateIdentity.networkName} | CLIENT PORTAL
                  </p>
                </div>
              </div>

              <a
                href={corporateIdentity.contact.website}
                onClick={onReturnToWebsite}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-200 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] rounded px-1.5 py-1.5 whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden xs:inline sm:inline">Return to Corporate Website</span>
                <span className="sm:hidden">Website</span>
              </a>
            </div>

            <div className="pt-1 border-t border-white/10">
              <p className="text-[10px] font-semibold tracking-[0.14em] text-[#00C2C7] uppercase">
                ENTERPRISE DIGITAL WORKSPACE
              </p>
              <p className="mt-0.5 text-[15px] font-semibold text-white leading-snug">
                Intelligent Technology. Connected Enterprise.
              </p>
            </div>
          </div>
        </header>

        {/* Centered Authentication Card Surface */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:px-8 sm:py-12">
          <div className="w-full max-w-[440px]">
            {children}

            {/* Mobile-only Corporate Contact Information below form */}
            <div className="lg:hidden">
              <ClientPortalContactInformation variant="mobile-light" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ClientPortalLoginLayout;
