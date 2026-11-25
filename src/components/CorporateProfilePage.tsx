import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  Building,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Mail,
  Maximize2,
  Minimize2,
  Phone,
  Printer,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  AlertCircle,
} from 'lucide-react';
import { corporateIdentity } from '../data/companyConfig';
import {
  CORPORATE_PROFILE_HIGHLIGHTS,
  corporateProfile,
  formatCorporateProfileFileSize,
  getCorporateProfileMetaSummary,
} from '../config/corporateProfile';
import { ROUTES, buildGovernanceRoute, sectionIdToPublicRoute } from '../config/routes';
import { Header } from './Header';
import { Footer } from './Footer';
import { BrandLogo } from './BrandLogo';
import { CorporateProfileCover } from './CorporateProfileCover';
import { EnterpriseModal } from './EnterpriseModal';
import { AIConsultantWidget } from './consultant/AIConsultantWidget';

const ZOOM_LEVELS = [75, 100, 125, 150] as const;

type PdfAvailabilityState = 'checking' | 'available' | 'missing';

/**
 * Dedicated Corporate Profile Page (`/corporate-profile`)
 *
 * Provides public, authentication-free online viewing, direct PDF download,
 * full HTML accessibility overview of all 18 corporate profile sections,
 * verified corporate contact information, and structured Schema.org JSON-LD.
 */
export const CorporateProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const viewerContainerRef = useRef<HTMLDivElement>(null);

  const [isEnterpriseModalOpen, setIsEnterpriseModalOpen] = useState(false);
  const [pdfAvailability, setPdfAvailability] = useState<PdfAvailabilityState>('checking');
  const [resolvedFileSizeBytes, setResolvedFileSizeBytes] = useState<number | null>(
    corporateProfile.verifiedFileSizeBytes
  );
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [viewerLoaded, setViewerLoaded] = useState<boolean>(false);

  // Lightweight same-origin HEAD probe ONLY on this dedicated page to detect
  // verified file size and confirm genuine PDF availability without downloading
  // the entire binary on the homepage.
  useEffect(() => {
    let cancelled = false;
    window.scrollTo({ top: 0, behavior: 'auto' });

    async function inspectPdfDocument() {
      try {
        const res = await fetch(corporateProfile.documentUrl, { method: 'HEAD' });
        if (cancelled) return;
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        const contentLengthRaw = res.headers.get('content-length');
        const parsedBytes = contentLengthRaw ? Number.parseInt(contentLengthRaw, 10) : NaN;

        if (res.ok && (contentType.includes('application/pdf') || contentType.includes('octet-stream'))) {
          if (Number.isFinite(parsedBytes) && parsedBytes > 0) {
            setResolvedFileSizeBytes(parsedBytes);
          }
          setPdfAvailability('available');
        } else {
          setPdfAvailability('missing');
        }
      } catch {
        if (!cancelled) {
          // If HEAD is blocked in offline/static context, allow direct browser PDF viewer attempt
          setPdfAvailability('available');
        }
      }
    }

    void inspectPdfDocument();

    return () => {
      cancelled = true;
    };
  }, []);

  // Track browser fullscreen state changes
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleNavigatePublic = (sectionId: string) => {
    if (sectionId === 'corporate-profile') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    navigate(sectionIdToPublicRoute(sectionId));
  };

  const handleOpenLegal = (sectionId?: string) => {
    navigate(buildGovernanceRoute(sectionId));
  };

  const handleToggleFullscreen = async () => {
    const el = viewerContainerRef.current;
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

  const handlePrintPdf = () => {
    // Same-origin hidden print iframe avoids window.open popup blocking
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    printFrame.src = corporateProfile.documentUrl;
    printFrame.onload = () => {
      try {
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();
      } catch {
        window.print();
      }
      window.setTimeout(() => {
        if (printFrame.parentNode) {
          printFrame.parentNode.removeChild(printFrame);
        }
      }, 60_000);
    };
    document.body.appendChild(printFrame);
  };

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(corporateProfile.pageCount, prev + 1));
  };

  const handleZoomOut = () => {
    const idx = ZOOM_LEVELS.indexOf(zoomPercent as (typeof ZOOM_LEVELS)[number]);
    if (idx > 0) setZoomPercent(ZOOM_LEVELS[idx - 1]);
  };

  const handleZoomIn = () => {
    const idx = ZOOM_LEVELS.indexOf(zoomPercent as (typeof ZOOM_LEVELS)[number]);
    if (idx >= 0 && idx < ZOOM_LEVELS.length - 1) setZoomPercent(ZOOM_LEVELS[idx + 1]);
  };

  const formattedFileSize = formatCorporateProfileFileSize(resolvedFileSizeBytes);
  const metaSummary = getCorporateProfileMetaSummary(resolvedFileSizeBytes);
  const pdfViewerSrc = `${corporateProfile.documentUrl}#page=${currentPage}&zoom=${zoomPercent}&view=FitH`;

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: corporateProfile.seo.title,
    description: corporateProfile.seo.description,
    url: corporateProfile.canonicalPageUrl,
    mainEntity: {
      '@type': 'DigitalDocument',
      name: `${corporateProfile.companyName} ${corporateProfile.title}`,
      description: corporateProfile.description,
      url: corporateProfile.canonicalDocumentUrl,
      encodingFormat: 'application/pdf',
      numberOfPages: corporateProfile.pageCount,
      isAccessibleForFree: true,
      publisher: {
        '@type': 'Organization',
        name: corporateIdentity.legalName,
        alternateName: corporateIdentity.networkName,
        url: corporateIdentity.contact.website,
        email: corporateIdentity.contact.email,
        telephone: corporateIdentity.contact.telephone.e164,
      },
    },
  };

  return (
    <div className="min-h-screen bg-[#111827] text-slate-100 flex flex-col overflow-x-clip selection:bg-[#00C2C7]/20 selection:text-[#00C2C7]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <Header
        onOpenPortal={() => setIsEnterpriseModalOpen(true)}
        onNavigate={handleNavigatePublic}
        activeSection="corporate-profile"
      />

      <main className="flex-1">
        {/* Hero / Executive Document Header */}
        <section className="relative pt-10 pb-14 lg:pt-14 lg:pb-20 bg-gradient-to-b from-[#0B1F3B] via-[#111827] to-[#111827] border-b border-slate-800/80">
          <div
            aria-hidden="true"
            className="absolute top-0 right-1/4 w-[520px] h-[340px] bg-[#00C2C7]/10 blur-[130px] rounded-full pointer-events-none"
          />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-6">
              <Link
                to={ROUTES.HOME}
                className="inline-flex items-center gap-2 text-xs font-mono text-slate-400 hover:text-[#00C2C7] transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to {corporateIdentity.legalName}</span>
              </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
              {/* Left Column: Corporate Identity, Introduction & Primary Actions */}
              <div className="lg:col-span-8 space-y-6">
                <div className="flex items-center gap-4">
                  <BrandLogo variant="emblem" size="lg" ring="brand" eager decorative />
                  <div>
                    <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#00C2C7] font-semibold">
                      {corporateProfile.networkName} | {corporateProfile.abbreviation}
                    </div>
                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mt-1 leading-tight">
                      {corporateProfile.companyName}{' '}
                      <span className="text-[#00C2C7]">{corporateProfile.title}</span>
                    </h1>
                  </div>
                </div>

                <p className="text-base sm:text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[#00C2C7] via-[#0EA5E9] to-[#D4AF37]">
                  {corporateProfile.supportingStatement}
                </p>

                <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-3xl">
                  {corporateProfile.description}
                </p>

                {/* Verified Document Metadata Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-[#0B1F3B]/80 border border-slate-800">
                    <span className="block text-[10px] font-mono uppercase text-slate-400">Format</span>
                    <span className="mt-0.5 block font-semibold text-white">Official PDF</span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#0B1F3B]/80 border border-slate-800">
                    <span className="block text-[10px] font-mono uppercase text-slate-400">Length</span>
                    <span className="mt-0.5 block font-semibold text-white">
                      {corporateProfile.pageCount} Pages
                    </span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#0B1F3B]/80 border border-slate-800">
                    <span className="block text-[10px] font-mono uppercase text-slate-400">File Size</span>
                    <span className="mt-0.5 block font-semibold text-[#00C2C7] font-mono">
                      {formattedFileSize ||
                        (pdfAvailability === 'checking' ? 'Verifying...' : 'Pending PDF Asset')}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#0B1F3B]/80 border border-slate-800">
                    <span className="block text-[10px] font-mono uppercase text-slate-400">Access</span>
                    <span className="mt-0.5 block font-semibold text-[#10B981]">Public · Free</span>
                  </div>
                </div>

                {/* Primary Actions */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <a
                    href={corporateProfile.documentUrl}
                    download={corporateProfile.downloadFilename}
                    aria-label="Download DESTRIA TECH INC Official Corporate Profile PDF"
                    className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-bold text-[#111827] bg-[#00C2C7] hover:bg-[#00d6dc] rounded-lg shadow-lg shadow-[#00C2C7]/20 hover:shadow-[#00C2C7]/35 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7]"
                  >
                    <Download className="w-4 h-4 shrink-0" />
                    <span>Download Corporate Profile</span>
                  </a>

                  <a
                    href={corporateProfile.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-semibold text-[#D4AF37] hover:text-white border border-[#D4AF37]/70 hover:border-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                  >
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    <span>Open PDF in New Tab</span>
                  </a>

                  <Link
                    to={ROUTES.CONSULTATION}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-[#00C2C7]/50 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7]"
                  >
                    <span>Request an Enterprise Consultation</span>
                    <ArrowUpRight className="w-4 h-4 shrink-0" />
                  </Link>
                </div>

                <p className="text-xs font-mono text-slate-400">
                  {metaSummary} · Permanent URL:{' '}
                  <span className="text-slate-300">{corporateProfile.canonicalPageUrl}</span>
                </p>
              </div>

              {/* Right Column: Official Cover Preview */}
              <div className="lg:col-span-4 flex justify-center">
                <div className="w-full max-w-[260px] sm:max-w-[300px]">
                  <CorporateProfileCover priority />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Embedded Online PDF Document Viewer */}
        <section
          aria-labelledby="pdf-viewer-heading"
          className="py-12 lg:py-16 bg-[#111827] border-b border-slate-800/80"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-[#00C2C7]">
                  Online Document Reader
                </span>
                <h2 id="pdf-viewer-heading" className="text-2xl font-bold text-white mt-1">
                  Interactive Corporate Profile Viewer
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Browse the complete {corporateProfile.pageCount}-page PDF directly in your browser, or open
                  and download the original file on any desktop, tablet, or mobile device.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                <ShieldCheck className="w-4 h-4 text-[#10B981] shrink-0" />
                <span>Original Unmodified Document</span>
              </div>
            </div>

            <div
              ref={viewerContainerRef}
              className="rounded-2xl bg-[#0B1F3B] border border-slate-700/80 overflow-hidden shadow-2xl flex flex-col"
            >
              {/* Viewer Controls Toolbar */}
              <div className="px-4 py-3 bg-[#081529] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                {/* Page Navigation Controls */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrevPage}
                    disabled={currentPage <= 1 || pdfAvailability === 'missing'}
                    aria-label="Previous page"
                    className="p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:border-[#00C2C7] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300">
                    <label htmlFor="profile-page-input" className="sr-only">
                      Page number
                    </label>
                    <span>Page</span>
                    <input
                      id="profile-page-input"
                      type="number"
                      min={1}
                      max={corporateProfile.pageCount}
                      value={currentPage}
                      disabled={pdfAvailability === 'missing'}
                      onChange={(e) => {
                        const parsed = Number.parseInt(e.target.value, 10);
                        if (!Number.isNaN(parsed)) {
                          setCurrentPage(Math.max(1, Math.min(corporateProfile.pageCount, parsed)));
                        }
                      }}
                      className="w-12 px-2 py-1 text-center rounded-md bg-[#111827] border border-slate-700 text-white focus:outline-none focus:border-[#00C2C7]"
                    />
                    <span className="text-slate-400">of {corporateProfile.pageCount}</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleNextPage}
                    disabled={currentPage >= corporateProfile.pageCount || pdfAvailability === 'missing'}
                    aria-label="Next page"
                    className="p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:border-[#00C2C7] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Zoom, Print, Fullscreen & Direct Download Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center rounded-lg bg-slate-900 border border-slate-700 overflow-hidden">
                    <button
                      type="button"
                      onClick={handleZoomOut}
                      disabled={zoomPercent <= ZOOM_LEVELS[0] || pdfAvailability === 'missing'}
                      aria-label="Zoom out"
                      className="p-2 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="px-2 text-xs font-mono text-slate-200 min-w-[48px] text-center">
                      {zoomPercent}%
                    </span>
                    <button
                      type="button"
                      onClick={handleZoomIn}
                      disabled={
                        zoomPercent >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1] ||
                        pdfAvailability === 'missing'
                      }
                      aria-label="Zoom in"
                      className="p-2 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handlePrintPdf}
                    disabled={pdfAvailability === 'missing'}
                    aria-label="Print Corporate Profile PDF"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-[#00C2C7] text-xs font-medium text-slate-200 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#00C2C7]" />
                    <span className="hidden sm:inline">Print</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleFullscreen}
                    aria-label={isFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-[#00C2C7] text-xs font-medium text-slate-200 hover:text-white cursor-pointer transition-colors"
                  >
                    {isFullscreen ? (
                      <Minimize2 className="w-3.5 h-3.5 text-[#00C2C7]" />
                    ) : (
                      <Maximize2 className="w-3.5 h-3.5 text-[#00C2C7]" />
                    )}
                    <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
                  </button>

                  <a
                    href={corporateProfile.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-[#D4AF37] text-xs font-medium text-[#D4AF37] hover:text-white transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Open PDF</span>
                  </a>

                  <a
                    href={corporateProfile.documentUrl}
                    download={corporateProfile.downloadFilename}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#00C2C7] hover:bg-[#00d6dc] text-xs font-bold text-[#111827] transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>
                </div>
              </div>

              {/* Mobile-Friendly Quick Fallback Notice (shown prominently on small viewports) */}
              <div className="md:hidden px-4 py-3 bg-[#111827] border-b border-slate-800 flex flex-col gap-2 text-xs">
                <p className="text-slate-300">
                  Mobile browsers often provide the smoothest reading experience in native PDF view.
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={corporateProfile.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white font-semibold"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#00C2C7]" />
                    <span>Open PDF</span>
                  </a>
                  <a
                    href={corporateProfile.documentUrl}
                    download={corporateProfile.downloadFilename}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#00C2C7] text-[#111827] font-bold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF</span>
                  </a>
                </div>
              </div>

              {/* Embedded Viewer Area with Graceful Non-Supported Browser Fallback */}
              {pdfAvailability === 'missing' ? (
                <div className="p-8 sm:p-12 text-center bg-[#111827]/95 flex flex-col items-center justify-center min-h-[380px] space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37]">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div className="max-w-lg space-y-2">
                    <h3 className="text-lg font-bold text-white">
                      Official Corporate Profile PDF Pending Asset Publication
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                      The approved original PDF file has not yet been placed at{' '}
                      <code className="font-mono text-[#00C2C7]">
                        {corporateProfile.documentPath}
                      </code>
                      . Once the unmodified corporate profile PDF is published to this path, the
                      interactive viewer and direct download will serve it automatically without any
                      code changes.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <Link
                      to={ROUTES.CONSULTATION}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#00C2C7] hover:bg-[#00d6dc] text-[#111827] text-xs font-bold transition-colors"
                    >
                      <span>Request Corporate Profile via Consultation</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                    <a
                      href={`mailto:${corporateIdentity.contact.email}`}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:border-[#00C2C7] text-xs font-semibold transition-colors"
                    >
                      <Mail className="w-3.5 h-3.5 text-[#00C2C7]" />
                      <span>{corporateIdentity.contact.email}</span>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="relative w-full h-[65vh] sm:h-[75vh] min-h-[480px] bg-[#111827]">
                  {!viewerLoaded && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0B1F3B]/90 z-10 pointer-events-none">
                      <div className="w-7 h-7 rounded-full border-2 border-[#00C2C7] border-t-transparent animate-spin" />
                      <p className="text-xs font-mono text-slate-300">
                        Loading {corporateProfile.companyName} Corporate Profile...
                      </p>
                    </div>
                  )}

                  <object
                    key={`${currentPage}-${zoomPercent}`}
                    data={pdfViewerSrc}
                    type="application/pdf"
                    aria-label={`${corporateProfile.companyName} ${corporateProfile.title} PDF Document`}
                    onLoad={() => setViewerLoaded(true)}
                    className="w-full h-full block"
                  >
                    {/* Accessible Fallback when browser disables or lacks inline PDF embedding */}
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4 bg-[#111827]">
                      <FileText className="w-10 h-10 text-[#00C2C7]" />
                      <div className="max-w-md space-y-2">
                        <h3 className="text-base font-bold text-white">
                          Inline PDF Preview Unavailable on This Browser
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                          Your browser does not support embedded PDF display. Use the buttons below
                          to open the official {corporateProfile.pageCount}-page document in a new
                          tab or download it directly—no additional software required.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <a
                          href={corporateProfile.documentUrl}
                          download={corporateProfile.downloadFilename}
                          className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#00C2C7] hover:bg-[#00d6dc] text-[#111827] text-xs font-bold"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download PDF</span>
                        </a>
                        <a
                          href={corporateProfile.documentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-[#D4AF37]/70 text-[#D4AF37] hover:text-white text-xs font-semibold"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>Open PDF in New Tab</span>
                        </a>
                      </div>
                    </div>
                  </object>
                </div>
              )}

              {/* Viewer Footer Strip */}
              <div className="px-4 py-2.5 bg-[#081529] border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                <span>
                  Accessible HTML summary of all document sections is provided below for screen
                  readers and quick executive review.
                </span>
                <a
                  href={corporateProfile.documentUrl}
                  download={corporateProfile.downloadFilename}
                  className="text-[#00C2C7] hover:underline font-mono"
                >
                  {corporateProfile.downloadFilename}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Accessible HTML Overview of Corporate Profile Content Highlights (All 18 Sections) */}
        <section
          aria-labelledby="profile-contents-heading"
          className="py-16 lg:py-20 bg-[#111827] border-b border-slate-800/80"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mb-10">
              <span className="text-xs font-mono uppercase tracking-wider text-[#00C2C7]">
                Document Structure &amp; Accessible Summary
              </span>
              <h2 id="profile-contents-heading" className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                Corporate Profile Content Highlights
              </h2>
              <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                A structured overview of the {CORPORATE_PROFILE_HIGHLIGHTS.length} corporate,
                governance, architectural, and operational sections covered in the official{' '}
                {corporateProfile.companyName} Corporate Profile.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {CORPORATE_PROFILE_HIGHLIGHTS.map((item) => (
                <article
                  key={item.number}
                  className="p-5 rounded-xl bg-[#0B1F3B]/60 border border-slate-800 hover:border-[#00C2C7]/40 transition-colors"
                >
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[#00C2C7]/15 border border-[#00C2C7]/40 text-[11px] font-mono font-bold text-[#00C2C7] shrink-0">
                      {item.number}
                    </span>
                    <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{item.summary}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Official Corporate Contact & Consultation CTA Band */}
        <section aria-labelledby="profile-contact-heading" className="py-16 bg-[#0B1F3B]/55">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl bg-[#111827] border border-slate-700/80 p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-4">
                <span className="text-xs font-mono uppercase tracking-wider text-[#D4AF37]">
                  Official Corporate Communications
                </span>
                <h2 id="profile-contact-heading" className="text-2xl sm:text-3xl font-extrabold text-white">
                  Engage With {corporateIdentity.legalName}
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed">
                  All enterprise technology solutions are customized following an initial executive
                  or technical consultation and formal scope assessment. Connect directly with our
                  team to discuss your organization&apos;s objectives.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Link
                    to={ROUTES.CONSULTATION}
                    className="inline-flex items-center gap-2 px-6 py-3 text-sm font-bold text-[#111827] bg-[#00C2C7] hover:bg-[#00d6dc] rounded-lg shadow-lg shadow-[#00C2C7]/20 transition-all"
                  >
                    <span>Request an Enterprise Consultation</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                  <a
                    href={corporateProfile.documentUrl}
                    download={corporateProfile.downloadFilename}
                    className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-all"
                  >
                    <Download className="w-4 h-4 text-[#00C2C7]" />
                    <span>Download Corporate Profile</span>
                  </a>
                </div>
              </div>

              <div className="lg:col-span-5 p-5 rounded-xl bg-[#0B1F3B]/85 border border-slate-800 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <span className="font-mono text-[#00C2C7] uppercase">Verified Contact Details</span>
                  <Building className="w-4 h-4 text-[#D4AF37]" />
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400 font-mono">Company</span>
                    <span className="font-semibold text-white text-right">{corporateIdentity.legalName}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400 font-mono">Network</span>
                    <span className="font-semibold text-[#00C2C7] font-mono text-right">
                      {corporateIdentity.networkName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400 font-mono">Telephone</span>
                    <a
                      href={corporateIdentity.contact.telephone.href}
                      className="inline-flex items-center gap-1.5 font-semibold text-[#00C2C7] font-mono hover:underline"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{corporateIdentity.contact.telephone.display}</span>
                    </a>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400 font-mono">Email</span>
                    <a
                      href={`mailto:${corporateIdentity.contact.email}`}
                      className="inline-flex items-center gap-1.5 font-semibold text-[#00C2C7] font-mono hover:underline"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>{corporateIdentity.contact.email}</span>
                    </a>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400 font-mono">Website</span>
                    <a
                      href={corporateIdentity.contact.website}
                      className="inline-flex items-center gap-1.5 text-slate-200 hover:text-[#00C2C7] font-mono"
                    >
                      <Globe className="w-3.5 h-3.5 text-[#00C2C7]" />
                      <span>{corporateIdentity.contact.website}</span>
                    </a>
                  </div>
                  <div className="pt-2 border-t border-slate-800 space-y-1">
                    <span className="text-slate-400 font-mono block">Corporate Address</span>
                    <p className="text-slate-200 leading-relaxed">
                      SUITE 6082 - 30 N Gould St #6082
                      <br />
                      Sheridan, Sheridan County
                      <br />
                      WY 82801, United States of America
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

export default CorporateProfilePage;
