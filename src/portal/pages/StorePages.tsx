import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, Mail, Phone, Search, Send, ShieldCheck, X } from 'lucide-react';
import { PortalLayout } from '../components/PortalLayout';
import { portalRequest } from '../portalApi';
import { usePortalRouter } from '../PortalRouter';
import { usePortalAuth } from '../PortalAuthContext';
import {
  COMMERCIAL_ENGAGEMENT_STATEMENT,
  CORPORATE_SERVICE_STATEMENT,
  corporateIdentity,
} from '../../data/companyConfig';
import {
  formatMoney,
  formatPortalDate,
  formatStatusLabel,
  PortalApprovedProposal,
  Product,
  ProductCategory,
  statusToneClass,
} from '../portalTypes';

export const PortalStorePage: React.FC = () => {
  const { navigate, query } = usePortalRouter();
  const { profile, user } = usePortalAuth();
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState(query.get('category') || 'all');
  const [search, setSearch] = useState(query.get('q') || '');
  const [loading, setLoading] = useState(true);
  const [inquiryModalOpen, setInquiryModalOpen] = useState(false);

  // Enterprise service inquiry state (Zero public pricing / budget ranges)
  const [custCompany, setCustCompany] = useState(profile?.companyName || '');
  const [custContact, setCustContact] = useState(profile?.fullName || '');
  const [custEmail, setCustEmail] = useState(user?.email || '');
  const [custServices, setCustServices] = useState('Customized Enterprise Technology Solution');
  const [custVolume, setCustVolume] = useState('');
  const [custSchedule, setCustSchedule] = useState('');
  const [custDesc, setCustDesc] = useState('');
  const [custBusy, setCustBusy] = useState(false);
  const [custSuccess, setCustSuccess] = useState('');
  const [custError, setCustError] = useState('');

  useEffect(() => {
    const qCat = query.get('category');
    const qSearch = query.get('q');
    const qInquire = query.get('inquire');
    if (qCat) setSelectedCategory(qCat);
    if (qSearch !== null) setSearch(qSearch);
    if (qInquire) {
      setCustServices(qInquire);
      setInquiryModalOpen(true);
    }
  }, [query]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedCategory !== 'all') params.set('category', selectedCategory);
    if (search.trim()) params.set('q', search.trim());
    portalRequest<{ categories: ProductCategory[]; products: Product[] }>(
      `/catalog?${params.toString()}`
    )
      .then((res) => {
        if (active) {
          setCategories(res.categories);
          setProducts(res.products);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedCategory, search]);

  const openInquiryForSolution = (solutionName: string) => {
    setCustServices(solutionName);
    setCustError('');
    setCustSuccess('');
    setInquiryModalOpen(true);
  };

  const handleSubmitServiceInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustError('');
    setCustSuccess('');
    setCustBusy(true);
    try {
      const res = await portalRequest<{ inquiry: { referenceNumber: string } }>('/custom-inquiries', {
        method: 'POST',
        body: {
          companyName: custCompany,
          contactPerson: custContact,
          email: custEmail,
          requiredServices: custServices.split(',').map((s) => s.trim()).filter(Boolean),
          estimatedMonthlyVolume: custVolume,
          budgetRange: 'Subject to Formal Assessment',
          expectedSchedule: custSchedule,
          projectDescription: custDesc,
        },
      });
      setCustSuccess(
        `Service Inquiry ${res.inquiry.referenceNumber} has been logged. Our solutions team will coordinate consultation, technical assessment, and formal proposal preparation.`
      );
      setCustDesc('');
    } catch (err: any) {
      setCustError(err?.message || 'Unable to submit service inquiry.');
    } finally {
      setCustBusy(false);
    }
  };

  return (
    <PortalLayout
      title="Technology Solutions Directory"
      subtitle="Explore customized enterprise solution frameworks. Commercial terms and scope are structured exclusively following consultation and formal technical assessment."
    >
      {/* Top Toolbar (Zero currency switches or pricing comparison tables) */}
      <div className="bg-white border border-[#E6E2D8] rounded-xl p-4 mb-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search enterprise solutions, deliverables, or capability frameworks..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-[#FAF8F4] border border-[#E6E2D8] rounded-lg text-[#0F1D36] focus:outline-none focus:border-[#0F4C3A]"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => navigate('/portal/cart')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#E6E2D8] bg-white hover:bg-[#FAF8F4] text-xs font-semibold text-[#0F1D36] cursor-pointer whitespace-nowrap"
            >
              <span>View Inquiries &amp; Proposals</span>
            </button>
            <button
              type="button"
              onClick={() => openInquiryForSolution('Customized Enterprise Technology Solution')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0F4C3A] hover:bg-[#0B3B2D] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <span>Request a Consultation</span>
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-[#0F4C3A] text-white'
                : 'bg-[#FAF8F4] text-[#475569] hover:text-[#0F1D36]'
            }`}
          >
            All Solution Divisions
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.slug)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                selectedCategory === cat.slug
                  ? 'bg-[#0F4C3A] text-white'
                  : 'bg-[#FAF8F4] text-[#475569] hover:text-[#0F1D36]'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Commercial Engagement Governance Notice */}
      <div className="mb-6 px-5 py-4 rounded-xl bg-white border border-[#E6E2D8] text-xs text-[#334155] space-y-2">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-[#0F4C3A] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-[#0F1D36]">Customized Enterprise Engagement Policy</p>
            <p className="leading-relaxed">{CORPORATE_SERVICE_STATEMENT}</p>
            <p className="text-[#475569] leading-relaxed">{COMMERCIAL_ENGAGEMENT_STATEMENT}</p>
          </div>
        </div>
      </div>

      {/* Solutions Grid (Zero public prices, zero Add-to-Cart) */}
      {loading ? (
        <div className="p-8 text-sm text-[#64748B]">Loading Technology Solutions Directory...</div>
      ) : products.length === 0 ? (
        <div className="bg-white border border-[#E6E2D8] rounded-xl p-10 text-center">
          <p className="text-sm font-semibold text-[#0F1D36]">No matching solutions found</p>
          <p className="mt-1 text-xs text-[#64748B]">Try another search term or select a different division.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {products.map((product) => {
            const pkg = product.packages[0];
            const catName = categories.find((c) => c.slug === product.categorySlug)?.name || product.categorySlug;

            return (
              <article
                key={product.id}
                className="bg-white border border-[#E6E2D8] rounded-xl p-5 flex flex-col justify-between hover:border-[#0F4C3A]/50 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-[#64748B]">
                    <span>{catName}</span>
                    {pkg?.isPopular && <span className="font-semibold text-[#B8923A]">Featured Framework</span>}
                  </div>
                  <h3 className="mt-1.5 text-base font-bold text-[#0F1D36]">{product.name}</h3>
                  <p className="mt-1.5 text-xs text-[#475569] leading-relaxed">{product.shortDescription}</p>

                  <div className="mt-4 pt-3 border-t border-[#F2EFE8] space-y-1">
                    <div className="text-xs font-bold uppercase tracking-wider text-[#0F4C3A]">
                      {pkg?.engagementLabel || 'Customized Enterprise Solution'}
                    </div>
                    <div className="text-[11px] text-[#64748B]">
                      Commercial Scope: {pkg?.assessmentBasis || 'Subject to Formal Assessment'}
                    </div>
                  </div>

                  <ul className="mt-3 space-y-1.5 text-xs text-[#334155]">
                    {(pkg?.features || []).slice(0, 4).map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-[#0F4C3A] shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-5 pt-4 border-t border-[#F2EFE8] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/portal/store/${product.slug}`)}
                    className="flex-1 py-2 px-3 rounded-lg border border-[#E6E2D8] text-xs font-semibold text-[#0F1D36] hover:bg-[#FAF8F4] cursor-pointer whitespace-nowrap"
                  >
                    Explore Solution
                  </button>
                  <button
                    type="button"
                    onClick={() => openInquiryForSolution(product.name)}
                    className="flex-1 py-2 px-3 rounded-lg bg-[#0F4C3A] hover:bg-[#0B3B2D] text-white text-xs font-semibold cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Request This Solution</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Service Inquiry & Formal Proposal Request Modal */}
      {inquiryModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#0F1D36]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E6E2D8] rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between pb-4 border-b border-[#E6E2D8]">
              <div>
                <h2 className="text-lg font-bold text-[#0F1D36]">Initiate Service Inquiry</h2>
                <p className="text-xs text-[#64748B]">
                  Submit your project requirements for consultation, technical assessment, and formal proposal preparation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInquiryModalOpen(false)}
                className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F1D36] cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitServiceInquiry} className="mt-4 space-y-3.5">
              {custError && <div className="p-3 rounded-lg bg-rose-50 text-xs text-[#B91C1C]">{custError}</div>}
              {custSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-[#15803D] space-y-2">
                  <p>{custSuccess}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setInquiryModalOpen(false);
                      navigate('/portal/cart');
                    }}
                    className="font-semibold underline cursor-pointer"
                  >
                    Open Inquiries &amp; Proposals →
                  </button>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">Organization / Company Name</label>
                  <input
                    required
                    value={custCompany}
                    onChange={(e) => setCustCompany(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#D8D3C8] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">Authorized Contact Person</label>
                  <input
                    required
                    value={custContact}
                    onChange={(e) => setCustContact(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#D8D3C8] rounded-lg"
                  />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">Corporate Email Address</label>
                  <input
                    type="email"
                    required
                    value={custEmail}
                    onChange={(e) => setCustEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#D8D3C8] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">Operational Scale / Volume</label>
                  <input
                    value={custVolume}
                    onChange={(e) => setCustVolume(e.target.value)}
                    placeholder="e.g. Multi-region enterprise rollout"
                    className="w-full px-3 py-2 text-sm border border-[#D8D3C8] rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">Requested Solution Frameworks</label>
                <input
                  required
                  value={custServices}
                  onChange={(e) => setCustServices(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D8D3C8] rounded-lg"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">Commercial Assessment Basis</label>
                  <input
                    readOnly
                    value="Subject to Formal Assessment"
                    className="w-full px-3 py-2 text-sm bg-[#FAF8F4] border border-[#E6E2D8] rounded-lg text-[#475569]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">Target Delivery Window</label>
                  <input
                    value={custSchedule}
                    onChange={(e) => setCustSchedule(e.target.value)}
                    placeholder="e.g. Q2 architectural assessment"
                    className="w-full px-3 py-2 text-sm border border-[#D8D3C8] rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">Project Requirements &amp; Technical Context</label>
                <textarea
                  required
                  rows={4}
                  value={custDesc}
                  onChange={(e) => setCustDesc(e.target.value)}
                  placeholder="Describe business objectives, systems integration scope, compliance requirements, and expected deliverables..."
                  className="w-full px-3 py-2 text-sm border border-[#D8D3C8] rounded-lg"
                />
              </div>

              <div className="p-3 rounded-lg bg-[#FAF8F4] border border-[#E6E2D8] text-[11px] text-[#475569] flex flex-wrap items-center justify-between gap-2">
                <span>Prefer direct executive coordination?</span>
                <div className="flex items-center gap-3 font-semibold text-[#0F1D36]">
                  <a href={corporateIdentity.contact.telephone.href} className="inline-flex items-center gap-1 hover:text-[#0F4C3A]">
                    <Phone className="w-3 h-3" />
                    <span>{corporateIdentity.contact.telephone.display}</span>
                  </a>
                  <a href={`mailto:${corporateIdentity.contact.email}`} className="inline-flex items-center gap-1 hover:text-[#0F4C3A]">
                    <Mail className="w-3 h-3" />
                    <span>{corporateIdentity.contact.email}</span>
                  </a>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setInquiryModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[#E6E2D8] text-xs font-semibold text-[#334155] cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={custBusy}
                  className="px-5 py-2 rounded-lg bg-[#0F4C3A] hover:bg-[#0B3B2D] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                >
                  {custBusy ? 'Submitting...' : 'Submit Project Requirements'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PortalLayout>
  );
};

export const PortalProductDetailPage: React.FC<{ slug: string }> = ({ slug }) => {
  const { navigate } = usePortalRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    portalRequest<{ product: Product }>(`/catalog/${encodeURIComponent(slug)}`)
      .then((res) => {
        if (active) setProduct(res.product);
      })
      .catch(() => {
        if (active) setProduct(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <PortalLayout title="Solution Specifications">
        <div className="p-8 text-sm text-[#64748B]">Loading solution architecture...</div>
      </PortalLayout>
    );
  }

  if (!product) {
    return (
      <PortalLayout title="Solution Not Found">
        <div className="bg-white border border-[#E6E2D8] rounded-xl p-8 text-center">
          <p className="text-sm text-[#334155]">This solution framework could not be found in the directory.</p>
          <button
            type="button"
            onClick={() => navigate('/portal/store')}
            className="mt-4 px-4 py-2 rounded-lg bg-[#0F4C3A] text-white text-xs font-semibold cursor-pointer"
          >
            Back to Solutions Directory
          </button>
        </div>
      </PortalLayout>
    );
  }

  const pkg = product.packages[0];

  return (
    <PortalLayout title={product.name} subtitle={product.shortDescription}>
      <button
        type="button"
        onClick={() => navigate('/portal/store')}
        className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F4C3A] hover:underline cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Solutions Directory</span>
      </button>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6 items-start">
        <div className="space-y-6">
          <section className="bg-white border border-[#E6E2D8] rounded-xl p-6">
            <h2 className="text-base font-bold text-[#0F1D36]">Solution Overview</h2>
            <p className="mt-2 text-sm text-[#334155] leading-relaxed">{product.fullDescription}</p>

            <div className="mt-6 grid sm:grid-cols-2 gap-6 pt-5 border-t border-[#EFECE4]">
              <div>
                <h3 className="text-xs font-semibold text-[#0F1D36] uppercase tracking-wider mb-2.5">
                  Solution Capabilities &amp; Scope
                </h3>
                <ul className="space-y-2 text-sm text-[#334155]">
                  {(pkg?.features || []).map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-[#0F4C3A] shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-[#0F1D36] uppercase tracking-wider mb-2.5">
                  Representative Deliverables
                </h3>
                <ul className="space-y-2 text-sm text-[#334155]">
                  {product.sampleDeliverables.map((d) => (
                    <li key={d}>· {d}</li>
                  ))}
                </ul>
                <h3 className="text-xs font-semibold text-[#0F1D36] uppercase tracking-wider mt-5 mb-2">
                  Client Discovery Inputs
                </h3>
                <ul className="space-y-1.5 text-sm text-[#475569]">
                  {product.requiredClientMaterials.map((m) => (
                    <li key={m}>· {m}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="bg-white border border-[#E6E2D8] rounded-xl p-6">
            <h2 className="text-base font-bold text-[#0F1D36] mb-3">Engagement Governance &amp; Terms</h2>
            <p className="text-sm text-[#475569] leading-relaxed">{product.termsSummary}</p>
            <p className="mt-3 text-xs text-[#475569] leading-relaxed">{COMMERCIAL_ENGAGEMENT_STATEMENT}</p>
            <h3 className="text-sm font-bold text-[#0F1D36] mt-6 mb-3">Frequently Asked Questions</h3>
            <div className="divide-y divide-[#EFECE4]">
              {product.faqs.map((faq) => (
                <div key={faq.question} className="py-3">
                  <p className="text-sm font-semibold text-[#0F1D36]">{faq.question}</p>
                  <p className="mt-1 text-xs text-[#475569] leading-relaxed">{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Sticky Enterprise Engagement Summary (Zero Public Pricing) */}
        <aside className="bg-white border border-[#E6E2D8] rounded-xl p-6 sticky top-24 space-y-4">
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#0F4C3A]">
              {pkg?.engagementLabel || 'Customized Enterprise Solution'}
            </span>
            <h2 className="text-xl font-bold text-[#0F1D36]">Subject to Formal Assessment</h2>
            <p className="text-xs text-[#64748B] leading-relaxed">
              Commercial terms, deliverables, and deployment schedules are formally structured following consultation and technical scoping.
            </p>
          </div>

          <dl className="divide-y divide-[#F2EFE8] text-xs">
            <div className="py-2 flex justify-between gap-2">
              <dt className="text-[#64748B]">Delivery Cadence</dt>
              <dd className="font-medium text-[#0F1D36] text-right">{pkg?.turnaroundLabel || 'Per Approved SOW'}</dd>
            </div>
            <div className="py-2 flex justify-between gap-2">
              <dt className="text-[#64748B]">Support Structure</dt>
              <dd className="font-medium text-[#0F1D36] text-right">{pkg?.supportLevel || 'Enterprise Advisory'}</dd>
            </div>
            <div className="py-2 flex justify-between gap-2">
              <dt className="text-[#64748B]">Engagement Authorization</dt>
              <dd className="font-medium text-[#0F1D36] text-right">Formal Proposal Required</dd>
            </div>
            <div className="py-2 flex justify-between gap-2">
              <dt className="text-[#64748B]">Operational Scope</dt>
              <dd className="font-medium text-[#0F1D36] text-right">{pkg?.usageLimits || 'Defined in SOW'}</dd>
            </div>
          </dl>

          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              onClick={() => navigate(`/portal/store?inquire=${encodeURIComponent(product.name)}`)}
              className="w-full py-2.5 px-4 rounded-lg bg-[#0F4C3A] hover:bg-[#0B3B2D] text-white text-sm font-semibold cursor-pointer"
            >
              Request a Formal Proposal
            </button>
            <button
              type="button"
              onClick={() => navigate('/portal/cart')}
              className="w-full py-2.5 px-4 rounded-lg border border-[#0F1D36] text-[#0F1D36] hover:bg-[#FAF8F4] text-sm font-semibold cursor-pointer"
            >
              Review My Inquiries &amp; Proposals
            </button>
          </div>

          <div className="pt-3 border-t border-[#F2EFE8] text-xs text-[#475569] space-y-1">
            <p className="font-semibold text-[#0F1D36]">Direct Corporate Contact</p>
            <a href={corporateIdentity.contact.telephone.href} className="block text-[#0F4C3A] font-medium hover:underline">
              {corporateIdentity.contact.telephone.display}
            </a>
            <a href={`mailto:${corporateIdentity.contact.email}`} className="block text-[#475569] hover:text-[#0F1D36]">
              {corporateIdentity.contact.email}
            </a>
          </div>
        </aside>
      </div>
    </PortalLayout>
  );
};

export const PortalMyServicesPage: React.FC = () => {
  const { navigate } = usePortalRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [proposals, setProposals] = useState<PortalApprovedProposal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      portalRequest<{ orders: any[] }>('/orders'),
      portalRequest<{ inquiries: any[] }>('/custom-inquiries'),
      portalRequest<{ proposals: PortalApprovedProposal[] }>('/proposals'),
    ])
      .then(([ord, inq, prop]) => {
        setOrders(ord.orders || []);
        setInquiries(inq.inquiries || []);
        setProposals(prop.proposals || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const engagedItems = orders.flatMap((order) =>
    (order.items || []).map((item: any) => ({
      ...item,
      orderId: order.id,
      orderNumber: order.orderNumber,
      currency: order.currency,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      createdAt: order.createdAt,
    }))
  );

  return (
    <PortalLayout
      title="My Engagements & Inquiries"
      subtitle="Authorized enterprise engagements, approved commercial proposals, and active consultation inquiries."
    >
      <div className="space-y-6">
        <section className="bg-white border border-[#E6E2D8] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E6E2D8] flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[#0F1D36]">Authorized Active &amp; Historical Engagements</h2>
            <button
              type="button"
              onClick={() => navigate('/portal/store')}
              className="px-3.5 py-2 rounded-lg bg-[#0F4C3A] text-white text-xs font-semibold cursor-pointer"
            >
              Explore Solutions Directory
            </button>
          </div>
          {loading ? (
            <div className="p-6 text-sm text-[#64748B]">Loading your engagements...</div>
          ) : engagedItems.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-semibold text-[#0F1D36]">No authorized engagements recorded yet</p>
              <p className="mt-1 text-xs text-[#64748B]">
                Submit a service inquiry through the Solutions Directory to initiate consultation and formal proposal issuance.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#FAF8F4] text-xs text-[#64748B] border-b border-[#E6E2D8]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Engagement</th>
                    <th className="px-4 py-3 font-medium">Order</th>
                    <th className="px-4 py-3 font-medium">Settlement</th>
                    <th className="px-4 py-3 font-medium">Delivery</th>
                    <th className="px-4 py-3 font-medium text-right">Authorized Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFECE4]">
                  {engagedItems.map((item) => (
                    <tr key={item.id} className="hover:bg-[#FAF8F4]/70">
                      <td className="px-4 py-3 font-medium text-[#0F1D36]">{item.productName}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/portal/orders/${item.orderId}`)}
                          className="font-mono text-xs text-[#0F4C3A] font-semibold hover:underline cursor-pointer"
                        >
                          {item.orderNumber}
                        </button>
                      </td>
                      <td className={`px-4 py-3 text-xs ${statusToneClass(item.paymentStatus)}`}>
                        {formatStatusLabel(item.paymentStatus)}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#475569]">
                        {formatStatusLabel(item.fulfillmentStatus)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums">
                        {formatMoney(item.lineTotalMinor, item.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {proposals.length > 0 && (
          <section className="bg-white border border-[#E6E2D8] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E6E2D8] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#0F1D36]">Issued Formal Proposals</h2>
              <button
                type="button"
                onClick={() => navigate('/portal/cart')}
                className="text-xs font-semibold text-[#0F4C3A] hover:underline cursor-pointer"
              >
                Manage Proposals →
              </button>
            </div>
            <div className="divide-y divide-[#EFECE4]">
              {proposals.map((prop) => (
                <div key={prop.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-[#64748B]">
                      <span className="font-mono font-semibold text-[#0F1D36]">{prop.proposalNumber}</span> · Issued{' '}
                      {formatPortalDate(prop.issuedAt)}
                    </div>
                    <p className="text-sm font-semibold text-[#0F1D36] mt-0.5">{prop.title}</p>
                    <p className="text-xs text-[#475569]">{prop.scopeSummary}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-[#0F1D36]">
                      {formatMoney(prop.totalMinor, prop.currency)}
                    </div>
                    <span className={`text-xs ${statusToneClass(prop.status)}`}>
                      {formatStatusLabel(prop.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {inquiries.length > 0 && (
          <section className="bg-white border border-[#E6E2D8] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E6E2D8]">
              <h2 className="text-base font-semibold text-[#0F1D36]">Submitted Service Inquiries</h2>
            </div>
            <div className="divide-y divide-[#EFECE4]">
              {inquiries.map((inq) => (
                <div key={inq.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-[#64748B]">
                      <span className="font-mono font-semibold text-[#0F1D36]">{inq.referenceNumber}</span> ·{' '}
                      {formatPortalDate(inq.createdAt)}
                    </div>
                    <p className="text-sm font-semibold text-[#0F1D36] mt-0.5">{inq.companyName}</p>
                    <p className="text-xs text-[#475569]">{inq.projectDescription}</p>
                  </div>
                  <span className="text-xs font-semibold text-[#B45309]">{formatStatusLabel(inq.status)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </PortalLayout>
  );
};
