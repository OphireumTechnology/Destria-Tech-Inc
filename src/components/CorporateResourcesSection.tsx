import React, { Suspense, lazy, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, FileText, ShieldCheck } from 'lucide-react';
import {
  CORPORATE_RESOURCES_SECTION_COPY,
  CorporateResource,
  getPublishedCorporateResources,
} from '../data/corporateResources';
import { ROUTES } from '../config/routes';
import { CorporateResourcesTechBackground } from './animations/CorporateResourcesTechBackground';
import { CorporateResourceCard } from './resources/CorporateResourceCard';

const ResourcePdfModal = lazy(() => import('./ResourcePdfModal'));

interface CorporateResourcesSectionProps {
  /** Whether rendered inside the dedicated `/resources` page (hides duplicate center link & enables category filter) */
  isDedicatedPage?: boolean;
  /** Optional custom heading override */
  heading?: string;
  /** Optional custom description override */
  description?: string;
}

/**
 * Modernized Corporate Resources Section — DESTRIA TECH INC
 *
 * Visually continues the enterprise dark technology design language of the main
 * website using Graphite (#111827), Deep Navy (#0B1F3B), Technology Cyan (#00C2C7),
 * Metallic Gold (#D4AF37), Silver Gray (#F3F4F6), Technology Blue (#0EA5E9),
 * Emerald Teal (#10B981), and Pure White (#FFFFFF).
 */
export const CorporateResourcesSection: React.FC<CorporateResourcesSectionProps> = ({
  isDedicatedPage = false,
  heading = CORPORATE_RESOURCES_SECTION_COPY.heading,
  description = CORPORATE_RESOURCES_SECTION_COPY.description,
}) => {
  const resources = useMemo(() => getPublishedCorporateResources(), []);
  const categories = useMemo(
    () => ['All Publications', ...Array.from(new Set(resources.map((r) => r.category)))],
    [resources]
  );

  const [selectedCategory, setSelectedCategory] = useState<string>('All Publications');
  const [previewResource, setPreviewResource] = useState<CorporateResource | null>(null);

  const visibleResources = useMemo(() => {
    if (!isDedicatedPage || selectedCategory === 'All Publications') {
      return resources;
    }
    return resources.filter((resource) => resource.category === selectedCategory);
  }, [isDedicatedPage, resources, selectedCategory]);

  return (
    <section
      id="resources"
      aria-labelledby="corporate-resources-heading"
      className="relative py-20 lg:py-24 bg-[#111827] text-[#F3F4F6] border-t border-slate-800/90 overflow-hidden"
    >
      {/* Animated, Fault-Isolated Enterprise Technology Background */}
      <CorporateResourcesTechBackground />

      {/* Architectural Gold Top Hairline */}
      <div
        aria-hidden="true"
        className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37]/80 to-transparent pointer-events-none z-10"
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Modernized Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-8">
          <div className="max-w-3xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-[0.18em] text-[#D4AF37]">
              <FileText className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" aria-hidden="true" />
              <span>{CORPORATE_RESOURCES_SECTION_COPY.eyebrow}</span>
            </div>

            <h2
              id="corporate-resources-heading"
              className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight"
            >
              {heading}
            </h2>

            <p className="text-sm sm:text-base text-[#F3F4F6]/80 leading-relaxed max-w-2xl">
              {description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 shrink-0">
            <div className="flex items-center gap-2 text-xs font-mono text-[#F3F4F6]/85">
              <ShieldCheck className="w-4 h-4 text-[#10B981] shrink-0" aria-hidden="true" />
              <span>Public Access · No Sign-In Required</span>
            </div>

            {!isDedicatedPage && (
              <Link
                to={ROUTES.RESOURCES}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#0B1F3B]/90 hover:bg-[#0B1F3B] border border-[#00C2C7]/45 hover:border-[#00C2C7] text-xs font-semibold text-[#00C2C7] hover:text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111827]"
              >
                <span>Explore Download Center</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[#D4AF37]" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>

        {/* Subtle Animated Technology Divider Below Heading */}
        <div
          aria-hidden="true"
          className="relative h-px w-full bg-slate-700/70 overflow-hidden mb-10"
        >
          <div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-[#00C2C7] to-[#D4AF37] destria-tech-divider-sweep" />
        </div>

        {/* Optional Category Filter Controls on Dedicated Download Center */}
        {isDedicatedPage && categories.length > 2 && (
          <div
            role="group"
            aria-label="Filter corporate publications by category"
            className="mb-8 flex flex-wrap items-center gap-2.5"
          >
            {categories.map((category) => {
              const isActive = selectedCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] ${
                    isActive
                      ? 'bg-[#00C2C7] text-[#111827] border border-[#00C2C7]'
                      : 'bg-[#0B1F3B]/80 text-[#F3F4F6]/85 border border-slate-700/80 hover:border-[#00C2C7]/60 hover:text-white'
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        )}

        {/* Balanced Two-Column Desktop Corporate Resource Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          {visibleResources.map((resource) => (
            <CorporateResourceCard
              key={resource.id}
              resource={resource}
              onPreview={setPreviewResource}
            />
          ))}
        </div>

        {/* Corporate Consultation Footer Call to Action (Homepage Section) */}
        {!isDedicatedPage ? (
          <div className="mt-12 rounded-2xl bg-[#0B1F3B]/85 backdrop-blur-md border border-slate-700/80 p-7 sm:p-9 relative overflow-hidden">
            <div
              aria-hidden="true"
              className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-[#D4AF37]/75 via-[#00C2C7]/75 to-transparent"
            />

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="max-w-2xl space-y-2.5">
                <div className="text-[11px] font-mono font-semibold uppercase tracking-[0.16em] text-[#D4AF37]">
                  Customized Enterprise Solutions
                </div>
                <h3 className="text-2xl sm:text-[1.7rem] font-extrabold tracking-tight text-white leading-snug">
                  Transform Your Enterprise with Intelligent Technology
                </h3>
                <p className="text-sm text-[#F3F4F6]/80 leading-relaxed">
                  Discover customized enterprise technology solutions designed around your
                  organization&apos;s operational, technical and strategic requirements.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <Link
                  to={ROUTES.CONSULTATION}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#00C2C7] hover:bg-[#19d2d7] text-[#111827] text-xs sm:text-sm font-bold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1F3B]"
                >
                  <span>Request an Enterprise Consultation</span>
                  <ArrowUpRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                </Link>

                <Link
                  to={ROUTES.SOLUTIONS}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#111827]/90 hover:bg-[#111827] border border-slate-600/80 hover:border-[#00C2C7] text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1F3B]"
                >
                  <span>Explore Our Technology Solutions</span>
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-10 pt-6 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-[#F3F4F6]/75">
            <p className="leading-relaxed max-w-3xl">
              All DESTRIA TECH INC enterprise solutions are customized to client operational,
              technical, and security requirements and formally scoped following an initial
              consultation and assessment.
            </p>
            <Link
              to={ROUTES.CONSULTATION}
              className="inline-flex items-center gap-1.5 font-semibold text-[#00C2C7] hover:text-white transition-colors shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] rounded"
            >
              <span>Request an Enterprise Consultation</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-[#D4AF37]" aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>

      {/* Lazy-Loaded Inline PDF Preview Modal (mounted only on explicit user action) */}
      {previewResource && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0B1F3B]/85 backdrop-blur-sm">
              <div className="px-6 py-4 rounded-xl bg-[#111827] border border-slate-700 text-white text-xs font-mono shadow-xl flex items-center gap-3">
                <div className="w-4 h-4 rounded-full border-2 border-[#00C2C7] border-t-transparent animate-spin" />
                <span>Opening document preview...</span>
              </div>
            </div>
          }
        >
          <ResourcePdfModal
            resource={previewResource}
            onClose={() => setPreviewResource(null)}
          />
        </Suspense>
      )}
    </section>
  );
};
