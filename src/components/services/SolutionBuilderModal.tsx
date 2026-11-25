import React, { useState, useEffect, useRef } from 'react';
import { CatalogService } from '../../types';
import {
  formatCatalogEngagement,
  COMMERCIAL_ENGAGEMENT_NOTICE,
  EXTERNAL_CHARGES_DISCLOSURE,
} from '../../data/serviceCatalog';
import { corporateIdentity } from '../../data/companyConfig';
import { apiUrl, createIdempotencyKey } from '../../lib/apiClient';
import {
  X,
  Trash2,
  Send,
  CheckCircle2,
  AlertCircle,
  Bot,
  FileText,
  MailCheck,
  MailWarning,
  ShieldCheck,
} from 'lucide-react';

interface SolutionBuilderModalProps {
  isOpen: boolean;
  selectedServices: CatalogService[];
  selectedOptionsMap?: Record<string, string[]>;
  onClose: () => void;
  onRemoveService: (serviceId: string) => void;
  onClearAll: () => void;
  onConsultAIWithSelection: (services: CatalogService[]) => void;
}

export const SolutionBuilderModal: React.FC<SolutionBuilderModalProps> = ({
  isOpen,
  selectedServices,
  selectedOptionsMap = {},
  onClose,
  onRemoveService,
  onClearAll,
  onConsultAIWithSelection,
}) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [company, setCompany] = useState('');
  const [industry, setIndustry] = useState('');
  const [targetTimeline, setTargetTimeline] = useState('Standard 4 to 8 Weeks');
  const [projectDescription, setProjectDescription] = useState('');
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [websiteHoneypot, setWebsiteHoneypot] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedRecord, setSubmittedRecord] = useState<{
    referenceId: string;
    summaryText: string;
    emailDeliveryStatus: string;
    emailConfigured: boolean;
  } | null>(null);

  const idempotencyKeyRef = useRef<string>(createIdempotencyKey());
  const draftSignature = JSON.stringify({
    selectedIds: selectedServices.map((s) => s.id),
    selectedOptionsMap,
    fullName,
    email,
    contactNumber,
    company,
    projectDescription,
    targetTimeline,
  });

  useEffect(() => {
    idempotencyKeyRef.current = createIdempotencyKey();
  }, [draftSignature]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (selectedServices.length === 0) {
      errs.services = 'Please select at least one solution framework to submit your project requirements.';
    }
    if (!fullName.trim() || fullName.trim().length < 2) {
      errs.fullName = 'Full name is required (minimum 2 characters).';
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = 'A valid business email is required.';
    }
    if (!contactNumber.trim() || contactNumber.replace(/[^0-9]/g, '').length < 5) {
      errs.contactNumber = 'A valid direct telephone number is required.';
    }
    if (!company.trim() || company.trim().length < 2) {
      errs.company = 'Organization or enterprise name is required.';
    }
    if (!projectDescription.trim() || projectDescription.trim().length < 20) {
      errs.projectDescription = 'Please describe your operational objectives and technical scope (minimum 20 characters).';
    }
    if (!privacyConsent) {
      errs.privacyConsent = 'Please confirm authorization for technical assessment review.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(apiUrl('/api/inquiries'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          idempotencyKey: idempotencyKeyRef.current,
          type: 'solution_builder',
          fullName: fullName.trim(),
          email: email.trim(),
          contactNumber: contactNumber.trim(),
          company: company.trim(),
          industry: industry.trim() || undefined,
          targetTimeline,
          selectedServiceIds: selectedServices.map((s) => s.id),
          selectedOptionsMap,
          submissionTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          projectDescription: projectDescription.trim(),
          privacyConsent,
          commercialPolicyConsent: privacyConsent,
          sourceChannel: 'Public Website',
          websiteHoneypot,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.referenceId) {
        throw new Error(
          data.error ||
            'Unable to persist your service inquiry on the server right now. Your inputs have been preserved so you can retry.'
        );
      }

      const summaryLines = [
        `${corporateIdentity.legalName} — ENTERPRISE SERVICE INQUIRY SUMMARY`,
        `Reference Number: ${data.referenceId}`,
        `Organization: ${company.trim()} (${fullName.trim()})`,
        `Selected Solution Frameworks (${selectedServices.length}):`,
        ...selectedServices.map((s) => {
          const eng = formatCatalogEngagement(s);
          return `  - ${s.title}: ${eng.primaryLabel} (${eng.secondaryLabel})`;
        }),
        `Commercial Valuation: Subject to Formal Assessment & Approved Proposal`,
        `Direct Telephone: ${corporateIdentity.contact.telephone.display}`,
        `Official Email: ${corporateIdentity.contact.email}`,
        `Policy Notice: ${COMMERCIAL_ENGAGEMENT_NOTICE}`,
      ].join('\n');

      setSubmittedRecord({
        referenceId: data.referenceId,
        summaryText: summaryLines,
        emailDeliveryStatus: data.emailDelivery?.overallStatus || data.emailDelivery?.customerStatus || 'unconfigured',
        emailConfigured: Boolean(data.emailDelivery?.emailConfigured),
      });

      onClearAll();
      idempotencyKeyRef.current = createIdempotencyKey();
    } catch (err: any) {
      setSubmitError(
        err?.message || 'Submission failed. Your form entries remain intact so you may retry.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="solution-builder-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[92vh] bg-[#0B1220] border border-slate-700 rounded-2xl flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 bg-[#111827] border-b border-slate-800 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-[#00C2C7]">
              Enterprise Solution Requirements · Formal Proposal Intake
            </div>
            <h3 id="solution-builder-title" className="text-lg font-bold text-white mt-0.5">
              Submit Project Requirements
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7]"
            aria-label="Close project requirements modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">
          {submittedRecord ? (
            <div className="py-4 space-y-5 max-w-2xl mx-auto">
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-[#00C2C7]/15 border border-[#00C2C7]/40 flex items-center justify-center text-[#00C2C7] mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-xl font-bold text-white mt-3">
                  Enterprise Service Inquiry Logged
                </h4>
                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#111827] border border-[#00C2C7]/40 text-xs font-mono text-[#00C2C7]">
                  <span>Reference Number:</span>
                  <strong className="text-white">{submittedRecord.referenceId}</strong>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-[#111827] border border-slate-800 text-xs sm:text-sm text-slate-200 leading-relaxed space-y-3 text-left">
                <p>
                  Your service inquiry has been successfully registered with{' '}
                  {corporateIdentity.legalName}. Our authorized team will review your submitted
                  requirements and coordinate further communication.
                </p>
                <p>
                  Your inquiry has been recorded under reference number{' '}
                  <strong className="font-mono text-[#00C2C7]">{submittedRecord.referenceId}</strong>{' '}
                  and assigned for executive and solutions architecture review.
                </p>
                <p>{COMMERCIAL_ENGAGEMENT_NOTICE}</p>
                <p>
                  To speak directly with our team, call{' '}
                  <a
                    href={corporateIdentity.contact.telephone.href}
                    className="font-mono text-[#00C2C7] hover:underline font-semibold"
                  >
                    {corporateIdentity.contact.telephone.display}
                  </a>{' '}
                  or email{' '}
                  <a
                    href={`mailto:${corporateIdentity.contact.email}`}
                    className="font-mono text-[#00C2C7] hover:underline font-semibold"
                  >
                    {corporateIdentity.contact.email}
                  </a>
                  .
                </p>
              </div>

              <div
                className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                  submittedRecord.emailDeliveryStatus === 'sent'
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                    : 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                }`}
              >
                {submittedRecord.emailDeliveryStatus === 'sent' ? (
                  <>
                    <MailCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      Confirmation email and executive review notification were delivered via our transactional email service.
                    </span>
                  </>
                ) : (
                  <>
                    <MailWarning className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      {submittedRecord.emailConfigured
                        ? 'Your inquiry is safely stored on our server, while automated email notification queued for retry.'
                        : 'Your inquiry is safely stored on our server. Automated email confirmation is currently awaiting transactional email configuration.'}
                    </span>
                  </>
                )}
              </div>

              <pre className="text-left p-4 rounded-xl bg-[#111827] border border-slate-800 text-[11px] font-mono text-slate-300 whitespace-pre-wrap overflow-x-auto">
                {submittedRecord.summaryText}
              </pre>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-[#00C2C7]" />
                  <span>Print Inquiry Summary</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSubmittedRecord(null);
                    onClose();
                  }}
                  className="px-5 py-2 rounded-lg bg-[#00C2C7] hover:bg-[#00d6dc] text-[#0B1220] text-xs font-semibold cursor-pointer"
                >
                  Return to Solutions
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
              {/* Selected Solutions Column */}
              <div className="lg:col-span-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">
                    Selected Frameworks ({selectedServices.length})
                  </h4>
                  {selectedServices.length > 0 && (
                    <button
                      type="button"
                      onClick={onClearAll}
                      className="text-xs text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {errors.services && <p className="text-xs text-rose-400">{errors.services}</p>}

                {selectedServices.length === 0 ? (
                  <div className="p-6 rounded-xl bg-[#111827] border border-dashed border-slate-700 text-center text-xs text-slate-400">
                    No solution frameworks selected yet. Select one or more frameworks from the directory to submit your project requirements for assessment.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {selectedServices.map((svc) => {
                      const eng = formatCatalogEngagement(svc);
                      const chosenOptionIds = selectedOptionsMap[svc.id] || [];
                      const chosenOptions = (svc.configurableOptions || []).filter((o) =>
                        chosenOptionIds.includes(o.id)
                      );
                      return (
                        <div
                          key={svc.id}
                          className="p-3 rounded-xl bg-[#111827] border border-slate-800 flex items-start justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-white truncate">{svc.title}</div>
                            <div className="text-[11px] font-mono text-[#00C2C7] mt-0.5">
                              {eng.primaryLabel}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {eng.secondaryLabel}
                            </div>
                            {chosenOptions.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {chosenOptions.map((opt) => (
                                  <div key={opt.id} className="text-[10px] text-slate-300 font-mono truncate">
                                    + {opt.label}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveService(svc.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer shrink-0"
                            aria-label={`Remove ${svc.title}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Formal Assessment Commercial Policy Box */}
                <div className="p-4 rounded-xl bg-[#111827] border border-slate-800 space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase text-[#00C2C7]">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Commercial Assessment Model</span>
                  </div>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-slate-300">Engagement Structure:</span>
                    <span className="font-mono font-semibold text-white">Customized Solution</span>
                  </div>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-slate-300">Commercial Proposal:</span>
                    <span className="font-mono font-semibold text-[#D4AF37]">
                      Subject to Formal Assessment
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-800 leading-relaxed">
                    {COMMERCIAL_ENGAGEMENT_NOTICE}
                  </p>
                </div>

                {selectedServices.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onConsultAIWithSelection(selectedServices);
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-[#00C2C7]/40 text-[#00C2C7] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Bot className="w-4 h-4" />
                    <span>Discuss Scope with AI Solutions Consultant</span>
                  </button>
                )}
              </div>

              {/* Client Requirements Form Column */}
              <div className="lg:col-span-7">
                <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
                  <div className="hidden" aria-hidden="true">
                    <label htmlFor="sb-website">Website</label>
                    <input
                      id="sb-website"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={websiteHoneypot}
                      onChange={(e) => setWebsiteHoneypot(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label htmlFor="sb-name" className="block text-xs font-medium text-slate-300 mb-1">
                        Full Name <span className="text-[#00C2C7]">*</span>
                      </label>
                      <input
                        id="sb-name"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Jordan Mercer"
                        className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00C2C7]"
                      />
                      {errors.fullName && <p className="text-[11px] text-rose-400 mt-1">{errors.fullName}</p>}
                    </div>
                    <div>
                      <label htmlFor="sb-email" className="block text-xs font-medium text-slate-300 mb-1">
                        Business Email <span className="text-[#00C2C7]">*</span>
                      </label>
                      <input
                        id="sb-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@company.com"
                        className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00C2C7]"
                      />
                      {errors.email && <p className="text-[11px] text-rose-400 mt-1">{errors.email}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label htmlFor="sb-phone" className="block text-xs font-medium text-slate-300 mb-1">
                        Direct Telephone Number <span className="text-[#00C2C7]">*</span>
                      </label>
                      <input
                        id="sb-phone"
                        type="tel"
                        value={contactNumber}
                        onChange={(e) => setContactNumber(e.target.value)}
                        placeholder="+1 (XXX) XXX-XXXX"
                        className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00C2C7]"
                      />
                      {errors.contactNumber && (
                        <p className="text-[11px] text-rose-400 mt-1">{errors.contactNumber}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="sb-company" className="block text-xs font-medium text-slate-300 mb-1">
                        Organization / Enterprise <span className="text-[#00C2C7]">*</span>
                      </label>
                      <input
                        id="sb-company"
                        type="text"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Company Name"
                        className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00C2C7]"
                      />
                      {errors.company && <p className="text-[11px] text-rose-400 mt-1">{errors.company}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label htmlFor="sb-industry" className="block text-xs font-medium text-slate-300 mb-1">
                        Industry Sector
                      </label>
                      <input
                        id="sb-industry"
                        type="text"
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value)}
                        placeholder="e.g. Healthcare, Logistics, Financial Services"
                        className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00C2C7]"
                      />
                    </div>
                    <div>
                      <label htmlFor="sb-timeline" className="block text-xs font-medium text-slate-300 mb-1">
                        Target Timeline
                      </label>
                      <select
                        id="sb-timeline"
                        value={targetTimeline}
                        onChange={(e) => setTargetTimeline(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#00C2C7] cursor-pointer"
                      >
                        <option value="Immediate / Priority (2 to 4 Weeks)">
                          Immediate / Priority (2 to 4 Weeks)
                        </option>
                        <option value="Standard 4 to 8 Weeks">Standard 4 to 8 Weeks</option>
                        <option value="Phased Enterprise Rollout (2 to 4 Months)">
                          Phased Enterprise Rollout (2 to 4 Months)
                        </option>
                        <option value="Exploratory Architecture Planning">Exploratory Architecture Planning</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="sb-desc" className="block text-xs font-medium text-slate-300 mb-1">
                      Project Requirements &amp; Technical Objectives <span className="text-[#00C2C7]">*</span>
                    </label>
                    <textarea
                      id="sb-desc"
                      rows={3}
                      value={projectDescription}
                      onChange={(e) => setProjectDescription(e.target.value)}
                      placeholder="Describe your operational goals, existing platforms, integrations, security, or compliance requirements..."
                      className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00C2C7]"
                    />
                    {errors.projectDescription && (
                      <p className="text-[11px] text-rose-400 mt-1">{errors.projectDescription}</p>
                    )}
                  </div>

                  <div>
                    <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={privacyConsent}
                        onChange={(e) => setPrivacyConsent(e.target.checked)}
                        className="mt-0.5 rounded bg-slate-900 border-slate-700 text-[#00C2C7] focus:ring-[#00C2C7]"
                      />
                      <span>
                        I authorize {corporateIdentity.legalName} to review these project requirements for
                        consultation and technical assessment, and acknowledge that formal commercial terms
                        are established exclusively through an approved written proposal.
                      </span>
                    </label>
                    {errors.privacyConsent && (
                      <p className="text-[11px] text-rose-400 mt-1">{errors.privacyConsent}</p>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {EXTERNAL_CHARGES_DISCLOSURE}
                  </p>

                  {submitError && (
                    <div
                      role="alert"
                      className="p-3 rounded-lg bg-rose-950/50 border border-rose-500/40 text-xs text-rose-300 flex items-start gap-2"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 px-5 rounded-lg bg-[#00C2C7] hover:bg-[#00d6dc] disabled:opacity-50 text-[#0B1220] font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    {isSubmitting ? (
                      <span>Logging Enterprise Inquiry...</span>
                    ) : (
                      <>
                        <span>Submit Project Requirements</span>
                        <Send className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
