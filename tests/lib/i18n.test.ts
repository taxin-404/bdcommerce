import { describe, expect, it } from 'vitest';
import bn from '../../src/i18n/bn.json';
import en from '../../src/i18n/en.json';
import { t } from '../../src/lib/i18n';

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('t', () => {
  it('returns Bangla strings', () => {
    expect(t('bn', 'common.cart')).toBe('কার্ট');
  });

  it('returns English strings', () => {
    expect(t('en', 'common.cart')).toBe('Cart');
  });

  it('interpolates variables', () => {
    expect(t('en', 'errors.required', { field: 'Phone' })).toBe('Phone is required');
  });

  it('returns the key when a translation is missing', () => {
    expect(t('en', 'missing.key')).toBe('missing.key');
  });
});

describe('translations', () => {
  it('has the same keys in bn and en', () => {
    expect(flattenKeys(bn).sort()).toEqual(flattenKeys(en).sort());
  });
});
