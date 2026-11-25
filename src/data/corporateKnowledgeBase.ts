import {
  corporateIdentity,
  executiveLeadership,
  CORPORATE_SERVICE_STATEMENT,
  COMMERCIAL_ENGAGEMENT_STATEMENT,
  LEGAL_GOVERNANCE_STATEMENTS,
} from './companyConfig';
import {
  CATALOG_CATEGORIES,
  CATALOG_DIVISION_SUMMARIES,
  SERVICE_CATALOG,
  COMMERCIAL_ENGAGEMENT_NOTICE,
  EXTERNAL_CHARGES_DISCLOSURE,
  BLOCKCHAIN_COMPLIANCE_NOTICE,
  EMERGING_TECH_FEASIBILITY_NOTICE,
} from './serviceCatalog';
import {
  CORPORATE_PROFILE_RESOURCE,
  SERVICES_BROCHURE_RESOURCE,
} from './corporateResources';

/**
 * Version-Controlled, Retrieval-Grounded Corporate Knowledge Repository
 * for DESTRIA TECH INC (DESTRIA NETWORK).
 *
 * Strictly sourced from verified corporate configuration, official publications,
 * and the 10-category customized enterprise service catalog. Contains zero
 * fabricated certifications, unverified client claims, or public pricing.
 */

export const CORPORATE_KNOWLEDGE_VERSION = '2026.11.26-enterprise-v3';

export type KnowledgeDomainId =
  | 'corporate_identity'
  | 'corporate_profile'
  | 'executive_leadership'
  | 'service_catalog'
  | 'enterprise_architecture'
  | 'ai_automation'
  | 'software_platforms'
  | 'blockchain_systems'
  | 'cloud_cybersecurity'
  | 'creative_multimedia'
  | 'corporate_governance'
  | 'commercial_policy'
  | 'consultation_procedures'
  | 'corporate_resources'
  | 'official_contacts'
  | 'faq';

export interface CorporateKnowledgeEntry {
  id: string;
  domain: KnowledgeDomainId;
  title: string;
  keywords: string[];
  summary: string;
  facts: string[];
  canonicalLinks?: string[];
  complianceNotice?: string;
}

const DIVISION_LINES = CATALOG_DIVISION_SUMMARIES.map(
  (d) => `${Number(d.number)}. ${d.label} (${d.count} customized solution frameworks)`
);

export const CORPORATE_KNOWLEDGE_BASE: readonly CorporateKnowledgeEntry[] = [
  {
    id: 'kb-corporate-identity',
    domain: 'corporate_identity',
    title: 'DESTRIA TECH INC Official Corporate Identity',
    keywords: [
      'destria',
      'destria tech',
      'destria network',
      'dti',
      'who are you',
      'about destria',
      'company',
      'corporation',
      'wyoming',
      'registered',
      'legal entity',
      'headquarters',
      'sheridan',
      'about',
    ],
    summary:
      'DESTRIA TECH INC (network brand: DESTRIA NETWORK, abbreviation: DTI) is a Wyoming-registered enterprise technology corporation delivering customized software engineering, AI systems, cloud infrastructure, cybersecurity, blockchain, and creative multimedia platforms.',
    facts: [
      `Legal Entity Name: ${corporateIdentity.legalName}`,
      `Network Brand: ${corporateIdentity.networkName} (${corporateIdentity.abbreviation})`,
      `Jurisdiction of Registration: ${corporateIdentity.jurisdiction}`,
      `Official Registered Headquarters: ${corporateIdentity.headquarters.fullAddress}`,
      'Corporate HQ is an official registered corporate headquarters address, not a walk-in retail storefront; client briefings are arranged by scheduled appointment.',
      `Official Website: https://destriatech.com/`,
    ],
    canonicalLinks: ['https://destriatech.com/', 'https://destriatech.com/corporate-profile'],
  },
  {
    id: 'kb-executive-leadership',
    domain: 'executive_leadership',
    title: 'Executive Leadership — Founder & CEO and Chief Technology Officer',
    keywords: [
      'ceo',
      'cto',
      'founder',
      'leadership',
      'executives',
      'management',
      'desmond',
      'desmond hinds',
      'hinds',
      'leodenis',
      'leodenis languisan',
      'who runs',
      'owner',
    ],
    summary:
      `DESTRIA TECH INC is led by ${executiveLeadership.founderAndCEO.title} ${executiveLeadership.founderAndCEO.fullName} and ${executiveLeadership.chiefTechnologyOfficer.title} ${executiveLeadership.chiefTechnologyOfficer.fullName}.`,
    facts: [
      `${executiveLeadership.founderAndCEO.title}: ${executiveLeadership.founderAndCEO.fullName} — executive strategy, institutional partnerships, and governance.`,
      `${executiveLeadership.chiefTechnologyOfficer.title}: ${executiveLeadership.chiefTechnologyOfficer.fullName} — enterprise systems architecture, AI engineering, cloud security, and technical delivery.`,
      'Prospective clients can request a CEO Strategic Consultation, CTO Technical Architecture Consultation, or Solutions Architecture Team Advisory session.',
    ],
    canonicalLinks: ['https://destriatech.com/corporate-profile', 'https://destriatech.com/consultation'],
  },
  {
    id: 'kb-corporate-profile',
    domain: 'corporate_profile',
    title: 'Official 17-Page Corporate Profile',
    keywords: [
      'corporate profile',
      'company profile',
      'vision',
      'mission',
      'core values',
      'strategic objectives',
      'engagement framework',
      '15 stage',
      '17 pages',
      'pdf',
      'profile',
    ],
    summary:
      'The official 17-page DESTRIA TECH INC Corporate Profile documents executive leadership, corporate vision and mission, 7 core values, 10 strategic objectives, the 8-layer modular enterprise technology architecture, 15-stage engagement framework, and responsible AI governance.',
    facts: [
      `Document Title: ${CORPORATE_PROFILE_RESOURCE.title} (${CORPORATE_PROFILE_RESOURCE.pageCount} pages, PDF)`,
      `Direct PDF URL: ${CORPORATE_PROFILE_RESOURCE.canonicalFileUrl}`,
      'Dedicated Corporate Profile Page: https://destriatech.com/corporate-profile',
      'Core Values: 6.1 Integrity & Accountability, 6.2 Technological Excellence, 6.3 Innovation & Adaptability, 6.4 Security & Confidentiality, 6.5 Client-Centered Engineering, 6.6 Responsible Artificial Intelligence, 6.7 Commercial Transparency.',
      'Engagement Lifecycle: Structured 15-stage enterprise delivery framework from initial consultation and discovery through architecture, engineering, security testing, deployment, and governed support.',
    ],
    canonicalLinks: [
      'https://destriatech.com/corporate-profile',
      CORPORATE_PROFILE_RESOURCE.canonicalFileUrl,
    ],
  },
  {
    id: 'kb-corporate-resources',
    domain: 'corporate_resources',
    title: 'Corporate Resources & 8-Page Line of Services Brochure',
    keywords: [
      'brochure',
      'line of services',
      'services brochure',
      'corporate summary',
      'resources',
      'download',
      'download center',
      'catalog pdf',
      'capabilities',
      'presentation',
      'deck',
      'documents',
    ],
    summary:
      'DESTRIA TECH INC publishes official downloadable corporate documents at the Corporate Resources Download Center (/resources), including the 8-page Corporate Summary and Enterprise Technology Services brochure and the 17-page Official Corporate Profile.',
    facts: [
      `Brochure Title: ${SERVICES_BROCHURE_RESOURCE.title} (${SERVICES_BROCHURE_RESOURCE.pageCount} pages, PDF)`,
      `Direct Services Brochure PDF: ${SERVICES_BROCHURE_RESOURCE.canonicalFileUrl}`,
      `Corporate Resources Download Center: https://destriatech.com/resources`,
      `Corporate Profile PDF: ${CORPORATE_PROFILE_RESOURCE.canonicalFileUrl}`,
    ],
    canonicalLinks: [
      'https://destriatech.com/resources',
      SERVICES_BROCHURE_RESOURCE.canonicalFileUrl,
      CORPORATE_PROFILE_RESOURCE.canonicalFileUrl,
    ],
  },
  {
    id: 'kb-service-catalog',
    domain: 'service_catalog',
    title: '10-Category Customized Enterprise Service Catalog',
    keywords: [
      'services',
      'catalog',
      'solutions',
      'divisions',
      'offerings',
      'what do you do',
      'what do you offer',
      'capabilities',
      'enterprise solutions',
    ],
    summary: `DESTRIA TECH INC delivers ${SERVICE_CATALOG.length} customized enterprise technology solution frameworks organized across ${CATALOG_CATEGORIES.filter((c) => c.id !== 'all').length} integrated divisions.`,
    facts: [CORPORATE_SERVICE_STATEMENT, ...DIVISION_LINES],
    canonicalLinks: ['https://destriatech.com/services', 'https://destriatech.com/resources'],
  },
  {
    id: 'kb-enterprise-architecture',
    domain: 'enterprise_architecture',
    title: '8-Layer Modular Enterprise Technology Architecture',
    keywords: [
      'architecture',
      '8 layer',
      'eight layer',
      'modular',
      'stack',
      'layers',
      'blueprint',
      'integration layer',
      'data layer',
      'governance layer',
    ],
    summary:
      'DESTRIA TECH INC architects enterprise platforms across an 8-Layer Modular Technology Architecture ensuring scalability, interoperability, security, and executive governance.',
    facts: [
      'Layer 1 — Digital Experience Layer: Executive web applications, mobile interfaces, client portals, and multimedia frontends.',
      'Layer 2 — Application Layer: Domain business logic, ERP/CRM modules, workflow engines, and commerce platforms.',
      'Layer 3 — Artificial Intelligence Layer: Custom AI agents, RAG knowledge systems, voice/chat assistants, and predictive analytics.',
      'Layer 4 — Integration Layer: Secure REST/GraphQL APIs, webhooks, legacy ERP/CRM connectors, and event buses.',
      'Layer 5 — Data Layer: PostgreSQL/Cloud SQL relational data stores, analytical warehouses, and governed document repositories.',
      'Layer 6 — Infrastructure Layer: Managed cloud infrastructure, container orchestration, CI/CD automation, and observability.',
      'Layer 7 — Security Layer: Zero-trust controls, RBAC, row-level security, encryption in transit/at rest, and security testing.',
      'Layer 8 — Governance Layer: Audit logging, responsible AI oversight, compliance alignment, and lifecycle administration.',
    ],
    canonicalLinks: ['https://destriatech.com/corporate-profile'],
  },
  {
    id: 'kb-ai-automation',
    domain: 'ai_automation',
    title: 'Artificial Intelligence, Agents & Enterprise Automation',
    keywords: [
      'ai',
      'artificial intelligence',
      'chatbot',
      'voice assistant',
      'ai agent',
      'agents',
      'automation',
      'workflow',
      'llm',
      'rag',
      'machine learning',
      'gemini',
      'predictive',
      'nlp',
    ],
    summary:
      'Customized enterprise AI systems including autonomous workflow agents, real-time voice and chat consultants, RAG enterprise knowledge bases, document intelligence, and process automation.',
    facts: [
      'Solutions include Custom AI Assistants & Voice Agents, Enterprise RAG Knowledge Systems, Intelligent Workflow & Process Automation, and AI Analytics Pipelines.',
      'All AI deployments adhere to Responsible AI Governance: human-in-the-loop approvals, server-side secret isolation, audit logging, and strict policy guardrails.',
    ],
  },
  {
    id: 'kb-software-platforms',
    domain: 'software_platforms',
    title: 'Custom Enterprise Software, Web, Mobile, ERP & CRM Platforms',
    keywords: [
      'software',
      'website',
      'web app',
      'web development',
      'mobile app',
      'ios',
      'android',
      'saas',
      'erp',
      'crm',
      'portal',
      'ecommerce',
      'e-commerce',
      'inventory',
      'booking',
      'custom app',
      'dashboard',
    ],
    summary:
      'End-to-end engineering of custom corporate web platforms, client portals, SaaS products, native/cross-platform mobile apps, ERP/CRM systems, and industry-specific operational platforms.',
    facts: [
      'Engineered around each client’s workflows, existing databases, third-party APIs, and security standards.',
      'Typical engagement sequence: Technical Discovery -> Architecture Blueprint -> Staged Milestone Engineering -> QA & Security Hardening -> Deployment & Managed Support.',
    ],
  },
  {
    id: 'kb-blockchain-systems',
    domain: 'blockchain_systems',
    title: 'Blockchain, Smart Contracts & Distributed Ledger Engineering',
    keywords: [
      'blockchain',
      'web3',
      'smart contract',
      'solidity',
      'ledger',
      'token',
      'wallet',
      'defi',
      'nft',
      'dao',
      'audit trail',
      'distributed ledger',
    ],
    summary:
      'Compliance-aligned blockchain architecture, auditable smart contracts, enterprise supply-chain or credential ledgers, and Web3 platform engineering.',
    facts: [
      'Capabilities span private/permissioned ledgers, smart contract architecture, verifiable audit trails, and secure custody/wallet integration.',
      BLOCKCHAIN_COMPLIANCE_NOTICE,
    ],
    complianceNotice: BLOCKCHAIN_COMPLIANCE_NOTICE,
  },
  {
    id: 'kb-cloud-cybersecurity',
    domain: 'cloud_cybersecurity',
    title: 'Cloud Infrastructure, DevOps & Enterprise Cybersecurity',
    keywords: [
      'cloud',
      'devops',
      'kubernetes',
      'docker',
      'aws',
      'gcp',
      'azure',
      'cybersecurity',
      'security',
      'audit',
      'compliance',
      'rbac',
      'zero trust',
      'soc',
      'encryption',
      'migration',
      'infrastructure',
      'hosting',
      'monitoring',
    ],
    summary:
      'Resilient cloud architecture, migration, CI/CD pipelines, infrastructure hardening, application security assessments, RBAC/zero-trust controls, and ongoing digital care.',
    facts: [
      'Encompasses cloud architecture modernization, database reliability, automated backups, security posture reviews, access-control engineering, and observability.',
      'Note: DESTRIA TECH INC does not claim unverified third-party certifications; compliance engineering is scoped per client regulatory context during technical assessment.',
    ],
  },
  {
    id: 'kb-creative-multimedia',
    domain: 'creative_multimedia',
    title: 'Creative Technology & Ophireum Multimedia Production',
    keywords: [
      'multimedia',
      'ophireum',
      'video',
      'production',
      'cinema',
      '4k',
      '8k',
      '3d',
      'vfx',
      'broadcast',
      'branding',
      'creative',
      'media',
      'design',
      'animation',
    ],
    summary:
      'Creative technology and enterprise multimedia production through the DESTRIA NETWORK / Ophireum Multimedia Production division, spanning brand identity systems, corporate cinema, 3D/VFX, interactive media, and digital experience design.',
    facts: [
      'Integrates high-production visual communication with enterprise digital platforms, corporate launches, and executive brand architectures.',
      EMERGING_TECH_FEASIBILITY_NOTICE,
    ],
  },
  {
    id: 'kb-commercial-policy',
    domain: 'commercial_policy',
    title: 'Strict Commercial Engagement & Zero Public Pricing Policy',
    keywords: [
      'price',
      'pricing',
      'cost',
      'rate',
      'budget',
      'quote',
      'estimate',
      'fee',
      'discount',
      'promo',
      'package',
      'cheapest',
      'commercial',
      'proposal',
      'magkano',
      'presyo',
    ],
    summary: COMMERCIAL_ENGAGEMENT_STATEMENT,
    facts: [
      COMMERCIAL_ENGAGEMENT_NOTICE,
      'DESTRIA TECH INC does NOT publish standardized pricing, hourly rates, monthly tiers, starting prices, automated cost estimates, or public discount/promo codes.',
      'All engagements are individually scoped following initial consultation, technical assessment, and formal written proposal review.',
      EXTERNAL_CHARGES_DISCLOSURE,
    ],
    complianceNotice: COMMERCIAL_ENGAGEMENT_STATEMENT,
  },
  {
    id: 'kb-corporate-governance',
    domain: 'corporate_governance',
    title: 'Corporate Governance, Privacy & Responsible AI',
    keywords: [
      'governance',
      'privacy',
      'legal',
      'terms',
      'contract',
      'disclaimer',
      'responsible ai',
      'confidential',
      'nda',
      'recording',
      'audio stored',
    ],
    summary:
      'DESTRIA TECH INC operates under formal corporate governance, data privacy safeguards, and Responsible AI policies requiring authorized human review for all commercial proposals and commitments.',
    facts: [
      ...LEGAL_GOVERNANCE_STATEMENTS.slice(0, 4).map((s) => `${s.title}: ${s.clauses[0]}`),
      'Voice Privacy Policy: Microphone audio is processed strictly for real-time consultation and is not permanently retained by default.',
      'AI Assistants are informational corporate solutions consultants and are NOT authorized corporate signatories.',
    ],
  },
  {
    id: 'kb-consultation-procedures',
    domain: 'consultation_procedures',
    title: 'Consultation Scheduling & Service Inquiry Procedures',
    keywords: [
      'consultation',
      'schedule',
      'book',
      'appointment',
      'meeting',
      'inquiry',
      'proposal',
      'how to start',
      'onboarding',
      'process',
      'steps',
      'availability',
    ],
    summary:
      'Prospective clients can initiate a Service Inquiry or schedule an Executive Consultation (CEO Strategic, CTO Technical, or Solutions Architecture Team) through the website or with explicit confirmation through the AI Consultant.',
    facts: [
      'Consultation Page: https://destriatech.com/consultation',
      `Available Pathways: Executive Strategy Consultation (CEO ${executiveLeadership.founderAndCEO.fullName}), Technical Architecture Consultation (CTO ${executiveLeadership.chiefTechnologyOfficer.fullName}), or Enterprise Solutions Advisory.`,
      'Consultation Formats: Video Conference, Telephone Call, or Executive Briefing by prior arrangement.',
      'Every verified submission requires explicit client confirmation and is routed automatically to DESTRIA TECH INC authorized leadership and advisory desks.',
      'When live calendar confirmation is pending, requests are honestly registered as Pending Scheduling Confirmation rather than falsely marked confirmed.',
    ],
    canonicalLinks: ['https://destriatech.com/consultation'],
  },
  {
    id: 'kb-official-contacts',
    domain: 'official_contacts',
    title: 'Official Corporate Communications & Contact Channels',
    keywords: [
      'contact',
      'email',
      'phone',
      'telephone',
      'call',
      'number',
      'address',
      'reach',
      'support',
      'human',
      'talk to human',
      'office',
    ],
    summary:
      'Official DESTRIA TECH INC communications channels for executive, commercial, and technical inquiries.',
    facts: [
      `Official Corporate Telephone: ${corporateIdentity.contact.telephone.display}`,
      `Official Corporate Email: ${corporateIdentity.contact.email}`,
      `Official Registered Headquarters: ${corporateIdentity.headquarters.fullAddress}`,
      `Official Website: https://destriatech.com/`,
      'Telephone line is a corporate voice line; SMS and WhatsApp are not advertised on this number.',
    ],
    canonicalLinks: ['https://destriatech.com/consultation'],
  },
  {
    id: 'kb-faq',
    domain: 'faq',
    title: 'Frequently Asked Questions',
    keywords: [
      'faq',
      'questions',
      'timeline',
      'how long',
      'international',
      'remote',
      'philippines',
      'usa',
      'global',
      'support',
      'maintenance',
      'existing system',
      'integration',
    ],
    summary:
      'Key operational answers regarding global client collaboration, legacy system integration, delivery timelines, and post-launch managed support.',
    facts: [
      'Global Engagement: DESTRIA TECH INC serves corporate, institutional, and enterprise clients internationally across North America, Asia-Pacific (including the Philippines), and global markets via remote video/voice consultations and structured delivery.',
      'Legacy Integrations: Solutions are engineered to integrate securely with existing CRM, ERP, payment gateways, identity providers, and internal APIs.',
      'Timelines: Delivery timelines depend on technical complexity, security requirements, and integration scope and are formalized in staged milestones within the written proposal.',
      'Ongoing Care: Digital Care, cloud reliability monitoring, security patching, and enhancement retainers are available as customized post-deployment engagements.',
    ],
  },
];

export interface KnowledgeSearchHit {
  entry: CorporateKnowledgeEntry;
  score: number;
}

/**
 * Deterministic retrieval-grounded search across the version-controlled
 * DESTRIA TECH INC Corporate Knowledge Repository.
 */
export function retrieveCorporateKnowledge(
  query: string,
  options?: { topK?: number; domain?: KnowledgeDomainId }
): KnowledgeSearchHit[] {
  const topK = Math.max(1, Math.min(8, options?.topK ?? 3));
  const q = query.trim().toLowerCase();
  if (!q) {
    const pool = options?.domain
      ? CORPORATE_KNOWLEDGE_BASE.filter((e) => e.domain === options.domain)
      : CORPORATE_KNOWLEDGE_BASE;
    return pool.slice(0, topK).map((entry) => ({ entry, score: 1 }));
  }

  const tokens = q
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);

  const candidates = options?.domain
    ? CORPORATE_KNOWLEDGE_BASE.filter((e) => e.domain === options.domain)
    : CORPORATE_KNOWLEDGE_BASE;

  const scored: KnowledgeSearchHit[] = [];
  for (const entry of candidates) {
    let score = 0;
    const titleLower = entry.title.toLowerCase();
    const summaryLower = entry.summary.toLowerCase();
    const factsLower = entry.facts.join(' ').toLowerCase();

    for (const kw of entry.keywords) {
      if (q.includes(kw)) {
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

/**
 * Formats retrieved knowledge entries into a compact grounded context block
 * suitable for Gemini system instructions or tool responses.
 */
export function formatGroundedKnowledgeBlock(hits: KnowledgeSearchHit[]): string {
  if (hits.length === 0) return '';
  return hits
    .map(
      (h) =>
        `[${h.entry.title}]\n${h.entry.summary}\n${h.entry.facts
          .slice(0, 5)
          .map((f) => `- ${f}`)
          .join('\n')}`
    )
    .join('\n\n');
}
