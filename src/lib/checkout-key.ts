import { cartSignature, type CartLineInput } from './cart';

const IDEMPOTENCY_STORAGE_KEY = 'bd_checkout_key';

export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultCreate(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

/**
 * Reuses one key for retries of the same order intent, but rotates it when the
 * cart, phone, or address changes so an old order can never be mistaken for
 * the new one.
 */
export function idempotencyKeyForIntent(
  signature: string,
  storage: KeyStorage | null | undefined,
  create: () => string = defaultCreate,
): string {
  if (!signature) return create();

  try {
    const raw = storage?.getItem(IDEMPOTENCY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { key?: unknown; signature?: unknown };
      if (
        typeof parsed.key === 'string' &&
        parsed.key.length >= 8 &&
        parsed.signature === signature
      ) {
        return parsed.key;
      }
    }

    const key = create();
    storage?.setItem(IDEMPOTENCY_STORAGE_KEY, JSON.stringify({ key, signature }));
    return key;
  } catch {
    return create();
  }
}

export function clearCheckoutKey(storage: KeyStorage | null | undefined): void {
  try {
    storage?.removeItem(IDEMPOTENCY_STORAGE_KEY);
  } catch {
    // Storage can be disabled; the completed order still exists.
  }
}

export interface CheckoutIntent {
  items: readonly CartLineInput[];
  name: string;
  phone: string;
  email: string;
  division: string;
  district: string;
  upazila: string;
  address: string;
  note: string;
}

/** Changing the cart, phone, or address is a new order intent. */
export function checkoutIntentSignature(input: CheckoutIntent): string {
  return [
    cartSignature(input.items),
    input.name.trim(),
    input.phone.trim(),
    input.email.trim(),
    input.division,
    input.district,
    input.upazila,
    input.address.trim(),
    input.note.trim(),
  ].join('|');
}
