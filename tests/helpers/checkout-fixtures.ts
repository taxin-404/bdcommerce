import { randomUUID } from 'node:crypto';

export interface CheckoutRequestBody {
  idempotency_key: string;
  locale: 'bn' | 'en';
  customer: {
    name: string;
    phone: string;
    email: string | null;
    division: string;
    district: string;
    upazila: string;
    address: string;
    note: string | null;
  };
  items: Array<{ product_id: number; variant_id: number | null; qty: number }>;
  payment_method: 'cod';
  turnstile_token?: string;
}

export function checkoutBody(
  items: Array<{ product_id: number; variant_id?: number | null; qty: number }>,
  overrides: Partial<Omit<CheckoutRequestBody, 'items' | 'customer'>> & {
    customer?: Partial<CheckoutRequestBody['customer']>;
  } = {},
): CheckoutRequestBody {
  return {
    idempotency_key: overrides.idempotency_key ?? randomUUID(),
    locale: overrides.locale ?? 'en',
    customer: {
      name: 'Test Customer',
      phone: '01712345678',
      email: null,
      division: 'Dhaka',
      district: 'Dhaka',
      upazila: 'Savar',
      address: 'House 1, Road 2, Savar',
      note: null,
      ...overrides.customer,
    },
    items: items.map((item) => ({
      product_id: item.product_id,
      variant_id: item.variant_id ?? null,
      qty: item.qty,
    })),
    payment_method: 'cod',
    ...(overrides.turnstile_token ? { turnstile_token: overrides.turnstile_token } : {}),
  };
}

export function jsonRequest(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}
