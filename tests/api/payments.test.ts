import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../../src/api/app';
import { ADMIN_COOKIE_NAME, createSessionCookie } from '../../src/lib/auth';
import { changeOrderStatus } from '../../src/lib/order-status';
import { changePaymentStatus } from '../../src/lib/payments';
import { checkoutBody, jsonRequest } from '../helpers/checkout-fixtures';
import {
  createTestDb,
  insertProduct,
  insertSetting,
  type TestEnvironment,
} from '../helpers/d1-sqlite';
import {
  insertOrder,
  orderStatusCount,
  type OrderFixture,
} from '../helpers/order-fixtures';
import { defaultConfig } from '../../src/lib/config';

let environment: TestEnvironment | null = null;

afterEach(() => {
  environment?.close();
  environment = null;
});

function env(): Env {
  if (!environment) throw new Error('test database is not ready');
  return { DB: environment.adapter } as unknown as Env;
}

function walletOrder(overrides: OrderFixture = {}): number {
  if (!environment) throw new Error('test database is not ready');
  return insertOrder(environment.sqlite, {
    paymentMethod: 'bkash',
    paymentStatus: 'pending_verification',
    ...overrides,
  });
}

describe('wallet checkout', () => {
  it('creates a bKash order as pending verification with sender and TrxID', async () => {
    environment = createTestDb();
    const { sqlite } = environment;
    insertProduct(sqlite, { id: 1, title: 'Panjabi', price: 1000, variants: [] });

    const response = await app.request(
      '/api/checkout',
      jsonRequest(
        checkoutBody([{ product_id: 1, qty: 1 }], {
          payment_method: 'bkash',
          payment_sender: '+8801712345678',
          payment_trx_id: 'abc123456',
        }),
      ),
      env(),
    );
    expect(response.status).toBe(201);

    const order = sqlite.prepare('SELECT * FROM orders LIMIT 1').get() as unknown as {
      payment_method: string;
      payment_status: string;
      payment_sender: string;
      payment_trx_id: string;
    };
    expect(order.payment_method).toBe('bkash');
    expect(order.payment_status).toBe('pending_verification');
    expect(order.payment_sender).toBe('01712345678');
    expect(order.payment_trx_id).toBe('ABC123456');
    expect(orderStatusCount(sqlite, Number((sqlite.prepare('SELECT id FROM orders').get() as { id: number }).id), 'created')).toBe(1);
  });

  it('rejects a disabled wallet', async () => {
    environment = createTestDb();
    const { sqlite } = environment;
    insertProduct(sqlite, { id: 1, title: 'Panjabi', price: 1000, variants: [] });

    const response = await app.request(
      '/api/checkout',
      jsonRequest(
        checkoutBody([{ product_id: 1, qty: 1 }], {
          payment_method: 'nagad',
          payment_sender: '01712345678',
          payment_trx_id: 'ABC123456',
        }),
      ),
      env(),
    );
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('payment_unavailable');
  });

  it('accepts Nagad when it is enabled in settings', async () => {
    environment = createTestDb();
    const { sqlite } = environment;
    insertProduct(sqlite, { id: 1, title: 'Panjabi', price: 1000, variants: [] });
    insertSetting(sqlite, 'payments', {
      ...defaultConfig.payments,
      nagad: { enabled: true, number: '01812345678', type: 'personal' },
    });

    const response = await app.request(
      '/api/checkout',
      jsonRequest(
        checkoutBody([{ product_id: 1, qty: 1 }], {
          payment_method: 'nagad',
          payment_sender: '01712345678',
          payment_trx_id: 'NAGAD123',
        }),
      ),
      env(),
    );
    expect(response.status).toBe(201);
    const order = sqlite
      .prepare('SELECT payment_method, payment_status FROM orders LIMIT 1')
      .get() as unknown as { payment_method: string; payment_status: string };
    expect(order.payment_method).toBe('nagad');
    expect(order.payment_status).toBe('pending_verification');
  });
});

describe('manual payment verification', () => {
  it('verifies a pending wallet payment and writes one audit event', async () => {
    environment = createTestDb();
    const { db, sqlite } = environment;
    const orderId = walletOrder();

    const plan = sqlite
      .prepare('EXPLAIN QUERY PLAN SELECT id FROM orders WHERE id = ?')
      .all(orderId) as Array<{ detail: string }>;
    console.log(`payment lookup: ${plan.map((row) => row.detail).join(' | ')}`);
    expect(plan.map((row) => row.detail).join(' ')).toMatch(
      /SEARCH orders USING INTEGER PRIMARY KEY/,
    );

    const result = await changePaymentStatus({ db, orderId, action: 'verify' });
    expect(result).toMatchObject({ ok: true, to: 'paid', event: 'payment_verified' });
    expect(orderStatusCount(sqlite, orderId, 'payment_verified')).toBe(1);

    const again = await changePaymentStatus({ db, orderId, action: 'verify' });
    expect(again).toMatchObject({ ok: false, code: 'invalid_transition' });
    expect(orderStatusCount(sqlite, orderId, 'payment_verified')).toBe(1);
  });

  it('rejects a pending payment as unpaid and a paid payment as refunded', async () => {
    environment = createTestDb();
    const { db, sqlite } = environment;

    const pending = walletOrder({ number: 'BDPAY001' });
    const rejected = await changePaymentStatus({ db, orderId: pending, action: 'reject' });
    expect(rejected).toMatchObject({ ok: true, to: 'unpaid', event: 'payment_rejected' });

    const paid = walletOrder({ number: 'BDPAY002', paymentStatus: 'paid' });
    const refunded = await changePaymentStatus({ db, orderId: paid, action: 'reject' });
    expect(refunded).toMatchObject({ ok: true, to: 'refunded', event: 'payment_refunded' });
    expect(orderStatusCount(sqlite, paid, 'payment_refunded')).toBe(1);
  });

  it('does not verify COD orders or cancelled/returned wallet orders', async () => {
    environment = createTestDb();
    const { db } = environment;
    const cod = insertOrder(environment.sqlite, { paymentMethod: 'cod', paymentStatus: 'unpaid' });
    expect(await changePaymentStatus({ db, orderId: cod, action: 'verify' })).toMatchObject({
      ok: false,
      code: 'invalid_payment_method',
    });

    const cancelled = walletOrder({ status: 'cancelled' });
    expect(await changePaymentStatus({ db, orderId: cancelled, action: 'verify' })).toMatchObject({
      ok: false,
      code: 'invalid_transition',
    });
  });

  it('lets only one concurrent verification win', async () => {
    environment = createTestDb();
    const { db, sqlite } = environment;
    const orderId = walletOrder();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => changePaymentStatus({ db, orderId, action: 'verify' })),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      results.filter((result) => !result.ok && result.code === 'status_conflict'),
    ).toHaveLength(4);
    expect(orderStatusCount(sqlite, orderId, 'payment_verified')).toBe(1);
  });

  it('keeps COD delivered → paid working', async () => {
    environment = createTestDb();
    const { db } = environment;
    const orderId = insertOrder(environment.sqlite, {
      status: 'shipped',
      paymentMethod: 'cod',
      paymentStatus: 'unpaid',
    });

    const result = await changeOrderStatus({ db, orderId, to: 'delivered' });
    expect(result).toMatchObject({ ok: true, paymentStatus: 'paid' });
  });

  it('verifies through the authenticated admin endpoint', async () => {
    environment = createTestDb();
    const passphrase = 'a-strong-test-passphrase-123';
    const orderId = walletOrder();
    const cookie = await createSessionCookie(environment.db, passphrase, Date.now());

    const response = await app.request(
      `/api/admin/orders/${orderId}/payment`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${ADMIN_COOKIE_NAME}=${cookie}`,
        },
        body: JSON.stringify({ action: 'verify' }),
      },
      { DB: environment.adapter, ADMIN_PASSPHRASE: passphrase } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      ok: boolean;
      data: { payment_status: string };
    };
    expect(payload.ok).toBe(true);
    expect(payload.data.payment_status).toBe('paid');
  });
});
