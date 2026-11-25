import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Compass, Shield, Phone, Mail } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { corporateIdentity } from '../data/companyConfig';
import { ROUTES } from '../config/routes';

interface NotFoundPageProps {
  scope?: 'public' | 'portal' | 'admin';
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ scope = 'public' }) => {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#111827] text-slate-100 flex flex-col justify-between">
      <header className="border-b border-slate-800 bg-[#0B1F3B]/95">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          <Link to={ROUTES.HOME} className="flex items-center gap-3 group">
            <BrandLogo variant="emblem" size="md" ring="brand" eager decorative />
            <div>
              <span className="block text-sm font-bold tracking-wide text-white uppercase group-hover:text-[#00C2C7] transition-colors">
                {corporateIdentity.legalName}
              </span>
              <span className="block text-[10px] font-mono text-[#00C2C7] tracking-widest uppercase">
                {corporateIdentity.networkName}
              </span>
            </div>
          </Link>

          <Link
            to={ROUTES.PORTAL.LOGIN}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-700 hover:border-[#00C2C7]/60 bg-[#111827] text-xs font-semibold text-slate-200 hover:text-white transition-colors"
          >
            <Shield className="w-3.5 h-3.5 text-[#00C2C7]" />
            <span>Client Portal</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-xl rounded-2xl bg-[#0B1F3B]/80 border border-slate-800 p-8 sm:p-10 text-center space-y-6 shadow-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#00C2C7]/10 border border-[#00C2C7]/30 text-xs font-mono text-[#00C2C7] uppercase tracking-wider">
            <Compass className="w-3.5 h-3.5" />
            <span>HTTP 404 · Route Not Found</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Requested Page Could Not Be Found
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              The address <code className="font-mono text-[#00C2C7]">{location.pathname}</code> does not
              match an active {scope === 'portal' ? 'Client Portal' : scope === 'admin' ? 'Administrative' : 'DESTRIA TECH INC'} route.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              to={
                scope === 'portal'
                  ? ROUTES.PORTAL.DASHBOARD
                  : scope === 'admin'
                  ? ROUTES.ADMIN.DASHBOARD
                  : ROUTES.HOME
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#00C2C7] hover:bg-[#00d6dc] text-[#0B1F3B] text-sm font-semibold transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>
                {scope === 'portal'
                  ? 'Return to Client Dashboard'
                  : scope === 'admin'
                  ? 'Return to Admin Console'
                  : 'Return to Corporate Homepage'}
              </span>
            </Link>

            <Link
              to={ROUTES.SOLUTIONS}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-700 hover:border-[#00C2C7]/50 text-slate-200 hover:text-white text-sm font-semibold transition-colors"
            >
              <span>Technology Solutions</span>
            </Link>

            <Link
              to={ROUTES.CONSULTATION}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-700 hover:border-[#00C2C7]/50 text-slate-200 hover:text-white text-sm font-semibold transition-colors"
            >
              <span>Request Consultation</span>
            </Link>
          </div>

          <div className="pt-5 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400">
            <a
              href={corporateIdentity.contact.telephone.href}
              className="inline-flex items-center gap-1.5 text-[#00C2C7] hover:underline font-mono"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>{corporateIdentity.contact.telephone.display}</span>
            </a>
            <a
              href={`mailto:${corporateIdentity.contact.email}`}
              className="inline-flex items-center gap-1.5 text-slate-300 hover:text-[#00C2C7] font-mono"
            >
              <Mail className="w-3.5 h-3.5 text-[#00C2C7]" />
              <span>{corporateIdentity.contact.email}</span>
            </a>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-800 bg-[#081529] py-4 px-4 text-center text-[11px] text-slate-500">
        © 2026 {corporateIdentity.legalName} ({corporateIdentity.abbreviation}) · {corporateIdentity.jurisdiction}
      </footer>
    </div>
  );
};

export default NotFoundPage;
