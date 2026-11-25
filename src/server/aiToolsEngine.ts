import crypto from 'crypto';
import { Behavior, FunctionDeclaration, Type } from '@google/genai';
import { corporateIdentity, COMMERCIAL_ENGAGEMENT_STATEMENT } from '../data/companyConfig';
import {
  CATALOG_CATEGORIES,
  SERVICE_CATALOG,
  formatCatalogEngagement,
} from '../data/serviceCatalog';
import {
  CORPORATE_KNOWLEDGE_VERSION,
  KnowledgeDomainId,
  retrieveCorporateKnowledge,
} from '../data/corporateKnowledgeBase';
import {
  VERIFIED_CORPORATE_RESOURCE_LINKS,
  enforceCommercialPolicyOnOutput,
} from './aiCommercialPolicy';
import { DatabaseRepository } from './db/types';
import { TransactionalEmailService } from './services/emailService';
import { GoogleCalendarService } from './services/calendarService';
import {
  ALLOWED_APPOINTMENT_SLOTS,
  sanitizePlainText,
  validateAppointmentPayload,
  validateInquiryPayload,
} from './validation';
import { isValidIanaTimezone } from './utils/timezoneUtc';
import { logStructured } from './logger';

/**
 * Authorized Server-Validated Gemini Function Calling Engine
 *
 * Implements all 12 required enterprise tools:
 *  1. get_corporate_information
 *  2. get_corporate_profile
 *  3. search_technology_solutions
 *  4. recommend_technology_solutions
 *  5. collect_project_requirements
 *  6. validate_client_information
 *  7. check_appointment_availability
 *  8. prepare_consultation_request
 *  9. submit_consultation_request
 * 10. prepare_service_inquiry
 * 11. submit_service_inquiry
 * 12. request_human_assistance
 *
 * Security & Governance Guarantees:
 * - Every argument validated server-side.
 * - Cross-session isolation on pending confirmation tokens.
 * - Explicit clientConfirmed === true required before submitting any consultation or service inquiry.
 * - Real database persistence + dual-recipient email notification (artaxsvcs@gmail.com, dhenze.languisan@gmail.com).
 * - Zero fabricated bookings or unauthorized pricing disclosures.
 */

export const REQUIRED_GEMINI_TOOL_NAMES = [
  'get_corporate_information',
  'get_corporate_profile',
  'search_technology_solutions',
  'recommend_technology_solutions',
  'collect_project_requirements',
  'validate_client_information',
  'check_appointment_availability',
  'prepare_consultation_request',
  'submit_consultation_request',
  'prepare_service_inquiry',
  'submit_service_inquiry',
  'request_human_assistance',
] as const;

export type GeminiToolName = (typeof REQUIRED_GEMINI_TOOL_NAMES)[number];

export interface PendingConfirmationPayload {
  confirmationToken: string;
  sessionId: string;
  kind: 'consultation_request' | 'service_inquiry';
  summary: Record<string, unknown>;
  validatedInput: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
}

export interface SessionRequirementsState {
  category?: string;
  businessProblem?: string;
  targetUsers?: string;
  keyFeatures: string[];
  existingSystems?: string;
  targetTimeline?: string;
  industry?: string;
  client: {
    fullName?: string;
    email?: string;
    phone?: string;
    companyName?: string;
  };
}

export interface ToolExecutionOutcome {
  ok: boolean;
  toolName: string;
  data: Record<string, unknown>;
  uiEvent?: {
    type:
      | 'prepared_consultation'
      | 'submitted_consultation'
      | 'prepared_inquiry'
      | 'submitted_inquiry'
      | 'resource_links'
      | 'human_assistance'
      | 'solutions_recommended';
    payload: Record<string, unknown>;
  };
}

const CONFIRMATION_TTL_MS = 15 * 60 * 1000;

export function getGeminiFunctionDeclarations(options?: {
  nonBlocking?: boolean;
}): FunctionDeclaration[] {
  const behaviorProp = options?.nonBlocking ? { behavior: Behavior.NON_BLOCKING } : {};

  return [
    {
      name: 'get_corporate_information',
      description:
        'Retrieves verified DESTRIA TECH INC corporate identity, leadership, headquarters, 8-layer architecture, governance policies, FAQs, or official contact details from the approved corporate knowledge repository.',
      ...behaviorProp,
      parameters: {
        type: Type.OBJECT,
        properties: {
          topic: {
            type: Type.STRING,
            description:
              'The corporate topic or question to look up (e.g., leadership, headquarters, architecture, governance, commercial policy, contacts).',
          },
          domain: {
            type: Type.STRING,
            description:
              'Optional specific domain filter such as corporate_identity, executive_leadership, enterprise_architecture, commercial_policy, official_contacts, or corporate_resources.',
          },
        },
        required: ['topic'],
      },
    },
    {
      name: 'get_corporate_profile',
      description:
        'Returns verified details and official view/download links for the 17-page DESTRIA TECH INC Official Corporate Profile PDF and the 8-page Corporate Summary and Enterprise Technology Services brochure.',
      ...behaviorProp,
      parameters: {
        type: Type.OBJECT,
        properties: {
          includeServicesBrochure: {
            type: Type.BOOLEAN,
            description: 'Whether to also include the 8-page Services Brochure PDF details.',
          },
        },
      },
    },
    {
      name: 'search_technology_solutions',
      description:
        'Searches the official 10-category DESTRIA TECH INC customized enterprise technology catalog by keyword or division. Never returns public pricing.',
      ...behaviorProp,
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: 'Search keywords describing the desired technology or capability.',
          },
          categoryId: {
            type: Type.STRING,
            description: 'Optional catalog category ID filter.',
          },
          limit: {
            type: Type.NUMBER,
            description: 'Maximum number of matching frameworks to return (1 to 6).',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'recommend_technology_solutions',
      description:
        'Recommends aligned customized enterprise technology solution frameworks based on the client business objectives, industry, and operational requirements. Zero pricing disclosed.',
      ...behaviorProp,
      parameters: {
        type: Type.OBJECT,
        properties: {
          businessObjective: {
            type: Type.STRING,
            description: 'The organization operational goal or problem to solve.',
          },
          industry: {
            type: Type.STRING,
            description: 'Client industry sector if known.',
          },
          existingSystems: {
            type: Type.STRING,
            description: 'Existing platforms, ERP, CRM, or APIs to integrate with.',
          },
          preferredDivision: {
            type: Type.STRING,
            description: 'Preferred service category or technology area if specified.',
          },
        },
        required: ['businessObjective'],
      },
    },
    {
      name: 'collect_project_requirements',
      description:
        'Records structured project discovery requirements into the active consultation session so the assistant remembers context and never asks for the same details twice.',
      ...behaviorProp,
      parameters: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING, description: 'Primary solution category or service area.' },
          businessProblem: { type: Type.STRING, description: 'Core operational challenge or business goal.' },
          targetUsers: { type: Type.STRING, description: 'Intended users and estimated scale.' },
          keyFeatures: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Requested capabilities or modules.',
          },
          existingSystems: { type: Type.STRING, description: 'Existing systems or integrations.' },
          targetTimeline: { type: Type.STRING, description: 'Target delivery window or urgency.' },
          industry: { type: Type.STRING, description: 'Client industry.' },
        },
      },
    },
    {
      name: 'validate_client_information',
      description:
        'Validates prospective client contact information (fullName, email, phone, companyName) server-side and stores valid values in the active session.',
      ...behaviorProp,
      parameters: {
        type: Type.OBJECT,
        properties: {
          fullName: { type: Type.STRING, description: 'Client full name.' },
          email: { type: Type.STRING, description: 'Client business or personal email address.' },
          phone: { type: Type.STRING, description: 'Client telephone or mobile contact number.' },
          companyName: { type: Type.STRING, description: 'Client company or organization name.' },
        },
      },
    },
    {
      name: 'check_appointment_availability',
      description:
        'Checks actual booked and available executive consultation slots for a specific date (YYYY-MM-DD) directly against the backend scheduling database. Never invents availability.',
      ...behaviorProp,
      parameters: {
        type: Type.OBJECT,
        properties: {
          date: {
            type: Type.STRING,
            description: 'Requested consultation date in YYYY-MM-DD format.',
          },
          timezone: {
            type: Type.STRING,
            description: 'Valid IANA timezone such as America/Denver, America/New_York, or Asia/Manila.',
          },
        },
        required: ['date'],
      },
    },
    {
      name: 'prepare_consultation_request',
      description:
        'Validates and prepares a consultation request summary and issues a session-scoped confirmationToken. Does NOT submit or book yet; you MUST read the summary back and get explicit client confirmation before calling submit_consultation_request.',
      ...behaviorProp,
      parameters: {
        type: Type.OBJECT,
        properties: {
          fullName: { type: Type.STRING, description: 'Client full name.' },
          email: { type: Type.STRING, description: 'Client email address.' },
          phone: { type: Type.STRING, description: 'Client phone number.' },
          companyName: { type: Type.STRING, description: 'Client company or organization.' },
          scheduledDate: { type: Type.STRING, description: 'Preferred date in YYYY-MM-DD format.' },
          scheduledTimeSlot: {
            type: Type.STRING,
            description: `Preferred slot from: ${ALLOWED_APPOINTMENT_SLOTS.join(', ')}`,
          },
          clientTimezone: { type: Type.STRING, description: 'Client IANA timezone (e.g., Asia/Manila, America/Denver).' },
          consultationType: {
            type: Type.STRING,
            description: 'Format: video, phone, or in_person.',
          },
          executivePathway: {
            type: Type.STRING,
            description: 'Executive track: ceo, cto, or advisory.',
          },
          selectedSolution: { type: Type.STRING, description: 'Solution focus area.' },
          consultationPurpose: { type: Type.STRING, description: 'Primary objective of the consultation.' },
          notes: { type: Type.STRING, description: 'Additional technical notes.' },
        },
        required: ['fullName', 'email', 'scheduledDate', 'scheduledTimeSlot'],
      },
    },
    {
      name: 'submit_consultation_request',
      description:
        'Submits a previously prepared executive consultation request to the real backend database and sends automated dual-recipient notifications ONLY AFTER explicit client confirmation.',
      ...behaviorProp,
      parameters: {
        type: Type.OBJECT,
        properties: {
          confirmationToken: {
            type: Type.STRING,
            description: 'The confirmationToken returned by prepare_consultation_request in this same session.',
          },
          clientConfirmed: {
            type: Type.BOOLEAN,
            description: 'Must be strictly true ONLY after the client explicitly confirms the prepared summary.',
          },
          sourceChannel: {
            type: Type.STRING,
            description: 'Origin channel: AI Voice or AI Chat.',
          },
        },
        required: ['confirmationToken', 'clientConfirmed'],
      },
    },
    {
      name: 'prepare_service_inquiry',
      description:
        'Validates and prepares a customized service inquiry summary and issues a session-scoped confirmationToken. Does NOT submit yet; you MUST present the summary and obtain explicit client confirmation before calling submit_service_inquiry.',
      ...behaviorProp,
      parameters: {
        type: Type.OBJECT,
        properties: {
          fullName: { type: Type.STRING, description: 'Client full name.' },
          email: { type: Type.STRING, description: 'Client email address.' },
          contactNumber: { type: Type.STRING, description: 'Client phone/contact number.' },
          company: { type: Type.STRING, description: 'Organization or company name.' },
          industry: { type: Type.STRING, description: 'Client industry sector.' },
          targetTimeline: { type: Type.STRING, description: 'Target delivery timeline.' },
          serviceTitle: { type: Type.STRING, description: 'Primary technology solution or division requested.' },
          selectedServiceIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Optional matching catalog service IDs.',
          },
          projectDescription: { type: Type.STRING, description: 'Summary of project objectives and requirements.' },
        },
        required: ['fullName', 'email', 'projectDescription'],
      },
    },
    {
      name: 'submit_service_inquiry',
      description:
        'Submits a previously prepared service inquiry to the real backend database and dispatches automated dual-recipient email notifications ONLY AFTER explicit client confirmation.',
      ...behaviorProp,
      parameters: {
        type: Type.OBJECT,
        properties: {
          confirmationToken: {
            type: Type.STRING,
            description: 'The confirmationToken returned by prepare_service_inquiry in this same session.',
          },
          clientConfirmed: {
            type: Type.BOOLEAN,
            description: 'Must be strictly true ONLY after the client explicitly confirms submission.',
          },
          sourceChannel: {
            type: Type.STRING,
            description: 'Origin channel: AI Voice or AI Chat.',
          },
        },
        required: ['confirmationToken', 'clientConfirmed'],
      },
    },
    {
      name: 'request_human_assistance',
      description:
        'Provides official direct human escalation channels (corporate telephone, email, and executive consultation desk) and logs an escalation request when the client asks to speak with a human representative or solutions architect.',
      ...behaviorProp,
      parameters: {
        type: Type.OBJECT,
        properties: {
          reason: { type: Type.STRING, description: 'Brief reason the client requested human assistance.' },
          preferredContactMethod: {
            type: Type.STRING,
            description: 'Preferred method: telephone, email, or scheduled_consultation.',
          },
          clientEmail: { type: Type.STRING, description: 'Optional client email if already provided.' },
        },
        required: ['reason'],
      },
    },
  ];
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function matchCatalogServicesForTools(query: string, categoryId?: string, limit = 4) {
  const q = query.trim().toLowerCase();
  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const pool =
    categoryId && categoryId !== 'all'
      ? SERVICE_CATALOG.filter((s) => s.categoryId === categoryId)
      : SERVICE_CATALOG;

  return pool
    .map((svc) => {
      const hay = `${svc.title} ${svc.shortDescription} ${svc.capabilities.join(' ')} ${svc.categoryId}`.toLowerCase();
      let score = 0;
      for (const tok of tokens) {
        if (svc.title.toLowerCase().includes(tok)) score += 5;
        else if (hay.includes(tok)) score += 2;
      }
      return { svc, score };
    })
    .filter((entry) => entry.score > 0 || (categoryId && pool.length > 0))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(6, limit)))
    .map((entry) => entry.svc);
}

export class AIToolsExecutor {
  private readonly pendingConfirmations = new Map<string, PendingConfirmationPayload>();
  private readonly sessionRequirements = new Map<string, SessionRequirementsState>();

  constructor(
    private readonly db: DatabaseRepository,
    private readonly emailService: TransactionalEmailService,
    private readonly calendarService: GoogleCalendarService
  ) {}

  private pruneExpiredConfirmations() {
    const now = Date.now();
    for (const [token, item] of this.pendingConfirmations.entries()) {
      if (now > item.expiresAt) {
        this.pendingConfirmations.delete(token);
      }
    }
  }

  public getSessionRequirements(sessionId: string): SessionRequirementsState {
    let state = this.sessionRequirements.get(sessionId);
    if (!state) {
      state = { keyFeatures: [], client: {} };
      this.sessionRequirements.set(sessionId, state);
      if (this.sessionRequirements.size > 500) {
        const oldest = this.sessionRequirements.keys().next().value;
        if (oldest) this.sessionRequirements.delete(oldest);
      }
    }
    return state;
  }

  public getPendingConfirmation(
    sessionId: string,
    confirmationToken: string
  ): PendingConfirmationPayload | null {
    this.pruneExpiredConfirmations();
    const record = this.pendingConfirmations.get(confirmationToken);
    if (!record) return null;
    // Strict cross-session isolation
    if (record.sessionId !== sessionId) return null;
    return record;
  }

  public async executeTool(
    sessionId: string,
    toolName: string,
    rawArgs: Record<string, unknown> = {},
    meta?: { correlationId?: string; sourceChannel?: 'AI Voice' | 'AI Chat' }
  ): Promise<ToolExecutionOutcome> {
    this.pruneExpiredConfirmations();
    const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
    const correlationId = meta?.correlationId || `tool-${crypto.randomUUID().slice(0, 8)}`;

    try {
      switch (toolName) {
        case 'get_corporate_information':
          return this.handleGetCorporateInformation(args);

        case 'get_corporate_profile':
          return this.handleGetCorporateProfile(args);

        case 'search_technology_solutions':
          return this.handleSearchTechnologySolutions(args);

        case 'recommend_technology_solutions':
          return this.handleRecommendTechnologySolutions(sessionId, args);

        case 'collect_project_requirements':
          return this.handleCollectProjectRequirements(sessionId, args);

        case 'validate_client_information':
          return this.handleValidateClientInformation(sessionId, args);

        case 'check_appointment_availability':
          return await this.handleCheckAppointmentAvailability(args);

        case 'prepare_consultation_request':
          return await this.handlePrepareConsultationRequest(sessionId, args);

        case 'submit_consultation_request':
          return await this.handleSubmitConsultationRequest(sessionId, args, correlationId, meta?.sourceChannel);

        case 'prepare_service_inquiry':
          return this.handlePrepareServiceInquiry(sessionId, args);

        case 'submit_service_inquiry':
          return await this.handleSubmitServiceInquiry(sessionId, args, correlationId, meta?.sourceChannel);

        case 'request_human_assistance':
          return await this.handleRequestHumanAssistance(sessionId, args, correlationId);

        default:
          return {
            ok: false,
            toolName,
            data: { error: `Unauthorized or unknown tool "${sanitizePlainText(toolName, 80)}".` },
          };
      }
    } catch (err: any) {
      logStructured('error', 'ai_tool_execution_error', {
        correlationId,
        sessionId,
        toolName,
        error: err?.message,
      });
      return {
        ok: false,
        toolName,
        data: {
          error: 'The requested enterprise operation could not be completed right now. Please retry or coordinate directly with our team.',
        },
      };
    }
  }

  private handleGetCorporateInformation(args: Record<string, unknown>): ToolExecutionOutcome {
    const topic = sanitizePlainText(args.topic, 300) || 'corporate identity';
    const domain = sanitizePlainText(args.domain, 60) as KnowledgeDomainId | '';
    const hits = retrieveCorporateKnowledge(topic, {
      topK: 3,
      domain: domain || undefined,
    });

    const entries = hits.map((h) => ({
      domain: h.entry.domain,
      title: h.entry.title,
      summary: enforceCommercialPolicyOnOutput(h.entry.summary, topic).replyText,
      facts: h.entry.facts.map((f) => enforceCommercialPolicyOnOutput(f, topic).replyText),
      links: h.entry.canonicalLinks || [],
    }));

    return {
      ok: true,
      toolName: 'get_corporate_information',
      data: {
        knowledgeVersion: CORPORATE_KNOWLEDGE_VERSION,
        legalName: corporateIdentity.legalName,
        networkName: corporateIdentity.networkName,
        matchedEntries: entries,
        commercialPolicyNotice: COMMERCIAL_ENGAGEMENT_STATEMENT,
      },
    };
  }

  private handleGetCorporateProfile(args: Record<string, unknown>): ToolExecutionOutcome {
    const includeBrochure = args.includeServicesBrochure !== false;
    const links = includeBrochure
      ? [...VERIFIED_CORPORATE_RESOURCE_LINKS]
      : VERIFIED_CORPORATE_RESOURCE_LINKS.filter((l) => l.id === 'destria-corporate-profile');

    return {
      ok: true,
      toolName: 'get_corporate_profile',
      data: {
        legalName: corporateIdentity.legalName,
        leadership: {
          ceo: `${corporateIdentity.leadership.ceo.name} — ${corporateIdentity.leadership.ceo.title}`,
          cto: `${corporateIdentity.leadership.cto.name} — ${corporateIdentity.leadership.cto.title}`,
        },
        headquarters: corporateIdentity.headquarters.fullAddress,
        resourcesCenterUrl: 'https://destriatech.com/resources',
        corporateProfilePageUrl: 'https://destriatech.com/corporate-profile',
        documents: links,
      },
      uiEvent: {
        type: 'resource_links',
        payload: { resourceLinks: links },
      },
    };
  }

  private handleSearchTechnologySolutions(args: Record<string, unknown>): ToolExecutionOutcome {
    const query = sanitizePlainText(args.query, 240);
    const categoryId = sanitizePlainText(args.categoryId, 60) || undefined;
    const limit = Number.isFinite(Number(args.limit)) ? Number(args.limit) : 4;

    if (!query && !categoryId) {
      return {
        ok: true,
        toolName: 'search_technology_solutions',
        data: {
          categories: CATALOG_CATEGORIES.filter((c) => c.id !== 'all').map((c) => ({
            id: c.id,
            number: c.number,
            label: c.label,
          })),
          commercialPolicy: COMMERCIAL_ENGAGEMENT_STATEMENT,
        },
      };
    }

    const matches = matchCatalogServicesForTools(query, categoryId, limit);
    return {
      ok: true,
      toolName: 'search_technology_solutions',
      data: {
        query,
        matchCount: matches.length,
        solutions: matches.map((s) => ({
          id: s.id,
          title: s.title,
          categoryId: s.categoryId,
          shortDescription: s.shortDescription,
          engagementLabel: formatCatalogEngagement(s).primaryLabel,
          assessmentBasis: s.engagement.assessmentBasis,
          capabilities: s.capabilities.slice(0, 4),
        })),
        commercialPolicy: COMMERCIAL_ENGAGEMENT_STATEMENT,
      },
      uiEvent:
        matches.length > 0
          ? {
              type: 'solutions_recommended',
              payload: { recommendedServiceIds: matches.map((m) => m.id) },
            }
          : undefined,
    };
  }

  private handleRecommendTechnologySolutions(
    sessionId: string,
    args: Record<string, unknown>
  ): ToolExecutionOutcome {
    const objective = sanitizePlainText(
      args.businessObjective ?? args.businessObjectives,
      500
    );
    const industry = sanitizePlainText(args.industry, 120);
    const existingSystems = sanitizePlainText(args.existingSystems, 240);
    const preferredDivision = sanitizePlainText(args.preferredDivision, 120);

    const searchText = [objective, preferredDivision, industry, existingSystems].filter(Boolean).join(' ');
    const matches = matchCatalogServicesForTools(searchText, undefined, 3);

    const state = this.getSessionRequirements(sessionId);
    if (objective && !state.businessProblem) state.businessProblem = objective;
    if (industry) state.industry = industry;
    if (existingSystems) state.existingSystems = existingSystems;
    if (matches[0] && !state.category) state.category = matches[0].title;

    return {
      ok: true,
      toolName: 'recommend_technology_solutions',
      data: {
        recommendations: matches.map((s) => ({
          id: s.id,
          title: s.title,
          categoryId: s.categoryId,
          engagementLabel: formatCatalogEngagement(s).primaryLabel,
          assessmentBasis: s.engagement.assessmentBasis,
          summary: s.shortDescription,
          keyCapabilities: s.capabilities.slice(0, 4),
        })),
        commercialNotice: COMMERCIAL_ENGAGEMENT_STATEMENT,
        recommendedNextStep:
          'Confirm key functional modules, system integrations, and target delivery timeline, or prepare a formal consultation request.',
      },
      uiEvent:
        matches.length > 0
          ? {
              type: 'solutions_recommended',
              payload: { recommendedServiceIds: matches.map((m) => m.id) },
            }
          : undefined,
    };
  }

  private handleCollectProjectRequirements(
    sessionId: string,
    args: Record<string, unknown>
  ): ToolExecutionOutcome {
    const state = this.getSessionRequirements(sessionId);
    if (args.category) state.category = sanitizePlainText(args.category, 140);
    if (args.businessProblem) state.businessProblem = sanitizePlainText(args.businessProblem, 600);
    if (args.targetUsers) state.targetUsers = sanitizePlainText(args.targetUsers, 200);
    if (args.existingSystems) state.existingSystems = sanitizePlainText(args.existingSystems, 300);
    if (args.targetTimeline) state.targetTimeline = sanitizePlainText(args.targetTimeline, 120);
    if (args.industry) state.industry = sanitizePlainText(args.industry, 120);
    if (Array.isArray(args.keyFeatures)) {
      const incoming = args.keyFeatures
        .map((f) => sanitizePlainText(f, 120))
        .filter(Boolean);
      const merged = Array.from(new Set([...state.keyFeatures, ...incoming])).slice(0, 12);
      state.keyFeatures = merged;
    }

    const capturedRequirements = {
      category: state.category || null,
      businessProblem: state.businessProblem || null,
      targetUsers: state.targetUsers || null,
      keyFeatures: state.keyFeatures,
      existingSystems: state.existingSystems || null,
      targetTimeline: state.targetTimeline || null,
      industry: state.industry || null,
    };

    return {
      ok: true,
      toolName: 'collect_project_requirements',
      data: {
        requirements: capturedRequirements,
        capturedRequirements,
        note: 'Requirements recorded in active session context.',
      },
    };
  }

  private handleValidateClientInformation(
    sessionId: string,
    args: Record<string, unknown>
  ): ToolExecutionOutcome {
    const fullName = sanitizePlainText(args.fullName, 120);
    const email = sanitizePlainText(args.email, 180).toLowerCase();
    const phone = sanitizePlainText(args.phone, 40);
    const companyName = sanitizePlainText(args.companyName, 140);

    const errors: string[] = [];
    if (fullName && fullName.length < 2) errors.push('Full name must be at least 2 characters.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      errors.push('Email address does not appear to be valid.');
    }
    if (phone && !/^[\d\s+\-().]{7,30}$/.test(phone)) {
      errors.push('Phone number should contain 7 to 30 valid telephone characters.');
    }

    const state = this.getSessionRequirements(sessionId);
    if (errors.length === 0) {
      if (fullName) state.client.fullName = fullName;
      if (email) state.client.email = email;
      if (phone) state.client.phone = phone;
      if (companyName) state.client.companyName = companyName;
    }

    const missingForSubmission: string[] = [];
    if (!state.client.fullName) missingForSubmission.push('fullName');
    if (!state.client.email) missingForSubmission.push('email');

    return {
      ok: errors.length === 0,
      toolName: 'validate_client_information',
      data: {
        valid: errors.length === 0,
        validationErrors: errors,
        storedClientInfo: { ...state.client },
        missingRequiredFields: missingForSubmission,
      },
    };
  }

  private async handleCheckAppointmentAvailability(
    args: Record<string, unknown>
  ): Promise<ToolExecutionOutcome> {
    const dateStr = sanitizePlainText(args.date, 20);
    const rawTz = sanitizePlainText(args.timezone, 60);
    const timezone = rawTz && isValidIanaTimezone(rawTz) ? rawTz : 'America/Denver';

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return {
        ok: false,
        toolName: 'check_appointment_availability',
        data: { error: 'Please specify a valid date in YYYY-MM-DD format.' },
      };
    }

    try {
      const bookedSlots = await this.db.getBookedSlotsForDate(dateStr);
      const availableSlots = ALLOWED_APPOINTMENT_SLOTS.filter((slot) => !bookedSlots.includes(slot));
      return {
        ok: true,
        toolName: 'check_appointment_availability',
        data: {
          date: dateStr,
          timezone,
          availabilityVerified: true,
          calendarConfigured: this.calendarService.isConfigured(),
          bookedSlots,
          availableSlots,
        },
      };
    } catch {
      return {
        ok: true,
        toolName: 'check_appointment_availability',
        data: {
          date: dateStr,
          timezone,
          availabilityVerified: false,
          calendarConfigured: false,
          bookedSlots: [],
          availableSlots: [...ALLOWED_APPOINTMENT_SLOTS],
          warning:
            'Live scheduling availability could not be verified at this moment. Requests can still be submitted as Pending Scheduling Confirmation.',
        },
      };
    }
  }

  private async handlePrepareConsultationRequest(
    sessionId: string,
    args: Record<string, unknown>
  ): Promise<ToolExecutionOutcome> {
    const state = this.getSessionRequirements(sessionId);
    const candidatePayload = {
      fullName: sanitizePlainText(args.fullName, 120) || state.client.fullName || '',
      email: (sanitizePlainText(args.email, 180) || state.client.email || '').toLowerCase(),
      phone: sanitizePlainText(args.phone, 40) || state.client.phone || '',
      companyName: sanitizePlainText(args.companyName, 140) || state.client.companyName || 'Not Provided',
      scheduledDate: sanitizePlainText(args.scheduledDate, 20),
      scheduledTimeSlot: sanitizePlainText(args.scheduledTimeSlot, 20),
      clientTimezone: sanitizePlainText(args.clientTimezone, 60) || 'America/Denver',
      consultationType: sanitizePlainText(args.consultationType, 20) || 'video',
      executivePathway: sanitizePlainText(args.executivePathway, 20) || 'advisory',
      selectedSolution:
        sanitizePlainText(args.selectedSolution, 160) ||
        state.category ||
        'Customized Enterprise Technology Solution',
      consultationPurpose:
        sanitizePlainText(args.consultationPurpose, 400) ||
        state.businessProblem ||
        'Executive technical consultation and architecture assessment.',
      notes: sanitizePlainText(args.notes, 600),
      privacyConsent: true,
      commercialPolicyConsent: true,
    };

    const validated = validateAppointmentPayload(candidatePayload);
    if (validated.ok === false) {
      return {
        ok: false,
        toolName: 'prepare_consultation_request',
        data: {
          error: validated.error,
          allowedTimeSlots: [...ALLOWED_APPOINTMENT_SLOTS],
        },
      };
    }

    // Check real DB slot conflicts before preparing
    let availabilityVerified = false;
    try {
      const bookedSlots = await this.db.getBookedSlotsForDate(validated.data.scheduledDate);
      availabilityVerified = true;
      if (bookedSlots.includes(validated.data.scheduledTimeSlot)) {
        const alternatives = ALLOWED_APPOINTMENT_SLOTS.filter((s) => !bookedSlots.includes(s));
        return {
          ok: false,
          toolName: 'prepare_consultation_request',
          data: {
            code: 'SLOT_CONFLICT',
            error: `The slot ${validated.data.scheduledTimeSlot} on ${validated.data.scheduledDate} is already reserved.`,
            availableSlots: alternatives,
          },
        };
      }
    } catch {
      availabilityVerified = false;
    }

    const confirmationToken = `dti-cfm-apt-${crypto.randomBytes(12).toString('hex')}`;
    const summary = {
      fullName: validated.data.fullName,
      email: validated.data.email,
      phone: validated.data.phone || 'Not provided',
      companyName: validated.data.companyName,
      executivePathway: validated.data.executivePathway,
      consultationType: validated.data.consultationType,
      selectedSolution: validated.data.selectedSolution,
      scheduledDate: validated.data.scheduledDate,
      scheduledTimeSlot: validated.data.scheduledTimeSlot,
      clientTimezone: validated.data.clientTimezone,
      availabilityVerified,
    };

    const now = Date.now();
    this.pendingConfirmations.set(confirmationToken, {
      confirmationToken,
      sessionId,
      kind: 'consultation_request',
      summary,
      validatedInput: {
        ...candidatePayload,
        availabilityVerified,
      },
      createdAt: now,
      expiresAt: now + CONFIRMATION_TTL_MS,
    });

    return {
      ok: true,
      toolName: 'prepare_consultation_request',
      data: {
        status: 'awaiting_client_confirmation',
        requiresExplicitClientConfirmation: true,
        confirmationToken,
        summary,
        instructionForAssistant:
          'Read the prepared consultation details back to the client and ask for explicit confirmation before calling submit_consultation_request.',
      },
      uiEvent: {
        type: 'prepared_consultation',
        payload: {
          confirmationToken,
          summary,
        },
      },
    };
  }

  private async handleSubmitConsultationRequest(
    sessionId: string,
    args: Record<string, unknown>,
    correlationId: string,
    defaultChannel?: 'AI Voice' | 'AI Chat'
  ): Promise<ToolExecutionOutcome> {
    const confirmationToken = sanitizePlainText(args.confirmationToken, 120);
    const clientConfirmed = args.clientConfirmed === true;

    if (!clientConfirmed) {
      return {
        ok: false,
        toolName: 'submit_consultation_request',
        data: {
          code: 'EXPLICIT_CONFIRMATION_REQUIRED',
          error:
            'Explicit client confirmation (clientConfirmed: true) is strictly required before submitting a consultation request.',
        },
      };
    }

    const pending = this.getPendingConfirmation(sessionId, confirmationToken);
    if (!pending || pending.kind !== 'consultation_request') {
      return {
        ok: false,
        toolName: 'submit_consultation_request',
        data: {
          code: 'INVALID_OR_EXPIRED_CONFIRMATION_TOKEN',
          error:
            'No valid prepared consultation request was found for this session. Please prepare the request and confirm details first.',
        },
      };
    }

    const sourceChannel =
      args.sourceChannel === 'AI Chat' || args.sourceChannel === 'AI Voice'
        ? args.sourceChannel
        : defaultChannel || 'AI Voice';

    const validated = validateAppointmentPayload({
      ...pending.validatedInput,
      sourceChannel,
      idempotencyKey: `tool-${confirmationToken}`,
    });
    if (validated.ok === false) {
      return {
        ok: false,
        toolName: 'submit_consultation_request',
        data: { error: validated.error },
      };
    }

    // Consume single-use confirmation token immediately prior to persistence to prevent replay races
    this.pendingConfirmations.delete(confirmationToken);

    const data = validated.data;
    const referenceCode = `OPM-APT-${new Date().getFullYear()}-${crypto
      .randomBytes(3)
      .toString('hex')
      .toUpperCase()}`;
    const managementToken = crypto.randomBytes(16).toString('hex');
    const managementTokenHash = hashToken(managementToken);

    const officeLocation =
      data.consultationType === 'in_person'
        ? `Executive Briefing (By Prior Arrangement — Corporate Reference: ${corporateIdentity.headquarters.fullAddress})`
        : undefined;

    const calResult = await this.calendarService.createConsultationEvent({
      referenceCode,
      fullName: data.fullName,
      email: data.email,
      companyName: data.companyName,
      consultationType: data.consultationType,
      scheduledDate: data.scheduledDate,
      scheduledTimeSlot: data.scheduledTimeSlot,
      clientTimezone: data.clientTimezone,
      location: officeLocation,
      correlationId,
    });

    const status: 'confirmed' | 'pending_review' =
      calResult.synced && data.availabilityVerified ? 'confirmed' : 'pending_review';

    const assignedConsultant =
      data.executivePathway === 'ceo'
        ? `${corporateIdentity.leadership.ceo.name} — ${corporateIdentity.leadership.ceo.title}`
        : data.executivePathway === 'cto'
        ? `${corporateIdentity.leadership.cto.name} — ${corporateIdentity.leadership.cto.title}`
        : 'DESTRIA TECH INC Solutions Architecture Team';

    const appointmentInput = {
      referenceCode,
      idempotencyKey: data.idempotencyKey,
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      companyName: data.companyName,
      briefReferenceCode: data.briefReferenceCode,
      executivePathway: data.executivePathway,
      consultationType: data.consultationType,
      consultationPurpose: data.consultationPurpose,
      selectedSolution: data.selectedSolution,
      scheduledDate: data.scheduledDate,
      scheduledTimeSlot: data.scheduledTimeSlot,
      utcScheduledAt: data.utcScheduledAt,
      durationMinutes: 30,
      clientTimezone: data.clientTimezone,
      meetingLink: calResult.synced ? calResult.meetingLink : undefined,
      meetingLocation: officeLocation,
      assignedConsultant,
      status,
      calendarSyncStatus: calResult.calendarSyncStatus,
      calendarEventId: calResult.eventId,
      managementTokenHash,
      sourceChannel,
      availabilityVerified: data.availabilityVerified,
      notes: data.notes,
    };

    const previewNow = new Date().toISOString();
    const plannedOutbox = this.emailService.buildAppointmentOutboxInputs(
      { ...appointmentInput, id: '', createdAt: previewNow, updatedAt: previewNow },
      correlationId,
      'requested'
    );

    let record: Awaited<ReturnType<typeof this.db.createAppointment>>['record'];
    let created: boolean;
    let prePersistedOutbox:
      | Awaited<ReturnType<NonNullable<typeof this.db.createAppointmentWithOutbox>>>['outboxRecords']
      | undefined;

    if (this.db.createAppointmentWithOutbox) {
      const atomic = await this.db.createAppointmentWithOutbox(appointmentInput, plannedOutbox.items);
      record = atomic.record;
      created = atomic.created;
      prePersistedOutbox = atomic.outboxRecords;
    } else {
      const legacy = await this.db.createAppointment(appointmentInput);
      record = legacy.record;
      created = legacy.created;
    }

    let emailOutcome;
    if (created) {
      if (prePersistedOutbox && prePersistedOutbox.length > 0) {
        emailOutcome = await this.emailService.dispatchPersistedAppointmentOutbox(
          record.referenceCode,
          prePersistedOutbox,
          plannedOutbox.dualConfig.executiveConsultation.enabled,
          correlationId
        );
      } else {
        emailOutcome = await this.emailService.enqueueAndSendAppointmentEmails(record, correlationId);
      }

      await this.db
        .writeAuditLog({
          correlationId,
          actor: 'ai_tool_client_confirmed',
          actorRole: 'client',
          action: 'consultation_requested_via_ai_tool',
          entityType: 'consultation_appointments',
          entityId: record.referenceCode,
          details: {
            sessionId,
            sourceChannel,
            status: record.status,
            notifiedRecipientsCount: emailOutcome.notifiedRecipientsCount,
          },
        })
        .catch(() => {});
    } else {
      emailOutcome = await this.emailService.getPersistedDeliveryOutcome('appointment', record.referenceCode);
    }

    // Consume token after successful submission
    this.pendingConfirmations.delete(confirmationToken);

    const confirmationMessage =
      record.status === 'confirmed'
        ? `Your executive consultation has been confirmed under reference ${record.referenceCode}.`
        : `Your consultation request has been registered under reference ${record.referenceCode}. The requested window remains subject to availability and formal confirmation by our authorized team.`;

    return {
      ok: true,
      toolName: 'submit_consultation_request',
      data: {
        submitted: true,
        referenceCode: record.referenceCode,
        status: record.status,
        scheduledDate: record.scheduledDate,
        scheduledTimeSlot: record.scheduledTimeSlot,
        clientTimezone: record.clientTimezone,
        assignedConsultant: record.assignedConsultant,
        confirmationMessage,
        emailDeliveryStatus: emailOutcome.overallStatus,
        notifiedRecipientsCount: emailOutcome.notifiedRecipientsCount,
      },
      uiEvent: {
        type: 'submitted_consultation',
        payload: {
          referenceCode: record.referenceCode,
          status: record.status,
          scheduledDate: record.scheduledDate,
          scheduledTimeSlot: record.scheduledTimeSlot,
          clientTimezone: record.clientTimezone,
          consultationType: record.consultationType,
          confirmationMessage,
        },
      },
    };
  }

  private handlePrepareServiceInquiry(
    sessionId: string,
    args: Record<string, unknown>
  ): ToolExecutionOutcome {
    const state = this.getSessionRequirements(sessionId);
    const serviceTitle =
      sanitizePlainText(args.serviceTitle, 160) ||
      state.category ||
      'Customized Enterprise Technology Solution';
    let selectedServiceIds = Array.isArray(args.selectedServiceIds)
      ? args.selectedServiceIds
          .map((id) => sanitizePlainText(id, 80))
          .filter((id) => SERVICE_CATALOG.some((s) => s.id === id))
      : [];

    // Resolve canonical catalog service IDs when caller provides serviceTitle/category without explicit IDs
    if (selectedServiceIds.length === 0 && serviceTitle) {
      const normalizedTitle = serviceTitle.toLowerCase();
      const matchedCategory = CATALOG_CATEGORIES.find(
        (cat) =>
          cat.id !== 'all' &&
          (cat.label.toLowerCase().includes(normalizedTitle) ||
            normalizedTitle.includes(cat.label.toLowerCase()) ||
            normalizedTitle.includes(cat.id.toLowerCase()))
      );
      const matchedService =
        SERVICE_CATALOG.find(
          (svc) =>
            svc.id.toLowerCase() === normalizedTitle ||
            svc.title.toLowerCase().includes(normalizedTitle) ||
            normalizedTitle.includes(svc.title.toLowerCase())
        ) ||
        (matchedCategory
          ? SERVICE_CATALOG.find((svc) => svc.categoryId === matchedCategory.id)
          : undefined);
      if (matchedService) {
        selectedServiceIds = [matchedService.id];
      }
    }

    const candidatePayload = {
      type: selectedServiceIds.length > 0 ? 'solution_builder' : 'contact_inquiry',
      fullName: sanitizePlainText(args.fullName, 120) || state.client.fullName || '',
      email: (sanitizePlainText(args.email, 180) || state.client.email || '').toLowerCase(),
      contactNumber: sanitizePlainText(args.contactNumber, 40) || state.client.phone || '',
      company: sanitizePlainText(args.company, 140) || state.client.companyName || '',
      industry: sanitizePlainText(args.industry, 120) || state.industry || '',
      targetTimeline: sanitizePlainText(args.targetTimeline, 120) || state.targetTimeline || '',
      serviceTitle,
      selectedServiceIds,
      projectDescription:
        sanitizePlainText(args.projectDescription, 2000) || state.businessProblem || '',
      privacyConsent: true,
      commercialPolicyConsent: true,
    };

    const validated = validateInquiryPayload(candidatePayload);
    if (validated.ok === false) {
      return {
        ok: false,
        toolName: 'prepare_service_inquiry',
        data: { error: validated.error },
      };
    }

    const confirmationToken = `dti-cfm-inq-${crypto.randomBytes(12).toString('hex')}`;
    const summary = {
      fullName: validated.data.fullName,
      email: validated.data.email,
      contactNumber: validated.data.contactNumber || 'Not provided',
      company: validated.data.company || 'Not provided',
      industry: validated.data.industry || 'Not specified',
      targetTimeline: validated.data.targetTimeline || 'To be determined during assessment',
      serviceTitle: validated.data.serviceTitle,
      projectDescription: validated.data.projectDescription,
      commercialStatus: 'Subject to Formal Assessment',
    };

    const now = Date.now();
    this.pendingConfirmations.set(confirmationToken, {
      confirmationToken,
      sessionId,
      kind: 'service_inquiry',
      summary,
      validatedInput: candidatePayload,
      createdAt: now,
      expiresAt: now + CONFIRMATION_TTL_MS,
    });

    return {
      ok: true,
      toolName: 'prepare_service_inquiry',
      data: {
        status: 'awaiting_client_confirmation',
        requiresExplicitClientConfirmation: true,
        confirmationToken,
        summary,
        instructionForAssistant:
          'Summarize these service inquiry details to the client and obtain explicit confirmation before calling submit_service_inquiry.',
      },
      uiEvent: {
        type: 'prepared_inquiry',
        payload: {
          confirmationToken,
          summary,
        },
      },
    };
  }

  private async handleSubmitServiceInquiry(
    sessionId: string,
    args: Record<string, unknown>,
    correlationId: string,
    defaultChannel?: 'AI Voice' | 'AI Chat'
  ): Promise<ToolExecutionOutcome> {
    const confirmationToken = sanitizePlainText(args.confirmationToken, 120);
    const clientConfirmed = args.clientConfirmed === true;

    if (!clientConfirmed) {
      return {
        ok: false,
        toolName: 'submit_service_inquiry',
        data: {
          code: 'EXPLICIT_CONFIRMATION_REQUIRED',
          error:
            'Explicit client confirmation (clientConfirmed: true) is strictly required before submitting a service inquiry.',
        },
      };
    }

    const pending = this.getPendingConfirmation(sessionId, confirmationToken);
    if (!pending || pending.kind !== 'service_inquiry') {
      return {
        ok: false,
        toolName: 'submit_service_inquiry',
        data: {
          code: 'INVALID_OR_EXPIRED_CONFIRMATION_TOKEN',
          error:
            'No valid prepared service inquiry was found for this session. Please prepare and confirm the inquiry first.',
        },
      };
    }

    const sourceChannel =
      args.sourceChannel === 'AI Chat' || args.sourceChannel === 'AI Voice'
        ? args.sourceChannel
        : defaultChannel || 'AI Voice';

    const validated = validateInquiryPayload({
      ...pending.validatedInput,
      sourceChannel,
      idempotencyKey: `tool-${confirmationToken}`,
    });
    if (validated.ok === false) {
      return {
        ok: false,
        toolName: 'submit_service_inquiry',
        data: { error: validated.error },
      };
    }

    // Consume single-use confirmation token immediately prior to persistence to prevent replay races
    this.pendingConfirmations.delete(confirmationToken);

    const data = validated.data;
    const referenceCode = `OPM-INQ-${new Date().getFullYear()}-${crypto
      .randomBytes(3)
      .toString('hex')
      .toUpperCase()}`;

    const selectedServicesSnapshot = data.matchedCatalogServices.map((svc) => ({
      id: svc.id,
      title: svc.title,
      engagementLabel: svc.engagement.engagementLabel,
      assessmentBasis: svc.engagement.assessmentBasis,
      deliveryType: svc.engagement.deliveryType,
      selectedOptionIds: data.selectedOptionsMap[svc.id] || [],
    }));

    const solutionInput = {
      referenceCode,
      idempotencyKey: data.idempotencyKey,
      type: data.type,
      fullName: data.fullName,
      email: data.email,
      contactNumber: data.contactNumber,
      company: data.company,
      industry: data.industry,
      targetTimeline: data.targetTimeline,
      selectedServices: selectedServicesSnapshot,
      selectedServiceIds: data.selectedServiceIds,
      selectedOptionsMap: data.selectedOptionsMap,
      serviceId: data.serviceId,
      serviceTitle: data.serviceTitle,
      estimatedOneTimeStartingUsd: 0,
      estimatedMonthlyStartingUsd: 0,
      estimatedBudget: 'Subject to Formal Assessment',
      engagementScope: 'Subject to Formal Assessment',
      submissionTimezone: data.submissionTimezone,
      preferredCurrency: 'USD' as const,
      phpConversionRate: 0,
      projectDescription: data.projectDescription,
      fileName: data.fileName,
      privacyConsent: true,
      commercialPolicyConsent: true,
      sourceChannel,
      clientIp: 'ai-session',
    };

    const previewNow = new Date().toISOString();
    const plannedOutbox = this.emailService.buildSolutionRequestOutboxInputs(
      {
        ...solutionInput,
        id: '',
        status: 'submitted',
        emailDeliveryStatus: 'pending',
        createdAt: previewNow,
        updatedAt: previewNow,
      },
      correlationId
    );

    let record: Awaited<ReturnType<typeof this.db.createSolutionRequest>>['record'];
    let created: boolean;
    let prePersistedOutbox:
      | Awaited<ReturnType<NonNullable<typeof this.db.createSolutionRequestWithOutbox>>>['outboxRecords']
      | undefined;

    if (this.db.createSolutionRequestWithOutbox) {
      const atomic = await this.db.createSolutionRequestWithOutbox(solutionInput, plannedOutbox.items);
      record = atomic.record;
      created = atomic.created;
      prePersistedOutbox = atomic.outboxRecords;
    } else {
      const legacy = await this.db.createSolutionRequest(solutionInput);
      record = legacy.record;
      created = legacy.created;
    }

    let emailOutcome;
    if (created) {
      if (prePersistedOutbox && prePersistedOutbox.length > 0) {
        emailOutcome = await this.emailService.dispatchPersistedSolutionOutbox(
          record.referenceCode,
          prePersistedOutbox,
          plannedOutbox.dualConfig.serviceInquiry.enabled,
          correlationId
        );
      } else {
        emailOutcome = await this.emailService.enqueueAndSendSolutionRequestEmails(record, correlationId);
      }

      await this.db
        .writeAuditLog({
          correlationId,
          actor: 'ai_tool_client_confirmed',
          actorRole: 'client',
          action: 'service_inquiry_submitted_via_ai_tool',
          entityType: 'solution_requests',
          entityId: record.referenceCode,
          details: {
            sessionId,
            sourceChannel,
            notifiedRecipientsCount: emailOutcome.notifiedRecipientsCount,
          },
        })
        .catch(() => {});
    } else {
      emailOutcome = await this.emailService.getPersistedDeliveryOutcome('solution_request', record.referenceCode);
    }

    this.pendingConfirmations.delete(confirmationToken);

    const confirmationMessage = `Your service inquiry has been registered with DESTRIA TECH INC under reference ${record.referenceCode}. Our authorized team will review your requirements and coordinate next steps.`;

    return {
      ok: true,
      toolName: 'submit_service_inquiry',
      data: {
        submitted: true,
        referenceCode: record.referenceCode,
        status: record.status,
        confirmationMessage,
        emailDeliveryStatus: emailOutcome.overallStatus,
        notifiedRecipientsCount: emailOutcome.notifiedRecipientsCount,
      },
      uiEvent: {
        type: 'submitted_inquiry',
        payload: {
          referenceCode: record.referenceCode,
          confirmationMessage,
        },
      },
    };
  }

  private async handleRequestHumanAssistance(
    sessionId: string,
    args: Record<string, unknown>,
    correlationId: string
  ): Promise<ToolExecutionOutcome> {
    const reason = sanitizePlainText(args.reason, 400) || 'Client requested direct human consultation.';
    const preferredContactMethod = sanitizePlainText(args.preferredContactMethod, 40) || 'telephone';

    await this.db
      .writeAuditLog({
        correlationId,
        actor: 'ai_escalation',
        actorRole: 'client',
        action: 'human_assistance_requested',
        entityType: 'ai_escalation',
        entityId: sessionId,
        details: { reason, preferredContactMethod },
      })
      .catch(() => {});

    return {
      ok: true,
      toolName: 'request_human_assistance',
      data: {
        escalated: true,
        corporatePhone: corporateIdentity.contact.telephone.display,
        corporateEmail: corporateIdentity.contact.email,
        headquarters: corporateIdentity.headquarters.fullAddress,
        consultationUrl: 'https://destriatech.com/consultation',
        note: 'Direct human solutions architecture desk details provided.',
      },
      uiEvent: {
        type: 'human_assistance',
        payload: {
          reason,
          corporatePhone: corporateIdentity.contact.telephone.display,
          corporateEmail: corporateIdentity.contact.email,
        },
      },
    };
  }
}
