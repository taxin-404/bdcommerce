import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/api/app';
import { ORDER_NUMBER_PATTERN } from '../../src/lib/orders';
import { checkoutBody, jsonRequest } from '../helpers/checkout-fixtures';
import {
  createTestDb,
  countRows,
  insertProduct,
  insertSetting,
  type TestEnvironment,
} from '../helpers/d1-sqlite';

let environment: TestEnvironment | null = null;

afterEach(() => {
  environment?.close();
  environment = null;
  vi.unstubAllGlobals();
});

function env(extra: Record<string, string> = {}): Env {
  if (!environment) throw new Error('test database is not ready');
  return { DB: environment.adapter, ...extra } as unknown as Env;
}

async function postCheckout(body: unknown, extraEnv: Record<string, string> = {}) {
  const response = await app.request('/api/checkout', jsonRequest(body), env(extraEnv));
  const payload = (await response.json()) as {
    ok: boolean;
    data?: Record<string, unknown>;
    error?: { code?: string; message?: string; fallback?: Record<string, unknown> };
  };
  return { response, payload };
}

function orderRow(): Record<string, unknown> {
  if (!environment) throw new Error('test database is not ready');
  return environment.sqlite.prepare('SELECT * FROM orders LIMIT 1').get() as unknown as Record<
    string,
    unknown
  >;
}

describe('POST /api/checkout', () => {
  it('creates a COD order using server prices and snapshots', async () => {
    environment = createTestDb();
    const { sqlite, adapter } = environment;
    insertProduct(sqlite, {
      id: 1,
      title: 'Cotton Panjabi',
      titleBn: 'কটন পাঞ্জাবি',
      price: 1250,
      variants: [
        { id: 11, title: 'M / White', options: { size: 'M', color: 'White' }, price: 1400, stock: 10 },
      ],
    });

    const before = adapter.roundTrips;
    const { response, payload } = await postCheckout({
      ...checkoutBody([{ product_id: 1, variant_id: 11, qty: 2 }]),
      items: [
        {
          product_id: 1,
          variant_id: 11,
          qty: 2,
          price: 1,
          unit_price: 1,
          title: 'HACKED',
        },
      ],
      subtotal: 2,
      shipping_fee: 1,
      total: 3,
    });

    expect(response.status).toBe(201);
    expect(payload.ok).toBe(true);
    const number = String(payload.data?.number);
    expect(number).toMatch(ORDER_NUMBER_PATTERN);

    const order = orderRow();
    expect(order.customer_name).toBe('Test Customer');
    expect(order.phone).toBe('01712345678');
    expect(order.subtotal).toBe(2800);
    expect(order.shipping_fee).toBe(60);
    expect(order.total).toBe(2860);
    expect(order.payment_method).toBe('cod');
    expect(order.payment_status).toBe('unpaid');
    expect(order.status).toBe('pending');
    expect(order.division).toBe('Dhaka');
    expect(order.district).toBe('Dhaka');
    expect(order.upazila).toBe('Savar');

    const item = sqlite
      .prepare('SELECT * FROM order_items WHERE order_id = ?')
      .get(order.id as number) as unknown as Record<string, unknown>;
    expect(item.title_snapshot).toBe('Cotton Panjabi');
    expect(item.variant_snapshot).toBe('M / White (size=M, color=White)');
    expect(item.unit_price).toBe(1400);
    expect(item.qty).toBe(2);
    expect(item.line_total).toBe(2800);

    const variant = sqlite
      .prepare('SELECT stock FROM variants WHERE id = 11')
      .get() as unknown as { stock: number };
    expect(variant.stock).toBe(8);
    expect(countRows(sqlite, 'order_events')).toBe(1);
    expect(adapter.roundTrips - before).toBe(4);
  });

  it('falls back to the product price when a variant has no override', async () => {
    environment = createTestDb();
    insertProduct(environment.sqlite, {
      id: 1,
      title: 'Panjabi',
      price: 1250,
      variants: [{ id: 11, title: 'L', price: null, stock: 5 }],
    });

    const { response } = await postCheckout(
      checkoutBody([{ product_id: 1, variant_id: 11, qty: 1 }]),
    );
    expect(response.status).toBe(201);

    const item = environment.sqlite
      .prepare('SELECT unit_price, line_total FROM order_items')
      .get() as unknown as { unit_price: number; line_total: number };
    expect(item.unit_price).toBe(1250);
    expect(item.line_total).toBe(1250);
  });

  it('returns the same order for a repeated idempotency key', async () => {
    environment = createTestDb();
    const { sqlite, adapter } = environment;
    insertProduct(sqlite, {
      id: 1,
      title: 'Panjabi',
      price: 1000,
      variants: [{ id: 11, title: 'M', price: 1000, stock: 10 }],
    });

    const body = checkoutBody([{ product_id: 1, variant_id: 11, qty: 2 }]);
    const first = await postCheckout(body);
    const second = await postCheckout(body);

    expect(first.response.status).toBe(201);
    expect(second.response.status).toBe(200);
    expect(second.payload.data?.number).toBe(first.payload.data?.number);
    expect(second.payload.data?.existing).toBe(true);
    expect(countRows(sqlite, 'orders')).toBe(1);

    const variant = sqlite
      .prepare('SELECT stock FROM variants WHERE id = 11')
      .get() as unknown as { stock: number };
    expect(variant.stock).toBe(8);

    const before = adapter.roundTrips;
    await postCheckout(body);
    expect(adapter.roundTrips - before).toBe(2);

    const conflict = await postCheckout({
      ...body,
      customer: { ...body.customer, phone: '01812345678' },
    });
    expect(conflict.response.status).toBe(409);
    expect(conflict.payload.error?.code).toBe('idempotency_conflict');

    const changedAddress = await postCheckout({
      ...body,
      customer: { ...body.customer, address: 'Different address' },
    });
    expect(changedAddress.response.status).toBe(409);
    expect(changedAddress.payload.error?.code).toBe('idempotency_conflict');
    expect(countRows(sqlite, 'orders')).toBe(1);
  });

  it('never creates a second order when the same key is retried concurrently', async () => {
    environment = createTestDb();
    insertProduct(environment.sqlite, {
      id: 1,
      title: 'Panjabi',
      price: 1000,
      variants: [{ id: 11, title: 'M', stock: 10 }],
    });

    const body = checkoutBody([{ product_id: 1, variant_id: 11, qty: 1 }]);
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => postCheckout(body)),
    );
    expect(responses.filter((result) => result.response.status === 201)).toHaveLength(1);
    expect(responses.filter((result) => result.response.status === 200)).toHaveLength(9);
    expect(new Set(responses.map((result) => result.payload.data?.number)).size).toBe(1);
    expect(countRows(environment.sqlite, 'orders')).toBe(1);
  });

  it('prevents overselling when 50 orders race for 5 units', async () => {
    environment = createTestDb();
    const { sqlite } = environment;
    insertProduct(sqlite, {
      id: 1,
      title: 'Limited',
      price: 100,
      variants: [{ id: 11, title: 'One size', stock: 5 }],
    });

    const results = await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        postCheckout(
          checkoutBody([{ product_id: 1, variant_id: 11, qty: 1 }], {
            idempotency_key: `race-key-${index}`,
            customer: { phone: `0171234${String(5600 + index).slice(-4)}` },
          }),
        ),
      ),
    );

    const created = results.filter((result) => result.response.status === 201);
    const rejected = results.filter((result) => result.response.status === 409);
    expect(created).toHaveLength(5);
    expect(rejected).toHaveLength(45);

    const variant = sqlite
      .prepare('SELECT stock FROM variants WHERE id = 11')
      .get() as unknown as { stock: number };
    expect(variant.stock).toBe(0);
    expect(countRows(sqlite, 'orders')).toBe(5);
    expect(countRows(sqlite, 'order_items')).toBe(5);
    expect(countRows(sqlite, 'order_events')).toBe(5);
    expect(new Set(created.map((result) => result.payload.data?.number)).size).toBe(5);
  });

  it('handles a maximum-size tracked cart under D1 bound-parameter limits', async () => {
    environment = createTestDb();
    const { sqlite, adapter } = environment;
    const variants = Array.from({ length: 50 }, (_, index) => ({
      id: 100 + index,
      title: `Variant ${index}`,
      stock: 1,
    }));
    insertProduct(sqlite, { id: 1, title: 'Bulk', price: 100, variants });

    adapter.maxParams = 0;
    const { response } = await postCheckout(
      checkoutBody(
        variants.map((variant) => ({ product_id: 1, variant_id: variant.id, qty: 1 })),
      ),
    );

    expect(response.status).toBe(201);
    expect(adapter.maxParams).toBeLessThanOrEqual(100);
    expect(countRows(sqlite, 'orders')).toBe(1);
    expect(countRows(sqlite, 'order_items')).toBe(50);
    const stock = sqlite
      .prepare('SELECT SUM(stock) AS total FROM variants')
      .get() as unknown as { total: number };
    expect(stock.total).toBe(0);
  });

  it('orders untracked and variantless products without decrementing stock', async () => {
    environment = createTestDb();
    const { sqlite } = environment;
    insertProduct(sqlite, {
      id: 3,
      title: 'Ebook',
      price: 300,
      trackStock: false,
      variants: [{ id: 31, title: 'PDF', stock: 0 }],
    });
    insertProduct(sqlite, { id: 4, title: 'Simple', price: 100, variants: [] });

    const { response } = await postCheckout(
      checkoutBody([
        { product_id: 3, variant_id: 31, qty: 3 },
        { product_id: 4, variant_id: null, qty: 2 },
      ]),
    );
    expect(response.status).toBe(201);

    const variant = sqlite
      .prepare('SELECT stock FROM variants WHERE id = 31')
      .get() as unknown as { stock: number };
    expect(variant.stock).toBe(0);
    expect(countRows(sqlite, 'orders')).toBe(1);
    expect(countRows(sqlite, 'order_items')).toBe(2);
  });

  it('rejects carts with unavailable items and creates nothing', async () => {
    environment = createTestDb();
    const { sqlite } = environment;
    insertProduct(sqlite, {
      id: 1,
      title: 'Panjabi',
      price: 1000,
      variants: [{ id: 11, title: 'M', stock: 1 }],
    });

    const { response, payload } = await postCheckout(
      checkoutBody([{ product_id: 1, variant_id: 11, qty: 2 }]),
    );
    expect(response.status).toBe(409);
    expect(payload.error?.code).toBe('cart_unavailable');
    expect(countRows(sqlite, 'orders')).toBe(0);
    expect(
      (sqlite.prepare('SELECT stock FROM variants WHERE id = 11').get() as { stock: number }).stock,
    ).toBe(1);
  });

  it('shows the configured Messenger/WhatsApp fallback when D1 fails', async () => {
    environment = createTestDb();
    const { sqlite, adapter } = environment;
    insertSetting(sqlite, 'social', {
      messenger: 'https://m.me/example-shop',
      whatsapp: 'https://wa.me/8801700000000',
    });
    insertProduct(sqlite, {
      id: 1,
      title: 'Panjabi',
      price: 1000,
      variants: [{ id: 11, title: 'M', stock: 5 }],
    });

    adapter.failWhenSqlIncludes = 'INSERT INTO orders';
    const { response, payload } = await postCheckout(
      checkoutBody([{ product_id: 1, variant_id: 11, qty: 1 }], { locale: 'en' }),
    );

    expect(response.status).toBe(503);
    expect(payload.error?.code).toBe('db_unavailable');
    const fallback = payload.error?.fallback as {
      message: string;
      messenger: string;
      whatsapp: string;
    };
    expect(fallback.message).toContain('Panjabi');
    expect(fallback.message).toContain('৳১,০৬০');
    expect(fallback.messenger).toContain('https://m.me/example-shop');
    expect(fallback.whatsapp).toContain('https://wa.me/8801700000000');
    expect(countRows(sqlite, 'orders')).toBe(0);
  });

  it('returns a friendly 503 instead of a raw error when D1 is fully down', async () => {
    environment = createTestDb();
    environment.adapter.unavailable = true;

    const { response, payload } = await postCheckout(
      checkoutBody([{ product_id: 1, variant_id: null, qty: 1 }]),
    );
    expect(response.status).toBe(503);
    expect(payload.error?.code).toBe('db_unavailable');
    expect(payload.error?.fallback?.message).toBeTruthy();
  });

  it('enforces Turnstile only when both keys are configured', async () => {
    environment = createTestDb();
    insertProduct(environment.sqlite, { id: 1, title: 'Simple', price: 100, variants: [] });
    const body = checkoutBody([{ product_id: 1, variant_id: null, qty: 1 }]);

    const disabled = await postCheckout(body);
    expect(disabled.response.status).toBe(201);

    environment.close();
    environment = createTestDb();
    insertProduct(environment.sqlite, { id: 1, title: 'Simple', price: 100, variants: [] });

    const keys = {
      TURNSTILE_SITE_KEY: 'site-key',
      TURNSTILE_SECRET_KEY: 'secret-key',
    };
    const missing = await postCheckout(
      checkoutBody([{ product_id: 1, variant_id: null, qty: 1 }]),
      keys,
    );
    expect(missing.response.status).toBe(400);
    expect(missing.payload.error?.code).toBe('turnstile_failed');

    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    const passed = await postCheckout(
      checkoutBody([{ product_id: 1, variant_id: null, qty: 1 }], {
        turnstile_token: 'token',
      }),
      keys,
    );
    expect(passed.response.status).toBe(201);

    const invalidFetcher = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', invalidFetcher);
    const failed = await postCheckout(
      checkoutBody([{ product_id: 1, variant_id: null, qty: 1 }], {
        turnstile_token: 'bad-token',
      }),
      keys,
    );
    expect(failed.response.status).toBe(400);
    expect(failed.payload.error?.code).toBe('turnstile_failed');
  });
});

describe('POST /api/track', () => {
  it('returns an order only when number and phone match, without writing', async () => {
    environment = createTestDb();
    insertProduct(environment.sqlite, { id: 1, title: 'Simple', price: 500, variants: [] });

    const created = await postCheckout(
      checkoutBody([{ product_id: 1, variant_id: null, qty: 1 }]),
    );
    const number = String(created.payload.data?.number);
    const before = countRows(environment.sqlite, 'orders');

    const ok = await app.request(
      '/api/track',
      jsonRequest({ order_number: number.toLowerCase(), phone: '01712345678' }),
      env(),
    );
    expect(ok.status).toBe(200);
    const okPayload = (await ok.json()) as { ok: boolean; data?: { order: { number: string } } };
    expect(okPayload.data?.order.number).toBe(number);

    const wrong = await app.request(
      '/api/track',
      jsonRequest({ order_number: number, phone: '01812345678' }),
      env(),
    );
    expect(wrong.status).toBe(404);

    const get = await app.request('/api/track', { method: 'GET' }, env());
    expect(get.status).toBe(404);

    expect(countRows(environment.sqlite, 'orders')).toBe(before);
  });
});
