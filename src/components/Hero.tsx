import React from 'react';
import { ArrowUpRight, Shield, MapPin, Sparkles, Phone, CheckCircle, ExternalLink } from 'lucide-react';
import { BlockchainNetworkCanvas } from './animations/BlockchainNetworkCanvas';
import { FloatingTechnologyIcons } from './animations/FloatingTechnologyIcons';
import { COMPANY_CONFIG } from '../data/companyConfig';
import { BrandLogo } from './BrandLogo';

interface HeroProps {
  onNavigate: (sectionId: string) => void;
  onOpenPortal: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onNavigate, onOpenPortal }) => {
  return (
    <section id="hero" className="relative pt-10 pb-20 lg:pt-16 lg:pb-28 overflow-hidden bg-gradient-to-b from-[#0B1F3B] via-[#111827] to-[#111827]">
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
            <span>{COMPANY_CONFIG.initials}</span>
          </span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="text-[#00C2C7] font-semibold font-mono">{COMPANY_CONFIG.platformName}</span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          {COMPANY_CONFIG.registeredAddress && COMPANY_CONFIG.registeredAddressMapsUrl ? (
            <a
              href={COMPANY_CONFIG.registeredAddressMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-[#00C2C7] transition-colors"
            >
              <MapPin className="w-3.5 h-3.5 text-[#00C2C7] shrink-0" />
              <span>{COMPANY_CONFIG.registeredAddress}</span>
            </a>
          ) : (
            <span className="text-slate-300">Enterprise AI, Blockchain &amp; Digital Engineering</span>
          )}
        </div>

        {/* 2-Column Split: Editorial Value Proposition & Corporate Technology Identity Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          
          {/* Left Column: Heading, Subtitle & 4 Primary Actions */}
          <div className="lg:col-span-7 flex flex-col justify-center pointer-events-auto">
            
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[3.25rem] font-extrabold tracking-tight text-white leading-[1.14] text-balance">
              {COMPANY_CONFIG.headline}
            </h1>

            <p className="mt-4 text-xl sm:text-2xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[#00C2C7] via-[#0EA5E9] to-[#D4AF37] leading-snug text-balance">
              {COMPANY_CONFIG.subheadline}
            </p>

            <p className="mt-5 text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl text-balance">
              {COMPANY_CONFIG.heroDescription}
            </p>

            {/* 4 Primary Hero Actions */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={() => onNavigate('contact')}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-[#111827] bg-[#00C2C7] hover:bg-[#00d6dc] rounded-lg shadow-lg shadow-[#00C2C7]/20 hover:shadow-[#00C2C7]/30 transition-all cursor-pointer whitespace-nowrap"
              >
                <span>Start Your Project</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => onNavigate('services')}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-[#00C2C7]/50 rounded-lg transition-all cursor-pointer whitespace-nowrap"
              >
                <span>Explore Our Services</span>
              </button>

              <button
                onClick={() => onNavigate('portfolio')}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-300 hover:text-white bg-transparent hover:bg-slate-800/60 border border-slate-800 hover:border-slate-700 rounded-lg transition-all cursor-pointer whitespace-nowrap"
              >
                <span>View Our Portfolio</span>
              </button>

              <button
                onClick={onOpenPortal}
                className="inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold text-[#00C2C7] hover:text-white hover:bg-[#00C2C7]/10 border border-[#00C2C7]/40 rounded-lg transition-all cursor-pointer whitespace-nowrap"
              >
                <Shield className="w-4 h-4 text-[#00C2C7]" />
                <span>Enter {COMPANY_CONFIG.platformName}</span>
              </button>
            </div>

            {/* Verified Corporate Strip */}
            <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
              <span className="text-slate-300 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-[#00C2C7]" />
                <span className="font-semibold text-white">{COMPANY_CONFIG.name}</span>
              </span>
              {COMPANY_CONFIG.corporatePhone && COMPANY_CONFIG.corporatePhoneLink ? (
                <>
                  <span aria-hidden="true" className="text-slate-700 hidden sm:inline">·</span>
                  <a href={COMPANY_CONFIG.corporatePhoneLink} className="inline-flex items-center gap-1 text-[#00C2C7] hover:underline font-mono">
                    <Phone className="w-3 h-3" />
                    <span>{COMPANY_CONFIG.corporatePhone}</span>
                  </a>
                </>
              ) : null}
              <span aria-hidden="true" className="text-slate-700 hidden sm:inline">·</span>
              <span className="text-slate-300 font-mono">Monogram: {COMPANY_CONFIG.initials}</span>
              <span aria-hidden="true" className="text-slate-700 hidden sm:inline">·</span>
              <span className="text-slate-400">Global Digital Engineering</span>
            </div>

          </div>

          {/* Right Column: Official Corporate Technology Identity Card (190–210px Emblem) */}
          <div className="lg:col-span-5 flex justify-center pointer-events-auto">
            <div className="relative group max-w-sm sm:max-w-md w-full">
              
              {/* Subtle ambient lighting halo */}
              <div className="absolute -inset-1.5 bg-gradient-to-br from-[#D4AF37]/20 via-[#00C2C7]/25 to-[#0EA5E9]/25 rounded-3xl blur-lg opacity-70 group-hover:opacity-95 transition duration-500" />
              
              {/* Clean Corporate Identity Card */}
              <div className="relative rounded-2xl bg-[#111827] border border-slate-700/80 p-7 sm:p-8 shadow-2xl flex flex-col items-center text-center">
                
                {/* Official Circular Emblem */}
                <BrandLogo
                  variant="emblem"
                  size="hero"
                  ring="brand"
                  eager
                  decorative
                  className="transition-transform duration-500 group-hover:scale-[1.02]"
                />

                {/* Corporate Branding cleanly beneath the emblem */}
                <div className="mt-6 space-y-1 w-full">
                  <h2 className="text-base sm:text-lg font-bold tracking-wide text-white uppercase">
                    {COMPANY_CONFIG.name}
                  </h2>
                  <p className="text-xs font-semibold text-[#00C2C7] font-mono tracking-widest uppercase">
                    {COMPANY_CONFIG.platformName}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono tracking-wider pt-0.5">
                    AI · BLOCKCHAIN · SOFTWARE · CLOUD · MEDIA
                  </p>
                </div>

                {/* Symmetrical Information Strip */}
                <div className="mt-6 w-full pt-4 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center text-[11px]">
                  <div className="p-2.5 rounded-lg bg-[#0B1F3B]/80 border border-slate-800">
                    <span className="block text-slate-400 text-[10px] uppercase font-mono">Monogram</span>
                    <span className="font-semibold text-white mt-0.5 block truncate font-mono">{COMPANY_CONFIG.initials}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0B1F3B]/80 border border-slate-800">
                    <span className="block text-slate-400 text-[10px] uppercase font-mono">Network Tier</span>
                    <span className="font-semibold text-[#00C2C7] mt-0.5 block">Enterprise</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0B1F3B]/80 border border-slate-800">
                    <span className="block text-slate-400 text-[10px] uppercase font-mono">Standards</span>
                    <span className="font-semibold text-[#D4AF37] mt-0.5 block">AI &amp; Cloud</span>
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
            <span className="text-[11px] font-mono text-[#00C2C7]">Hover to inspect scope</span>
          </div>
          <FloatingTechnologyIcons onSelectCategory={() => onNavigate('services')} />
        </div>

      </div>
    </section>
  );
};
