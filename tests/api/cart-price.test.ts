import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../../src/api/app';
import { jsonRequest } from '../helpers/checkout-fixtures';
import { createTestDb, insertProduct, type TestEnvironment } from '../helpers/d1-sqlite';

let environment: TestEnvironment | null = null;

afterEach(() => {
  environment?.close();
  environment = null;
});

function env(): Env {
  if (!environment) throw new Error('test database is not ready');
  return { DB: environment.adapter } as unknown as Env;
}

describe('POST /api/cart/price', () => {
  it('re-prices on the server and ignores client prices', async () => {
    environment = createTestDb();
    const { sqlite, adapter } = environment;
    insertProduct(sqlite, {
      id: 1,
      title: 'Panjabi',
      price: 1250,
      variants: [{ id: 11, title: 'M', price: 1400, stock: 10 }],
    });

    const before = adapter.roundTrips;
    const response = await app.request(
      '/api/cart/price',
      jsonRequest({
        items: [
          {
            product_id: 1,
            variant_id: 11,
            qty: 2,
            price: 1,
            unit_price: 1,
            line_total: 2,
          },
        ],
        district: 'Dhaka',
      }),
      env(),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      ok: boolean;
      data: {
        subtotal: number;
        shipping_fee: number;
        total: number;
        lines: Array<{ unit_price: number; line_total: number }>;
      };
    };
    expect(payload.data.lines[0]?.unit_price).toBe(1400);
    expect(payload.data.lines[0]?.line_total).toBe(2800);
    expect(payload.data.subtotal).toBe(2800);
    expect(payload.data.shipping_fee).toBe(60);
    expect(payload.data.total).toBe(2860);
    expect(adapter.roundTrips - before).toBe(2);
    expect(
      (sqlite.prepare('SELECT stock FROM variants WHERE id = 11').get() as { stock: number }).stock,
    ).toBe(10);
  });

  it('rejects an empty cart with the standard error envelope', async () => {
    environment = createTestDb();
    const response = await app.request(
      '/api/cart/price',
      jsonRequest({ items: [], district: 'Dhaka' }),
      env(),
    );
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { ok: boolean; error: { code: string } };
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('validation_error');
  });

  it('rejects malformed JSON with the standard error envelope', async () => {
    environment = createTestDb();
    const response = await app.request(
      '/api/cart/price',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{bad',
      },
      env(),
    );
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { ok: boolean; error: { code: string } };
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('invalid_request');
  });

  it('returns a friendly 503 when D1 is unavailable', async () => {
    environment = createTestDb();
    environment.adapter.unavailable = true;
    const response = await app.request(
      '/api/cart/price',
      jsonRequest({ items: [{ product_id: 1, variant_id: null, qty: 1 }] }),
      env(),
    );
    expect(response.status).toBe(503);
    const payload = (await response.json()) as { ok: boolean; error: { code: string } };
    expect(payload.error.code).toBe('db_unavailable');
  });
});
