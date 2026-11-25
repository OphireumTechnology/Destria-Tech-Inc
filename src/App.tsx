import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { AboutSection } from './components/AboutSection';
import { ServicesSection } from './components/ServicesSection';
import { PortfolioSection } from './components/PortfolioSection';
import { EnterpriseSuiteSection } from './components/EnterpriseSuiteSection';
import { ContactSection } from './components/ContactSection';
import { EnterpriseModal } from './components/EnterpriseModal';
import { LegalGovernanceModal } from './components/LegalGovernanceModal';
import { NotFoundPage } from './components/NotFoundPage';
import { AIConsultantWidget } from './components/consultant/AIConsultantWidget';
import { Footer } from './components/Footer';
import { BrandLogo } from './components/BrandLogo';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  GOVERNANCE_PATH_TO_SECTION_ID,
  GOVERNANCE_STATIC_ROUTES,
  PUBLIC_STATIC_ROUTES,
  ROUTES,
  buildGovernanceRoute,
  getRouteSeoMeta,
  migrateLegacyHashUrlBeforeBoot,
  normalizeRoutePathname,
  publicRouteToSectionId,
  sectionIdToPublicRoute,
} from './config/routes';

const ClientPortalApp = lazy(() => import('./portal/ClientPortalApp'));
const AdminPortalApp = lazy(() => import('./admin/AdminPortalApp'));

const RouteLoaderFallback: React.FC<{ label: string }> = ({ label }) => (
  <div className="min-h-screen bg-[#F3F4F6] text-[#0B1F3B] flex items-center justify-center p-6">
    <div className="text-center space-y-3 flex flex-col items-center">
      <BrandLogo variant="emblem" size="lg" ring="gold" eager />
      <div className="w-6 h-6 rounded-full border-2 border-[#00C2C7] border-t-transparent animate-spin" />
      <p className="text-xs font-medium text-[#64748B]">{label}</p>
    </div>
  </div>
);

/**
 * Synchronizes document title, meta description, canonical link, and og:url
 * for every active clean route without exposing private routes to search indexing.
 */
function useRouteSeoSync() {
  const location = useLocation();

  useEffect(() => {
    const meta = getRouteSeoMeta(location.pathname);
    document.title = meta.title;

    const descEl = document.querySelector('meta[name="description"]');
    if (descEl) descEl.setAttribute('content', meta.description);

    const canonicalEl = document.querySelector('link[rel="canonical"]');
    if (canonicalEl) canonicalEl.setAttribute('href', meta.canonicalUrl);

    const ogUrlEl = document.querySelector('meta[property="og:url"]');
    if (ogUrlEl) ogUrlEl.setAttribute('content', meta.canonicalUrl);
  }, [location.pathname]);
}

const PublicCorporateView: React.FC<{
  initialGovernanceSectionId?: string;
}> = ({ initialGovernanceSectionId }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const normalizedPath = normalizeRoutePathname(location.pathname);
  const governanceSectionFromRoute =
    initialGovernanceSectionId ?? GOVERNANCE_PATH_TO_SECTION_ID[normalizedPath];

  const [activeSection, setActiveSection] = useState<string>(
    () => publicRouteToSectionId(normalizedPath) || 'hero'
  );
  const [isEnterpriseModalOpen, setIsEnterpriseModalOpen] = useState(false);
  const [enterpriseModalTab, setEnterpriseModalTab] = useState<'portal' | 'studio' | 'agents' | 'admin'>('portal');
  const [selectedServiceIdForInquiry, setSelectedServiceIdForInquiry] = useState<string>('multimedia-production');
  const [consultantOpenRequest, setConsultantOpenRequest] = useState<{
    nonce: number;
    initialPrompt?: string;
  } | null>(null);

  const isGovernanceModalOpen = Boolean(governanceSectionFromRoute);

  // Scroll smoothly to target section when navigating to a clean public corporate route
  useEffect(() => {
    const targetSection = publicRouteToSectionId(normalizedPath);
    if (!targetSection) return;
    setActiveSection(targetSection);

    if (targetSection === 'hero') {
      if (window.scrollY > 0) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    const timer = window.setTimeout(() => {
      const el = document.getElementById(targetSection);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }, 40);
    return () => window.clearTimeout(timer);
  }, [normalizedPath]);

  // Update active nav highlight on scroll
  useEffect(() => {
    const handleScroll = () => {
      const sections = ['hero', 'about', 'services', 'portfolio', 'architecture', 'contact'];
      const scrollY = window.scrollY;

      for (const section of sections) {
        const el = document.getElementById(section);
        if (el) {
          const top = el.offsetTop - 120;
          const height = el.offsetHeight;
          if (scrollY >= top && scrollY < top + height) {
            setActiveSection(section);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Clean URL navigation for all public sections
  const handleNavigate = useCallback(
    (sectionId: string) => {
      const targetRoute = sectionIdToPublicRoute(sectionId);
      setActiveSection(sectionId);
      if (normalizeRoutePathname(location.pathname) !== targetRoute) {
        navigate(targetRoute);
      } else if (sectionId === 'hero') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }
    },
    [location.pathname, navigate]
  );

  const handleOpenEnterpriseModal = useCallback(
    (tab: 'portal' | 'studio' | 'agents' | 'admin' = 'portal') => {
      setEnterpriseModalTab(tab);
      setIsEnterpriseModalOpen(true);
    },
    []
  );

  // Navigate to clean canonical governance URL (e.g. /privacy-policy, /terms-of-service)
  const handleOpenLegalModal = useCallback(
    (sectionId?: string) => {
      navigate(buildGovernanceRoute(sectionId));
    },
    [navigate]
  );

  const handleCloseLegalModal = useCallback(() => {
    navigate(ROUTES.HOME);
  }, [navigate]);

  const handleSelectServiceForInquiry = useCallback(
    (serviceId: string) => {
      setSelectedServiceIdForInquiry(serviceId);
      handleNavigate('contact');
    },
    [handleNavigate]
  );

  const handleOpenAIConsultant = useCallback((initialPrompt?: string) => {
    setConsultantOpenRequest({
      nonce: Date.now(),
      initialPrompt,
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#111827] text-slate-100 flex flex-col overflow-x-clip selection:bg-[#00C2C7]/20 selection:text-[#00C2C7]">
      {/* Sticky Top Bar Contract */}
      <Header
        onOpenPortal={() => handleOpenEnterpriseModal('portal')}
        onNavigate={handleNavigate}
        activeSection={activeSection}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {/* Homepage Hero */}
        <Hero
          onNavigate={handleNavigate}
          onOpenPortal={() => handleOpenEnterpriseModal('portal')}
        />

        {/* Company Profile & Governance */}
        <AboutSection
          onOpenPortal={() => handleOpenEnterpriseModal('portal')}
        />

        {/* Customized Enterprise Technology Solutions Directory */}
        <ServicesSection
          onSelectServiceForInquiry={handleSelectServiceForInquiry}
          onOpenAIConsultant={handleOpenAIConsultant}
        />

        {/* Portfolio & Architectural Blueprints */}
        <PortfolioSection />

        {/* The 8 Enterprise Pillars Ecosystem */}
        <EnterpriseSuiteSection
          onOpenPortalTab={handleOpenEnterpriseModal}
        />

        {/* Enterprise Consultation & Service Inquiry Form */}
        <ContactSection
          selectedServiceId={selectedServiceIdForInquiry}
          onOpenLegal={handleOpenLegalModal}
        />
      </main>

      {/* Enterprise Suite Workspace Modal (Portal, Studio, Agents, Admin) */}
      <EnterpriseModal
        isOpen={isEnterpriseModalOpen}
        onClose={() => setIsEnterpriseModalOpen(false)}
        defaultTab={enterpriseModalTab}
      />

      {/* Legal & Corporate Governance Modal (backed by canonical governance clean URLs) */}
      <LegalGovernanceModal
        isOpen={isGovernanceModalOpen}
        initialSectionId={governanceSectionFromRoute}
        onSelectSection={(sectionId) => navigate(buildGovernanceRoute(sectionId), { replace: true })}
        onClose={handleCloseLegalModal}
      />

      {/* Corporate Footer */}
      <Footer
        onNavigate={handleNavigate}
        onOpenPortal={() => handleOpenEnterpriseModal('portal')}
        onOpenLegal={handleOpenLegalModal}
      />

      {/* AI Corporate Solutions Consultant Floating Assistant & Booking System */}
      <AIConsultantWidget externalOpenRequest={consultantOpenRequest} />
    </div>
  );
};

export default function App() {
  const navigate = useNavigate();
  useRouteSeoSync();

  // Runtime safeguard: if a user navigates to a legacy hash URL while the app is open,
  // convert it cleanly via history replacement without redirect loops.
  useEffect(() => {
    const handleHashMigration = () => {
      if (migrateLegacyHashUrlBeforeBoot()) {
        navigate(`${window.location.pathname}${window.location.search}`, { replace: true });
      }
    };
    window.addEventListener('hashchange', handleHashMigration);
    return () => window.removeEventListener('hashchange', handleHashMigration);
  }, [navigate]);

  return (
    <ErrorBoundary>
      <Routes>
        {/* Public Corporate Website Canonical Clean Routes */}
        {PUBLIC_STATIC_ROUTES.map((routePath) => (
          <Route key={routePath} path={routePath} element={<PublicCorporateView />} />
        ))}

        {/* Corporate Governance & Policy Canonical Clean Routes */}
        {GOVERNANCE_STATIC_ROUTES.map((routePath) => (
          <Route
            key={routePath}
            path={routePath}
            element={
              <PublicCorporateView
                initialGovernanceSectionId={GOVERNANCE_PATH_TO_SECTION_ID[routePath]}
              />
            }
          />
        ))}

        {/* Client Portal (Clean Nested History Routing) */}
        <Route
          path={`${ROUTES.PORTAL.ROOT}/*`}
          element={
            <Suspense fallback={<RouteLoaderFallback label="Loading DESTRIA TECH INC Client Portal..." />}>
              <ClientPortalApp />
            </Suspense>
          }
        />

        {/* Executive Administration Portal (RBAC-Protected Clean History Routing) */}
        <Route
          path={`${ROUTES.ADMIN.ROOT}/*`}
          element={
            <Suspense fallback={<RouteLoaderFallback label="Loading DESTRIA TECH INC Executive Console..." />}>
              <AdminPortalApp />
            </Suspense>
          }
        />

        {/* Unknown Route Fallback (Zero Blank Screens) */}
        <Route path="*" element={<NotFoundPage scope="public" />} />
      </Routes>
    </ErrorBoundary>
  );
}
