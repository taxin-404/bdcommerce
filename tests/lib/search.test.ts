import { describe, expect, it } from 'vitest';
import { buildFtsQuery, ftsSkuText } from '../../src/lib/search';

describe('buildFtsQuery', () => {
  it('turns words into prefix terms', () => {
    expect(buildFtsQuery('Cotton Panjabi')).toBe('"cotton"* "panjabi"*');
  });

  it('keeps Bangla words', () => {
    expect(buildFtsQuery('কটন পাঞ্জাবি')).toBe('"কটন"* "পাঞ্জাবি"*');
  });

  it('drops punctuation and FTS operators', () => {
    expect(buildFtsQuery('  ghee " OR 1=1 -- ')).toBe('"ghee"* "or"* "1"*');
  });

  it('deduplicates terms', () => {
    expect(buildFtsQuery('honey honey HONEY')).toBe('"honey"*');
  });

  it('caps the number of terms', () => {
    const query = buildFtsQuery('a b c d e f g h i j k l');
    expect(query?.split(' ')).toHaveLength(8);
  });

  it('returns null when nothing searchable remains', () => {
    expect(buildFtsQuery('')).toBeNull();
    expect(buildFtsQuery('   !!! --- ')).toBeNull();
  });
});

describe('ftsSkuText', () => {
  it('joins active skus into one searchable string', () => {
    expect(
      ftsSkuText([
        { sku: 'PAN-M', active: true },
        { sku: null, active: true },
        { sku: 'PAN-L', active: false },
      ]),
    ).toBe('PAN-M');
  });

  it('returns an empty string when no active sku exists', () => {
    expect(ftsSkuText([])).toBe('');
  });
});
