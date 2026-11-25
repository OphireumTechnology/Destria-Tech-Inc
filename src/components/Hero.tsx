import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Shield, MapPin, Sparkles, Phone, CheckCircle, Mail } from 'lucide-react';
import { BlockchainNetworkCanvas } from './animations/BlockchainNetworkCanvas';
import { FloatingTechnologyIcons } from './animations/FloatingTechnologyIcons';
import { COMPANY_CONFIG, corporateIdentity } from '../data/companyConfig';
import { ROUTES } from '../config/routes';
import { BrandLogo } from './BrandLogo';

interface HeroProps {
  onNavigate: (sectionId: string) => void;
  onOpenPortal: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onNavigate, onOpenPortal }) => {
  return (
    <section
      id="hero"
      className="relative pt-10 pb-20 lg:pt-16 lg:pb-28 overflow-hidden bg-gradient-to-b from-[#0B1F3B] via-[#111827] to-[#111827]"
    >
      {/* Dynamic Animated Blockchain Network Background Canvas */}
      <div className="absolute inset-0 pointer-events-auto opacity-70">
        <BlockchainNetworkCanvas nodeCount={50} interactive={true} />
      </div>

      {/* Atmospheric lighting halos */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-[#00C2C7]/12 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-[380px] h-[380px] bg-[#D4AF37]/8 blur-[130px] rounded-full pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pointer-events-none">
        {/* Brand & Network Indicator */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-300 mb-6 pointer-events-auto">
          <span className="flex items-center gap-1.5 text-white font-semibold font-mono">
            <Sparkles className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
            <span>{corporateIdentity.abbreviation}</span>
          </span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="text-[#00C2C7] font-semibold font-mono">{corporateIdentity.networkName}</span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="flex items-center gap-1.5 text-slate-300">
            <MapPin className="w-3.5 h-3.5 text-[#00C2C7] shrink-0" />
            <span>{corporateIdentity.jurisdiction}</span>
          </span>
        </div>

        {/* 2-Column Split: Editorial Value Proposition & Corporate Technology Identity Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          {/* Left Column: Heading, Subtitle & Primary Enterprise Actions */}
          <div className="lg:col-span-7 flex flex-col justify-center pointer-events-auto">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[3.25rem] font-extrabold tracking-tight text-white leading-[1.14] text-balance">
              {COMPANY_CONFIG.headline}
            </h1>

            <p className="mt-4 text-lg sm:text-xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[#00C2C7] via-[#0EA5E9] to-[#D4AF37] leading-snug text-balance">
              Customized Enterprise Technology Solutions Architected for Operational Resilience &amp; Scale
            </p>

            <p className="mt-5 text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl text-balance">
              {COMPANY_CONFIG.heroDescription}
            </p>

            {/* Primary Enterprise CTAs */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to={ROUTES.CONSULTATION}
                onClick={() => onNavigate('contact')}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-[#111827] bg-[#00C2C7] hover:bg-[#00d6dc] rounded-lg shadow-lg shadow-[#00C2C7]/20 hover:shadow-[#00C2C7]/30 transition-all cursor-pointer whitespace-nowrap"
              >
                <span>Request an Enterprise Consultation</span>
                <ArrowUpRight className="w-4 h-4" />
              </Link>

              <Link
                to={ROUTES.SOLUTIONS}
                onClick={() => onNavigate('services')}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-[#00C2C7]/50 rounded-lg transition-all cursor-pointer whitespace-nowrap"
              >
                <span>Explore Our Technology Solutions</span>
              </Link>

              <button
                onClick={onOpenPortal}
                className="inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold text-[#00C2C7] hover:text-white hover:bg-[#00C2C7]/10 border border-[#00C2C7]/40 rounded-lg transition-all cursor-pointer whitespace-nowrap"
              >
                <Shield className="w-4 h-4 text-[#00C2C7]" />
                <span>Access {corporateIdentity.networkName} Portal</span>
              </button>
            </div>

            {/* Verified Corporate Strip */}
            <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
              <span className="text-slate-300 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-[#00C2C7]" />
                <span className="font-semibold text-white">{corporateIdentity.legalName}</span>
              </span>
              <span aria-hidden="true" className="text-slate-700 hidden sm:inline">·</span>
              <a
                href={corporateIdentity.contact.telephone.href}
                className="inline-flex items-center gap-1.5 text-[#00C2C7] hover:underline font-mono font-medium"
              >
                <Phone className="w-3 h-3" />
                <span>{corporateIdentity.contact.telephone.display}</span>
              </a>
              <span aria-hidden="true" className="text-slate-700 hidden sm:inline">·</span>
              <a
                href={`mailto:${corporateIdentity.contact.email}`}
                className="inline-flex items-center gap-1.5 text-slate-300 hover:text-[#00C2C7] font-mono"
              >
                <Mail className="w-3 h-3 text-[#00C2C7]" />
                <span>{corporateIdentity.contact.email}</span>
              </a>
            </div>
          </div>

          {/* Right Column: Official Corporate Technology Identity Card */}
          <div className="lg:col-span-5 flex justify-center pointer-events-auto">
            <div className="relative group max-w-sm sm:max-w-md w-full">
              <div className="absolute -inset-1.5 bg-gradient-to-br from-[#D4AF37]/20 via-[#00C2C7]/25 to-[#0EA5E9]/25 rounded-3xl blur-lg opacity-70 group-hover:opacity-95 transition duration-500" />

              <div className="relative rounded-2xl bg-[#111827] border border-slate-700/80 p-7 sm:p-8 shadow-2xl flex flex-col items-center text-center">
                <BrandLogo
                  variant="emblem"
                  size="hero"
                  ring="brand"
                  eager
                  decorative
                  className="transition-transform duration-500 group-hover:scale-[1.02]"
                />

                <div className="mt-6 space-y-1 w-full">
                  <h2 className="text-base sm:text-lg font-bold tracking-wide text-white uppercase">
                    {corporateIdentity.legalName}
                  </h2>
                  <p className="text-xs font-semibold text-[#00C2C7] font-mono tracking-widest uppercase">
                    {corporateIdentity.networkName}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono tracking-wider pt-0.5">
                    AI · SOFTWARE · CLOUD · SECURITY · BLOCKCHAIN
                  </p>
                </div>

                {/* Symmetrical Information Strip */}
                <div className="mt-6 w-full pt-4 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center text-[11px]">
                  <div className="p-2.5 rounded-lg bg-[#0B1F3B]/80 border border-slate-800">
                    <span className="block text-slate-400 text-[10px] uppercase font-mono">Entity</span>
                    <span className="font-semibold text-white mt-0.5 block truncate font-mono">
                      {corporateIdentity.abbreviation}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0B1F3B]/80 border border-slate-800">
                    <span className="block text-slate-400 text-[10px] uppercase font-mono">Engagement</span>
                    <span className="font-semibold text-[#00C2C7] mt-0.5 block">Custom</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0B1F3B]/80 border border-slate-800">
                    <span className="block text-slate-400 text-[10px] uppercase font-mono">Jurisdiction</span>
                    <span className="font-semibold text-[#D4AF37] mt-0.5 block">Wyoming</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating Technology Disciplines Strip (12 Core Icons) */}
        <div className="mt-16 pt-8 border-t border-slate-800/80 pointer-events-auto">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Interconnected Technology Disciplines (12 Core Domains)
            </span>
            <span className="text-[11px] font-mono text-[#00C2C7]">Customized Enterprise Frameworks</span>
          </div>
          <FloatingTechnologyIcons onSelectCategory={() => onNavigate('services')} />
        </div>
      </div>
    </section>
  );
};
