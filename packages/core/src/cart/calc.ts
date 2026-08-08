import type { CouponType } from "../constants";

export interface CartLine {
  productId: string;
  variantId: string | null;
  name: string;
  sku?: string | null;
  image?: string | null;
  quantity: number;
  unitPricePaisa: number;
  compareAtPaisa?: number | null;
  categoryId?: string | null;
  stock?: number;
}

export interface CouponLike {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  minSubtotalPaisa: number;
  maxDiscountPaisa: number | null;
  usageLimit: number | null;
  usedCount: number;
  perUserLimit: number;
  appliesTo: "ALL" | "CATEGORY" | "PRODUCT";
  appliesToId: string | null;
  buyX: number | null;
  getY: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
}

export interface CartTotals {
  subtotalPaisa: number;
  discountPaisa: number;
  shippingPaisa: number;
  taxPaisa: number;
  totalPaisa: number;
  shippingMethod: string | null;
}

export interface CouponValidation {
  ok: boolean;
  error?: string;
  coupon?: CouponLike;
  discountPaisa: number;
  freeShipping: boolean;
  eligibleLines?: CartLine[];
  freeItems?: { lineIndex: number; qty: number }[];
}

const now = () => new Date();

export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitPricePaisa * l.quantity, 0);
}

// Evaluate whether a coupon is valid and what it discounts. Exported for tests.
export function validateCoupon(
  coupon: CouponLike,
  lines: CartLine[],
  opts: { userUsedCount?: number; subtotalPaisa?: number } = {},
): CouponValidation {
  const time = now();

  if (!coupon.isActive) return { ok: false, error: "Coupon is inactive", discountPaisa: 0, freeShipping: false };
  if (coupon.startsAt && coupon.startsAt > time) return { ok: false, error: "Coupon not started yet", discountPaisa: 0, freeShipping: false };
  if (coupon.expiresAt && coupon.expiresAt < time) return { ok: false, error: "Coupon has expired", discountPaisa: 0, freeShipping: false };
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit)
    return { ok: false, error: "Coupon usage limit reached", discountPaisa: 0, freeShipping: false };
  if (opts.userUsedCount != null && coupon.perUserLimit > 0 && opts.userUsedCount >= coupon.perUserLimit)
    return { ok: false, error: "Coupon already used", discountPaisa: 0, freeShipping: false };

  const subtotal = opts.subtotalPaisa ?? cartSubtotal(lines);
  if (subtotal < coupon.minSubtotalPaisa) {
    return {
      ok: false,
      error: `Minimum order ৳${(coupon.minSubtotalPaisa / 100).toLocaleString("en-BD")} required`,
      discountPaisa: 0,
      freeShipping: false,
    };
  }

  let eligibleLines = lines;
  if (coupon.appliesTo === "CATEGORY" && coupon.appliesToId) {
    eligibleLines = lines.filter((l) => l.categoryId === coupon.appliesToId);
  } else if (coupon.appliesTo === "PRODUCT" && coupon.appliesToId) {
    eligibleLines = lines.filter((l) => l.productId === coupon.appliesToId);
  }

  if (eligibleLines.length === 0) return { ok: false, error: "Coupon does not apply to any items in cart", discountPaisa: 0, freeShipping: false };

  let discountPaisa = 0;
  let freeShipping = false;
  let freeItems: { lineIndex: number; qty: number }[] = [];

  switch (coupon.type) {
    case "PERCENTAGE": {
      const eligibleSubtotal = eligibleLines.reduce((s, l) => s + l.unitPricePaisa * l.quantity, 0);
      discountPaisa = Math.round((eligibleSubtotal * coupon.value) / 100);
      if (coupon.maxDiscountPaisa != null) discountPaisa = Math.min(discountPaisa, coupon.maxDiscountPaisa);
      break;
    }
    case "FIXED": {
      discountPaisa = coupon.value;
      break;
    }
    case "FREE_SHIPPING": {
      freeShipping = true;
      break;
    }
    case "BUY_X_GET_Y": {
      const buyX = coupon.buyX ?? 2;
      const getY = coupon.getY ?? 1;
      for (const line of eligibleLines) {
        const freeQty = Math.floor(line.quantity / (buyX + getY)) * getY;
        if (freeQty > 0) {
          freeItems.push({ lineIndex: lines.indexOf(line), qty: freeQty });
          discountPaisa += line.unitPricePaisa * freeQty;
        }
      }
      break;
    }
  }

  return {
    ok: true,
    coupon,
    discountPaisa,
    freeShipping,
    eligibleLines,
    freeItems,
  };
}

export function calculateTotals(opts: {
  lines: CartLine[];
  shippingPaisa: number;
  shippingMethod?: string | null;
  coupon?: CouponLike | null;
  couponDiscountPaisa?: number;
  couponFreeShipping?: boolean;
  userUsedCount?: number;
}): CartTotals {
  const subtotal = cartSubtotal(opts.lines);
  let discount = 0;
  let shipping = opts.shippingPaisa;
  let freeShipping = false;

  if (opts.coupon) {
    const result = validateCoupon(opts.coupon, opts.lines, { userUsedCount: opts.userUsedCount });
    if (result.ok) {
      discount = opts.couponDiscountPaisa ?? result.discountPaisa;
      freeShipping = opts.couponFreeShipping ?? result.freeShipping;
    }
  }

  if (freeShipping) shipping = 0;
  discount = Math.min(discount, subtotal);

  const total = Math.max(0, subtotal - discount + shipping);

  return {
    subtotalPaisa: subtotal,
    discountPaisa: discount,
    shippingPaisa: shipping,
    taxPaisa: 0,
    totalPaisa: total,
    shippingMethod: opts.shippingMethod ?? null,
  };
}
