/**
 * DESTRIA TECH INC — IANA Timezone & Equivalent UTC Slot Conversion Utility
 *
 * Converts a client-requested local date (YYYY-MM-DD), time slot label
 * (e.g., "10:00 AM - 10:30 AM"), and IANA timezone (e.g., "Asia/Manila",
 * "America/Denver", "America/New_York") into an accurate DST-aware UTC representation.
 */

export interface EquivalentUtcResult {
  validTimezone: string;
  startUtcIso: string;
  endUtcIso: string;
  formattedUtc: string;
}

export function isValidIanaTimezone(timezone: string): boolean {
  if (!timezone || typeof timezone !== 'string') return false;
  const cleaned = timezone.trim();
  if (!cleaned || cleaned.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: cleaned }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function parse12HourClock(label: string): { hour: number; minute: number } | null {
  const match = label.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3].toUpperCase();
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  if (meridiem === 'AM') {
    hour = hour === 12 ? 0 : hour;
  } else {
    hour = hour === 12 ? 12 : hour + 12;
  }
  return { hour, minute };
}

/**
 * Resolves the UTC epoch milliseconds corresponding to a wall-clock datetime in a given IANA timezone.
 * Uses iterative Intl.DateTimeFormat offset computation so DST transitions are handled accurately.
 */
function zonedWallClockToUtcDate(
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
      if (part.type !== 'literal') {
        lookup[part.type] = Number(part.value);
      }
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
    const offsetMs = getOffsetMs(guessMs);
    const refined = targetAsUtcMs - offsetMs;
    if (refined === guessMs) break;
    guessMs = refined;
  }
  return new Date(guessMs);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatUtcDateOnly(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function formatUtcTimeOnly(d: Date): string {
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/**
 * Computes Equivalent UTC Date and Time from a consultation date, time slot, and IANA timezone.
 */
export function computeEquivalentUtcSlot(
  scheduledDate: string,
  scheduledTimeSlot: string,
  clientTimezone: string
): EquivalentUtcResult | null {
  const dateMatch = scheduledDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  const slotParts = scheduledTimeSlot.split('-').map((s) => s.trim());
  if (slotParts.length !== 2) return null;

  const startClock = parse12HourClock(slotParts[0]);
  const endClock = parse12HourClock(slotParts[1]);
  if (!startClock || !endClock) return null;

  const validTimezone = isValidIanaTimezone(clientTimezone)
    ? clientTimezone.trim()
    : 'America/Denver';

  const startUtc = zonedWallClockToUtcDate(
    year,
    month,
    day,
    startClock.hour,
    startClock.minute,
    validTimezone
  );
  const endUtc = zonedWallClockToUtcDate(
    year,
    month,
    day,
    endClock.hour,
    endClock.minute,
    validTimezone
  );

  const startDateStr = formatUtcDateOnly(startUtc);
  const endDateStr = formatUtcDateOnly(endUtc);
  const startTimeStr = formatUtcTimeOnly(startUtc);
  const endTimeStr = formatUtcTimeOnly(endUtc);

  const formattedUtc =
    startDateStr === endDateStr
      ? `${startDateStr} ${startTimeStr} - ${endTimeStr} UTC`
      : `${startDateStr} ${startTimeStr} UTC - ${endDateStr} ${endTimeStr} UTC`;

  return {
    validTimezone,
    startUtcIso: startUtc.toISOString(),
    endUtcIso: endUtc.toISOString(),
    formattedUtc,
  };
}
