import { describe, expect, it } from 'vitest';
import {
  decodeCursor,
  encodeCursor,
  parseShopQuery,
  parseShopSort,
} from '../../src/lib/shop';

describe('parseShopSort', () => {
  it('accepts the supported sorts', () => {
    expect(parseShopSort('new')).toBe('new');
    expect(parseShopSort('price-asc')).toBe('price-asc');
    expect(parseShopSort('price-desc')).toBe('price-desc');
  });

  it('defaults to newest', () => {
    expect(parseShopSort(null)).toBe('new');
    expect(parseShopSort('cheapest')).toBe('new');
  });
});

describe('cursor encoding', () => {
  it('round-trips a newest cursor', () => {
    expect(decodeCursor(encodeCursor({ id: 42 }))).toEqual({ id: 42 });
  });

  it('round-trips a price cursor', () => {
    expect(decodeCursor(encodeCursor({ id: 42, price: 1250 }))).toEqual({
      id: 42,
      price: 1250,
    });
  });

  it('rejects malformed and unsafe cursors', () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor('not-base64!')).toBeNull();
    expect(decodeCursor(encodeCursor({ id: 0 }))).toBeNull();
    expect(decodeCursor(encodeCursor({ id: 1, price: -5 }))).toBeNull();
  });
});

describe('parseShopQuery', () => {
  it('reads q, category, sort, and cursor', () => {
    const params = new URLSearchParams({
      q: '  cotton  ',
      category: 'panjabi',
      sort: 'price-asc',
      cursor: encodeCursor({ id: 9, price: 1250 }),
    });

    expect(parseShopQuery(params)).toEqual({
      q: 'cotton',
      category: 'panjabi',
      sort: 'price-asc',
      cursor: { id: 9, price: 1250 },
    });
  });

  it('drops unsafe category values and long queries', () => {
    const params = new URLSearchParams({
      q: 'x'.repeat(150),
      category: '../etc/passwd',
    });

    const parsed = parseShopQuery(params);
    expect(parsed.q).toHaveLength(100);
    expect(parsed.category).toBeNull();
  });

  it('defaults to a first page with no filters', () => {
    expect(parseShopQuery(new URLSearchParams())).toEqual({
      q: '',
      category: null,
      sort: 'new',
      cursor: null,
    });
  });
});
