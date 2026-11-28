import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../../src/api/app';
import { createCheckoutOrder } from '../../src/lib/checkout';
import { checkoutBody, jsonRequest } from '../helpers/checkout-fixtures';
import {
  createTestDb,
  countRows,
  insertCoupon,
  insertProduct,
  type TestEnvironment,
} from '../helpers/d1-sqlite';

let environment: TestEnvironment | null = null;

afterEach(() => {
  environment?.close();
  environment = null;
});

function env(): Env {
  if (!environment) throw new Error('test database is not ready');
  return { DB: environment.adapter } as unknown as Env;
}

async function postCheckout(body: unknown) {
  const response = await app.request('/api/checkout', jsonRequest(body), env());
  const payload = (await response.json()) as {
    ok: boolean;
    data?: { number?: string };
    error?: { code?: string };
  };
  return { response, payload };
}

describe('coupon check API', () => {
  it('returns the server discount and total', async () => {
    environment = createTestDb();
    const { sqlite } = environment;
    insertProduct(sqlite, { id: 1, title: 'Panjabi', price: 1000, variants: [] });
    insertCoupon(sqlite, { code: 'SAVE10', type: 'percent', value: 10 });

    const response = await app.request(
      '/api/coupons/check',
      jsonRequest({
        items: [{ product_id: 1, variant_id: null, qty: 1 }],
        district: 'Dhaka',
        coupon_code: 'save10',
      }),
      env(),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      ok: boolean;
      data: {
        discount: number;
        total: number;
        coupon: { code: string };
        coupon_error: string | null;
      };
    };
    expect(payload.data.discount).toBe(100);
    expect(payload.data.total).toBe(960);
    expect(payload.data.coupon.code).toBe('SAVE10');
    expect(payload.data.coupon_error).toBeNull();
    expect(countRows(sqlite, 'orders')).toBe(0);
  });

  it('returns a clear error for an expired coupon', async () => {
    environment = createTestDb();
    const { sqlite } = environment;
    insertProduct(sqlite, { id: 1, title: 'Panjabi', price: 1000, variants: [] });
    insertCoupon(sqlite, {
      code: 'OLD',
      type: 'percent',
      value: 10,
      endsAt: '2020-01-01T00:00:00.000Z',
    });

    const response = await app.request(
      '/api/coupons/check',
      jsonRequest({
        items: [{ product_id: 1, variant_id: null, qty: 1 }],
        district: 'Dhaka',
        coupon_code: 'OLD',
      }),
      env(),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { coupon_error: string; discount: number };
    };
    expect(payload.data.coupon_error).toBe('coupon_expired');
    expect(payload.data.discount).toBe(0);
  });
});

describe('checkout coupon usage', () => {
  it('stores the discount and increments usage once', async () => {
    environment = createTestDb();
    const { sqlite } = environment;
    insertProduct(sqlite, { id: 1, title: 'Panjabi', price: 1000, variants: [] });
    insertCoupon(sqlite, { code: 'SAVE10', type: 'percent', value: 10, maxUses: 4 });

    const before = environment.adapter.roundTrips;
    const { response, payload } = await postCheckout(
      checkoutBody([{ product_id: 1, qty: 1 }], { coupon_code: 'SAVE10' }),
    );

    expect(response.status).toBe(201);
    expect(environment.adapter.roundTrips - before).toBe(3);
    expect(payload.ok).toBe(true);
    const order = sqlite
      .prepare('SELECT subtotal, discount, total, coupon_code FROM orders LIMIT 1')
      .get() as unknown as {
      subtotal: number;
      discount: number;
      total: number;
      coupon_code: string;
    };
    expect(order.subtotal).toBe(1000);
    expect(order.discount).toBe(100);
    expect(order.total).toBe(960);
    expect(order.coupon_code).toBe('SAVE10');

    const coupon = sqlite
      .prepare('SELECT used FROM coupons WHERE code = ?')
      .get('SAVE10') as unknown as { used: number };
    expect(coupon.used).toBe(1);
  });

  it('never lets concurrent checkouts exceed max_uses', async () => {
    environment = createTestDb();
    const { sqlite } = environment;
    insertProduct(sqlite, {
      id: 1,
      title: 'Panjabi',
      price: 1000,
      variants: [{ id: 11, title: 'M', stock: 100 }],
    });
    insertCoupon(sqlite, { code: 'LIMITED', type: 'fixed', value: 100, maxUses: 3 });

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        postCheckout(
          checkoutBody([{ product_id: 1, variant_id: 11, qty: 1 }], {
            idempotency_key: `coupon-race-${index}`,
            customer: { phone: `0171234${String(5700 + index).slice(-4)}` },
            coupon_code: 'LIMITED',
          }),
        ),
      ),
    );

    expect(results.filter((result) => result.response.status === 201)).toHaveLength(3);
    expect(
      results.filter((result) => result.payload.error?.code === 'coupon_exhausted'),
    ).toHaveLength(17);
    expect(countRows(sqlite, 'orders')).toBe(3);

    const coupon = sqlite
      .prepare('SELECT used FROM coupons WHERE code = ?')
      .get('LIMITED') as unknown as { used: number };
    expect(coupon.used).toBe(3);

    const stock = sqlite
      .prepare('SELECT stock FROM variants WHERE id = 11')
      .get() as unknown as { stock: number };
    expect(stock.stock).toBe(97);
  });

  it('returns the existing order when a double-tap shares the last coupon use', async () => {
    environment = createTestDb();
    const { sqlite } = environment;
    insertProduct(sqlite, { id: 1, title: 'Panjabi', price: 1000, variants: [] });
    insertCoupon(sqlite, { code: 'ONEUSE', type: 'fixed', value: 100, maxUses: 1 });

    const body = checkoutBody([{ product_id: 1, qty: 1 }], {
      idempotency_key: 'double-tap-coupon',
      coupon_code: 'ONEUSE',
    });
    const results = await Promise.all([postCheckout(body), postCheckout(body)]);

    expect(results.map((result) => result.response.status).sort()).toEqual([200, 201]);
    expect(new Set(results.map((result) => result.payload.data?.number)).size).toBe(1);
    expect(countRows(sqlite, 'orders')).toBe(1);
    expect(
      (sqlite.prepare('SELECT used FROM coupons WHERE code = ?').get('ONEUSE') as {
        used: number;
      }).used,
    ).toBe(1);
  });

  it('rolls back the coupon increment when the stock guard fails', async () => {
    environment = createTestDb();
    const { db, sqlite } = environment;
    insertProduct(sqlite, {
      id: 1,
      title: 'Panjabi',
      price: 1000,
      variants: [{ id: 11, title: 'M', stock: 1 }],
    });
    insertCoupon(sqlite, { code: 'SAVE10', type: 'percent', value: 10, maxUses: 5 });

    const result = await createCheckoutOrder({
      db,
      idempotencyKey: 'rollback-coupon',
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
      lines: [
        {
          product_id: 1,
          variant_id: 11,
          title: 'Panjabi',
          variant_title: 'M',
          variant_options: {},
          unit_price: 1000,
          qty: 2,
          line_total: 2000,
          track_stock: true,
        },
      ],
      subtotal: 2000,
      discount: 200,
      shippingFee: 60,
      total: 1860,
      number: 'BDROLLBACK1',
      requestHash: 'hash',
      couponCode: 'SAVE10',
    });

    expect(result).toMatchObject({ ok: false, code: 'out_of_stock' });
    expect(countRows(sqlite, 'orders')).toBe(0);
    expect(
      (sqlite.prepare('SELECT used FROM coupons WHERE code = ?').get('SAVE10') as {
        used: number;
      }).used,
    ).toBe(0);
    expect(
      (sqlite.prepare('SELECT stock FROM variants WHERE id = 11').get() as { stock: number }).stock,
    ).toBe(1);
  });

  it('rolls back stock and the order when the coupon expires between price and insert', async () => {
    environment = createTestDb();
    const { sqlite } = environment;
    insertProduct(sqlite, {
      id: 1,
      title: 'Panjabi',
      price: 1000,
      variants: [{ id: 11, title: 'M', stock: 5 }],
    });
    insertCoupon(sqlite, {
      code: 'SOON',
      type: 'percent',
      value: 10,
      endsAt: '2026-01-01T00:00:00.000Z',
    });

    // A coupon that is already expired is rejected before pricing/order write.
    const { response } = await postCheckout(
      checkoutBody([{ product_id: 1, variant_id: 11, qty: 1 }], { coupon_code: 'SOON' }),
    );
    expect(response.status).toBe(400);
    expect(countRows(sqlite, 'orders')).toBe(0);
    expect(
      (sqlite.prepare('SELECT stock FROM variants WHERE id = 11').get() as { stock: number }).stock,
    ).toBe(5);
  });
});
