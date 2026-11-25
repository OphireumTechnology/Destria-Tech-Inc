import React from 'react';
import { Link } from 'react-router-dom';
import { Building, Shield, ArrowUpRight, Phone, Mail, Globe, Scale } from 'lucide-react';
import {
  COMPANY_CONFIG,
  corporateIdentity,
  COMMERCIAL_ENGAGEMENT_STATEMENT,
} from '../data/companyConfig';
import { ROUTES } from '../config/routes';
import { BrandLogo } from './BrandLogo';

interface FooterProps {
  onNavigate: (sectionId: string) => void;
  onOpenPortal: () => void;
  onOpenLegal?: (sectionId?: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, onOpenPortal, onOpenLegal }) => {
  return (
    <footer className="bg-[#081529] border-t border-slate-800 text-slate-400 text-xs relative">
      {/* Subtle cyan & gold accent glow border line */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#00C2C7]/60 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-28 sm:pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10">
          {/* Brand Lockup (Cols 1-4) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-3">
              <BrandLogo variant="emblem" size="md" ring="brand" decorative />
              <div>
                <span className="text-sm font-extrabold tracking-wider text-white uppercase block">
                  {corporateIdentity.legalName}
                </span>
                <span className="text-[10px] font-mono text-[#00C2C7] tracking-wider block">
                  {corporateIdentity.networkName} · {corporateIdentity.abbreviation}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              {COMMERCIAL_ENGAGEMENT_STATEMENT}
            </p>

            {/* Verified Corporate Contact Channel */}
            <div className="p-3.5 rounded-xl bg-[#111827]/90 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-slate-300 font-medium">
                <Shield className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{corporateIdentity.commercialPolicy.serviceModel}</span>
              </div>

              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-[#00C2C7]" />
                <a
                  href={corporateIdentity.contact.telephone.href}
                  className="text-[#00C2C7] hover:underline font-mono font-medium"
                >
                  {corporateIdentity.contact.telephone.display}
                </a>
              </div>

              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[#00C2C7]" />
                <a
                  href={`mailto:${corporateIdentity.contact.email}`}
                  className="text-[#00C2C7] hover:underline font-mono"
                >
                  {corporateIdentity.contact.email}
                </a>
              </div>

              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-[#00C2C7]" />
                <a
                  href={corporateIdentity.contact.website}
                  className="text-slate-300 hover:text-[#00C2C7] font-mono"
                >
                  {corporateIdentity.contact.website}
                </a>
              </div>
            </div>
          </div>

          {/* Corporate Operations (Cols 5-7) */}
          <div className="lg:col-span-3 space-y-3">
            <h4 className="text-xs font-mono uppercase text-white tracking-wider flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-[#00C2C7]" />
              <span>Corporate Headquarters</span>
            </h4>
            <div className="space-y-2 text-slate-300 leading-relaxed">
              <p className="text-slate-400">{corporateIdentity.jurisdiction}</p>
              <p className="font-medium text-white">{corporateIdentity.headquarters.fullAddress}</p>
              <div className="pt-1 space-y-1 text-[11px] border-t border-slate-800/80">
                <p>
                  <span className="text-slate-400">{corporateIdentity.leadership.ceo.title}: </span>
                  <span className="text-slate-200">{corporateIdentity.leadership.ceo.name}</span>
                </p>
                <p>
                  <span className="text-slate-400">{corporateIdentity.leadership.cto.title}: </span>
                  <span className="text-slate-200">{corporateIdentity.leadership.cto.name}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Quick Links (Cols 8-9) */}
          <div className="lg:col-span-2 space-y-3">
            <h4 className="text-xs font-mono uppercase text-white tracking-wider">Navigation</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link
                  to={ROUTES.HOME}
                  onClick={() => onNavigate('hero')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Homepage
                </Link>
              </li>
              <li>
                <Link
                  to={ROUTES.ABOUT}
                  onClick={() => onNavigate('about')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  About &amp; Governance
                </Link>
              </li>
              <li>
                <Link
                  to={ROUTES.SOLUTIONS}
                  onClick={() => onNavigate('services')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Technology Solutions
                </Link>
              </li>
              <li>
                <Link
                  to={ROUTES.PORTFOLIO}
                  onClick={() => onNavigate('portfolio')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Portfolio Showcases
                </Link>
              </li>
              <li>
                <Link
                  to={ROUTES.CONSULTATION}
                  onClick={() => onNavigate('contact')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Request a Consultation
                </Link>
              </li>
            </ul>
          </div>

          {/* Enterprise Network & Legal Governance Links (Cols 10-12) */}
          <div className="lg:col-span-3 space-y-3">
            <h4 className="text-xs font-mono uppercase text-white tracking-wider">
              {corporateIdentity.networkName} &amp; Governance
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link
                  to={ROUTES.PORTAL.LOGIN}
                  className="hover:text-[#00C2C7] transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>Client Engagement Portal</span>
                  <ArrowUpRight className="w-3 h-3 text-[#00C2C7]" />
                </Link>
              </li>
              <li>
                <Link
                  to={ROUTES.GOVERNANCE.COMMERCIAL_ENGAGEMENT_POLICY}
                  onClick={() => onOpenLegal?.('commercial-engagement-policy')}
                  className="hover:text-[#00C2C7] transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Scale className="w-3 h-3 text-[#D4AF37]" />
                  <span>Commercial Engagement Policy</span>
                </Link>
              </li>
              <li>
                <Link
                  to={ROUTES.GOVERNANCE.AI_USAGE_DISCLAIMER}
                  onClick={() => onOpenLegal?.('ai-usage-disclaimer')}
                  className="hover:text-[#00C2C7] transition-colors cursor-pointer"
                >
                  AI Usage Disclaimer
                </Link>
              </li>
              <li>
                <Link
                  to={ROUTES.GOVERNANCE.INFORMATION_SECURITY}
                  onClick={() => onOpenLegal?.('information-security-statement')}
                  className="hover:text-[#00C2C7] transition-colors cursor-pointer"
                >
                  Information Security Statement
                </Link>
              </li>
              <li>
                <Link
                  to={ROUTES.GOVERNANCE.CONFIDENTIALITY}
                  onClick={() => onOpenLegal?.('confidentiality-notice')}
                  className="hover:text-[#00C2C7] transition-colors cursor-pointer"
                >
                  Confidentiality &amp; NDA Governance
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Legal & Corporate Bar */}
        <div className="mt-12 pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <div>
            © 2026 {COMPANY_CONFIG.name}. All rights reserved. Registered in {corporateIdentity.jurisdiction}.
          </div>
          <div className="flex flex-wrap items-center gap-3 text-slate-400">
            <Link
              to={ROUTES.GOVERNANCE.TERMS_OF_SERVICE}
              onClick={() => onOpenLegal?.('terms-of-use')}
              className="hover:text-[#00C2C7] transition-colors cursor-pointer"
            >
              Terms of Use
            </Link>
            <span aria-hidden="true">·</span>
            <Link
              to={ROUTES.GOVERNANCE.PRIVACY_POLICY}
              onClick={() => onOpenLegal?.('privacy-policy')}
              className="hover:text-[#00C2C7] transition-colors cursor-pointer"
            >
              Privacy Policy
            </Link>
            <span aria-hidden="true">·</span>
            <Link
              to={ROUTES.GOVERNANCE.COOKIE_POLICY}
              onClick={() => onOpenLegal?.('cookie-policy')}
              className="hover:text-[#00C2C7] transition-colors cursor-pointer"
            >
              Cookie Policy
            </Link>
            <span aria-hidden="true">·</span>
            <Link
              to={ROUTES.GOVERNANCE.TECHNOLOGY_SERVICES_DISCLAIMER}
              onClick={() => onOpenLegal?.('technology-services-disclaimer')}
              className="hover:text-[#00C2C7] transition-colors cursor-pointer"
            >
              Legal Notices (Draft)
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
