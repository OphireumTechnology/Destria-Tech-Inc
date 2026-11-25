import React, { useEffect } from 'react';
import { BrandLogo } from '../components/BrandLogo';
import { PortalAuthProvider, usePortalAuth } from './PortalAuthContext';
import { PortalRouterProvider, usePortalRouter } from './PortalRouter';
import {
  PortalForgotPasswordPage,
  PortalLoginPage,
  PortalRegisterPage,
  PortalVerifyEmailPage,
} from './pages/AuthPages';
import { PortalDashboardPage } from './pages/DashboardPage';
import {
  PortalMyServicesPage,
  PortalProductDetailPage,
  PortalStorePage,
} from './pages/StorePages';
import { PortalCartPage, PortalCheckoutPage } from './pages/CartAndCheckoutPages';
import {
  PortalCreditsPage,
  PortalInvoicesPage,
  PortalOrderDetailPage,
  PortalOrdersPage,
  PortalPaymentsPage,
  PortalSubscriptionsPage,
} from './pages/OrdersAndFinancePages';
import {
  PortalFilesPage,
  PortalMessagesPage,
  PortalProjectDetailPage,
  PortalProjectsPage,
} from './pages/ProjectsAndFilesPages';
import {
  PortalNotificationsPage,
  PortalProfilePage,
  PortalSecurityPage,
  PortalSettingsPage,
  PortalSupportPage,
} from './pages/SupportAccountPages';

const PUBLIC_PORTAL_ROUTES = new Set([
  '/portal/login',
  '/portal/register',
  '/portal/forgot-password',
  '/portal/reset-password',
  '/portal/verify-email',
]);

function decodeRouteId(value: string): string | null {
  try { const decoded = decodeURIComponent(value); return decoded && !decoded.includes('/') ? decoded : null; }
  catch { return null; }
}

const PortalNotFound: React.FC = () => {
  const { navigate } = usePortalRouter();
  return <main className="p-8 text-center"><h1>Portal page not found</h1><button onClick={() => navigate('/portal/dashboard')}>Return to dashboard</button></main>;
};

const PortalRouteSwitch: React.FC = () => {
  const { loading, user } = usePortalAuth();
  const { path, navigate } = usePortalRouter();

  const normalized = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  const isPublic = PUBLIC_PORTAL_ROUTES.has(normalized);

  useEffect(() => {
    if (loading) return;
    if (normalized === '/portal') {
      navigate(user ? '/portal/dashboard' : '/portal/login', { replace: true });
      return;
    }
    if (!isPublic && !user) {
      navigate(`/portal/login?next=${encodeURIComponent(normalized)}`, { replace: true });
      return;
    }
    if ((normalized === '/portal/login' || normalized === '/portal/register') && user) {
      navigate('/portal/dashboard', { replace: true });
    }
  }, [loading, user, normalized, isPublic, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] text-[#0B1F3B] flex items-center justify-center p-6">
        <div className="text-center space-y-3 flex flex-col items-center">
          <BrandLogo variant="emblem" size="lg" ring="gold" eager />
          <div className="w-6 h-6 rounded-full border-2 border-[#00C2C7] border-t-transparent animate-spin" />
          <p className="text-xs font-medium text-[#64748B]">Loading DESTRIA TECH INC Client Portal...</p>
        </div>
      </div>
    );
  }

  // Public auth views
  if (normalized === '/portal/login') return <PortalLoginPage />;
  if (normalized === '/portal/register') return <PortalRegisterPage />;
  if (normalized === '/portal/forgot-password' || normalized === '/portal/reset-password') return <PortalForgotPasswordPage />;
  if (normalized === '/portal/verify-email') return <PortalVerifyEmailPage />;

  if (!user) return null;

  // Protected client routes
  if (normalized === '/portal/dashboard') return <PortalDashboardPage />;
  if (normalized === '/portal/services') return <PortalMyServicesPage />;
  if (normalized === '/portal/store') return <PortalStorePage />;
  if (normalized.startsWith('/portal/store/')) {
    const slug = decodeRouteId(normalized.slice('/portal/store/'.length));
    if (!slug) return <PortalNotFound />;
    return <PortalProductDetailPage slug={slug} />;
  }
  if (normalized === '/portal/cart') return <PortalCartPage />;
  if (normalized === '/portal/checkout') return <PortalCheckoutPage />;
  if (normalized === '/portal/orders') return <PortalOrdersPage />;
  if (normalized.startsWith('/portal/orders/')) {
    const orderId = decodeRouteId(normalized.slice('/portal/orders/'.length));
    if (!orderId) return <PortalNotFound />;
    return <PortalOrderDetailPage orderId={orderId} />;
  }
  if (normalized === '/portal/projects') return <PortalProjectsPage />;
  if (normalized.startsWith('/portal/projects/')) {
    const projectId = decodeRouteId(normalized.slice('/portal/projects/'.length));
    if (!projectId) return <PortalNotFound />;
    return <PortalProjectDetailPage projectId={projectId} />;
  }
  if (normalized === '/portal/messages') return <PortalMessagesPage />;
  if (normalized === '/portal/credits') return <PortalCreditsPage />;
  if (normalized === '/portal/subscriptions') return <PortalSubscriptionsPage />;
  if (normalized === '/portal/invoices') return <PortalInvoicesPage />;
  if (normalized === '/portal/payments') return <PortalPaymentsPage />;
  if (normalized === '/portal/files') return <PortalFilesPage />;
  if (normalized === '/portal/support') return <PortalSupportPage />;
  if (normalized === '/portal/notifications') return <PortalNotificationsPage />;
  if (normalized === '/portal/profile') return <PortalProfilePage />;
  if (normalized === '/portal/security') return <PortalSecurityPage />;
  if (normalized === '/portal/settings') return <PortalSettingsPage />;

  return <PortalNotFound />;
};

export const ClientPortalApp: React.FC = () => {
  return (
    <PortalRouterProvider>
      <PortalAuthProvider>
        <PortalRouteSwitch />
      </PortalAuthProvider>
    </PortalRouterProvider>
  );
};

export default ClientPortalApp;
