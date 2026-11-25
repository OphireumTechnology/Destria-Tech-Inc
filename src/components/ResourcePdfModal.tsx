import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Maximize2,
  Minimize2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { CorporateResource, formatResourceFileSize } from '../data/corporateResources';

interface ResourcePdfModalProps {
  resource: CorporateResource;
  onClose: () => void;
}

const ZOOM_LEVELS = [75, 100, 125, 150] as const;

/**
 * Lazy-loaded embedded PDF preview modal for official DESTRIA TECH INC corporate resources.
 * Styled in Deep Navy (#0B1F3B) and Graphite (#111827) to match the modernized Corporate
 * Resources section, with keyboard dismissal, loading indicator, zoom/page controls, and
 * accessible fallback controls when inline PDF rendering is unsupported.
 */
export const ResourcePdfModal: React.FC<ResourcePdfModalProps> = ({ resource, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoadingViewer, setIsLoadingViewer] = useState(true);

  useEffect(() => {
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [onClose]);

  useEffect(() => {
    setIsLoadingViewer(true);
    // Some browsers do not fire `onLoad` on PDF <object> elements; clear overlay gracefully
    const timer = window.setTimeout(() => {
      setIsLoadingViewer(false);
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [resource.id, currentPage, zoomPercent]);

  const handleToggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen API unavailable on some mobile browsers
    }
  };

  const handleZoomOut = () => {
    const idx = ZOOM_LEVELS.indexOf(zoomPercent as (typeof ZOOM_LEVELS)[number]);
    if (idx > 0) setZoomPercent(ZOOM_LEVELS[idx - 1]);
  };

  const handleZoomIn = () => {
    const idx = ZOOM_LEVELS.indexOf(zoomPercent as (typeof ZOOM_LEVELS)[number]);
    if (idx >= 0 && idx < ZOOM_LEVELS.length - 1) setZoomPercent(ZOOM_LEVELS[idx + 1]);
  };

  const pdfViewerSrc = `${resource.fileUrl}#page=${currentPage}&zoom=${zoomPercent}&view=FitH`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="resource-pdf-modal-title"
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5 bg-[#0B1F3B]/90 backdrop-blur-md"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        className="w-full max-w-6xl h-[92vh] bg-[#111827] text-[#F3F4F6] rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Top Gold-Cyan Accent Hairline */}
        <div
          aria-hidden="true"
          className="h-[2px] w-full bg-gradient-to-r from-[#D4AF37] via-[#00C2C7] to-[#0EA5E9] shrink-0"
        />

        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 bg-[#0B1F3B] text-white border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#D4AF37]">
              {resource.category}
            </div>
            <h3
              id="resource-pdf-modal-title"
              className="text-sm sm:text-base font-bold text-white truncate mt-0.5"
            >
              {resource.title}
            </h3>
            <p className="text-[11px] font-mono tabular-nums text-[#F3F4F6]/75 mt-0.5">
              {resource.format} · {resource.pageCount} Pages ·{' '}
              {formatResourceFileSize(resource.fileSizeBytes)}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={resource.fileUrl}
              download={resource.downloadFilename}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#00C2C7] hover:bg-[#19d2d7] text-[#111827] text-xs font-bold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download PDF</span>
            </a>
            <a
              href={resource.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#111827] hover:bg-slate-800 border border-slate-700 hover:border-[#00C2C7] text-[#F3F4F6] text-xs font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7]"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#00C2C7]" aria-hidden="true" />
              <span className="hidden sm:inline">View PDF</span>
            </a>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close document preview"
              className="p-2 rounded-lg bg-[#111827] hover:bg-slate-800 border border-slate-700 hover:border-[#D4AF37] text-[#F3F4F6] hover:text-white cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7]"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Viewer Controls Toolbar */}
        <div className="px-4 sm:px-6 py-2.5 bg-[#111827] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              aria-label="Previous page"
              className="p-1.5 rounded-lg bg-[#0B1F3B] border border-slate-700 text-[#F3F4F6] hover:border-[#00C2C7] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <span className="font-mono tabular-nums text-[#F3F4F6]/85">
              Page <strong className="text-white">{currentPage}</strong> of {resource.pageCount}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(resource.pageCount, p + 1))}
              disabled={currentPage >= resource.pageCount}
              aria-label="Next page"
              className="p-1.5 rounded-lg bg-[#0B1F3B] border border-slate-700 text-[#F3F4F6] hover:border-[#00C2C7] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-lg bg-[#0B1F3B] border border-slate-700 overflow-hidden">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomPercent <= ZOOM_LEVELS[0]}
                aria-label="Zoom out"
                className="p-1.5 text-[#F3F4F6] hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <span className="px-2 font-mono tabular-nums text-white min-w-[46px] text-center">
                {zoomPercent}%
              </span>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomPercent >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
                aria-label="Zoom in"
                className="p-1.5 text-[#F3F4F6] hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleToggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0B1F3B] border border-slate-700 text-[#F3F4F6] hover:border-[#00C2C7] cursor-pointer transition-colors"
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5 text-[#00C2C7]" aria-hidden="true" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5 text-[#00C2C7]" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
            </button>
          </div>
        </div>

        {/* Embedded PDF Object with Loading State & Accessible Fallback */}
        <div className="flex-1 bg-[#081529] overflow-hidden relative">
          {isLoadingViewer && (
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#081529]/80"
            >
              <div className="px-5 py-3 rounded-xl bg-[#0B1F3B] border border-slate-700 text-[#F3F4F6] text-xs font-mono flex items-center gap-3 shadow-lg">
                <div className="w-4 h-4 rounded-full border-2 border-[#00C2C7] border-t-transparent animate-spin motion-reduce:animate-none" />
                <span>Loading PDF document...</span>
              </div>
            </div>
          )}

          <object
            key={`${resource.id}-${currentPage}-${zoomPercent}`}
            data={pdfViewerSrc}
            type="application/pdf"
            aria-label={`${resource.title} PDF Preview`}
            onLoad={() => setIsLoadingViewer(false)}
            className="w-full h-full block"
          >
            <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4 bg-[#111827]">
              <FileText className="w-10 h-10 text-[#D4AF37]" aria-hidden="true" />
              <div className="max-w-md space-y-2">
                <h4 className="text-base font-bold text-white">
                  Direct Document Access
                </h4>
                <p className="text-sm text-[#F3F4F6]/80 leading-relaxed">
                  Your browser does not render embedded PDFs inline. Open the official{' '}
                  {resource.pageCount}-page PDF in a new tab or download it directly below.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <a
                  href={resource.fileUrl}
                  download={resource.downloadFilename}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#00C2C7] hover:bg-[#19d2d7] text-[#111827] text-xs font-bold transition-colors"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  <span>Download PDF</span>
                </a>
                <a
                  href={resource.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0B1F3B] border border-slate-600 hover:border-[#00C2C7] text-white text-xs font-semibold transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-[#00C2C7]" aria-hidden="true" />
                  <span>View PDF in New Tab</span>
                </a>
              </div>
            </div>
          </object>
        </div>
      </div>
    </div>
  );
};

export default ResourcePdfModal;
