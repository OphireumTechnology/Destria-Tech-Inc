import React, { useCallback } from 'react';
import { usePortalAuth } from '../PortalAuthContext';
import { usePortalRouter } from '../PortalRouter';
import { ClientPortalLoginLayout } from './ClientPortalLoginLayout';
import { ClientPortalLoginForm } from './ClientPortalLoginForm';

export function resolveSafePostLoginPath(nextPath: string | null): string {
  if (
    nextPath &&
    nextPath.startsWith('/portal/') &&
    !nextPath.startsWith('//') &&
    !nextPath.includes('://') &&
    !nextPath.startsWith('/portal/login')
  ) {
    return nextPath;
  }
  return '/portal/dashboard';
}

export const ClientPortalLoginPage: React.FC = () => {
  const { login } = usePortalAuth();
  const { navigate, query, exitToPublicSite } = usePortalRouter();

  const safeNext = resolveSafePostLoginPath(query.get('next'));
  const sessionExpiredNotice =
    query.get('reason') === 'session_expired'
      ? 'Your session has expired. Please sign in again.'
      : '';

  const handleAuthenticate = useCallback(
    async (email: string, password: string) => {
      await login(email, password);
      navigate(safeNext, { replace: true });
    },
    [login, navigate, safeNext]
  );

  const handleReturnToWebsite = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (typeof window === 'undefined') return;
      const host = window.location.hostname;
      const isProductionDomain = host === 'destriatech.com' || host === 'www.destriatech.com';
      // On non-production preview/dev hosts, keep the user inside the active workspace SPA;
      // on production destriatech.com, allow direct navigation to https://destriatech.com/.
      if (!isProductionDomain) {
        e.preventDefault();
        exitToPublicSite();
      }
    },
    [exitToPublicSite]
  );

  return (
    <ClientPortalLoginLayout onReturnToWebsite={handleReturnToWebsite}>
      <ClientPortalLoginForm
        onAuthenticate={handleAuthenticate}
        onNavigateForgotPassword={() => navigate('/portal/forgot-password')}
        onNavigateRegister={() => navigate('/portal/register')}
        initialNotice={sessionExpiredNotice}
      />
    </ClientPortalLoginLayout>
  );
};

export default ClientPortalLoginPage;
