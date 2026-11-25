/**
 * Official Corporate Identity & Configuration Registry — DESTRIA TECH INC (DTI)
 *
 * Single source of truth for verified corporate details, executive leadership,
 * international telephone formatting, Wyoming headquarters address, commercial
 * engagement policy, and draft legal governance notices.
 */

import { BRAND_ASSETS } from './brandAssets';

export const executiveLeadership = {
  founderAndCEO: {
    fullName: 'Desmond Hinds',
    title: 'Founder & Chief Executive Officer',
    organization: 'DESTRIA TECH INC',
  },
  chiefTechnologyOfficer: {
    fullName: 'Leodenis Languisan',
    title: 'Chief Technology Officer',
    organization: 'DESTRIA TECH INC',
  },
} as const;

export const corporateIdentity = {
  legalName: 'DESTRIA TECH INC',
  networkName: 'DESTRIA NETWORK',
  abbreviation: 'DTI',
  leadership: {
    ceo: {
      name: executiveLeadership.founderAndCEO.fullName,
      title: executiveLeadership.founderAndCEO.title,
    },
    cto: {
      name: executiveLeadership.chiefTechnologyOfficer.fullName,
      title: executiveLeadership.chiefTechnologyOfficer.title,
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

export const CORPORATE_PROFILE_DATA = {
  documentTitle: 'DESTRIA TECH INC — Official Corporate Profile',
  pdfUrl: BRAND_ASSETS.corporateProfilePdf,
  downloadFilename: 'DESTRIA-TECH-INC-Corporate-Profile.pdf',
  pageCount: 17,
  entityClassification: 'Corporation, as represented in corporate materials',
  industry: 'Information Technology and Enterprise Digital Solutions',
  marketPositioning: 'Domestic and International Technology Engagements',
  vision:
    'To become an internationally recognized enterprise technology solutions provider, advancing intelligent systems, responsible artificial intelligence, secure digital infrastructure and sustainable digital transformation. DESTRIA TECH INC seeks to establish a technology ecosystem in which businesses and institutions can leverage innovation to improve operational efficiency, organizational intelligence, transparency and long-term competitiveness.',
  mission:
    'To design, engineer and deliver customized, reliable and responsible technology solutions that address the evolving operational and strategic requirements of businesses and institutions.',
  missionPillars: [
    'Responsible technological innovation',
    'Disciplined software engineering',
    'Security-conscious system architecture',
    'Client-centered digital transformation',
    'Transparent commercial engagement',
    'Human-supervised artificial intelligence',
    'Continuous research and development',
    'Professional accountability and corporate governance',
  ],
  coreValues: [
    {
      code: '6.1',
      title: 'Integrity and Accountability',
      description:
        'Conducting business through transparent communication, professional responsibility, documented commitments and authorized corporate decision-making.',
    },
    {
      code: '6.2',
      title: 'Technological Excellence',
      description:
        'Pursuing engineering quality, technical accuracy, maintainability and continuous improvement throughout the technology development lifecycle.',
    },
    {
      code: '6.3',
      title: 'Innovation and Adaptability',
      description:
        'Encouraging responsible research, emerging technology development and practical innovation aligned with legitimate business requirements.',
    },
    {
      code: '6.4',
      title: 'Security and Confidentiality',
      description:
        'Promoting information protection, controlled access, confidentiality and responsible data handling throughout client engagements.',
    },
    {
      code: '6.5',
      title: 'Client-Centered Engineering',
      description:
        'Developing technology solutions around the actual operational requirements, strategic objectives and authorized specifications of each client.',
    },
    {
      code: '6.6',
      title: 'Responsible Artificial Intelligence',
      description:
        'Advancing AI technologies with appropriate human oversight, transparency, operational safeguards and clearly defined decision-making boundaries.',
    },
    {
      code: '6.7',
      title: 'Commercial Transparency',
      description:
        'Establishing clear project scopes, commercial obligations, payment terms and acceptance criteria through formal written agreements.',
    },
  ],
  strategicObjectives: [
    'Establish a competitive international enterprise technology services network.',
    'Develop advanced artificial intelligence products and specialized AI agents.',
    'Expand customized enterprise software engineering capabilities.',
    'Advance secure and transparent blockchain architecture.',
    'Deliver scalable cloud and digital infrastructure solutions.',
    'Strengthen recurring technology support and managed service opportunities.',
    'Develop proprietary software platforms and intellectual property.',
    'Establish strategic technology and commercial partnerships.',
    'Promote responsible digital modernization across multiple industries.',
    'Maintain effective corporate governance, risk management and operational accountability.',
  ],
  strategicObjectivesNotice:
    'These objectives represent strategic intentions and do not constitute guarantees of commercial performance or future results.',
  architectureLayers: [
    {
      layer: '01',
      title: 'Digital Experience Layer',
      detail: 'Websites, client portals, mobile applications and interactive interfaces.',
    },
    {
      layer: '02',
      title: 'Application Layer',
      detail: 'Enterprise software, workflow engines and operational applications.',
    },
    {
      layer: '03',
      title: 'Artificial Intelligence Layer',
      detail: 'Intelligent agents, AI models and knowledge retrieval systems.',
    },
    {
      layer: '04',
      title: 'Integration Layer',
      detail: 'APIs, webhooks and authorized third-party communications.',
    },
    {
      layer: '05',
      title: 'Data Layer',
      detail: 'Databases, storage systems and controlled information management.',
    },
    {
      layer: '06',
      title: 'Infrastructure Layer',
      detail: 'Cloud deployment, server environments and network architecture.',
    },
    {
      layer: '07',
      title: 'Security Layer',
      detail: 'Authentication, authorization, encryption and risk controls.',
    },
    {
      layer: '08',
      title: 'Governance Layer',
      detail: 'Audit records, human approvals, monitoring and operational accountability.',
    },
  ],
  architectureNotice:
    'Specific technologies and system controls shall be determined through project-level assessment and documented technical specifications.',
  targetMarkets: [
    { industry: 'Financial and Professional Services', applications: 'Document workflows, client portals and administrative automation.' },
    { industry: 'Healthcare', applications: 'Appointment systems, secure portals and workflow integration.' },
    { industry: 'Transportation and Logistics', applications: 'Dispatch systems, tracking and operational dashboards.' },
    { industry: 'Real Estate and Construction', applications: 'Project management and digital documentation.' },
    { industry: 'Retail and E-Commerce', applications: 'Digital storefronts, inventory and customer systems.' },
    { industry: 'Hospitality', applications: 'Booking systems and operational automation.' },
    { industry: 'Manufacturing', applications: 'Operational intelligence and system integration.' },
    { industry: 'Education and Training', applications: 'Learning platforms and institutional workflow systems.' },
    { industry: 'Nonprofit Organizations', applications: 'Program, donor and organizational management platforms.' },
    { industry: 'Agriculture', applications: 'Operational monitoring and agricultural data systems.' },
    { industry: 'Government and Institutions', applications: 'Authorized digital modernization and administrative solutions.' },
    { industry: 'Technology and Emerging Industries', applications: 'AI, blockchain, cloud and enterprise software engineering.' },
  ],
  targetMarketsNotice:
    'These examples describe potential applications rather than representations of completed client engagements, government contracts or industry-specific certifications.',
} as const;

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
  corporateProfilePdfUrl: BRAND_ASSETS.corporateProfilePdf,
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
    techBlue: '#0EA5E9',
    emeraldTeal: '#10B981',
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
