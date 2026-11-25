import React, { Suspense, lazy, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Check,
  Download,
  ExternalLink,
  Eye,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import {
  CORPORATE_RESOURCES_SECTION_COPY,
  CorporateResource,
  formatResourceFileSize,
  getPublishedCorporateResources,
} from '../data/corporateResources';
import { ROUTES } from '../config/routes';
import { BrandLogo } from './BrandLogo';

const ResourcePdfModal = lazy(() => import('./ResourcePdfModal'));

interface CorporateResourcesSectionProps {
  /** Whether rendered inside the dedicated `/resources` page (hides duplicate center link) */
  isDedicatedPage?: boolean;
  /** Optional custom heading override */
  heading?: string;
  /** Optional custom description override */
  description?: string;
}

const ResourceCoverThumbnail: React.FC<{ resource: CorporateResource }> = ({ resource }) => {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="relative w-full aspect-[17/22] rounded-xl overflow-hidden bg-slate-100 border border-slate-200/90 shadow-sm group-hover:shadow-md transition-shadow motion-reduce:transition-none">
      {/* Subtle metallic gold top-edge accent bar */}
      <div
        aria-hidden="true"
        className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-[#0B1F3B] via-[#D4AF37] to-[#00C2C7] z-10 pointer-events-none"
      />

      {!imageError ? (
        <img
          src={resource.thumbnailUrl}
          alt={resource.coverAltText}
          width={800}
          height={1132}
          loading="lazy"
          decoding="async"
          onError={() => setImageError(true)}
          className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.015] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-b from-[#FFFFFF] via-[#F8FAFC] to-[#F1F5F9] p-5 flex flex-col justify-between text-left">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
            <BrandLogo variant="emblem" size="sm" ring="brand" decorative />
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#0B1F3B]">
              Official {resource.format}
            </span>
          </div>
          <div className="my-auto py-4 space-y-2">
            <span className="block text-[10px] font-mono uppercase tracking-[0.16em] text-[#9A7B1C]">
              {resource.category}
            </span>
            <span className="block text-base font-extrabold text-[#0B1F3B] leading-snug">
              {resource.title}
            </span>
          </div>
          <div className="pt-3 border-t border-slate-200 text-[10px] font-mono text-slate-600 flex items-center justify-between">
            <span>{resource.pageCount} Pages</span>
            <span>{formatResourceFileSize(resource.fileSizeBytes)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Reusable Corporate Resources Section
 *
 * Designed with a predominantly clean white executive surface (#FFFFFF),
 * deep corporate navy headings (#0B1F3B), graphite body contrast (#111827),
 * refined metallic gold accents (#D4AF37), and restrained technology cyan (#00C2C7)
 * highlights to mirror DESTRIA TECH INC's official corporate documentation.
 */
export const CorporateResourcesSection: React.FC<CorporateResourcesSectionProps> = ({
  isDedicatedPage = false,
  heading = CORPORATE_RESOURCES_SECTION_COPY.heading,
  description = CORPORATE_RESOURCES_SECTION_COPY.description,
}) => {
  const resources = getPublishedCorporateResources();
  const [previewResource, setPreviewResource] = useState<CorporateResource | null>(null);

  return (
    <section
      id="resources"
      aria-labelledby="corporate-resources-heading"
      className="py-20 lg:py-24 bg-white text-[#111827] border-t border-slate-200 relative"
    >
      {/* Subtle architectural gold hairline along section top */}
      <div
        aria-hidden="true"
        className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37]/70 to-transparent pointer-events-none"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-10 border-b border-slate-200">
          <div className="max-w-3xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-[0.18em] text-[#9A7B1C]">
              <FileText className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
              <span>{CORPORATE_RESOURCES_SECTION_COPY.eyebrow}</span>
            </div>

            <h2
              id="corporate-resources-heading"
              className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#0B1F3B] leading-tight"
            >
              {heading}
            </h2>

            <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl">
              {description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 shrink-0">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-600">
              <ShieldCheck className="w-4 h-4 text-[#009CA0] shrink-0" />
              <span>Public Access · No Sign-In Required</span>
            </div>

            {!isDedicatedPage && (
              <Link
                to={ROUTES.RESOURCES}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-[#0B1F3B]/20 hover:border-[#0B1F3B] text-xs font-semibold text-[#0B1F3B] hover:bg-slate-50 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7]"
              >
                <span>Open Download Center</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[#D4AF37]" />
              </Link>
            )}
          </div>
        </div>

        {/* Scalable Corporate Resource Cards Grid */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {resources.map((resource) => {
            const formattedSize = formatResourceFileSize(resource.fileSizeBytes);
            return (
              <article
                key={resource.id}
                className="group rounded-2xl bg-white border border-slate-200 hover:border-[#D4AF37]/80 shadow-sm hover:shadow-lg transition-all duration-200 p-6 sm:p-7 flex flex-col sm:flex-row gap-6 motion-reduce:transition-none"
              >
                {/* Actual Rendered Cover Thumbnail (Page 1 WebP) */}
                <div className="w-44 sm:w-44 md:w-48 shrink-0 mx-auto sm:mx-0">
                  <a
                    href={resource.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`View ${resource.title} PDF in a new tab`}
                    className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] focus-visible:ring-offset-2"
                  >
                    <ResourceCoverThumbnail resource={resource} />
                  </a>
                </div>

                {/* Document Details & Actions */}
                <div className="flex-1 flex flex-col justify-between min-w-0">
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-[#9A7B1C]">
                        {resource.category}
                      </div>

                      <h3 className="text-xl font-extrabold tracking-tight text-[#0B1F3B] leading-snug">
                        {resource.title}
                      </h3>

                      {/* Clean unboxed inline metadata with middle-dot separators */}
                      <p className="text-xs font-mono text-slate-500">
                        {resource.format} · {resource.pageCount} Pages · {formattedSize} · Public Download
                      </p>
                    </div>

                    <p className="text-sm text-slate-600 leading-relaxed">
                      {resource.description}
                    </p>

                    <ul className="space-y-1.5 pt-1">
                      {resource.highlights.map((highlight) => (
                        <li
                          key={highlight}
                          className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed"
                        >
                          <Check className="w-3.5 h-3.5 text-[#009CA0] shrink-0 mt-0.5" />
                          <span>{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Primary & Secondary Action Controls */}
                  <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2.5">
                    <a
                      href={resource.fileUrl}
                      download={resource.downloadFilename}
                      aria-label={`Download ${resource.title} (${resource.format}, ${resource.pageCount} pages, ${formattedSize})`}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#0B1F3B] hover:bg-[#132d54] text-white text-xs font-bold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] focus-visible:ring-offset-2 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                      <span>Download PDF</span>
                    </a>

                    <a
                      href={resource.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View ${resource.title} PDF in a new browser tab`}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-[#0B1F3B] border border-slate-300 hover:border-[#0B1F3B] text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] focus-visible:ring-offset-2 whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-[#009CA0] shrink-0" />
                      <span>View PDF</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => setPreviewResource(resource)}
                      aria-label={`Open inline preview for ${resource.title}`}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-slate-600 hover:text-[#0B1F3B] hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] whitespace-nowrap"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                      <span>Preview</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Customized Commercial Policy Notice Strip */}
        <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-slate-600">
          <p className="leading-relaxed max-w-3xl">
            All DESTRIA TECH INC enterprise solutions are customized to client operational,
            technical, and security requirements and formally scoped following an initial
            consultation and assessment.
          </p>
          <Link
            to={ROUTES.CONSULTATION}
            className="inline-flex items-center gap-1.5 font-semibold text-[#0B1F3B] hover:text-[#009CA0] transition-colors shrink-0 whitespace-nowrap"
          >
            <span>Request an Enterprise Consultation</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-[#D4AF37]" />
          </Link>
        </div>
      </div>

      {/* Lazy-Loaded Inline PDF Preview Modal (mounted only on explicit user action) */}
      {previewResource && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0B1F3B]/80 backdrop-blur-sm">
              <div className="px-6 py-4 rounded-xl bg-white text-[#0B1F3B] text-xs font-mono shadow-xl flex items-center gap-3">
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
