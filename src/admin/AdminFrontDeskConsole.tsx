import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Headphones,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { apiUrl } from '../lib/apiClient';

interface AdminFrontDeskConsoleProps {
  adminToken: string;
}

export const AdminFrontDeskConsole: React.FC<AdminFrontDeskConsoleProps> = ({ adminToken }) => {
  const [subTab, setSubTab] = useState<'overview' | 'inquiries' | 'escalations' | 'knowledge' | 'quality'>('overview');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [overview, setOverview] = useState<any | null>(null);
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [inquirySearch, setInquirySearch] = useState('');
  const [selectedInquiry, setSelectedInquiry] = useState<any | null>(null);

  // 16-Stage Executive Review Draft
  const [reviewStage, setReviewStage] = useState('Executive review pending');
  const [reviewNotes, setReviewNotes] = useState('');
  const [approveCommercial, setApproveCommercial] = useState(false);

  // Escalations
  const [escalations, setEscalations] = useState<any[]>([]);

  // Knowledge Base Administration
  const [knowledgeDocs, setKnowledgeDocs] = useState<any[]>([]);
  const [newKbTitle, setNewKbTitle] = useState('');
  const [newKbDomain, setNewKbDomain] = useState('technical_qa');
  const [newKbSummary, setNewKbSummary] = useState('');
  const [newKbFacts, setNewKbFacts] = useState('');
  const [newKbVisibility, setNewKbVisibility] = useState<'public' | 'internal_only'>('public');
  const [newKbStatus, setNewKbStatus] = useState<'draft' | 'approved'>('draft');

  // Quality Evaluations
  const [qualityRecords, setQualityRecords] = useState<any[]>([]);
  const [qaRating, setQaRating] = useState(5);
  const [qaNotes, setQaNotes] = useState('');

  const loadAll = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${adminToken}` };
      const [ovRes, inqRes, escRes, kbRes, qaRes] = await Promise.all([
        fetch(apiUrl('/api/admin/frontdesk/overview'), { headers }),
        fetch(
          apiUrl(`/api/admin/frontdesk/inquiries?limit=50&offset=0&q=${encodeURIComponent(inquirySearch)}`),
          { headers }
        ),
        fetch(apiUrl('/api/admin/frontdesk/escalations'), { headers }),
        fetch(apiUrl('/api/admin/frontdesk/knowledge'), { headers }),
        fetch(apiUrl('/api/admin/frontdesk/quality'), { headers }),
      ]);
      const [ov, inq, esc, kb, qa] = await Promise.all([
        ovRes.json().catch(() => ({})),
        inqRes.json().catch(() => ({})),
        escRes.json().catch(() => ({})),
        kbRes.json().catch(() => ({})),
        qaRes.json().catch(() => ({})),
      ]);
      if (ov.success) setOverview(ov);
      if (inq.success) setInquiries(Array.isArray(inq.records) ? inq.records : []);
      if (esc.success) setEscalations(Array.isArray(esc.records) ? esc.records : []);
      if (kb.success) setKnowledgeDocs(Array.isArray(kb.documents) ? kb.documents : []);
      if (qa.success) setQualityRecords(Array.isArray(qa.records) ? qa.records : []);
    } finally {
      setLoading(false);
    }
  }, [adminToken, inquirySearch]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleUpdateReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInquiry) return;
    setFeedback(null);
    const res = await fetch(
      apiUrl(`/api/admin/frontdesk/inquiries/${encodeURIComponent(selectedInquiry.referenceCode)}/review`),
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          stage: reviewStage,
          notes: reviewNotes || `Updated executive stage to ${reviewStage}`,
          approveCommercialTerms: approveCommercial,
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      setSelectedInquiry(data.inquiry);
      setReviewNotes('');
      setApproveCommercial(false);
      setFeedback(`Executive review stage updated to "${data.inquiry.executiveReviewStage}" and audited.`);
      void loadAll();
    } else {
      setFeedback(data.error || 'Unable to update review stage.');
    }
  };

  const handleExportInquiryJson = (inq: any) => {
    const blob = new Blob([JSON.stringify(inq, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${inq.referenceCode}-discovery-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateKnowledgeDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await fetch(apiUrl('/api/admin/frontdesk/knowledge'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: newKbTitle,
        domain: newKbDomain,
        summary: newKbSummary,
        facts: newKbFacts
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        visibility: newKbVisibility,
        status: newKbStatus,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      setNewKbTitle('');
      setNewKbSummary('');
      setNewKbFacts('');
      setFeedback(`Knowledge document "${data.document.title}" saved (v1, ${data.document.status}).`);
      void loadAll();
    } else {
      setFeedback(data.error || 'Knowledge document rejected.');
    }
  };

  const handleToggleKnowledgeStatus = async (doc: any, nextStatus: 'approved' | 'deactivated') => {
    setFeedback(null);
    const res = await fetch(apiUrl(`/api/admin/frontdesk/knowledge/${encodeURIComponent(doc.id)}`), {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: nextStatus,
        changeNote: `Admin set status to ${nextStatus}`,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      setFeedback(`Updated "${doc.title}" to ${nextStatus} (v${data.document.version}).`);
      void loadAll();
    } else {
      setFeedback(data.error || 'Could not update knowledge document.');
    }
  };

  const handleResolveEscalation = async (id: string, status: 'in_progress' | 'resolved') => {
    const res = await fetch(apiUrl(`/api/admin/frontdesk/escalations/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setFeedback(`Escalation marked ${status}.`);
      void loadAll();
    }
  };

  const handleRecordQuality = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(apiUrl('/api/admin/frontdesk/quality'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rating: qaRating,
        naturalnessScore: qaRating,
        accuracyScore: qaRating,
        policyCompliancePassed: true,
        notes: qaNotes || 'Quality assurance check passed.',
      }),
    });
    if (res.ok) {
      setQaNotes('');
      setFeedback('AI quality evaluation recorded.');
      void loadAll();
    }
  };

  const analytics = overview?.analytics;
  const reviewStages: string[] = overview?.executiveReviewStages || [
    'Project inquiry received',
    'Executive review pending',
    'Consultation scheduled',
    'Consultation completed',
    'Final proposal approved',
    'Formal engagement approved',
  ];

  return (
    <div className="space-y-5">
      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'overview', label: 'Analytics & Overview', icon: BarChart3 },
            { id: 'inquiries', label: `Qualified Inquiries (${inquiries.length})`, icon: ClipboardCheck },
            { id: 'escalations', label: `Human Escalations (${escalations.length})`, icon: Headphones },
            { id: 'knowledge', label: `AI Knowledge (${knowledgeDocs.length})`, icon: BookOpen },
            { id: 'quality', label: `AI Quality (${qualityRecords.length})`, icon: Award },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 cursor-pointer ${
                  subTab === tab.id
                    ? 'bg-slate-800 text-[#00C2C7] border border-[#00C2C7]/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => void loadAll()}
          className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 hover:text-[#00C2C7] flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3 rounded-lg bg-slate-900 border border-[#00C2C7]/40 text-xs font-mono text-slate-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* TAB 1: PRIVACY-SAFE ANALYTICS & OVERVIEW */}
      {subTab === 'overview' && (
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-[#0B1F3B]/60 border border-[#00C2C7]/30 flex items-start gap-2.5 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-[#00C2C7] shrink-0 mt-0.5" />
            <span>
              Privacy-Safe Operational Analytics: Metrics are strictly aggregated. Raw private visitor transcripts and raw voice audio are never exposed in analytics views.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Discovery Sessions', value: analytics?.discoverySessionsCount ?? 0, sub: `${analytics?.totalSessions ?? 0} total sessions` },
              { label: 'Avg Completeness', value: `${analytics?.averageRequirementsCompletenessPercent ?? 0}%`, sub: `${analytics?.totalMasterplansGenerated ?? 0} masterplans` },
              { label: 'Qualified Inquiries', value: analytics?.qualifiedInquiriesCount ?? 0, sub: `${analytics?.consultationRequestsLinkedCount ?? 0} consultations linked` },
              { label: 'Policy Pass Rate', value: `${analytics?.policyCompliancePassRate ?? 100}%`, sub: `${analytics?.openHumanEscalationsCount ?? 0} open escalations` },
            ].map((card) => (
              <div key={card.label} className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                <div className="text-[10.5px] font-mono text-slate-400 uppercase">{card.label}</div>
                <div className="text-xl font-mono font-bold text-[#00C2C7]">{card.value}</div>
                <div className="text-[11px] font-mono text-slate-500">{card.sub}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 text-xs">
              <div className="font-mono text-[11px] uppercase text-[#D4AF37] font-bold">Knowledge Base Governance</div>
              <div className="text-slate-300">Approved Public Entries: {overview?.knowledgeStats?.approvedPublicCount ?? 0}</div>
              <div className="text-slate-300">Internal-Only Isolated Entries: {overview?.knowledgeStats?.internalOnlyCount ?? 0}</div>
              <div className="text-slate-300">Drafts: {overview?.knowledgeStats?.draftCount ?? 0} · Deactivated: {overview?.knowledgeStats?.deactivatedCount ?? 0}</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 text-xs">
              <div className="font-mono text-[11px] uppercase text-[#00C2C7] font-bold">Email Outbox Delivery Summary</div>
              <div className="text-slate-300">Webhook-Confirmed Delivered: {overview?.emailOutboxSummary?.delivered ?? 0}</div>
              <div className="text-slate-300">Provider Accepted (Pending Webhook): {overview?.emailOutboxSummary?.providerAccepted ?? 0}</div>
              <div className="text-slate-300">Failed / Dead Letter: {overview?.emailOutboxSummary?.failed ?? 0}</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: QUALIFIED INQUIRIES & 16-STAGE EXECUTIVE REVIEW */}
      {subTab === 'inquiries' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={inquirySearch}
                onChange={(e) => setInquirySearch(e.target.value)}
                placeholder="Search reference, company, client, or project..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
              />
            </div>
          </div>

          {inquiries.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
              No authorized AI Front Desk inquiries yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-6 space-y-2">
                {inquiries.map((inq) => (
                  <button
                    key={inq.referenceCode}
                    type="button"
                    onClick={() => {
                      setSelectedInquiry(inq);
                      setReviewStage(inq.executiveReviewStage);
                    }}
                    className={`w-full text-left p-3.5 rounded-xl border text-xs cursor-pointer ${
                      selectedInquiry?.referenceCode === inq.referenceCode
                        ? 'bg-[#0B1F3B] border-[#00C2C7]'
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[#00C2C7] font-bold">{inq.referenceCode}</span>
                      <span className="font-mono text-[10px] text-[#D4AF37]">{inq.completenessScore}%</span>
                    </div>
                    <div className="font-bold text-white mt-1">{inq.companyName} — {inq.projectName}</div>
                    <div className="text-slate-400 text-[11px] mt-0.5">
                      {inq.clientName} ({inq.ownerEmail}) · Stage: {inq.executiveReviewStage}
                    </div>
                  </button>
                ))}
              </div>

              <div className="lg:col-span-6">
                {selectedInquiry ? (
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-mono text-[#00C2C7]">{selectedInquiry.referenceCode}</div>
                        <h3 className="text-sm font-bold text-white">{selectedInquiry.companyName} — {selectedInquiry.projectName}</h3>
                        <p className="text-slate-400 text-[11px]">{selectedInquiry.clientName} · {selectedInquiry.ownerEmail}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleExportInquiryJson(selectedInquiry)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 text-[#00C2C7] font-mono text-[11px] cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span>Export JSON</span>
                      </button>
                    </div>

                    <form onSubmit={handleUpdateReview} className="p-3.5 rounded-xl bg-[#0B1220] border border-slate-800 space-y-3">
                      <div className="font-mono text-[11px] text-[#D4AF37] uppercase font-bold">
                        16-Stage Executive Commercial Review (Human Admin Only)
                      </div>
                      <select
                        value={reviewStage}
                        onChange={(e) => setReviewStage(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                      >
                        {reviewStages.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                      <textarea
                        rows={2}
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        placeholder="Executive assessment notes..."
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                      />
                      <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={approveCommercial}
                          onChange={(e) => setApproveCommercial(e.target.checked)}
                          className="accent-[#10B981]"
                        />
                        <span>Record explicit human executive commercial approval</span>
                      </label>
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-lg bg-[#00C2C7] text-[#0B1220] font-bold cursor-pointer"
                      >
                        Update Executive Stage
                      </button>
                    </form>

                    <div className="space-y-1.5">
                      <div className="font-mono text-[11px] text-slate-400 uppercase">Review Audit History</div>
                      {(selectedInquiry.reviewHistory || []).map((entry: any, i: number) => (
                        <div key={i} className="p-2 rounded bg-[#0B1220] border border-slate-800 text-[11px]">
                          <span className="text-[#00C2C7] font-mono">{entry.stage}</span> · {entry.actorEmail} — {entry.notes}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                    Select an inquiry to inspect its 25-section masterplan and advance Executive Commercial Review.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: HUMAN ESCALATIONS */}
      {subTab === 'escalations' && (
        <div className="space-y-2.5 text-xs">
          {escalations.length === 0 ? (
            <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
              No human escalation handover requests logged.
            </div>
          ) : (
            escalations.map((esc) => (
              <div key={esc.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-mono text-[#D4AF37] font-bold">
                    {esc.referenceCode} · Track: {esc.requestedTrack} · Status: {esc.status.toUpperCase()}
                  </div>
                  <div className="text-white font-semibold">{esc.clientName} ({esc.clientEmail || 'No email'})</div>
                  <div className="text-slate-300">{esc.reason}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleResolveEscalation(esc.id, 'in_progress')}
                    className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                  >
                    Mark In Progress
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleResolveEscalation(esc.id, 'resolved')}
                    className="px-3 py-1.5 rounded bg-[#10B981] text-[#0B1220] font-bold cursor-pointer"
                  >
                    Resolve
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 4: AI KNOWLEDGE BASE ADMINISTRATION */}
      {subTab === 'knowledge' && (
        <div className="space-y-5 text-xs">
          <form onSubmit={handleCreateKnowledgeDoc} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="font-mono text-[11px] uppercase text-[#00C2C7] font-bold flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              <span>Add Versioned AI Knowledge Entry (Prompt-Injection Protected)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                required
                value={newKbTitle}
                onChange={(e) => setNewKbTitle(e.target.value)}
                placeholder="Document title"
                className="px-3 py-2 rounded-lg bg-[#0B1220] border border-slate-700 text-white"
              />
              <select
                value={newKbDomain}
                onChange={(e) => setNewKbDomain(e.target.value)}
                className="px-3 py-2 rounded-lg bg-[#0B1220] border border-slate-700 text-white"
              >
                <option value="technical_qa">Technical Q&amp;A</option>
                <option value="industry_solutions">Industry Solutions</option>
                <option value="website_development">Website Development</option>
                <option value="solutions_catalog">Solutions Catalog</option>
                <option value="corporate_identity">Corporate Identity</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newKbVisibility}
                  onChange={(e) => setNewKbVisibility(e.target.value as any)}
                  className="px-2 py-2 rounded-lg bg-[#0B1220] border border-slate-700 text-white"
                >
                  <option value="public">Public RAG</option>
                  <option value="internal_only">Internal Only</option>
                </select>
                <select
                  value={newKbStatus}
                  onChange={(e) => setNewKbStatus(e.target.value as any)}
                  className="px-2 py-2 rounded-lg bg-[#0B1220] border border-slate-700 text-white"
                >
                  <option value="draft">Draft</option>
                  <option value="approved">Approved</option>
                </select>
              </div>
            </div>
            <input
              required
              value={newKbSummary}
              onChange={(e) => setNewKbSummary(e.target.value)}
              placeholder="Concise verified summary..."
              className="w-full px-3 py-2 rounded-lg bg-[#0B1220] border border-slate-700 text-white"
            />
            <textarea
              rows={2}
              value={newKbFacts}
              onChange={(e) => setNewKbFacts(e.target.value)}
              placeholder="Key facts (one per line)..."
              className="w-full px-3 py-2 rounded-lg bg-[#0B1220] border border-slate-700 text-white"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#00C2C7] text-[#0B1220] font-bold cursor-pointer"
            >
              Create Knowledge Document
            </button>
          </form>

          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {knowledgeDocs.map((doc) => (
              <div key={doc.id} className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-white truncate">{doc.title}</div>
                  <div className="text-[11px] font-mono text-slate-400">
                    {doc.domain} · v{doc.version} · {doc.status.toUpperCase()} · {doc.visibility}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {doc.status !== 'approved' && (
                    <button
                      type="button"
                      onClick={() => void handleToggleKnowledgeStatus(doc, 'approved')}
                      className="px-2.5 py-1 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-mono text-[11px] cursor-pointer"
                    >
                      Approve
                    </button>
                  )}
                  {doc.status !== 'deactivated' && (
                    <button
                      type="button"
                      onClick={() => void handleToggleKnowledgeStatus(doc, 'deactivated')}
                      className="px-2.5 py-1 rounded bg-rose-950/60 border border-rose-500/40 text-rose-300 font-mono text-[11px] cursor-pointer"
                    >
                      Deactivate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: AI QUALITY ASSURANCE */}
      {subTab === 'quality' && (
        <div className="space-y-4 text-xs">
          <form onSubmit={handleRecordQuality} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="font-mono text-[11px] uppercase text-[#D4AF37] font-bold">
              Log AI Conversation Quality Evaluation
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-slate-300">Rating (1-5):</label>
              <select
                value={qaRating}
                onChange={(e) => setQaRating(Number(e.target.value))}
                className="px-3 py-1.5 rounded bg-[#0B1220] border border-slate-700 text-white"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} / 5
                  </option>
                ))}
              </select>
              <input
                value={qaNotes}
                onChange={(e) => setQaNotes(e.target.value)}
                placeholder="Evaluation notes (naturalness, accuracy, zero-pricing compliance)..."
                className="flex-1 min-w-[220px] px-3 py-1.5 rounded bg-[#0B1220] border border-slate-700 text-white"
              />
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-[#00C2C7] text-[#0B1220] font-bold cursor-pointer"
              >
                Record Evaluation
              </button>
            </div>
          </form>

          <div className="space-y-2">
            {qualityRecords.map((rec) => (
              <div key={rec.id} className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-[#00C2C7] font-bold">{rec.rating}/5</span> ·{' '}
                  <span className="text-white">{rec.notes}</span>
                </div>
                <span className="text-[11px] font-mono text-slate-400">{rec.evaluatorEmail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminFrontDeskConsole;
