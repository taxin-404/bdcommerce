import type { Locale } from './i18n';

const LOCALES: readonly Locale[] = ['bn', 'en'];

function isLocale(value: string | null | undefined): value is Locale {
  return value !== null && value !== undefined && LOCALES.includes(value as Locale);
}

export function resolveLocale(
  defaultLocale: Locale,
  available: readonly string[],
  requested?: string | null,
  cookie?: string | null,
): Locale {
  for (const candidate of [requested, cookie]) {
    if (isLocale(candidate) && available.includes(candidate)) return candidate;
  }
  return defaultLocale;
}

export function pickLocalized(
  en: string | null | undefined,
  bn: string | null | undefined,
  locale: Locale,
): string {
  if (locale === 'bn' && bn?.trim()) return bn;
  return en ?? bn ?? '';
}
