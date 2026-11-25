import React, { useState, useEffect, useRef } from 'react';
import { ConsultationSourceChannel, ProjectBrief } from '../../services/supabaseService';
import { apiUrl, createIdempotencyKey } from '../../lib/apiClient';
import {
  X,
  FileText,
  CheckCircle2,
  Shield,
  Calendar,
  Building,
  User,
  Cpu,
  Copy,
  Printer,
  Send,
  AlertCircle,
} from 'lucide-react';

interface ProjectBriefModalProps {
  brief: ProjectBrief | null;
  isOpen: boolean;
  sourceChannel?: ConsultationSourceChannel;
  onClose: () => void;
  onScheduleConsultation: () => void;
  onInquirySubmitted?: (result: {
    referenceId: string;
    sourceChannel: ConsultationSourceChannel;
    fullName: string;
    company: string;
  }) => void;
}

export const ProjectBriefModal: React.FC<ProjectBriefModalProps> = ({
  brief,
  isOpen,
  sourceChannel = 'AI Chat',
  onClose,
  onScheduleConsultation,
  onInquirySubmitted,
}) => {
  const [copied, setCopied] = useState(false);
  const [showInquiryConfirm, setShowInquiryConfirm] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [explicitConsent, setExplicitConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string>(createIdempotencyKey());

  useEffect(() => {
    if (brief && isOpen) {
      setFullName((prev) => prev || brief.client.fullName || '');
      setEmail((prev) => prev || brief.client.email || '');
      setPhone((prev) => prev || brief.client.phone || '');
      setCompany((prev) => prev || brief.client.companyName || '');
      setSubmitError(null);
    }
  }, [brief, isOpen]);

  useEffect(() => {
    idempotencyKeyRef.current = createIdempotencyKey();
  }, [fullName, email, phone, company, brief?.referenceCode]);

  if (!isOpen || !brief) return null;

  const handleCopy = async () => {
    const text = `DESTRIA TECH INC ENTERPRISE PROJECT BRIEF\nReference: ${brief.referenceCode}\nClient: ${fullName || brief.client.fullName || 'Not provided'} (${company || brief.client.companyName || 'Not provided'})\nCategory: ${brief.requirements.category}\nObjectives: ${brief.requirements.businessProblem}\nFeatures: ${brief.requirements.keyFeatures.join(', ')}\nArchitecture: ${brief.technicalArchitecture.suggestedStack.join(', ')}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Clipboard blocked in restricted context
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSubmitBriefInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitError(null);

    if (fullName.trim().length < 2) {
      setSubmitError('Full legal name is required (minimum 2 characters).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setSubmitError('A valid corporate or business email address is required.');
      return;
    }
    if (phone.replace(/[^0-9]/g, '').length < 7) {
      setSubmitError('A valid direct telephone number is required.');
      return;
    }
    if (company.trim().length < 2) {
      setSubmitError('Organization or enterprise name is required.');
      return;
    }
    if (!explicitConsent) {
      setSubmitError('Please confirm authorization to submit this structured project brief to DESTRIA TECH INC.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Transmit concise structured project requirements summary only — never raw private chat transcripts
      const structuredSummary = [
        `AI Consultant Brief Reference: ${brief.referenceCode}`,
        `Primary Category: ${brief.requirements.category}`,
        `Business Objectives: ${brief.requirements.businessProblem}`,
        brief.requirements.keyFeatures.length > 0
          ? `Key Capabilities: ${brief.requirements.keyFeatures.slice(0, 8).join(', ')}`
          : '',
        brief.technicalArchitecture.recommendedModules.length > 0
          ? `Recommended Modules: ${brief.technicalArchitecture.recommendedModules.slice(0, 6).join('; ')}`
          : '',
        brief.requirements.targetTimeline
          ? `Target Timeline: ${brief.requirements.targetTimeline}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      const response = await fetch(apiUrl('/api/inquiries'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          idempotencyKey: idempotencyKeyRef.current,
          type: 'contact_inquiry',
          fullName: fullName.trim(),
          email: email.trim(),
          contactNumber: phone.trim(),
          company: company.trim(),
          industry: brief.client.industry || undefined,
          targetTimeline: brief.requirements.targetTimeline || undefined,
          serviceId: 'enterprise-custom-assessment',
          serviceTitle: brief.requirements.category || 'Customized Enterprise Solution Inquiry',
          engagementScope: 'Subject to Formal Assessment',
          submissionTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          projectDescription: structuredSummary,
          privacyConsent: explicitConsent,
          commercialPolicyConsent: explicitConsent,
          sourceChannel,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.referenceId) {
        throw new Error(
          data.error ||
            'Unable to register your service inquiry right now. Your details remain intact so you can retry.'
        );
      }

      setSubmittedRef(data.referenceId);
      idempotencyKeyRef.current = createIdempotencyKey();
      onInquirySubmitted?.({
        referenceId: data.referenceId,
        sourceChannel,
        fullName: fullName.trim(),
        company: company.trim(),
      });
    } catch (err: any) {
      setSubmitError(err?.message || 'Submission failed. Please review your details and retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-[#0B1220] border border-slate-700 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Top Bar */}
        <div className="px-5 py-4 bg-[#111827] border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#00C2C7]/15 border border-[#00C2C7]/30 flex items-center justify-center text-[#00C2C7]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Enterprise Project Brief
                </h3>
                <span className="text-[10px] font-mono text-[#00C2C7] bg-[#00C2C7]/10 px-2 py-0.5 rounded border border-[#00C2C7]/30">
                  {submittedRef || brief.referenceCode}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Synthesized by DESTRIA TECH INC AI Solutions Consultant · Ready for Architectural Review
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-2 py-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-mono"
              title="Copy Summary"
            >
              <Copy className="w-3.5 h-3.5 text-[#00C2C7]" />
              {copied && <span className="text-emerald-400">Copied</span>}
            </button>
            <button
              onClick={handlePrint}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Print Brief"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Brief Document Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-6 text-xs text-slate-300">
          {submittedRef && (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-100 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Service Inquiry Registered — Reference: {submittedRef}</span>
              </div>
              <p className="text-xs leading-relaxed text-emerald-100/90">
                Your service inquiry has been successfully registered with DESTRIA TECH INC. Our
                authorized team will review your submitted requirements and coordinate further
                communication.
              </p>
            </div>
          )}

          {/* Section 1: Client Profile */}
          <div className="p-4 rounded-xl bg-[#111827] border border-slate-800 space-y-3">
            <h4 className="text-[11px] font-mono uppercase text-[#00C2C7] flex items-center gap-2 font-bold tracking-wider">
              <User className="w-3.5 h-3.5" />
              <span>1. Client &amp; Organization Profile</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-1">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-mono">Client Name</span>
                <span className="font-semibold text-white text-sm">{fullName || brief.client.fullName || 'Not provided'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-mono">Company / Organization</span>
                <span className="font-semibold text-white text-sm">{company || brief.client.companyName || 'Not provided'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-mono">Contact Email</span>
                <span className="font-mono text-slate-300 truncate block">{email || brief.client.email || 'Not provided'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-mono">Phone Number</span>
                <span className="font-mono text-slate-300 block">{phone || brief.client.phone || 'Not provided'}</span>
              </div>
            </div>
          </div>

          {/* Section 2: Project Overview */}
          <div className="p-4 rounded-xl bg-[#111827] border border-slate-800 space-y-3">
            <h4 className="text-[11px] font-mono uppercase text-[#00C2C7] flex items-center gap-2 font-bold tracking-wider">
              <Building className="w-3.5 h-3.5" />
              <span>2. Project Scope &amp; Business Objectives</span>
            </h4>
            <div className="space-y-2">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-mono">Primary Category</span>
                <span className="font-bold text-white text-sm">{brief.requirements.category}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-mono">Identified Business Problem / Goal</span>
                <p className="text-slate-300 leading-relaxed text-xs pt-0.5">{brief.requirements.businessProblem}</p>
              </div>
              {brief.requirements.keyFeatures.length > 0 && (
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-mono mb-1">Required Features &amp; Capabilities</span>
                  <div className="flex flex-wrap gap-1.5">
                    {brief.requirements.keyFeatures.map((f, i) => (
                      <span key={i} className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 font-mono text-[11px]">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Technical Requirements & Proposed Architecture */}
          <div className="p-4 rounded-xl bg-[#111827] border border-slate-800 space-y-3">
            <h4 className="text-[11px] font-mono uppercase text-[#00C2C7] flex items-center gap-2 font-bold tracking-wider">
              <Cpu className="w-3.5 h-3.5" />
              <span>3. Technical Requirements &amp; Suggested Architecture</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <span className="text-slate-500 block text-[10px] uppercase font-mono">Recommended Modules</span>
                <ul className="space-y-1">
                  {brief.technicalArchitecture.recommendedModules.map((m, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-slate-300">
                      <span className="text-[#00C2C7] font-bold">·</span>
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1.5">
                <span className="text-slate-500 block text-[10px] uppercase font-mono">Security &amp; Infrastructure</span>
                <p className="text-slate-400 text-[11px] leading-relaxed mb-2">
                  {brief.technicalArchitecture.infrastructure}
                </p>
                <ul className="space-y-1">
                  {brief.technicalArchitecture.securityMeasures.map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-slate-300">
                      <Shield className="w-3 h-3 text-[#D4AF37] shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Section 4: Commercial Discovery & Staged Roadmap */}
          <div className="p-4 rounded-xl bg-[#111827] border border-slate-800 space-y-3">
            <h4 className="text-[11px] font-mono uppercase text-[#00C2C7] flex items-center gap-2 font-bold tracking-wider">
              <Calendar className="w-3.5 h-3.5" />
              <span>4. Commercial Discovery &amp; Consultation Agenda</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-mono mb-1">Suggested Development Phases</span>
                <ol className="space-y-1.5">
                  {brief.commercialDiscovery.suggestedPhases.map((phase, i) => (
                    <li key={i} className="flex items-start gap-2 text-slate-300">
                      <span className="w-4 h-4 rounded-full bg-slate-900 border border-slate-700 text-[10px] flex items-center justify-center font-mono text-[#00C2C7] shrink-0">
                        {i + 1}
                      </span>
                      <span>{phase}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-mono mb-1">Consultation Agenda</span>
                <ul className="space-y-1.5">
                  {brief.commercialDiscovery.consultationAgenda.map((agenda, i) => (
                    <li key={i} className="flex items-start gap-2 text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{agenda}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Explicit Client Verification & Service Inquiry Submission Panel */}
          {showInquiryConfirm && !submittedRef && (
            <form
              onSubmit={handleSubmitBriefInquiry}
              className="p-4 rounded-xl bg-[#111827] border border-[#00C2C7]/40 space-y-3"
              noValidate
            >
              <div className="text-[11px] font-mono uppercase text-[#00C2C7] font-bold tracking-wider">
                Verify Client Information &amp; Confirm Service Inquiry ({sourceChannel})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Full Legal Name *</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full legal name"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00C2C7]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Corporate Email *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00C2C7]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Direct Telephone *</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 / +63 XXX XXX XXXX"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00C2C7]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Organization / Enterprise *</label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Organization name"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00C2C7]"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2 text-[11px] text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={explicitConsent}
                  onChange={(e) => setExplicitConsent(e.target.checked)}
                  className="mt-0.5 rounded bg-slate-900 border-slate-700 text-[#00C2C7]"
                />
                <span>
                  I confirm that the details above are accurate and authorize DESTRIA TECH INC to
                  register this structured project requirements summary (without private conversation
                  transcripts) for formal assessment.
                </span>
              </label>

              {submitError && (
                <div
                  role="alert"
                  className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowInquiryConfirm(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-[#0B1220] bg-[#00C2C7] hover:bg-[#00d6dc] disabled:opacity-50 rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Registering Inquiry...' : 'Confirm & Submit Inquiry'}</span>
                </button>
              </div>
            </form>
          )}

          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
            <Shield className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
            <p>
              This document represents an initial consultative assessment. Formal quotation and service level agreements (SLAs) are issued following architectural verification with the client.
            </p>
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div className="px-5 py-4 bg-[#111827] border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            Close Brief
          </button>

          <div className="flex flex-wrap items-center gap-2.5">
            {!submittedRef && !showInquiryConfirm && (
              <button
                type="button"
                onClick={() => setShowInquiryConfirm(true)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-[#00C2C7]/40 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-[#00C2C7]" />
                <span>Submit as Service Inquiry</span>
              </button>
            )}

            <button
              onClick={() => {
                onClose();
                onScheduleConsultation();
              }}
              className="px-5 py-2 text-xs font-semibold text-[#0B1220] bg-[#00C2C7] hover:bg-[#00d6dc] rounded-lg shadow-md shadow-[#00C2C7]/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Schedule Executive Consultation</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
