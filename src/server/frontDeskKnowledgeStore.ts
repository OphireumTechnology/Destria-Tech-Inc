import crypto from 'crypto';
import {
  CORPORATE_KNOWLEDGE_BASE,
  CORPORATE_KNOWLEDGE_VERSION,
  CorporateKnowledgeEntry,
  KnowledgeClassification,
  KnowledgeDomainId,
} from '../data/corporateKnowledgeBase';
import {
  FrontDeskPersistenceAdapter,
  FrontDeskPersistenceStatus,
  FrontDeskPersistenceUnavailableError,
} from './frontDeskRepository';

/**
 * M06 / M07 / M22 / M27: Administrator-Controlled Versioned AI Knowledge Management Store
 *
 * Security & Governance Guarantees:
 * - Wraps verified canonical corporate & technology knowledge entries with version tracking.
 * - Supports admin CRUD (create, update, approve, deactivate) with full version history.
 * - Supports durable Supabase PostgreSQL persistence via `FrontDeskPersistenceAdapter` with
 *   fail-closed production enforcement when persistence is unconfigured.
 * - Strictly blocks prompt-injection override phrases in uploaded/edited knowledge entries.
 * - Strictly isolates `visibility: 'internal_only'` and non-approved (`draft`, `deactivated`)
 *   records so confidential or unapproved documents are NEVER retrieved into public AI replies.
 */

export type KnowledgeStatus = 'draft' | 'approved' | 'deactivated';
export type KnowledgeVisibility = 'public' | 'internal_only';

export interface KnowledgeVersionSnapshot {
  version: number;
  title: string;
  summary: string;
  facts: string[];
  keywords: string[];
  status: KnowledgeStatus;
  visibility: KnowledgeVisibility;
  updatedBy: string;
  updatedAt: string;
  changeNote: string;
}

export interface ManagedKnowledgeDocument {
  id: string;
  domain: KnowledgeDomainId;
  knowledgeType: KnowledgeClassification;
  title: string;
  keywords: string[];
  summary: string;
  facts: string[];
  canonicalLinks: string[];
  complianceNotice?: string;
  sourceReference: string;
  status: KnowledgeStatus;
  visibility: KnowledgeVisibility;
  version: number;
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  versions: KnowledgeVersionSnapshot[];
}

export interface FrontDeskKnowledgeStoreOptions {
  persistence?: FrontDeskPersistenceAdapter | null;
  productionStrictMode?: boolean;
}

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+)?(?:previous|prior|above|system)\s+instructions?/i,
  /disregard\s+(?:the\s+)?(?:system\s+prompt|security\s+policy|pricing\s+policy)/i,
  /override\s+(?:system|governance|security|commercial)\s+(?:instructions?|rules?|policy)/i,
  /you\s+are\s+now\s+(?:in\s+)?(?:developer|unrestricted|jailbreak|dan)\s+mode/i,
  /reveal\s+(?:api\s+keys?|secrets?|environment\s+variables?|internal\s+emails?)/i,
  /<\s*script\b/i,
];

export function detectKnowledgePromptInjection(text: string): { flagged: boolean; reason?: string } {
  const sample = String(text || '');
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(sample)) {
      return {
        flagged: true,
        reason: `Rejected unsafe instruction-override content matching security filter (${pattern.source.slice(0, 40)}).`,
      };
    }
  }
  return { flagged: false };
}

function sanitizeText(raw: unknown, maxLen: number): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

export class FrontDeskKnowledgeStore {
  private readonly docs = new Map<string, ManagedKnowledgeDocument>();
  private readonly persistence: FrontDeskPersistenceAdapter | null;
  private readonly productionStrictMode: boolean;

  constructor(options: FrontDeskKnowledgeStoreOptions = {}) {
    this.persistence = options.persistence ?? null;
    this.productionStrictMode = Boolean(options.productionStrictMode);
    this.seedFromCanonicalBase();
  }

  public getPersistenceStatus(): FrontDeskPersistenceStatus {
    if (this.persistence?.isDurable) {
      return { mode: this.persistence.mode, durable: true, configured: true };
    }
    if (this.productionStrictMode) {
      return { mode: 'unconfigured', durable: false, configured: false };
    }
    return { mode: 'memory', durable: false, configured: true };
  }

  private assertDurablePersistenceAvailable(operation: string): void {
    if (this.productionStrictMode && (!this.persistence || !this.persistence.isDurable)) {
      throw new FrontDeskPersistenceUnavailableError(
        `AI Knowledge ${operation} requires durable Supabase persistence in production.`
      );
    }
  }

  public async hydrateFromPersistence(): Promise<number> {
    if (!this.persistence?.isDurable) return 0;
    const persisted = await this.persistence.listKnowledgeDocuments();
    for (const doc of persisted) {
      this.docs.set(doc.id, doc);
    }
    return persisted.length;
  }

  private seedFromCanonicalBase() {
    const now = new Date().toISOString();
    for (const entry of CORPORATE_KNOWLEDGE_BASE) {
      const doc: ManagedKnowledgeDocument = {
        id: entry.id,
        domain: entry.domain,
        knowledgeType: entry.knowledgeType || 'verified_corporate_offering',
        title: entry.title,
        keywords: [...entry.keywords],
        summary: entry.summary,
        facts: [...entry.facts],
        canonicalLinks: [...(entry.canonicalLinks || [])],
        complianceNotice: entry.complianceNotice,
        sourceReference: `canonical:${CORPORATE_KNOWLEDGE_VERSION}:${entry.id}`,
        status: 'approved',
        visibility: 'public',
        version: 1,
        createdAt: now,
        updatedAt: now,
        approvedBy: 'system:verified_corporate_baseline',
        approvedAt: now,
        versions: [
          {
            version: 1,
            title: entry.title,
            summary: entry.summary,
            facts: [...entry.facts],
            keywords: [...entry.keywords],
            status: 'approved',
            visibility: 'public',
            updatedBy: 'system:verified_corporate_baseline',
            updatedAt: now,
            changeNote: 'Initial verified corporate and technical knowledge baseline.',
          },
        ],
      };
      this.docs.set(doc.id, doc);
    }
  }

  public listDocuments(filters?: {
    domain?: string;
    status?: KnowledgeStatus;
    visibility?: KnowledgeVisibility;
    query?: string;
  }): ManagedKnowledgeDocument[] {
    let items = Array.from(this.docs.values());
    if (filters?.domain && filters.domain !== 'all') {
      items = items.filter((d) => d.domain === filters.domain);
    }
    if (filters?.status) {
      items = items.filter((d) => d.status === filters.status);
    }
    if (filters?.visibility) {
      items = items.filter((d) => d.visibility === filters.visibility);
    }
    if (filters?.query) {
      const q = filters.query.trim().toLowerCase();
      items = items.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.summary.toLowerCase().includes(q) ||
          d.keywords.some((k) => k.toLowerCase().includes(q))
      );
    }
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  public async listDocumentsDurable(filters?: {
    domain?: string;
    status?: KnowledgeStatus;
    visibility?: KnowledgeVisibility;
    query?: string;
  }): Promise<ManagedKnowledgeDocument[]> {
    if (this.persistence?.isDurable) {
      await this.hydrateFromPersistence();
    }
    return this.listDocuments(filters);
  }

  public getDocument(id: string): ManagedKnowledgeDocument | null {
    return this.docs.get(id) || null;
  }

  /**
   * Public RAG retrieval: STRICTLY filters to `status === 'approved' && visibility === 'public'`.
   * Confidential (`internal_only`), `draft`, and `deactivated` records are NEVER returned.
   */
  public retrieveApprovedPublicKnowledge(
    query: string,
    options?: { topK?: number; domain?: KnowledgeDomainId }
  ): Array<{ entry: ManagedKnowledgeDocument; score: number }> {
    const topK = Math.max(1, Math.min(8, options?.topK ?? 3));
    const q = query.trim().toLowerCase();

    const pool = Array.from(this.docs.values()).filter(
      (d) =>
        d.status === 'approved' &&
        d.visibility === 'public' &&
        (!options?.domain || d.domain === options.domain)
    );

    if (!q) {
      return pool.slice(0, topK).map((entry) => ({ entry, score: 1 }));
    }

    const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
    const scored: Array<{ entry: ManagedKnowledgeDocument; score: number }> = [];

    for (const entry of pool) {
      let score = 0;
      const titleLower = entry.title.toLowerCase();
      const summaryLower = entry.summary.toLowerCase();
      const factsLower = entry.facts.join(' ').toLowerCase();

      for (const kw of entry.keywords) {
        if (q.includes(kw.toLowerCase())) {
          score += kw.includes(' ') ? 8 : 5;
        }
      }
      for (const tok of tokens) {
        if (titleLower.includes(tok)) score += 3;
        if (summaryLower.includes(tok)) score += 2;
        if (factsLower.includes(tok)) score += 1;
      }
      if (score > 0) {
        scored.push({ entry, score });
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  public createDocument(input: {
    domain: KnowledgeDomainId;
    knowledgeType?: KnowledgeClassification;
    title: string;
    summary: string;
    facts: string[];
    keywords?: string[];
    canonicalLinks?: string[];
    sourceReference?: string;
    visibility?: KnowledgeVisibility;
    status?: KnowledgeStatus;
    actorEmail: string;
    changeNote?: string;
  }): { ok: true; document: ManagedKnowledgeDocument } | { ok: false; error: string } {
    this.assertDurablePersistenceAvailable('document creation');
    const title = sanitizeText(input.title, 180);
    const summary = sanitizeText(input.summary, 1200);
    const facts = (Array.isArray(input.facts) ? input.facts : [])
      .map((f) => sanitizeText(f, 500))
      .filter(Boolean)
      .slice(0, 12);
    const keywords = (Array.isArray(input.keywords) ? input.keywords : [])
      .map((k) => sanitizeText(k, 60).toLowerCase())
      .filter(Boolean)
      .slice(0, 24);

    if (title.length < 3 || summary.length < 10) {
      return { ok: false, error: 'Knowledge document title (min 3 chars) and summary (min 10 chars) are required.' };
    }

    const combinedText = `${title}\n${summary}\n${facts.join('\n')}`;
    const injectionCheck = detectKnowledgePromptInjection(combinedText);
    if (injectionCheck.flagged) {
      return { ok: false, error: injectionCheck.reason || 'Prompt-injection content blocked by security policy.' };
    }

    const now = new Date().toISOString();
    const id = `kb-custom-${crypto.randomBytes(5).toString('hex')}`;
    const visibility: KnowledgeVisibility =
      input.visibility === 'internal_only' ? 'internal_only' : 'public';
    const status: KnowledgeStatus =
      input.status === 'approved' || input.status === 'deactivated' ? input.status : 'draft';

    const doc: ManagedKnowledgeDocument = {
      id,
      domain: input.domain,
      knowledgeType: input.knowledgeType || 'general_technical_knowledge',
      title,
      keywords,
      summary,
      facts,
      canonicalLinks: (input.canonicalLinks || []).map((l) => sanitizeText(l, 240)).filter(Boolean),
      sourceReference: sanitizeText(input.sourceReference, 180) || `admin:${input.actorEmail}`,
      status,
      visibility,
      version: 1,
      createdAt: now,
      updatedAt: now,
      approvedBy: status === 'approved' ? input.actorEmail : undefined,
      approvedAt: status === 'approved' ? now : undefined,
      versions: [
        {
          version: 1,
          title,
          summary,
          facts: [...facts],
          keywords: [...keywords],
          status,
          visibility,
          updatedBy: input.actorEmail,
          updatedAt: now,
          changeNote: sanitizeText(input.changeNote, 240) || 'Created via Admin Knowledge Management.',
        },
      ],
    };

    this.docs.set(id, doc);
    return { ok: true, document: doc };
  }

  public async createDocumentDurable(
    input: Parameters<FrontDeskKnowledgeStore['createDocument']>[0]
  ): Promise<{ ok: true; document: ManagedKnowledgeDocument } | { ok: false; error: string }> {
    this.assertDurablePersistenceAvailable('document creation');
    const created = this.createDocument(input);
    if (created.ok && this.persistence?.isDurable) {
      await this.persistence.saveKnowledgeDocument(created.document);
    }
    return created;
  }

  public updateDocument(
    id: string,
    patch: {
      title?: string;
      summary?: string;
      facts?: string[];
      keywords?: string[];
      status?: KnowledgeStatus;
      visibility?: KnowledgeVisibility;
      changeNote?: string;
      actorEmail: string;
    }
  ): { ok: true; document: ManagedKnowledgeDocument } | { ok: false; error: string } {
    this.assertDurablePersistenceAvailable('document update');
    const existing = this.docs.get(id);
    if (!existing) {
      return { ok: false, error: `Knowledge document "${id}" not found.` };
    }

    const nextTitle = patch.title !== undefined ? sanitizeText(patch.title, 180) : existing.title;
    const nextSummary = patch.summary !== undefined ? sanitizeText(patch.summary, 1200) : existing.summary;
    const nextFacts =
      patch.facts !== undefined
        ? patch.facts.map((f) => sanitizeText(f, 500)).filter(Boolean).slice(0, 12)
        : existing.facts;
    const nextKeywords =
      patch.keywords !== undefined
        ? patch.keywords.map((k) => sanitizeText(k, 60).toLowerCase()).filter(Boolean).slice(0, 24)
        : existing.keywords;

    const combinedText = `${nextTitle}\n${nextSummary}\n${nextFacts.join('\n')}`;
    const injectionCheck = detectKnowledgePromptInjection(combinedText);
    if (injectionCheck.flagged) {
      return { ok: false, error: injectionCheck.reason || 'Prompt-injection content blocked by security policy.' };
    }

    const nextStatus: KnowledgeStatus = patch.status || existing.status;
    const nextVisibility: KnowledgeVisibility = patch.visibility || existing.visibility;
    const now = new Date().toISOString();
    const nextVersion = existing.version + 1;

    const updated: ManagedKnowledgeDocument = {
      ...existing,
      title: nextTitle,
      summary: nextSummary,
      facts: nextFacts,
      keywords: nextKeywords,
      status: nextStatus,
      visibility: nextVisibility,
      version: nextVersion,
      updatedAt: now,
      approvedBy: nextStatus === 'approved' ? patch.actorEmail : existing.approvedBy,
      approvedAt: nextStatus === 'approved' ? now : existing.approvedAt,
      versions: [
        ...existing.versions.slice(-19),
        {
          version: nextVersion,
          title: nextTitle,
          summary: nextSummary,
          facts: [...nextFacts],
          keywords: [...nextKeywords],
          status: nextStatus,
          visibility: nextVisibility,
          updatedBy: patch.actorEmail,
          updatedAt: now,
          changeNote: sanitizeText(patch.changeNote, 240) || `Updated to v${nextVersion} (${nextStatus}).`,
        },
      ],
    };

    this.docs.set(id, updated);
    return { ok: true, document: updated };
  }

  public async updateDocumentDurable(
    id: string,
    patch: Parameters<FrontDeskKnowledgeStore['updateDocument']>[1]
  ): Promise<{ ok: true; document: ManagedKnowledgeDocument } | { ok: false; error: string }> {
    this.assertDurablePersistenceAvailable('document update');
    if (this.persistence?.isDurable && !this.docs.has(id)) {
      await this.hydrateFromPersistence();
    }
    const updated = this.updateDocument(id, patch);
    if (updated.ok && this.persistence?.isDurable) {
      await this.persistence.saveKnowledgeDocument(updated.document);
    }
    return updated;
  }

  public getStats() {
    const all = Array.from(this.docs.values());
    return {
      version: CORPORATE_KNOWLEDGE_VERSION,
      totalDocuments: all.length,
      approvedPublicCount: all.filter((d) => d.status === 'approved' && d.visibility === 'public').length,
      internalOnlyCount: all.filter((d) => d.visibility === 'internal_only').length,
      draftCount: all.filter((d) => d.status === 'draft').length,
      deactivatedCount: all.filter((d) => d.status === 'deactivated').length,
      persistence: this.getPersistenceStatus(),
    };
  }
}

export function formatManagedKnowledgeEntry(doc: CorporateKnowledgeEntry | ManagedKnowledgeDocument): string {
  const tag =
    doc.knowledgeType === 'general_technical_knowledge'
      ? 'General Technical Guidance'
      : 'Verified DESTRIA TECH INC Offering';
  return `[${doc.title} — ${tag}]\n${doc.summary}\n${doc.facts
    .slice(0, 5)
    .map((f) => `- ${f}`)
    .join('\n')}`;
}
