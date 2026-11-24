import React from 'react';
import { Building, Shield, ArrowUpRight, Phone, Mail, ExternalLink, Globe } from 'lucide-react';
import { COMPANY_CONFIG } from '../data/companyConfig';
import { BrandLogo } from './BrandLogo';

interface FooterProps {
  onNavigate: (sectionId: string) => void;
  onOpenPortal: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, onOpenPortal }) => {
  return (
    <footer className="bg-[#081529] border-t border-slate-800 text-slate-400 text-xs relative">
      {/* Subtle cyan & gold accent glow border line */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#00C2C7]/60 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10">
          
          {/* Brand Lockup (Cols 1-4) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-3">
              <BrandLogo variant="emblem" size="md" ring="brand" decorative />
              <div>
                <span className="text-sm font-extrabold tracking-wider text-white uppercase block">
                  {COMPANY_CONFIG.name}
                </span>
                <span className="text-[10px] font-mono text-[#00C2C7] tracking-wider block">
                  {COMPANY_CONFIG.platformName} · {COMPANY_CONFIG.initials}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              {COMPANY_CONFIG.heroDescription}
            </p>

            {/* Verified Corporate Contact Channel */}
            <div className="p-3.5 rounded-xl bg-[#111827]/90 border border-slate-800 space-y-1.5 text-xs">
              <div className="flex items-center gap-2 text-slate-300 font-medium">
                <Shield className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{COMPANY_CONFIG.subheadline}</span>
              </div>

              {COMPANY_CONFIG.corporatePhone && COMPANY_CONFIG.corporatePhoneLink ? (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-[#00C2C7]" />
                  <a href={COMPANY_CONFIG.corporatePhoneLink} className="text-[#00C2C7] hover:underline font-mono">
                    {COMPANY_CONFIG.corporatePhone}
                  </a>
                </div>
              ) : null}

              {COMPANY_CONFIG.corporateEmail ? (
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-[#00C2C7]" />
                  <a href={`mailto:${COMPANY_CONFIG.corporateEmail}`} className="text-[#00C2C7] hover:underline font-mono">
                    {COMPANY_CONFIG.corporateEmail}
                  </a>
                </div>
              ) : null}
            </div>
          </div>

          {/* Corporate Operations (Cols 5-7) */}
          <div className="lg:col-span-3 space-y-3">
            <h4 className="text-xs font-mono uppercase text-white tracking-wider flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-[#00C2C7]" />
              <span>Corporate Operations</span>
            </h4>
            <div className="space-y-2 text-slate-300"><p>Wyoming, United States of America</p><p className="font-semibold text-white">Corporate Headquarters</p><p>{COMPANY_CONFIG.headquartersAddress}</p><p>{COMPANY_CONFIG.verification.leadershipName}</p><p>Chief Technology Officer: {COMPANY_CONFIG.chiefTechnologyOfficer}</p></div>
            {COMPANY_CONFIG.registeredAddress ? (
              <>
                <div className="space-y-1 text-xs text-slate-300 leading-relaxed">
                  <p>{COMPANY_CONFIG.registeredAddress}</p>
                </div>
                {COMPANY_CONFIG.registeredAddressMapsUrl ? (
                  <div className="pt-2">
                    <a
                      href={COMPANY_CONFIG.registeredAddressMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#00C2C7] hover:underline"
                    >
                      <span>Google Maps Location</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
                <p className="flex items-center gap-1.5 text-white font-semibold">
                  <Globe className="w-3.5 h-3.5 text-[#00C2C7]" />
                  <span>Global Digital Operations</span>
                </p>
                <p className="text-slate-400">
                  Direct client onboarding, project scoping, and technical consultations routed securely through {COMPANY_CONFIG.platformName}.
                </p>
                <button
                  onClick={() => onNavigate('contact')}
                  className="inline-flex items-center gap-1 text-xs text-[#00C2C7] hover:underline cursor-pointer"
                >
                  <span>Open Project Inquiry Form</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Quick Links (Cols 8-9) */}
          <div className="lg:col-span-2 space-y-3">
            <h4 className="text-xs font-mono uppercase text-white tracking-wider">Navigation</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('hero')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Homepage
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('about')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  About &amp; Governance
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('services')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Technology Services
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('portfolio')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Portfolio Showcases
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('contact')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Project Brief
                </button>
              </li>
            </ul>
          </div>

          {/* Enterprise Network Links (Cols 10-12) */}
          <div className="lg:col-span-3 space-y-3">
            <h4 className="text-xs font-mono uppercase text-white tracking-wider">{COMPANY_CONFIG.platformName}</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={onOpenPortal}
                  className="hover:text-[#00C2C7] transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>Client Portal</span>
                  <ArrowUpRight className="w-3 h-3 text-[#00C2C7]" />
                </button>
              </li>
              <li>
                <button
                  onClick={onOpenPortal}
                  className="hover:text-[#00C2C7] transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>AI Development Studio</span>
                  <ArrowUpRight className="w-3 h-3 text-[#00C2C7]" />
                </button>
              </li>
              <li>
                <button
                  onClick={onOpenPortal}
                  className="hover:text-[#00C2C7] transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>AI Agent Workforce Matrix</span>
                  <ArrowUpRight className="w-3 h-3 text-[#00C2C7]" />
                </button>
              </li>
              <li>
                <button
                  onClick={onOpenPortal}
                  className="hover:text-[#00C2C7] transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>Enterprise Admin Center</span>
                  <ArrowUpRight className="w-3 h-3 text-[#00C2C7]" />
                </button>
              </li>
            </ul>

            <div className="pt-2 text-[11px] text-slate-500 font-mono">
              Graphite #111827 · Cyan #00C2C7 · Gold #D4AF37 · Navy #0B1F3B
            </div>
          </div>

        </div>

        {/* Bottom Legal & Corporate Bar */}
        <div className="mt-12 pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <div>
            © 2026 {COMPANY_CONFIG.name}. All rights reserved.
          </div>
          <div className="flex flex-wrap items-center gap-4 text-slate-400">
            <span>Privacy Policy</span>
            <span>·</span>
            <span>Terms of Use</span>
            <span>·</span>
            <span>{COMPANY_CONFIG.platformName}</span>
          </div>
        </div>

      </div>
    </footer>
  );
};
