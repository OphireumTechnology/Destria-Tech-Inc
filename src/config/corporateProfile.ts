/**
 * Centralized Official Corporate Profile Configuration — DESTRIA TECH INC (DTI)
 *
 * Single source of truth for the official Corporate Profile page route,
 * public PDF document path, cover preview path, verified metadata, SEO metadata,
 * and document content highlights.
 *
 * Asset paths resolve relative to Vite `BASE_URL` so both root custom-domain
 * deployments (`https://destriatech.com/`) and GitHub Pages repository subpath
 * deployments function without broken links or backend dependencies.
 */

import { CANONICAL_ORIGIN } from './routes';

const rawBaseUrl =
  typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL
    ? import.meta.env.BASE_URL
    : '/';

const normalizedBase = rawBaseUrl.endsWith('/') ? rawBaseUrl : `${rawBaseUrl}/`;

export interface CorporateProfileHighlight {
  number: string;
  title: string;
  summary: string;
}

export const CORPORATE_PROFILE_HIGHLIGHTS: readonly CorporateProfileHighlight[] = [
  {
    number: '01',
    title: 'Executive Corporate Overview',
    summary:
      'High-level introduction to DESTRIA TECH INC, its enterprise positioning within DESTRIA NETWORK, and its commitment to resilient digital transformation.',
  },
  {
    number: '02',
    title: 'Corporate Identity and General Information',
    summary:
      'Verified legal entity registration in Wyoming, USA, official corporate monogram (DTI), registered headquarters, and primary contact channels.',
  },
  {
    number: '03',
    title: 'Corporate Purpose, Vision and Mission',
    summary:
      'Foundational corporate purpose driving intelligent systems engineering and strategic mission for long-term client operational impact.',
  },
  {
    number: '04',
    title: 'Corporate Core Values',
    summary:
      'Guiding institutional principles spanning architectural discipline, transparency, security stewardship, and client-centered execution.',
  },
  {
    number: '05',
    title: 'Corporate Strategic Objectives',
    summary:
      'Multi-year engineering and enterprise growth priorities across intelligent automation, cloud platforms, and global delivery capabilities.',
  },
  {
    number: '06',
    title: 'Executive Leadership',
    summary:
      'Corporate leadership structure led by Founder & Chief Executive Officer Desmond Hines and Chief Technology Officer Leodenis Languisan.',
  },
  {
    number: '07',
    title: 'Corporate Governance',
    summary:
      'Executive oversight, structured accountability standards, and institutional governance mechanisms guiding client engagements.',
  },
  {
    number: '08',
    title: 'Enterprise Technology Service Portfolio',
    summary:
      'Customized solution divisions covering Artificial Intelligence, Enterprise Software Engineering, Cloud Systems, Cybersecurity, and Blockchain.',
  },
  {
    number: '09',
    title: 'Target Markets and Industry Applications',
    summary:
      'Enterprise sectors and operational environments served through tailored software modernization and intelligent workflow architecture.',
  },
  {
    number: '10',
    title: 'Enterprise Technology Architecture',
    summary:
      'Core systems architecture approach uniting modular cloud infrastructure, API orchestration, scalability, and strict tenant isolation.',
  },
  {
    number: '11',
    title: 'Enterprise Engagement Framework',
    summary:
      'Structured consultation-first lifecycle from initial discovery and technical feasibility assessment through staged delivery and support.',
  },
  {
    number: '12',
    title: 'Commercial and Contractual Governance',
    summary:
      'Customized commercial engagement policy governed exclusively by formal technical assessments, approved proposals, and executed agreements.',
  },
  {
    number: '13',
    title: 'Intellectual Property Governance',
    summary:
      'Protection of proprietary corporate frameworks and clear contractual governance of client deliverables and licensing allocations.',
  },
  {
    number: '14',
    title: 'Information Security and Data Protection',
    summary:
      'Layered security engineering principles including access controls, encryption standards, audit logging, and confidentiality safeguards.',
  },
  {
    number: '15',
    title: 'Responsible Artificial Intelligence',
    summary:
      'Human-in-the-loop governance, policy enforcement, and responsible deployment standards for enterprise AI assistants and automation.',
  },
  {
    number: '16',
    title: 'Regulatory and Legal Compliance',
    summary:
      'Commitment to lawful operations, transparent representations, and contractual compliance alignment across operating jurisdictions.',
  },
  {
    number: '17',
    title: 'Strategic Partnerships and Research',
    summary:
      'Collaborative technology alliances, applied systems research, and continuous evaluation of resilient emerging architectures.',
  },
  {
    number: '18',
    title: 'Official Corporate Communications',
    summary:
      'Authoritative corporate communication channels, official website, telephone, email, and executive consultation contact protocols.',
  },
] as const;

export const corporateProfile = {
  companyName: 'DESTRIA TECH INC',
  networkName: 'DESTRIA NETWORK',
  abbreviation: 'DTI',
  title: 'Corporate Profile',
  sectionLabel: 'DISCOVER OUR COMPANY',
  supportingStatement: 'Engineering Intelligent Solutions. Empowering Enterprise Transformation.',
  description:
    "Explore DESTRIA TECH INC's corporate identity, executive leadership, enterprise technology capabilities, strategic objectives, governance framework and commitment to responsible digital transformation.",
  pageCount: 17,
  /** Exact verified byte size of the approved PDF once attached & validated (null until verified) */
  verifiedFileSizeBytes: null as number | null,
  pagePath: '/corporate-profile',
  documentPath: '/documents/destria-tech-inc-corporate-profile.pdf',
  coverPath: '/branding/corporate-profile-cover.webp',
  downloadFilename: 'DESTRIA-TECH-INC-Corporate-Profile.pdf',
  publicAccess: true,
  authenticationRequired: false,
  paymentRequired: false,

  // Runtime asset URLs honoring Vite BASE_URL (safe for custom domain & GitHub Pages subpath)
  documentUrl: `${normalizedBase}documents/destria-tech-inc-corporate-profile.pdf`,
  coverUrl: `${normalizedBase}branding/corporate-profile-cover.webp`,

  // Canonical production URLs
  canonicalPageUrl: `${CANONICAL_ORIGIN}/corporate-profile`,
  canonicalDocumentUrl: `${CANONICAL_ORIGIN}/documents/destria-tech-inc-corporate-profile.pdf`,
  canonicalCoverUrl: `${CANONICAL_ORIGIN}/branding/corporate-profile-cover.webp`,

  // SEO & Accessibility Metadata
  seo: {
    title: 'Corporate Profile | DESTRIA TECH INC',
    description:
      'View and download the official DESTRIA TECH INC Corporate Profile. Explore our enterprise technology solutions, corporate leadership, governance and digital innovation capabilities.',
    canonicalUrl: `${CANONICAL_ORIGIN}/corporate-profile`,
    coverAltText:
      'Official DESTRIA TECH INC Corporate Profile cover preview — DESTRIA NETWORK (DTI), 17-page corporate overview PDF',
  },
} as const;

/**
 * Formats a byte size into a human-readable file size label (e.g., "4.2 MB", "860 KB").
 */
export function formatCorporateProfileFileSize(bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

/**
 * Returns the standardized supporting metadata line for download CTAs.
 */
export function getCorporateProfileMetaSummary(resolvedSizeBytes?: number | null): string {
  const sizeLabel = formatCorporateProfileFileSize(
    resolvedSizeBytes ?? corporateProfile.verifiedFileSizeBytes
  );
  const parts = ['PDF Document', `${corporateProfile.pageCount} Pages`];
  if (sizeLabel) {
    parts.push(sizeLabel);
  }
  parts.push('Free Download');
  return parts.join(' | ');
}
