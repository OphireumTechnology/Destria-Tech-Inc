import React, { useState } from 'react';
import { FileText, ShieldCheck } from 'lucide-react';
import { corporateProfile } from '../config/corporateProfile';
import { BrandLogo } from './BrandLogo';

interface CorporateProfileCoverProps {
  /** Prioritize loading when used above the fold on the dedicated profile page */
  priority?: boolean;
  /** Optional wrapper classes */
  className?: string;
}

/**
 * Displays the official Corporate Profile first-page cover image (`/branding/corporate-profile-cover.webp`)
 * as a restrained, enterprise digital brochure with reserved aspect dimensions (preventing CLS).
 *
 * If the derived WebP cover image has not yet been published or fails to load, gracefully
 * renders a clean branded document cover presentation using the official circular emblem
 * and approved DESTRIA TECH INC palette tokens without displaying a broken image icon.
 */
export const CorporateProfileCover: React.FC<CorporateProfileCoverProps> = ({
  priority = false,
  className = '',
}) => {
  const [coverUnavailable, setCoverUnavailable] = useState(false);

  return (
    <div className={`relative group ${className}`}>
      {/* Restrained technology glow behind brochure frame */}
      <div
        aria-hidden="true"
        className="absolute -inset-2 rounded-3xl bg-gradient-to-br from-[#00C2C7]/20 via-[#0EA5E9]/10 to-[#D4AF37]/20 blur-xl opacity-65 group-hover:opacity-90 transition-opacity duration-500 motion-reduce:transition-none pointer-events-none"
      />

      {/* Digital Brochure Frame (US Letter 8.5 x 11 proportion reserved to prevent CLS) */}
      <div className="relative rounded-2xl bg-[#0B1F3B] border border-slate-700/80 shadow-2xl overflow-hidden aspect-[17/22] w-full">
        {/* Subtle spine accent on left edge */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-[#00C2C7] via-[#0EA5E9] to-[#D4AF37] z-10 pointer-events-none"
        />

        {!coverUnavailable ? (
          <img
            src={corporateProfile.coverUrl}
            alt={corporateProfile.seo.coverAltText}
            width={680}
            height={880}
            loading={priority ? 'eager' : 'lazy'}
            decoding={priority ? 'sync' : 'async'}
            onError={() => setCoverUnavailable(true)}
            className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.015] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-[#0B1F3B] via-[#111827] to-[#0B1F3B] p-6 sm:p-8 flex flex-col justify-between text-left relative">
            <div
              aria-hidden="true"
              className="absolute top-0 right-0 w-44 h-44 bg-[#00C2C7]/10 blur-3xl rounded-full pointer-events-none"
            />

            <div className="flex items-center justify-between gap-3 border-b border-slate-800/90 pb-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <BrandLogo variant="emblem" size="sm" ring="brand" decorative />
                <div className="min-w-0">
                  <span className="block text-[11px] font-bold tracking-wider text-white uppercase truncate">
                    {corporateProfile.companyName}
                  </span>
                  <span className="block text-[9.5px] font-mono tracking-widest text-[#00C2C7] uppercase truncate">
                    {corporateProfile.networkName} | {corporateProfile.abbreviation}
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-mono text-[#D4AF37] uppercase tracking-wider shrink-0">
                Official PDF
              </span>
            </div>

            <div className="my-auto py-6 flex flex-col items-center text-center">
              <BrandLogo variant="emblem" size="xl" ring="brand" decorative />
              <span className="mt-5 text-[10px] font-mono uppercase tracking-[0.22em] text-[#00C2C7]">
                {corporateProfile.sectionLabel}
              </span>
              <h3 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                {corporateProfile.title}
              </h3>
              <p className="mt-2 text-xs text-slate-300 max-w-[260px] leading-relaxed">
                {corporateProfile.supportingStatement}
              </p>
            </div>

            <div className="pt-4 border-t border-slate-800/90 flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span className="inline-flex items-center gap-1.5 text-slate-300">
                <FileText className="w-3.5 h-3.5 text-[#00C2C7]" />
                <span>{corporateProfile.pageCount} Pages</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-[#10B981]">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Public Edition</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
