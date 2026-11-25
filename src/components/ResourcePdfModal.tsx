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
 * Loaded strictly on-demand when a visitor initiates an inline preview so the main page
 * bundle and initial network payload stay lean.
 */
export const ResourcePdfModal: React.FC<ResourcePdfModalProps> = ({ resource, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
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
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5 bg-[#0B1F3B]/85 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        className="w-full max-w-6xl h-[92vh] bg-white text-[#111827] rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col"
      >
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
            <p className="text-[11px] font-mono text-slate-300 mt-0.5">
              {resource.format} · {resource.pageCount} Pages ·{' '}
              {formatResourceFileSize(resource.fileSizeBytes)}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={resource.fileUrl}
              download={resource.downloadFilename}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#D4AF37] hover:bg-[#c59f2c] text-[#0B1F3B] text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </a>
            <a
              href={resource.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-100 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7]"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#00C2C7]" />
              <span className="hidden sm:inline">Open in New Tab</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close document preview"
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Viewer Controls Toolbar */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              aria-label="Previous page"
              className="p-1.5 rounded-lg bg-white border border-slate-300 text-[#0B1F3B] hover:border-[#0B1F3B] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono text-slate-700">
              Page <strong className="text-[#0B1F3B]">{currentPage}</strong> of {resource.pageCount}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(resource.pageCount, p + 1))}
              disabled={currentPage >= resource.pageCount}
              aria-label="Next page"
              className="p-1.5 rounded-lg bg-white border border-slate-300 text-[#0B1F3B] hover:border-[#0B1F3B] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-lg bg-white border border-slate-300 overflow-hidden">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomPercent <= ZOOM_LEVELS[0]}
                aria-label="Zoom out"
                className="p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-mono text-slate-800 min-w-[44px] text-center">
                {zoomPercent}%
              </span>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomPercent >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
                aria-label="Zoom in"
                className="p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleToggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-800 hover:border-[#0B1F3B] cursor-pointer transition-colors"
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5 text-[#0B1F3B]" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5 text-[#0B1F3B]" />
              )}
              <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
            </button>
          </div>
        </div>

        {/* Embedded PDF Object with Accessible Fallback */}
        <div className="flex-1 bg-slate-100 overflow-hidden relative">
          <object
            key={`${resource.id}-${currentPage}-${zoomPercent}`}
            data={pdfViewerSrc}
            type="application/pdf"
            aria-label={`${resource.title} PDF Preview`}
            className="w-full h-full block"
          >
            <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4 bg-white">
              <FileText className="w-10 h-10 text-[#0B1F3B]" />
              <div className="max-w-md space-y-2">
                <h4 className="text-base font-bold text-[#0B1F3B]">
                  Direct Document Access
                </h4>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Your browser does not render embedded PDFs inline. Open the official{' '}
                  {resource.pageCount}-page PDF in a new tab or download it directly below.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <a
                  href={resource.fileUrl}
                  download={resource.downloadFilename}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0B1F3B] hover:bg-[#112c52] text-white text-xs font-bold transition-colors"
                >
                  <Download className="w-4 h-4 text-[#D4AF37]" />
                  <span>Download PDF</span>
                </a>
                <a
                  href={resource.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-300 hover:border-[#0B1F3B] text-[#0B1F3B] text-xs font-semibold transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-[#00C2C7]" />
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
