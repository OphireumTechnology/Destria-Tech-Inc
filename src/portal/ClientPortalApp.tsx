import React from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { NotFoundPage } from '../components/NotFoundPage';
import { ROUTES, buildLoginWithNextRoute } from '../config/routes';
import { PortalAuthProvider, usePortalAuth } from './PortalAuthContext';
import { PortalRouterProvider } from './PortalRouter';
import {
  PortalForgotPasswordPage,
  PortalLoginPage,
  PortalRegisterPage,
  PortalResetPasswordPage,
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
import { PortalFrontDeskInquiriesPage } from './pages/FrontDeskInquiriesPage';

const PortalLoadingScreen: React.FC = () => (
  <div className="min-h-screen bg-[#F3F4F6] text-[#0B1F3B] flex items-center justify-center p-6">
    <div className="text-center space-y-3 flex flex-col items-center">
      <BrandLogo variant="emblem" size="lg" ring="gold" eager />
      <div className="w-6 h-6 rounded-full border-2 border-[#00C2C7] border-t-transparent animate-spin" />
      <p className="text-xs font-medium text-[#64748B]">Loading DESTRIA TECH INC Client Portal...</p>
    </div>
  </div>
);

const ProtectedPortalRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading, user } = usePortalAuth();
  const location = useLocation();

  if (loading) return <PortalLoadingScreen />;
  if (!user) {
    const requested = `${location.pathname}${location.search}`;
    return <Navigate to={buildLoginWithNextRoute(requested)} replace />;
  }
  return <>{children}</>;
};

const GuestOnlyPortalRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading, user } = usePortalAuth();
  if (loading) return <PortalLoadingScreen />;
  if (user) {
    return <Navigate to={ROUTES.PORTAL.DASHBOARD} replace />;
  }
  return <>{children}</>;
};

const PortalStoreDetailRoute: React.FC = () => {
  const { slug = '' } = useParams<{ slug: string }>();
  return <PortalProductDetailPage slug={decodeURIComponent(slug)} />;
};

const PortalOrderDetailRoute: React.FC = () => {
  const { orderId = '' } = useParams<{ orderId: string }>();
  return <PortalOrderDetailPage orderId={decodeURIComponent(orderId)} />;
};

const PortalProjectDetailRoute: React.FC = () => {
  const { projectId = '' } = useParams<{ projectId: string }>();
  return <PortalProjectDetailPage projectId={decodeURIComponent(projectId)} />;
};

const PortalRootRedirect: React.FC = () => {
  const { loading, user } = usePortalAuth();
  if (loading) return <PortalLoadingScreen />;
  return <Navigate to={user ? ROUTES.PORTAL.DASHBOARD : ROUTES.PORTAL.LOGIN} replace />;
};

const PortalRouteSwitch: React.FC = () => {
  return (
    <Routes>
      <Route index element={<PortalRootRedirect />} />

      {/* Public authentication & account recovery routes */}
      <Route
        path="login"
        element={
          <GuestOnlyPortalRoute>
            <PortalLoginPage />
          </GuestOnlyPortalRoute>
        }
      />
      <Route
        path="register"
        element={
          <GuestOnlyPortalRoute>
            <PortalRegisterPage />
          </GuestOnlyPortalRoute>
        }
      />
      <Route path="forgot-password" element={<PortalForgotPasswordPage />} />
      <Route path="reset-password" element={<PortalResetPasswordPage />} />
      <Route path="verify-email" element={<PortalVerifyEmailPage />} />

      {/* Protected enterprise client routes */}
      <Route
        path="dashboard"
        element={
          <ProtectedPortalRoute>
            <PortalDashboardPage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="services"
        element={
          <ProtectedPortalRoute>
            <PortalMyServicesPage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="store"
        element={
          <ProtectedPortalRoute>
            <PortalStorePage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="store/:slug"
        element={
          <ProtectedPortalRoute>
            <PortalStoreDetailRoute />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="cart"
        element={
          <ProtectedPortalRoute>
            <PortalCartPage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="proposals"
        element={
          <ProtectedPortalRoute>
            <PortalCartPage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="inquiries"
        element={
          <ProtectedPortalRoute>
            <PortalFrontDeskInquiriesPage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="checkout"
        element={
          <ProtectedPortalRoute>
            <PortalCheckoutPage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="orders"
        element={
          <ProtectedPortalRoute>
            <PortalOrdersPage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="orders/:orderId"
        element={
          <ProtectedPortalRoute>
            <PortalOrderDetailRoute />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="projects"
        element={
          <ProtectedPortalRoute>
            <PortalProjectsPage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="projects/:projectId"
        element={
          <ProtectedPortalRoute>
            <PortalProjectDetailRoute />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="messages"
        element={
          <ProtectedPortalRoute>
            <PortalMessagesPage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="credits"
        element={
          <ProtectedPortalRoute>
            <PortalCreditsPage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="subscriptions"
        element={
          <ProtectedPortalRoute>
            <PortalSubscriptionsPage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="invoices"
        element={
          <ProtectedPortalRoute>
            <PortalInvoicesPage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="payments"
        element={
          <ProtectedPortalRoute>
            <PortalPaymentsPage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="files"
        element={
          <ProtectedPortalRoute>
            <PortalFilesPage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="deliverables"
        element={
          <ProtectedPortalRoute>
            <PortalFilesPage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="documents"
        element={
          <ProtectedPortalRoute>
            <PortalFilesPage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="support"
        element={
          <ProtectedPortalRoute>
            <PortalSupportPage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="notifications"
        element={
          <ProtectedPortalRoute>
            <PortalNotificationsPage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="profile"
        element={
          <ProtectedPortalRoute>
            <PortalProfilePage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="security"
        element={
          <ProtectedPortalRoute>
            <PortalSecurityPage />
          </ProtectedPortalRoute>
        }
      />
      <Route
        path="settings"
        element={
          <ProtectedPortalRoute>
            <PortalSettingsPage />
          </ProtectedPortalRoute>
        }
      />

      <Route path="*" element={<NotFoundPage scope="portal" />} />
    </Routes>
  );
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
