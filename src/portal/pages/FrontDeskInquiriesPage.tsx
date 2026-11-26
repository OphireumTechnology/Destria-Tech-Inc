import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  FileText,
  Layers,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { PortalLayout } from '../components/PortalLayout';
import { portalRequest } from '../portalApi';
import { ROUTES } from '../../config/routes';

interface ClientFrontDeskInquiry {
  referenceCode: string;
  companyName: string;
  projectName: string;
  clientName: string;
  leadStatus: string;
  executiveReviewStage: string;
  completenessScore: number;
  dossierVersion: number;
  consultationReferenceCode?: string;
  consultationStatus?: string;
  consultationDate?: string;
  consultationSlot?: string;
  consultationTimezone?: string;
  projectRequirements: {
    projectName?: string;
    businessProblem?: string;
    preferredTimeline?: string;
    functionalRequirements: Array<{ id: string; label: string; classification: string }>;
  };
  masterplan: {
    version: number;
    generatedAt: string;
    disclaimer: string;
    sections: Record<string, any>;
  };
  clientCorrectionHistory: Array<{
    version: number;
    note: string;
    correctedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export const PortalFrontDeskInquiriesPage: React.FC = () => {
  const [inquiries, setInquiries] = useState<ClientFrontDeskInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [editingRef, setEditingRef] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState('');
  const [editBusinessProblem, setEditBusinessProblem] = useState('');
  const [editTimeline, setEditTimeline] = useState('');
  const [editNote, setEditNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const loadInquiries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await portalRequest<{ success: boolean; inquiries: ClientFrontDeskInquiry[] }>(
        '/frontdesk/inquiries'
      );
      const list = Array.isArray(data.inquiries) ? data.inquiries : [];
      setInquiries(list);
      if (list.length > 0 && !selectedRef) {
        setSelectedRef(list[0].referenceCode);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load your AI Front Desk project inquiries.');
    } finally {
      setLoading(false);
    }
  }, [selectedRef]);

  useEffect(() => {
    void loadInquiries();
  }, [loadInquiries]);

  const activeInquiry = inquiries.find((i) => i.referenceCode === selectedRef) || inquiries[0] || null;

  const startEdit = (inq: ClientFrontDeskInquiry) => {
    setEditingRef(inq.referenceCode);
    setEditProjectName(inq.projectRequirements.projectName || inq.projectName || '');
    setEditBusinessProblem(inq.projectRequirements.businessProblem || '');
    setEditTimeline(inq.projectRequirements.preferredTimeline || '');
    setEditNote('');
    setSaveNotice(null);
  };

  const handleSaveCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRef || saving) return;
    const targetInquiry = inquiries.find((i) => i.referenceCode === editingRef);
    setSaving(true);
    setError(null);
    setSaveNotice(null);
    try {
      const data = await portalRequest<{ success: boolean; inquiry: ClientFrontDeskInquiry; message?: string }>(
        `/frontdesk/inquiries/${encodeURIComponent(editingRef)}/corrections`,
        {
          method: 'PATCH',
          body: {
            expectedVersion: targetInquiry?.dossierVersion,
            patch: {
              projectOverview: {
                projectName: editProjectName,
                businessProblem: editBusinessProblem,
                preferredTimeline: editTimeline,
              },
            },
            note: editNote || 'Updated project requirements from Client Portal.',
          },
        }
      );
      if (data.success && data.inquiry) {
        setInquiries((prev) =>
          prev.map((item) => (item.referenceCode === editingRef ? data.inquiry : item))
        );
        setEditingRef(null);
        setSaveNotice(data.message || 'Project requirements and preliminary masterplan updated.');
      }
    } catch (err: any) {
      if (err?.status === 409) {
        setError(
          'This inquiry was updated in another session. Your view has been refreshed — please review the latest version before resubmitting your changes.'
        );
        void loadInquiries();
      } else {
        setError(err?.message || 'Unable to save inquiry corrections.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <PortalLayout
      title="AI Discovery Inquiries & Masterplans"
      subtitle="Review your submitted AI Front Desk project inquiries, 25-section preliminary masterplans, executive consultation statuses, and submit scope refinements."
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[#475569]">
            Records shown here are strictly isolated to your authenticated Client Portal email address.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadInquiries()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E6E2D8] bg-white hover:bg-[#FAF8F4] text-xs font-semibold text-[#0F1D36] cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <Link
              to={ROUTES.AI_FRONTDESK}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0B1F3B] hover:bg-[#112A4E] text-white text-xs font-semibold"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#00C2C7]" />
              <span>New AI Front Desk Consultation</span>
            </Link>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {error}
          </div>
        )}

        {saveNotice && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{saveNotice}</span>
          </div>
        )}

        {loading ? (
          <div className="p-10 text-center text-sm text-[#64748B] bg-white rounded-2xl border border-[#E6E2D8]">
            Loading your project inquiries...
          </div>
        ) : inquiries.length === 0 ? (
          <div className="p-10 text-center bg-white rounded-2xl border border-[#E6E2D8] space-y-3">
            <ClipboardCheck className="w-8 h-8 text-[#00C2C7] mx-auto" />
            <h2 className="text-base font-bold text-[#0F1D36]">No AI Front Desk Inquiries Found</h2>
            <p className="text-xs text-[#64748B] max-w-md mx-auto">
              When you authorize a project discovery inquiry via the DESTRIA TECH INC AI Front Desk using your registered email address, your requirements and preliminary masterplan appear here automatically.
            </p>
            <Link
              to={ROUTES.AI_FRONTDESK}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F4C3A] text-white text-xs font-semibold"
            >
              <span>Open AI Front Desk</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left List */}
            <div className="lg:col-span-4 space-y-2.5">
              {inquiries.map((inq) => {
                const isSelected = activeInquiry?.referenceCode === inq.referenceCode;
                return (
                  <button
                    key={inq.referenceCode}
                    type="button"
                    onClick={() => setSelectedRef(inq.referenceCode)}
                    className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#0B1F3B] text-white border-[#0B1F3B] shadow-md'
                        : 'bg-white text-[#0F1D36] border-[#E6E2D8] hover:border-[#00C2C7]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-mono text-[11px] font-bold ${isSelected ? 'text-[#00C2C7]' : 'text-[#0F4C3A]'}`}>
                        {inq.referenceCode}
                      </span>
                      <span className={`text-[10px] font-mono ${isSelected ? 'text-[#D4AF37]' : 'text-[#64748B]'}`}>
                        v{inq.dossierVersion}
                      </span>
                    </div>
                    <div className="mt-1 font-bold text-sm truncate">{inq.projectName}</div>
                    <div className={`mt-1 text-xs ${isSelected ? 'text-slate-300' : 'text-[#64748B]'}`}>
                      Review Stage: {inq.executiveReviewStage}
                    </div>
                    <div className={`mt-2 text-[11px] font-mono ${isSelected ? 'text-slate-400' : 'text-[#64748B]'}`}>
                      Completeness: {inq.completenessScore}%
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right Detail */}
            {activeInquiry && (
              <div className="lg:col-span-8 bg-white rounded-2xl border border-[#E6E2D8] p-5 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E6E2D8] pb-4">
                  <div>
                    <div className="text-xs font-mono text-[#0F4C3A] font-semibold">
                      {activeInquiry.referenceCode} · Version {activeInquiry.dossierVersion}
                    </div>
                    <h2 className="text-lg font-bold text-[#0F1D36] mt-0.5">{activeInquiry.projectName}</h2>
                    <p className="text-xs text-[#64748B]">
                      Executive Commercial Stage: <strong className="text-[#0F1D36]">{activeInquiry.executiveReviewStage}</strong> · Lead Status: {activeInquiry.leadStatus}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(activeInquiry)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E6E2D8] hover:border-[#0B1F3B] text-xs font-semibold text-[#0F1D36] cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Submit Correction</span>
                  </button>
                </div>

                {/* Consultation Banner */}
                {activeInquiry.consultationReferenceCode && (
                  <div className="p-3.5 rounded-xl bg-[#FAF8F4] border border-[#E6E2D8] flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-[#0F1D36]">
                      <Calendar className="w-4 h-4 text-[#0F4C3A]" />
                      <span>
                        <strong>Consultation {activeInquiry.consultationReferenceCode}:</strong>{' '}
                        {activeInquiry.consultationDate} at {activeInquiry.consultationSlot} ({activeInquiry.consultationTimezone})
                      </span>
                    </div>
                    <span className="font-mono text-[11px] uppercase px-2 py-0.5 rounded bg-[#0B1F3B] text-[#00C2C7]">
                      {activeInquiry.consultationStatus}
                    </span>
                  </div>
                )}

                {/* Inline Client Correction Form */}
                {editingRef === activeInquiry.referenceCode && (
                  <form
                    onSubmit={handleSaveCorrection}
                    className="p-4 rounded-xl bg-[#FAF8F4] border border-[#00C2C7]/40 space-y-3 text-xs"
                  >
                    <div className="font-bold text-[#0F1D36]">Submit Project Requirement Corrections</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#475569] mb-1">Project Name</label>
                        <input
                          type="text"
                          value={editProjectName}
                          onChange={(e) => setEditProjectName(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-white border border-[#E6E2D8] text-[#0F1D36]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#475569] mb-1">Target Timeline</label>
                        <input
                          type="text"
                          value={editTimeline}
                          onChange={(e) => setEditTimeline(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-white border border-[#E6E2D8] text-[#0F1D36]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#475569] mb-1">Business Goal / Problem</label>
                      <textarea
                        rows={3}
                        value={editBusinessProblem}
                        onChange={(e) => setEditBusinessProblem(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-white border border-[#E6E2D8] text-[#0F1D36]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#475569] mb-1">Revision Note</label>
                      <input
                        type="text"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        placeholder="Briefly describe what changed"
                        className="w-full px-3 py-2 rounded-lg bg-white border border-[#E6E2D8] text-[#0F1D36]"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-4 py-2 rounded-lg bg-[#0F4C3A] text-white font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {saving ? 'Updating...' : 'Save & Regenerate Masterplan'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingRef(null)}
                        className="px-3 py-2 rounded-lg border border-[#E6E2D8] text-[#475569] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {/* Preliminary Masterplan Summary */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#0F1D36] uppercase tracking-wide">
                    <Layers className="w-4 h-4 text-[#0F4C3A]" />
                    <span>Preliminary Project Masterplan (v{activeInquiry.masterplan.version})</span>
                  </div>
                  <p className="text-[11.5px] text-[#64748B] bg-[#FAF8F4] p-3 rounded-lg border border-[#E6E2D8]">
                    {activeInquiry.masterplan.disclaimer}
                  </p>
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {Object.entries(activeInquiry.masterplan.sections || {}).map(([key, val]) => (
                      <details key={key} className="rounded-lg border border-[#E6E2D8] p-3 text-xs">
                        <summary className="font-mono font-semibold text-[#0F1D36] cursor-pointer uppercase">
                          {key.replace(/_/g, ' ')}
                        </summary>
                        <div className="mt-2 text-[#475569] space-y-1 leading-relaxed">
                          {Array.isArray(val) ? (
                            <ul className="list-disc pl-4 space-y-1">
                              {val.map((item: any, idx: number) => (
                                <li key={idx}>
                                  {typeof item === 'string'
                                    ? item
                                    : Object.entries(item)
                                        .map(([k, v]) => `${k}: ${String(v)}`)
                                        .join(' · ')}
                                </li>
                              ))}
                            </ul>
                          ) : val && typeof val === 'object' ? (
                            Object.entries(val).map(([k, v]) => (
                              <div key={k}>
                                <strong className="text-[#0F1D36]">{k}:</strong>{' '}
                                {Array.isArray(v) ? v.join(', ') : String(v)}
                              </div>
                            ))
                          ) : (
                            <p>{String(val ?? '')}</p>
                          )}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>

                {activeInquiry.clientCorrectionHistory.length > 0 && (
                  <div className="pt-3 border-t border-[#E6E2D8] space-y-1.5">
                    <div className="text-[11px] font-mono uppercase text-[#64748B] flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      <span>Revision History</span>
                    </div>
                    {activeInquiry.clientCorrectionHistory.map((h, i) => (
                      <div key={i} className="text-xs text-[#475569]">
                        <span className="font-mono text-[#0F4C3A]">v{h.version}</span> — {h.note} ({h.correctedAt.slice(0, 10)})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </PortalLayout>
  );
};

export default PortalFrontDeskInquiriesPage;
