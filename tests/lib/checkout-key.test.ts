import { describe, expect, it } from 'vitest';
import {
  checkoutIntentSignature,
  clearCheckoutKey,
  idempotencyKeyForIntent,
} from '../../src/lib/checkout-key';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe('checkout idempotency keys', () => {
  it('reuses a key for the same cart and rotates when the cart changes', () => {
    const storage = memoryStorage();
    let created = 0;
    const create = () => `key-${String(++created).padStart(4, '0')}`;

    const first = idempotencyKeyForIntent('1:0:2', storage, create);
    const retry = idempotencyKeyForIntent('1:0:2', storage, create);
    expect(first).toBe('key-0001');
    expect(retry).toBe('key-0001');
    expect(created).toBe(1);

    const changed = idempotencyKeyForIntent('1:0:3', storage, create);
    expect(changed).toBe('key-0002');
    expect(created).toBe(2);
  });

  it('ignores malformed storage and clears on success', () => {
    const storage = memoryStorage();
    storage.setItem('bd_checkout_key', 'not json');
    let created = 0;
    const create = () => `key-${String(++created).padStart(4, '0')}`;

    expect(idempotencyKeyForIntent('1:0:1', storage, create)).toBe('key-0001');
    clearCheckoutKey(storage);
    expect(storage.getItem('bd_checkout_key')).toBeNull();
  });

  it('returns a fresh key when storage is unavailable', () => {
    let created = 0;
    const create = () => `key-${String(++created).padStart(4, '0')}`;
    expect(idempotencyKeyForIntent('1:0:1', null, create)).toBe('key-0001');
    expect(idempotencyKeyForIntent('1:0:1', null, create)).toBe('key-0002');
  });

  it('changes the intent signature when the address or items change', () => {
    const base = {
      items: [{ product_id: 1, variant_id: null as number | null, qty: 1 }],
      name: 'Test',
      phone: '01712345678',
      email: '',
      division: 'Dhaka',
      district: 'Dhaka',
      upazila: 'Savar',
      address: 'House 1',
      note: '',
    };
    const signature = checkoutIntentSignature(base);
    expect(
      checkoutIntentSignature({
        ...base,
        items: [{ product_id: 1, variant_id: null, qty: 1 }],
      }),
    ).toBe(signature);
    expect(checkoutIntentSignature({ ...base, address: 'House 2' })).not.toBe(signature);
    expect(checkoutIntentSignature({ ...base, phone: '01812345678' })).not.toBe(signature);
    expect(
      checkoutIntentSignature({
        ...base,
        items: [{ product_id: 1, variant_id: null, qty: 2 }],
      }),
    ).not.toBe(signature);
  });
});
