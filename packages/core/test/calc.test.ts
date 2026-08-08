import { describe, expect, it } from "vitest";
import {
  calculateTotals,
  cartSubtotal,
  validateCoupon,
  type CartLine,
  type CouponLike,
} from "../src/cart/calc";

const line = (over: Partial<CartLine> = {}): CartLine => ({
  productId: "p1",
  variantId: null,
  name: "Test",
  quantity: 1,
  unitPricePaisa: 1000,
  ...over,
});

const coupon = (over: Partial<CouponLike>): CouponLike => ({
  id: "c1",
  code: "TEST10",
  type: "PERCENTAGE",
  value: 10,
  minSubtotalPaisa: 0,
  maxDiscountPaisa: null,
  usageLimit: null,
  usedCount: 0,
  perUserLimit: 1,
  appliesTo: "ALL",
  appliesToId: null,
  buyX: null,
  getY: null,
  startsAt: null,
  expiresAt: null,
  isActive: true,
  ...over,
});

describe("cartSubtotal", () => {
  it("sums line totals", () => {
    const lines = [line({ unitPricePaisa: 1000, quantity: 2 }), line({ unitPricePaisa: 500, quantity: 3 })];
    expect(cartSubtotal(lines)).toBe(3500);
  });
});

describe("validateCoupon", () => {
  it("applies percentage discount", () => {
    const res = validateCoupon(coupon({}), [line({ unitPricePaisa: 10000 })]);
    expect(res.ok).toBe(true);
    expect(res.discountPaisa).toBe(1000);
  });

  it("caps percentage discount at maxDiscountPaisa", () => {
    const res = validateCoupon(coupon({ value: 50, maxDiscountPaisa: 300 }), [line({ unitPricePaisa: 10000 })]);
    expect(res.discountPaisa).toBe(300);
  });

  it("applies fixed discount", () => {
    const res = validateCoupon(coupon({ type: "FIXED", value: 500 }), [line({ unitPricePaisa: 10000 })]);
    expect(res.discountPaisa).toBe(500);
  });

  it("enforces min subtotal", () => {
    const res = validateCoupon(coupon({ minSubtotalPaisa: 5000 }), [line({ unitPricePaisa: 1000 })]);
    expect(res.ok).toBe(false);
  });

  it("rejects expired coupons", () => {
    const res = validateCoupon(coupon({ expiresAt: new Date(Date.now() - 1000) }), [line()]);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/expired/i);
  });

  it("flags free shipping", () => {
    const res = validateCoupon(coupon({ type: "FREE_SHIPPING" }), [line()]);
    expect(res.freeShipping).toBe(true);
  });

  it("handles buy-x-get-y", () => {
    const res = validateCoupon(coupon({ type: "BUY_X_GET_Y", buyX: 2, getY: 1 }), [line({ quantity: 6, unitPricePaisa: 1000 })]);
    expect(res.discountPaisa).toBe(2000);
    expect(res.freeItems).toEqual([{ lineIndex: 0, qty: 2 }]);
  });

  it("restricts to category lines", () => {
    const res = validateCoupon(
      coupon({ appliesTo: "CATEGORY", appliesToId: "cat1" }),
      [line({ productId: "a", categoryId: "cat1", unitPricePaisa: 2000 }), line({ productId: "b", categoryId: "cat2", unitPricePaisa: 8000 })],
    );
    expect(res.discountPaisa).toBe(200);
  });
});

describe("calculateTotals", () => {
  it("computes subtotal - discount + shipping", () => {
    const totals = calculateTotals({
      lines: [line({ unitPricePaisa: 10000 })],
      shippingPaisa: 1000,
      coupon: coupon({}),
    });
    expect(totals.subtotalPaisa).toBe(10000);
    expect(totals.discountPaisa).toBe(1000);
    expect(totals.shippingPaisa).toBe(1000);
    expect(totals.totalPaisa).toBe(10000);
  });

  it("waives shipping for free-shipping coupons", () => {
    const totals = calculateTotals({
      lines: [line({ unitPricePaisa: 10000 })],
      shippingPaisa: 1000,
      coupon: coupon({ type: "FREE_SHIPPING" }),
      couponFreeShipping: true,
    });
    expect(totals.shippingPaisa).toBe(0);
  });

  it("never lets discount exceed subtotal", () => {
    const totals = calculateTotals({
      lines: [line({ unitPricePaisa: 1000 })],
      shippingPaisa: 0,
      coupon: coupon({ type: "FIXED", value: 999999 }),
    });
    expect(totals.discountPaisa).toBe(1000);
    expect(totals.totalPaisa).toBe(0);
  });
});
