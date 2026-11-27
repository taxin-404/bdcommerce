import { describe, expect, it } from 'vitest';
import { resolveAdminLocale } from '../../src/lib/admin-locale';

describe('resolveAdminLocale', () => {
  it('prefers an explicit ?lang= value', () => {
    expect(resolveAdminLocale('en', 'bn')).toBe('en');
    expect(resolveAdminLocale('bn', 'en')).toBe('bn');
  });

  it('falls back to the cookie', () => {
    expect(resolveAdminLocale(null, 'en')).toBe('en');
    expect(resolveAdminLocale(null, 'bn')).toBe('bn');
  });

  it('defaults to Bangla', () => {
    expect(resolveAdminLocale(null, null)).toBe('bn');
    expect(resolveAdminLocale('fr', 'de')).toBe('bn');
  });
});
