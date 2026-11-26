import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X, ArrowUpRight, Shield, Phone, MapPin, Mail, ChevronDown, FileText } from 'lucide-react';
import { COMPANY_CONFIG, corporateIdentity } from '../data/companyConfig';
import { corporateProfile } from '../config/corporateProfile';
import { ROUTES } from '../config/routes';
import { BrandLogo } from './BrandLogo';

interface HeaderProps {
  onOpenPortal: () => void;
  onNavigate: (sectionId: string) => void;
  activeSection: string;
}

export const Header: React.FC<HeaderProps> = ({ onOpenPortal, onNavigate, activeSection }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aboutMenuOpen, setAboutMenuOpen] = useState(false);
  const aboutMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (aboutMenuRef.current && !aboutMenuRef.current.contains(event.target as Node)) {
        setAboutMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAboutMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const navItems = [
    { id: 'services', label: 'Solutions', to: ROUTES.SOLUTIONS },
    { id: 'portfolio', label: 'Portfolio', to: ROUTES.PORTFOLIO },
    { id: 'architecture', label: 'Enterprise Suite', to: ROUTES.ENTERPRISE_SUITE },
    { id: 'resources', label: 'Resources', to: ROUTES.RESOURCES },
    { id: 'ai-frontdesk', label: 'AI Front Desk', to: ROUTES.AI_FRONTDESK },
    { id: 'contact', label: 'Consultation', to: ROUTES.CONSULTATION },
  ];

  const handleNavClick = (id: string) => {
    setMobileMenuOpen(false);
    setAboutMenuOpen(false);
    onNavigate(id);
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-[#0B1F3B]/95 backdrop-blur-md border-b border-slate-800 transition-colors shadow-lg">
      {/* Top Executive Micro-Bar */}
      <div className="hidden xl:flex items-center justify-between px-6 lg:px-8 py-1.5 bg-[#081529] border-b border-slate-800/80 text-[11px] text-slate-400">
        <div className="flex items-center gap-4 min-w-0">
          <span className="flex items-center gap-1.5 text-slate-300 shrink-0">
            <span className="font-semibold text-white">{corporateIdentity.legalName}</span>
            <span className="font-mono text-[#D4AF37]">({corporateIdentity.abbreviation})</span>
          </span>
          <span aria-hidden="true" className="text-slate-700">|</span>
          <span className="flex items-center gap-1.5 text-slate-300 truncate max-w-xl" title={corporateIdentity.headquarters.fullAddress}>
            <MapPin className="w-3 h-3 text-[#00C2C7] shrink-0" />
            <span className="truncate">{corporateIdentity.headquarters.fullAddress}</span>
          </span>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <a
            href={corporateIdentity.contact.telephone.href}
            className="flex items-center gap-1.5 text-[#00C2C7] hover:text-[#00d6dc] font-mono font-medium transition-colors"
            aria-label={`Call ${corporateIdentity.legalName} at ${corporateIdentity.contact.telephone.display}`}
          >
            <Phone className="w-3 h-3" />
            <span>{corporateIdentity.contact.telephone.display}</span>
          </a>
          <span aria-hidden="true" className="text-slate-700">|</span>
          <a
            href={`mailto:${corporateIdentity.contact.email}`}
            className="flex items-center gap-1.5 text-slate-300 hover:text-[#00C2C7] font-mono transition-colors"
          >
            <Mail className="w-3 h-3 text-[#00C2C7]" />
            <span>{corporateIdentity.contact.email}</span>
          </a>
          <span aria-hidden="true" className="text-slate-700">|</span>
          <span className="font-mono text-[#D4AF37]">{corporateIdentity.networkName}</span>
        </div>
      </div>

      {/* Main Navigation Bar — Responsive Height 76px Mobile / 88px Desktop */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-[76px] sm:h-[88px] flex items-center justify-between gap-2 sm:gap-4">
        {/* Zone 1: Official Corporate Emblem & Exact Brand Name */}
        <Link
          to={ROUTES.HOME}
          onClick={() => handleNavClick('hero')}
          className="flex items-center gap-2.5 sm:gap-4 group text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] min-w-0 shrink"
          aria-label={`${COMPANY_CONFIG.name} Homepage`}
        >
          <BrandLogo
            variant="emblem"
            size="header"
            ring="brand"
            eager
            decorative
            className="group-hover:shadow-[#00C2C7]/40 transition-all shrink-0"
          />

          <div className="flex flex-col justify-center min-w-0">
            <span className="text-[13.5px] sm:text-[17px] font-bold tracking-wide text-white uppercase group-hover:text-[#00C2C7] transition-colors leading-tight truncate">
              {corporateIdentity.legalName}
            </span>
            <span className="text-[9.5px] sm:text-[10.5px] font-medium tracking-widest text-[#00C2C7] uppercase mt-0.5 font-mono truncate">
              {corporateIdentity.networkName}
            </span>
          </div>
        </Link>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden lg:flex items-center gap-3.5 xl:gap-5 text-[13px] xl:text-[13.5px] font-medium text-slate-300 shrink-0" aria-label="Primary Navigation">
          {/* About Dropdown (Houses About & Governance + Corporate Profile without crowding header) */}
          <div
            ref={aboutMenuRef}
            className="relative"
            onMouseEnter={() => setAboutMenuOpen(true)}
            onMouseLeave={() => setAboutMenuOpen(false)}
          >
            <button
              type="button"
              onClick={() => setAboutMenuOpen((prev) => !prev)}
              aria-expanded={aboutMenuOpen}
              aria-haspopup="menu"
              className={`inline-flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer py-2 relative leading-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] rounded-sm ${
                activeSection === 'about' || activeSection === 'corporate-profile'
                  ? 'text-[#00C2C7] font-semibold'
                  : 'hover:text-white text-slate-300'
              }`}
            >
              <span>About</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  aboutMenuOpen ? 'rotate-180 text-[#00C2C7]' : ''
                }`}
              />
              {(activeSection === 'about' || activeSection === 'corporate-profile') && (
                <span className="absolute bottom-0 left-0 w-full h-[2px] bg-[#00C2C7] rounded-full shadow-[0_0_8px_#00C2C7]" />
              )}
            </button>

            <div
              role="menu"
              className={`absolute left-0 top-full pt-2 w-60 z-50 transition-all duration-150 ${
                aboutMenuOpen
                  ? 'opacity-100 pointer-events-auto translate-y-0'
                  : 'opacity-0 pointer-events-none -translate-y-1'
              }`}
            >
              <div className="rounded-xl bg-[#0B1F3B] border border-slate-700/90 shadow-2xl p-1.5 space-y-1">
                <Link
                  role="menuitem"
                  to={ROUTES.ABOUT}
                  onClick={() => handleNavClick('about')}
                  className={`flex flex-col px-3 py-2.5 rounded-lg transition-colors ${
                    activeSection === 'about'
                      ? 'bg-[#00C2C7]/15 text-[#00C2C7]'
                      : 'text-slate-200 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <span className="text-xs font-semibold">About &amp; Governance</span>
                  <span className="text-[10.5px] text-slate-400">Executive identity &amp; standards</span>
                </Link>
                <Link
                  role="menuitem"
                  to={corporateProfile.pagePath}
                  onClick={() => {
                    setAboutMenuOpen(false);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg transition-colors ${
                    activeSection === 'corporate-profile'
                      ? 'bg-[#00C2C7]/15 text-[#00C2C7]'
                      : 'text-slate-200 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-[#00C2C7] mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <span className="block text-xs font-semibold">Corporate Profile</span>
                    <span className="block text-[10.5px] text-slate-400">
                      View &amp; download official PDF
                    </span>
                  </div>
                </Link>
              </div>
            </div>
          </div>

          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <Link
                key={item.id}
                to={item.to}
                onClick={() => handleNavClick(item.id)}
                className={`transition-colors whitespace-nowrap cursor-pointer py-2 relative leading-normal ${
                  isActive ? 'text-[#00C2C7] font-semibold' : 'hover:text-white text-slate-300'
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 w-full h-[2px] bg-[#00C2C7] rounded-full shadow-[0_0_8px_#00C2C7]" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Zone 3: Direct Telephone & Primary Action Buttons */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <a
            href={corporateIdentity.contact.telephone.href}
            className="hidden md:inline-flex lg:hidden items-center gap-1.5 px-2.5 py-2 text-[11.5px] font-mono font-semibold text-[#00C2C7] hover:text-white border border-slate-700/80 hover:border-[#00C2C7]/50 rounded-lg bg-[#081529] transition-colors whitespace-nowrap"
            aria-label={`Call ${corporateIdentity.contact.telephone.display}`}
          >
            <Phone className="w-3.5 h-3.5" />
            <span>{corporateIdentity.contact.telephone.display}</span>
          </a>

          <button
            onClick={onOpenPortal}
            className="flex items-center gap-1.5 px-3 xl:px-3.5 py-2.5 text-[12px] xl:text-[12.5px] font-semibold text-slate-200 hover:text-white border border-slate-700/80 hover:border-[#00C2C7]/50 rounded-lg transition-all bg-[#111827]/85 whitespace-nowrap cursor-pointer hover:bg-slate-800"
          >
            <Shield className="w-3.5 h-3.5 text-[#00C2C7]" />
            <span>Client Portal</span>
          </button>

          <Link
            to={ROUTES.CONSULTATION}
            onClick={() => handleNavClick('contact')}
            className="flex items-center gap-1.5 px-3.5 xl:px-4 py-2.5 text-[12px] xl:text-[12.5px] font-semibold text-[#111827] bg-[#00C2C7] hover:bg-[#00d6dc] rounded-lg shadow-sm hover:shadow-[#00C2C7]/25 transition-all whitespace-nowrap cursor-pointer"
          >
            <span className="hidden xl:inline">Request a Consultation</span>
            <span className="xl:hidden">Consult</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Mobile Hamburger & Direct Call Button */}
        <div className="flex lg:hidden items-center gap-2">
          <a
            href={corporateIdentity.contact.telephone.href}
            className="p-2 text-[#00C2C7] bg-slate-900 rounded-lg border border-slate-800 sm:hidden"
            aria-label={`Call ${corporateIdentity.contact.telephone.display}`}
          >
            <Phone className="w-4 h-4" />
          </a>
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
        <div className="lg:hidden bg-[#0B1F3B] border-b border-slate-800 px-4 sm:px-5 pt-3 pb-6 space-y-4 shadow-2xl max-h-[calc(100dvh-76px)] overflow-y-auto">
          <div className="p-3.5 rounded-lg bg-[#111827]/90 border border-slate-800 space-y-1.5 text-xs">
            <div className="text-slate-200 font-semibold">
              {corporateIdentity.legalName}{' '}
              <span className="font-mono text-[#D4AF37]">({corporateIdentity.abbreviation})</span>
            </div>
            <div className="text-[11px] font-mono text-[#00C2C7]">{corporateIdentity.networkName}</div>
            <a
              href={corporateIdentity.contact.telephone.href}
              className="flex items-center gap-1.5 text-[#00C2C7] font-mono font-medium pt-0.5"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>{corporateIdentity.contact.telephone.display}</span>
            </a>
            <a
              href={`mailto:${corporateIdentity.contact.email}`}
              className="flex items-center gap-1.5 text-slate-300 font-mono text-[11px]"
            >
              <Mail className="w-3.5 h-3.5 text-[#00C2C7]" />
              <span>{corporateIdentity.contact.email}</span>
            </a>
            <div className="text-[11px] text-slate-400 pt-0.5">
              {corporateIdentity.headquarters.fullAddress}
            </div>
          </div>

          <div className="flex flex-col space-y-1">
            <Link
              to={ROUTES.ABOUT}
              onClick={() => handleNavClick('about')}
              className="text-left py-2.5 px-3 text-[13.5px] font-medium text-slate-200 hover:text-[#00C2C7] hover:bg-slate-900/60 rounded-md transition-colors"
            >
              About &amp; Governance
            </Link>
            <Link
              to={corporateProfile.pagePath}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-2 text-left py-2.5 px-3 text-[13.5px] font-medium rounded-md transition-colors ${
                activeSection === 'corporate-profile'
                  ? 'text-[#00C2C7] bg-[#00C2C7]/10 font-semibold'
                  : 'text-slate-200 hover:text-[#00C2C7] hover:bg-slate-900/60'
              }`}
            >
              <FileText className="w-4 h-4 text-[#00C2C7] shrink-0" />
              <span>Corporate Profile</span>
            </Link>
            {navItems.map((item) => (
              <Link
                key={item.id}
                to={item.to}
                onClick={() => handleNavClick(item.id)}
                className="text-left py-2.5 px-3 text-[13.5px] font-medium text-slate-200 hover:text-[#00C2C7] hover:bg-slate-900/60 rounded-md transition-colors"
              >
                {item.label}
              </Link>
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
              <span>Access {corporateIdentity.networkName} Portal</span>
            </button>
            <Link
              to={ROUTES.CONSULTATION}
              onClick={() => handleNavClick('contact')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#111827] bg-[#00C2C7] hover:bg-[#00d6dc] rounded-lg"
            >
              <span>Request a Consultation</span>
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};
