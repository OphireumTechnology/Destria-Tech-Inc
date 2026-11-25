import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  Building,
  Check,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Mail,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { corporateIdentity, executiveLeadership } from '../data/companyConfig';
import {
  CORPORATE_PROFILE_RESOURCE,
  CORPORATE_RESOURCES_SECTION_COPY,
  SERVICES_BROCHURE_PAGE_SUMMARIES,
  SERVICES_BROCHURE_RESOURCE,
  formatResourceFileSize,
  getPublishedCorporateResources,
} from '../data/corporateResources';
import { ROUTES, buildGovernanceRoute, sectionIdToPublicRoute } from '../config/routes';
import { Header } from './Header';
import { Footer } from './Footer';
import { BrandLogo } from './BrandLogo';
import { CorporateResourcesSection } from './CorporateResourcesSection';
import { EnterpriseModal } from './EnterpriseModal';
import { AIConsultantWidget } from './consultant/AIConsultantWidget';

/**
 * Dedicated Corporate Resources & Download Center Page (`/resources`)
 *
 * Public, authentication-free access to official DESTRIA TECH INC PDF publications,
 * including the 8-page Corporate Summary and Enterprise Technology Services brochure
 * and the 17-page Official Corporate Profile, paired with structured Schema.org JSON-LD
 * and full accessible HTML text summaries of every page of the image-based brochure.
 */
export const ResourcesPage: React.FC = () => {
  const navigate = useNavigate();
  const [isEnterpriseModalOpen, setIsEnterpriseModalOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const handleNavigatePublic = (sectionId: string) => {
    if (sectionId === 'resources') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    navigate(sectionIdToPublicRoute(sectionId));
  };

  const handleOpenLegal = (sectionId?: string) => {
    navigate(buildGovernanceRoute(sectionId));
  };

  const publishedResources = getPublishedCorporateResources();

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: CORPORATE_RESOURCES_SECTION_COPY.seoTitle,
    description: CORPORATE_RESOURCES_SECTION_COPY.seoDescription,
    url: CORPORATE_RESOURCES_SECTION_COPY.canonicalPageUrl,
    publisher: {
      '@type': 'Organization',
      name: corporateIdentity.legalName,
      alternateName: corporateIdentity.networkName,
      url: corporateIdentity.contact.website,
      email: corporateIdentity.contact.email,
      telephone: corporateIdentity.contact.telephone.e164,
      founder: {
        '@type': 'Person',
        name: executiveLeadership.founderAndCEO.fullName,
        jobTitle: executiveLeadership.founderAndCEO.title,
      },
    },
    hasPart: publishedResources.map((resource) => ({
      '@type': 'DigitalDocument',
      name: resource.title,
      description: resource.description,
      url: resource.canonicalFileUrl,
      encodingFormat: 'application/pdf',
      numberOfPages: resource.pageCount,
      isAccessibleForFree: true,
    })),
  };

  return (
    <div className="min-h-screen bg-[#111827] text-[#F3F4F6] flex flex-col overflow-x-clip selection:bg-[#00C2C7]/20 selection:text-[#00C2C7]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <Header
        onOpenPortal={() => setIsEnterpriseModalOpen(true)}
        onNavigate={handleNavigatePublic}
        activeSection="resources"
      />

      <main className="flex-1">
        {/* Executive Dark Technology Hero Band */}
        <section className="relative pt-10 pb-14 lg:pt-14 lg:pb-16 bg-gradient-to-b from-[#0B1F3B] via-[#0F2442] to-[#111827] border-b border-slate-800/80">
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-6">
              <Link
                to={ROUTES.HOME}
                className="inline-flex items-center gap-2 text-xs font-mono text-[#F3F4F6]/80 hover:text-[#00C2C7] transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Back to {corporateIdentity.legalName}</span>
              </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-8 space-y-5">
                <div className="flex items-center gap-4">
                  <BrandLogo variant="emblem" size="lg" ring="brand" eager decorative />
                  <div>
                    <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#D4AF37] font-semibold">
                      {corporateIdentity.networkName} · Official Download Center
                    </div>
                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mt-1 leading-tight">
                      Corporate Resources &amp;{' '}
                      <span className="text-[#00C2C7]">Services Brochure</span>
                    </h1>
                  </div>
                </div>

                <p className="text-sm sm:text-base text-[#F3F4F6]/85 leading-relaxed max-w-3xl">
                  {CORPORATE_RESOURCES_SECTION_COPY.description} Every document is provided in its
                  official executive PDF format for prospective clients, corporate partners,
                  investors, and institutional stakeholders.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <a
                    href={SERVICES_BROCHURE_RESOURCE.fileUrl}
                    download={SERVICES_BROCHURE_RESOURCE.downloadFilename}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#00C2C7] hover:bg-[#19d2d7] text-[#111827] text-xs sm:text-sm font-bold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Download Services Brochure (8-Page PDF)</span>
                  </a>

                  <a
                    href={SERVICES_BROCHURE_RESOURCE.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#0B1F3B] hover:bg-[#111827] border border-slate-600/80 hover:border-[#00C2C7] text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7]"
                  >
                    <ExternalLink className="w-4 h-4 text-[#00C2C7] shrink-0" aria-hidden="true" />
                    <span>View Services Brochure</span>
                  </a>

                  <Link
                    to={ROUTES.CORPORATE_PROFILE}
                    className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-[#D4AF37] hover:text-white border border-[#D4AF37]/45 hover:border-[#D4AF37] text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
                  >
                    <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Interactive Corporate Profile</span>
                  </Link>
                </div>

                <p className="text-xs font-mono tabular-nums text-[#F3F4F6]/70">
                  Services Brochure: {SERVICES_BROCHURE_RESOURCE.format} ·{' '}
                  {SERVICES_BROCHURE_RESOURCE.pageCount} Pages ·{' '}
                  {formatResourceFileSize(SERVICES_BROCHURE_RESOURCE.fileSizeBytes)} · Corporate
                  Profile: {CORPORATE_PROFILE_RESOURCE.pageCount} Pages ·{' '}
                  {formatResourceFileSize(CORPORATE_PROFILE_RESOURCE.fileSizeBytes)}
                </p>
              </div>

              <div className="lg:col-span-4 rounded-xl bg-[#0B1F3B]/90 border border-slate-700/80 p-5 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-slate-700/80 pb-2.5">
                  <span className="font-mono text-[#D4AF37] uppercase tracking-wider">
                    Verified Public Access
                  </span>
                  <ShieldCheck className="w-4 h-4 text-[#10B981]" aria-hidden="true" />
                </div>
                <ul className="space-y-2 text-[#F3F4F6]/85 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-[#00C2C7] shrink-0 mt-0.5" aria-hidden="true" />
                    <span>Official executive corporate PDFs served directly over HTTPS</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-[#00C2C7] shrink-0 mt-0.5" aria-hidden="true" />
                    <span>Publicly accessible on desktop, tablet, and mobile without sign-in</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-[#00C2C7] shrink-0 mt-0.5" aria-hidden="true" />
                    <span>Accessible HTML summary of all 9 service divisions provided below</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Primary Modernized Dark Corporate Resources Showcase & Download Grid */}
        <CorporateResourcesSection isDedicatedPage />

        {/* Accessible HTML Summary of the 8-Page Enterprise Technology Services Brochure */}
        <section
          aria-labelledby="brochure-accessible-summary-heading"
          className="py-16 lg:py-20 bg-[#0B1F3B] text-[#F3F4F6] border-t border-slate-800/90"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-10 pb-6 border-b border-slate-700/70">
              <div className="max-w-3xl space-y-2">
                <span className="text-xs font-mono font-semibold uppercase tracking-[0.16em] text-[#D4AF37]">
                  Accessible Document Summary · 8-Page Executive Brochure
                </span>
                <h2
                  id="brochure-accessible-summary-heading"
                  className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight"
                >
                  Inside Corporate Summary and Enterprise Technology Services
                </h2>
                <p className="text-sm text-[#F3F4F6]/80 leading-relaxed">
                  Complete structured HTML reference covering every division and corporate section
                  inside the 8-page PDF brochure for screen readers, search indexing, and rapid
                  executive review.
                </p>
              </div>

              <a
                href={SERVICES_BROCHURE_RESOURCE.fileUrl}
                download={SERVICES_BROCHURE_RESOURCE.downloadFilename}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#00C2C7] hover:bg-[#19d2d7] text-[#111827] text-xs font-bold transition-colors shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <Download className="w-3.5 h-3.5 text-[#111827]" aria-hidden="true" />
                <span>Download Full 8-Page PDF</span>
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {SERVICES_BROCHURE_PAGE_SUMMARIES.map((section) => (
                <article
                  key={`${section.pageNumber}-${section.divisionCode || section.title}`}
                  className="rounded-xl bg-[#111827]/85 border border-slate-700/75 hover:border-[#00C2C7]/55 transition-colors p-5 flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[#F3F4F6]/70">
                      <span className="font-semibold text-[#D4AF37] uppercase">
                        {section.divisionCode ? `Division ${section.divisionCode}` : 'Executive Section'}
                      </span>
                      <span className="tabular-nums text-[#00C2C7]">Page {section.pageNumber}</span>
                    </div>
                    <h3 className="text-base font-bold text-white leading-snug">
                      {section.title}
                    </h3>
                    <p className="text-xs text-[#F3F4F6]/80 leading-relaxed">{section.summary}</p>
                  </div>

                  <ul className="pt-3 border-t border-slate-800 space-y-1.5">
                    {section.capabilities.map((cap) => (
                      <li
                        key={cap}
                        className="flex items-start gap-2 text-xs text-[#F3F4F6]/90 leading-relaxed"
                      >
                        <Check className="w-3.5 h-3.5 text-[#00C2C7] shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{cap}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Corporate Consultation Footer Call to Action & Official Corporate Communications */}
        <section
          aria-labelledby="resources-consultation-heading"
          className="py-16 bg-[#111827] border-t border-slate-800 text-[#F3F4F6]"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl bg-[#0B1F3B]/90 border border-slate-700/80 p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative overflow-hidden">
              <div
                aria-hidden="true"
                className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-[#D4AF37]/80 via-[#00C2C7]/80 to-transparent"
              />

              <div className="lg:col-span-7 space-y-4">
                <span className="text-xs font-mono uppercase tracking-[0.16em] text-[#D4AF37]">
                  Customized Enterprise Engagements
                </span>
                <h2
                  id="resources-consultation-heading"
                  className="text-2xl sm:text-3xl font-extrabold text-white leading-tight"
                >
                  Transform Your Enterprise with Intelligent Technology
                </h2>
                <p className="text-sm text-[#F3F4F6]/80 leading-relaxed">
                  Discover customized enterprise technology solutions designed around your
                  organization&apos;s operational, technical and strategic requirements. Every
                  engagement is individually architected following a formal executive or technical
                  consultation.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Link
                    to={ROUTES.CONSULTATION}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#00C2C7] hover:bg-[#19d2d7] text-[#111827] text-sm font-bold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <span>Request an Enterprise Consultation</span>
                    <ArrowUpRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                  </Link>
                  <Link
                    to={ROUTES.SOLUTIONS}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#111827] hover:bg-slate-800 border border-slate-600/80 hover:border-[#00C2C7] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7]"
                  >
                    <span>Explore Our Technology Solutions</span>
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-5 p-5 rounded-xl bg-[#111827]/90 border border-slate-700/80 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <span className="font-mono text-[#00C2C7] uppercase">
                    Official Corporate Contact
                  </span>
                  <Building className="w-4 h-4 text-[#D4AF37]" aria-hidden="true" />
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[#F3F4F6]/65 font-mono">Telephone</span>
                    <a
                      href={corporateIdentity.contact.telephone.href}
                      className="inline-flex items-center gap-1.5 font-semibold text-[#00C2C7] font-mono hover:underline"
                    >
                      <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{corporateIdentity.contact.telephone.display}</span>
                    </a>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[#F3F4F6]/65 font-mono">Email</span>
                    <a
                      href={`mailto:${corporateIdentity.contact.email}`}
                      className="inline-flex items-center gap-1.5 font-semibold text-[#00C2C7] font-mono hover:underline"
                    >
                      <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{corporateIdentity.contact.email}</span>
                    </a>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[#F3F4F6]/65 font-mono">Website</span>
                    <a
                      href={corporateIdentity.contact.website}
                      className="inline-flex items-center gap-1.5 text-[#F3F4F6] hover:text-[#00C2C7] font-mono"
                    >
                      <Globe className="w-3.5 h-3.5 text-[#00C2C7]" aria-hidden="true" />
                      <span>{corporateIdentity.contact.website}</span>
                    </a>
                  </div>
                  <div className="pt-2 border-t border-slate-800 space-y-1">
                    <span className="text-[#F3F4F6]/65 font-mono block">Registered Headquarters</span>
                    <p className="text-[#F3F4F6]/90 leading-relaxed">
                      {corporateIdentity.headquarters.fullAddress}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <EnterpriseModal
        isOpen={isEnterpriseModalOpen}
        onClose={() => setIsEnterpriseModalOpen(false)}
        defaultTab="portal"
      />

      <Footer
        onNavigate={handleNavigatePublic}
        onOpenPortal={() => setIsEnterpriseModalOpen(true)}
        onOpenLegal={handleOpenLegal}
      />

      <AIConsultantWidget />
    </div>
  );
};

export default ResourcesPage;
