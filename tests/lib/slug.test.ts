import { describe, expect, it } from 'vitest';
import { slugify } from '../../src/lib/slug';

describe('slugify', () => {
  it('turns a product title into a URL slug', () => {
    expect(slugify('Cotton Panjabi')).toBe('cotton-panjabi');
  });

  it('collapses punctuation and repeated separators', () => {
    expect(slugify('  Pure Ghee — 500 g!! ')).toBe('pure-ghee-500-g');
  });

  it('strips accents', () => {
    expect(slugify('Café Crème')).toBe('cafe-creme');
  });

  it('returns an empty string when no Latin letters or digits remain', () => {
    expect(slugify('পাঞ্জাবি')).toBe('');
  });

  it('caps the slug length', () => {
    expect(slugify('a'.repeat(200)).length).toBe(80);
  });
});
