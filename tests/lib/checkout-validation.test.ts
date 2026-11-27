import { describe, expect, it } from 'vitest';
import {
  cartItemsSchema,
  checkoutSchema,
  trackSchema,
} from '../../src/lib/validation/checkout';

const validCustomer = {
  name: 'Test Customer',
  phone: '01712345678',
  email: '',
  division: 'Dhaka',
  district: 'Dhaka',
  upazila: 'Savar',
  address: 'House 1, Road 2',
  note: '',
};

describe('checkout input validation', () => {
  it('requires an idempotency key and strips client-supplied prices', () => {
    const withoutKey = checkoutSchema.safeParse({
      customer: validCustomer,
      items: [{ product_id: 1, variant_id: null, qty: 1 }],
      payment_method: 'cod',
    });
    expect(withoutKey.success).toBe(false);

    const parsed = checkoutSchema.parse({
      idempotency_key: 'abc-12345',
      customer: validCustomer,
      items: [{ product_id: 1, variant_id: null, qty: 1, price: 1, unit_price: 1 }],
      payment_method: 'cod',
      subtotal: 1,
    });
    expect(parsed.customer.email).toBeNull();
    expect(parsed.customer.note).toBeNull();
    expect(parsed.items[0]).toEqual({ product_id: 1, variant_id: null, qty: 1 });
    expect(parsed).not.toHaveProperty('subtotal');
  });

  it('rejects duplicate lines and quantities above the cap', () => {
    expect(
      cartItemsSchema.safeParse([
        { product_id: 1, variant_id: 2, qty: 1 },
        { product_id: 1, variant_id: 2, qty: 2 },
      ]).success,
    ).toBe(false);

    expect(cartItemsSchema.safeParse([{ product_id: 1, variant_id: null, qty: 100 }]).success).toBe(
      false,
    );
    expect(cartItemsSchema.safeParse([]).success).toBe(false);
  });

  it('only accepts cash on delivery in this phase', () => {
    const result = checkoutSchema.safeParse({
      idempotency_key: 'abc-12345',
      customer: validCustomer,
      items: [{ product_id: 1, variant_id: null, qty: 1 }],
      payment_method: 'bkash',
    });
    expect(result.success).toBe(false);
  });

  it('normalizes tracking input', () => {
    expect(
      trackSchema.parse({ order_number: 'bd123abc', phone: '01712345678' }),
    ).toEqual({ order_number: 'BD123ABC', phone: '01712345678' });

    expect(trackSchema.safeParse({ order_number: 'bd 123', phone: '01712345678' }).success).toBe(
      false,
    );
  });
});
