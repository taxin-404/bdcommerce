export type AdminLocale = 'bn' | 'en';

export function resolveAdminLocale(
  requested: string | null | undefined,
  cookie: string | null | undefined,
): AdminLocale {
  if (requested === 'bn' || requested === 'en') return requested;
  return cookie === 'en' ? 'en' : 'bn';
}
