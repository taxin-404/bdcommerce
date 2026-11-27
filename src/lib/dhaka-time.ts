import type { Locale } from './i18n';

/** Bangladesh has used a fixed UTC+6 offset since 2009 (no DST). */
export const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface IsoRange {
  startIso: string;
  endIso: string;
}

function part(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

function toIsoWithMilliseconds(ms: number): string {
  return new Date(ms).toISOString();
}

/** Start of the Asia/Dhaka day containing `now`, as a UTC instant. */
export function dhakaDayStart(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + DHAKA_OFFSET_MS);
  const localMidnightUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(localMidnightUtc - DHAKA_OFFSET_MS);
}

export function dhakaDayRange(now: Date = new Date()): IsoRange {
  const start = dhakaDayStart(now).getTime();
  return {
    startIso: toIsoWithMilliseconds(start),
    endIso: toIsoWithMilliseconds(start + DAY_MS),
  };
}

/** Bangladesh's working week starts on Saturday. */
export function dhakaWeekRange(now: Date = new Date()): IsoRange {
  const dayStart = dhakaDayStart(now).getTime();
  const shifted = new Date(dayStart + DHAKA_OFFSET_MS);
  const daysSinceSaturday = (shifted.getUTCDay() + 1) % 7;
  const start = dayStart - daysSinceSaturday * DAY_MS;
  return {
    startIso: toIsoWithMilliseconds(start),
    endIso: toIsoWithMilliseconds(start + 7 * DAY_MS),
  };
}

/**
 * Parses a `YYYY-MM-DD` calendar date as an Asia/Dhaka day and returns the
 * UTC half-open range [start, next day start). Returns null for invalid dates.
 */
export function parseDhakaDate(value: string): IsoRange | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const localMidnight = Date.UTC(year, month - 1, day);
  const check = new Date(localMidnight);

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  const start = localMidnight - DHAKA_OFFSET_MS;
  return {
    startIso: toIsoWithMilliseconds(start),
    endIso: toIsoWithMilliseconds(start + DAY_MS),
  };
}

export function formatDhakaDate(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  try {
    return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
      timeZone: 'Asia/Dhaka',
      dateStyle: 'medium',
    }).format(date);
  } catch {
    return iso;
  }
}

export function todayDhakaInput(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + DHAKA_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${part(shifted.getUTCMonth() + 1)}-${part(shifted.getUTCDate())}`;
}
