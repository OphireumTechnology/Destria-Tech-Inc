import {
  getCatalogServiceById,
  SERVICE_CATALOG,
} from '../data/serviceCatalog';
import { AVAILABLE_SLOTS } from '../services/supabaseService';
import { CatalogService } from '../types';

export const ALLOWED_APPOINTMENT_SLOTS = AVAILABLE_SLOTS;

export interface ValidatedInquiryPayload {
  idempotencyKey?: string;
  type: 'solution_builder' | 'contact_inquiry';
  fullName: string;
  email: string;
  contactNumber: string;
  company: string;
  industry?: string;
  targetTimeline?: string;
  selectedServices: string[];
  selectedServiceIds: string[];
  matchedCatalogServices: CatalogService[];
  selectedOptionsMap: Record<string, string[]>;
  serviceId: string;
  serviceTitle: string;
  estimatedOneTimeStartingUsd: number;
  estimatedMonthlyStartingUsd: number;
  estimatedBudget: string;
  preferredCurrency: 'USD' | 'PHP';
  phpConversionRate: number;
  projectDescription: string;
  fileName?: string;
  privacyConsent: boolean;
}

export interface ValidatedAppointmentPayload {
  idempotencyKey?: string;
  fullName: string;
  email: string;
  phone: string;
  companyName: string;
  briefReferenceCode?: string;
  executivePathway: 'ceo' | 'cto' | 'advisory';
  consultationType: 'video' | 'phone' | 'in_person';
  scheduledDate: string;
  scheduledTimeSlot: string;
  durationMinutes: number;
  clientTimezone: string;
  notes?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_CONSULTATION_TYPES = new Set(['video', 'phone', 'in_person']);
const ALLOWED_EXECUTIVE_PATHWAYS = new Set(['ceo', 'cto', 'advisory']);

export function sanitizeText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

export const sanitizePlainText = sanitizeText;

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_REGEX.test(email);
}

export function sanitizeChatInput(raw: unknown):
  | {
      ok: true;
      userMessage: string;
      language: string;
      history: Array<{ sender: 'user' | 'ai'; text: string }>;
      stateContext: {
        category?: string;
        businessProblem?: string;
        currentStage?: string;
      };
    }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const body = raw as Record<string, unknown>;
  const userMessage = sanitizeText(body.userMessage, 1500);
  if (!userMessage) {
    return { ok: false, error: 'userMessage is required and must be a non-empty string.' };
  }

  const language = sanitizeText(body.language, 16) || 'en-US';
  const rawHistory = Array.isArray(body.conversationHistory) ? body.conversationHistory : [];
  const history: Array<{ sender: 'user' | 'ai'; text: string }> = [];
  for (const item of rawHistory.slice(-20)) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const sender = entry.sender === 'ai' ? 'ai' : 'user';
    const text = sanitizeText(entry.text, 1500);
    if (text) {
      history.push({ sender, text });
    }
  }

  const rawState =
    body.stateContext && typeof body.stateContext === 'object'
      ? (body.stateContext as Record<string, unknown>)
      : {};

  return {
    ok: true,
    userMessage,
    language,
    history,
    stateContext: {
      category: sanitizeText(rawState.category, 120) || undefined,
      businessProblem: sanitizeText(rawState.businessProblem, 500) || undefined,
      currentStage: sanitizeText(rawState.currentStage, 60) || undefined,
    },
  };
}

/**
 * Validates and normalizes inquiry/solution-builder submissions.
 * Enforces DESTRIA TECH INC's customized enterprise engagement policy:
 *  - Verifies every requested service ID against the authoritative catalog.
 *  - Rejects client-submitted price figures or automated cost calculations.
 *  - Records engagement status strictly as "Subject to Formal Assessment".
 */
export function validateInquiryPayload(raw: unknown): {
  ok: true;
  data: ValidatedInquiryPayload;
} | {
  ok: false;
  error: string;
  errors: string[];
} {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return {
      ok: false,
      error: 'Request body must be a JSON object.',
      errors: ['Request body must be a JSON object.'],
    };
  }
  const body = raw as Record<string, unknown>;

  // Honeypot anti-spam field must always be empty
  const honeypot = sanitizeText(body.websiteHoneypot, 120);
  if (honeypot.length > 0) {
    return {
      ok: false,
      error: 'Spam protection triggered.',
      errors: ['Spam protection triggered.'],
    };
  }

  const fullName = sanitizeText(body.fullName, 120);
  const email = sanitizeText(body.email, 254).toLowerCase();
  const contactNumber = sanitizeText(body.contactNumber, 40);
  const company = sanitizeText(body.company, 160);
  const industry = sanitizeText(body.industry, 120) || undefined;
  const targetTimeline = sanitizeText(body.targetTimeline, 120) || undefined;
  const projectDescription = sanitizeText(body.projectDescription, 4000);
  const fileName = sanitizeText(body.fileName, 200) || undefined;
  const idempotencyKey = sanitizeText(body.idempotencyKey, 120) || undefined;
  const privacyConsent = body.privacyConsent === true;
  const type: 'solution_builder' | 'contact_inquiry' =
    body.type === 'contact_inquiry' ? 'contact_inquiry' : 'solution_builder';

  if (fullName.length < 2) errors.push('Full name must be at least 2 characters.');
  if (!isValidEmail(email)) errors.push('A valid email address is required.');
  if (contactNumber.length < 7) errors.push('A valid contact phone number is required.');
  if (company.length < 2) errors.push('Company or organization name is required.');
  if (projectDescription.length < 10) {
    errors.push('Project description must be at least 10 characters.');
  }
  if (!privacyConsent) errors.push('Privacy consent must be explicitly accepted.');

  // Resolve and verify service IDs strictly against authoritative catalog
  const requestedIds: string[] = [];
  if (Array.isArray(body.selectedServiceIds)) {
    for (const item of body.selectedServiceIds) {
      const cleaned = sanitizeText(item, 80);
      if (cleaned && !requestedIds.includes(cleaned)) requestedIds.push(cleaned);
    }
  }
  const singleServiceId = sanitizeText(body.serviceId, 80);
  if (
    requestedIds.length === 0 &&
    singleServiceId &&
    singleServiceId !== 'enterprise-custom-assessment'
  ) {
    requestedIds.push(singleServiceId);
  }

  if (requestedIds.length > 20) {
    errors.push('A maximum of 20 services may be included in a single solution inquiry.');
  }

  const validatedServices: CatalogService[] = [];
  for (const sid of requestedIds) {
    const found =
      getCatalogServiceById(sid) ||
      SERVICE_CATALOG.find((s) => s.legacyServiceId === sid);
    if (!found) {
      errors.push(`Unknown or invalid service identifier: "${sid}".`);
    } else {
      validatedServices.push(found);
    }
  }

  if (type === 'solution_builder' && validatedServices.length === 0) {
    errors.push('At least one valid catalog service must be selected.');
  }

  // Validate selected option IDs per service (customized scope modules, no public pricing)
  const rawOptionsMap =
    body.selectedOptionsMap && typeof body.selectedOptionsMap === 'object'
      ? (body.selectedOptionsMap as Record<string, unknown>)
      : {};
  const sanitizedOptionsMap: Record<string, string[]> = {};

  for (const svc of validatedServices) {
    const rawOpts = rawOptionsMap[svc.id];
    const validOptionIds = new Set((svc.configurableOptions || []).map((o) => o.id));
    const chosen: string[] = [];
    if (Array.isArray(rawOpts)) {
      for (const optId of rawOpts) {
        const cleanedOpt = sanitizeText(optId, 80);
        if (cleanedOpt) {
          if (!validOptionIds.has(cleanedOpt)) {
            errors.push(`Invalid configuration option "${cleanedOpt}" for service "${svc.id}".`);
          } else if (!chosen.includes(cleanedOpt)) {
            chosen.push(cleanedOpt);
          }
        }
      }
    }
    if (chosen.length > 0) {
      sanitizedOptionsMap[svc.id] = chosen;
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: errors[0], errors };
  }

  const selectedServiceTitles = validatedServices.map((s) => s.title);
  const serviceTitle =
    selectedServiceTitles.length > 0
      ? selectedServiceTitles.join(' + ')
      : sanitizeText(body.serviceTitle, 160) || 'Customized Enterprise Solution Inquiry';

  return {
    ok: true,
    data: {
      idempotencyKey,
      type,
      fullName,
      email,
      contactNumber,
      company,
      industry,
      targetTimeline,
      selectedServices: selectedServiceTitles,
      selectedServiceIds: validatedServices.map((s) => s.id),
      matchedCatalogServices: validatedServices,
      selectedOptionsMap: sanitizedOptionsMap,
      serviceId: validatedServices[0]?.id || 'enterprise-custom-assessment',
      serviceTitle,
      // No public/automated service pricing or monetary totals are generated.
      // Retained as 0 / assessment label strictly for legacy DB schema compatibility.
      estimatedOneTimeStartingUsd: 0,
      estimatedMonthlyStartingUsd: 0,
      estimatedBudget: 'Subject to Formal Assessment',
      preferredCurrency: 'USD',
      phpConversionRate: 1,
      projectDescription,
      fileName,
      privacyConsent,
    },
  };
}

export function validateAppointmentPayload(raw: unknown): {
  ok: true;
  data: ValidatedAppointmentPayload;
} | {
  ok: false;
  error: string;
  errors: string[];
} {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return {
      ok: false,
      error: 'Request body must be a JSON object.',
      errors: ['Request body must be a JSON object.'],
    };
  }
  const body = raw as Record<string, unknown>;

  const honeypot = sanitizeText(body.websiteHoneypot, 120);
  if (honeypot.length > 0) {
    return {
      ok: false,
      error: 'Spam protection triggered.',
      errors: ['Spam protection triggered.'],
    };
  }

  const fullName = sanitizeText(body.fullName, 120);
  const email = sanitizeText(body.email, 254).toLowerCase();
  const phone = sanitizeText(body.phone, 40);
  const companyName = sanitizeText(body.companyName, 160) || 'Enterprise Client';
  const briefReferenceCode = sanitizeText(body.briefReferenceCode, 60) || undefined;
  const executivePathwayRaw = sanitizeText(body.executivePathway, 20).toLowerCase() || 'advisory';
  const consultationTypeRaw = sanitizeText(body.consultationType, 30);
  const scheduledDate = sanitizeText(body.scheduledDate, 20);
  const scheduledTimeSlot = sanitizeText(body.scheduledTimeSlot, 40);
  const clientTimezone = sanitizeText(body.clientTimezone, 60) || 'America/Denver';
  const notes = sanitizeText(body.notes, 1000) || undefined;
  const idempotencyKey = sanitizeText(body.idempotencyKey, 120) || undefined;

  if (fullName.length < 2) errors.push('Full name is required.');
  if (!isValidEmail(email)) errors.push('A valid email address is required.');
  if (phone.length < 7) errors.push('A valid phone number is required.');

  if (!ALLOWED_EXECUTIVE_PATHWAYS.has(executivePathwayRaw)) {
    errors.push('Executive consultation pathway must be one of: ceo, cto, advisory.');
  }

  if (!ALLOWED_CONSULTATION_TYPES.has(consultationTypeRaw)) {
    errors.push('Consultation type must be one of: video, phone, in_person.');
  }

  if (!ISO_DATE_REGEX.test(scheduledDate)) {
    errors.push('Scheduled date must use YYYY-MM-DD format.');
  } else {
    const parsed = new Date(`${scheduledDate}T00:00:00Z`);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (Number.isNaN(parsed.getTime())) {
      errors.push('Scheduled date is invalid.');
    } else if (parsed.getTime() < today.getTime()) {
      errors.push('Scheduled date cannot be in the past.');
    } else if (parsed.getUTCDay() === 0 || parsed.getUTCDay() === 6) {
      errors.push('Consultations are scheduled on weekdays (Monday to Friday).');
    }
  }

  if (!AVAILABLE_SLOTS.includes(scheduledTimeSlot)) {
    errors.push('Selected time slot is not an active consultation window.');
  }

  if (errors.length > 0) {
    return { ok: false, error: errors[0], errors };
  }

  return {
    ok: true,
    data: {
      idempotencyKey,
      fullName,
      email,
      phone,
      companyName,
      briefReferenceCode,
      executivePathway: executivePathwayRaw as 'ceo' | 'cto' | 'advisory',
      consultationType: consultationTypeRaw as 'video' | 'phone' | 'in_person',
      scheduledDate,
      scheduledTimeSlot,
      durationMinutes: 30,
      clientTimezone,
      notes,
    },
  };
}
