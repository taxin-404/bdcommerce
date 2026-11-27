import type { CartLineInput } from './cart';

export interface CheckoutRequestIntent {
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
  items: readonly CartLineInput[];
  paymentMethod: string;
  paymentSender?: string | null;
  paymentTrxId?: string | null;
  couponCode?: string | null;
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Stable fingerprint of what the customer is ordering. A retry of the same
 * intent returns the same order; a changed phone/address/quantity is a
 * different intent and must not silently return the old order.
 */
export async function checkoutRequestHash(input: CheckoutRequestIntent): Promise<string> {
  const canonical = JSON.stringify({
    customer: {
      name: input.customer.name.trim(),
      phone: input.customer.phone,
      email: input.customer.email?.trim() || null,
      division: input.customer.division,
      district: input.customer.district,
      upazila: input.customer.upazila,
      address: input.customer.address.trim(),
      note: input.customer.note?.trim() || null,
    },
    items: [...input.items]
      .sort(
        (first, second) =>
          first.product_id - second.product_id ||
          (first.variant_id ?? 0) - (second.variant_id ?? 0),
      )
      .map((item) => ({
        product: item.product_id,
        variant: item.variant_id,
        qty: item.qty,
      })),
    payment_method: input.paymentMethod,
    // Keep the pre-Phase-6 hash stable for plain COD retries; only add the
    // new fields when they carry a value.
    ...(input.paymentSender ? { payment_sender: input.paymentSender } : {}),
    ...(input.paymentTrxId ? { payment_trx_id: input.paymentTrxId } : {}),
    ...(input.couponCode ? { coupon_code: input.couponCode } : {}),
  });

  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)));
}
