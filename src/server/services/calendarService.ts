import crypto from 'crypto';
import { logStructured } from '../logger';
import { computeEquivalentUtcSlot } from '../utils/timezoneUtc';

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
}

export interface CalendarCreateResult {
  synced: boolean;
  calendarSyncStatus: 'synced' | 'failed' | 'unconfigured';
  eventId?: string;
  meetingLink?: string;
  error?: string;
}

export interface CalendarSlotCheckResult {
  configured: boolean;
  available: boolean;
  busyWindows: Array<{ start: string; end: string }>;
  error?: string;
}

export class GoogleCalendarService {
  private readonly calendarId: string;
  private readonly credentials: ServiceAccountCredentials | null;

  constructor(calendarId?: string, serviceAccountJson?: string) {
    this.calendarId = (calendarId ?? process.env.GOOGLE_CALENDAR_ID ?? '').trim();
    const rawJson = (serviceAccountJson ?? process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '').trim();
    let parsed: ServiceAccountCredentials | null = null;
    if (rawJson && this.calendarId) {
      try {
        const candidate = JSON.parse(rawJson);
        if (candidate?.client_email && candidate?.private_key) {
          parsed = {
            client_email: String(candidate.client_email),
            private_key: String(candidate.private_key),
          };
        }
      } catch {
        parsed = null;
      }
    }
    this.credentials = parsed;
  }

  public isConfigured(): boolean {
    return Boolean(this.calendarId && this.credentials);
  }

  private async getAccessToken(): Promise<string> {
    if (!this.credentials) {
      throw new Error('Google Calendar service account credentials not configured.');
    }

    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claimSet = Buffer.from(
      JSON.stringify({
        iss: this.credentials.client_email,
        scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      })
    ).toString('base64url');

    const signatureInput = `${header}.${claimSet}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signatureInput);
    const signature = signer.sign(this.credentials.private_key, 'base64url');
    const assertion = `${signatureInput}.${signature}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData?.error_description || 'Failed to obtain Google OAuth access token');
    }
    return String(tokenData.access_token);
  }

  /**
   * Computes exact DST-aware UTC start/end ISO strings using the validated client IANA timezone.
   */
  public resolveSlotWindow(
    scheduledDate: string,
    scheduledTimeSlot: string,
    clientTimezone: string
  ): { startUtcIso: string; endUtcIso: string; timeZone: string } {
    const computed = computeEquivalentUtcSlot(scheduledDate, scheduledTimeSlot, clientTimezone);
    if (computed) {
      return {
        startUtcIso: computed.startUtcIso,
        endUtcIso: computed.endUtcIso,
        timeZone: computed.validTimezone,
      };
    }

    // Fallback parsing for non-standard slot labels
    const [startTimeStr] = scheduledTimeSlot.split(' - ');
    const [timePart, period] = startTimeStr.trim().split(' ');
    const [h, m] = timePart.split(':').map(Number);
    let hours = Number.isFinite(h) ? h : 9;
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    const hh = String(hours).padStart(2, '0');
    const mm = String(Number.isFinite(m) ? m : 0).padStart(2, '0');
    const startUtc = new Date(`${scheduledDate}T${hh}:${mm}:00Z`);
    const endUtc = new Date(startUtc.getTime() + 30 * 60 * 1000);
    return {
      startUtcIso: startUtc.toISOString(),
      endUtcIso: endUtc.toISOString(),
      timeZone: 'UTC',
    };
  }

  /**
   * Queries Google Calendar FreeBusy API to detect real calendar conflicts before event creation.
   */
  public async checkSlotAvailability(params: {
    scheduledDate: string;
    scheduledTimeSlot: string;
    clientTimezone: string;
  }): Promise<CalendarSlotCheckResult> {
    if (!this.isConfigured()) {
      return { configured: false, available: true, busyWindows: [] };
    }
    try {
      const accessToken = await this.getAccessToken();
      const window = this.resolveSlotWindow(
        params.scheduledDate,
        params.scheduledTimeSlot,
        params.clientTimezone
      );
      const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeMin: window.startUtcIso,
          timeMax: window.endUtcIso,
          items: [{ id: this.calendarId }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          configured: true,
          available: true,
          busyWindows: [],
          error: data?.error?.message || `Google Calendar FreeBusy HTTP ${res.status}`,
        };
      }
      const busy = Array.isArray(data?.calendars?.[this.calendarId]?.busy)
        ? data.calendars[this.calendarId].busy
        : [];
      return {
        configured: true,
        available: busy.length === 0,
        busyWindows: busy,
      };
    } catch (err: any) {
      return {
        configured: true,
        available: true,
        busyWindows: [],
        error: err?.message || 'Unable to verify Google Calendar availability',
      };
    }
  }

  public async createConsultationEvent(params: {
    referenceCode: string;
    fullName: string;
    email: string;
    companyName: string;
    consultationType: 'video' | 'phone' | 'in_person';
    scheduledDate: string;
    scheduledTimeSlot: string;
    clientTimezone: string;
    location?: string;
    correlationId?: string;
  }): Promise<CalendarCreateResult> {
    if (!this.isConfigured()) {
      return {
        synced: false,
        calendarSyncStatus: 'unconfigured',
        error: 'Google Calendar credentials are not configured; recording as pending scheduling request.',
      };
    }

    try {
      const accessToken = await this.getAccessToken();
      const window = this.resolveSlotWindow(
        params.scheduledDate,
        params.scheduledTimeSlot,
        params.clientTimezone
      );

      const eventBody: Record<string, unknown> = {
        summary: `DESTRIA TECH INC Consultation (${params.referenceCode}) - ${params.companyName}`,
        description: `Client: ${params.fullName} (${params.email})\nChannel: ${params.consultationType}\nClient Timezone: ${window.timeZone}\nRef: ${params.referenceCode}`,
        start: { dateTime: window.startUtcIso, timeZone: window.timeZone },
        end: { dateTime: window.endUtcIso, timeZone: window.timeZone },
        attendees: [{ email: params.email, displayName: params.fullName }],
        location: params.location,
      };

      if (params.consultationType === 'video') {
        eventBody.conferenceData = {
          createRequest: {
            requestId: params.referenceCode,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        };
      }

      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          this.calendarId
        )}/events?conferenceDataVersion=1`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(eventBody),
        }
      );

      const calData = await calRes.json().catch(() => ({}));
      if (!calRes.ok) {
        logStructured('warn', 'google_calendar_sync_failed', {
          correlationId: params.correlationId,
          referenceCode: params.referenceCode,
          status: calRes.status,
          error: calData?.error?.message,
        });
        return {
          synced: false,
          calendarSyncStatus: 'failed',
          error: calData?.error?.message || `Google Calendar API HTTP ${calRes.status}`,
        };
      }

      return {
        synced: true,
        calendarSyncStatus: 'synced',
        eventId: calData.id,
        meetingLink: calData.hangoutLink || calData.htmlLink || undefined,
      };
    } catch (err: any) {
      logStructured('error', 'google_calendar_exception', {
        correlationId: params.correlationId,
        referenceCode: params.referenceCode,
        error: err?.message,
      });
      return {
        synced: false,
        calendarSyncStatus: 'failed',
        error: err?.message || 'Google Calendar integration error',
      };
    }
  }

  public async updateConsultationEvent(params: {
    eventId: string;
    scheduledDate: string;
    scheduledTimeSlot: string;
    clientTimezone: string;
    referenceCode: string;
    correlationId?: string;
  }): Promise<CalendarCreateResult> {
    if (!this.isConfigured() || !params.eventId) {
      return {
        synced: false,
        calendarSyncStatus: 'unconfigured',
        error: 'Google Calendar event update skipped because credentials or event ID are absent.',
      };
    }
    try {
      const accessToken = await this.getAccessToken();
      const window = this.resolveSlotWindow(
        params.scheduledDate,
        params.scheduledTimeSlot,
        params.clientTimezone
      );
      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          this.calendarId
        )}/events/${encodeURIComponent(params.eventId)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            start: { dateTime: window.startUtcIso, timeZone: window.timeZone },
            end: { dateTime: window.endUtcIso, timeZone: window.timeZone },
          }),
        }
      );
      const calData = await calRes.json().catch(() => ({}));
      if (!calRes.ok) {
        return {
          synced: false,
          calendarSyncStatus: 'failed',
          error: calData?.error?.message || `Google Calendar update HTTP ${calRes.status}`,
        };
      }
      return {
        synced: true,
        calendarSyncStatus: 'synced',
        eventId: calData.id || params.eventId,
        meetingLink: calData.hangoutLink || calData.htmlLink || undefined,
      };
    } catch (err: any) {
      return {
        synced: false,
        calendarSyncStatus: 'failed',
        error: err?.message || 'Google Calendar update error',
      };
    }
  }

  public async cancelConsultationEvent(params: {
    eventId: string;
    referenceCode: string;
    correlationId?: string;
  }): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured() || !params.eventId) {
      return { ok: false, error: 'Google Calendar not configured or no event ID.' };
    }
    try {
      const accessToken = await this.getAccessToken();
      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          this.calendarId
        )}/events/${encodeURIComponent(params.eventId)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      if (calRes.ok || calRes.status === 404 || calRes.status === 410) {
        return { ok: true };
      }
      const calData = await calRes.json().catch(() => ({}));
      return {
        ok: false,
        error: calData?.error?.message || `Google Calendar cancel HTTP ${calRes.status}`,
      };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Google Calendar cancel error' };
    }
  }
}
