import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  ExternalLink,
  Eye,
} from 'lucide-react';
import {
  CorporateResource,
  formatResourceFileSize,
} from '../../data/corporateResources';
import { BrandLogo } from '../BrandLogo';

interface CorporateResourceCardProps {
  resource: CorporateResource;
  onPreview: (resource: CorporateResource) => void;
}

const ResourceCoverThumbnail: React.FC<{ resource: CorporateResource }> = ({ resource }) => {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="relative w-full aspect-[17/22] rounded-xl overflow-hidden bg-[#081529] border border-slate-700/80 group-hover:border-[#D4AF37]/70 shadow-lg transition-colors duration-200 motion-reduce:transition-none">
      {/* Subtle metallic gold-to-cyan top hairline */}
      <div
        aria-hidden="true"
        className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-[#D4AF37] via-[#00C2C7] to-[#0EA5E9] z-10 pointer-events-none"
      />

      {!imageError ? (
        <img
          src={resource.thumbnailUrl}
          alt={resource.coverAltText}
          width={800}
          height={1132}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImageError(true)}
          className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.015] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-b from-[#0B1F3B] via-[#111827] to-[#081529] p-5 flex flex-col justify-between text-left">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-700/80">
            <BrandLogo variant="emblem" size="sm" ring="brand" decorative />
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#00C2C7]">
              Official {resource.format}
            </span>
          </div>
          <div className="my-auto py-4 space-y-2">
            <span className="block text-[10px] font-mono uppercase tracking-[0.16em] text-[#D4AF37]">
              {resource.category}
            </span>
            <span className="block text-base font-extrabold text-white leading-snug">
              {resource.title}
            </span>
          </div>
          <div className="pt-3 border-t border-slate-700/80 text-[10px] font-mono tabular-nums text-[#F3F4F6]/80 flex items-center justify-between">
            <span>{resource.pageCount} Pages</span>
            <span>{formatResourceFileSize(resource.fileSizeBytes)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Reusable Premium Corporate Resource Card
 *
 * Shared across the homepage Corporate Resources section and the dedicated
 * `/resources` Download Center. Preserves clean document typography, accurate
 * cover previews, WCAG 2.2 AA contrast, equal-height alignment, and verified
 * Download PDF / View PDF / Preview Document actions.
 */
export const CorporateResourceCard: React.FC<CorporateResourceCardProps> = ({
  resource,
  onPreview,
}) => {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isCheckingDownload, setIsCheckingDownload] = useState(false);

  const formattedSize = formatResourceFileSize(resource.fileSizeBytes);

  const handleVerifiedDownload = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    // Allow modified clicks (Ctrl/Cmd/Shift/Middle) to follow native browser behavior
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }

    event.preventDefault();
    setDownloadError(null);
    setIsCheckingDownload(true);

    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 5000);
      const response = await fetch(resource.fileUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      if (!response.ok) {
        setDownloadError(
          `The requested PDF (${resource.downloadFilename}) is temporarily unreachable (HTTP ${response.status}). Please retry or use View PDF.`
        );
        return;
      }

      const tempLink = document.createElement('a');
      tempLink.href = resource.fileUrl;
      tempLink.download = resource.downloadFilename;
      tempLink.rel = 'noopener noreferrer';
      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);
    } catch {
      setDownloadError(
        'Unable to verify the document stream right now. Use View PDF to open the publication directly.'
      );
    } finally {
      setIsCheckingDownload(false);
    }
  };

  return (
    <article className="group relative h-full rounded-2xl bg-[#0B1F3B]/80 backdrop-blur-md border border-slate-700/75 hover:border-[#00C2C7]/65 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.65)] hover:shadow-[0_24px_50px_-18px_rgba(0,194,199,0.22)] transition-all duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 overflow-hidden flex flex-col">
      {/* Fine Architectural Gold & Cyan Top Hairline */}
      <div
        aria-hidden="true"
        className="h-[2px] w-full bg-gradient-to-r from-[#D4AF37]/80 via-[#00C2C7]/75 to-[#0EA5E9]/50"
      />

      <div className="p-6 sm:p-7 flex-1 flex flex-col justify-between gap-6">
        {/* Top Row: Cover Preview + Core Document Metadata */}
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="w-40 sm:w-40 md:w-44 shrink-0 mx-auto sm:mx-0">
            <a
              href={resource.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View ${resource.title} PDF in a new tab`}
              className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1F3B]"
            >
              <ResourceCoverThumbnail resource={resource} />
            </a>
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div className="space-y-1.5">
              <div className="text-[11px] font-mono font-semibold uppercase tracking-[0.16em] text-[#D4AF37]">
                {resource.category}
              </div>

              <h3 className="text-xl font-extrabold tracking-tight text-white leading-snug">
                {resource.title}
              </h3>

              {/* Unboxed inline metadata with tabular numerals */}
              <p className="text-xs font-mono tabular-nums text-[#F3F4F6]/75">
                {resource.format}
                <span className="mx-1.5 text-[#00C2C7]" aria-hidden="true">·</span>
                {resource.pageCount} Pages
                <span className="mx-1.5 text-[#00C2C7]" aria-hidden="true">·</span>
                {formattedSize}
                <span className="mx-1.5 text-[#00C2C7]" aria-hidden="true">·</span>
                <span className="text-[#10B981]">Public Download</span>
              </p>
            </div>

            <p className="text-sm text-[#F3F4F6]/85 leading-relaxed">
              {resource.description}
            </p>
          </div>
        </div>

        {/* Structured Highlights List (All Key Contents Covered Cleanly) */}
        <div className="pt-4 border-t border-slate-700/60">
          <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#00C2C7] mb-3">
            Included Document Coverage
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
            {resource.highlights.map((highlight) => (
              <li
                key={highlight}
                className="flex items-start gap-2 text-xs text-[#F3F4F6]/90 leading-relaxed"
              >
                <Check className="w-3.5 h-3.5 text-[#00C2C7] shrink-0 mt-0.5" aria-hidden="true" />
                <span>{highlight}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom Action Controls + Accessible Error Feedback */}
        <div className="pt-4 border-t border-slate-700/60 space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={resource.fileUrl}
              download={resource.downloadFilename}
              onClick={handleVerifiedDownload}
              aria-busy={isCheckingDownload}
              aria-label={`Download ${resource.title} (${resource.format}, ${resource.pageCount} pages, ${formattedSize})`}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#00C2C7] hover:bg-[#19d2d7] text-[#111827] text-xs font-bold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFFFFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1F3B] whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-[#111827] shrink-0" aria-hidden="true" />
              <span>{isCheckingDownload ? 'Preparing PDF...' : 'Download PDF'}</span>
            </a>

            <a
              href={resource.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View ${resource.title} PDF in a new browser tab`}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#111827]/90 hover:bg-[#111827] text-white border border-slate-600/80 hover:border-[#00C2C7] text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1F3B] whitespace-nowrap shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#00C2C7] shrink-0" aria-hidden="true" />
              <span>View PDF</span>
            </a>

            <button
              type="button"
              onClick={() => onPreview(resource)}
              aria-label={`Open inline preview for ${resource.title}`}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg text-[#F3F4F6] hover:text-white hover:bg-[#111827]/70 border border-transparent hover:border-[#D4AF37]/50 text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1F3B] whitespace-nowrap shrink-0"
            >
              <Eye className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" aria-hidden="true" />
              <span>Preview Document</span>
            </button>
          </div>

          {downloadError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-[#111827]/90 border border-[#D4AF37]/60 px-3 py-2 text-xs text-[#F3F4F6]"
            >
              <AlertCircle className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" aria-hidden="true" />
              <span>{downloadError}</span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
};
