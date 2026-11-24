import React, { useState } from 'react';
import { Menu, X, ArrowUpRight, Shield, Phone, MapPin } from 'lucide-react';
import { COMPANY_CONFIG } from '../data/companyConfig';
import { BrandLogo } from './BrandLogo';

interface HeaderProps {
  onOpenPortal: () => void;
  onNavigate: (sectionId: string) => void;
  activeSection: string;
}

export const Header: React.FC<HeaderProps> = ({ onOpenPortal, onNavigate, activeSection }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'about', label: 'About & Governance' },
    { id: 'services', label: 'Services' },
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'architecture', label: 'Enterprise Suite' },
    { id: 'contact', label: 'Contact Us' },
  ];

  const handleNavClick = (id: string) => {
    setMobileMenuOpen(false);
    onNavigate(id);
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-[#0B1F3B]/95 backdrop-blur-md border-b border-slate-800 transition-colors shadow-lg">
      
      {/* Top Executive Micro-Bar */}
      <div className="hidden xl:flex items-center justify-between px-6 lg:px-8 py-1.5 bg-[#081529] border-b border-slate-800/80 text-[11px] text-slate-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="font-semibold text-white">{COMPANY_CONFIG.name}</span>
            <span className="font-mono text-[#D4AF37]">({COMPANY_CONFIG.initials})</span>
          </span>
          <span aria-hidden="true" className="text-slate-700">|</span>
          {COMPANY_CONFIG.registeredAddress && COMPANY_CONFIG.registeredAddressMapsUrl ? (
            <a
              href={COMPANY_CONFIG.registeredAddressMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-[#00C2C7] transition-colors truncate max-w-lg"
              title="View corporate location on Google Maps"
            >
              <MapPin className="w-3 h-3 text-[#00C2C7] shrink-0" />
              <span className="truncate">{COMPANY_CONFIG.registeredAddress}</span>
            </a>
          ) : (
            <span className="text-slate-300 font-mono">{COMPANY_CONFIG.subheadline}</span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {COMPANY_CONFIG.corporatePhone && COMPANY_CONFIG.corporatePhoneLink ? (
            <>
              <a
                href={COMPANY_CONFIG.corporatePhoneLink}
                className="flex items-center gap-1.5 text-[#00C2C7] hover:text-[#00d6dc] font-mono font-medium transition-colors"
              >
                <Phone className="w-3 h-3" />
                <span>{COMPANY_CONFIG.corporatePhone}</span>
              </a>
              <span aria-hidden="true" className="text-slate-700">|</span>
            </>
          ) : null}
          <span className="font-mono text-[#00C2C7]">{COMPANY_CONFIG.platformName}</span>
          <span aria-hidden="true" className="text-slate-700">|</span>
          <span className="font-mono text-slate-400">AI · Blockchain · Enterprise Engineering</span>
        </div>
      </div>

      {/* Main Navigation Bar — Desktop Height 88px */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[88px] flex items-center justify-between gap-4">
        
        {/* Zone 1: Official Corporate Emblem & Exact Brand Name */}
        <button
          onClick={() => handleNavClick('hero')}
          className="flex items-center gap-3.5 sm:gap-4 group text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] shrink-0"
          aria-label={`${COMPANY_CONFIG.name} Homepage`}
        >
          {/* Official Logo: 54px on desktop, 44px on mobile */}
          <BrandLogo
            variant="emblem"
            size="header"
            ring="brand"
            eager
            decorative
            className="group-hover:shadow-[#00C2C7]/40 transition-all"
          />

          <div className="flex flex-col justify-center">
            <span className="text-[15px] sm:text-[17px] font-bold tracking-wide text-white uppercase group-hover:text-[#00C2C7] transition-colors leading-tight">
              {COMPANY_CONFIG.name}
            </span>
            <span className="text-[10px] sm:text-[10.5px] font-medium tracking-widest text-[#00C2C7] uppercase mt-0.5 font-mono">
              {COMPANY_CONFIG.platformName}
            </span>
          </div>
        </button>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden lg:flex items-center gap-6 xl:gap-8 text-[13.5px] font-medium text-slate-300">
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`transition-colors whitespace-nowrap cursor-pointer py-2 relative leading-normal ${
                  isActive ? 'text-[#00C2C7] font-semibold' : 'hover:text-white text-slate-300'
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 w-full h-[2px] bg-[#00C2C7] rounded-full shadow-[0_0_8px_#00C2C7]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary Action Buttons */}
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          <button
            onClick={onOpenPortal}
            className="flex items-center gap-2 px-3.5 py-2.5 text-[12.5px] font-semibold text-slate-200 hover:text-white border border-slate-700/80 hover:border-[#00C2C7]/50 rounded-lg transition-all bg-[#111827]/85 whitespace-nowrap cursor-pointer hover:bg-slate-800"
          >
            <Shield className="w-3.5 h-3.5 text-[#00C2C7]" />
            <span>Enter Network</span>
          </button>

          <button
            onClick={() => handleNavClick('contact')}
            className="flex items-center gap-1.5 px-4 py-2.5 text-[12.5px] font-semibold text-[#111827] bg-[#00C2C7] hover:bg-[#00d6dc] rounded-lg shadow-sm hover:shadow-[#00C2C7]/25 transition-all whitespace-nowrap cursor-pointer"
          >
            <span>Start Your Project</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mobile Hamburger & Optional Verified Direct Call Button */}
        <div className="flex lg:hidden items-center gap-2">
          {COMPANY_CONFIG.corporatePhone && COMPANY_CONFIG.corporatePhoneLink ? (
            <a
              href={COMPANY_CONFIG.corporatePhoneLink}
              className="p-2 text-[#00C2C7] bg-slate-900 rounded-lg border border-slate-800 sm:hidden"
              aria-label={`Call ${COMPANY_CONFIG.corporatePhone}`}
            >
              <Phone className="w-4 h-4" />
            </a>
          ) : null}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2.5 text-slate-300 hover:text-white focus:outline-none cursor-pointer rounded-lg bg-slate-900 border border-slate-800"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5 text-[#00C2C7]" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#0B1F3B] border-b border-slate-800 px-5 pt-3 pb-6 space-y-4 shadow-2xl">
          <div className="p-3.5 rounded-lg bg-[#111827]/90 border border-slate-800 space-y-1.5 text-xs">
            <div className="text-slate-200 font-semibold">
              {COMPANY_CONFIG.name} <span className="font-mono text-[#D4AF37]">({COMPANY_CONFIG.initials})</span>
            </div>
            <div className="text-[11px] font-mono text-[#00C2C7]">{COMPANY_CONFIG.platformName}</div>
            {COMPANY_CONFIG.corporatePhone && COMPANY_CONFIG.corporatePhoneLink ? (
              <a href={COMPANY_CONFIG.corporatePhoneLink} className="flex items-center gap-1.5 text-[#00C2C7] font-mono font-medium pt-0.5">
                <Phone className="w-3.5 h-3.5" />
                <span>{COMPANY_CONFIG.corporatePhone}</span>
              </a>
            ) : null}
            {COMPANY_CONFIG.registeredAddress ? (
              <div className="text-[11px] text-slate-400 pt-0.5">{COMPANY_CONFIG.registeredAddress}</div>
            ) : null}
          </div>

          <div className="flex flex-col space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className="text-left py-2.5 px-3 text-[13.5px] font-medium text-slate-200 hover:text-[#00C2C7] hover:bg-slate-900/60 rounded-md transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-800 flex flex-col gap-2.5">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenPortal();
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-200 border border-slate-700 rounded-lg hover:border-[#00C2C7]"
            >
              <Shield className="w-4 h-4 text-[#00C2C7]" />
              <span>Enter {COMPANY_CONFIG.platformName}</span>
            </button>
            <button
              onClick={() => handleNavClick('contact')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#111827] bg-[#00C2C7] hover:bg-[#00d6dc] rounded-lg"
            >
              <span>Start Your Project</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
