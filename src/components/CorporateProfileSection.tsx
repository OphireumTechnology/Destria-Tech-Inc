import React from 'react';
import { Link } from 'react-router-dom';
import { Download, Eye, ExternalLink, FileText, ShieldCheck, Globe } from 'lucide-react';
import {
  corporateProfile,
  getCorporateProfileMetaSummary,
} from '../config/corporateProfile';
import { CorporateProfileCover } from './CorporateProfileCover';

/**
 * Homepage Corporate Profile Showcase Section
 *
 * Positioned immediately after the About Us / Executive Corporate Overview section.
 * Intentionally avoids loading the PDF binary on the homepage so initial page
 * performance stays fast; the embedded viewer loads only on `/corporate-profile`.
 */
export const CorporateProfileSection: React.FC = () => {
  const metaSummary = getCorporateProfileMetaSummary();

  return (
    <section
      id="corporate-profile"
      aria-labelledby="corporate-profile-heading"
      className="py-20 lg:py-24 bg-gradient-to-b from-[#111827] via-[#0B1F3B]/75 to-[#111827] border-t border-slate-800/80 relative overflow-hidden"
    >
      {/* Subtle architectural cyan & gold light accents */}
      <div
        aria-hidden="true"
        className="absolute -top-24 right-1/4 w-[460px] h-[320px] bg-[#00C2C7]/8 blur-[120px] rounded-full pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-24 left-1/4 w-[380px] h-[280px] bg-[#D4AF37]/6 blur-[120px] rounded-full pointer-events-none"
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-[#0B1F3B]/85 border border-slate-700/80 p-6 sm:p-10 lg:p-12 shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left Column: Corporate Introduction & Action Buttons */}
            <div className="lg:col-span-7 space-y-6">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-[0.18em] text-[#00C2C7]">
                  <FileText className="w-3.5 h-3.5 text-[#00C2C7] shrink-0" />
                  <span>{corporateProfile.sectionLabel}</span>
                </div>

                <h2
                  id="corporate-profile-heading"
                  className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight"
                >
                  {corporateProfile.title}
                </h2>

                <p className="text-base sm:text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[#00C2C7] via-[#0EA5E9] to-[#D4AF37] leading-snug">
                  {corporateProfile.supportingStatement}
                </p>

                <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
                  {corporateProfile.description}
                </p>
              </div>

              {/* Concise Public Access Assurance Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#111827]/90 border border-slate-800 flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-[#00C2C7] shrink-0" />
                  <div>
                    <span className="block font-semibold text-white">Official Edition</span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {corporateProfile.pageCount}-Page PDF
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#111827]/90 border border-slate-800 flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-[#10B981] shrink-0" />
                  <div>
                    <span className="block font-semibold text-white">Public Access</span>
                    <span className="text-[11px] text-slate-400 font-mono">No Sign-In Required</span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#111827]/90 border border-slate-800 flex items-center gap-2.5">
                  <Globe className="w-4 h-4 text-[#D4AF37] shrink-0" />
                  <div>
                    <span className="block font-semibold text-white">Permanent URL</span>
                    <span className="text-[11px] text-slate-400 font-mono">/corporate-profile</span>
                  </div>
                </div>
              </div>

              {/* Primary Download + Secondary View Profile Actions */}
              <div className="pt-1 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={corporateProfile.documentUrl}
                    download={corporateProfile.downloadFilename}
                    aria-label="Download DESTRIA TECH INC Official Corporate Profile PDF"
                    className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-bold text-[#111827] bg-[#00C2C7] hover:bg-[#00d6dc] rounded-lg shadow-lg shadow-[#00C2C7]/20 hover:shadow-[#00C2C7]/35 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1F3B] motion-reduce:transition-none"
                  >
                    <Download className="w-4 h-4 shrink-0" />
                    <span>Download Corporate Profile</span>
                  </a>

                  <Link
                    to={corporateProfile.pagePath}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-semibold text-[#D4AF37] hover:text-white border border-[#D4AF37]/70 hover:border-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1F3B] motion-reduce:transition-none"
                  >
                    <Eye className="w-4 h-4 shrink-0" />
                    <span>View Corporate Profile</span>
                  </Link>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                  <span className="font-mono text-slate-300">{metaSummary}</span>
                  <span aria-hidden="true" className="text-slate-600 hidden sm:inline">
                    ·
                  </span>
                  <a
                    href={corporateProfile.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[#00C2C7] hover:text-[#00d6dc] hover:underline font-medium"
                  >
                    <span>Open Original PDF in New Tab</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>
                </div>
              </div>
            </div>

            {/* Right Column: Official Corporate Profile Cover Preview */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="w-full max-w-[300px] sm:max-w-[340px]">
                <Link
                  to={corporateProfile.pagePath}
                  aria-label="Open dedicated DESTRIA TECH INC Corporate Profile page"
                  className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] rounded-2xl"
                >
                  <CorporateProfileCover />
                </Link>
                <p className="mt-3 text-center text-[11px] font-mono text-slate-400">
                  {corporateProfile.companyName} · {corporateProfile.networkName} ({corporateProfile.abbreviation})
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
