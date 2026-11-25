import React, { useCallback } from 'react';
import { ROUTES, resolveSafePostLoginPath as resolveSafePortalNext } from '../../config/routes';
import { usePortalAuth } from '../PortalAuthContext';
import { usePortalRouter } from '../PortalRouter';
import { ClientPortalLoginLayout } from './ClientPortalLoginLayout';
import { ClientPortalLoginForm } from './ClientPortalLoginForm';

export function resolveSafePostLoginPath(nextPath: string | null): string {
  return resolveSafePortalNext(nextPath);
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
      e.preventDefault();
      exitToPublicSite();
    },
    [exitToPublicSite]
  );

  return (
    <ClientPortalLoginLayout onReturnToWebsite={handleReturnToWebsite}>
      <ClientPortalLoginForm
        onAuthenticate={handleAuthenticate}
        onNavigateForgotPassword={() => navigate(ROUTES.PORTAL.FORGOT_PASSWORD)}
        onNavigateRegister={() => navigate(ROUTES.PORTAL.REGISTER)}
        initialNotice={sessionExpiredNotice}
      />
    </ClientPortalLoginLayout>
  );
};

export default ClientPortalLoginPage;
