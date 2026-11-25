import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { BRAND_ASSETS } from '../../data/brandAssets';
import { corporateIdentity } from '../../data/companyConfig';
import { resolveGitHubPagesRepoPrefix } from '../PortalRouter';
import { ClientPortalTechnologyBackground } from './ClientPortalTechnologyBackground';
import { ClientPortalContactInformation } from './ClientPortalContactInformation';

/**
 * Resolves the unmodified official corporate emblem URL so it loads reliably
 * from both root routes and nested clean portal routes (e.g. /portal/login)
 * across custom domains (destriatech.com), GitHub Pages subpaths, and local dev.
 */
export function resolvePortalLoginEmblemUrl(): string {
  const relativeAsset = BRAND_ASSETS.primaryLogo.replace(/^\.\//, '').replace(/^\/+/, '');
  if (typeof window !== 'undefined') {
    const prefix = resolveGitHubPagesRepoPrefix(
      window.location.hostname,
      window.location.pathname
    );
    if (prefix) {
      return `${prefix}/${relativeAsset}`;
    }
  }
  return `/${relativeAsset}`;
}

interface ClientPortalCorporatePanelProps {
  onReturnToWebsite: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

export const ClientPortalCorporatePanel: React.FC<ClientPortalCorporatePanelProps> = ({
  onReturnToWebsite,
}) => {
  const emblemSrc = resolvePortalLoginEmblemUrl();

  return (
    <aside
      aria-label="DESTRIA TECH INC corporate identity"
      className="relative hidden lg:flex flex-col justify-between overflow-hidden text-white px-9 py-10 xl:px-12 xl:py-12"
      style={{
        backgroundColor: 'var(--portal-navy)',
        backgroundImage:
          'linear-gradient(160deg, var(--portal-navy) 0%, var(--portal-deep-navy) 100%)',
      }}
    >
      {/* Subtle animated enterprise technology visualization behind readable text */}
      <ClientPortalTechnologyBackground />

      {/* Top & Mid Corporate Content */}
      <div className="relative z-10 space-y-10">
        {/* Return to Corporate Website */}
        <div>
          <a
            href={corporateIdentity.contact.website}
            onClick={onReturnToWebsite}
            className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-300 hover:text-white transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] rounded-md py-1 -ml-1 pl-1 pr-2 whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Return to Corporate Website</span>
          </a>
        </div>

        {/* Official Unmodified Corporate Emblem + Properly Aligned Corporate Identity */}
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full p-[2px] bg-gradient-to-tr from-[#B8923A] via-[#D4AF37] to-[#00C2C7]/75 shrink-0 select-none">
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
            <p className="text-[16px] font-bold tracking-[0.02em] text-white leading-tight">
              {corporateIdentity.legalName}
            </p>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-[#D4AF37] leading-tight mt-1">
              {corporateIdentity.networkName} | CLIENT PORTAL
            </p>
          </div>
        </div>

        {/* Concise Enterprise Positioning */}
        <div className="space-y-4 pt-2">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[#00C2C7] uppercase">
            ENTERPRISE DIGITAL WORKSPACE
          </p>

          <h2
            className="text-[30px] xl:text-[34px] font-bold text-white leading-[1.16] tracking-[-0.02em]"
            style={{ textWrap: 'balance' }}
          >
            <span className="block">Intelligent Technology.</span>
            <span className="block">Connected Enterprise.</span>
          </h2>

          <p className="text-[14.5px] text-slate-200 leading-[1.65] max-w-[40ch]">
            Your dedicated digital workspace for enterprise technology engagements, formal proposals,
            project collaboration, and authorized deliverables.
          </p>

          <p className="text-[13.5px] text-slate-300/90 leading-[1.65] max-w-[40ch]">
            Access DESTRIA NETWORK to coordinate customized technology solutions and manage your
            organization&apos;s digital transformation engagements.
          </p>

          {/* Understated corporate capability identifiers (unboxed typographic rhythm) */}
          <div
            aria-label="Core enterprise capabilities"
            className="pt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] font-medium text-slate-300 tracking-[0.02em]"
          >
            <span>Artificial Intelligence</span>
            <span className="text-[#D4AF37]/80" aria-hidden="true">
              ·
            </span>
            <span>Enterprise Engineering</span>
            <span className="text-[#D4AF37]/80" aria-hidden="true">
              ·
            </span>
            <span>Digital Transformation</span>
          </div>
        </div>
      </div>

      {/* Bottom: Official Contact Information & Responsible Account-Access Notice */}
      <div className="relative z-10 mt-10 space-y-4">
        <ClientPortalContactInformation variant="dark-panel" />
        <p className="text-[11.5px] text-slate-400 leading-relaxed pt-1">
          Authorized enterprise client accounts only. Access is subject to applicable platform
          policies.
        </p>
      </div>
    </aside>
  );
};

export default ClientPortalCorporatePanel;
