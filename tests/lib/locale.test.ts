import { describe, expect, it } from 'vitest';
import { pickLocalized, resolveLocale } from '../../src/lib/locale';

describe('resolveLocale', () => {
  it('uses an explicit available language', () => {
    expect(resolveLocale('bn', ['bn', 'en'], 'en', 'bn')).toBe('en');
  });

  it('falls back to the cookie when the request is invalid', () => {
    expect(resolveLocale('bn', ['bn', 'en'], 'fr', 'en')).toBe('en');
  });

  it('ignores a language that is not available', () => {
    expect(resolveLocale('bn', ['bn'], 'en', 'en')).toBe('bn');
  });

  it('defaults to the configured locale', () => {
    expect(resolveLocale('bn', ['bn', 'en'], null, null)).toBe('bn');
  });
});

describe('pickLocalized', () => {
  it('prefers Bangla when requested and present', () => {
    expect(pickLocalized('Cotton', 'কটন', 'bn')).toBe('কটন');
  });

  it('falls back to English when the Bangla value is empty', () => {
    expect(pickLocalized('Cotton', null, 'bn')).toBe('Cotton');
    expect(pickLocalized('Cotton', '', 'bn')).toBe('Cotton');
  });
});
