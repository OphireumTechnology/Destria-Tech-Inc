/**
 * Official Corporate Identity & Configuration Registry — DESTRIA TECH INC (DTI)
 *
 * Single source of truth for verified corporate details, executive leadership,
 * international telephone formatting, Wyoming headquarters address, commercial
 * engagement policy, and draft legal governance notices.
 */

import { BRAND_ASSETS } from './brandAssets';

export const corporateIdentity = {
  legalName: 'DESTRIA TECH INC',
  networkName: 'DESTRIA NETWORK',
  abbreviation: 'DTI',
  leadership: {
    ceo: {
      name: 'Desmond Hines',
      title: 'Founder & Chief Executive Officer',
    },
    cto: {
      name: 'Leodenis Languisan',
      title: 'Chief Technology Officer',
    },
  },
  jurisdiction: 'Wyoming, United States of America',
  headquarters: {
    fullAddress: 'SUITE 6082 - 30 N Gould St #6082, Sheridan, Sheridan County, WY 82801 USA',
    suite: 'SUITE 6082',
    street: '30 N Gould St #6082',
    city: 'Sheridan',
    county: 'Sheridan County',
    state: 'WY',
    stateName: 'Wyoming',
    postalCode: '82801',
    country: 'USA',
  },
  contact: {
    telephone: {
      display: '+1 (307) 419-4277',
      international: '+1 307 419 4277',
      e164: '+13074194277',
      href: 'tel:+13074194277',
    },
    email: 'info@destriatech.com',
    website: 'https://destriatech.com/',
  },
  commercialPolicy: {
    publicPricingEnabled: false,
    serviceModel: 'Customized Enterprise Solutions',
    engagementRequirement: 'Formal Consultation, Technical Assessment, and Approved Proposal',
  },
} as const;

export const CORPORATE_SERVICE_STATEMENT =
  'DESTRIA TECH INC delivers customized enterprise technology solutions tailored to the specific operational, technical, security, and scalability requirements of each client. Because every engagement is architected according to unique project scope and integration needs, formal commercial proposals are issued exclusively following an initial consultation and technical assessment.';

export const COMMERCIAL_ENGAGEMENT_STATEMENT =
  'All services provided by DESTRIA TECH INC are structured as customized engagements. No standardized public pricing is advertised. Commercial terms, project timelines, deliverables, and formal proposals are developed following a comprehensive review of client requirements and authorized corporate approval.';

export const ENTERPRISE_ENGAGEMENT_WORKFLOW = [
  { step: 1, title: 'Service Discovery', detail: 'Client explores DESTRIA TECH INC technology divisions and customized solution frameworks.' },
  { step: 2, title: 'Consultation & Requirement Submission', detail: 'Client initiates a consultation or submits project requirements via official channels.' },
  { step: 3, title: 'Preliminary AI Qualification', detail: 'AI Corporate Solutions Consultant captures technical objectives without quoting pricing.' },
  { step: 4, title: 'Service Inquiry Logging', detail: 'Structured service inquiry is logged with a unique tracking reference code.' },
  { step: 5, title: 'Executive & Technical Review', detail: 'DESTRIA TECH INC leadership and engineering architects review operational goals.' },
  { step: 6, title: 'Client Consultation Session', detail: 'Scheduled discovery session aligns business objectives, systems, and compliance needs.' },
  { step: 7, title: 'Technical Feasibility Assessment', detail: 'Engineering team evaluates architecture, security, integration points, and scalability.' },
  { step: 8, title: 'Solution Architecture Design', detail: 'Tailored technical blueprint and phased implementation roadmap are formulated.' },
  { step: 9, title: 'Formal Proposal Preparation', detail: 'Authorized commercial proposal detailing deliverables, timeline, and terms is drafted.' },
  { step: 10, title: 'Client Proposal Review', detail: 'Client reviews technical specification, governance commitments, and commercial terms.' },
  { step: 11, title: 'Agreement Execution', detail: 'Formal service agreement, confidentiality provisions, and commercial approval are executed.' },
  { step: 12, title: 'Project Onboarding', detail: 'Dedicated client workspace, milestone schedule, and security access are provisioned.' },
  { step: 13, title: 'Development & Implementation', detail: 'Iterative engineering, AI/cloud integration, and milestone progress reporting.' },
  { step: 14, title: 'Testing, Quality Assurance & Delivery', detail: 'Verification testing, security review, deliverable handover, and client sign-off.' },
  { step: 15, title: 'Post-Deployment Support & Optimization', detail: 'Ongoing enterprise support, monitoring, and continuous capability optimization.' },
] as const;

export interface LegalGovernanceSection {
  id: string;
  title: string;
  draftNotice: string;
  summary: string;
  clauses: string[];
}

export const LEGAL_COUNSEL_REVIEW_BANNER =
  'DRAFT CORPORATE GOVERNANCE NOTICE: The legal statements and policy frameworks below are corporate draft provisions prepared for DESTRIA TECH INC and require formal review and sign-off by qualified legal counsel and corporate management prior to binding legal publication.';

export const LEGAL_GOVERNANCE_STATEMENTS: LegalGovernanceSection[] = [
  {
    id: 'commercial-engagement-policy',
    title: 'Commercial Engagement Policy',
    draftNotice: 'Draft — Pending Legal Counsel & Corporate Management Review',
    summary:
      'Governs how DESTRIA TECH INC structures consultations, technical assessments, formal proposals, and customized enterprise engagements.',
    clauses: [
      COMMERCIAL_ENGAGEMENT_STATEMENT,
      'No public website copy, catalog summary, interactive consultation, or automated response constitutes a binding offer, fixed quotation, or guaranteed commercial rate.',
      'Binding commercial terms, payment milestones, deliverables, and service obligations arise exclusively through a written agreement formally executed by authorized representatives of DESTRIA TECH INC and the client.',
    ],
  },
  {
    id: 'terms-of-use',
    title: 'Terms of Use',
    draftNotice: 'Draft — Pending Legal Counsel & Corporate Management Review',
    summary: 'Conditions governing access to https://destriatech.com/ and authorized DESTRIA NETWORK digital interfaces.',
    clauses: [
      'By accessing or using this platform operated by DESTRIA TECH INC, a corporation registered in Wyoming, United States of America, you agree to comply with these Terms of Use and all applicable laws.',
      'Information published on this website is provided for general corporate and informational purposes regarding DESTRIA TECH INC capabilities and customized technology solutions.',
      'Users shall not attempt unauthorized access, automated scraping of proprietary materials, prompt-injection manipulation of AI systems, or interference with platform security controls.',
    ],
  },
  {
    id: 'privacy-policy',
    title: 'Privacy Policy',
    draftNotice: 'Draft — Pending Legal Counsel & Corporate Management Review',
    summary: 'How DESTRIA TECH INC handles contact inquiries, consultation records, and authenticated client portal data.',
    clauses: [
      'DESTRIA TECH INC collects business contact information, project inquiry details, consultation scheduling records, and authorized client portal account information solely to evaluate service requests, coordinate consultations, deliver contracted engagements, and maintain statutory records.',
      'Client portal documents, uploaded files, and project communications are isolated to the authenticated client account and protected through server-side authentication and time-limited signed access links.',
      `Privacy inquiries or data access requests may be directed to ${corporateIdentity.contact.email} or ${corporateIdentity.headquarters.fullAddress}.`,
    ],
  },
  {
    id: 'cookie-policy',
    title: 'Cookie Policy',
    draftNotice: 'Draft — Pending Legal Counsel & Corporate Management Review',
    summary: 'Use of essential security cookies and local browser preferences across DESTRIA TECH INC web platforms.',
    clauses: [
      'DESTRIA TECH INC utilizes strictly necessary HttpOnly session cookies for authenticated Client Portal sessions and CSRF protection.',
      'Browser storage may be used to preserve non-sensitive interface preferences such as consultation conversation continuity without storing authentication tokens in localStorage.',
    ],
  },
  {
    id: 'technology-services-disclaimer',
    title: 'Technology Services Disclaimer',
    draftNotice: 'Draft — Pending Legal Counsel & Corporate Management Review',
    summary: 'Scope and warranty boundaries for enterprise software, cloud, blockchain, and emerging technology capabilities.',
    clauses: [
      'All technology solutions, software architectures, AI workflows, cloud deployments, and emerging technology systems are delivered as customized engagements subject to formal technical feasibility assessment, defined acceptance criteria, and executed service agreements.',
      'DESTRIA TECH INC makes no public guarantee of financial returns, regulatory approval, uninterrupted third-party service availability, or independent third-party security audit certification unless expressly verified and documented in an executed engagement contract.',
    ],
  },
  {
    id: 'ai-usage-disclaimer',
    title: 'Artificial Intelligence Usage Disclaimer',
    draftNotice: 'Draft — Pending Legal Counsel & Corporate Management Review',
    summary: 'Governance and informational limitations of the DESTRIA TECH INC AI Corporate Solutions Consultant.',
    clauses: [
      'The DESTRIA TECH INC AI Corporate Solutions Consultant is provided for informational and preliminary consultation purposes only. Responses generated by the AI system do not constitute binding commercial proposals, legal advice, technical warranties, or contractual commitments. Official proposals and agreements are issued exclusively through authorized DESTRIA TECH INC representatives.',
      'AI chat and voice responses are subject to automated commercial policy enforcement and cannot authorize pricing, discounts, or contractual commitments.',
    ],
  },
  {
    id: 'intellectual-property-notice',
    title: 'Intellectual Property Notice',
    draftNotice: 'Draft — Pending Legal Counsel & Corporate Management Review',
    summary: 'Protection of DESTRIA TECH INC corporate marks, software architectures, and proprietary digital assets.',
    clauses: [
      'All trademarks, brand identities, emblems, software designs, technical architectures, documentation, and digital content displayed on this platform are the intellectual property of DESTRIA TECH INC unless otherwise stated.',
      'Client deliverable ownership, licensing rights, and background intellectual property allocations are governed exclusively by the applicable executed client services agreement.',
    ],
  },
  {
    id: 'information-security-statement',
    title: 'Information Security Statement',
    draftNotice: 'Draft — Pending Legal Counsel & Corporate Management Review',
    summary: 'Security architecture principles applied to client portals, communications, and engineering engagements.',
    clauses: [
      'DESTRIA TECH INC implements layered engineering controls including role-based access control (RBAC), tenant data isolation, cryptographic webhook verification, signed file access, and structured audit logging.',
      'Specific security compliance frameworks, penetration testing schedules, and incident response obligations are defined within each enterprise client agreement and technical specification.',
    ],
  },
  {
    id: 'acceptable-use-policy',
    title: 'Acceptable Use Policy',
    draftNotice: 'Draft — Pending Legal Counsel & Corporate Management Review',
    summary: 'Permitted and prohibited conduct across DESTRIA TECH INC public portals and consultation channels.',
    clauses: [
      'Users may utilize DESTRIA TECH INC platforms solely for lawful corporate evaluation, service inquiries, consultation scheduling, and authorized client project collaboration.',
      'Prohibited conduct includes uploading malicious executables, attempting unauthorized cross-account access, submitting fraudulent inquiries, or attempting to bypass security or commercial policy safeguards.',
    ],
  },
  {
    id: 'confidentiality-notice',
    title: 'Confidentiality & Non-Disclosure',
    draftNotice: 'Draft — Pending Legal Counsel & Corporate Management Review',
    summary: 'Handling of prospective client disclosures and execution of formal NDAs.',
    clauses: [
      'Prospective clients are advised not to transmit regulated personal data, trade secrets, or sensitive credentials through initial public inquiry forms prior to executing a formal Mutual Non-Disclosure Agreement (NDA).',
      'Formal confidentiality and non-disclosure agreements are executed as part of the DESTRIA TECH INC enterprise consultation and onboarding process upon request.',
    ],
  },
];

export const COMPANY_CONFIG = {
  // Official Corporate Identity (Single Source of Truth derived from corporateIdentity)
  name: corporateIdentity.legalName,
  displayName: corporateIdentity.legalName,
  initials: corporateIdentity.abbreviation,
  platformName: corporateIdentity.networkName,
  shortName: corporateIdentity.legalName,

  // Official Domain & Corporate Positioning
  primaryDomain: 'destriatech.com',
  websiteUrl: corporateIdentity.contact.website,
  headline: 'Engineering Intelligent Solutions. Empowering Enterprise Transformation.',
  subheadline: 'Customized Enterprise Technology Solutions — Wyoming, United States of America',
  heroDescription:
    'DESTRIA TECH INC delivers customized enterprise technology solutions across Artificial Intelligence, Enterprise Software Engineering, Cloud Infrastructure, Workflow Automation, Cybersecurity, Blockchain Architecture, and Digital Transformation. Every engagement is architected through consultation, technical feasibility assessment, and formal corporate proposal.',
  tagline: 'Engineering Intelligent Solutions. Empowering Enterprise Transformation.',
  shortPositioning:
    'DESTRIA TECH INC (DESTRIA NETWORK) is a Wyoming-registered technology corporation delivering customized enterprise solutions across Artificial Intelligence, Enterprise Software, Cloud Systems, Automation, Cybersecurity, Blockchain Infrastructure, and Digital Modernization.',

  // Official Executive Leadership & Corporate Headquarters (Wyoming, USA)
  leadership: {
    ceo: corporateIdentity.leadership.ceo.name,
    ceoTitle: corporateIdentity.leadership.ceo.title,
    cto: corporateIdentity.leadership.cto.name,
    ctoTitle: corporateIdentity.leadership.cto.title,
  },
  chiefTechnologyOfficer: corporateIdentity.leadership.cto.name,
  brandBoardUrl: BRAND_ASSETS.brandBoard,
  jurisdiction: corporateIdentity.jurisdiction,
  headquartersAddress: corporateIdentity.headquarters.fullAddress,
  headquartersRegion: `${corporateIdentity.headquarters.city}, ${corporateIdentity.headquarters.stateName}, USA`,

  // Official Verified Contact Channels
  corporateEmail: corporateIdentity.contact.email,
  corporatePhone: corporateIdentity.contact.telephone.display,
  corporatePhoneInternational: corporateIdentity.contact.telephone.international,
  corporatePhoneE164: corporateIdentity.contact.telephone.e164,
  corporatePhoneLink: corporateIdentity.contact.telephone.href,
  registeredAddress: corporateIdentity.headquarters.fullAddress,
  registeredAddressMapsUrl: null as string | null,

  // Governance & Commercial Policy Metadata
  commercialPolicy: corporateIdentity.commercialPolicy,
  verification: {
    legalEntityName: corporateIdentity.legalName,
    brandNetwork: corporateIdentity.networkName,
    companyAbbreviation: corporateIdentity.abbreviation,
    registrationNote: `${corporateIdentity.legalName} — Registered in ${corporateIdentity.jurisdiction}`,
    leadershipName: corporateIdentity.leadership.ceo.name,
    leadershipTitle: corporateIdentity.leadership.ceo.title,
  },

  // Official Brand Color Palette Tokens
  palette: {
    graphiteDark: '#111827',
    technologyCyan: '#00C2C7',
    lightSilverBg: '#F3F4F6',
    metallicGold: '#D4AF37',
    deepNavy: '#0B1F3B',
    techBlue: '#1D4ED8',
    emeraldTeal: '#0F766E',
    pureWhite: '#FFFFFF',
  },

  // Public Engagement & Service Policy
  serviceModel: {
    publicPricingEnabled: false,
    operatingModel: 'Customized Enterprise Solutions & Formal Proposal Engagement',
    serviceDivisionsCount: 9,
    aiAgentRolesCount: 12,
    platformPillarsCount: 8,
  },
} as const;
