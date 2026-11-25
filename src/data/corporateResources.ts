/**
 * Centralized Corporate Resources Registry — DESTRIA TECH INC (DTI)
 *
 * Single source of truth for all published public PDF corporate documents,
 * genuine page-1 cover thumbnails, verified file metadata, download filenames,
 * and accessible HTML summaries for image-based executive brochures.
 *
 * All runtime URLs resolve relative to Vite `BASE_URL` so root custom-domain
 * (`https://destriatech.com/`) and GitHub Pages subpath deployments function
 * identically without hardcoded development hostnames.
 */

import { CANONICAL_ORIGIN, ROUTES } from '../config/routes';

const rawBaseUrl =
  typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL
    ? import.meta.env.BASE_URL
    : '/';

const normalizedBase = rawBaseUrl.endsWith('/') ? rawBaseUrl : `${rawBaseUrl}/`;

export interface CorporateResource {
  id: string;
  title: string;
  description: string;
  category: string;
  fileUrl: string;
  thumbnailUrl: string;
  downloadFilename: string;
  format: 'PDF';
  pageCount: number;
  fileSizeBytes: number;
  isPublished: boolean;
  /** Canonical public HTTPS URL to the PDF document */
  canonicalFileUrl: string;
  /** Public clean path to the document (root-relative) */
  documentPath: string;
  /** Public clean path to the page-1 cover WebP thumbnail (root-relative) */
  thumbnailPath: string;
  /** Dedicated detail or download center route */
  detailPagePath: string;
  /** Descriptive alt text for the cover preview image */
  coverAltText: string;
  /** Concise highlights displayed on cards and accessible summaries */
  highlights: readonly string[];
}

export interface BrochureSectionSummary {
  pageNumber: number;
  divisionCode?: string;
  title: string;
  summary: string;
  capabilities: readonly string[];
}

export const SERVICES_BROCHURE_PAGE_SUMMARIES: readonly BrochureSectionSummary[] = [
  {
    pageNumber: 2,
    title: 'Corporate Overview & Executive Positioning',
    summary:
      'DESTRIA TECH INC (DESTRIA NETWORK) is an enterprise technology solutions provider registered in Wyoming, USA, delivering customized digital systems across artificial intelligence, enterprise software engineering, blockchain infrastructure, cloud security, and operational automation.',
    capabilities: [
      'Customized enterprise technology architecture aligned to client operations',
      'Consultation-first technical discovery and formal proposal engagement',
      'Governance-led engineering for domestic and international organizations',
    ],
  },
  {
    pageNumber: 3,
    divisionCode: '01',
    title: 'Website & Digital Experience Systems',
    summary:
      'High-performance corporate websites, enterprise client portals, e-commerce platforms, and responsive digital interfaces engineered for institutional credibility, conversion, and accessibility.',
    capabilities: [
      'Corporate & institutional web platforms',
      'Custom client engagement portals & web applications',
      'Digital experience architecture, SEO readiness, and performance optimization',
    ],
  },
  {
    pageNumber: 3,
    divisionCode: '02',
    title: 'Artificial Intelligence & AI Agents',
    summary:
      'Human-supervised enterprise AI assistants, multi-agent workflow orchestration, natural voice systems, and organizational knowledge retrieval engines tailored to internal operations.',
    capabilities: [
      'Enterprise AI chat & continuous voice assistants',
      'Autonomous and human-in-the-loop AI workflow agents',
      'Private knowledge bases, document intelligence, and AI governance safeguards',
    ],
  },
  {
    pageNumber: 4,
    divisionCode: '03',
    title: 'Blockchain & Web3 Infrastructure',
    summary:
      'Distributed ledger architecture, smart contract engineering, credential verification, and tamper-evident audit trails built with regulatory and security discipline.',
    capabilities: [
      'Smart contract development and enterprise ledger integration',
      'Digital identity, document verification, and supply-chain traceability',
      'Permissioned blockchain networks and Web3 application architecture',
    ],
  },
  {
    pageNumber: 4,
    divisionCode: '04',
    title: 'Enterprise Software & Mobile Engineering',
    summary:
      'Mission-critical custom software platforms, internal operational tools, SaaS products, and cross-platform iOS/Android mobile applications engineered for long-term maintainability.',
    capabilities: [
      'Custom ERP, CRM, operations, and internal business platforms',
      'Multi-tenant SaaS architectures and API ecosystems',
      'Native and cross-platform enterprise mobile applications',
    ],
  },
  {
    pageNumber: 5,
    divisionCode: '05',
    title: 'Business Workflow Automation Systems',
    summary:
      'End-to-end operational automation connecting CRM, ERP, billing, approvals, notifications, and reporting pipelines to eliminate repetitive manual bottlenecks.',
    capabilities: [
      'Cross-platform API & webhook orchestration',
      'Automated onboarding, intake, reporting, and approval workflows',
      'Data synchronization across enterprise software stacks',
    ],
  },
  {
    pageNumber: 5,
    divisionCode: '06',
    title: 'Cloud, Cybersecurity & Infrastructure',
    summary:
      'Resilient cloud deployment, identity and access controls, encryption standards, network hardening, and operational continuity architectures.',
    capabilities: [
      'Cloud architecture design, migration, and high-availability deployment',
      'Role-based access control (RBAC), tenant isolation, and audit logging',
      'Security posture hardening, backups, and infrastructure monitoring',
    ],
  },
  {
    pageNumber: 6,
    divisionCode: '07',
    title: 'Digital Modernization & Website Care',
    summary:
      'Legacy system upgrades, technical debt remediation, performance tuning, security patching, and structured ongoing technical stewardship.',
    capabilities: [
      'Legacy platform migration and codebase modernization',
      'Security remediation, uptime monitoring, and maintenance stewardship',
      'Continuous architectural improvements and SLA-aligned support',
    ],
  },
  {
    pageNumber: 6,
    divisionCode: '08',
    title: 'Industry-Specific Digital Solutions',
    summary:
      'Domain-tailored technology architectures addressing operational workflows across financial services, healthcare, logistics, real estate, retail, education, manufacturing, and institutions.',
    capabilities: [
      'Sector-specific portals, scheduling, dispatch, and compliance workflows',
      'Configurable industry platforms tailored during technical discovery',
      'Integrations with vertical-specific third-party software systems',
    ],
  },
  {
    pageNumber: 6,
    divisionCode: '09',
    title: 'Signature Enterprise Transformation Solutions',
    summary:
      'Comprehensive multi-division digital transformation programs unifying AI, custom software, cloud security, and automation under executive architectural governance.',
    capabilities: [
      'Executive technology roadmapping and phased enterprise modernization',
      'Multi-system unification across web, mobile, AI, and cloud layers',
      'Dedicated leadership alignment, documentation, and lifecycle support',
    ],
  },
  {
    pageNumber: 7,
    title: 'Our Corporate Approach & Commitment',
    summary:
      'Every DESTRIA TECH INC engagement follows a structured, consultation-first methodology governed by technical feasibility assessment, transparent formal proposals, and security-conscious delivery.',
    capabilities: [
      'Discovery and technical assessment prior to formal commercial proposal',
      'Zero generic public rate cards — every engagement is individually scoped',
      'Accountable engineering standards, human oversight, and long-term stewardship',
    ],
  },
  {
    pageNumber: 8,
    title: 'Official Corporate Communications',
    summary:
      'Direct executive and technical communication channels for prospective enterprise clients, partners, investors, and institutions worldwide.',
    capabilities: [
      'Website: https://destriatech.com/ · Email: info@destriatech.com',
      'Telephone: +1 (307) 419-4277',
      'Headquarters: SUITE 6082 - 30 N Gould St #6082, Sheridan, Sheridan County, WY 82801 USA',
    ],
  },
] as const;

export const CORPORATE_PROFILE_RESOURCE: CorporateResource = {
  id: 'destria-corporate-profile',
  title: 'Corporate Profile',
  description:
    'Comprehensive executive introduction to DESTRIA TECH INC, covering corporate identity, Wyoming registration, executive leadership, core values, 8-layer modular architecture, 15-stage engagement framework, and governance standards.',
  category: 'Corporate Profile & Governance',
  fileUrl: `${normalizedBase}documents/destria-tech-inc-corporate-profile.pdf`,
  thumbnailUrl: `${normalizedBase}resources/thumbnails/corporate-profile-cover.webp`,
  downloadFilename: 'DESTRIA-TECH-INC-Corporate-Profile.pdf',
  format: 'PDF',
  pageCount: 17,
  fileSizeBytes: 6990179,
  isPublished: true,
  canonicalFileUrl: `${CANONICAL_ORIGIN}/documents/destria-tech-inc-corporate-profile.pdf`,
  documentPath: '/documents/destria-tech-inc-corporate-profile.pdf',
  thumbnailPath: '/resources/thumbnails/corporate-profile-cover.webp',
  detailPagePath: ROUTES.CORPORATE_PROFILE,
  coverAltText:
    'Cover preview of the official 17-page DESTRIA TECH INC Corporate Profile PDF document',
  highlights: [
    'Corporate identity and executive leadership',
    'Corporate vision, mission and core values',
    'Enterprise technology architecture',
    'Corporate governance framework',
    'Enterprise engagement lifecycle',
    'Information security and data protection',
    'Responsible artificial intelligence governance',
    'Corporate strategic objectives',
  ],
};

export const SERVICES_BROCHURE_RESOURCE: CorporateResource = {
  id: 'destria-line-of-services',
  title: 'Corporate Summary and Enterprise Technology Services',
  description:
    'Official 8-page executive brochure detailing DESTRIA TECH INC’s nine enterprise technology service divisions, digital transformation capabilities, corporate engineering approach, and official consultation channels.',
  category: 'Corporate Services & Capabilities',
  fileUrl: `${normalizedBase}resources/destria-tech-line-of-services.pdf`,
  thumbnailUrl: `${normalizedBase}resources/thumbnails/destria-tech-line-of-services-cover.webp`,
  downloadFilename: 'DESTRIA-TECH-INC-Corporate-Services-and-Capabilities.pdf',
  format: 'PDF',
  pageCount: 8,
  fileSizeBytes: 2889748,
  isPublished: true,
  canonicalFileUrl: `${CANONICAL_ORIGIN}/resources/destria-tech-line-of-services.pdf`,
  documentPath: '/resources/destria-tech-line-of-services.pdf',
  thumbnailPath: '/resources/thumbnails/destria-tech-line-of-services-cover.webp',
  detailPagePath: ROUTES.RESOURCES,
  coverAltText:
    'Cover preview of the official 8-page DESTRIA TECH INC Corporate Summary and Enterprise Technology Services PDF brochure',
  highlights: [
    'Enterprise technology service divisions',
    'Artificial intelligence and AI agents',
    'Blockchain and Web3 development',
    'Enterprise software engineering',
    'Automation and intelligent business systems',
    'Cloud computing and cybersecurity',
    'Corporate engagement approach',
    'Official consultation channels',
  ],
};

export const CORPORATE_RESOURCES: readonly CorporateResource[] = [
  SERVICES_BROCHURE_RESOURCE,
  CORPORATE_PROFILE_RESOURCE,
] as const;

export const CORPORATE_RESOURCES_SECTION_COPY = {
  eyebrow: 'Official Corporate Publications',
  heading: 'Corporate Resources',
  description:
    'Access official corporate documentation, enterprise technology service summaries, corporate governance information and digital transformation capabilities from DESTRIA TECH INC.',
  seoTitle: 'Corporate Resources & Services Brochure | DESTRIA TECH INC',
  seoDescription:
    'Access and download official DESTRIA TECH INC corporate resources, including our 8-page Corporate Summary and Enterprise Technology Services brochure and 17-page Corporate Profile PDF.',
  canonicalPageUrl: `${CANONICAL_ORIGIN}${ROUTES.RESOURCES}`,
} as const;

export function getPublishedCorporateResources(): CorporateResource[] {
  return CORPORATE_RESOURCES.filter((resource) => resource.isPublished);
}

export function formatResourceFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'PDF';
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}
