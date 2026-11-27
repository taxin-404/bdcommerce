import { describe, expect, it } from 'vitest';
import {
  categoryInputSchema,
  categoryPatchSchema,
  productInputSchema,
  productPatchSchema,
} from '../../src/lib/validation/admin';

describe('categoryInputSchema', () => {
  it('accepts a minimal category and applies defaults', () => {
    const parsed = categoryInputSchema.parse({ name: 'Panjabi' });

    expect(parsed.sort).toBe(0);
    expect(parsed.active).toBe(true);
  });

  it('rejects a blank name', () => {
    expect(() => categoryInputSchema.parse({ name: '   ' })).toThrow();
  });

  it('accepts a null parent', () => {
    expect(categoryInputSchema.parse({ name: 'Panjabi', parent_id: null }).parent_id).toBeNull();
  });
});

describe('productInputSchema', () => {
  it('accepts a minimal product and applies defaults', () => {
    const parsed = productInputSchema.parse({ title: 'Cotton Panjabi', price: 1250 });

    expect(parsed.status).toBe('draft');
    expect(parsed.track_stock).toBe(true);
    expect(parsed.featured).toBe(false);
    expect(parsed.attributes).toEqual({});
    expect(parsed.variants).toEqual([]);
  });

  it('rejects a negative price', () => {
    expect(() => productInputSchema.parse({ title: 'X', price: -1 })).toThrow();
  });

  it('rejects prices above the safe business cap', () => {
    expect(() =>
      productInputSchema.parse({ title: 'X', price: 1_000_000_001 }),
    ).toThrow();
    expect(
      productInputSchema.parse({ title: 'X', price: 1_000_000_000 }).price,
    ).toBe(1_000_000_000);
  });

  it('rejects an invalid status', () => {
    expect(() => productInputSchema.parse({ title: 'X', price: 1, status: 'live' })).toThrow();
  });

  it('accepts variants with defaults', () => {
    const parsed = productInputSchema.parse({
      title: 'Cotton Panjabi',
      price: 1250,
      variants: [{ title: 'M / White', options: { size: 'M', color: 'White' } }],
    });

    expect(parsed.variants[0]?.stock).toBe(0);
    expect(parsed.variants[0]?.active).toBe(true);
  });
});

describe('patch schemas', () => {
  it('does not inject create defaults into a partial product patch', () => {
    const parsed = productPatchSchema.parse({ price: 1 });

    expect(parsed).toEqual({ price: 1 });
    expect('status' in parsed).toBe(false);
    expect('variants' in parsed).toBe(false);
  });

  it('does not inject create defaults into a partial category patch', () => {
    expect(categoryPatchSchema.parse({})).toEqual({});
  });

  it('accepts a variant update with only an id', () => {
    const parsed = productPatchSchema.parse({ variants: [{ id: 7 }] });

    expect(parsed.variants?.[0]).toEqual({ id: 7 });
  });
});
