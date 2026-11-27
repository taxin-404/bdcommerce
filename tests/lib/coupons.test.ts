import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/lib/config';
import {
  evaluateCoupon,
  type CouponRow,
} from '../../src/lib/coupons';
import { priceCart } from '../../src/lib/pricing';
import {
  createTestDb,
  insertCoupon,
  insertProduct,
  type TestEnvironment,
} from '../helpers/d1-sqlite';

const NOW = '2026-11-28T10:00:00.000Z';

function coupon(overrides: Partial<CouponRow> = {}): CouponRow {
  return {
    code: 'SAVE10',
    type: 'percent',
    value: 10,
    min_subtotal: 0,
    max_uses: null,
    used: 0,
    starts_at: null,
    ends_at: null,
    active: 1,
    ...overrides,
  };
}

let environment: TestEnvironment | null = null;

afterEach(() => {
  environment?.close();
  environment = null;
});

describe('coupon evaluation', () => {
  it('applies percent and fixed discounts and caps at the subtotal', () => {
    const percent = evaluateCoupon(coupon(), 1000, NOW);
    expect(percent.ok && percent.coupon.discount).toBe(100);

    const fixed = evaluateCoupon(coupon({ type: 'fixed', value: 500 }), 400, NOW);
    expect(fixed.ok && fixed.coupon.discount).toBe(400);
  });

  it('rejects inactive, early, expired, below-minimum and exhausted coupons', () => {
    expect(evaluateCoupon(coupon({ active: 0 }), 1000, NOW)).toEqual({
      ok: false,
      code: 'coupon_inactive',
    });
    expect(
      evaluateCoupon(coupon({ starts_at: '2026-11-29T00:00:00.000Z' }), 1000, NOW),
    ).toEqual({ ok: false, code: 'coupon_not_started' });
    expect(
      evaluateCoupon(coupon({ ends_at: '2026-11-28T09:59:59.000Z' }), 1000, NOW),
    ).toEqual({ ok: false, code: 'coupon_expired' });
    expect(evaluateCoupon(coupon({ min_subtotal: 1500 }), 1000, NOW)).toEqual({
      ok: false,
      code: 'coupon_min_subtotal',
    });
    expect(evaluateCoupon(coupon({ max_uses: 3, used: 3 }), 1000, NOW)).toEqual({
      ok: false,
      code: 'coupon_exhausted',
    });
  });

  it('rejects malformed percent configurations', () => {
    expect(evaluateCoupon(coupon({ value: 101 }), 1000, NOW)).toEqual({
      ok: false,
      code: 'coupon_invalid',
    });
  });

  it('uses the coupon lookup primary-key index', () => {
    environment = createTestDb();
    const plan = environment.sqlite
      .prepare('EXPLAIN QUERY PLAN SELECT code, type, value FROM coupons WHERE code = ?')
      .all('SAVE10') as Array<{ detail: string }>;
    console.log(`coupon lookup: ${plan.map((row) => row.detail).join(' | ')}`);

    expect(plan.map((row) => row.detail).join(' ')).toMatch(
      /SEARCH coupons USING (COVERING )?INDEX/,
    );
    expect(plan.map((row) => row.detail).join(' ')).not.toMatch(/\bSCAN\b/);
  });
});

describe('priceCart with coupons', () => {
  it('applies the discount before the total and keeps shipping from the original subtotal', async () => {
    environment = createTestDb();
    const { sqlite, db } = environment;
    insertProduct(sqlite, { id: 1, title: 'Panjabi', price: 1000, variants: [] });
    insertCoupon(sqlite, { code: 'SAVE10', type: 'percent', value: 10 });

    const priced = await priceCart(
      db,
      [{ product_id: 1, variant_id: null, qty: 1 }],
      defaultConfig,
      'Dhaka',
      { couponCode: 'save10' },
    );

    expect(priced.subtotal).toBe(1000);
    expect(priced.discount).toBe(100);
    expect(priced.shipping_fee).toBe(60);
    expect(priced.total).toBe(960);
    expect(priced.coupon?.code).toBe('SAVE10');
    expect(priced.coupon_error).toBeNull();
  });

  it('ignores coupons when the feature is disabled', async () => {
    environment = createTestDb();
    const { sqlite, db } = environment;
    insertProduct(sqlite, { id: 1, title: 'Panjabi', price: 1000, variants: [] });
    insertCoupon(sqlite, { code: 'SAVE10', type: 'percent', value: 10 });

    const priced = await priceCart(
      db,
      [{ product_id: 1, variant_id: null, qty: 1 }],
      { ...defaultConfig, features: { ...defaultConfig.features, coupons: false } },
      'Dhaka',
      { couponCode: 'SAVE10' },
    );

    expect(priced.discount).toBe(0);
    expect(priced.coupon_error).toBe('coupon_inactive');
  });

  it('returns a clear coupon error for a missing code', async () => {
    environment = createTestDb();
    const { sqlite, db } = environment;
    insertProduct(sqlite, { id: 1, title: 'Panjabi', price: 1000, variants: [] });

    const priced = await priceCart(
      db,
      [{ product_id: 1, variant_id: null, qty: 1 }],
      defaultConfig,
      'Dhaka',
      { couponCode: 'NOPE' },
    );

    expect(priced.discount).toBe(0);
    expect(priced.coupon_error).toBe('coupon_not_found');
  });
});
