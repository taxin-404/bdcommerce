import { describe, expect, it } from 'vitest';
import { isProductInStock, pickDefaultVariant } from '../../src/lib/product';

describe('pickDefaultVariant', () => {
  it('picks the cheapest active variant', () => {
    const variants = [
      { id: 1, price: 480, stock: 10 },
      { id: 2, price: 250, stock: 5 },
      { id: 3, price: 900, stock: 2 },
    ];

    expect(pickDefaultVariant(variants)?.id).toBe(2);
  });

  it('breaks price ties by id', () => {
    const variants = [
      { id: 7, price: 250, stock: 1 },
      { id: 4, price: 250, stock: 1 },
    ];

    expect(pickDefaultVariant(variants)?.id).toBe(4);
  });

  it('returns undefined when there are no variants', () => {
    expect(pickDefaultVariant([])).toBeUndefined();
  });
});

describe('isProductInStock', () => {
  it('is always in stock when stock tracking is disabled', () => {
    expect(
      isProductInStock({
        trackStock: false,
        variants: [{ stock: 0 }],
      }),
    ).toBe(true);
  });

  it('uses variant stock when tracking is enabled', () => {
    expect(isProductInStock({ trackStock: true, variants: [{ stock: 0 }, { stock: 3 }] })).toBe(
      true,
    );
    expect(isProductInStock({ trackStock: true, variants: [{ stock: 0 }] })).toBe(false);
  });

  it('treats a variantless product as in stock', () => {
    expect(isProductInStock({ trackStock: true, variants: [] })).toBe(true);
  });
});
