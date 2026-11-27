import bn from '../i18n/bn.json';
import en from '../i18n/en.json';

export type Locale = 'bn' | 'en';
export type TranslationVariables = Record<string, string | number>;

const translations: Record<Locale, unknown> = { bn, en };

function lookup(source: unknown, key: string): string | undefined {
  let current: unknown = source;

  for (const part of key.split('.')) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, variables: TranslationVariables): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match,
  );
}

export function t(locale: Locale, key: string, variables: TranslationVariables = {}): string {
  const template = lookup(translations[locale], key) ?? lookup(translations.en, key) ?? key;
  return interpolate(template, variables);
}
