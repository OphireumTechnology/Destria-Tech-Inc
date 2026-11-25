import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { apiUrl } from '../lib/apiClient';

const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const supabaseUrl = viteEnv.VITE_SUPABASE_URL || '';
const supabaseAnonKey = viteEnv.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('your-ompnetwork-id')
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface ClientProfile {
  id?: string;
  fullName: string;
  email: string;
  phone: string;
  companyName: string;
  industry?: string;
  location?: string;
}

export interface ProjectRequirements {
  id?: string;
  category: string;
  businessProblem: string;
  targetUsers?: string;
  keyFeatures: string[];
  existingSystems?: string;
  thirdPartyIntegrations?: string[];
  budgetPreference: string;
  targetTimeline: string;
  specialRequirements?: string;
}

export interface ProjectBrief {
  id?: string;
  referenceCode: string;
  client: ClientProfile;
  requirements: ProjectRequirements;
  technicalArchitecture: {
    recommendedModules: string[];
    suggestedStack: string[];
    infrastructure: string;
    securityMeasures: string[];
  };
  commercialDiscovery: {
    budgetPreference: string;
    timelinePreference: string;
    suggestedPhases: string[];
    consultationAgenda: string[];
  };
  createdAt: string;
  status: 'draft' | 'reviewed_by_client' | 'confirmed';
}

export type ExecutiveConsultationPathway = 'ceo' | 'cto' | 'advisory';
export type ConsultationSourceChannel = 'Public Website' | 'AI Chat' | 'AI Voice';

export interface ConsultationAppointment {
  id?: string;
  referenceCode: string;
  client: ClientProfile;
  briefReferenceCode?: string;
  executivePathway?: ExecutiveConsultationPathway;
  consultationType: 'video' | 'phone' | 'in_person';
  consultationPurpose?: string;
  selectedSolution?: string;
  scheduledDate: string;
  scheduledTimeSlot: string;
  utcScheduledAt?: string;
  durationMinutes: number;
  clientTimezone: string;
  meetingLink?: string;
  meetingLocation?: string;
  assignedConsultant: string;
  status: 'pending_review' | 'confirmed' | 'rescheduled' | 'cancelled';
  calendarSyncStatus?: 'synced' | 'pending' | 'failed' | 'unconfigured';
  sourceChannel?: ConsultationSourceChannel;
  availabilityVerified?: boolean;
  createdAt: string;
}

export const AVAILABLE_SLOTS = [
  '09:00 AM - 09:30 AM',
  '10:00 AM - 10:30 AM',
  '11:00 AM - 11:30 AM',
  '01:30 PM - 02:00 PM',
  '02:30 PM - 03:00 PM',
  '03:30 PM - 04:00 PM',
  '04:30 PM - 05:00 PM',
];

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function resolveZonedDateToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const targetAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const getOffsetMs = (probeMs: number): number => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(new Date(probeMs));
    const lookup: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== 'literal') lookup[part.type] = Number(part.value);
    }
    const wallAsUtcMs = Date.UTC(
      lookup.year,
      lookup.month - 1,
      lookup.day,
      lookup.hour === 24 ? 0 : lookup.hour,
      lookup.minute,
      lookup.second
    );
    return wallAsUtcMs - probeMs;
  };
  let guessMs = targetAsUtcMs;
  for (let i = 0; i < 3; i++) {
    const refined = targetAsUtcMs - getOffsetMs(guessMs);
    if (refined === guessMs) break;
    guessMs = refined;
  }
  return new Date(guessMs);
}

export const supabaseService = {
  async getBookedSlots(
    dateStr: string,
    timezone?: string
  ): Promise<{
    bookedSlots: string[];
    calendarConfigured: boolean;
    availabilityVerified: boolean;
    warning?: string;
    error?: string;
  }> {
    const query = new URLSearchParams({ date: dateStr });
    if (timezone) query.set('timezone', timezone);
    const endpoint = apiUrl(`/api/appointments/availability?${query.toString()}`);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetchWithTimeout(endpoint, { method: 'GET' }, 9000);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
          if (attempt === 0 && response.status >= 500) {
            await new Promise((r) => setTimeout(r, 400));
            continue;
          }
          return {
            bookedSlots: [],
            calendarConfigured: false,
            availabilityVerified: false,
            warning:
              data.error ||
              'Live scheduling availability could not be verified right now. You may still submit your request as Pending Scheduling Confirmation.',
          };
        }

        const verified = data.availabilityVerified !== false;
        return {
          bookedSlots: Array.isArray(data.bookedSlots) ? data.bookedSlots : [],
          calendarConfigured: Boolean(data.calendarConfigured),
          availabilityVerified: verified,
          warning: typeof data.warning === 'string' ? data.warning : undefined,
        };
      } catch {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        return {
          bookedSlots: [],
          calendarConfigured: false,
          availabilityVerified: false,
          warning:
            'Live scheduling availability could not be verified right now. You may select a preferred window and submit your request as Pending Scheduling Confirmation.',
        };
      }
    }

    return {
      bookedSlots: [],
      calendarConfigured: false,
      availabilityVerified: false,
      warning:
        'Live scheduling availability could not be verified right now. You may submit your request as Pending Scheduling Confirmation.',
    };
  },

  async bookAppointment(params: {
    fullName: string;
    email: string;
    phone: string;
    companyName: string;
    briefReferenceCode?: string;
    executivePathway?: ExecutiveConsultationPathway;
    consultationType: 'video' | 'phone' | 'in_person';
    consultationPurpose?: string;
    selectedSolution?: string;
    scheduledDate: string;
    scheduledTimeSlot: string;
    clientTimezone: string;
    sourceChannel?: ConsultationSourceChannel;
    availabilityVerified?: boolean;
    idempotencyKey?: string;
    notes?: string;
  }): Promise<{
    success: boolean;
    appointment?: ConsultationAppointment;
    managementToken?: string;
    calendarSynced?: boolean;
    confirmationMessage?: string;
    emailDelivery?: {
      customerStatus: string;
      adminStatus: string;
      overallStatus: string;
      emailConfigured: boolean;
    };
    error?: string;
  }> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (params.idempotencyKey) {
        headers['Idempotency-Key'] = params.idempotencyKey;
      }

      const response = await fetchWithTimeout(
        apiUrl('/api/appointments'),
        {
          method: 'POST',
          headers,
          body: JSON.stringify(params),
        },
        15000
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.appointment) {
        return {
          success: false,
          error: data.error || 'Unable to submit scheduling request.',
        };
      }

      const raw = data.appointment;
      const mapped: ConsultationAppointment = {
        id: raw.id,
        referenceCode: raw.referenceCode,
        client: {
          fullName: raw.fullName,
          email: raw.email,
          phone: raw.phone,
          companyName: raw.companyName,
        },
        briefReferenceCode: raw.briefReferenceCode,
        executivePathway: raw.executivePathway || params.executivePathway || 'advisory',
        consultationType: raw.consultationType,
        consultationPurpose: raw.consultationPurpose,
        selectedSolution: raw.selectedSolution,
        scheduledDate: raw.scheduledDate,
        scheduledTimeSlot: raw.scheduledTimeSlot,
        utcScheduledAt: raw.utcScheduledAt,
        durationMinutes: raw.durationMinutes || 30,
        clientTimezone: raw.clientTimezone,
        meetingLink: raw.meetingLink,
        meetingLocation: raw.meetingLocation,
        assignedConsultant: raw.assignedConsultant,
        status: raw.status,
        calendarSyncStatus: raw.calendarSyncStatus,
        sourceChannel: raw.sourceChannel || params.sourceChannel || 'Public Website',
        availabilityVerified: raw.availabilityVerified,
        createdAt: raw.createdAt,
      };

      return {
        success: true,
        appointment: mapped,
        managementToken: data.managementToken,
        calendarSynced: Boolean(data.calendarSynced),
        confirmationMessage:
          typeof data.confirmationMessage === 'string' ? data.confirmationMessage : undefined,
        emailDelivery: data.emailDelivery,
      };
    } catch {
      return {
        success: false,
        error: 'Network error communicating with scheduling backend. Please retry.',
      };
    }
  },

  async manageAppointment(params: {
    referenceCode: string;
    action: 'cancel' | 'reschedule';
    managementToken: string;
    email: string;
    scheduledDate?: string;
    scheduledTimeSlot?: string;
  }): Promise<{ success: boolean; appointment?: any; error?: string }> {
    try {
      const response = await fetchWithTimeout(
        apiUrl(`/api/appointments/${encodeURIComponent(params.referenceCode)}`),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        },
        12000
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to update consultation request.' };
      }
      return { success: true, appointment: data.appointment };
    } catch {
      return { success: false, error: 'Network failure updating consultation request.' };
    }
  },

  generateGoogleCalendarUrl(appointment: ConsultationAppointment): string {
    const title = encodeURIComponent(`DESTRIA TECH INC Consultation Request: ${appointment.referenceCode}`);
    const details = encodeURIComponent(
      `Consultation with DESTRIA TECH INC (DESTRIA NETWORK).\nReference Code: ${appointment.referenceCode}\nStatus: ${appointment.status}\nMode: ${appointment.consultationType.toUpperCase()}\nClient: ${appointment.client.fullName} (${appointment.client.companyName})\nLead: ${appointment.assignedConsultant}`
    );
    const location = encodeURIComponent(
      appointment.meetingLocation || appointment.meetingLink || 'Online / Corporate Location (Pending Confirmation)'
    );

    try {
      const [startTimeStr] = appointment.scheduledTimeSlot.split(' - ');
      const [time, period] = startTimeStr.trim().split(' ');
      const [h, m] = time.split(':').map(Number);
      let hours = h;
      if (period === 'PM' && hours < 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;

      const [yyyy, mm, dd] = appointment.scheduledDate.split('-').map(Number);
      const utcStart = resolveZonedDateToUtc(
        yyyy,
        mm,
        dd,
        hours,
        m,
        appointment.clientTimezone || 'America/Denver'
      );
      const utcEnd = new Date(utcStart.getTime() + appointment.durationMinutes * 60 * 1000);

      const fmt = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');
      return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}&dates=${fmt(utcStart)}/${fmt(utcEnd)}`;
    } catch {
      return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}`;
    }
  },

  generateDefaultBrief(category: string, client?: Partial<ClientProfile>): ProjectBrief {
    const refCode = `DTI-BRF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    return {
      referenceCode: refCode,
      client: {
        fullName: client?.fullName || '',
        email: client?.email || '',
        phone: client?.phone || '',
        companyName: client?.companyName || '',
        industry: client?.industry || 'Technology & Digital Systems',
        location: client?.location || 'Global / Remote',
      },
      requirements: {
        category: category || 'Customized Enterprise Solution',
        businessProblem: 'Comprehensive digital capability expansion and workflow modernization.',
        keyFeatures: [
          'Enterprise RBAC & Authentication Architecture',
          'Automated AI Processing & Solution Pipeline',
          'Resilient Multi-Cloud Database Replication',
          'Production-Grade Responsive Interface & Dashboard',
        ],
        budgetPreference: 'Subject to Formal Assessment',
        targetTimeline: 'Defined in Formal Proposal',
      },
      technicalArchitecture: {
        recommendedModules: [
          'User Management & Multi-Tenant Access Control',
          'Distributed Cloud API & Event Engine',
          'Real-Time Status & Progress Dashboard',
          'Automated GitHub Actions CI/CD Pipeline',
        ],
        suggestedStack: ['React 19', 'TypeScript', 'Node.js', 'PostgreSQL / Supabase', 'Enterprise AI APIs'],
        infrastructure: 'Managed cloud architecture with database backups and access controls.',
        securityMeasures: [
          'Row-Level Security (RLS) enforcement',
          'Server-verified Admin RBAC isolation',
          'Durable database outbox & audit trails',
        ],
      },
      commercialDiscovery: {
        budgetPreference: 'Subject to Formal Assessment & Formal Proposal',
        timelinePreference: 'Staged engineering rollout',
        suggestedPhases: [
          'Phase 1: Initial Consultation & Technical Assessment',
          'Phase 2: Architecture Design & Core Integration',
          'Phase 3: QA Verification & Security Review',
          'Phase 4: Production Deployment & Support Handover',
        ],
        consultationAgenda: [
          'Deep dive into operational workflows',
          'Review existing technical assets and dependencies',
          'Formal scope finalization and milestone roadmap',
        ],
      },
      createdAt: new Date().toISOString(),
      status: 'draft',
    };
  },
};

export type AppointmentRecord = ConsultationAppointment;
