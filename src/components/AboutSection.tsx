import React, { useState } from 'react';
import {
  Building,
  Phone,
  Eye,
  Check,
  Target,
  Compass,
  ShieldCheck,
  Layers,
  Mail,
  Briefcase,
  FileText,
  Download,
  Cpu,
  Globe2,
} from 'lucide-react';
import { GlobalDigitalGlobe } from './animations/GlobalDigitalGlobe';
import {
  COMPANY_CONFIG,
  corporateIdentity,
  CORPORATE_SERVICE_STATEMENT,
  COMMERCIAL_ENGAGEMENT_STATEMENT,
  ENTERPRISE_ENGAGEMENT_WORKFLOW,
  CORPORATE_PROFILE_DATA,
} from '../data/companyConfig';

interface AboutSectionProps {
  onOpenPortal: () => void;
}

export const AboutSection: React.FC<AboutSectionProps> = ({ onOpenPortal }) => {
  const [showBrandBoardModal, setShowBrandBoardModal] = useState(false);
  const [showCorporateProfileModal, setShowCorporateProfileModal] = useState(false);

  return (
    <section id="about" className="py-20 lg:py-28 bg-[#111827] border-t border-slate-800/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#00C2C7] uppercase tracking-wider mb-2 font-mono">
            <span>Corporate Profile &amp; Governance</span>
            <span aria-hidden="true">·</span>
            <span>{corporateIdentity.networkName}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white text-balance leading-tight">
            Engineered for Intelligent Systems and Enterprise Digital Transformation
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300 leading-relaxed text-balance">
            {CORPORATE_SERVICE_STATEMENT}
          </p>
        </div>

        {/* Corporate Architecture & Verified Operations Card */}
        <div className="mt-12 rounded-2xl bg-gradient-to-br from-[#0B1F3B] via-[#111827] to-[#0B1F3B] border border-slate-700/80 p-6 sm:p-8 shadow-xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Corporate Identity Left Block */}
            <div className="lg:col-span-7 space-y-5">
              <div className="flex items-center gap-2 text-xs font-mono text-[#00C2C7] uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-[#00C2C7]" />
                <span>Corporate Identity &amp; Commercial Engagement Standard</span>
              </div>

              <div>
                <span className="text-xs text-[#D4AF37] uppercase tracking-wider font-mono">
                  {corporateIdentity.networkName} · Official Monogram {corporateIdentity.abbreviation}
                </span>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                  {corporateIdentity.legalName}
                </h3>
                <p className="text-sm text-slate-300 mt-3 leading-relaxed">
                  Registered in {corporateIdentity.jurisdiction}, {corporateIdentity.legalName} designs,
                  engineers, and integrates enterprise software, artificial intelligence systems,
                  blockchain architectures, cloud infrastructure, workflow automation, cybersecurity,
                  and digital modernization platforms.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#081529]/90 border border-[#00C2C7]/25 text-xs text-slate-300 leading-relaxed">
                <span className="block font-mono text-[10px] uppercase tracking-wider text-[#00C2C7] mb-1">
                  Commercial Engagement Statement
                </span>
                {COMMERCIAL_ENGAGEMENT_STATEMENT}
              </div>

              <div className="pt-1 flex flex-wrap items-center gap-3 text-xs font-mono">
                <button
                  type="button"
                  onClick={onOpenPortal}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#00C2C7] text-[#111827] font-semibold hover:bg-[#00d6dc] transition-all cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Access {corporateIdentity.networkName} Portal</span>
                </button>
                <a
                  href={corporateIdentity.contact.telephone.href}
                  className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-[#00C2C7] hover:border-[#00C2C7] transition-all"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>{corporateIdentity.contact.telephone.display}</span>
                </a>
                <button
                  type="button"
                  onClick={() => setShowCorporateProfileModal(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-[#0B1F3B] border border-[#D4AF37]/50 text-[#D4AF37] hover:border-[#D4AF37] hover:bg-[#0B1F3B]/80 transition-all cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Corporate Profile (PDF)</span>
                </button>
                <a
                  href={`mailto:${corporateIdentity.contact.email}`}
                  className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:border-[#00C2C7] hover:text-[#00C2C7] transition-all"
                >
                  <Mail className="w-3.5 h-3.5 text-[#00C2C7]" />
                  <span>{corporateIdentity.contact.email}</span>
                </a>
              </div>
            </div>

            {/* Corporate Records & Executive Leadership Right Block */}
            <div className="lg:col-span-5 p-5 rounded-xl bg-[#111827]/95 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono text-[#00C2C7] uppercase">Verified Corporate Registry</span>
                <Building className="w-4 h-4 text-[#D4AF37]" />
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400 font-mono">Legal Entity</span>
                  <span className="font-semibold text-white text-right">{corporateIdentity.legalName}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400 font-mono">Brand Network</span>
                  <span className="font-semibold text-[#00C2C7] font-mono text-right">
                    {corporateIdentity.networkName} ({corporateIdentity.abbreviation})
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400 font-mono">Jurisdiction</span>
                  <span className="font-semibold text-white text-right">{corporateIdentity.jurisdiction}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400 font-mono">{corporateIdentity.leadership.ceo.title}</span>
                  <span className="font-semibold text-white text-right">
                    {corporateIdentity.leadership.ceo.name}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400 font-mono">{corporateIdentity.leadership.cto.title}</span>
                  <span className="font-semibold text-white text-right">
                    {corporateIdentity.leadership.cto.name}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400 font-mono">Telephone</span>
                  <a
                    href={corporateIdentity.contact.telephone.href}
                    className="font-semibold text-[#00C2C7] font-mono hover:underline text-right"
                  >
                    {corporateIdentity.contact.telephone.display}
                  </a>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400 font-mono">Official Email</span>
                  <a
                    href={`mailto:${corporateIdentity.contact.email}`}
                    className="font-semibold text-[#00C2C7] font-mono hover:underline text-right"
                  >
                    {corporateIdentity.contact.email}
                  </a>
                </div>
                <div className="pt-1 space-y-1">
                  <span className="text-slate-400 font-mono block">Corporate Headquarters</span>
                  <p className="text-slate-200 leading-relaxed">{corporateIdentity.headquarters.fullAddress}</p>
                  <p className="text-[11px] text-slate-400">
                    Corporate correspondence &amp; registered address. Executive consultations are conducted
                    remotely or by prior appointment.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 15-Step Enterprise Engagement Workflow */}
        <div className="mt-14">
          <div className="max-w-3xl mb-6">
            <div className="flex items-center gap-2 text-xs font-mono text-[#00C2C7] uppercase tracking-wider mb-1.5">
              <Briefcase className="w-3.5 h-3.5" />
              <span>Enterprise Engagement Lifecycle</span>
            </div>
            <h3 className="text-2xl font-bold text-white">
              Structured 15-Stage Consultation &amp; Delivery Workflow
            </h3>
            <p className="text-sm text-slate-400 mt-1.5">
              Every engagement follows a disciplined enterprise governance path—from initial technical
              discovery and feasibility assessment through formal proposal execution and post-deployment
              optimization.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ENTERPRISE_ENGAGEMENT_WORKFLOW.map((stage) => (
              <div
                key={stage.step}
                className="p-4 rounded-xl bg-[#0B1F3B]/55 border border-slate-800 hover:border-[#00C2C7]/40 transition-colors"
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[#00C2C7]/15 border border-[#00C2C7]/40 text-[11px] font-mono font-bold text-[#00C2C7]">
                    {String(stage.step).padStart(2, '0')}
                  </span>
                  <h4 className="text-sm font-semibold text-white">{stage.title}</h4>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{stage.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Global Digital Network Globe & Corporate Vision / Mission Grid */}
        <div className="mt-14 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-6 rounded-2xl bg-[#0B1F3B]/50 border border-slate-800 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-[#00C2C7] uppercase">Global Network Topology</span>
                <span className="text-[10px] font-mono text-slate-400">DESTRIA Core to World Cloud Hubs</span>
              </div>
              <h3 className="text-lg font-bold text-white">Distributed Enterprise Presence</h3>
              <p className="text-xs text-slate-300 mt-1">
                Synchronized communication links connecting {corporateIdentity.networkName} infrastructure
                to international engineering hubs and multi-region cloud environments.
              </p>
            </div>

            <div className="mt-4 h-72 w-full rounded-xl bg-slate-950/80 border border-slate-800/80 overflow-hidden relative">
              <GlobalDigitalGlobe className="w-full h-full" />
            </div>
          </div>

          <div className="lg:col-span-6 space-y-6">
            <div className="rounded-2xl bg-[#0B1F3B]/50 border border-slate-800 p-6 group hover:border-[#00C2C7]/40 transition-all">
              <div className="w-10 h-10 rounded-lg bg-[#00C2C7]/10 flex items-center justify-center text-[#00C2C7] mb-4">
                <Target className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Corporate Vision</h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
                {CORPORATE_PROFILE_DATA.vision}
              </p>
            </div>

            <div className="rounded-2xl bg-[#0B1F3B]/50 border border-slate-800 p-6 group hover:border-[#D4AF37]/40 transition-all">
              <div className="w-10 h-10 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37] mb-4">
                <Compass className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Corporate Mission</h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
                {CORPORATE_PROFILE_DATA.mission}
              </p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-300">
                {CORPORATE_PROFILE_DATA.missionPillars.map((pillar) => (
                  <div key={pillar} className="flex items-center gap-1.5">
                    <Check className="w-3 h-3 text-[#D4AF37] shrink-0" />
                    <span>{pillar}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Official 17-Page Corporate Profile PDF Publication Banner */}
        <div className="mt-10 rounded-2xl bg-gradient-to-r from-[#0B1F3B] via-[#111827] to-[#0B1F3B] border border-[#D4AF37]/40 p-6 sm:p-8 flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-mono text-[#D4AF37] uppercase">
                Official Corporate Publication · {CORPORATE_PROFILE_DATA.pageCount} Pages
              </span>
              <h4 className="text-base sm:text-lg font-bold text-white mt-0.5">
                {CORPORATE_PROFILE_DATA.documentTitle}
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                Complete executive overview covering corporate identity, leadership, core values, 10 strategic
                objectives, 8-layer modular enterprise architecture, 15-stage engagement framework, IP &amp;
                information security governance, and Responsible AI standards.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowCorporateProfileModal(true)}
              className="px-4 py-2 text-xs font-semibold text-[#111827] bg-[#00C2C7] hover:bg-[#00d6dc] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>View Profile</span>
            </button>
            <a
              href={CORPORATE_PROFILE_DATA.pdfUrl}
              download={CORPORATE_PROFILE_DATA.downloadFilename}
              className="px-4 py-2 text-xs font-semibold text-slate-200 hover:text-white border border-[#D4AF37]/60 hover:border-[#D4AF37] rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Download PDF</span>
            </a>
          </div>
        </div>

        {/* Official 8-Layer Modular Enterprise Technology Architecture */}
        <div className="mt-14">
          <div className="max-w-3xl mb-6">
            <div className="flex items-center gap-2 text-xs font-mono text-[#00C2C7] uppercase tracking-wider mb-1.5">
              <Cpu className="w-3.5 h-3.5" />
              <span>Modular Systems Blueprint</span>
            </div>
            <h3 className="text-2xl font-bold text-white">
              8-Layer Enterprise Technology Architecture
            </h3>
            <p className="text-sm text-slate-400 mt-1.5">
              {CORPORATE_PROFILE_DATA.architectureNotice}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CORPORATE_PROFILE_DATA.architectureLayers.map((item) => (
              <div
                key={item.layer}
                className="p-4 rounded-xl bg-[#0B1F3B]/55 border border-slate-800 hover:border-[#00C2C7]/40 transition-colors"
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[#00C2C7]/15 border border-[#00C2C7]/40 text-[11px] font-mono font-bold text-[#00C2C7]">
                    {item.layer}
                  </span>
                  <h4 className="text-sm font-semibold text-white">{item.title}</h4>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Corporate Core Values (Sections 6.1 - 6.7) */}
        <div className="mt-14">
          <div className="max-w-3xl mb-6">
            <div className="flex items-center gap-2 text-xs font-mono text-[#D4AF37] uppercase tracking-wider mb-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Corporate Core Values</span>
            </div>
            <h3 className="text-2xl font-bold text-white">
              Seven Pillars Governing Every Enterprise Engagement
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CORPORATE_PROFILE_DATA.coreValues.map((value) => (
              <div
                key={value.code}
                className="p-4 rounded-xl bg-[#0B1F3B]/50 border border-slate-800 hover:border-[#D4AF37]/40 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] font-mono font-bold text-[#D4AF37]">{value.code}</span>
                  <h4 className="text-sm font-semibold text-white">{value.title}</h4>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{value.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Target Markets and Industry Applications */}
        <div className="mt-14">
          <div className="max-w-3xl mb-6">
            <div className="flex items-center gap-2 text-xs font-mono text-[#00C2C7] uppercase tracking-wider mb-1.5">
              <Globe2 className="w-3.5 h-3.5" />
              <span>Target Markets &amp; Industry Applications</span>
            </div>
            <h3 className="text-2xl font-bold text-white">
              Domestic &amp; International Sector Capabilities
            </h3>
            <p className="text-xs text-slate-400 mt-1.5">
              {CORPORATE_PROFILE_DATA.targetMarketsNotice}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {CORPORATE_PROFILE_DATA.targetMarkets.map((market) => (
              <div
                key={market.industry}
                className="p-4 rounded-xl bg-[#0B1F3B]/45 border border-slate-800/90 hover:border-[#00C2C7]/35 transition-colors"
              >
                <h4 className="text-sm font-semibold text-white">{market.industry}</h4>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{market.applications}</p>
              </div>
            ))}
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
              <span className="text-xs font-mono text-[#D4AF37] uppercase">
                Official Brand Identity Board &amp; Color System
              </span>
              <h4 className="text-base font-bold text-white mt-0.5">
                Graphite #111827 · Technology Cyan #00C2C7 · Silver Gray #F3F4F6 · Gold #D4AF37 · Deep Navy #0B1F3B
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                Approved visual identity standard governing all {corporateIdentity.legalName} digital
                products, portals, documentation, and corporate communications.
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
              Operational standards enforced across all customized enterprise engineering engagements.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="p-5 rounded-xl bg-[#0B1F3B]/50 border border-slate-800">
              <div className="flex items-center gap-2 font-semibold text-white text-sm mb-2">
                <Check className="w-4 h-4 text-[#00C2C7]" />
                <span>Consultation-First Scoping</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every commercial proposal follows formal requirement discovery and engineering feasibility
                assessment—never generic public rate cards.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[#0B1F3B]/50 border border-slate-800">
              <div className="flex items-center gap-2 font-semibold text-white text-sm mb-2">
                <Check className="w-4 h-4 text-[#00C2C7]" />
                <span>Strict Tenant Isolation</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Client project deliverables, proprietary codebases, and authorized records are strictly
                segregated with server-enforced access control.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[#0B1F3B]/50 border border-slate-800">
              <div className="flex items-center gap-2 font-semibold text-white text-sm mb-2">
                <Check className="w-4 h-4 text-[#00C2C7]" />
                <span>Human-in-the-Loop Governance</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                AI systems assist discovery and workflows; senior engineers and corporate leadership review,
                validate, and authorize all formal commitments.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[#0B1F3B]/50 border border-slate-800">
              <div className="flex items-center gap-2 font-semibold text-white text-sm mb-2">
                <Check className="w-4 h-4 text-[#00C2C7]" />
                <span>Responsible Engineering</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Architected on modern cloud security, documented deliverables, and legally responsible
                representations without unverified claims.
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
                <p className="text-xs text-slate-400">
                  Official visual reference asset for emblem usage, color system, and corporate typography
                </p>
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

      {/* Official Destria Tech Inc Corporate Profile PDF Viewer Modal */}
      {showCorporateProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative max-w-5xl w-full h-[90vh] bg-[#111827] border border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">{CORPORATE_PROFILE_DATA.documentTitle}</h3>
                <p className="text-xs text-slate-400">
                  {CORPORATE_PROFILE_DATA.pageCount}-page official corporate publication · {corporateIdentity.jurisdiction}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={CORPORATE_PROFILE_DATA.pdfUrl}
                  download={CORPORATE_PROFILE_DATA.downloadFilename}
                  className="px-3 py-1.5 text-xs font-semibold text-[#111827] bg-[#00C2C7] hover:bg-[#00d6dc] rounded-md flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </a>
                <button
                  type="button"
                  onClick={() => setShowCorporateProfileModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white border border-slate-700 rounded-md cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 bg-[#0B1F3B] overflow-hidden">
              <iframe
                src={CORPORATE_PROFILE_DATA.pdfUrl}
                title={CORPORATE_PROFILE_DATA.documentTitle}
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
