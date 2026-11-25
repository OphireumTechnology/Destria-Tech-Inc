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
  Bot,
  Sliders,
  ShieldCheck,
  Power,
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
  const [aiOverview, setAiOverview] = useState<any | null>(null);
  const [aiConfigDraft, setAiConfigDraft] = useState<any | null>(null);
  const [isSavingAiConfig, setIsSavingAiConfig] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [terminatingSessionId, setTerminatingSessionId] = useState<string | null>(null);
  const [dashboardSubTab, setDashboardSubTab] = useState<'requests' | 'notifications' | 'health' | 'ai'>('requests');
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

      const [reqRes, aptRes, auditRes, notifRes, healthRes, aiRes] = await Promise.all([
        fetch(apiUrl('/api/admin/solution-requests?limit=25&offset=0'), { headers }),
        fetch(apiUrl('/api/admin/appointments?limit=25&offset=0'), { headers }),
        fetch(apiUrl('/api/admin/audit-logs?limit=25&offset=0'), { headers }),
        fetch(apiUrl('/api/admin/notifications?limit=50&offset=0'), { headers }),
        fetch(apiUrl('/api/admin/system-health'), { headers }),
        fetch(apiUrl('/api/admin/ai/overview'), { headers }),
      ]);

      const reqJson = await reqRes.json().catch(() => ({}));
      const aptJson = await aptRes.json().catch(() => ({}));
      const auditJson = await auditRes.json().catch(() => ({}));
      const notifJson = await notifRes.json().catch(() => ({}));
      const healthJson = await healthRes.json().catch(() => ({}));
      const aiJson = await aiRes.json().catch(() => ({}));

      if (aiRes.ok && aiJson.success) {
        setAiOverview(aiJson);
        setAiConfigDraft(aiJson.config ? { ...aiJson.config } : null);
      }

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

  const handleSaveAiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken || !aiConfigDraft || isSavingAiConfig) return;
    setIsSavingAiConfig(true);
    setAiFeedback(null);
    try {
      const res = await fetch(apiUrl('/api/admin/ai/config'), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          geminiLiveEnabled: Boolean(aiConfigDraft.geminiLiveEnabled),
          geminiLiveModel: aiConfigDraft.geminiLiveModel,
          geminiVoiceName: aiConfigDraft.geminiVoiceName,
          defaultLanguage: aiConfigDraft.defaultLanguage,
          multilingualEnabled: Boolean(aiConfigDraft.multilingualEnabled),
          transcriptionEnabled: Boolean(aiConfigDraft.transcriptionEnabled),
          bargeInEnabled: Boolean(aiConfigDraft.bargeInEnabled),
          browserFallbackEnabled: Boolean(aiConfigDraft.browserFallbackEnabled),
          maxConcurrentLiveSessions: Number(aiConfigDraft.maxConcurrentLiveSessions),
          sessionTtlMinutes: Number(aiConfigDraft.sessionTtlMinutes),
          dailyEstimatedBudgetUsd: Number(aiConfigDraft.dailyEstimatedBudgetUsd),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setAiFeedback(data.error || 'Unable to update AI configuration.');
      } else {
        setAiFeedback('AI runtime configuration updated and audited.');
        await loadAuthorizedAdminData(adminToken);
      }
    } catch {
      setAiFeedback('Network error while saving AI configuration.');
    } finally {
      setIsSavingAiConfig(false);
    }
  };

  const handleTerminateAiSession = async (sessionId: string) => {
    if (!adminToken || terminatingSessionId) return;
    setTerminatingSessionId(sessionId);
    setAiFeedback(null);
    try {
      const res = await fetch(
        apiUrl(`/api/admin/ai/sessions/${encodeURIComponent(sessionId)}/terminate`),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setAiFeedback(data.error || 'Could not terminate voice session.');
      } else {
        setAiFeedback(`Session ${sessionId} terminated.`);
        await loadAuthorizedAdminData(adminToken);
      }
    } catch {
      setAiFeedback('Network error while terminating session.');
    } finally {
      setTerminatingSessionId(null);
    }
  };

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
    setAiOverview(null);
    setAiConfigDraft(null);
    setAiFeedback(null);
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
                  <button
                    type="button"
                    onClick={() => setDashboardSubTab('ai')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono cursor-pointer flex items-center gap-1.5 ${
                      dashboardSubTab === 'ai'
                        ? 'bg-slate-800 text-[#00C2C7] border border-[#00C2C7]/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span>AI Command Center</span>
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

                {dashboardSubTab === 'ai' &&
                  (!aiOverview ? (
                    <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
                      AI Command Center diagnostics are loading or unavailable.
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {aiFeedback && (
                        <div className="p-3 rounded-lg bg-slate-900 border border-[#00C2C7]/40 text-xs text-slate-200 font-mono">
                          {aiFeedback}
                        </div>
                      )}

                      {/* Security & Service Health Summary Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-slate-400 uppercase">AI Service Health</span>
                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                                aiOverview.serviceHealth?.state === 'HEALTHY'
                                  ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/40'
                                  : aiOverview.serviceHealth?.state === 'DEGRADED'
                                  ? 'bg-amber-950/70 text-amber-300 border border-amber-500/40'
                                  : 'bg-rose-950/70 text-rose-300 border border-rose-500/40'
                              }`}
                            >
                              {aiOverview.serviceHealth?.state || 'UNKNOWN'}
                            </span>
                          </div>
                          <p className="text-xs text-white font-semibold">
                            Provider: {(aiOverview.serviceHealth?.provider || 'gemini').toUpperCase()}
                          </p>
                          <p className="text-[11px] font-mono text-slate-400">
                            Server Secret:{' '}
                            <span
                              className={
                                aiOverview.serviceHealth?.geminiApiKeyConfigured
                                  ? 'text-emerald-400'
                                  : 'text-amber-400'
                              }
                            >
                              {aiOverview.serviceHealth?.geminiApiKeyConfigured
                                ? 'Configured (Env)'
                                : 'Not Configured'}
                            </span>
                          </p>
                          <p className="text-[10px] font-mono text-slate-500">
                            Raw Audio Retention: Disabled
                          </p>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                          <span className="text-[10px] font-mono text-slate-400 uppercase">Response Latency</span>
                          <p className="text-lg font-mono font-bold text-[#00C2C7]">
                            {aiOverview.metrics?.latency?.avgMs ?? 0}ms avg
                          </p>
                          <p className="text-[11px] font-mono text-slate-400">
                            P50: {aiOverview.metrics?.latency?.p50Ms ?? 0}ms · P95:{' '}
                            {aiOverview.metrics?.latency?.p95Ms ?? 0}ms
                          </p>
                          <p className="text-[10px] font-mono text-slate-500">
                            Samples: {aiOverview.metrics?.latency?.sampleCount ?? 0}
                          </p>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                          <span className="text-[10px] font-mono text-slate-400 uppercase">Tokens &amp; Guardrail</span>
                          <p className="text-lg font-mono font-bold text-white">
                            {(aiOverview.metrics?.tokens?.totalTokens ?? 0).toLocaleString()} tok
                          </p>
                          <p className="text-[11px] font-mono text-slate-400">
                            Est: ${(aiOverview.metrics?.cost?.estimatedCostUsd ?? 0).toFixed(4)} / $
                            {aiOverview.metrics?.cost?.dailyBudgetUsd ?? 25}
                          </p>
                          <p className="text-[10px] font-mono text-[#D4AF37]">
                            Utilization: {aiOverview.metrics?.cost?.budgetUtilizationPct ?? 0}%
                          </p>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                          <span className="text-[10px] font-mono text-slate-400 uppercase">Governance &amp; Reliability</span>
                          <p className="text-lg font-mono font-bold text-emerald-400">
                            {aiOverview.metrics?.totalToolCalls ?? 0} tool calls
                          </p>
                          <p className="text-[11px] font-mono text-slate-400">
                            Policy Enforcements: {aiOverview.metrics?.totalPolicyEnforcements ?? 0}
                          </p>
                          <p className="text-[10px] font-mono text-slate-500">
                            API Failures: {aiOverview.metrics?.failures?.total ?? 0} · Active Sessions:{' '}
                            {(aiOverview.activeSessions || []).length}
                          </p>
                        </div>
                      </div>

                      {/* Zero-Key-Exposure Security Notice */}
                      <div className="p-3 rounded-lg bg-[#0B1F3B]/60 border border-[#00C2C7]/30 flex items-start gap-2.5 text-xs text-slate-300">
                        <ShieldCheck className="w-4 h-4 text-[#00C2C7] shrink-0 mt-0.5" />
                        <span>
                          API credentials are isolated exclusively in server-side environment secrets and are never exposed or editable through the browser console.
                        </span>
                      </div>

                      {/* Live Runtime Configuration Controls */}
                      {aiConfigDraft && (
                        <form
                          onSubmit={handleSaveAiConfig}
                          className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Sliders className="w-4 h-4 text-[#00C2C7]" />
                              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                                Runtime AI Configuration
                              </h3>
                            </div>
                            <button
                              type="submit"
                              disabled={isSavingAiConfig}
                              className="px-3.5 py-1.5 rounded-lg bg-[#00C2C7] hover:bg-[#00d8de] disabled:opacity-50 text-[#0B1220] text-xs font-bold cursor-pointer"
                            >
                              {isSavingAiConfig ? 'Saving...' : 'Save Configuration'}
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                            <div>
                              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                                Gemini Live Model
                              </label>
                              <select
                                value={aiConfigDraft.geminiLiveModel}
                                onChange={(e) =>
                                  setAiConfigDraft({ ...aiConfigDraft, geminiLiveModel: e.target.value })
                                }
                                className="w-full px-3 py-2 rounded-lg bg-[#0B1220] border border-slate-700 text-white font-mono text-xs"
                              >
                                {(aiOverview.allowedOptions?.liveModels || ['gemini-3.8-live']).map(
                                  (m: string) => (
                                    <option key={m} value={m}>
                                      {m}
                                    </option>
                                  )
                                )}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                                Neural Voice Preset
                              </label>
                              <select
                                value={aiConfigDraft.geminiVoiceName}
                                onChange={(e) =>
                                  setAiConfigDraft({ ...aiConfigDraft, geminiVoiceName: e.target.value })
                                }
                                className="w-full px-3 py-2 rounded-lg bg-[#0B1220] border border-slate-700 text-white font-mono text-xs"
                              >
                                {(aiOverview.allowedOptions?.voices || ['Kore']).map((v: string) => (
                                  <option key={v} value={v}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                                Default Language
                              </label>
                              <select
                                value={aiConfigDraft.defaultLanguage}
                                onChange={(e) =>
                                  setAiConfigDraft({ ...aiConfigDraft, defaultLanguage: e.target.value })
                                }
                                className="w-full px-3 py-2 rounded-lg bg-[#0B1220] border border-slate-700 text-white font-mono text-xs"
                              >
                                {(aiOverview.allowedOptions?.languages || ['en-US', 'fil-PH']).map(
                                  (lang: string) => (
                                    <option key={lang} value={lang}>
                                      {lang}
                                    </option>
                                  )
                                )}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                                Max Concurrent Live Sessions
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={200}
                                value={aiConfigDraft.maxConcurrentLiveSessions}
                                onChange={(e) =>
                                  setAiConfigDraft({
                                    ...aiConfigDraft,
                                    maxConcurrentLiveSessions: Number(e.target.value),
                                  })
                                }
                                className="w-full px-3 py-2 rounded-lg bg-[#0B1220] border border-slate-700 text-white font-mono text-xs"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                                Session TTL (Minutes)
                              </label>
                              <input
                                type="number"
                                min={2}
                                max={120}
                                value={aiConfigDraft.sessionTtlMinutes}
                                onChange={(e) =>
                                  setAiConfigDraft({
                                    ...aiConfigDraft,
                                    sessionTtlMinutes: Number(e.target.value),
                                  })
                                }
                                className="w-full px-3 py-2 rounded-lg bg-[#0B1220] border border-slate-700 text-white font-mono text-xs"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                                Daily Budget Guardrail (USD)
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={5000}
                                step="1"
                                value={aiConfigDraft.dailyEstimatedBudgetUsd}
                                onChange={(e) =>
                                  setAiConfigDraft({
                                    ...aiConfigDraft,
                                    dailyEstimatedBudgetUsd: Number(e.target.value),
                                  })
                                }
                                className="w-full px-3 py-2 rounded-lg bg-[#0B1220] border border-slate-700 text-white font-mono text-xs"
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-4 pt-2 border-t border-slate-800 text-xs text-slate-300">
                            {[
                              { key: 'geminiLiveEnabled', label: 'Gemini Live Streaming' },
                              { key: 'multilingualEnabled', label: 'Multilingual / Taglish' },
                              { key: 'transcriptionEnabled', label: 'Live Transcription' },
                              { key: 'bargeInEnabled', label: 'Barge-In Interruption' },
                              { key: 'browserFallbackEnabled', label: 'Browser Speech Fallback' },
                            ].map((toggle) => (
                              <label
                                key={toggle.key}
                                className="inline-flex items-center gap-2 cursor-pointer font-mono text-[11px]"
                              >
                                <input
                                  type="checkbox"
                                  checked={Boolean(aiConfigDraft[toggle.key])}
                                  onChange={(e) =>
                                    setAiConfigDraft({
                                      ...aiConfigDraft,
                                      [toggle.key]: e.target.checked,
                                    })
                                  }
                                  className="accent-[#00C2C7]"
                                />
                                <span>{toggle.label}</span>
                              </label>
                            ))}
                          </div>
                        </form>
                      )}

                      {/* Active AI Voice Sessions */}
                      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                        <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                          Active AI Voice Sessions ({(aiOverview.activeSessions || []).length})
                        </h3>
                        {(aiOverview.activeSessions || []).length === 0 ? (
                          <p className="text-xs text-slate-500 font-mono">
                            No active real-time voice sessions at this moment.
                          </p>
                        ) : (
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                                <th className="pb-2">SESSION ID</th>
                                <th className="pb-2">CHANNEL / MODEL</th>
                                <th className="pb-2">TURNS</th>
                                <th className="pb-2">LAST ACTIVITY</th>
                                <th className="pb-2 text-right">ACTION</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/80">
                              {aiOverview.activeSessions.map((sess: any) => (
                                <tr key={sess.sessionId} className="text-slate-300">
                                  <td className="py-2 font-mono text-[#00C2C7]">{sess.sessionId}</td>
                                  <td className="py-2 font-mono text-[11px]">
                                    {sess.channel} · {sess.model} ({sess.voiceName})
                                  </td>
                                  <td className="py-2 font-mono">{sess.turnCount}</td>
                                  <td className="py-2 font-mono text-[11px]">{sess.lastActivityAt}</td>
                                  <td className="py-2 text-right">
                                    <button
                                      type="button"
                                      disabled={terminatingSessionId === sess.sessionId}
                                      onClick={() => void handleTerminateAiSession(sess.sessionId)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-950/70 hover:bg-rose-900 border border-rose-500/40 text-rose-200 text-[11px] font-mono cursor-pointer disabled:opacity-50"
                                    >
                                      <Power className="w-3 h-3" />
                                      <span>
                                        {terminatingSessionId === sess.sessionId ? 'Ending...' : 'Terminate'}
                                      </span>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      {/* Recent Transcription Corrections & Diagnostics */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
                          <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                            Transcription Corrections ({(aiOverview.transcriptionErrors || []).length})
                          </h3>
                          {(aiOverview.transcriptionErrors || []).length === 0 ? (
                            <p className="text-xs text-slate-500 font-mono">
                              No user transcript corrections reported.
                            </p>
                          ) : (
                            <div className="space-y-2 max-h-56 overflow-y-auto">
                              {aiOverview.transcriptionErrors.map((rep: any) => (
                                <div
                                  key={rep.id}
                                  className="p-2.5 rounded-lg bg-[#0B1220] border border-slate-800 text-[11px] space-y-1"
                                >
                                  <div className="flex justify-between font-mono text-[10px] text-slate-500">
                                    <span>{rep.language}</span>
                                    <span>{rep.reportedAt}</span>
                                  </div>
                                  <p className="text-rose-300/90 line-through">{rep.originalTranscript}</p>
                                  <p className="text-emerald-300">{rep.correctedTranscript}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
                          <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                            Recent Conversation Diagnostics ({(aiOverview.conversationDiagnostics || []).length})
                          </h3>
                          {(aiOverview.conversationDiagnostics || []).length === 0 ? (
                            <p className="text-xs text-slate-500 font-mono">
                              No conversation diagnostics recorded yet.
                            </p>
                          ) : (
                            <div className="space-y-2 max-h-56 overflow-y-auto">
                              {aiOverview.conversationDiagnostics.map((diag: any) => (
                                <div
                                  key={diag.sessionId}
                                  className="p-2.5 rounded-lg bg-[#0B1220] border border-slate-800 text-[11px] font-mono space-y-0.5"
                                >
                                  <div className="flex justify-between text-[#00C2C7]">
                                    <span className="truncate max-w-[180px]">{diag.sessionId}</span>
                                    <span>{diag.channel}</span>
                                  </div>
                                  <div className="text-slate-400">
                                    Turns: {diag.turns} · Tools: {diag.toolCalls} · Policy Flags:{' '}
                                    {diag.policyEnforcements}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
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
