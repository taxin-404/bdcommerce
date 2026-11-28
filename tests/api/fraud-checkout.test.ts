import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../../src/api/app';
import { setPhoneFlag, blockPhone } from '../../src/lib/blocklist';
import { checkoutBody, jsonRequest } from '../helpers/checkout-fixtures';
import {
  countRows,
  createTestDb,
  insertProduct,
  insertSetting,
  type TestEnvironment,
} from '../helpers/d1-sqlite';
import { insertOrder } from '../helpers/order-fixtures';

let environment: TestEnvironment | null = null;

afterEach(() => {
  environment?.close();
  environment = null;
});

function env(): Env {
  if (!environment) throw new Error('test database is not ready');
  return { DB: environment.adapter } as unknown as Env;
}

async function postCheckout(
  body: unknown,
  headers: Record<string, string> = {},
) {
  const init = jsonRequest(body);
  const response = await app.request(
    '/api/checkout',
    { ...init, headers: { ...(init.headers as Record<string, string>), ...headers } },
    env(),
  );
  const payload = (await response.json()) as {
    ok: boolean;
    data?: { number?: string };
    error?: { code?: string };
  };
  return { response, payload };
}

function setupProduct() {
  if (!environment) throw new Error('test database is not ready');
  insertProduct(environment.sqlite, {
    id: 1,
    title: 'Panjabi',
    price: 1000,
    variants: [{ id: 11, title: 'M', stock: 50 }],
  });
  return checkoutBody([{ product_id: 1, variant_id: 11, qty: 1 }]);
}

describe('checkout fraud controls', () => {
  it('rejects a blocked phone with a polite message and no writes', async () => {
    environment = createTestDb();
    const body = setupProduct();
    await blockPhone({ db: environment.db, phone: '01712345678' });

    const { response, payload } = await postCheckout(body);
    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe('phone_blocked');
    expect(countRows(environment.sqlite, 'orders')).toBe(0);
  });

  it('rate-limits orders per phone within 24 hours', async () => {
    environment = createTestDb();
    const body = setupProduct();
    insertSetting(environment.sqlite, 'fraud', {
      enabled: true,
      orderLimitPerPhone24h: 1,
      orderLimitPerIp24h: 100,
      advancePaymentForFlaggedPhones: true,
    });

    const first = await postCheckout(body);
    expect(first.response.status).toBe(201);

    const second = await postCheckout({ ...body, idempotency_key: 'second-key' });
    expect(second.response.status).toBe(429);
    expect(second.payload.error?.code).toBe('order_rate_limited');
  });

  it('ignores the limits when fraud controls are disabled', async () => {
    environment = createTestDb();
    const body = setupProduct();
    insertSetting(environment.sqlite, 'fraud', {
      enabled: false,
      orderLimitPerPhone24h: 1,
      orderLimitPerIp24h: 1,
      advancePaymentForFlaggedPhones: true,
    });
    for (let index = 0; index < 3; index += 1) {
      insertOrder(environment.sqlite, { phone: '01712345678' });
    }

    const { response } = await postCheckout(body, { 'cf-connecting-ip': '203.0.113.20' });
    expect(response.status).toBe(201);

    const row = environment.sqlite
      .prepare('SELECT ip_hash FROM orders ORDER BY id DESC LIMIT 1')
      .get() as unknown as { ip_hash: string | null };
    expect(row.ip_hash).toBeNull();
  });

  it('forces flagged phones to pay in advance instead of COD', async () => {
    environment = createTestDb();
    const body = setupProduct();
    await setPhoneFlag({ db: environment.db, phone: '01712345678' });

    const cod = await postCheckout(body);
    expect(cod.response.status).toBe(409);
    expect(cod.payload.error?.code).toBe('advance_payment_required');

    const bkash = await postCheckout({
      ...body,
      idempotency_key: 'bkash-key',
      payment_method: 'bkash',
      payment_sender: '01812345678',
      payment_trx_id: 'BKASH99',
    });
    expect(bkash.response.status).toBe(201);
  });

  it('rate-limits orders per salted IP hash', async () => {
    environment = createTestDb();
    const body = setupProduct();
    insertSetting(environment.sqlite, 'fraud', {
      enabled: true,
      orderLimitPerPhone24h: 100,
      orderLimitPerIp24h: 1,
      advancePaymentForFlaggedPhones: true,
    });

    const first = await postCheckout(body, { 'cf-connecting-ip': '203.0.113.7' });
    expect(first.response.status).toBe(201);

    const second = await postCheckout(
      {
        ...body,
        idempotency_key: 'ip-second',
        customer: { ...body.customer, phone: '01912345678' },
      },
      { 'cf-connecting-ip': '203.0.113.7' },
    );
    expect(second.response.status).toBe(429);
    expect(second.payload.error?.code).toBe('order_rate_limited');

    const row = environment.sqlite
      .prepare('SELECT ip_hash FROM orders LIMIT 1')
      .get() as unknown as { ip_hash: string };
    expect(row.ip_hash).toHaveLength(64);
    expect(row.ip_hash).not.toContain('203.0.113.7');
  });

  it('rejects a duplicate bKash/Nagad transaction id', async () => {
    environment = createTestDb();
    const body = setupProduct();
    const payment = {
      payment_method: 'bkash' as const,
      payment_sender: '01812345678',
      payment_trx_id: 'TRXABC1',
    };

    const first = await postCheckout({ ...body, ...payment });
    expect(first.response.status).toBe(201);

    const duplicate = await postCheckout({
      ...body,
      ...payment,
      idempotency_key: 'duplicate-trx',
      customer: { ...body.customer, phone: '01912345678' },
    });
    expect(duplicate.response.status).toBe(409);
    expect(duplicate.payload.error?.code).toBe('duplicate_payment_trx');
    expect(countRows(environment.sqlite, 'orders')).toBe(1);
  });

  it('costs 4 D1 round trips with an IP and 3 without on a fresh order', async () => {
    environment = createTestDb();
    const first = setupProduct();
    const beforeIp = environment.adapter.roundTrips;
    const withIp = await postCheckout(first, { 'cf-connecting-ip': '203.0.113.9' });
    expect(withIp.response.status).toBe(201);
    expect(environment.adapter.roundTrips - beforeIp).toBe(4);

    environment.close();
    environment = createTestDb();
    const second = setupProduct();
    const beforePlain = environment.adapter.roundTrips;
    const plain = await postCheckout(second);
    expect(plain.response.status).toBe(201);
    expect(environment.adapter.roundTrips - beforePlain).toBe(3);
  });
});
