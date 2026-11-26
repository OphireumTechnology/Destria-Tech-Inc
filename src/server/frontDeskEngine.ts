import { corporateIdentity, COMMERCIAL_ENGAGEMENT_STATEMENT } from '../data/companyConfig';
import { BRAND_ASSETS } from '../data/brandAssets';
import { ROUTES, buildCanonicalPublicUrl } from '../config/routes';

/**
 * DESTRIA TECH INC — Intelligent AI Front Desk Domain Engine
 *
 * Implements:
 * - M08: Client Profile Management (14 progressive fields + validation + corrections)
 * - M09 / M12: Business & Project Requirements Gathering with 6-state Requirement Classification
 * - M10 / M11: Intelligent Solution Recommendation & Preliminary Architecture Generator
 * - M13: 25-Section Preliminary Project Development Masterplan Generator (Section 14)
 * - M14: 16-Status Transparent Lead Qualification Engine (Section 16)
 * - M15: Intelligent 10-Dimension Requirements Completeness Engine & Conversation Summary Engine
 * - M18 / M19: 18-Section Executive Project Discovery Email Report (A-R) & Separate Client Confirmation Email
 */

export type RequirementClassification =
  | 'Confirmed'
  | 'Proposed'
  | 'Optional'
  | 'Requires clarification'
  | 'Requires technical validation'
  | 'Requires executive approval';

export interface ClassifiedRequirementItem {
  id: string;
  category: 'functional' | 'nonfunctional' | 'integration' | 'constraint' | 'user_role';
  label: string;
  detail?: string;
  classification: RequirementClassification;
  source: 'client_confirmed' | 'ai_recommended';
  capturedAt: string;
}

export interface FrontDeskClientProfile {
  fullName?: string;
  companyName?: string;
  position?: string;
  industry?: string;
  website?: string;
  location?: string;
  country?: string;
  email?: string;
  phone?: string;
  preferredCommunicationMethod?: 'email' | 'telephone' | 'video_consultation' | 'chat';
  preferredLanguage?: string;
  timezone?: string;
  decisionMakingRole?: string;
  preferredConsultationSchedule?: string;
}

export interface FrontDeskBusinessDiscovery {
  businessNature?: string;
  existingProcesses?: string;
  operationalChallenges?: string;
  manualActivities?: string;
  existingSoftware?: string;
  existingInfrastructure?: string;
  employeeCount?: string;
  customerScale?: string;
  branchLocations?: string;
  existingDataSources?: string;
  reportingProcesses?: string;
  growthObjectives?: string;
  automationOpportunities?: string;
  securityRequirements?: string;
  regulatoryConsiderations?: string;
}

export interface FrontDeskProjectRequirements {
  projectName?: string;
  projectDescription?: string;
  primaryObjective?: string;
  businessProblem?: string;
  expectedOutcome?: string;
  applicationType?:
    | 'Website'
    | 'Web application'
    | 'Mobile application'
    | 'SaaS platform'
    | 'AI application'
    | 'Blockchain application'
    | 'Enterprise system'
    | 'Integrated technology platform';
  intendedUsers: string[];
  functionalRequirements: ClassifiedRequirementItem[];
  nonfunctionalRequirements: ClassifiedRequirementItem[];
  integrations: ClassifiedRequirementItem[];
  preferredTimeline?: string;
  targetLaunchDate?: string;
  existingTechDependencies?: string;
  clientProvidedResources?: string;
  optionalBudgetExpectation?: string;
  regulatoryRequirements?: string;
  operationalLimitations?: string;
  clientConcerns: string[];
}

export interface RequirementsCompletenessDimension {
  key:
    | 'client_identification'
    | 'business_understanding'
    | 'project_objectives'
    | 'functional_requirements'
    | 'user_roles'
    | 'integration_requirements'
    | 'security_requirements'
    | 'timeline'
    | 'commercial_discussion_readiness'
    | 'consultation_availability';
  label: string;
  weight: number;
  satisfied: boolean;
  essential: boolean;
  missingHint?: string;
}

export interface RequirementsCompletenessReport {
  scorePercent: number;
  satisfiedCount: number;
  totalDimensions: number;
  dimensions: RequirementsCompletenessDimension[];
  missingEssentialFields: string[];
  readyForSummary: boolean;
  readyForConsultation: boolean;
  nextRecommendedQuestion: string | null;
}

export const LEAD_QUALIFICATION_STATUSES = [
  'New visitor',
  'General inquiry',
  'Potential client',
  'Project discovery started',
  'Requirements incomplete',
  'Requirements collected',
  'Qualified project inquiry',
  'Awaiting client confirmation',
  'Consultation requested',
  'Consultation scheduled',
  'Executive review',
  'Proposal preparation',
  'Commercial negotiation',
  'Contract discussion',
  'Converted client',
  'Closed inquiry',
] as const;

export type LeadQualificationStatus = (typeof LEAD_QUALIFICATION_STATUSES)[number];

export interface PreliminarySolutionRecommendation {
  preliminaryDisclaimer: string;
  proposedApplicationType: string;
  recommendedModules: Array<{ name: string; rationale: string; classification: RequirementClassification }>;
  proposedUserRoles: string[];
  preliminaryTechStack: {
    frontend: string;
    backend: string;
    database: string;
    authentication: string;
    apiIntegrations: string;
    cloudInfrastructure: string;
    securityControls: string;
    aiOpportunities: string;
    reportingCapabilities: string;
    maintenanceRequirements: string;
  };
  architectureRationale: string;
}

export interface PreliminaryProjectMasterplan {
  generatedAt: string;
  version: number;
  preliminaryNotice: string;
  sections: {
    '01_executive_project_summary': string;
    '02_client_business_profile': Record<string, string>;
    '03_current_operational_challenges': string[];
    '04_project_objectives': string[];
    '05_proposed_technology_solution': string;
    '06_application_scope': {
      confirmedScope: string[];
      preliminaryProposedScope: string[];
    };
    '07_functional_modules': Array<{ name: string; status: RequirementClassification; source: string }>;
    '08_user_roles_and_permissions': string[];
    '09_business_process_workflows': string[];
    '10_preliminary_system_architecture': PreliminarySolutionRecommendation['preliminaryTechStack'];
    '11_database_requirements': string[];
    '12_api_requirements': string[];
    '13_ai_integration_requirements': string[];
    '14_security_requirements': string[];
    '15_infrastructure_requirements': string[];
    '16_user_interface_requirements': string[];
    '17_development_phases': Array<{ phase: string; deliverables: string }>;
    '18_testing_and_acceptance_requirements': string[];
    '19_deployment_considerations': string[];
    '20_maintenance_and_support_requirements': string[];
    '21_assumptions': string[];
    '22_risks': string[];
    '23_outstanding_questions': string[];
    '24_executive_decisions_required': string[];
    '25_commercial_discussion_agenda': string[];
  };
}

export interface FrontDeskConversationSummary {
  generatedAt: string;
  clientName: string;
  company: string;
  contactInformation: string;
  projectInterest: string;
  businessProblem: string;
  confirmedRequirements: string[];
  proposedSolution: string;
  preliminaryAiRecommendations: string[];
  requestedFeatures: string[];
  requiredIntegrations: string[];
  expectedTimeline: string;
  optionalClientBudgetExpectation: string;
  clientConcerns: string[];
  outstandingQuestions: string[];
  recommendedNextAction: string;
}

export interface FrontDeskSessionDossier {
  sessionId: string;
  version: number;
  discoveryActive: boolean;
  leadStatus: LeadQualificationStatus;
  clientProfile: FrontDeskClientProfile;
  businessDiscovery: FrontDeskBusinessDiscovery;
  projectRequirements: FrontDeskProjectRequirements;
  completeness: RequirementsCompletenessReport;
  recommendation: PreliminarySolutionRecommendation | null;
  summary: FrontDeskConversationSummary | null;
  masterplan: PreliminaryProjectMasterplan | null;
  updatedAt: string;
}

export const COMMERCIAL_DISCUSSION_AGENDA: readonly string[] = [
  'Final project scope and module boundaries',
  'Confirmed functional and nonfunctional requirements',
  'Validated development architecture and database design',
  'Phased implementation schedule and delivery milestones',
  'Development price (determined exclusively via executive commercial review)',
  'Hosting, cloud infrastructure, and third-party license costs',
  'Post-launch maintenance, monitoring, and support costs',
  'Payment milestones and commercial schedule',
  'Contractual terms, SLA, and governance standards',
  'Change management and scope revision procedures',
  'Intellectual property ownership and licensing arrangements',
];

export const EXECUTIVE_REVIEW_STAGES = [
  'Project inquiry received',
  'Requirements reviewed',
  'Technical feasibility assessment',
  'Scope clarification',
  'Preliminary architecture review',
  'Development effort assessment',
  'Infrastructure cost assessment',
  'Executive consultation',
  'Final scope approval',
  'Pricing preparation',
  'Commercial approval',
  'Proposal issuance',
  'Client negotiation',
  'Contract preparation',
  'Client acceptance',
  'Project initiation',
] as const;

export type ExecutiveReviewStage = (typeof EXECUTIVE_REVIEW_STAGES)[number];

function cleanStr(val: unknown, maxLen = 400): string {
  return String(val ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

function escapeHtml(raw: string): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createEmptyDossier(sessionId: string): FrontDeskSessionDossier {
  const dossier: FrontDeskSessionDossier = {
    sessionId,
    version: 1,
    discoveryActive: false,
    leadStatus: 'New visitor',
    clientProfile: {},
    businessDiscovery: {},
    projectRequirements: {
      intendedUsers: [],
      functionalRequirements: [],
      nonfunctionalRequirements: [],
      integrations: [],
      clientConcerns: [],
    },
    completeness: {
      scorePercent: 0,
      satisfiedCount: 0,
      totalDimensions: 10,
      dimensions: [],
      missingEssentialFields: [],
      readyForSummary: false,
      readyForConsultation: false,
      nextRecommendedQuestion: null,
    },
    recommendation: null,
    summary: null,
    masterplan: null,
    updatedAt: new Date().toISOString(),
  };
  dossier.completeness = evaluateRequirementsCompleteness(dossier);
  return dossier;
}

const INDUSTRY_PATTERNS: Array<{ industry: string; pattern: RegExp; defaultProjectName: string }> = [
  { industry: 'Hospitality', pattern: /\b(hotel|resort|hospitality|guest\s+check[\s-]?in|housekeeping|booking\s+engine|pms)\b/i, defaultProjectName: 'Hotel & Hospitality Management System' },
  { industry: 'Transportation', pattern: /\b(transportation|fleet|dispatch|trucking|shuttle|transit|vehicle\s+tracking|route\s+management)\b/i, defaultProjectName: 'Transportation & Fleet Management System' },
  { industry: 'Logistics', pattern: /\b(logistics|warehouse|supply\s+chain|freight|shipment|courier|3pl|fulfillment)\b/i, defaultProjectName: 'Logistics & Supply Chain Platform' },
  { industry: 'Healthcare', pattern: /\b(healthcare|hospital|clinic|patient|telemedicine|medical|pharmacy|emr|ehr)\b/i, defaultProjectName: 'Healthcare & Patient Operations Platform' },
  { industry: 'Agriculture', pattern: /\b(agriculture|farm|agritech|crop|livestock|harvest|cooperative)\b/i, defaultProjectName: 'Agriculture Operations & Traceability Platform' },
  { industry: 'Construction', pattern: /\b(construction|contractor|job\s+site|building\s+project|subcontractor|engineering\s+firm)\b/i, defaultProjectName: 'Construction Project & Operations System' },
  { industry: 'Accounting', pattern: /\b(accounting|bookkeeping|ledger|cpa|audit\s+firm|payroll|financial\s+advisory)\b/i, defaultProjectName: 'Accounting & Financial Practice System' },
  { industry: 'Tax Services', pattern: /\b(tax\s+service|tax\s+filing|tax\s+preparation|tax\s+compliance|irs|bir)\b/i, defaultProjectName: 'Tax Compliance & Client Portal Platform' },
  { industry: 'E-Commerce', pattern: /\b(e[\s-]?commerce|online\s+store|marketplace|shopping\s+cart|checkout|storefront)\b/i, defaultProjectName: 'E-Commerce Storefront & Order Platform' },
  { industry: 'Retail', pattern: /\b(retail|point\s+of\s+sale|pos\b|merchandising|multi[\s-]?store|brick[\s-]?and[\s-]?mortar)\b/i, defaultProjectName: 'Retail POS & Inventory Management System' },
  { industry: 'Education', pattern: /\b(education|school|university|lms|e[\s-]?learning|student\s+portal|training\s+platform)\b/i, defaultProjectName: 'Education & Learning Management Platform' },
  { industry: 'Nonprofit', pattern: /\b(nonprofit|ngo|charity|foundation|donor|grant\s+management)\b/i, defaultProjectName: 'Nonprofit Donor & Operations Portal' },
  { industry: 'Real Estate', pattern: /\b(real\s+estate|property\s+management|brokerage|leasing|tenant\s+portal|listings)\b/i, defaultProjectName: 'Real Estate & Property Management Platform' },
  { industry: 'Manufacturing', pattern: /\b(manufacturing|factory|production\s+line|mes\b|bill\s+of\s+materials|plant\s+operations)\b/i, defaultProjectName: 'Manufacturing Operations & ERP Platform' },
  { industry: 'Professional Services', pattern: /\b(law\s+firm|legal|consulting\s+firm|agency|professional\s+services|architecture\s+firm)\b/i, defaultProjectName: 'Professional Services Client & Case Platform' },
];

const FUNCTIONAL_DETECTORS: Array<{ id: string; label: string; pattern: RegExp }> = [
  { id: 'fn-auth', label: 'User Authentication & Account Security', pattern: /\b(login|sign[\s-]?in|authentication|sso|mfa|2fa|password)\b/i },
  { id: 'fn-rbac', label: 'Role-Based Access Control & User Management', pattern: /\b(role[\s-]?based|rbac|permissions|multi[\s-]?user|user\s+roles?|staff\s+accounts?|admin\s+panel)\b/i },
  { id: 'fn-dashboard', label: 'Executive & Operational Dashboards', pattern: /\b(dashboard|kpi|overview\s+screen|metrics|real[\s-]?time\s+visibility)\b/i },
  { id: 'fn-reservations', label: 'Reservations, Booking & Scheduling Engine', pattern: /\b(reservation|booking|check[\s-]?in|check[\s-]?out|scheduling|appointment|calendar|availability)\b/i },
  { id: 'fn-workflow', label: 'Daily Operations & Workflow Automation', pattern: /\b(workflow|automate|automation|housekeeping|dispatch|approval\s+flow|task\s+tracking)\b/i },
  { id: 'fn-inventory', label: 'Inventory, Asset & Order Management', pattern: /\b(inventory|stock|warehouse|orders?|catalog|pos\b|fleet|asset\s+tracking)\b/i },
  { id: 'fn-payments', label: 'Online Payments, Invoicing & Billing', pattern: /\b(payment|stripe|paypal|billing|invoice|checkout|online\s+payments?|subscriptions?)\b/i },
  { id: 'fn-reporting', label: 'Automated Reporting & Analytics', pattern: /\b(report|reporting|analytics|export\s+pdf|csv|bi\b|insights)\b/i },
  { id: 'fn-notifications', label: 'Automated Email, SMS & Push Notifications', pattern: /\b(notification|email\s+alert|sms|reminder|push\s+alert)\b/i },
  { id: 'fn-documents', label: 'Document Management & Verification', pattern: /\b(document\s+management|file\s+upload|document\s+verification|records|certificates?|contracts?)\b/i },
  { id: 'fn-ai', label: 'AI Assistant, Automation & Intelligent Processing', pattern: /\b(ai\s+(?:chatbot|assistant|agent|workforce|analytics|automation)|artificial\s+intelligence|smart\s+recommendations?|rag\b)\b/i },
  { id: 'fn-multibranch', label: 'Multi-Branch & Multi-Location Management', pattern: /\b(multi[\s-]?branch|multiple\s+branches|multiple\s+locations|regional\s+warehouses?|franchises?)\b/i },
  { id: 'fn-multilingual', label: 'Multilingual & International Support', pattern: /\b(multi[\s-]?lingual|multiple\s+languages?|international|multi[\s-]?currency|global)\b/i },
  { id: 'fn-blockchain', label: 'Blockchain Verification & Immutable Audit Ledger', pattern: /\b(blockchain|smart\s+contract|audit\s+ledger|traceability|on[\s-]?chain|web3)\b/i },
];

const INTEGRATION_DETECTORS: Array<{ id: string; label: string; pattern: RegExp }> = [
  { id: 'int-accounting', label: 'Accounting & ERP Integration (QuickBooks / Xero / SAP / NetSuite)', pattern: /\b(accounting|quickbooks|xero|sap\b|netsuite|erp\s+integration|bookkeeping)\b/i },
  { id: 'int-payments', label: 'Payment Gateway Integration', pattern: /\b(payment\s+gateway|stripe|paypal|paymongo|xendit|maya|credit\s+card|online\s+payments?)\b/i },
  { id: 'int-crm', label: 'CRM & Marketing Platform Integration', pattern: /\b(salesforce|hubspot|crm\s+integration|existing\s+crm)\b/i },
  { id: 'int-calendar', label: 'Calendar & Communication APIs', pattern: /\b(google\s+calendar|outlook|zoom|teams|calendar\s+sync|email\s+api)\b/i },
  { id: 'int-legacy', label: 'Existing Software / Legacy System APIs', pattern: /\b(existing\s+software|legacy\s+system|existing\s+database|third[\s-]?party\s+api|integrate\s+with)\b/i },
];

const NONFUNCTIONAL_DETECTORS: Array<{ id: string; label: string; pattern: RegExp }> = [
  { id: 'nfr-security', label: 'Enterprise Security, Encryption & Privacy Protection', pattern: /\b(security|encrypt|privacy|protect\s+customer|gdpr|hipaa|pci|soc\s*2|compliance|audit\s+log)\b/i },
  { id: 'nfr-mobile', label: 'Mobile Responsiveness & Cross-Device Access', pattern: /\b(mobile|ios|android|phone|tablet|responsive|pwa)\b/i },
  { id: 'nfr-scale', label: 'High Availability, Scalability & Cloud Reliability', pattern: /\b(scalab|high\s+availability|uptime|cloud\s+migration|cloud\s+hosting|thousands\s+of\s+users)\b/i },
  { id: 'nfr-backup', label: 'Automated Backup & Disaster Recovery', pattern: /\b(backup|disaster\s+recovery|failover|redundancy)\b/i },
];

const USER_ROLE_DETECTORS: Array<{ role: string; pattern: RegExp }> = [
  { role: 'System Administrators', pattern: /\b(admin|administrators?)\b/i },
  { role: 'Employees & Operational Staff', pattern: /\b(staff|employees?|front[\s-]?desk|housekeeping|drivers?|warehouse\s+team|clerks?|agents?)\b/i },
  { role: 'Customers / Guests / End Users', pattern: /\b(customers?|guests?|clients?|patients?|students?|buyers?|shoppers?|tenants?|donors?)\b/i },
  { role: 'Vendors & Suppliers', pattern: /\b(vendors?|suppliers?|subcontractors?)\b/i },
  { role: 'Partners & External Stakeholders', pattern: /\b(partners?|brokers?|distributors?|external\s+users?)\b/i },
  { role: 'Executives & Management', pattern: /\b(executives?|managers?|management|directors?|ceo|cto|owners?)\b/i },
];

function detectApplicationType(
  text: string
): FrontDeskProjectRequirements['applicationType'] | undefined {
  if (/\b(blockchain|smart\s+contract|web3|audit\s+ledger|document\s+verification\s+on\s+blockchain)\b/i.test(text)) {
    return 'Blockchain application';
  }
  if (/\b(ai\s+(?:workforce|agent|assistant|chatbot|platform|system)|artificial\s+intelligence\s+app)\b/i.test(text)) {
    return 'AI application';
  }
  if (/\b(saas|multi[\s-]?tenant|subscription\s+platform)\b/i.test(text)) {
    return 'SaaS platform';
  }
  if (/\b(mobile\s+app|ios\s+and\s+android|android\s+app|ios\s+app)\b/i.test(text)) {
    return 'Mobile application';
  }
  if (/\b(erp|enterprise\s+system|hotel\s+management|transportation\s+management|warehouse\s+management|hospital\s+management|custom\s+enterprise\s+software)\b/i.test(text)) {
    return 'Enterprise system';
  }
  if (/\b(corporate\s+website|company\s+website|e[\s-]?commerce\s+website|website\s+redesign|website\s+modernization|build\s+(?:a|our)\s+website)\b/i.test(text)) {
    return 'Website';
  }
  if (/\b(web\s+app|web\s+application|customer\s+portal|client\s+portal|membership\s+platform|booking\s+system|management\s+system)\b/i.test(text)) {
    return 'Web application';
  }
  if (/\b(cloud\s+migration|integrated\s+platform|digital\s+transformation)\b/i.test(text)) {
    return 'Integrated technology platform';
  }
  return undefined;
}

/**
 * Progressively extracts client profile fields, business context, and project
 * requirements from a user message without overwriting already confirmed fields
 * unless explicitly updated.
 */
export function ingestUserTurnIntoDossier(
  dossier: FrontDeskSessionDossier,
  userMessage: string,
  options?: { isProjectDiscoveryTurn?: boolean; detectedLanguage?: string }
): FrontDeskSessionDossier {
  const now = new Date().toISOString();
  const text = userMessage.trim();
  const lower = text.toLowerCase();

  // Deep-ish clone for safe mutation
  const next: FrontDeskSessionDossier = {
    ...dossier,
    clientProfile: { ...dossier.clientProfile },
    businessDiscovery: { ...dossier.businessDiscovery },
    projectRequirements: {
      ...dossier.projectRequirements,
      intendedUsers: [...dossier.projectRequirements.intendedUsers],
      functionalRequirements: [...dossier.projectRequirements.functionalRequirements],
      nonfunctionalRequirements: [...dossier.projectRequirements.nonfunctionalRequirements],
      integrations: [...dossier.projectRequirements.integrations],
      clientConcerns: [...dossier.projectRequirements.clientConcerns],
    },
    updatedAt: now,
  };

  if (options?.detectedLanguage && !next.clientProfile.preferredLanguage) {
    next.clientProfile.preferredLanguage = options.detectedLanguage;
  }

  // 1. Progressive Client Profile Extraction (M08)
  const emailMatch = text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
  if (emailMatch) {
    next.clientProfile.email = emailMatch[1].toLowerCase();
  }

  const phoneMatch = text.match(/(?:phone|tel|telephone|mobile|call\s+me\s+at|number\s+is)?[\s:]*(\+?\d[\d\s\-().]{7,20}\d)/i);
  if (phoneMatch && !/^\d{4}-\d{2}-\d{2}$/.test(phoneMatch[1].trim())) {
    const digits = phoneMatch[1].replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) {
      next.clientProfile.phone = phoneMatch[1].trim();
    }
  }

  const nameMatch = text.match(
    /(?:[Mm]y\s+name\s+is|[Ii]\s+am|[Ii]'m|[Tt]his\s+is|[Cc]all\s+me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/
  );
  if (nameMatch) {
    const candidate = nameMatch[1].trim();
    const blocked = /^(Looking|Interested|Building|Calling|Asking|Here|Ready|Trying|Going|Doing|Fine|Good|Great|Not|Sure|Just|Very)$/i;
    if (!blocked.test(candidate.split(/\s+/)[0])) {
      next.clientProfile.fullName = candidate;
    }
  }

  const companyMatch = text.match(
    /(?:company\s+(?:is|name\s+is)|from|work\s+(?:at|for)|represent(?:ing)?|organization\s+is)\s+([A-Z][A-Za-z0-9&.,'\-\s]{1,50}?)(?=[,.!?]|\s+(?:and\s+|we\s+|our\s+|with\s+|in\s+|looking\s+|needs?\s+|$))/
  );
  if (companyMatch) {
    const comp = companyMatch[1].trim();
    if (comp.length >= 2 && !/^(the|a|an|my|our|destria)$/i.test(comp)) {
      next.clientProfile.companyName = comp;
    }
  }

  const roleMatch = text.match(
    /\b(?:i'?m\s+the|i\s+am\s+the|my\s+(?:role|title|position)\s+is)\s+(CEO|CTO|COO|CFO|Founder|Co-Founder|Director(?:\s+of\s+[A-Za-z]+)?|VP(?:\s+of\s+[A-Za-z]+)?|Operations\s+Manager|IT\s+Manager|Project\s+Manager|Owner|President|Head\s+of\s+[A-Za-z]+)\b/i
  );
  if (roleMatch) {
    next.clientProfile.position = roleMatch[1].trim();
    if (/ceo|cto|coo|cfo|founder|owner|president|director|vp|head/i.test(roleMatch[1])) {
      next.clientProfile.decisionMakingRole = 'Executive / Decision Maker';
    }
  }

  const websiteMatch = text.match(/\b(https?:\/\/[^\s,]+|(?:www\.)[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s,]*)\b/i);
  if (websiteMatch && !/destriatech\.com/i.test(websiteMatch[1])) {
    next.clientProfile.website = websiteMatch[1];
  }

  const tzMatch = text.match(/\b(America\/[A-Za-z_]+|Asia\/[A-Za-z_]+|Europe\/[A-Za-z_]+|Pacific\/[A-Za-z_]+|UTC|EST|EDT|PST|PDT|CST|MST|PHT|GMT|SGT)\b/);
  if (tzMatch) {
    next.clientProfile.timezone = tzMatch[1];
  }

  const countryMatch = text.match(
    /\b(?:based\s+in|located\s+in|from|in)\s+(United\s+States|USA|Philippines|Manila|Singapore|Canada|United\s+Kingdom|UK|Australia|UAE|Dubai|Germany|France|Spain|Japan|New\s+York|California|Texas|Wyoming|London|Toronto|Sydney)\b/i
  );
  if (countryMatch && !/where\s+is\s+destria/i.test(lower)) {
    next.clientProfile.location = countryMatch[1];
    if (/usa|united\s+states|new\s+york|california|texas|wyoming/i.test(countryMatch[1])) {
      next.clientProfile.country = 'United States';
    } else if (/philippines|manila/i.test(countryMatch[1])) {
      next.clientProfile.country = 'Philippines';
    } else {
      next.clientProfile.country = countryMatch[1];
    }
  }

  // 2. Detect Industry, Application Type & Project Signals
  let matchedProjectSignal = Boolean(options?.isProjectDiscoveryTurn);
  for (const ind of INDUSTRY_PATTERNS) {
    if (ind.pattern.test(text)) {
      if (!next.clientProfile.industry) {
        next.clientProfile.industry = ind.industry;
      }
      if (!next.businessDiscovery.businessNature) {
        next.businessDiscovery.businessNature = `${ind.industry} operations`;
      }
      if (!next.projectRequirements.projectName) {
        next.projectRequirements.projectName = ind.defaultProjectName;
      }
      matchedProjectSignal = true;
      break;
    }
  }

  const appType = detectApplicationType(text);
  if (appType) {
    next.projectRequirements.applicationType = appType;
    matchedProjectSignal = true;
  }

  // Check explicit build/develop/create project intent
  if (
    /\b(build|develop|create|modernize|redesign|migrate|launch|need\s+(?:a|an|custom)|want\s+to\s+(?:build|create|develop|automate|launch)|looking\s+for\s+(?:a|an)\s+(?:custom|enterprise|web|mobile|software|ai|blockchain|cloud))\b/i.test(
      lower
    ) &&
    !/\b(how\s+are\s+you|are\s+you\s+married|tell\s+me\s+a\s+joke)\b/i.test(lower)
  ) {
    matchedProjectSignal = true;
  }

  if (matchedProjectSignal) {
    next.discoveryActive = true;
  }

  // Only populate project/business fields when discovery is active so casual chat stays clean!
  if (next.discoveryActive) {
    // Capture business problem / primary objective
    if (
      !next.projectRequirements.businessProblem &&
      text.length >= 18 &&
      !/^(hi|hello|hey|yes|no|sure|okay|thanks)\b/i.test(lower) &&
      !emailMatch
    ) {
      next.projectRequirements.businessProblem = cleanStr(text, 450);
      next.projectRequirements.primaryObjective = cleanStr(text, 300);
      next.projectRequirements.projectDescription = cleanStr(text, 600);
      next.businessDiscovery.operationalChallenges = cleanStr(text, 400);
    } else if (
      next.projectRequirements.businessProblem &&
      /\b(challenge|problem|manual|bottleneck|struggl|replace|automate|need\s+to|goal\s+is|objective)\b/i.test(lower) &&
      !next.businessDiscovery.operationalChallenges?.includes(text.slice(0, 40))
    ) {
      next.businessDiscovery.operationalChallenges = cleanStr(
        `${next.businessDiscovery.operationalChallenges ? `${next.businessDiscovery.operationalChallenges}; ` : ''}${text}`,
        500
      );
    }

    // Employee / branch / scale extraction
    const empMatch = text.match(/\b(\d[\d,]*\s*(?:\+)?\s*(?:employees?|staff|users?|team\s+members?))\b/i);
    if (empMatch) next.businessDiscovery.employeeCount = empMatch[1];

    const branchMatch = text.match(/\b(\d+\s*(?:branches?|locations?|hotels?|properties?|warehouses?|stores?|clinics?))\b/i);
    if (branchMatch) next.businessDiscovery.branchLocations = branchMatch[1];

    // Functional requirements (explicitly marked Confirmed!)
    const addUniqueItem = (
      arr: ClassifiedRequirementItem[],
      id: string,
      category: ClassifiedRequirementItem['category'],
      label: string
    ) => {
      if (!arr.some((x) => x.id === id)) {
        arr.push({
          id,
          category,
          label,
          classification: 'Confirmed',
          source: 'client_confirmed',
          capturedAt: now,
        });
      }
    };

    for (const det of FUNCTIONAL_DETECTORS) {
      if (det.pattern.test(text)) {
        addUniqueItem(next.projectRequirements.functionalRequirements, det.id, 'functional', det.label);
      }
    }

    for (const det of INTEGRATION_DETECTORS) {
      if (det.pattern.test(text)) {
        addUniqueItem(next.projectRequirements.integrations, det.id, 'integration', det.label);
        if (!next.businessDiscovery.existingSoftware) {
          next.businessDiscovery.existingSoftware = det.label;
        }
      }
    }

    for (const det of NONFUNCTIONAL_DETECTORS) {
      if (det.pattern.test(text)) {
        addUniqueItem(next.projectRequirements.nonfunctionalRequirements, det.id, 'nonfunctional', det.label);
        if (det.id === 'nfr-security') {
          next.businessDiscovery.securityRequirements = det.label;
        }
      }
    }

    for (const det of USER_ROLE_DETECTORS) {
      if (det.pattern.test(text) && !next.projectRequirements.intendedUsers.includes(det.role)) {
        next.projectRequirements.intendedUsers.push(det.role);
      }
    }

    // Timeline extraction
    const timelineMatch = text.match(
      /\b((?:within\s+|in\s+)?\d+\s*(?:weeks?|months?)|Q[1-4]\s*20\d{2}|(?:by\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{4})?|asap|urgent|immediate|next\s+quarter|this\s+year)\b/i
    );
    if (timelineMatch) {
      next.projectRequirements.preferredTimeline = timelineMatch[1].trim();
    }

    // Optional client budget expectation (clearly labeled as client expectation, NEVER a company quote!)
    const budgetMatch = text.match(
      /\b(?:budget(?:\s+is|\s+of|\s+around|\s+expectation)?|we\s+have\s+around)\s*([$€£₱]?\s?\d[\d,.]*(?:\s?[kKmM])?(?:\s*(?:-|to)\s*[$€£₱]?\s?\d[\d,.]*(?:\s?[kKmM])?)?(?:\s*(?:USD|PHP|EUR))?)/i
    );
    if (budgetMatch) {
      next.projectRequirements.optionalBudgetExpectation = `Client-stated expectation (non-binding): ${budgetMatch[1].trim()}`;
    }

    // Concerns capture
    if (/\b(concern|worried|worry|risk|challenge|strict|must\s+not|cannot\s+afford\s+downtime)\b/i.test(lower)) {
      const concern = cleanStr(text, 220);
      if (!next.projectRequirements.clientConcerns.includes(concern)) {
        next.projectRequirements.clientConcerns.push(concern);
      }
    }

    if (!next.projectRequirements.projectName && next.projectRequirements.applicationType) {
      next.projectRequirements.projectName = next.clientProfile.industry
        ? `${next.clientProfile.industry} ${next.projectRequirements.applicationType}`
        : `Custom ${next.projectRequirements.applicationType}`;
    }
  }

  // 3. Recompute Completeness, Lead Qualification, Recommendations & Summary
  next.completeness = evaluateRequirementsCompleteness(next);
  next.leadStatus = computeLeadQualificationStatus(next);

  if (next.discoveryActive && (next.projectRequirements.applicationType || next.projectRequirements.functionalRequirements.length > 0 || next.projectRequirements.businessProblem)) {
    next.recommendation = generatePreliminarySolutionRecommendation(next);
    next.summary = generateConversationSummary(next);
  }

  next.version = dossier.version + 1;
  return next;
}

/**
 * Applies explicit client edits/corrections from the Review Panel or Client Portal.
 */
export function applyClientDossierCorrections(
  dossier: FrontDeskSessionDossier,
  patch: {
    clientProfile?: Partial<FrontDeskClientProfile>;
    businessDiscovery?: Partial<FrontDeskBusinessDiscovery>;
    projectOverview?: {
      projectName?: string;
      projectDescription?: string;
      primaryObjective?: string;
      businessProblem?: string;
      applicationType?: FrontDeskProjectRequirements['applicationType'];
      preferredTimeline?: string;
      optionalBudgetExpectation?: string;
    };
    projectRequirements?: {
      projectName?: string;
      projectDescription?: string;
      primaryObjective?: string;
      businessProblem?: string;
      applicationType?: FrontDeskProjectRequirements['applicationType'];
      preferredTimeline?: string;
      optionalBudgetExpectation?: string;
    };
    intendedUsers?: string[];
    confirmedFeatures?: string[];
    confirmedIntegrations?: string[];
  }
): FrontDeskSessionDossier {
  const now = new Date().toISOString();
  const next: FrontDeskSessionDossier = {
    ...dossier,
    discoveryActive: true,
    clientProfile: { ...dossier.clientProfile },
    businessDiscovery: { ...dossier.businessDiscovery },
    projectRequirements: {
      ...dossier.projectRequirements,
      intendedUsers: [...dossier.projectRequirements.intendedUsers],
      functionalRequirements: [...dossier.projectRequirements.functionalRequirements],
      nonfunctionalRequirements: [...dossier.projectRequirements.nonfunctionalRequirements],
      integrations: [...dossier.projectRequirements.integrations],
      clientConcerns: [...dossier.projectRequirements.clientConcerns],
    },
    updatedAt: now,
    version: dossier.version + 1,
  };

  if (patch.clientProfile) {
    for (const [k, v] of Object.entries(patch.clientProfile)) {
      if (typeof v === 'string') {
        (next.clientProfile as Record<string, string>)[k] = cleanStr(v, 200);
      }
    }
  }

  if (patch.businessDiscovery) {
    for (const [k, v] of Object.entries(patch.businessDiscovery)) {
      if (typeof v === 'string') {
        (next.businessDiscovery as Record<string, string>)[k] = cleanStr(v, 400);
      }
    }
  }

  const overviewPatch = patch.projectOverview || patch.projectRequirements;
  if (overviewPatch) {
    const o = overviewPatch;
    if (o.projectName !== undefined) next.projectRequirements.projectName = cleanStr(o.projectName, 160);
    if (o.projectDescription !== undefined) next.projectRequirements.projectDescription = cleanStr(o.projectDescription, 800);
    if (o.primaryObjective !== undefined) next.projectRequirements.primaryObjective = cleanStr(o.primaryObjective, 400);
    if (o.businessProblem !== undefined) next.projectRequirements.businessProblem = cleanStr(o.businessProblem, 500);
    if (o.applicationType !== undefined) next.projectRequirements.applicationType = o.applicationType;
    if (o.preferredTimeline !== undefined) next.projectRequirements.preferredTimeline = cleanStr(o.preferredTimeline, 120);
    if (o.optionalBudgetExpectation !== undefined) {
      next.projectRequirements.optionalBudgetExpectation = cleanStr(o.optionalBudgetExpectation, 160);
    }
  }

  if (Array.isArray(patch.intendedUsers)) {
    next.projectRequirements.intendedUsers = Array.from(
      new Set(patch.intendedUsers.map((u) => cleanStr(u, 80)).filter(Boolean))
    );
  }

  if (Array.isArray(patch.confirmedFeatures)) {
    next.projectRequirements.functionalRequirements = patch.confirmedFeatures
      .map((label, idx) => ({
        id: `fn-client-${idx + 1}`,
        category: 'functional' as const,
        label: cleanStr(label, 140),
        classification: 'Confirmed' as const,
        source: 'client_confirmed' as const,
        capturedAt: now,
      }))
      .filter((x) => Boolean(x.label));
  }

  if (Array.isArray(patch.confirmedIntegrations)) {
    next.projectRequirements.integrations = patch.confirmedIntegrations
      .map((label, idx) => ({
        id: `int-client-${idx + 1}`,
        category: 'integration' as const,
        label: cleanStr(label, 140),
        classification: 'Confirmed' as const,
        source: 'client_confirmed' as const,
        capturedAt: now,
      }))
      .filter((x) => Boolean(x.label));
  }

  next.completeness = evaluateRequirementsCompleteness(next);
  next.leadStatus = computeLeadQualificationStatus(next);
  next.recommendation = generatePreliminarySolutionRecommendation(next);
  next.summary = generateConversationSummary(next);
  if (next.masterplan) {
    next.masterplan = generatePreliminaryMasterplan(next);
  }
  return next;
}

/**
 * M15: Transparent 10-Dimension Requirements Completeness Engine (Section 15)
 * Zero arbitrary percentages: calculated strictly from weighted satisfied dimensions.
 */
export function evaluateRequirementsCompleteness(
  dossier: FrontDeskSessionDossier
): RequirementsCompletenessReport {
  const cp = dossier.clientProfile;
  const bd = dossier.businessDiscovery;
  const pr = dossier.projectRequirements;

  const dimensions: RequirementsCompletenessDimension[] = [
    {
      key: 'client_identification',
      label: 'Client Identification',
      weight: 15,
      satisfied: Boolean(cp.fullName && cp.email),
      essential: true,
      missingHint: !cp.fullName
        ? 'Your full name and email address'
        : !cp.email
        ? 'Your email address for confirmation and summaries'
        : undefined,
    },
    {
      key: 'business_understanding',
      label: 'Business Context',
      weight: 10,
      satisfied: Boolean(cp.companyName || cp.industry || bd.businessNature),
      essential: true,
      missingHint: 'Your company name or business industry',
    },
    {
      key: 'project_objectives',
      label: 'Project Objectives',
      weight: 15,
      satisfied: Boolean(pr.applicationType || pr.businessProblem || pr.primaryObjective),
      essential: true,
      missingHint: 'What type of application or business goal you want to achieve',
    },
    {
      key: 'functional_requirements',
      label: 'Functional Requirements',
      weight: 15,
      satisfied: pr.functionalRequirements.length > 0,
      essential: true,
      missingHint: 'Key features or workflows the system needs to support',
    },
    {
      key: 'user_roles',
      label: 'Intended User Roles',
      weight: 10,
      satisfied: pr.intendedUsers.length > 0,
      essential: false,
      missingHint: 'Who will use the platform (e.g., admins, staff, customers)',
    },
    {
      key: 'integration_requirements',
      label: 'External Integrations',
      weight: 10,
      satisfied: pr.integrations.length > 0 || Boolean(bd.existingSoftware),
      essential: false,
      missingHint: 'Any existing software, payment gateways, or accounting tools to integrate',
    },
    {
      key: 'security_requirements',
      label: 'Security & Compliance',
      weight: 10,
      satisfied:
        pr.nonfunctionalRequirements.some((r) => r.id === 'nfr-security') ||
        Boolean(bd.securityRequirements || pr.regulatoryRequirements),
      essential: false,
      missingHint: 'Any security, data privacy, or regulatory requirements',
    },
    {
      key: 'timeline',
      label: 'Preferred Timeline',
      weight: 5,
      satisfied: Boolean(pr.preferredTimeline || pr.targetLaunchDate),
      essential: false,
      missingHint: 'Your target launch window or delivery timeline',
    },
    {
      key: 'commercial_discussion_readiness',
      label: 'Executive Commercial Review Readiness',
      weight: 5,
      satisfied: Boolean(pr.businessProblem && pr.functionalRequirements.length > 0 && cp.email),
      essential: false,
      missingHint: 'Core scope + contact details to prepare an executive pricing discussion',
    },
    {
      key: 'consultation_availability',
      label: 'Consultation Scheduling Preference',
      weight: 5,
      satisfied: Boolean(cp.preferredConsultationSchedule || cp.timezone),
      essential: false,
      missingHint: 'Preferred consultation date/time or your time zone',
    },
  ];

  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  const earnedWeight = dimensions.reduce((sum, d) => sum + (d.satisfied ? d.weight : 0), 0);
  const scorePercent = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
  const satisfiedCount = dimensions.filter((d) => d.satisfied).length;
  const missingEssentialFields = dimensions
    .filter((d) => d.essential && !d.satisfied)
    .map((d) => d.missingHint || d.label);

  // Pick the SINGLE next most natural non-repetitive discovery question
  let nextRecommendedQuestion: string | null = null;
  if (dossier.discoveryActive) {
    if (!pr.applicationType && !pr.businessProblem) {
      nextRecommendedQuestion = 'What kind of application or technology solution are you thinking about building?';
    } else if (pr.functionalRequirements.length === 0) {
      nextRecommendedQuestion =
        cp.industry === 'Hospitality'
          ? 'Are you looking to manage reservations and guest check-ins, or do you also want to automate daily hotel operations like housekeeping and billing?'
          : 'What core features or daily workflows would you like the system to handle first?';
    } else if (pr.intendedUsers.length === 0) {
      nextRecommendedQuestion = 'Who will be using the system—such as administrators, internal staff, or external customers?';
    } else if (pr.integrations.length === 0 && !bd.existingSoftware) {
      nextRecommendedQuestion = 'Do you need this to integrate with any existing software, payment gateways, or accounting systems?';
    } else if (!pr.preferredTimeline) {
      nextRecommendedQuestion = 'Do you have a target timeline or launch window in mind?';
    } else if (!cp.fullName || !cp.email) {
      nextRecommendedQuestion =
        'Whenever you are ready for us to prepare a formal requirements summary or schedule an executive consultation, what is your name and best email address?';
    }
  }

  return {
    scorePercent,
    satisfiedCount,
    totalDimensions: dimensions.length,
    dimensions,
    missingEssentialFields,
    readyForSummary: Boolean(
      dossier.discoveryActive && (pr.applicationType || pr.businessProblem) && pr.functionalRequirements.length > 0
    ),
    // Section 15: Allow clients to schedule an initial consultation even when some requirements remain unknown!
    readyForConsultation: Boolean(cp.fullName && cp.email),
    nextRecommendedQuestion,
  };
}

/**
 * M14: Transparent 16-Status Lead Qualification Engine (Section 16)
 * Strictly based on project discovery data—never protected personal attributes,
 * and NEVER rejects a client for not disclosing a budget.
 */
export function computeLeadQualificationStatus(
  dossier: FrontDeskSessionDossier,
  overrideStatus?: LeadQualificationStatus
): LeadQualificationStatus {
  if (overrideStatus) return overrideStatus;
  if (!dossier.discoveryActive) {
    return dossier.clientProfile.email || dossier.clientProfile.companyName
      ? 'Potential client'
      : 'New visitor';
  }
  const score = dossier.completeness.scorePercent;
  const hasContact = Boolean(dossier.clientProfile.fullName && dossier.clientProfile.email);
  const hasScope = Boolean(
    dossier.projectRequirements.businessProblem && dossier.projectRequirements.functionalRequirements.length > 0
  );

  if (hasContact && hasScope && score >= 55) return 'Qualified project inquiry';
  if (hasScope && score >= 40) return 'Requirements collected';
  if (dossier.projectRequirements.businessProblem || dossier.projectRequirements.applicationType) {
    return score >= 20 ? 'Requirements incomplete' : 'Project discovery started';
  }
  return 'General inquiry';
}

/**
 * M10 / M11: Intelligent Solution Recommendation & Preliminary Architecture Generator (Section 13)
 */
export function generatePreliminarySolutionRecommendation(
  dossier: FrontDeskSessionDossier
): PreliminarySolutionRecommendation {
  const pr = dossier.projectRequirements;
  const cp = dossier.clientProfile;
  const appType = pr.applicationType || 'Web application';
  const isSimpleWebsite = appType === 'Website' && pr.functionalRequirements.length <= 3;
  const hasAI =
    appType === 'AI application' ||
    pr.functionalRequirements.some((r) => r.id === 'fn-ai');
  const hasBlockchain =
    appType === 'Blockchain application' ||
    pr.functionalRequirements.some((r) => r.id === 'fn-blockchain');
  const hasMobile =
    appType === 'Mobile application' ||
    pr.nonfunctionalRequirements.some((r) => r.id === 'nfr-mobile');

  const modules: PreliminarySolutionRecommendation['recommendedModules'] = [];
  for (const item of pr.functionalRequirements) {
    modules.push({
      name: item.label,
      rationale: 'Confirmed directly from client requirements.',
      classification: item.classification,
    });
  }

  // Add right-sized preliminary modules only where helpful (avoid over-engineering simple sites!)
  const addProposed = (name: string, rationale: string, classification: RequirementClassification = 'Proposed') => {
    if (!modules.some((m) => m.name.toLowerCase().includes(name.toLowerCase().slice(0, 12)))) {
      modules.push({ name, rationale, classification });
    }
  };

  if (isSimpleWebsite) {
    addProposed('Responsive Corporate Web Frontend & CMS', 'Supports clean brand presentation and maintainable content updates.');
    addProposed('Lead Inquiry & Consultation Capture', 'Converts visitors into structured inquiries with validated contact delivery.');
    addProposed('Technical SEO, Accessibility & Analytics', 'Improves discoverability and mobile usability without unnecessary backend bloat.');
  } else {
    addProposed('Role-Based Access Control (RBAC) & Authentication', 'Protects administrative, staff, and customer workflows.');
    addProposed('Central Operational Dashboard & Reporting', 'Gives decision-makers real-time visibility into operations.');
    if (cp.industry === 'Hospitality') {
      addProposed('Reservation, Room Inventory & Check-In Module', 'Streamlines front-desk bookings, occupancy, and guest lifecycle.');
      addProposed('Housekeeping & Billing Automation', 'Reduces manual coordination across daily hotel operations.', 'Optional');
    } else if (cp.industry === 'Transportation' || cp.industry === 'Logistics') {
      addProposed('Dispatch, Fleet & Shipment Tracking Module', 'Centralizes routes, vehicle utilization, and delivery status.');
    } else if (cp.industry === 'E-Commerce' || cp.industry === 'Retail') {
      addProposed('Catalog, Inventory & Order Checkout Module', 'Unifies product availability, payment processing, and fulfillment.');
    }
    if (hasAI) {
      addProposed('Governed AI Assistant & Workflow Automation Layer', 'Automates inquiries and document workflows with human-in-the-loop oversight.', 'Requires technical validation');
    }
    if (hasBlockchain) {
      addProposed('Tamper-Evident Hash Attestation & Verification Ledger', 'Anchors document integrity proofs while keeping personal data off-chain.', 'Requires technical validation');
    }
  }

  const proposedUserRoles =
    pr.intendedUsers.length > 0
      ? [...pr.intendedUsers]
      : isSimpleWebsite
      ? ['Website Visitors', 'Content Administrators']
      : ['System Administrators', 'Operational Staff', 'Customers / End Users', 'Executives'];

  return {
    preliminaryDisclaimer:
      'Preliminary Recommendation Only — Subject to Formal Technical Validation and Executive Architectural Review by DESTRIA TECH INC.',
    proposedApplicationType: appType,
    recommendedModules: modules.slice(0, 10),
    proposedUserRoles,
    preliminaryTechStack: {
      frontend: hasMobile
        ? 'React + TypeScript responsive web app with Progressive Web App (PWA) or cross-platform mobile companion (React Native / Capacitor)'
        : 'React + TypeScript + Tailwind CSS responsive, accessible web application',
      backend: isSimpleWebsite
        ? 'Lightweight Node.js / Express API for validated forms, CMS webhooks, and transactional email'
        : 'Modular Node.js + TypeScript (Express) REST/WebSocket API with strict schema validation and service separation',
      database: isSimpleWebsite
        ? 'Managed PostgreSQL (Supabase) for inquiries, consultation scheduling, and audit logs'
        : 'Managed PostgreSQL (Supabase) with relational integrity, indexes, row-level security (RLS), and versioned audit trails',
      authentication: isSimpleWebsite
        ? 'Protected admin RBAC authentication with TLS session security'
        : 'Token-based authentication with RBAC, row-level ownership isolation, and optional MFA for privileged roles',
      apiIntegrations:
        pr.integrations.length > 0
          ? pr.integrations.map((i) => i.label).join('; ')
          : 'Standard REST/webhook integration layer ready for payment gateways, accounting tools, or CRM connectors as confirmed',
      cloudInfrastructure:
        'Managed cloud application hosting (e.g., Railway / containerized runtime) paired with CDN-delivered frontend and automated CI/CD',
      securityControls:
        'TLS 1.3 encryption in transit, encrypted storage at rest, parameterized queries, API rate limiting, input validation, and audit logging',
      aiOpportunities: hasAI
        ? 'Server-side Gemini API orchestration with retrieval-augmented generation (RAG), explicit human confirmation tokens, and prompt-injection safeguards'
        : 'Optional future phase: intelligent search, automated reporting summaries, or AI customer support (only if aligned with business value)',
      reportingCapabilities:
        'Structured operational dashboards with filterable tables and authorized CSV/PDF report export',
      maintenanceRequirements:
        'Managed dependency patching, uptime & error monitoring, automated database backups, and SLA-aligned post-launch support',
    },
    architectureRationale: isSimpleWebsite
      ? 'Right-sized modern web stack optimized for fast load speed, SEO, maintainability, and low operational overhead without unnecessary enterprise complexity.'
      : `Modular full-stack architecture aligned to ${cp.industry || 'enterprise'} workflows, balancing maintainability, data integrity, security, and future extensibility.`,
  };
}

/**
 * M13: 25-Section Preliminary Project Development Masterplan Generator (Section 14)
 * Strictly generated from actual client responses + clearly labeled preliminary recommendations.
 */
export function generatePreliminaryMasterplan(
  dossier: FrontDeskSessionDossier
): PreliminaryProjectMasterplan {
  const cp = dossier.clientProfile;
  const bd = dossier.businessDiscovery;
  const pr = dossier.projectRequirements;
  const rec = dossier.recommendation || generatePreliminarySolutionRecommendation(dossier);

  const confirmedFeatures = pr.functionalRequirements
    .filter((f) => f.source === 'client_confirmed')
    .map((f) => f.label);

  const confirmedIntegrations = pr.integrations
    .filter((i) => i.source === 'client_confirmed')
    .map((i) => i.label);

  const outstandingQuestions: string[] = [];
  for (const dim of dossier.completeness.dimensions) {
    if (!dim.satisfied && dim.missingHint) {
      outstandingQuestions.push(`${dim.label}: ${dim.missingHint}`);
    }
  }
  if (outstandingQuestions.length === 0) {
    outstandingQuestions.push('Confirm final user concurrency targets, third-party API credentials, and acceptance milestones during executive consultation.');
  }

  return {
    generatedAt: new Date().toISOString(),
    version: dossier.version,
    preliminaryNotice:
      'PRELIMINARY DEVELOPMENT MASTERPLAN — Clearly distinguishes client-confirmed statements from AI-proposed technical recommendations. Final architecture, timeline, and commercial pricing require formal technical validation and executive approval by DESTRIA TECH INC.',
    sections: {
      '01_executive_project_summary': `${cp.companyName || 'Prospective Client'} is exploring a ${pr.applicationType || 'customized technology solution'}${pr.projectName ? ` (${pr.projectName})` : ''}${cp.industry ? ` in the ${cp.industry} sector` : ''}. Confirmed focus: ${pr.businessProblem || pr.projectDescription || 'Initial technical discovery in progress.'}`,
      '02_client_business_profile': {
        clientName: cp.fullName || 'Not yet confirmed',
        companyName: cp.companyName || 'Not yet confirmed',
        position: cp.position || 'Not yet provided',
        industry: cp.industry || 'Not yet confirmed',
        location: [cp.location, cp.country].filter(Boolean).join(', ') || 'Not yet provided',
        contactEmail: cp.email || 'Not yet provided',
        telephone: cp.phone || 'Not yet provided',
        preferredLanguage: cp.preferredLanguage || 'en-US',
        organizationScale: [bd.employeeCount, bd.branchLocations].filter(Boolean).join(' · ') || 'To be confirmed in discovery',
      },
      '03_current_operational_challenges': [
        bd.operationalChallenges || pr.businessProblem || 'Operational challenges to be expanded during executive discovery.',
        ...(bd.manualActivities ? [`Manual processes noted: ${bd.manualActivities}`] : []),
      ],
      '04_project_objectives': [
        pr.primaryObjective || `Deliver a reliable ${pr.applicationType || 'technology platform'} aligned with client operational goals.`,
        ...(pr.expectedOutcome ? [`Expected outcome: ${pr.expectedOutcome}`] : []),
      ],
      '05_proposed_technology_solution': `[Preliminary Recommendation] ${rec.proposedApplicationType} — ${rec.architectureRationale}`,
      '06_application_scope': {
        confirmedScope:
          confirmedFeatures.length > 0
            ? confirmedFeatures
            : ['Core application scope confirmed at high level; detailed module breakdown pending client confirmation.'],
        preliminaryProposedScope: rec.recommendedModules
          .filter((m) => m.classification !== 'Confirmed')
          .map((m) => `${m.name} (${m.classification}) — ${m.rationale}`),
      },
      '07_functional_modules': rec.recommendedModules.map((m) => ({
        name: m.name,
        status: m.classification,
        source: m.classification === 'Confirmed' ? 'Client Confirmed' : 'Preliminary AI Recommendation',
      })),
      '08_user_roles_and_permissions': rec.proposedUserRoles,
      '09_business_process_workflows': [
        '1. Authenticated user onboarding and role-based access routing',
        '2. Core operational data capture, validation, and status lifecycle tracking',
        '3. Automated notifications, approvals, and cross-module synchronization',
        '4. Executive dashboard reporting and audit-logged administrative governance',
      ],
      '10_preliminary_system_architecture': rec.preliminaryTechStack,
      '11_database_requirements': [
        'Normalized relational PostgreSQL schema with primary keys, foreign keys, unique constraints, and performance indexes',
        'Row-Level Security (RLS) enforcing strict tenant/client data ownership isolation',
        'Versioned requirement/record history, audit logging, and idempotency controls for critical writes',
        'Automated point-in-time backups and tested restoration procedures',
      ],
      '12_api_requirements':
        confirmedIntegrations.length > 0
          ? [...confirmedIntegrations.map((i) => `[Confirmed] ${i}`), '[Proposed] Versioned internal REST API with schema validation and rate limiting']
          : ['[Proposed] Secure REST API with schema validation, idempotency headers, and extensible webhook connectors'],
      '13_ai_integration_requirements': [
        rec.preliminaryTechStack.aiOpportunities,
        'Strict server-side secret isolation, prompt-injection defense, and human-in-the-loop confirmation for any business action',
      ],
      '14_security_requirements': [
        rec.preliminaryTechStack.securityControls,
        ...(pr.nonfunctionalRequirements.map((n) => `[Confirmed] ${n.label}`)),
        'No storage of raw payment credentials in application AI logs; explicit privacy consent handling',
      ],
      '15_infrastructure_requirements': [
        rec.preliminaryTechStack.cloudInfrastructure,
        'Environment separation (development, staging, production) with structured logging and health probes',
      ],
      '16_user_interface_requirements': [
        'Mobile-first responsive interface following accessible WCAG-minded contrast, keyboard navigation, and clear error feedback',
        `Language support aligned with client preference (${cp.preferredLanguage || 'English'})`,
      ],
      '17_development_phases': [
        { phase: 'Phase 1 — Discovery, Architecture & UX Validation', deliverables: 'Finalized SRS, database schema, security design, interactive wireframes' },
        { phase: 'Phase 2 — Core Backend, Database & Authentication', deliverables: 'Relational schema, RLS policies, RBAC, core APIs, automated unit tests' },
        { phase: 'Phase 3 — Application Modules & Integrations', deliverables: 'Confirmed functional modules, third-party API connectors, reporting dashboards' },
        { phase: 'Phase 4 — Security Testing, UAT & Staging Acceptance', deliverables: 'Integration/security test suites, client acceptance review, performance verification' },
        { phase: 'Phase 5 — Production Launch & Managed Handover', deliverables: 'Production deployment, operational runbooks, training, ongoing maintenance SLA' },
      ],
      '18_testing_and_acceptance_requirements': [
        'Automated unit, integration, and security regression suites (auth, RBAC, tenant isolation, validation)',
        'Client User Acceptance Testing (UAT) in hosted staging environment prior to production release',
        'Cross-browser and mobile viewport verification',
      ],
      '19_deployment_considerations': [
        'Zero-downtime migration review before applying database changes to production',
        'Verified DNS, TLS certificates, transactional email domain verification, and monitoring alerts',
      ],
      '20_maintenance_and_support_requirements': [
        rec.preliminaryTechStack.maintenanceRequirements,
        'Defined incident response escalation and periodic security/dependency updates',
      ],
      '21_assumptions': [
        'Preliminary architecture and phasing are assumptions based on discovery inputs and require formal engineering review.',
        'Third-party cloud, domain, payment gateway, and external API licenses will be clarified separately from development scope.',
        ...(pr.preferredTimeline ? [`Target timeline noted by client: ${pr.preferredTimeline} (subject to technical feasibility assessment).`] : []),
      ],
      '22_risks': [
        'Scope expansion during detailed design if integrations or legacy data migration prove more complex than anticipated',
        'Third-party API rate limits, vendor onboarding lead times, or regulatory approvals (especially for payments, healthcare, or blockchain)',
        ...(pr.clientConcerns.length > 0 ? pr.clientConcerns.map((c) => `Client-noted concern: ${c}`) : []),
      ],
      '23_outstanding_questions': outstandingQuestions,
      '24_executive_decisions_required': [
        'Confirm final MVP vs. Phase 2 module boundaries',
        'Approve hosting ownership, third-party vendor licenses, and maintenance SLA tier',
        'Authorize formal commercial quotation, payment milestones, and master services agreement',
      ],
      '25_commercial_discussion_agenda': [...COMMERCIAL_DISCUSSION_AGENDA],
    },
  };
}

/**
 * M15: Conversation Summary Generator (Section 17)
 * Strictly separates confirmed client statements from AI recommendations
 * and excludes unrelated casual conversation.
 */
export function generateConversationSummary(
  dossier: FrontDeskSessionDossier
): FrontDeskConversationSummary {
  const cp = dossier.clientProfile;
  const pr = dossier.projectRequirements;
  const rec = dossier.recommendation || generatePreliminarySolutionRecommendation(dossier);

  const confirmedReqs = [
    ...pr.functionalRequirements.filter((r) => r.source === 'client_confirmed').map((r) => r.label),
    ...pr.nonfunctionalRequirements.filter((r) => r.source === 'client_confirmed').map((r) => r.label),
  ];

  const aiProposed = rec.recommendedModules
    .filter((m) => m.classification !== 'Confirmed')
    .map((m) => `${m.name} (${m.classification})`);

  const missingHints = dossier.completeness.dimensions
    .filter((d) => !d.satisfied && d.missingHint)
    .map((d) => d.missingHint as string);

  return {
    generatedAt: new Date().toISOString(),
    clientName: cp.fullName || 'Not yet provided',
    company: cp.companyName || 'Not yet provided',
    contactInformation:
      [cp.email, cp.phone, cp.location].filter(Boolean).join(' · ') || 'Not yet provided',
    projectInterest: pr.projectName || pr.applicationType || 'Custom Technology Solution',
    businessProblem: pr.businessProblem || 'Captured during discovery conversation',
    confirmedRequirements:
      confirmedReqs.length > 0
        ? confirmedReqs
        : ['Initial project interest noted; detailed functional requirements pending confirmation.'],
    proposedSolution: `[Preliminary Recommendation] ${rec.proposedApplicationType}: ${rec.architectureRationale}`,
    preliminaryAiRecommendations: aiProposed,
    requestedFeatures: pr.functionalRequirements.map((r) => r.label),
    requiredIntegrations: pr.integrations.map((i) => i.label),
    expectedTimeline: pr.preferredTimeline || 'To be confirmed during executive consultation',
    optionalClientBudgetExpectation:
      pr.optionalBudgetExpectation || 'Not disclosed (optional — never disqualifies inquiry)',
    clientConcerns: pr.clientConcerns,
    outstandingQuestions: missingHints.slice(0, 6),
    recommendedNextAction: dossier.completeness.readyForConsultation
      ? 'Review and confirm this summary to submit the project inquiry and schedule an executive consultation for final scope and pricing.'
      : 'Confirm your name and email address, review the summary, and schedule an executive consultation.',
  };
}

/**
 * M09: Intelligent Section 9 Technical Q&A Deterministic Helper
 * Answers key feasibility questions accurately without fabricating certifications or pricing.
 */
export function answerTechnicalFeasibilityQuestion(userMessage: string): string | null {
  const lower = userMessage.trim().toLowerCase();

  if (/\b(mvp|minimum\s+viable|start\s+small|phase\s*1|phased\s+approach|scale\s+later)\b/i.test(lower)) {
    return 'Yes—starting with a focused Phase 1 MVP (Minimum Viable Product) built on a clean, modular architecture is often the smartest path. We design the database, APIs, and authentication cleanly from day one so you can launch high-impact workflows quickly and scale additional modules, branches, or AI capabilities in Phase 2 without a costly rewrite.';
  }
  if (/\b(what\s+technology\s+should\s+i\s+use|which\s+tech\s+stack|recommended\s+stack)\b/i.test(lower)) {
    return 'The best technology stack depends on your project goals, user scale, and integration needs. For most modern web and enterprise platforms, a TypeScript/React frontend paired with a modular Node.js backend and PostgreSQL database gives strong security, maintainability, and cloud scalability—without over-engineering. Tell me a bit about what you are building and I can recommend a tailored preliminary architecture.';
  }
  if (/\b(can\s+it\s+support\s+online\s+payments?|online\s+payments?|payment\s+gateways?|webhooks?)\b/i.test(lower)) {
    return 'Yes—modern web and mobile applications can integrate securely with authorized payment gateways (such as Stripe, PayPal, or regional processors) using PCI-aligned tokenized checkout flows and cryptographically verified webhook reconciliation so sensitive card credentials never touch your application database directly. Which payment methods or currencies do your customers use?';
  }
  if (/\b(can\s+it\s+integrate\s+with\s+accounting|accounting\s+systems?)\b/i.test(lower)) {
    return 'Yes—systems can integrate with accounting platforms like QuickBooks, Xero, or enterprise ERPs through official APIs or automated ledger exports, syncing invoices, payments, and chart-of-accounts mappings. Which accounting software are you currently using?';
  }
  if (/\b(can\s+it\s+support\s+multiple\s+(?:branches|locations|users)|operate\s+internationally|multiple\s+languages)\b/i.test(lower)) {
    return 'Yes—by designing with multi-tenant/multi-branch data isolation, role-based access control (RBAC), UTC-normalized time zones, multi-currency formatting, and localized language resources from the start, one platform can serve multiple branches and international users cleanly. How many locations or user groups do you expect?';
  }
  if (/\b(how\s+will\s+the\s+database\s+be\s+designed|database\s+design)\b/i.test(lower)) {
    return 'We design normalized relational schemas (such as PostgreSQL) with strict primary/foreign keys, performance indexes, row-level security (RLS) for client data isolation, audit trails, and automated backups. Once we confirm your core entities and workflows, our engineers validate the full schema during technical assessment.';
  }
  if (/\b(how\s+(?:will|do)\s+(?:the\s+system|you)\s+protect\s+(?:customer|user)|protect\s+(?:customer|user)\s+(?:information|data)|data\s+security|rbac\s+and\s+encryption)\b/i.test(lower)) {
    return 'Customer and user information is protected through layered controls: encrypted TLS transport, encryption at rest, role-based access control (RBAC), row-level ownership isolation, strict server-side input validation, rate limiting, and audit logging. Note that we do not claim third-party compliance certifications unless independently audited for your deployment.';
  }
  if (/\b(what\s+licenses\s+might\s+be\s+required|third[\s-]?party\s+licenses?)\b/i.test(lower)) {
    return 'Depending on your platform, third-party licenses or infrastructure accounts may include cloud hosting, managed database services, domain/SSL, transactional email delivery, payment processor fees, or AI API usage. DESTRIA TECH INC discloses all external infrastructure and license requirements transparently during executive scope review.';
  }
  if (/\b(who\s+will\s+maintain\s+the\s+application|ongoing\s+maintenance)\b/i.test(lower)) {
    return 'DESTRIA TECH INC can provide structured post-launch maintenance, security patching, monitoring, and feature enhancements under a customized support arrangement, or provide full documentation and handover to your internal IT team. Which model fits your organization best?';
  }
  if (/\b(how\s+long\s+could\s+development\s+take|development\s+timeline)\b/i.test(lower)) {
    return 'Development timelines depend on module count, custom integrations, security/compliance scope, and testing phases. Smaller websites may take weeks, while integrated multi-branch enterprise or AI platforms are delivered in structured milestone phases—and our executive team confirms a formal schedule after reviewing your requirements.';
  }
  if (/\b(what\s+affects?\s+(?:the\s+)?(?:development\s+)?cost|factors\s+affecting\s+(?:development\s+)?cost)\b/i.test(lower)) {
    return 'Development cost depends on project complexity, number of modules, intended user scale, external integrations, AI capabilities, cloud infrastructure, security and compliance requirements, target timeline, and ongoing maintenance. I can help organize your requirements now so our executive team can prepare an accurate formal quotation during your consultation.';
  }

  return null;
}

/**
 * M18: Professional Executive Project Discovery Report Email Builder (Section 20 — Sections A through R)
 * Exact subject: New Qualified Project Inquiry — [Company Name] — [Project Name] — [Reference Number]
 */
export function buildFrontDeskExecutiveReportEmail(params: {
  referenceCode: string;
  submittedAtUtc: string;
  dossier: FrontDeskSessionDossier;
  masterplan: PreliminaryProjectMasterplan;
  consultationDetails?: {
    referenceCode?: string;
    status: string;
    scheduledDate?: string;
    scheduledTimeSlot?: string;
    clientTimezone?: string;
    consultationType?: string;
  };
  authenticatedAdminReportUrl?: string;
}): { subject: string; html: string; text: string } {
  const { referenceCode, submittedAtUtc, dossier, masterplan, consultationDetails } = params;
  const cp = dossier.clientProfile;
  const bd = dossier.businessDiscovery;
  const pr = dossier.projectRequirements;
  const rec = dossier.recommendation || generatePreliminarySolutionRecommendation(dossier);

  const companyName = cp.companyName || 'Prospective Client';
  const projectName = pr.projectName || pr.applicationType || 'Custom Technology Project';
  const subject = `New Qualified Project Inquiry — ${companyName} — ${projectName} — ${referenceCode}`;
  const adminUrl =
    params.authenticatedAdminReportUrl || buildCanonicalPublicUrl(ROUTES.ADMIN.AI_FRONTDESK);

  const confirmedReqs = pr.functionalRequirements
    .filter((f) => f.source === 'client_confirmed')
    .map((f) => `${f.label} [${f.classification}]`);
  const integrationReqs = pr.integrations.map((i) => `${i.label} [${i.classification}]`);

  const consultLines = consultationDetails
    ? [
        `Consultation Reference: ${consultationDetails.referenceCode || 'Pending'}`,
        `Status: ${consultationDetails.status}`,
        `Requested Date & Slot: ${consultationDetails.scheduledDate || 'Not selected'} ${consultationDetails.scheduledTimeSlot || ''}`.trim(),
        `Client Timezone: ${consultationDetails.clientTimezone || cp.timezone || 'UTC'}`,
        `Meeting Format: ${consultationDetails.consultationType || 'Online Video Consultation'}`,
      ]
    : ['No consultation slot booked yet — client inquiry submitted for executive review and follow-up.'];

  const sectionsList: Array<{ letter: string; title: string; lines: string[] }> = [
    {
      letter: 'A',
      title: 'Executive Summary',
      lines: [
        masterplan.sections['01_executive_project_summary'],
        `Lead Qualification Status: ${dossier.leadStatus} | Requirements Completeness: ${dossier.completeness.scorePercent}% (${dossier.completeness.satisfiedCount}/${dossier.completeness.totalDimensions} dimensions)`,
      ],
    },
    {
      letter: 'B',
      title: 'Client Contact Details',
      lines: [
        `Full Name: ${cp.fullName || 'Not provided'}`,
        `Email: ${cp.email || 'Not provided'}`,
        `Telephone: ${cp.phone || 'Not provided'}`,
        `Position / Role: ${cp.position || 'Not provided'}${cp.decisionMakingRole ? ` (${cp.decisionMakingRole})` : ''}`,
        `Preferred Language: ${cp.preferredLanguage || 'en-US'} | Timezone: ${cp.timezone || 'Not provided'}`,
      ],
    },
    {
      letter: 'C',
      title: 'Company Background',
      lines: [
        `Company: ${companyName}`,
        `Industry: ${cp.industry || 'Not provided'}`,
        `Website: ${cp.website || 'Not provided'}`,
        `Location / Country: ${[cp.location, cp.country].filter(Boolean).join(', ') || 'Not provided'}`,
        `Scale: ${[bd.employeeCount, bd.branchLocations].filter(Boolean).join(' · ') || 'To be confirmed'}`,
      ],
    },
    {
      letter: 'D',
      title: 'Project Overview',
      lines: [
        `Project Name: ${projectName}`,
        `Application Type: ${pr.applicationType || 'To be confirmed'}`,
        `Primary Objective: ${pr.primaryObjective || 'Not specified'}`,
        `Intended Users: ${pr.intendedUsers.join(', ') || 'To be confirmed'}`,
      ],
    },
    {
      letter: 'E',
      title: 'Business Challenges',
      lines: masterplan.sections['03_current_operational_challenges'],
    },
    {
      letter: 'F',
      title: 'Confirmed Functional Requirements',
      lines:
        confirmedReqs.length > 0
          ? confirmedReqs
          : ['No granular modules explicitly confirmed yet; see preliminary recommendations below.'],
    },
    {
      letter: 'G',
      title: 'Proposed Technology Solution (Preliminary)',
      lines: [
        rec.preliminaryDisclaimer,
        `Proposed Application Type: ${rec.proposedApplicationType}`,
        `Rationale: ${rec.architectureRationale}`,
        `Recommended Modules: ${rec.recommendedModules.map((m) => `${m.name} (${m.classification})`).join('; ')}`,
      ],
    },
    {
      letter: 'H',
      title: 'Preliminary Development Masterplan (25-Section Summary)',
      lines: [
        `Masterplan Version: v${masterplan.version} (25 sections persisted in Administrative Command Center)`,
        `Frontend: ${rec.preliminaryTechStack.frontend}`,
        `Backend: ${rec.preliminaryTechStack.backend}`,
        `Database: ${rec.preliminaryTechStack.database}`,
        `Phases: ${masterplan.sections['17_development_phases'].map((p) => p.phase).join(' -> ')}`,
        `Authenticated Executive Console Link: ${adminUrl}`,
      ],
    },
    {
      letter: 'I',
      title: 'Integration Requirements',
      lines:
        integrationReqs.length > 0
          ? integrationReqs
          : ['No external system integrations confirmed yet; extensible API layer recommended.'],
    },
    {
      letter: 'J',
      title: 'Security & Infrastructure Considerations',
      lines: [
        ...masterplan.sections['14_security_requirements'],
        ...masterplan.sections['15_infrastructure_requirements'],
      ],
    },
    {
      letter: 'K',
      title: 'Requested Implementation Timeline',
      lines: [pr.preferredTimeline || pr.targetLaunchDate || 'To be confirmed during executive consultation.'],
    },
    {
      letter: 'L',
      title: 'Optional Client Budget Expectations',
      lines: [
        pr.optionalBudgetExpectation ||
          'Client did not specify a budget expectation (optional; final pricing determined by executive review).',
      ],
    },
    {
      letter: 'M',
      title: 'Outstanding Requirements',
      lines: masterplan.sections['23_outstanding_questions'],
    },
    {
      letter: 'N',
      title: 'Risks & Assumptions',
      lines: [...masterplan.sections['21_assumptions'], ...masterplan.sections['22_risks']],
    },
    {
      letter: 'O',
      title: 'Executive Consultation Details',
      lines: consultLines,
    },
    {
      letter: 'P',
      title: 'Final Pricing Discussion Agenda',
      lines: [...COMMERCIAL_DISCUSSION_AGENDA],
    },
    {
      letter: 'Q',
      title: 'Inquiry Reference Number',
      lines: [referenceCode],
    },
    {
      letter: 'R',
      title: 'Date & Time of Submission (UTC)',
      lines: [submittedAtUtc],
    },
  ];

  const text = [
    subject,
    '='.repeat(subject.length),
    '',
    ...sectionsList.flatMap((sec) => [
      `${sec.letter}. ${sec.title.toUpperCase()}`,
      ...sec.lines.map((l) => `  - ${l}`),
      '',
    ]),
    COMMERCIAL_ENGAGEMENT_STATEMENT,
    `${corporateIdentity.legalName} | ${corporateIdentity.headquarters.fullAddress} | ${corporateIdentity.contact.telephone.display} | ${corporateIdentity.contact.email}`,
  ].join('\n');

  const safeLogo = escapeHtml(BRAND_ASSETS.hostedPrimaryLogoUrl);
  const sectionsHtml = sectionsList
    .map(
      (sec) => `
        <div style="margin:0 0 14px 0;padding:12px 14px;background-color:#0B1220;border:1px solid #1E293B;border-radius:10px;">
          <div style="font-size:11px;font-family:monospace;letter-spacing:1.1px;color:#00C2C7;text-transform:uppercase;font-weight:700;margin-bottom:6px;">${escapeHtml(sec.letter)}. ${escapeHtml(sec.title)}</div>
          <ul style="margin:0 0 0 16px;padding:0;color:#E2E8F0;font-size:13px;line-height:1.55;">
            ${sec.lines.map((l) => `<li style="margin:3px 0;">${escapeHtml(l)}</li>`).join('')}
          </ul>
        </div>`
    )
    .join('');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background-color:#0B1220;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#E2E8F0;">
  <div style="max-width:680px;margin:0 auto;background:#111827;border:1px solid #1E293B;border-radius:16px;overflow:hidden;">
    <div style="padding:20px 24px;background:linear-gradient(135deg,#0B1F3B,#111827);border-bottom:1px solid #1E293B;display:flex;align-items:center;gap:14px;">
      <img src="${safeLogo}" alt="DESTRIA TECH INC" width="42" height="42" style="border-radius:9999px;border:1px solid #D4AF37;" />
      <div>
        <div style="font-size:11px;font-family:monospace;color:#00C2C7;letter-spacing:1.4px;text-transform:uppercase;">AI Front Desk Qualified Project Discovery Report</div>
        <div style="font-size:18px;font-weight:700;color:#FFFFFF;">${escapeHtml(companyName)} — ${escapeHtml(projectName)}</div>
        <div style="font-size:12px;color:#D4AF37;font-family:monospace;">Ref: ${escapeHtml(referenceCode)} · ${escapeHtml(submittedAtUtc)}</div>
      </div>
    </div>
    <div style="padding:22px 24px;">
      ${sectionsHtml}
      <p style="margin:14px 0 0 0;font-size:11px;color:#94A3B8;line-height:1.5;">${escapeHtml(COMMERCIAL_ENGAGEMENT_STATEMENT)}</p>
    </div>
  </div>
</body></html>`;

  return { subject, html, text };
}

/**
 * M19: Separate Client-Facing Confirmation Email Builder (Section 21)
 * Strictly excludes internal lead scores, internal notes, or administrative details.
 */
export function buildFrontDeskClientConfirmationEmail(params: {
  referenceCode: string;
  submittedAtUtc: string;
  dossier: FrontDeskSessionDossier;
  consultationDetails?: {
    referenceCode?: string;
    status: 'confirmed' | 'pending_review';
    scheduledDate?: string;
    scheduledTimeSlot?: string;
    clientTimezone?: string;
    meetingLink?: string;
  };
}): { subject: string; html: string; text: string } {
  const { referenceCode, submittedAtUtc, dossier, consultationDetails } = params;
  const cp = dossier.clientProfile;
  const pr = dossier.projectRequirements;
  const clientName = cp.fullName || 'Valued Client';
  const projectName = pr.projectName || pr.applicationType || 'Your Technology Project';

  const subject = `DESTRIA TECH INC — Project Inquiry Confirmation (${referenceCode})`;
  const portalUrl = buildCanonicalPublicUrl(ROUTES.PORTAL.LOGIN);

  const consultStatusText = consultationDetails
    ? consultationDetails.status === 'confirmed'
      ? `Confirmed for ${consultationDetails.scheduledDate} at ${consultationDetails.scheduledTimeSlot} (${consultationDetails.clientTimezone || 'UTC'})`
      : `Consultation Request Pending Confirmation for ${consultationDetails.scheduledDate} at ${consultationDetails.scheduledTimeSlot} (${consultationDetails.clientTimezone || 'UTC'})`
    : 'Project inquiry registered — our executive team will coordinate your consultation window.';

  const meetingInstructions =
    consultationDetails?.status === 'confirmed' && consultationDetails.meetingLink
      ? `Meeting Link: ${consultationDetails.meetingLink}`
      : 'Official meeting link and calendar details will be provided upon scheduling confirmation.';

  const confirmedFeatures = pr.functionalRequirements
    .filter((f) => f.source === 'client_confirmed')
    .map((f) => f.label);

  const text = [
    `Dear ${clientName},`,
    '',
    `Thank you for speaking with the DESTRIA TECH INC AI Front Desk. We have registered your project requirements under reference ${referenceCode}.`,
    '',
    `Project Reference: ${referenceCode}`,
    `Submitted (UTC): ${submittedAtUtc}`,
    `Project Focus: ${projectName}`,
    `Confirmed Requirements: ${confirmedFeatures.join(', ') || pr.businessProblem || 'Recorded in project summary'}`,
    `Consultation Status: ${consultStatusText}`,
    meetingInstructions,
    '',
    'Final Pricing & Commercial Review:',
    'Final project scope, architecture, development cost, hosting/infrastructure terms, and implementation schedule will be discussed and formalized during your executive consultation with our authorized leadership team.',
    '',
    'Rescheduling or Updates:',
    `To request changes, reschedule, or cancel a consultation, please email ${corporateIdentity.contact.email} or call ${corporateIdentity.contact.telephone.display} referencing ${referenceCode}.`,
    `Client Portal: ${portalUrl}`,
    '',
    `${corporateIdentity.legalName} | ${corporateIdentity.headquarters.fullAddress}`,
  ].join('\n');

  const safeLogo = escapeHtml(BRAND_ASSETS.hostedPrimaryLogoUrl);
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background-color:#0B1220;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#E2E8F0;">
  <div style="max-width:600px;margin:0 auto;background:#111827;border:1px solid #1E293B;border-radius:16px;overflow:hidden;">
    <div style="padding:20px 24px;background:linear-gradient(135deg,#0B1F3B,#111827);border-bottom:1px solid #1E293B;">
      <img src="${safeLogo}" alt="DESTRIA TECH INC" width="40" height="40" style="border-radius:9999px;border:1px solid #D4AF37;vertical-align:middle;margin-right:12px;" />
      <span style="font-size:18px;font-weight:700;color:#FFFFFF;vertical-align:middle;">DESTRIA TECH INC</span>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px 0;font-size:15px;color:#FFFFFF;">Dear ${escapeHtml(clientName)},</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#CBD5E1;line-height:1.6;">
        Thank you for engaging with the <strong>DESTRIA TECH INC</strong> AI Front Desk. Your project requirements have been recorded under reference <strong style="color:#00C2C7;">${escapeHtml(referenceCode)}</strong>.
      </p>
      <div style="padding:14px 16px;background:#0B1220;border:1px solid #1E293B;border-radius:10px;margin-bottom:16px;font-size:13px;line-height:1.6;">
        <div><strong style="color:#94A3B8;">Project Focus:</strong> ${escapeHtml(projectName)}</div>
        <div><strong style="color:#94A3B8;">Confirmed Highlights:</strong> ${escapeHtml(confirmedFeatures.join(', ') || pr.businessProblem || 'Recorded in summary')}</div>
        <div><strong style="color:#94A3B8;">Consultation Status:</strong> ${escapeHtml(consultStatusText)}</div>
        <div><strong style="color:#94A3B8;">Meeting Instructions:</strong> ${escapeHtml(meetingInstructions)}</div>
      </div>
      <p style="margin:0 0 12px 0;font-size:13px;color:#CBD5E1;line-height:1.6;">
        <strong>Executive Commercial Consultation:</strong> Final project pricing, architecture, payment milestones, and implementation schedule are determined exclusively through authorized executive review during your consultation.
      </p>
      <p style="margin:0 0 12px 0;font-size:13px;color:#CBD5E1;line-height:1.6;">
        Need to update requirements, reschedule, or cancel? Contact <a href="mailto:${escapeHtml(corporateIdentity.contact.email)}" style="color:#00C2C7;">${escapeHtml(corporateIdentity.contact.email)}</a> or call <a href="${escapeHtml(corporateIdentity.contact.telephone.href)}" style="color:#00C2C7;">${escapeHtml(corporateIdentity.contact.telephone.display)}</a> with reference <strong>${escapeHtml(referenceCode)}</strong>.
      </p>
      <p style="margin:0;font-size:12px;color:#94A3B8;">${escapeHtml(corporateIdentity.legalName)} · ${escapeHtml(corporateIdentity.headquarters.fullAddress)}</p>
    </div>
  </div>
</body></html>`;

  return { subject, html, text };
}
