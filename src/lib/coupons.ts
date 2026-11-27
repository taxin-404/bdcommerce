export const COUPON_TYPES = ['percent', 'fixed'] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export type CouponErrorCode =
  | 'coupon_not_found'
  | 'coupon_inactive'
  | 'coupon_not_started'
  | 'coupon_expired'
  | 'coupon_min_subtotal'
  | 'coupon_exhausted'
  | 'coupon_invalid';

export interface CouponRow {
  code: string;
  type: CouponType;
  value: number;
  min_subtotal: number;
  max_uses: number | null;
  used: number;
  starts_at: string | null;
  ends_at: string | null;
  active: number | boolean;
}

export interface AppliedCoupon {
  code: string;
  type: CouponType;
  value: number;
  discount: number;
}

export type CouponEvaluation =
  | { ok: true; coupon: AppliedCoupon }
  | { ok: false; code: CouponErrorCode };

/** Coupon codes are stored and compared uppercase. */
export function normalizeCouponCode(value: string): string {
  return value.trim().toUpperCase();
}

function isIsoDate(value: string | null): value is string {
  return value !== null && value.includes('T') && !Number.isNaN(Date.parse(value));
}

/**
 * Pure evaluation after the coupon row has been loaded. Keeping this separate
 * from the SQL lets the checkout batch fetch the coupon row alongside prices
 * without an extra round trip.
 */
export function evaluateCoupon(
  row: CouponRow | null,
  subtotal: number,
  now: string,
): CouponEvaluation {
  if (!row) return { ok: false, code: 'coupon_not_found' };
  if (!row.active) return { ok: false, code: 'coupon_inactive' };

  if (row.starts_at !== null && !isIsoDate(row.starts_at)) {
    return { ok: false, code: 'coupon_invalid' };
  }
  if (row.ends_at !== null && !isIsoDate(row.ends_at)) {
    return { ok: false, code: 'coupon_invalid' };
  }
  if (row.starts_at && row.starts_at > now) {
    return { ok: false, code: 'coupon_not_started' };
  }
  if (row.ends_at && now >= row.ends_at) {
    return { ok: false, code: 'coupon_expired' };
  }
  if (row.min_subtotal > 0 && subtotal < row.min_subtotal) {
    return { ok: false, code: 'coupon_min_subtotal' };
  }
  if (row.max_uses !== null && row.used >= row.max_uses) {
    return { ok: false, code: 'coupon_exhausted' };
  }

  if (!Number.isSafeInteger(row.value) || row.value <= 0) {
    return { ok: false, code: 'coupon_invalid' };
  }
  if (row.type === 'percent' && row.value > 100) {
    return { ok: false, code: 'coupon_invalid' };
  }

  const rawDiscount =
    row.type === 'percent' ? Math.round((subtotal * row.value) / 100) : row.value;
  if (!Number.isSafeInteger(rawDiscount) || rawDiscount < 0) {
    return { ok: false, code: 'coupon_invalid' };
  }

  return {
    ok: true,
    coupon: {
      code: row.code,
      type: row.type,
      value: row.value,
      discount: Math.min(rawDiscount, subtotal),
    },
  };
}

export const COUPON_ERROR_MESSAGES: Record<CouponErrorCode, string> = {
  coupon_not_found: 'This coupon code was not found.',
  coupon_inactive: 'This coupon is no longer active.',
  coupon_not_started: 'This coupon is not active yet.',
  coupon_expired: 'This coupon has expired.',
  coupon_min_subtotal: 'Your subtotal is below the minimum for this coupon.',
  coupon_exhausted: 'This coupon has reached its usage limit.',
  coupon_invalid: 'This coupon is not configured correctly.',
};

export function couponErrorStatus(code: CouponErrorCode): 400 | 409 {
  return code === 'coupon_exhausted' ? 409 : 400;
}
