import React, { useState, useEffect, useRef } from 'react';
import { servicesData } from '../data/servicesData';
import { CATALOG_CATEGORIES, SERVICE_CATALOG } from '../data/serviceCatalog';
import { InquiryFormData } from '../types';
import {
  Send,
  CheckCircle2,
  AlertCircle,
  Paperclip,
  FileText,
  Shield,
  Building,
  Phone,
  Mail,
  User,
} from 'lucide-react';
import {
  corporateIdentity,
  COMMERCIAL_ENGAGEMENT_STATEMENT,
} from '../data/companyConfig';
import { apiUrl, createIdempotencyKey } from '../lib/apiClient';

interface ContactSectionProps {
  selectedServiceId?: string;
  onInquirySubmitted?: (inquiry: any) => void;
  onOpenLegal?: (sectionId?: string) => void;
}

export const ContactSection: React.FC<ContactSectionProps> = ({
  selectedServiceId,
  onInquirySubmitted,
  onOpenLegal,
}) => {
  const [formData, setFormData] = useState<InquiryFormData>({
    fullName: '',
    email: '',
    contactNumber: '',
    company: '',
    serviceId: selectedServiceId || 'multimedia-production',
    projectDescription: '',
    estimatedBudget: 'Subject to Formal Assessment',
    fileName: '',
    privacyConsent: false,
  });

  useEffect(() => {
    if (selectedServiceId) {
      setFormData((prev) => ({ ...prev, serviceId: selectedServiceId }));
    }
  }, [selectedServiceId]);

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [websiteHoneypot, setWebsiteHoneypot] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedRecord, setSubmittedRecord] = useState<{
    referenceId: string;
    emailDeliveryStatus: string;
    emailConfigured: boolean;
  } | null>(null);

  const idempotencyKeyRef = useRef<string>(createIdempotencyKey());
  useEffect(() => {
    idempotencyKeyRef.current = createIdempotencyKey();
  }, [formData]);

  const engagementScopeOptions = [
    { value: 'Subject to Formal Assessment', label: 'Subject to Formal Assessment (Default)' },
    { value: 'Single Solution Technical Assessment', label: 'Single Solution Technical Assessment' },
    { value: 'Multi-Division Enterprise Architecture', label: 'Multi-Division Enterprise Architecture' },
    { value: 'Managed Enterprise Stewardship', label: 'Managed Enterprise Stewardship & Support' },
  ];

  const validate = (): boolean => {
    const errs: { [key: string]: string } = {};

    if (!formData.fullName.trim() || formData.fullName.trim().length < 2) {
      errs.fullName = 'Full legal name is required.';
    }

    if (!formData.email.trim()) {
      errs.email = 'Corporate or business email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errs.email = 'Please provide a valid email format.';
    }

    if (!formData.contactNumber.trim() || formData.contactNumber.replace(/[^0-9]/g, '').length < 5) {
      errs.contactNumber = 'Direct telephone number is required.';
    }

    if (!formData.company.trim() || formData.company.trim().length < 2) {
      errs.company = 'Organization or enterprise name is required.';
    }

    if (!formData.projectDescription.trim() || formData.projectDescription.trim().length < 20) {
      errs.projectDescription = 'Please describe your project requirements in at least 20 characters.';
    }

    if (!formData.privacyConsent) {
      errs.privacyConsent = 'You must acknowledge the corporate governance and privacy terms.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 25 * 1024 * 1024) {
        setErrors((prev) => ({ ...prev, fileName: 'File size exceeds 25MB limit.' }));
      } else {
        setFormData((prev) => ({ ...prev, fileName: file.name }));
        setErrors((prev) => {
          const rest = { ...prev };
          delete rest.fileName;
          return rest;
        });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitError(null);
    if (!validate()) return;

    setIsSubmitting(true);

    const matchedCatalog = SERVICE_CATALOG.find((s) => s.id === formData.serviceId);
    const matchedLegacy = servicesData.find((s) => s.id === formData.serviceId);
    const resolvedTitle = matchedCatalog?.title || matchedLegacy?.title || formData.serviceId;

    try {
      const response = await fetch(apiUrl('/api/inquiries'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          idempotencyKey: idempotencyKeyRef.current,
          type: 'contact_form',
          fullName: formData.fullName.trim(),
          email: formData.email.trim(),
          contactNumber: formData.contactNumber.trim(),
          company: formData.company.trim(),
          serviceId: formData.serviceId,
          serviceTitle: resolvedTitle,
          selectedServiceIds: matchedCatalog ? [matchedCatalog.id] : [],
          estimatedBudget: 'Subject to Formal Assessment',
          projectDescription: formData.projectDescription.trim(),
          fileName: formData.fileName || undefined,
          privacyConsent: formData.privacyConsent,
          websiteHoneypot,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.referenceId) {
        throw new Error(
          data.error ||
            'Unable to persist your inquiry on the server right now. Your inputs remain intact so you can retry.'
        );
      }

      if (onInquirySubmitted) {
        onInquirySubmitted(data.inquiry);
      }

      setSubmittedRecord({
        referenceId: data.referenceId,
        emailDeliveryStatus: data.emailDelivery?.customerStatus || 'unconfigured',
        emailConfigured: Boolean(data.emailDelivery?.emailConfigured),
      });
      idempotencyKeyRef.current = createIdempotencyKey();
    } catch (err: any) {
      setSubmitError(
        err?.message || 'Submission failed. Your details are preserved—please review or contact us directly.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      fullName: '',
      email: '',
      contactNumber: '',
      company: '',
      serviceId: 'multimedia-production',
      projectDescription: '',
      estimatedBudget: 'Subject to Formal Assessment',
      fileName: '',
      privacyConsent: false,
    });
    setSubmittedRecord(null);
    setErrors({});
    setSubmitError(null);
  };

  return (
    <section id="contact" className="py-20 lg:py-28 bg-[#0B1220] border-t border-slate-800/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
          {/* Left Column */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-8">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#00C2C7] uppercase tracking-wider mb-2 font-mono">
                <span>Request a Consultation</span>
                <span aria-hidden="true">·</span>
                <span>Formal Proposal Intake</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white text-balance">
                Initiate Your Customized Enterprise Engagement
              </h2>
              <p className="mt-4 text-sm sm:text-base text-slate-300 leading-relaxed text-balance">
                {COMMERCIAL_ENGAGEMENT_STATEMENT}
              </p>

              <div className="mt-8 space-y-4">
                <div className="p-4 rounded-xl bg-[#111827] border border-slate-800 flex items-start gap-3.5">
                  <User className="w-5 h-5 text-[#00C2C7] shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-mono text-slate-400 block uppercase">
                      Direct Corporate Telephone
                    </span>
                    <a
                      href={corporateIdentity.contact.telephone.href}
                      className="inline-flex items-center gap-1.5 text-sm font-mono font-semibold text-[#00C2C7] hover:underline mt-0.5"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{corporateIdentity.contact.telephone.display}</span>
                    </a>
                    <p className="text-xs text-slate-400 mt-1">
                      Executive &amp; solutions architecture consultation desk for {corporateIdentity.legalName}.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#111827] border border-slate-800 flex items-start gap-3.5">
                  <Mail className="w-5 h-5 text-[#0EA5E9] shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-mono text-slate-400 block uppercase">
                      Official Corporate Email
                    </span>
                    <a
                      href={`mailto:${corporateIdentity.contact.email}`}
                      className="text-sm font-semibold text-[#00C2C7] hover:underline font-mono block mt-0.5"
                    >
                      {corporateIdentity.contact.email}
                    </a>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Verified corporate dispatch channel for formal proposals, RFPs, and enterprise inquiries.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#111827] border border-slate-800 flex items-start gap-3.5">
                  <Building className="w-5 h-5 text-[#00C2C7] shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="text-xs font-mono text-slate-400 block uppercase">
                      Corporate Headquarters ({corporateIdentity.jurisdiction})
                    </span>
                    <p className="text-xs text-slate-200 leading-relaxed">
                      {corporateIdentity.headquarters.fullAddress}
                    </p>
                    <p className="text-[11px] text-slate-400 pt-0.5">
                      Registered corporate address for official correspondence. Consultations are conducted
                      remotely or by prior appointment.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#111827] border border-slate-800 flex items-start gap-3.5">
                  <Shield className="w-5 h-5 text-[#D4AF37] shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-mono text-slate-400 block uppercase">
                      Confidentiality &amp; Governance
                    </span>
                    <span className="text-sm font-semibold text-white">
                      Mutual NDA Available Upon Engagement
                    </span>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Please avoid submitting sensitive credentials or regulated personal records prior to
                      executing a formal confidentiality agreement.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800/80 text-xs text-slate-400">
              <span>
                All submitted inquiries receive a server-recorded tracking reference and are routed for
                executive and technical review.
              </span>
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-7">
            <div className="rounded-2xl bg-[#111827] border border-slate-800 p-6 sm:p-8 relative shadow-2xl">
              {submittedRecord ? (
                <div className="py-8 text-center space-y-4">
                  <div className="w-14 h-14 rounded-full bg-[#00C2C7]/10 border border-[#00C2C7]/30 flex items-center justify-center text-[#00C2C7] mx-auto">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-white">Service Inquiry Logged Successfully</h3>
                  <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                    Your inquiry has been persisted under reference number{' '}
                    <span className="font-mono text-[#00C2C7] font-bold">
                      {submittedRecord.referenceId}
                    </span>{' '}
                    and assigned for review by the{' '}
                    <span className="text-white font-semibold">{corporateIdentity.legalName}</span>{' '}
                    solutions architecture team.
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                    {submittedRecord.emailDeliveryStatus === 'sent'
                      ? 'Confirmation email dispatched to your inbox.'
                      : 'Server persistence verified. Automated email notification awaits transactional email configuration.'}
                  </p>
                  <div className="pt-4 flex justify-center gap-3">
                    <button
                      onClick={resetForm}
                      className="px-5 py-2.5 text-xs font-semibold text-[#111827] bg-[#00C2C7] hover:bg-[#00d6dc] rounded-lg cursor-pointer transition-all"
                    >
                      Submit Another Inquiry
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <div className="hidden" aria-hidden="true">
                    <label htmlFor="contact-website-hp">Company Website</label>
                    <input
                      id="contact-website-hp"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={websiteHoneypot}
                      onChange={(e) => setWebsiteHoneypot(e.target.value)}
                    />
                  </div>
                  {submitError && (
                    <div
                      role="alert"
                      className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 flex items-start gap-2"
                    >
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Full Legal Name <span className="text-[#00C2C7]">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.fullName}
                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                        placeholder="e.g. Jordan Mercer"
                        className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#00C2C7] focus:ring-1 focus:ring-[#00C2C7]"
                      />
                      {errors.fullName && <p className="text-[11px] text-rose-400 mt-1">{errors.fullName}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Corporate or Business Email <span className="text-[#00C2C7]">*</span>
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="e.g. contact@organization.com"
                        className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#00C2C7] focus:ring-1 focus:ring-[#00C2C7]"
                      />
                      {errors.email && <p className="text-[11px] text-rose-400 mt-1">{errors.email}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Direct Telephone Number <span className="text-[#00C2C7]">*</span>
                      </label>
                      <input
                        type="tel"
                        value={formData.contactNumber}
                        onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                        placeholder="+1 (XXX) XXX-XXXX"
                        className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#00C2C7] focus:ring-1 focus:ring-[#00C2C7]"
                      />
                      {errors.contactNumber && (
                        <p className="text-[11px] text-rose-400 mt-1">{errors.contactNumber}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Organization or Enterprise Name <span className="text-[#00C2C7]">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.company}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        placeholder="e.g. Apex Systems Global"
                        className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#00C2C7] focus:ring-1 focus:ring-[#00C2C7]"
                      />
                      {errors.company && <p className="text-[11px] text-rose-400 mt-1">{errors.company}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Solution Division / Framework <span className="text-[#00C2C7]">*</span>
                      </label>
                      <select
                        value={formData.serviceId}
                        onChange={(e) => setFormData({ ...formData, serviceId: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-[#00C2C7] focus:ring-1 focus:ring-[#00C2C7] cursor-pointer"
                      >
                        <optgroup label="Core Enterprise Disciplines">
                          {servicesData.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.number}. {s.title}
                            </option>
                          ))}
                        </optgroup>
                        {CATALOG_CATEGORIES.filter((c) => c.id !== 'all').map((cat) => (
                          <optgroup key={cat.id} label={`${cat.number}. ${cat.label}`}>
                            {SERVICE_CATALOG.filter((item) => item.categoryId === cat.id).map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.title}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Engagement Scope
                      </label>
                      <select
                        value={formData.estimatedBudget}
                        onChange={(e) => setFormData({ ...formData, estimatedBudget: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-[#00C2C7] focus:ring-1 focus:ring-[#00C2C7] cursor-pointer"
                      >
                        {engagementScopeOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Project Requirements &amp; Technical Objectives <span className="text-[#00C2C7]">*</span>
                    </label>
                    <textarea
                      rows={4}
                      value={formData.projectDescription}
                      onChange={(e) => setFormData({ ...formData, projectDescription: e.target.value })}
                      placeholder="Outline your operational goals, target architecture, integration needs, security/compliance requirements, and desired consultation schedule..."
                      className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#00C2C7] focus:ring-1 focus:ring-[#00C2C7]"
                    />
                    {errors.projectDescription && (
                      <p className="text-[11px] text-rose-400 mt-1">{errors.projectDescription}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      RFP or Architecture Reference Filename (Optional)
                    </label>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer transition-colors">
                        <Paperclip className="w-3.5 h-3.5 text-[#00C2C7]" />
                        <span>Choose File</span>
                        <input
                          type="file"
                          onChange={handleFileUpload}
                          className="hidden"
                          accept=".pdf,.doc,.docx,.zip,.png,.jpg,.jpeg"
                        />
                      </label>
                      {formData.fileName ? (
                        <span className="text-xs text-[#00C2C7] truncate flex items-center gap-1.5 font-mono">
                          <FileText className="w-3.5 h-3.5" />
                          {formData.fileName}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">PDF, Word, ZIP or Image</span>
                      )}
                    </div>
                    {errors.fileName && <p className="text-[11px] text-rose-400 mt-1">{errors.fileName}</p>}
                  </div>

                  <div className="pt-2">
                    <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={formData.privacyConsent}
                        onChange={(e) => setFormData({ ...formData, privacyConsent: e.target.checked })}
                        className="mt-0.5 rounded bg-slate-900 border-slate-700 text-[#00C2C7] focus:ring-[#00C2C7]"
                      />
                      <span>
                        I authorize {corporateIdentity.legalName} to review this inquiry under the{' '}
                        <button
                          type="button"
                          onClick={() => onOpenLegal?.('privacy-policy')}
                          className="text-[#00C2C7] hover:underline cursor-pointer"
                        >
                          Privacy Policy
                        </button>{' '}
                        and{' '}
                        <button
                          type="button"
                          onClick={() => onOpenLegal?.('commercial-engagement-policy')}
                          className="text-[#00C2C7] hover:underline cursor-pointer"
                        >
                          Commercial Engagement Policy
                        </button>
                        .
                      </span>
                    </label>
                    {errors.privacyConsent && (
                      <p className="text-[11px] text-rose-400 mt-1">{errors.privacyConsent}</p>
                    )}
                  </div>

                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3 px-6 text-sm font-semibold text-[#0B1220] bg-[#00C2C7] hover:bg-[#00d6dc] disabled:opacity-50 rounded-lg shadow-lg shadow-[#00C2C7]/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isSubmitting ? (
                        <span>Logging Enterprise Inquiry...</span>
                      ) : (
                        <>
                          <span>Initiate Service Inquiry</span>
                          <Send className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
