import { describe, expect, it } from 'vitest';
import {
  MAX_LINE_QTY,
  cartCount,
  cartLineKey,
  cartSignature,
  cartSubtotal,
  hasDuplicateCartLines,
  mergeCartLine,
  parseStoredCart,
  removeCartLine,
  updateCartQty,
  type StoredCartLine,
} from '../../src/lib/cart';

function line(overrides: Partial<StoredCartLine> = {}): StoredCartLine {
  const productId = overrides.product_id ?? 1;
  const variantId = overrides.variant_id ?? null;
  return {
    key: cartLineKey(productId, variantId),
    product_id: productId,
    variant_id: variantId,
    qty: 1,
    slug: 'cotton-panjabi',
    title: 'Cotton Panjabi',
    variant_title: null,
    unit_price: 1250,
    image: '/placeholder.svg',
    ...overrides,
  };
}

describe('cart storage helpers', () => {
  it('drops malformed or duplicate rows from localStorage', () => {
    const parsed = parseStoredCart([
      { product_id: 1, variant_id: null, qty: 2, title: 'A', unit_price: 10 },
      { product_id: 1, variant_id: null, qty: 5, title: 'duplicate' },
      { product_id: 0, variant_id: null, qty: 1 },
      { product_id: 2, variant_id: 3, qty: 100 },
      { product_id: 3, variant_id: null, qty: 1, unit_price: -5, title: 'C' },
      'nope',
    ]);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.qty).toBe(2);
    expect(parsed[1]?.product_id).toBe(3);
    expect(parsed[1]?.unit_price).toBe(0);
  });

  it('merges by product/variant and caps quantity', () => {
    const existing = line({ qty: 95 });
    const merged = mergeCartLine([existing], line({ qty: 10 }));
    expect(merged).toHaveLength(1);
    expect(merged[0]?.qty).toBe(MAX_LINE_QTY);
  });

  it('updates, removes, counts, and totals lines', () => {
    const lines = [line({ qty: 2, unit_price: 100 }), line({ product_id: 2, qty: 1, unit_price: 50 })];

    expect(cartCount(lines)).toBe(3);
    expect(cartSubtotal(lines)).toBe(250);
    expect(updateCartQty(lines, lines[0]!.key, 3)[0]?.qty).toBe(3);
    expect(updateCartQty(lines, lines[0]!.key, 0)).toHaveLength(1);
    expect(removeCartLine(lines, lines[1]!.key)).toHaveLength(1);
  });

  it('builds a stable cart signature and finds duplicate inputs', () => {
    const a = cartSignature([
      { product_id: 1, variant_id: 2, qty: 1 },
      { product_id: 3, variant_id: null, qty: 2 },
    ]);
    const b = cartSignature([
      { product_id: 3, variant_id: null, qty: 2 },
      { product_id: 1, variant_id: 2, qty: 1 },
    ]);
    expect(a).toBe(b);

    expect(
      hasDuplicateCartLines([
        { product_id: 1, variant_id: 2, qty: 1 },
        { product_id: 1, variant_id: 2, qty: 2 },
      ]),
    ).toBe(true);
    expect(
      hasDuplicateCartLines([
        { product_id: 1, variant_id: 2, qty: 1 },
        { product_id: 1, variant_id: 3, qty: 2 },
      ]),
    ).toBe(false);
  });
});
