import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  CATALOG_CATEGORIES,
  SERVICE_CATALOG,
  COMMERCIAL_ENGAGEMENT_NOTICE,
  COMMERCIAL_SERVICE_NOTICE,
  EXTERNAL_CHARGES_DISCLOSURE,
  BLOCKCHAIN_COMPLIANCE_NOTICE,
  EMERGING_TECH_FEASIBILITY_NOTICE,
} from '../data/serviceCatalog';
import { corporateIdentity } from '../data/companyConfig';
import { CatalogCategoryId, CatalogService } from '../types';
import { ServiceTechIcon } from './animations/ServiceTechIcon';
import { BlockchainNetworkCanvas } from './animations/BlockchainNetworkCanvas';
import { ServiceCard } from './services/ServiceCard';
import { ServiceDetailModal } from './services/ServiceDetailModal';
import { SolutionBuilderModal } from './services/SolutionBuilderModal';
import {
  Search,
  X,
  ArrowUpRight,
  Bot,
  Layers,
  Shield,
  Check,
  Sparkles,
  Phone,
} from 'lucide-react';

interface ServicesSectionProps {
  onSelectServiceForInquiry: (serviceId: string) => void;
  onOpenAIConsultant: (initialPrompt?: string) => void;
}

const SELECTION_STORAGE_KEY = 'dti_solution_selection_v2';

export const ServicesSection: React.FC<ServicesSectionProps> = ({
  onSelectServiceForInquiry,
  onOpenAIConsultant,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const catalogRef = useRef<HTMLDivElement>(null);

  const [activeCategory, setActiveCategory] = useState<CatalogCategoryId>('website-digital');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    try {
      localStorage.removeItem('opm_pending_selection_v1');
      const saved = localStorage.getItem(SELECTION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed?.selectedIds)) return parsed.selectedIds;
      }
    } catch {
      // ignore storage errors
    }
    return [];
  });
  const [selectedOptionsMap, setSelectedOptionsMap] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem(SELECTION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.selectedOptionsMap && typeof parsed.selectedOptionsMap === 'object') {
          return parsed.selectedOptionsMap;
        }
      }
    } catch {
      // ignore storage errors
    }
    return {};
  });
  const [detailService, setDetailService] = useState<CatalogService | null>(null);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);

  React.useEffect(() => {
    try {
      localStorage.setItem(
        SELECTION_STORAGE_KEY,
        JSON.stringify({ selectedIds, selectedOptionsMap })
      );
    } catch {
      // ignore storage errors
    }
  }, [selectedIds, selectedOptionsMap]);

  const activeCategoryMeta = useMemo(
    () => CATALOG_CATEGORIES.find((c) => c.id === activeCategory) || CATALOG_CATEGORIES[0],
    [activeCategory]
  );

  const filteredServices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return SERVICE_CATALOG.filter((svc) => {
      const matchesCategory = q
        ? activeCategory === 'all'
          ? true
          : svc.categoryId === activeCategory
        : activeCategory === 'all' || svc.categoryId === activeCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        svc.title.toLowerCase().includes(q) ||
        svc.shortDescription.toLowerCase().includes(q) ||
        svc.capabilities.some((cap) => cap.toLowerCase().includes(q))
      );
    });
  }, [activeCategory, searchQuery]);

  const selectedServices = useMemo(
    () => SERVICE_CATALOG.filter((s) => selectedIds.includes(s.id)),
    [selectedIds]
  );

  const toggleSelectService = (service: CatalogService) => {
    setSelectedIds((prev) =>
      prev.includes(service.id) ? prev.filter((id) => id !== service.id) : [...prev, service.id]
    );
  };

  const toggleServiceOption = (serviceId: string, optionId: string) => {
    setSelectedOptionsMap((prev) => {
      const existing = prev[serviceId] || [];
      const next = existing.includes(optionId)
        ? existing.filter((id) => id !== optionId)
        : [...existing, optionId];
      return { ...prev, [serviceId]: next };
    });
    setSelectedIds((prev) => (prev.includes(serviceId) ? prev : [...prev, serviceId]));
  };

  const handleRequestProposal = (service: CatalogService) => {
    if (!selectedIds.includes(service.id)) {
      setSelectedIds((prev) => [...prev, service.id]);
    }
    onSelectServiceForInquiry(service.legacyServiceId || 'enterprise-software-development');
    setIsBuilderOpen(true);
  };

  const handleConsultAIForService = (service: CatalogService) => {
    onOpenAIConsultant(
      `I would like to explore "${service.title}" as a customized enterprise solution and understand how it aligns with our operational and technical requirements.`
    );
  };

  const handleConsultAIWithSelection = (services: CatalogService[]) => {
    const names = services.map((s) => s.title).join(', ');
    onOpenAIConsultant(
      `I selected the following customized solution frameworks for assessment: ${names}. Can you help me outline the technical discovery scope and next steps for a consultation?`
    );
  };

  const scrollToCatalog = (category?: CatalogCategoryId) => {
    if (category) setActiveCategory(category);
    catalogRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  };

  const oneTimeModernization = filteredServices.filter(
    (s) => s.categoryId === 'modernization-care' && s.subcategory === 'one-time'
  );
  const careMemberships = filteredServices.filter(
    (s) => s.categoryId === 'modernization-care' && s.subcategory === 'care-membership'
  );
  const otherServices = filteredServices.filter((s) => s.categoryId !== 'modernization-care');

  return (
    <section
      id="services"
      aria-labelledby="services-marketplace-heading"
      className="py-20 lg:py-28 bg-[#0B1220] border-t border-slate-800/80 relative"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* BLOCK 1: UNIFIED SOLUTIONS HEADER & PRIMARY ACTIONS */}
        <div className="max-w-4xl">
          <div className="text-xs font-mono font-semibold text-[#00C2C7] uppercase tracking-wider mb-3">
            CUSTOMIZED ENTERPRISE SOLUTION FRAMEWORKS
          </div>

          <h2
            id="services-marketplace-heading"
            className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-[1.12] text-balance"
          >
            Engineering Intelligent Solutions Across Every Enterprise Division.
          </h2>

          <p className="mt-4 text-base sm:text-lg text-slate-200 leading-relaxed text-balance">
            {COMMERCIAL_SERVICE_NOTICE}
          </p>

          <p className="mt-3 text-sm text-slate-400 leading-relaxed max-w-3xl">
            Explore our customized solution frameworks across Artificial Intelligence, Blockchain
            Infrastructure, Enterprise Software, Cloud &amp; Cybersecurity, Workflow Automation, and
            Digital Transformation.
          </p>

          {/* Primary Actions */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => scrollToCatalog('all')}
              className="inline-flex items-center gap-2 px-5 py-3 text-xs sm:text-sm font-semibold text-[#0B1220] bg-[#00C2C7] hover:bg-[#00d6dc] rounded-lg transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7]"
            >
              <span>Explore Our Technology Solutions</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsBuilderOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-3 text-xs sm:text-sm font-semibold text-white bg-[#111827] hover:bg-slate-800 border border-slate-700 hover:border-[#D4AF37]/60 rounded-lg transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7]"
            >
              <Layers className="w-4 h-4 text-[#D4AF37]" />
              <span>Request a Formal Proposal</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenAIConsultant()}
              className="inline-flex items-center gap-2 px-5 py-3 text-xs sm:text-sm font-semibold text-[#00C2C7] hover:text-white bg-transparent hover:bg-[#00C2C7]/10 border border-[#00C2C7]/45 rounded-lg transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7]"
            >
              <Bot className="w-4 h-4" />
              <span>Consult AI Corporate Solutions Advisor</span>
            </button>
          </div>
        </div>

        {/* INTERACTIVE DISCOVERY BAR: SEARCH & SOLUTION ENGAGEMENT BUILDER */}
        <div ref={catalogRef} className="mt-14 space-y-5 scroll-mt-28">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-2xl bg-[#111827] border border-slate-800">
            {/* Search Input */}
            <div className="relative flex-1 max-w-xl">
              <label htmlFor="service-catalog-search" className="sr-only">
                Search Destria Tech Inc technology solutions and capabilities
              </label>
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="service-catalog-search"
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchQuery(val);
                  if (val.trim() && activeCategory !== 'all') {
                    setActiveCategory('all');
                  }
                }}
                placeholder="Search enterprise solutions, AI agents, blockchain, cloud security, or capabilities..."
                className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-[#0B1220] border border-slate-700 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#00C2C7]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Engagement Model Indicator & Solution Scope Builder Trigger */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="px-3.5 py-2 rounded-xl bg-[#0B1220] border border-slate-800 text-[11px] font-mono text-slate-300">
                <span className="text-[#00C2C7] font-semibold">Customized Enterprise Solutions</span>
                <span className="mx-1.5 text-slate-600">·</span>
                <span>Subject to Formal Assessment</span>
              </div>

              <button
                type="button"
                onClick={() => setIsBuilderOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-[#D4AF37]/45 text-xs font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Layers className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Submit Project Requirements ({selectedIds.length})</span>
              </button>
            </div>
          </div>

          {/* 10-Category Navigation Bar + All Solutions */}
          <nav
            aria-label="Solution divisions"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2"
          >
            {CATALOG_CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  aria-pressed={isActive}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] ${
                    isActive
                      ? 'bg-[#131d31] border-[#00C2C7] text-white'
                      : 'bg-[#111827] border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  <ServiceTechIcon
                    kind={cat.iconKind}
                    size="sm"
                    ambient={isActive}
                    accent={cat.id === 'signature-packages' ? 'gold' : 'cyan'}
                  />
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-slate-400">
                      {cat.id === 'all' ? 'DIRECTORY' : cat.number}
                    </div>
                    <div className="text-xs font-semibold truncate">{cat.shortLabel}</div>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* ACTIVE CATEGORY SHOWCASE BANNER & DIVISION SPECIALS */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCategory}
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="mt-10 space-y-8"
          >
            {/* Active Category Banner */}
            <div
              className={`rounded-2xl p-6 sm:p-8 border ${
                activeCategory === 'signature-packages'
                  ? 'bg-gradient-to-r from-[#151e30] via-[#111827] to-[#151e30] border-[#D4AF37]/45'
                  : 'bg-[#111827] border-slate-800'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-start gap-4 max-w-3xl">
                  <ServiceTechIcon
                    kind={activeCategoryMeta.iconKind}
                    size="lg"
                    ambient={true}
                    accent={activeCategory === 'signature-packages' ? 'gold' : 'cyan'}
                  />
                  <div>
                    <div className="text-xs font-mono text-[#00C2C7] uppercase tracking-wider">
                      {activeCategoryMeta.label}
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white mt-1 text-balance">
                      {activeCategoryMeta.headline}
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
                      {activeCategoryMeta.description}
                    </p>
                  </div>
                </div>

                {activeCategory === 'ai-agents' && (
                  <div className="shrink-0 flex flex-col items-start lg:items-end gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenAIConsultant(
                          'Can you walk me through DESTRIA TECH INC AI agents and help recommend the right architecture for our organization?'
                        )
                      }
                      className="px-4 py-2.5 rounded-lg bg-[#00C2C7] hover:bg-[#00d6dc] text-[#111827] text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Bot className="w-4 h-4" />
                      <span>Start AI Consultation</span>
                    </button>
                    <span className="text-[11px] font-mono text-slate-400">
                      DESTRIA TECH INC AI Corporate Solutions Consultant
                    </span>
                  </div>
                )}
              </div>

              {/* Blockchain & Web3 Featured Network Visual, Capabilities & Compliance */}
              {activeCategory === 'blockchain-web3' && (
                <div className="mt-6 pt-6 border-t border-slate-800 space-y-5">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                    <div className="lg:col-span-6 rounded-xl bg-[#070c16] border border-slate-800 overflow-hidden">
                      <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span className="text-[#00C2C7]">Distributed Ledger Network Visualization</span>
                        <span>Interactive Topology</span>
                      </div>
                      <BlockchainNetworkCanvas className="w-full h-48" nodeCount={34} interactive={true} />
                    </div>

                    <div className="lg:col-span-6 space-y-3">
                      <div className="text-xs font-mono uppercase text-slate-400">
                        Advanced Blockchain Capabilities
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-200">
                        {[
                          'Smart contracts',
                          'Distributed ledger systems',
                          'Blockchain API integration',
                          'Web3 application development',
                          'Tokenization architecture',
                          'Blockchain-based document verification',
                          'Digital identity & credential verification',
                          'Supply-chain traceability',
                          'Permissioned enterprise blockchain networks',
                          'Tamper-evident audit trails',
                        ].map((item) => (
                          <div key={item} className="flex items-start gap-2">
                            <Check className="w-3.5 h-3.5 text-[#00C2C7] shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0B1220] border border-[#D4AF37]/40 flex items-start gap-3 text-xs text-slate-300">
                    <Shield className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      <strong className="text-[#D4AF37]">Regulatory &amp; Security Disclosure: </strong>
                      {BLOCKCHAIN_COMPLIANCE_NOTICE}
                    </p>
                  </div>
                </div>
              )}

              {/* Emerging Technology Feasibility Disclosure */}
              {(activeCategory === 'enterprise-mobile' || activeCategory === 'automation-systems') && (
                <div className="mt-5 pt-4 border-t border-slate-800 text-xs text-slate-400 flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-[#00C2C7] shrink-0 mt-0.5" />
                  <p>{EMERGING_TECH_FEASIBILITY_NOTICE}</p>
                </div>
              )}
            </div>

            {/* SERVICE CARDS GRID */}
            {filteredServices.length === 0 ? (
              <div className="p-12 rounded-2xl bg-[#111827] border border-slate-800 text-center space-y-3">
                <p className="text-sm font-semibold text-white">
                  No solutions matched "{searchQuery}".
                </p>
                <p className="text-xs text-slate-400">
                  Try clearing your search or consult our AI Corporate Solutions Advisor for a
                  custom-scoped architecture recommendation.
                </p>
                <div className="pt-2 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setActiveCategory('all');
                    }}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white cursor-pointer"
                  >
                    Reset Filters
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenAIConsultant(`I am looking for a customized solution related to: ${searchQuery}`)
                    }
                    className="px-4 py-2 rounded-lg bg-[#00C2C7] hover:bg-[#00d6dc] text-xs font-semibold text-[#0B1220] cursor-pointer"
                  >
                    Ask AI Consultant
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-12">
                {otherServices.length > 0 && (
                  <div
                    className={`grid gap-6 ${
                      activeCategory === 'signature-packages'
                        ? 'grid-cols-1 md:grid-cols-2'
                        : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                    }`}
                  >
                    {otherServices.map((service) => (
                      <ServiceCard
                        key={service.id}
                        service={service}
                        isSelected={selectedIds.includes(service.id)}
                        onToggleSelect={toggleSelectService}
                        onExplore={setDetailService}
                        onRequestProposal={handleRequestProposal}
                        onConsultAI={handleConsultAIForService}
                      />
                    ))}
                  </div>
                )}

                {oneTimeModernization.length > 0 && (
                  <div className="space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-3 border-b border-slate-800">
                      <div>
                        <div className="text-xs font-mono text-[#00C2C7] uppercase">
                          Targeted Modernization &amp; Remediation Frameworks
                        </div>
                        <h4 className="text-lg font-bold text-white mt-0.5">
                          Upgrades, Restorations &amp; Security Remediation ({oneTimeModernization.length})
                        </h4>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">
                        Subject to Formal Assessment
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {oneTimeModernization.map((service) => (
                        <ServiceCard
                          key={service.id}
                          service={service}
                          isSelected={selectedIds.includes(service.id)}
                          onToggleSelect={toggleSelectService}
                          onExplore={setDetailService}
                          onRequestProposal={handleRequestProposal}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {careMemberships.length > 0 && (
                  <div className="space-y-5 pt-4">
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-3 border-b border-slate-800">
                      <div>
                        <div className="text-xs font-mono text-[#D4AF37] uppercase">
                          Managed Enterprise Stewardship Frameworks
                        </div>
                        <h4 className="text-lg font-bold text-white mt-0.5">
                          Ongoing Maintenance, Monitoring &amp; Technical Stewardship
                        </h4>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">
                        Structured via Formal Proposal
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {careMemberships.map((service) => (
                        <ServiceCard
                          key={service.id}
                          service={service}
                          isSelected={selectedIds.includes(service.id)}
                          onToggleSelect={toggleSelectService}
                          onExplore={setDetailService}
                          onRequestProposal={handleRequestProposal}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* COMMERCIAL ENGAGEMENT POLICY DISCLOSURE */}
        <div className="mt-14 p-6 rounded-2xl bg-[#111827] border border-slate-800 space-y-2.5 text-xs text-slate-300 leading-relaxed">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#00C2C7] font-semibold">
            Commercial Engagement Policy &amp; Assessment Notice
          </div>
          <p>{COMMERCIAL_ENGAGEMENT_NOTICE}</p>
          <p className="text-slate-400">{EXTERNAL_CHARGES_DISCLOSURE}</p>
        </div>

        {/* CLOSING ENTERPRISE CALL TO ACTION */}
        <div className="mt-12 rounded-2xl bg-gradient-to-br from-[#151e30] via-[#111827] to-[#0B1220] border border-slate-700/80 p-8 sm:p-10 text-center space-y-5">
          <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight text-balance">
            Architect Your Customized Enterprise Solution.
          </h3>
          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Initiate a technical consultation with {corporateIdentity.legalName} to evaluate your
            operational requirements, integration landscape, and formal proposal roadmap.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setIsBuilderOpen(true)}
              className="px-5 py-2.5 rounded-lg bg-[#00C2C7] hover:bg-[#00d6dc] text-[#0B1220] text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              Request a Formal Proposal
            </button>
            <a
              href={corporateIdentity.contact.telephone.href}
              className="px-5 py-2.5 rounded-lg bg-[#D4AF37] hover:bg-[#e3be48] text-[#0B1220] text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap font-mono"
            >
              <Phone className="w-4 h-4" />
              <span>{corporateIdentity.contact.telephone.display}</span>
            </a>
            <button
              type="button"
              onClick={() => onOpenAIConsultant()}
              className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-[#00C2C7]/45 text-[#00C2C7] hover:text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              Speak With Our AI Solutions Consultant
            </button>
          </div>

          <div className="pt-4 border-t border-slate-800/80 text-xs text-slate-400">
            <span className="font-bold text-white tracking-wide">{corporateIdentity.legalName}</span>
            <span className="mx-2 text-slate-600" aria-hidden="true">·</span>
            <span className="text-[#D4AF37]">
              Engineering Intelligent Solutions. Empowering Enterprise Transformation.
            </span>
          </div>
        </div>
      </div>

      {/* STICKY MULTI-SERVICE SOLUTION BUILDER BAR — Coordinated above/left of floating AI Consultant */}
      {selectedServices.length > 0 && (
        <div className="fixed bottom-[84px] left-3 right-3 sm:bottom-6 sm:left-6 sm:right-auto sm:w-[calc(100vw-290px)] sm:max-w-lg z-[35] bg-[#111827]/95 backdrop-blur-md border border-[#00C2C7]/60 rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 shadow-2xl flex items-center justify-between gap-2.5 sm:gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">
              {selectedServices.length} {selectedServices.length === 1 ? 'Solution' : 'Solutions'} Selected for Assessment
            </div>
            <div className="text-[11px] font-mono text-[#00C2C7] truncate">
              Customized Enterprise Solution · Subject to Formal Assessment
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="px-2 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setIsBuilderOpen(true)}
              className="px-3 sm:px-4 py-2 rounded-lg bg-[#00C2C7] hover:bg-[#00d6dc] text-[#0B1220] text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              Submit Requirements
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <ServiceDetailModal
        service={detailService}
        isSelected={detailService ? selectedIds.includes(detailService.id) : false}
        selectedOptionIds={detailService ? selectedOptionsMap[detailService.id] || [] : []}
        onClose={() => setDetailService(null)}
        onToggleSelect={toggleSelectService}
        onToggleOption={toggleServiceOption}
        onRequestProposal={handleRequestProposal}
        onConsultAI={handleConsultAIForService}
      />

      <SolutionBuilderModal
        isOpen={isBuilderOpen}
        selectedServices={selectedServices}
        selectedOptionsMap={selectedOptionsMap}
        onClose={() => setIsBuilderOpen(false)}
        onRemoveService={(id) => {
          setSelectedIds((prev) => prev.filter((item) => item !== id));
          setSelectedOptionsMap((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }}
        onClearAll={() => {
          setSelectedIds([]);
          setSelectedOptionsMap({});
        }}
        onConsultAIWithSelection={handleConsultAIWithSelection}
      />
    </section>
  );
};
