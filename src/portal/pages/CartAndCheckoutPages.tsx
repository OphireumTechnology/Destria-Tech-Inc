import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Upload,
  FileText,
  CreditCard,
  Lock,
  ClipboardCheck,
  Phone,
  Mail,
  Layers,
} from 'lucide-react';
import { PortalLayout } from '../components/PortalLayout';
import { portalRequest, uploadPortalFile } from '../portalApi';
import { usePortalAuth } from '../PortalAuthContext';
import { usePortalRouter } from '../PortalRouter';
import {
  ROUTES,
  buildCheckoutWithProposalRoute,
  buildOrderDetailRoute,
} from '../../config/routes';
import {
  COMMERCIAL_ENGAGEMENT_STATEMENT,
  CORPORATE_SERVICE_STATEMENT,
  corporateIdentity,
} from '../../data/companyConfig';
import {
  PaymentProviderConfig,
  PortalApprovedProposal,
  formatMoney,
  formatPortalDate,
  formatStatusLabel,
  statusToneClass,
} from '../portalTypes';

export const PortalCartPage: React.FC = () => {
  const { navigate } = usePortalRouter();
  const [proposals, setProposals] = useState<PortalApprovedProposal[]>([]);
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [propRes, inqRes] = await Promise.all([
        portalRequest<{ proposals: PortalApprovedProposal[] }>('/proposals'),
        portalRequest<{ inquiries: any[] }>('/custom-inquiries'),
      ]);
      setProposals(propRes.proposals || []);
      setInquiries(inqRes.inquiries || []);
    } catch (err: any) {
      setError(err?.message || 'Unable to load inquiries and formal proposals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const activeApprovedProposals = proposals.filter((p) => p.status === 'approved');

  return (
    <PortalLayout
      title="Service Inquiries & Formal Proposals"
      subtitle="Track consultation inquiries, technical assessments, and server-authorized commercial proposals issued by DESTRIA TECH INC."
    >
      {error && (
        <div className="mb-5 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Commercial Policy Governance Notice */}
      <div className="mb-6 p-5 rounded-xl bg-white border border-[#E6E2D8] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-[#0F4C3A] shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs text-[#334155]">
            <p className="text-sm font-semibold text-[#0F1D36]">
              Consultation-First Enterprise Engagement Governance
            </p>
            <p className="leading-relaxed">{CORPORATE_SERVICE_STATEMENT}</p>
            <p className="text-[#475569] leading-relaxed">{COMMERCIAL_ENGAGEMENT_STATEMENT}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => navigate(ROUTES.PORTAL.STORE)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#0F4C3A] hover:bg-[#0B3B2D] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Initiate Service Inquiry</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-[#E6E2D8] rounded-xl p-10 text-center text-sm text-[#64748B]">
          Loading formal proposals and service inquiries...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left: Authorized Proposals + Service Inquiries */}
          <div className="lg:col-span-2 space-y-6">
            {/* Approved Commercial Proposals */}
            <section className="bg-white border border-[#E6E2D8] rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E6E2D8] flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-[#0F1D36]">
                    Server-Authorized Formal Proposals ({proposals.length})
                  </h2>
                  <p className="text-xs text-[#64748B]">
                    Commercial settlement is enabled strictly for authorized proposals issued to your client account.
                  </p>
                </div>
              </div>

              {proposals.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <ClipboardCheck className="w-9 h-9 text-[#94A3B8] mx-auto" />
                  <div>
                    <p className="text-sm font-semibold text-[#0F1D36]">No formal proposals issued yet</p>
                    <p className="text-xs text-[#64748B] mt-1 max-w-md mx-auto">
                      Public self-service checkout is disabled. Submit a service inquiry or schedule a consultation so our engineering team can prepare a tailored proposal.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(ROUTES.PORTAL.STORE)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0F4C3A] hover:bg-[#0B3B2D] text-white text-xs font-semibold cursor-pointer"
                  >
                    <span>Explore Solutions Directory</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[#E6E2D8]">
                  {proposals.map((prop) => {
                    const isExpired = prop.expiresAt && Date.parse(prop.expiresAt) < Date.now();
                    const canSettle = prop.status === 'approved' && !isExpired;
                    return (
                      <div key={prop.id} className="p-5 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 text-xs text-[#64748B]">
                              <span className="font-mono font-semibold text-[#0F1D36]">{prop.proposalNumber}</span>
                              <span>·</span>
                              <span>Issued {formatPortalDate(prop.issuedAt)}</span>
                              <span>·</span>
                              <span>Valid until {formatPortalDate(prop.expiresAt)}</span>
                            </div>
                            <h3 className="text-sm font-bold text-[#0F1D36] mt-1">{prop.title}</h3>
                            <p className="text-xs text-[#475569] mt-0.5">{prop.scopeSummary}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-base font-bold tabular-nums text-[#0F1D36]">
                              {formatMoney(prop.totalMinor, prop.currency)}
                            </p>
                            <span className={`text-xs ${statusToneClass(isExpired ? 'expired' : prop.status)}`}>
                              {isExpired ? 'Expired' : formatStatusLabel(prop.status)}
                            </span>
                          </div>
                        </div>

                        <div className="bg-[#FAF8F4] border border-[#E6E2D8] rounded-lg divide-y divide-[#E6E2D8] text-xs">
                          {prop.items.map((item) => (
                            <div key={item.id} className="px-3.5 py-2 flex items-center justify-between gap-3">
                              <span className="text-[#334155]">
                                {item.productName} ({item.packageName}) × {item.quantity}
                              </span>
                              <span className="font-mono font-semibold text-[#0F1D36] tabular-nums">
                                {formatMoney(item.lineTotalMinor, prop.currency)}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                          <span className="text-[11px] text-[#64748B]">Issued by {prop.issuedBy}</span>
                          {canSettle ? (
                            <button
                              type="button"
                              onClick={() => navigate(buildCheckoutWithProposalRoute(prop.id))}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F4C3A] hover:bg-[#0B3B2D] text-white text-xs font-semibold cursor-pointer"
                            >
                              <span>Proceed to Authorized Settlement</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          ) : prop.acceptedOrderId ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (prop.acceptedOrderId) {
                                  navigate(buildOrderDetailRoute(prop.acceptedOrderId));
                                }
                              }}
                              className="text-xs font-semibold text-[#0F4C3A] hover:underline cursor-pointer"
                            >
                              View Authorized Order →
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Submitted Service Inquiries */}
            <section className="bg-white border border-[#E6E2D8] rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E6E2D8]">
                <h2 className="text-base font-semibold text-[#0F1D36]">
                  Service Inquiries &amp; Technical Assessments ({inquiries.length})
                </h2>
              </div>
              {inquiries.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#64748B]">
                  No service inquiries submitted from your portal account yet.
                </div>
              ) : (
                <div className="divide-y divide-[#E6E2D8]">
                  {inquiries.map((inq) => (
                    <div key={inq.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-xs text-[#64748B]">
                          <span className="font-mono font-semibold text-[#0F1D36]">{inq.referenceNumber}</span> ·{' '}
                          {formatPortalDate(inq.createdAt)}
                        </div>
                        <p className="text-sm font-semibold text-[#0F1D36]">{inq.companyName}</p>
                        <p className="text-xs text-[#475569]">{inq.projectDescription}</p>
                        {Array.isArray(inq.requiredServices) && inq.requiredServices.length > 0 && (
                          <p className="text-[11px] text-[#64748B]">
                            Solutions: {inq.requiredServices.join(', ')}
                          </p>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-[#B45309]">{formatStatusLabel(inq.status)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right: Commercial Engagement Desk */}
          <aside className="bg-white border border-[#E6E2D8] rounded-xl p-5 space-y-5 sticky top-24">
            <h2 className="text-base font-semibold text-[#0F1D36]">Commercial Engagement Desk</h2>
            <p className="text-xs text-[#475569] leading-relaxed">
              Every DESTRIA TECH INC engagement begins with consultation and formal architectural assessment. Public self-checkout and promotional discount codes are not offered.
            </p>

            <div className="space-y-2.5 pt-3 border-t border-[#E6E2D8] text-xs">
              <div className="flex justify-between text-[#475569]">
                <span>Active Approved Proposals</span>
                <span className="font-mono font-semibold text-[#0F1D36]">{activeApprovedProposals.length}</span>
              </div>
              <div className="flex justify-between text-[#475569]">
                <span>Submitted Inquiries</span>
                <span className="font-mono font-semibold text-[#0F1D36]">{inquiries.length}</span>
              </div>
              <div className="flex justify-between text-[#475569]">
                <span>Commercial Basis</span>
                <span className="font-semibold text-[#0F4C3A]">Formal Proposal</span>
              </div>
            </div>

            {activeApprovedProposals.length > 0 ? (
              <button
                type="button"
                onClick={() =>
                  navigate(buildCheckoutWithProposalRoute(activeApprovedProposals[0].id))
                }
                className="w-full py-2.5 px-4 rounded-lg bg-[#0F4C3A] hover:bg-[#0B3B2D] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>Settle Approved Proposal</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate(ROUTES.PORTAL.STORE)}
                className="w-full py-2.5 px-4 rounded-lg bg-[#0F4C3A] hover:bg-[#0B3B2D] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>Request a Formal Proposal</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            <div className="p-3.5 rounded-lg bg-[#FAF8F4] border border-[#E6E2D8] text-xs text-[#475569] space-y-2">
              <p className="font-semibold text-[#0F1D36]">Official Corporate Contact</p>
              <a
                href={corporateIdentity.contact.telephone.href}
                className="flex items-center gap-2 text-[#0F4C3A] font-semibold hover:underline"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>{corporateIdentity.contact.telephone.display}</span>
              </a>
              <a
                href={`mailto:${corporateIdentity.contact.email}`}
                className="flex items-center gap-2 text-[#334155] hover:text-[#0F1D36]"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>{corporateIdentity.contact.email}</span>
              </a>
              <p className="text-[11px] text-[#64748B] pt-1 border-t border-[#E6E2D8]">
                {corporateIdentity.headquarters.fullAddress}
              </p>
            </div>
          </aside>
        </div>
      )}
    </PortalLayout>
  );
};

// =========================================================================
// AUTHORIZED PROPOSAL SETTLEMENT (5-STEP GUIDED WORKFLOW)
// =========================================================================

const CHECKOUT_STEPS = [
  'Review Proposal',
  'Billing Info',
  'Project Requirements',
  'Payment Method',
  'Order Confirmation',
];

export const PortalCheckoutPage: React.FC = () => {
  const { user, profile, refreshSession } = usePortalAuth();
  const { navigate, query } = usePortalRouter();

  const [step, setStep] = useState(0);
  const [proposals, setProposals] = useState<PortalApprovedProposal[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState(query.get('proposalId') || '');
  const [providers, setProviders] = useState<PaymentProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [error, setError] = useState('');

  // Step 2: Billing
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');

  // Step 3: Project Requirements
  const [projectTitle, setProjectTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [deliveryExpectation, setDeliveryExpectation] = useState('');
  const [creativeBrief, setCreativeBrief] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [uploadedRefs, setUploadedRefs] = useState<Array<{ id: string; fileName: string }>>([]);

  // Step 4: Payment provider
  const [selectedProvider, setSelectedProvider] = useState('xendit');

  // Step 5: Confirmation payload
  const [confirmation, setConfirmation] = useState<{
    order: any;
    invoice: any;
    payment: any;
    paymentInitiation: any;
  } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const [propRes, provRes, profRes] = await Promise.all([
          portalRequest<{ proposals: PortalApprovedProposal[] }>('/proposals'),
          portalRequest<{ providers: PaymentProviderConfig[] }>('/payment-providers'),
          portalRequest<{ profile: any; addresses: any[] }>('/profile'),
        ]);
        if (!active) return;
        const activeProposals = (propRes.proposals || []).filter(
          (p) => p.status === 'approved' && (!p.expiresAt || Date.parse(p.expiresAt) >= Date.now())
        );
        setProposals(activeProposals);
        const requestedId = query.get('proposalId');
        const initial =
          activeProposals.find((p) => p.id === requestedId)?.id || activeProposals[0]?.id || '';
        setSelectedProposalId(initial);

        setProviders(provRes.providers || []);
        const p = profRes.profile || profile;
        setFullName(p?.fullName || '');
        setEmail(p?.email || user?.email || '');
        setPhone(p?.phone || '');
        setCompanyName(p?.companyName || '');
        setTaxId(p?.taxId || '');
        const defaultAddr = (profRes.addresses || []).find((a: any) => a.isDefault) || profRes.addresses?.[0];
        if (defaultAddr) {
          setAddress(
            [
              defaultAddr.line1,
              defaultAddr.line2,
              defaultAddr.city,
              defaultAddr.stateProvince,
              defaultAddr.postalCode,
              defaultAddr.country,
            ]
              .filter(Boolean)
              .join(', ')
          );
        }
      } catch (err: any) {
        if (active) setError(err?.message || 'Unable to initialize authorized settlement workspace.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [profile, user, query]);

  const activeProposal = proposals.find((p) => p.id === selectedProposalId) || null;

  const handleUploadReference = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingRef(true);
    setError('');
    try {
      const res = await uploadPortalFile(file, { category: 'brief' });
      setUploadedRefs((prev) => [...prev, { id: res.file.id, fileName: res.file.fileName }]);
    } catch (err: any) {
      setError(err?.message || 'File upload failed.');
    } finally {
      setUploadingRef(false);
      e.target.value = '';
    }
  };

  const handlePlaceOrder = async () => {
    if (!activeProposal) {
      setError('An approved DESTRIA TECH INC commercial proposal is required before settlement.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await portalRequest<{
        order: any;
        invoice: any;
        payment: any;
        paymentInitiation: any;
      }>('/checkout', {
        method: 'POST',
        idempotent: true,
        body: {
          approvedProposalId: activeProposal.id,
          paymentProvider: selectedProvider,
          billingDetails: { fullName, email, phone, companyName, taxId, address },
          projectRequirements: {
            title: projectTitle || activeProposal.title,
            instructions,
            deliveryExpectation,
            creativeBrief,
            specialInstructions,
            referenceFileIds: uploadedRefs.map((f) => f.id),
          },
        },
      });
      setConfirmation(res);
      setStep(4);
      await refreshSession();
    } catch (err: any) {
      setError(err?.message || 'Unable to submit authorized order.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeProviderConfig = providers.find((p) => p.provider === selectedProvider);

  return (
    <PortalLayout
      title="Authorized Proposal Settlement"
      subtitle="Complete billing verification, project onboarding brief, and authorized settlement strictly against an approved DESTRIA TECH INC formal proposal."
    >
      {/* Stepper */}
      <div className="mb-6 bg-white border border-[#E6E2D8] rounded-xl p-4">
        <ol className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {CHECKOUT_STEPS.map((label, idx) => {
            const done = idx < step;
            const current = idx === step;
            return (
              <li
                key={label}
                className={`flex items-center gap-2 text-xs ${
                  current
                    ? 'text-[#0F1D36] font-semibold'
                    : done
                    ? 'text-[#0F4C3A] font-medium'
                    : 'text-[#94A3B8]'
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[11px] shrink-0 ${
                    current
                      ? 'bg-[#0F1D36] text-white'
                      : done
                      ? 'bg-[#0F4C3A] text-white'
                      : 'bg-[#F1EFE9] text-[#64748B]'
                  }`}
                >
                  {done ? '✓' : idx + 1}
                </span>
                <span className="truncate">{label}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {error && (
        <div className="mb-5 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-[#E6E2D8] rounded-xl p-10 text-center text-sm text-[#64748B]">
          Verifying authorized proposals...
        </div>
      ) : !confirmation && !activeProposal ? (
        <div className="bg-white border border-[#E6E2D8] rounded-xl p-10 text-center space-y-4 max-w-2xl mx-auto">
          <Lock className="w-9 h-9 text-[#0F4C3A] mx-auto" />
          <div className="space-y-2">
            <h2 className="text-base font-bold text-[#0F1D36]">Approved Formal Proposal Required</h2>
            <p className="text-xs text-[#475569] leading-relaxed">
              Public self-service checkout is disabled. Commercial settlement is available exclusively after consultation, formal technical assessment, and issuance of an authorized DESTRIA TECH INC commercial proposal to your account.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate(ROUTES.PORTAL.STORE)}
              className="px-4 py-2.5 rounded-lg bg-[#0F4C3A] hover:bg-[#0B3B2D] text-white text-xs font-semibold cursor-pointer"
            >
              Initiate Service Inquiry
            </button>
            <button
              type="button"
              onClick={() => navigate(ROUTES.PORTAL.CART)}
              className="px-4 py-2.5 rounded-lg border border-[#E6E2D8] text-[#0F1D36] hover:bg-[#FAF8F4] text-xs font-semibold cursor-pointer"
            >
              View Inquiries &amp; Proposals
            </button>
          </div>
          <div className="pt-3 border-t border-[#E6E2D8] text-xs text-[#64748B]">
            Direct Corporate Desk:{' '}
            <a href={corporateIdentity.contact.telephone.href} className="font-semibold text-[#0F4C3A] hover:underline">
              {corporateIdentity.contact.telephone.display}
            </a>{' '}
            ·{' '}
            <a href={`mailto:${corporateIdentity.contact.email}`} className="font-semibold text-[#0F1D36] hover:underline">
              {corporateIdentity.contact.email}
            </a>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Main Step Panel */}
          <div className="lg:col-span-2 bg-white border border-[#E6E2D8] rounded-xl p-6">
            {step === 0 && activeProposal && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-[#0F1D36]">
                    Step 1: Review Authorized Commercial Proposal ({activeProposal.proposalNumber})
                  </h2>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Verify the server-authorized scope, line items, and commercial terms issued by DESTRIA TECH INC.
                  </p>
                </div>

                {proposals.length > 1 && (
                  <div>
                    <label className="block text-xs font-medium text-[#334155] mb-1">
                      Select Approved Proposal
                    </label>
                    <select
                      value={selectedProposalId}
                      onChange={(e) => setSelectedProposalId(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-[#FAF8F4] border border-[#E6E2D8] rounded-lg"
                    >
                      {proposals.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.proposalNumber} — {p.title} ({formatMoney(p.totalMinor, p.currency)})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="p-4 rounded-lg bg-[#FAF8F4] border border-[#E6E2D8] text-xs text-[#334155] space-y-1">
                  <p className="font-semibold text-[#0F1D36]">{activeProposal.title}</p>
                  <p>{activeProposal.scopeSummary}</p>
                  <p className="text-[11px] text-[#64748B]">
                    Valid until {formatPortalDate(activeProposal.expiresAt)} · Issued by {activeProposal.issuedBy}
                  </p>
                </div>

                <div className="divide-y divide-[#E6E2D8] border border-[#E6E2D8] rounded-lg">
                  {activeProposal.items.map((item) => (
                    <div key={item.id} className="p-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-[#0F1D36]">{item.productName}</p>
                        <p className="text-xs text-[#64748B]">
                          {item.packageName} × {item.quantity}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-semibold tabular-nums text-[#0F1D36]">
                        {formatMoney(item.lineTotalMinor, activeProposal.currency)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => navigate(ROUTES.PORTAL.CART)}
                    className="inline-flex items-center gap-1.5 text-sm text-[#475569] hover:text-[#0F1D36] cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Proposals</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0F4C3A] hover:bg-[#0B3B2D] text-white text-sm font-semibold cursor-pointer"
                  >
                    <span>Continue to Billing</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-[#0F1D36]">Step 2: Client Billing Information</h2>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    These details will appear on your sequential DESTRIA TECH INC invoice and receipt.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#334155] mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-[#FAF8F4] border border-[#E6E2D8] rounded-lg focus:outline-none focus:border-[#0F4C3A]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#334155] mb-1">Billing Email *</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-[#FAF8F4] border border-[#E6E2D8] rounded-lg focus:outline-none focus:border-[#0F4C3A]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#334155] mb-1">Phone Number</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-[#FAF8F4] border border-[#E6E2D8] rounded-lg focus:outline-none focus:border-[#0F4C3A]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#334155] mb-1">Organization / Company</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-[#FAF8F4] border border-[#E6E2D8] rounded-lg focus:outline-none focus:border-[#0F4C3A]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#334155] mb-1">Tax ID / EIN (Optional)</label>
                    <input
                      type="text"
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-[#FAF8F4] border border-[#E6E2D8] rounded-lg focus:outline-none focus:border-[#0F4C3A]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#334155] mb-1">Billing Address</label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Street, City, State/Country"
                      className="w-full px-3 py-2 text-sm bg-[#FAF8F4] border border-[#E6E2D8] rounded-lg focus:outline-none focus:border-[#0F4C3A]"
                    />
                  </div>
                </div>
                <div className="flex justify-between pt-3">
                  <button
                    type="button"
                    onClick={() => setStep(0)}
                    className="inline-flex items-center gap-1.5 text-sm text-[#475569] hover:text-[#0F1D36] cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!fullName.trim() || !email.includes('@')) {
                        setError('Please enter your billing full name and a valid billing email.');
                        return;
                      }
                      setError('');
                      setStep(2);
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0F4C3A] hover:bg-[#0B3B2D] text-white text-sm font-semibold cursor-pointer"
                  >
                    <span>Continue to Project Brief</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-[#0F1D36]">
                    Step 3: Project Onboarding &amp; Technical Requirements
                  </h2>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Provide kickoff instructions and attach private technical specifications or SOW reference documents.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#334155] mb-1">Project Workspace Title</label>
                    <input
                      type="text"
                      value={projectTitle}
                      onChange={(e) => setProjectTitle(e.target.value)}
                      placeholder={activeProposal?.title || 'Enterprise Initiative'}
                      className="w-full px-3 py-2 text-sm bg-[#FAF8F4] border border-[#E6E2D8] rounded-lg focus:outline-none focus:border-[#0F4C3A]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#334155] mb-1">Target Delivery Date</label>
                    <input
                      type="date"
                      value={deliveryExpectation}
                      onChange={(e) => setDeliveryExpectation(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-[#FAF8F4] border border-[#E6E2D8] rounded-lg focus:outline-none focus:border-[#0F4C3A]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#334155] mb-1">Onboarding Objectives</label>
                  <textarea
                    rows={3}
                    value={creativeBrief}
                    onChange={(e) => setCreativeBrief(e.target.value)}
                    placeholder="Outline stakeholder contacts, target environments, architecture priorities, or compliance constraints..."
                    className="w-full px-3 py-2 text-sm bg-[#FAF8F4] border border-[#E6E2D8] rounded-lg focus:outline-none focus:border-[#0F4C3A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#334155] mb-1">Special Instructions</label>
                  <textarea
                    rows={2}
                    value={specialInstructions}
                    onChange={(e) => setSpecialInstructions(e.target.value)}
                    placeholder="Security access notes, NDA reference numbers, or executive kickoff preferences..."
                    className="w-full px-3 py-2 text-sm bg-[#FAF8F4] border border-[#E6E2D8] rounded-lg focus:outline-none focus:border-[#0F4C3A]"
                  />
                </div>

                <div className="p-4 rounded-lg bg-[#FAF8F4] border border-[#E6E2D8] space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-[#0F1D36]">Reference Materials (Private Upload)</p>
                      <p className="text-[11px] text-[#64748B]">
                        Allowed: JPG, PNG, WEBP, MP4, MOV, PDF, DOCX, XLSX, PPTX, ZIP (max 15 MB)
                      </p>
                    </div>
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#0F1D36] text-xs font-semibold text-[#0F1D36] hover:bg-[#0F1D36] hover:text-white transition-colors cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{uploadingRef ? 'Uploading...' : 'Attach File'}</span>
                      <input type="file" className="hidden" onChange={handleUploadReference} disabled={uploadingRef} />
                    </label>
                  </div>
                  {uploadedRefs.length > 0 && (
                    <ul className="space-y-1 text-xs text-[#334155]">
                      {uploadedRefs.map((ref) => (
                        <li key={ref.id} className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-[#0F4C3A]" />
                          <span>{ref.fileName}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex justify-between pt-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="inline-flex items-center gap-1.5 text-sm text-[#475569] hover:text-[#0F1D36] cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0F4C3A] hover:bg-[#0B3B2D] text-white text-sm font-semibold cursor-pointer"
                  >
                    <span>Continue to Payment Method</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-[#0F1D36]">Step 4: Settlement Method Selection</h2>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Select your authorized payment rail. Online gateways remain in verified readiness mode until merchant credentials and webhook tests are activated.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {providers.map((prov) => {
                    const selected = selectedProvider === prov.provider;
                    return (
                      <button
                        key={prov.provider}
                        type="button"
                        onClick={() => setSelectedProvider(prov.provider)}
                        className={`p-4 rounded-xl border text-left transition-colors cursor-pointer ${
                          selected
                            ? 'border-[#0F4C3A] bg-[#F4F9F7]'
                            : 'border-[#E6E2D8] bg-white hover:border-[#0F1D36]/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-[#0F1D36]">{prov.displayName}</span>
                          <span className="font-mono text-[10px] uppercase text-[#64748B]">{prov.mode}</span>
                        </div>
                        <p className="text-xs text-[#475569] mt-1">{prov.description}</p>
                        <p className="text-[11px] text-[#64748B] mt-2">
                          Currencies: {prov.supportedCurrencies.join(', ')}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {activeProviderConfig && !activeProviderConfig.isEnabled && (
                  <div className="p-4 rounded-lg bg-[#FFFBEB] border border-[#E7D8B1] text-xs text-[#785315] space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Payment Gateway Readiness Notice ({activeProviderConfig.displayName})</span>
                    </p>
                    <p>{activeProviderConfig.unavailableMessage}</p>
                    <p>
                      Submitting creates a verified pending order and sequential invoice linked to your approved proposal. Credits and project activation occur strictly upon verified settlement confirmation.
                    </p>
                  </div>
                )}

                <div className="flex justify-between pt-3">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="inline-flex items-center gap-1.5 text-sm text-[#475569] hover:text-[#0F1D36] cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handlePlaceOrder}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0F4C3A] hover:bg-[#0B3B2D] disabled:opacity-50 text-white text-sm font-semibold cursor-pointer"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>{submitting ? 'Recording Settlement...' : 'Confirm Authorized Order & Issue Invoice'}</span>
                  </button>
                </div>
              </div>
            )}

            {step === 4 && confirmation && (
              <div className="space-y-5">
                <div className="p-4 rounded-xl bg-[#F4F9F7] border border-[#C6E1D7] flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-[#0F4C3A] shrink-0 mt-0.5" />
                  <div>
                    <h2 className="text-base font-bold text-[#0F1D36]">
                      Authorized Order {confirmation.order.orderNumber} Recorded
                    </h2>
                    <p className="text-xs text-[#334155] mt-1">
                      Invoice <span className="font-mono font-semibold">{confirmation.invoice?.invoiceNumber}</span> has been issued. Payment status is{' '}
                      <span className={statusToneClass(confirmation.order.paymentStatus)}>
                        {formatStatusLabel(confirmation.order.paymentStatus)}
                      </span>{' '}
                      pending verified gateway settlement.
                    </p>
                  </div>
                </div>

                {confirmation.paymentInitiation?.message && (
                  <div className="p-4 rounded-lg bg-[#FFFBEB] border border-[#E7D8B1] text-xs text-[#785315]">
                    {confirmation.paymentInitiation.message}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border border-[#E6E2D8] rounded-xl p-4 text-xs">
                  <div>
                    <p className="text-[#64748B]">Order Reference</p>
                    <p className="font-mono font-semibold text-[#0F1D36] mt-0.5">
                      {confirmation.order.orderNumber}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#64748B]">Invoice Number</p>
                    <p className="font-mono font-semibold text-[#0F1D36] mt-0.5">
                      {confirmation.invoice?.invoiceNumber || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#64748B]">Authorized Proposal Total</p>
                    <p className="font-mono font-semibold text-[#0F1D36] mt-0.5">
                      {formatMoney(confirmation.order.totalMinor, confirmation.order.currency)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => navigate(buildOrderDetailRoute(confirmation.order.id))}
                    className="px-4 py-2.5 rounded-lg bg-[#0F4C3A] hover:bg-[#0B3B2D] text-white text-xs font-semibold cursor-pointer"
                  >
                    Open Authorized Order
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(ROUTES.PORTAL.INVOICES)}
                    className="px-4 py-2.5 rounded-lg border border-[#E6E2D8] text-[#0F1D36] hover:bg-[#FAF8F4] text-xs font-semibold cursor-pointer"
                  >
                    View Authorized Invoices
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Proposal Commercial Summary */}
          {activeProposal && (
            <aside className="bg-white border border-[#E6E2D8] rounded-xl p-5 space-y-4 sticky top-24">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#0F1D36]">Authorized Proposal Summary</h3>
                <span className="font-mono text-[11px] font-semibold text-[#0F4C3A]">
                  {activeProposal.proposalNumber}
                </span>
              </div>
              <div className="space-y-2 text-xs border-t border-[#E6E2D8] pt-3">
                <div className="flex justify-between text-[#475569]">
                  <span>Authorized Subtotal</span>
                  <span className="font-mono text-[#0F1D36]">
                    {formatMoney(activeProposal.subtotalMinor, activeProposal.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-[#475569]">
                  <span>Tax</span>
                  <span className="font-mono text-[#0F1D36]">
                    {formatMoney(activeProposal.taxMinor, activeProposal.currency)}
                  </span>
                </div>
                <div className="pt-2 border-t border-[#E6E2D8] flex justify-between items-baseline">
                  <span className="font-semibold text-[#0F1D36]">Authorized Total ({activeProposal.currency})</span>
                  <span className="font-mono text-lg font-bold tabular-nums text-[#0F1D36]">
                    {formatMoney(activeProposal.totalMinor, activeProposal.currency)}
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#FAF8F4] border border-[#E6E2D8] text-[11px] text-[#475569] flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-[#0F4C3A] shrink-0 mt-0.5" />
                <span>
                  Totals are bound strictly to your server-verified approved proposal and cannot be modified client-side.
                </span>
              </div>
            </aside>
          )}
        </div>
      )}
    </PortalLayout>
  );
};
