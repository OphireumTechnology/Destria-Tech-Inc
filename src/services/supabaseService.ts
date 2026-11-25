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

export interface ConsultationAppointment {
  id?: string;
  referenceCode: string;
  client: ClientProfile;
  briefReferenceCode?: string;
  executivePathway?: ExecutiveConsultationPathway;
  consultationType: 'video' | 'phone' | 'in_person';
  scheduledDate: string;
  scheduledTimeSlot: string;
  durationMinutes: number;
  clientTimezone: string;
  meetingLink?: string;
  meetingLocation?: string;
  assignedConsultant: string;
  status: 'pending_review' | 'confirmed' | 'rescheduled' | 'cancelled';
  calendarSyncStatus?: 'synced' | 'pending' | 'failed' | 'unconfigured';
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

export const supabaseService = {
  async getBookedSlots(dateStr: string): Promise<{
    bookedSlots: string[];
    calendarConfigured: boolean;
    error?: string;
  }> {
    try {
      const response = await fetch(
        apiUrl(`/api/appointments/availability?date=${encodeURIComponent(dateStr)}`)
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        return {
          bookedSlots: [],
          calendarConfigured: false,
          error: data.error || 'Real-time availability could not be verified from the database.',
        };
      }
      return {
        bookedSlots: Array.isArray(data.bookedSlots) ? data.bookedSlots : [],
        calendarConfigured: Boolean(data.calendarConfigured),
      };
    } catch {
      return {
        bookedSlots: [],
        calendarConfigured: false,
        error: 'Unable to reach scheduling availability server.',
      };
    }
  },

  async bookAppointment(params: {
    fullName: string;
    email: string;
    phone: string;
    companyName: string;
    briefReferenceCode?: string;
    executivePathway?: ExecutiveConsultationPathway;
    consultationType: 'video' | 'phone' | 'in_person';
    scheduledDate: string;
    scheduledTimeSlot: string;
    clientTimezone: string;
    idempotencyKey?: string;
    notes?: string;
  }): Promise<{
    success: boolean;
    appointment?: ConsultationAppointment;
    managementToken?: string;
    calendarSynced?: boolean;
    error?: string;
  }> {
    try {
      const response = await fetch(apiUrl('/api/appointments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
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
        scheduledDate: raw.scheduledDate,
        scheduledTimeSlot: raw.scheduledTimeSlot,
        durationMinutes: raw.durationMinutes || 30,
        clientTimezone: raw.clientTimezone,
        meetingLink: raw.meetingLink,
        meetingLocation: raw.meetingLocation,
        assignedConsultant: raw.assignedConsultant,
        status: raw.status,
        calendarSyncStatus: raw.calendarSyncStatus,
        createdAt: raw.createdAt,
      };

      return {
        success: true,
        appointment: mapped,
        managementToken: data.managementToken,
        calendarSynced: Boolean(data.calendarSynced),
      };
    } catch {
      return {
        success: false,
        error: 'Network error communicating with scheduling backend.',
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
      const response = await fetch(
        apiUrl(`/api/appointments/${encodeURIComponent(params.referenceCode)}`),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        }
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
      const tzOffsetHoursMap: Record<string, number> = {
        'America/Denver': -7,
        'America/New_York': -5,
        'America/Los_Angeles': -8,
        UTC: 0,
        'Europe/London': 0,
        'Asia/Manila': 8,
        'Asia/Singapore': 8,
      };
      const offsetHours = tzOffsetHoursMap[appointment.clientTimezone] ?? -7;
      const utcStart = new Date(Date.UTC(yyyy, mm - 1, dd, hours - offsetHours, m));
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
        fullName: client?.fullName || 'Prospective Enterprise Client',
        email: client?.email || 'client@enterprise.com',
        phone: client?.phone || '+1 (307) 419-4277',
        companyName: client?.companyName || 'Enterprise Partner',
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
