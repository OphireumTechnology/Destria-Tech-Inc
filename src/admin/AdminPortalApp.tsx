import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Bell,
  Calendar,
  ExternalLink,
  FileCheck,
  LayoutDashboard,
  Lock,
  LogOut,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { NotFoundPage } from '../components/NotFoundPage';
import { corporateIdentity } from '../data/companyConfig';
import { apiUrl } from '../lib/apiClient';
import {
  ROUTES,
  buildAdminLoginWithNextRoute,
  resolveSafePostAdminLoginPath,
} from '../config/routes';

interface AdminProfile {
  email: string;
  role: string;
}

const ADMIN_TOKEN_KEY = 'opm_admin_token';

function readStoredAdminToken(): string {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export const AdminPortalApp: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [adminToken, setAdminToken] = useState<string>(readStoredAdminToken);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [checkingSession, setCheckingSession] = useState<boolean>(Boolean(readStoredAdminToken()));
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const [solutionRequests, setSolutionRequests] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [systemHealth, setSystemHealth] = useState<any | null>(null);
  const [dashboardSubTab, setDashboardSubTab] = useState<'requests' | 'notifications' | 'health'>('requests');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryFeedback, setRetryFeedback] = useState<string | null>(null);
  const [adminDataError, setAdminDataError] = useState<string | null>(null);
  const [isLoadingAdminData, setIsLoadingAdminData] = useState(false);

  const loadAuthorizedAdminData = useCallback(async (tokenToUse: string) => {
    if (!tokenToUse) {
      setAdminProfile(null);
      setCheckingSession(false);
      return false;
    }

    setIsLoadingAdminData(true);
    setAdminDataError(null);

    try {
      const headers = { Authorization: `Bearer ${tokenToUse}` };
      const sessionRes = await fetch(apiUrl('/api/admin/auth/session'), { headers });
      if (!sessionRes.ok) {
        const errData = await sessionRes.json().catch(() => ({}));
        setAdminToken('');
        setAdminProfile(null);
        try {
          sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        } catch {}
        setAuthError(errData.error || 'Administrator session expired. Please sign in again.');
        return false;
      }

      const sessionJson = await sessionRes.json();
      setAdminProfile(sessionJson.admin || null);

      const [reqRes, aptRes, auditRes, notifRes, healthRes] = await Promise.all([
        fetch(apiUrl('/api/admin/solution-requests?limit=25&offset=0'), { headers }),
        fetch(apiUrl('/api/admin/appointments?limit=25&offset=0'), { headers }),
        fetch(apiUrl('/api/admin/audit-logs?limit=25&offset=0'), { headers }),
        fetch(apiUrl('/api/admin/notifications?limit=50&offset=0'), { headers }),
        fetch(apiUrl('/api/admin/system-health'), { headers }),
      ]);

      const reqJson = await reqRes.json().catch(() => ({}));
      const aptJson = await aptRes.json().catch(() => ({}));
      const auditJson = await auditRes.json().catch(() => ({}));
      const notifJson = await notifRes.json().catch(() => ({}));
      const healthJson = await healthRes.json().catch(() => ({}));

      if (!reqRes.ok || !aptRes.ok) {
        setAdminDataError(
          reqJson.error || aptJson.error || 'Database persistence unavailable or not configured.'
        );
      } else {
        setSolutionRequests(Array.isArray(reqJson.records) ? reqJson.records : []);
        setAppointments(Array.isArray(aptJson.records) ? aptJson.records : []);
        setAuditLogs(Array.isArray(auditJson.records) ? auditJson.records : []);
        setNotifications(Array.isArray(notifJson.records) ? notifJson.records : []);
        if (healthRes.ok && healthJson.success) {
          setSystemHealth(healthJson);
        }
      }
      return true;
    } catch {
      setAdminDataError('Unable to connect to the authorized admin API endpoints.');
      return false;
    } finally {
      setIsLoadingAdminData(false);
      setCheckingSession(false);
    }
  }, []);

  const handleRetryNotification = async (outboxId: string) => {
    if (!adminToken || retryingId) return;
    setRetryingId(outboxId);
    setRetryFeedback(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/notifications/${encodeURIComponent(outboxId)}/retry`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setRetryFeedback(data.error || 'Notification retry could not be completed.');
      } else {
        setRetryFeedback(`Notification retry executed (status: ${data.status}).`);
        await loadAuthorizedAdminData(adminToken);
      }
    } catch {
      setRetryFeedback('Network error while attempting notification retry.');
    } finally {
      setRetryingId(null);
    }
  };

  useEffect(() => {
    if (adminToken) {
      void loadAuthorizedAdminData(adminToken);
    } else {
      setCheckingSession(false);
    }
  }, [adminToken, loadAuthorizedAdminData]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAuthenticating) return;
    setAuthError(null);
    setIsAuthenticating(true);
    try {
      const res = await fetch(apiUrl('/api/admin/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.token) {
        throw new Error(data.error || 'Administrator authentication failed.');
      }

      setAdminToken(data.token);
      setAdminProfile(data.admin || null);
      setLoginPassword('');
      try {
        sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      } catch {}

      const verified = await loadAuthorizedAdminData(data.token);
      if (verified) {
        const nextTarget = resolveSafePostAdminLoginPath(searchParams.get('next'));
        navigate(nextTarget, { replace: true });
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Unable to verify administrator credentials.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleAdminLogout = () => {
    setAdminToken('');
    setAdminProfile(null);
    setSolutionRequests([]);
    setAppointments([]);
    setAuditLogs([]);
    setNotifications([]);
    setSystemHealth(null);
    setRetryFeedback(null);
    setAdminDataError(null);
    try {
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch {}
    navigate(ROUTES.ADMIN.LOGIN, { replace: true });
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#0B1220] text-slate-100 flex items-center justify-center p-6">
        <div className="text-center space-y-3 flex flex-col items-center">
          <BrandLogo variant="emblem" size="lg" ring="brand" eager />
          <div className="w-6 h-6 rounded-full border-2 border-[#00C2C7] border-t-transparent animate-spin" />
          <p className="text-xs font-mono text-slate-400">Verifying Administrator RBAC Session...</p>
        </div>
      </div>
    );
  }

  const renderLoginView = () => {
    if (adminProfile) {
      return <Navigate to={resolveSafePostAdminLoginPath(searchParams.get('next'))} replace />;
    }

    return (
      <div className="min-h-screen bg-[#0B1220] text-slate-100 flex flex-col">
        <header className="border-b border-slate-800 bg-[#0B1F3B]/95 px-5 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
            <Link to={ROUTES.HOME} className="inline-flex items-center gap-2 text-xs text-slate-300 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Corporate Website</span>
            </Link>
            <span className="text-[11px] font-mono text-[#00C2C7] uppercase tracking-wider">
              RBAC Protected Administration
            </span>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-5">
          <div className="w-full max-w-md rounded-2xl bg-[#111827] border border-slate-800 p-7 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <BrandLogo variant="emblem" size="md" ring="brand" eager decorative />
              <div>
                <h1 className="text-base font-bold text-white">{corporateIdentity.legalName}</h1>
                <p className="text-[11px] font-mono text-[#00C2C7] uppercase">
                  Executive Administration Sign In
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-[#00C2C7] shrink-0 mt-0.5" />
              <span>
                Authorized administrators only. All administrative endpoints enforce server-side RBAC verification.
              </span>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label htmlFor="admin-route-email" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Administrator Email
                </label>
                <input
                  id="admin-route-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="admin@destriatech.com"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-[#00C2C7]"
                />
              </div>

              <div>
                <label htmlFor="admin-route-password" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Password
                </label>
                <input
                  id="admin-route-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-[#00C2C7]"
                />
              </div>

              {authError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/40 text-xs text-rose-300 flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isAuthenticating}
                className="w-full py-2.5 px-4 rounded-lg bg-[#00C2C7] hover:bg-[#00d6dc] disabled:opacity-50 text-[#0B1220] text-sm font-bold cursor-pointer transition-colors"
              >
                {isAuthenticating ? 'Verifying Credentials...' : 'Sign In as Administrator'}
              </button>
            </form>

            <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <Link to={ROUTES.PORTAL.LOGIN} className="hover:text-[#00C2C7] transition-colors">
                Client Portal Sign In
              </Link>
              <Link to={ROUTES.HOME} className="hover:text-white transition-colors">
                Public Website
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  };

  const renderProtectedConsole = (activeSection: 'inquiries' | 'appointments' | 'audit') => {
    if (!adminProfile) {
      return <Navigate to={buildAdminLoginWithNextRoute(location.pathname)} replace />;
    }

    return (
      <div className="min-h-screen bg-[#0B1220] text-slate-100 flex flex-col">
        <header className="border-b border-slate-800 bg-[#0B1F3B] px-5 py-4">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <BrandLogo variant="emblem" size="sm" ring="brand" eager decorative />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white uppercase tracking-wide">
                    {corporateIdentity.legalName} — Executive Console
                  </span>
                  <span className="text-[10px] font-mono text-[#00C2C7] bg-[#00C2C7]/10 px-2 py-0.5 rounded border border-[#00C2C7]/30">
                    RBAC VERIFIED
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono">
                  {adminProfile.email} · Role: {adminProfile.role}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Link
                to={ROUTES.HOME}
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:text-white hover:border-[#00C2C7]/50 transition-colors"
              >
                Corporate Website
              </Link>
              <button
                type="button"
                onClick={handleAdminLogout}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-5 py-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav className="flex flex-wrap items-center gap-2" aria-label="Administrator navigation">
              <Link
                to={ROUTES.ADMIN.DASHBOARD}
                className={`px-3.5 py-2 rounded-lg text-xs font-mono flex items-center gap-1.5 ${
                  activeSection === 'inquiries'
                    ? 'bg-[#00C2C7] text-[#0B1220] font-bold'
                    : 'bg-slate-900 text-slate-300 border border-slate-800 hover:text-white'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Solution Requests ({solutionRequests.length})</span>
              </Link>

              <Link
                to={ROUTES.ADMIN.APPOINTMENTS}
                className={`px-3.5 py-2 rounded-lg text-xs font-mono flex items-center gap-1.5 ${
                  activeSection === 'appointments'
                    ? 'bg-[#00C2C7] text-[#0B1220] font-bold'
                    : 'bg-slate-900 text-slate-300 border border-slate-800 hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Consultations ({appointments.length})</span>
              </Link>

              <Link
                to={ROUTES.ADMIN.AUDIT_LOGS}
                className={`px-3.5 py-2 rounded-lg text-xs font-mono flex items-center gap-1.5 ${
                  activeSection === 'audit'
                    ? 'bg-[#00C2C7] text-[#0B1220] font-bold'
                    : 'bg-slate-900 text-slate-300 border border-slate-800 hover:text-white'
                }`}
              >
                <FileCheck className="w-3.5 h-3.5" />
                <span>Audit Logs ({auditLogs.length})</span>
              </Link>
            </nav>

            <button
              type="button"
              onClick={() => void loadAuthorizedAdminData(adminToken)}
              disabled={isLoadingAdminData}
              className="px-3 py-1.5 text-slate-300 hover:text-[#00C2C7] bg-slate-900 rounded-lg border border-slate-800 cursor-pointer flex items-center gap-1.5 text-xs font-mono"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAdminData ? 'animate-spin' : ''}`} />
              <span>Sync Records</span>
            </button>
          </div>

          {adminDataError && (
            <div className="p-3.5 rounded-lg bg-amber-950/50 border border-amber-500/40 text-xs text-amber-200">
              {adminDataError}
            </div>
          )}

          <div className="rounded-2xl bg-[#111827] border border-slate-800 p-5 overflow-x-auto space-y-4">
            {activeSection === 'inquiries' && (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
                  <button
                    type="button"
                    onClick={() => setDashboardSubTab('requests')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono cursor-pointer flex items-center gap-1.5 ${
                      dashboardSubTab === 'requests'
                        ? 'bg-slate-800 text-[#00C2C7] border border-[#00C2C7]/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <LayoutDashboard className="w-3.5 h-3.5" />
                    <span>Inquiries ({solutionRequests.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDashboardSubTab('notifications')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono cursor-pointer flex items-center gap-1.5 ${
                      dashboardSubTab === 'notifications'
                        ? 'bg-slate-800 text-[#00C2C7] border border-[#00C2C7]/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Bell className="w-3.5 h-3.5" />
                    <span>Notification Ops ({notifications.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDashboardSubTab('health')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono cursor-pointer flex items-center gap-1.5 ${
                      dashboardSubTab === 'health'
                        ? 'bg-slate-800 text-[#00C2C7] border border-[#00C2C7]/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>System Health</span>
                  </button>
                </div>

                {retryFeedback && (
                  <div className="p-3 rounded-lg bg-slate-900 border border-[#00C2C7]/30 text-xs text-slate-200 font-mono">
                    {retryFeedback}
                  </div>
                )}

                {dashboardSubTab === 'requests' &&
                  (solutionRequests.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
                      No persisted solution requests found in PostgreSQL database.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                          <th className="pb-2">REFERENCE</th>
                          <th className="pb-2">CLIENT &amp; ORG</th>
                          <th className="pb-2">SOLUTIONS</th>
                          <th className="pb-2">ASSESSMENT STATUS</th>
                          <th className="pb-2">EMAIL STATUS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {solutionRequests.map((reqItem) => (
                          <tr key={reqItem.referenceCode} className="text-slate-300">
                            <td className="py-2.5 font-mono text-[#00C2C7]">{reqItem.referenceCode}</td>
                            <td className="py-2.5">
                              <span className="font-semibold text-white block">{reqItem.fullName}</span>
                              <span className="text-slate-400 text-[11px]">
                                {reqItem.company} · {reqItem.email}
                              </span>
                            </td>
                            <td className="py-2.5 max-w-[240px] truncate">{reqItem.serviceTitle}</td>
                            <td className="py-2.5 font-mono text-slate-300">
                              {reqItem.estimatedBudget || 'Subject to Formal Assessment'}
                            </td>
                            <td className="py-2.5 font-mono text-[11px] uppercase">
                              {reqItem.emailDeliveryStatus}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ))}

                {dashboardSubTab === 'notifications' &&
                  (notifications.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
                      No persisted email notification outbox records found.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                          <th className="pb-2">REFERENCE</th>
                          <th className="pb-2">TYPE</th>
                          <th className="pb-2">RECIPIENT</th>
                          <th className="pb-2">STATUS</th>
                          <th className="pb-2">ATTEMPTS</th>
                          <th className="pb-2 text-right">ACTION</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {notifications.map((notif) => {
                          const canRetry =
                            notif.status === 'failed' ||
                            notif.status === 'dead_letter' ||
                            notif.status === 'queued';
                          return (
                            <tr key={notif.id} className="text-slate-300">
                              <td className="py-2.5 font-mono text-[#00C2C7]">{notif.entityReference}</td>
                              <td className="py-2.5 font-mono text-[11px]">{notif.notificationType}</td>
                              <td className="py-2.5 font-mono text-[11px]">{notif.recipientEmail}</td>
                              <td className="py-2.5 font-mono text-[11px] uppercase">{notif.status}</td>
                              <td className="py-2.5 font-mono text-[11px]">{notif.deliveryAttempts}</td>
                              <td className="py-2.5 text-right">
                                {canRetry ? (
                                  <button
                                    type="button"
                                    disabled={retryingId === notif.id}
                                    onClick={() => void handleRetryNotification(notif.id)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[#00C2C7] text-[11px] font-mono cursor-pointer disabled:opacity-50"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>{retryingId === notif.id ? 'Retrying...' : 'Retry'}</span>
                                  </button>
                                ) : (
                                  <span className="text-slate-500 font-mono text-[11px]">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ))}

                {dashboardSubTab === 'health' &&
                  (!systemHealth ? (
                    <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
                      System health diagnostics are loading or unavailable.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.entries(systemHealth.subsystems || {}).map(([key, info]: [string, any]) => (
                        <div
                          key={key}
                          className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-mono text-slate-300 uppercase">{key}</span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-[#00C2C7]">
                              {info?.state || 'UNKNOWN'}
                            </span>
                          </div>
                          {typeof info?.latencyMs === 'number' && (
                            <p className="text-[11px] text-slate-400 font-mono">
                              Latency: {info.latencyMs}ms
                            </p>
                          )}
                          {info?.mode && (
                            <p className="text-[11px] text-slate-400 font-mono">Mode: {info.mode}</p>
                          )}
                          {info?.queueSummary && (
                            <p className="text-[11px] text-slate-400 font-mono">
                              Accepted: {info.queueSummary.providerAccepted} · Delivered:{' '}
                              {info.queueSummary.delivered} · DLQ: {info.queueSummary.deadLetter}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
              </>
            )}

            {activeSection === 'appointments' && (
              appointments.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
                  No persisted consultation scheduling requests found.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                      <th className="pb-2">REFERENCE</th>
                      <th className="pb-2">CLIENT &amp; ORG</th>
                      <th className="pb-2">DATE &amp; SLOT</th>
                      <th className="pb-2">CHANNEL</th>
                      <th className="pb-2">STATUS</th>
                      <th className="pb-2 text-right">CALENDAR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {appointments.map((appt) => (
                      <tr key={appt.referenceCode} className="text-slate-300">
                        <td className="py-2.5 font-mono text-[#00C2C7]">{appt.referenceCode}</td>
                        <td className="py-2.5">
                          <span className="font-semibold text-white block">{appt.fullName}</span>
                          <span className="text-slate-400 text-[11px]">
                            {appt.companyName} · {appt.email}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono">
                          {appt.scheduledDate} ({appt.scheduledTimeSlot})
                        </td>
                        <td className="py-2.5 uppercase font-mono text-[11px]">
                          {appt.consultationType}
                        </td>
                        <td className="py-2.5 font-mono text-[11px] uppercase">{appt.status}</td>
                        <td className="py-2.5 text-right font-mono text-[11px]">
                          {appt.meetingLink ? (
                            <a
                              href={appt.meetingLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[#00C2C7] hover:underline"
                            >
                              <span>Event</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-slate-500">{appt.calendarSyncStatus}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {activeSection === 'audit' && (
              auditLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
                  No audit logs recorded yet.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                      <th className="pb-2">TIMESTAMP</th>
                      <th className="pb-2">ACTOR</th>
                      <th className="pb-2">ACTION</th>
                      <th className="pb-2">ENTITY</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {auditLogs.map((logItem) => (
                      <tr key={logItem.id} className="text-slate-300">
                        <td className="py-2 font-mono text-[11px]">{logItem.createdAt}</td>
                        <td className="py-2 font-mono text-[11px]">{logItem.actor}</td>
                        <td className="py-2 text-[#00C2C7] font-mono text-[11px]">{logItem.action}</td>
                        <td className="py-2 font-mono text-[11px]">
                          {logItem.entityType} {logItem.entityId ? `(${logItem.entityId})` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
        </main>
      </div>
    );
  };

  return (
    <Routes>
      <Route
        index
        element={<Navigate to={adminProfile ? ROUTES.ADMIN.DASHBOARD : ROUTES.ADMIN.LOGIN} replace />}
      />
      <Route path="login" element={renderLoginView()} />
      <Route path="dashboard" element={renderProtectedConsole('inquiries')} />
      <Route path="appointments" element={renderProtectedConsole('appointments')} />
      <Route path="audit-logs" element={renderProtectedConsole('audit')} />
      <Route path="*" element={<NotFoundPage scope="admin" />} />
    </Routes>
  );
};

export default AdminPortalApp;
