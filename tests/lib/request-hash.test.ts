import { describe, expect, it } from 'vitest';
import { checkoutRequestHash } from '../../src/lib/request-hash';

const base = {
  customer: {
    name: 'Test',
    phone: '01712345678',
    email: null,
    division: 'Dhaka',
    district: 'Dhaka',
    upazila: 'Savar',
    address: 'House 1',
    note: null,
  },
  items: [
    { product_id: 1, variant_id: 11, qty: 1 },
    { product_id: 2, variant_id: null, qty: 2 },
  ],
  paymentMethod: 'cod',
};

describe('checkout request hash', () => {
  it('is stable for the same intent regardless of item order', async () => {
    const first = await checkoutRequestHash(base);
    const second = await checkoutRequestHash({
      ...base,
      items: [...base.items].reverse(),
    });
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when customer details or quantities change', async () => {
    const first = await checkoutRequestHash(base);
    expect(
      await checkoutRequestHash({
        ...base,
        customer: { ...base.customer, address: 'House 2' },
      }),
    ).not.toBe(first);
    expect(
      await checkoutRequestHash({
        ...base,
        customer: { ...base.customer, phone: '01812345678' },
      }),
    ).not.toBe(first);
    expect(
      await checkoutRequestHash({
        ...base,
        items: [{ product_id: 1, variant_id: 11, qty: 2 }],
      }),
    ).not.toBe(first);
  });
});
