import React, { useState } from 'react';
import {
  Building,
  Phone,
  Eye,
  Check,
  Target,
  Compass,
  ShieldCheck,
  ExternalLink,
  Layers,
  Globe,
} from 'lucide-react';
import { GlobalDigitalGlobe } from './animations/GlobalDigitalGlobe';
import { COMPANY_CONFIG } from '../data/companyConfig';

interface AboutSectionProps {
  onOpenPortal: () => void;
}

export const AboutSection: React.FC<AboutSectionProps> = ({ onOpenPortal }) => {
  const [showBrandBoardModal, setShowBrandBoardModal] = useState(false);

  return (
    <section id="about" className="py-20 lg:py-28 bg-[#111827] border-t border-slate-800/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#00C2C7] uppercase tracking-wider mb-2 font-mono">
            <span>Corporate Profile &amp; Governance</span>
            <span aria-hidden="true">·</span>
            <span>{COMPANY_CONFIG.platformName}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white text-balance leading-tight">
            Engineered for Intelligent Systems and Connected Digital Transformation
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300 leading-relaxed text-balance">
            {COMPANY_CONFIG.name} ({COMPANY_CONFIG.initials}) operates at the convergence of autonomous artificial intelligence, blockchain infrastructure, enterprise software engineering, cloud cybersecurity, and creative digital media.
          </p>
        </div>

        {/* Corporate Architecture & Verified Operations Card */}
        <div className="mt-12 rounded-2xl bg-gradient-to-br from-[#0B1F3B] via-[#111827] to-[#0B1F3B] border border-slate-700/80 p-6 sm:p-8 shadow-xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Corporate Identity Left Block */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center gap-2 text-xs font-mono text-[#00C2C7] uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-[#00C2C7]" />
                <span>Corporate Identity &amp; Technology Network</span>
              </div>

              <div>
                <span className="text-xs text-[#D4AF37] uppercase tracking-wider font-mono">
                  {COMPANY_CONFIG.platformName} · Official Monogram {COMPANY_CONFIG.initials}
                </span>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                  {COMPANY_CONFIG.name}
                </h3>
                <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                  Delivering resilient enterprise architecture, custom AI agents, verifiable distributed systems, and high-precision digital platforms under strict engineering governance and transparent project workflows.
                </p>
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-3 text-xs font-mono">
                <button
                  type="button"
                  onClick={onOpenPortal}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00C2C7] text-[#111827] font-semibold hover:bg-[#00d6dc] transition-all cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Access {COMPANY_CONFIG.platformName} Portal</span>
                </button>
                {COMPANY_CONFIG.corporatePhone && COMPANY_CONFIG.corporatePhoneLink ? (
                  <a
                    href={COMPANY_CONFIG.corporatePhoneLink}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-[#00C2C7] hover:border-[#00C2C7] transition-all"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>{COMPANY_CONFIG.corporatePhone}</span>
                  </a>
                ) : null}
              </div>
            </div>

            {/* Corporate Records & Contact Governance Right Block */}
            <div className="lg:col-span-5 p-5 rounded-xl bg-[#111827]/95 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono text-[#00C2C7] uppercase">Corporate Profile Details</span>
                <Building className="w-4 h-4 text-[#D4AF37]" />
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400 font-mono">Corporate Name</span>
                  <span className="font-semibold text-white">{COMPANY_CONFIG.name}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400 font-mono">Technology Network</span>
                  <span className="font-semibold text-[#00C2C7] font-mono">{COMPANY_CONFIG.platformName}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400 font-mono">Official Monogram</span>
                  <span className="font-semibold text-[#D4AF37] font-mono">{COMPANY_CONFIG.initials}</span>
                </div>
                {COMPANY_CONFIG.verification.leadershipName ? (
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400 font-mono">Executive Leadership</span>
                    <span className="font-semibold text-white">{COMPANY_CONFIG.verification.leadershipName}</span>
                  </div>
                ) : null}
                {COMPANY_CONFIG.verification.registrationNo ? (
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400 font-mono">Registration No.</span>
                    <span className="font-semibold text-emerald-400 font-mono">{COMPANY_CONFIG.verification.registrationNo}</span>
                  </div>
                ) : null}
                {COMPANY_CONFIG.registeredAddress ? (
                  <div className="pt-1 space-y-1">
                    <span className="text-slate-400 font-mono block">Registered Office</span>
                    <p className="text-slate-200">{COMPANY_CONFIG.registeredAddress}</p>
                    {COMPANY_CONFIG.registeredAddressMapsUrl ? (
                      <a
                        href={COMPANY_CONFIG.registeredAddressMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#00C2C7] hover:text-white transition-colors pt-1"
                      >
                        <span>View on Google Maps</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <div className="pt-1 flex items-start gap-2 text-[11px] text-slate-400">
                    <Globe className="w-3.5 h-3.5 text-[#00C2C7] shrink-0 mt-0.5" />
                    <span>
                      Global digital operations with direct enterprise intake via the {COMPANY_CONFIG.platformName} Client Portal. Official incorporation credentials are published strictly upon corporate verification.
                    </span>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Global Digital Network Globe & Corporate Vision / Mission Grid */}
        <div className="mt-14 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Animated Global Digital Network Visualization */}
          <div className="lg:col-span-6 rounded-2xl bg-[#0B1F3B]/50 border border-slate-800 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-[#00C2C7] uppercase">Global Network Topology</span>
                <span className="text-[10px] font-mono text-slate-400">DESTRIA Core to World Cloud Hubs</span>
              </div>
              <h3 className="text-lg font-bold text-white">Distributed Enterprise Presence</h3>
              <p className="text-xs text-slate-300 mt-1">
                Synchronized communication links connecting {COMPANY_CONFIG.platformName} infrastructure to international engineering hubs and multi-region cloud environments.
              </p>
            </div>

            <div className="mt-4 h-72 w-full rounded-xl bg-slate-950/80 border border-slate-800/80 overflow-hidden relative">
              <GlobalDigitalGlobe className="w-full h-full" />
            </div>
          </div>

          {/* Vision and Mission Cards */}
          <div className="lg:col-span-6 space-y-6">
            
            <div className="rounded-2xl bg-[#0B1F3B]/50 border border-slate-800 p-6 group hover:border-[#00C2C7]/40 transition-all">
              <div className="w-10 h-10 rounded-lg bg-[#00C2C7]/10 flex items-center justify-center text-[#00C2C7] mb-4">
                <Target className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Corporate Vision</h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
                To establish {COMPANY_CONFIG.platformName} as an international technology and intelligent systems powerhouse—connecting enterprise software infrastructure, autonomous AI engineering, and high-precision digital media on a global scale.
              </p>
            </div>

            <div className="rounded-2xl bg-[#0B1F3B]/50 border border-slate-800 p-6 group hover:border-[#D4AF37]/40 transition-all">
              <div className="w-10 h-10 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37] mb-4">
                <Compass className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Strategic Mission</h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
                To deliver verifiable excellence across artificial intelligence, blockchain systems, enterprise software engineering, and digital modernization through disciplined architecture, security-first governance, and client-focused execution.
              </p>
            </div>

          </div>

        </div>

        {/* Official Destria Brand Identity Board Reference Banner */}
        <div className="mt-10 rounded-2xl bg-gradient-to-r from-[#0B1F3B] via-[#111827] to-[#0B1F3B] border border-slate-700/80 p-6 sm:p-8 flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="relative w-20 h-14 rounded-xl overflow-hidden border border-slate-700 shrink-0 bg-[#0B1F3B]">
              <img
                src={COMPANY_CONFIG.brandBoardUrl}
                alt="DESTRIA TECH INC Official Brand Identity Board"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            <div>
              <span className="text-xs font-mono text-[#D4AF37] uppercase">Official Brand Identity Board &amp; Color System</span>
              <h4 className="text-base font-bold text-white mt-0.5">
                Graphite #111827 · Technology Cyan #00C2C7 · Silver Gray #F3F4F6 · Gold #D4AF37 · Deep Navy #0B1F3B
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                Approved visual identity standard governing all {COMPANY_CONFIG.name} digital products, portals, documentation, and broadcasts.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowBrandBoardModal(true)}
            className="px-4 py-2 text-xs font-semibold text-slate-200 hover:text-white border border-slate-600 hover:border-[#00C2C7] rounded-lg transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-[#00C2C7]" />
            <span>Inspect Brand Board</span>
          </button>
        </div>

        {/* Corporate Governance Standards */}
        <div className="mt-14">
          <div className="max-w-2xl mb-8">
            <h3 className="text-xl font-bold text-white">Corporate Governance &amp; Engineering Invariants</h3>
            <p className="text-xs text-slate-400 mt-1">
              Operational parameters strictly enforced across all technology, AI, software, and digital production engagements.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="p-5 rounded-xl bg-[#0B1F3B]/50 border border-slate-800">
              <div className="flex items-center gap-2 font-semibold text-white text-sm mb-2">
                <Check className="w-4 h-4 text-[#00C2C7]" />
                <span>Zero-Hallucination Policy</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                All technical metrics, capabilities, and system outputs reflect verifiable engineering without inflated claims.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[#0B1F3B]/50 border border-slate-800">
              <div className="flex items-center gap-2 font-semibold text-white text-sm mb-2">
                <Check className="w-4 h-4 text-[#00C2C7]" />
                <span>Strict Tenant Isolation</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Client project deliverables, proprietary codebases, and enterprise databases are strictly segregated with fine-grained access control.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[#0B1F3B]/50 border border-slate-800">
              <div className="flex items-center gap-2 font-semibold text-white text-sm mb-2">
                <Check className="w-4 h-4 text-[#00C2C7]" />
                <span>Human-in-the-Loop</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                AI agents draft and propose; senior engineers and architects review, validate, and authorize all production deliverables.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[#0B1F3B]/50 border border-slate-800">
              <div className="flex items-center gap-2 font-semibold text-white text-sm mb-2">
                <Check className="w-4 h-4 text-[#00C2C7]" />
                <span>Global Engineering Standards</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Built on modern cloud security, resilient distributed systems, and international production standards for enterprise teams worldwide.
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* Official Destria Tech Inc Brand Identity Board Modal */}
      {showBrandBoardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative max-w-4xl w-full max-h-[90vh] bg-[#111827] border border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">DESTRIA TECH INC — Official Brand Identity Board</h3>
                <p className="text-xs text-slate-400">Official visual reference asset for emblem usage, color system, and corporate typography</p>
              </div>
              <button
                onClick={() => setShowBrandBoardModal(false)}
                className="px-3 py-1 text-xs font-semibold text-slate-300 hover:text-white border border-slate-700 rounded-md cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="p-4 sm:p-6 overflow-auto flex items-center justify-center bg-[#0B1F3B]">
              <img
                src={COMPANY_CONFIG.brandBoardUrl}
                alt="DESTRIA TECH INC Official Brand Identity Board"
                className="w-full max-h-[70vh] object-contain rounded-lg border border-slate-800"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
