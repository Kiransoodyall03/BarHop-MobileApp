import type { OperatingHours } from '../types';

// Ordered to match JS Date.getDay() (0 = Sunday).
const DAY_KEYS: (keyof OperatingHours)[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

// Display order for the details sheet.
export const WEEK_ORDER: (keyof OperatingHours)[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export interface OpenStatus {
  state: 'open' | 'closed' | 'unknown';
  /** e.g. "until 02:00" / "opens 17:00" — for richer badges. */
  detail?: string;
}

function toMinutes(hhmm: string | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm?.trim() ?? '');
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Live open/closed status from the venue's weekly hours. Nightlife-aware:
 * a window whose close time is at or before its open time (e.g. 20:00–02:00)
 * spans midnight, so we also check whether YESTERDAY's window is still
 * running. Missing/malformed hours yield 'unknown' rather than a wrong badge.
 */
export function getOpenStatus(
  hours: OperatingHours | null | undefined,
  now: Date = new Date()
): OpenStatus {
  if (!hours) return { state: 'unknown' };
  const dayIndex = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Yesterday's overnight window spilling past midnight.
  const yesterday = hours[DAY_KEYS[(dayIndex + 6) % 7]];
  if (yesterday && !yesterday.closed) {
    const open = toMinutes(yesterday.open);
    const close = toMinutes(yesterday.close);
    if (open !== null && close !== null && close <= open && nowMinutes < close) {
      return { state: 'open', detail: `until ${yesterday.close}` };
    }
  }

  const today = hours[DAY_KEYS[dayIndex]];
  if (!today) return { state: 'unknown' };
  if (today.closed) return { state: 'closed' };

  const open = toMinutes(today.open);
  const close = toMinutes(today.close);
  if (open === null || close === null) return { state: 'unknown' };

  if (close > open) {
    // Same-day window.
    if (nowMinutes >= open && nowMinutes < close) {
      return { state: 'open', detail: `until ${today.close}` };
    }
    return {
      state: 'closed',
      detail: nowMinutes < open ? `opens ${today.open}` : undefined,
    };
  }

  // Overnight window (close tomorrow); close === open reads as round-the-clock.
  if (nowMinutes >= open) return { state: 'open', detail: `until ${today.close}` };
  return { state: 'closed', detail: `opens ${today.open}` };
}
