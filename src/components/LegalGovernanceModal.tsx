import React, { useEffect, useState } from 'react';
import { X, Scale, AlertTriangle, Phone, Mail, MapPin, ShieldCheck } from 'lucide-react';
import {
  corporateIdentity,
  LEGAL_COUNSEL_REVIEW_BANNER,
  LEGAL_GOVERNANCE_STATEMENTS,
} from '../data/companyConfig';

interface LegalGovernanceModalProps {
  isOpen: boolean;
  initialSectionId?: string;
  onClose: () => void;
}

export const LegalGovernanceModal: React.FC<LegalGovernanceModalProps> = ({
  isOpen,
  initialSectionId,
  onClose,
}) => {
  const [activeId, setActiveId] = useState<string>(
    initialSectionId || LEGAL_GOVERNANCE_STATEMENTS[0].id
  );

  useEffect(() => {
    if (isOpen && initialSectionId) {
      const exists = LEGAL_GOVERNANCE_STATEMENTS.some((s) => s.id === initialSectionId);
      setActiveId(exists ? initialSectionId : LEGAL_GOVERNANCE_STATEMENTS[0].id);
    }
  }, [isOpen, initialSectionId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeSection =
    LEGAL_GOVERNANCE_STATEMENTS.find((s) => s.id === activeId) || LEGAL_GOVERNANCE_STATEMENTS[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-governance-modal-title"
    >
      <div className="relative w-full max-w-5xl max-h-[92vh] bg-[#0B1F3B] border border-slate-700/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 sm:px-6 border-b border-slate-800 bg-[#081529] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#00C2C7]/15 border border-[#00C2C7]/40 flex items-center justify-center shrink-0">
              <Scale className="w-4 h-4 text-[#00C2C7]" />
            </div>
            <div className="min-w-0">
              <h2
                id="legal-governance-modal-title"
                className="text-sm sm:text-base font-bold text-white truncate"
              >
                {corporateIdentity.legalName} — Legal &amp; Corporate Governance Statements
              </h2>
              <p className="text-[11px] font-mono text-slate-400 truncate">
                {corporateIdentity.jurisdiction} · {corporateIdentity.networkName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/80 transition-colors cursor-pointer"
            aria-label="Close legal and corporate governance modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mandatory Draft Review Banner */}
        <div className="px-5 py-3 sm:px-6 bg-amber-950/60 border-b border-amber-500/40 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-100 leading-relaxed font-medium">
            {LEGAL_COUNSEL_REVIEW_BANNER}
          </p>
        </div>

        {/* Body: Sidebar Navigation + Clause Reader */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Navigation Rail */}
          <nav
            aria-label="Legal governance sections"
            className="md:w-72 shrink-0 border-b md:border-b-0 md:border-r border-slate-800 bg-[#091930] overflow-y-auto p-3 space-y-1 max-h-44 md:max-h-none"
          >
            {LEGAL_GOVERNANCE_STATEMENTS.map((section, idx) => {
              const isSelected = section.id === activeSection.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveId(section.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-2 ${
                    isSelected
                      ? 'bg-[#00C2C7]/15 text-[#00C2C7] border border-[#00C2C7]/40 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70 border border-transparent'
                  }`}
                >
                  <span className="text-[10px] font-mono text-slate-500 w-5 shrink-0">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate">{section.title}</span>
                </button>
              );
            })}
          </nav>

          {/* Active Policy Section Content */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6 bg-[#111827]">
            <div className="space-y-2 border-b border-slate-800 pb-4">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#D4AF37] uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{activeSection.draftNotice}</span>
              </div>
              <h3 className="text-xl font-bold text-white">{activeSection.title}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{activeSection.summary}</p>
            </div>

            <div className="space-y-4">
              {activeSection.clauses.map((clause, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-[#0B1F3B]/70 border border-slate-800 text-sm text-slate-200 leading-relaxed"
                >
                  <span className="text-[11px] font-mono text-[#00C2C7] block mb-1.5">
                    Clause {idx + 1}
                  </span>
                  <p>{clause}</p>
                </div>
              ))}
            </div>

            {/* Verified Corporate Governance Contact Block */}
            <div className="pt-4 border-t border-slate-800 space-y-2.5 text-xs text-slate-300">
              <div className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
                Official Corporate &amp; Legal Inquiries
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <a
                  href={corporateIdentity.contact.telephone.href}
                  className="flex items-center gap-2 p-3 rounded-lg bg-[#081529] border border-slate-800 hover:border-[#00C2C7]/50 text-[#00C2C7] font-mono transition-colors"
                >
                  <Phone className="w-3.5 h-3.5 shrink-0" />
                  <span>{corporateIdentity.contact.telephone.display}</span>
                </a>
                <a
                  href={`mailto:${corporateIdentity.contact.email}`}
                  className="flex items-center gap-2 p-3 rounded-lg bg-[#081529] border border-slate-800 hover:border-[#00C2C7]/50 text-[#00C2C7] font-mono transition-colors"
                >
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  <span>{corporateIdentity.contact.email}</span>
                </a>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-[#081529] border border-slate-800 text-slate-300">
                <MapPin className="w-3.5 h-3.5 text-[#D4AF37] shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white block">{corporateIdentity.legalName}</span>
                  <span>{corporateIdentity.headquarters.fullAddress}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
