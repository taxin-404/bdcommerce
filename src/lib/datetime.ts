import type { Locale } from './i18n';

/** Dates are stored as UTC ISO strings and shown in Asia/Dhaka. */
export function formatDhakaDateTime(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  try {
    return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
      timeZone: 'Asia/Dhaka',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return iso;
  }
}
