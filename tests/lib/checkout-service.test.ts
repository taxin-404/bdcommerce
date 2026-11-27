import { afterEach, describe, expect, it } from 'vitest';
import { createCheckoutOrder, type CheckoutLineSnapshot } from '../../src/lib/checkout';
import { generateOrderNumber } from '../../src/lib/orders';
import { createTestDb, countRows, insertProduct, type TestEnvironment } from '../helpers/d1-sqlite';

let environment: TestEnvironment | null = null;

afterEach(() => {
  environment?.close();
  environment = null;
});

const customer = {
  name: 'Service Tester',
  phone: '01712345678',
  email: null,
  division: 'Dhaka',
  district: 'Dhaka',
  upazila: 'Savar',
  address: 'House 1, Road 2, Savar',
  note: null,
};

function line(overrides: Partial<CheckoutLineSnapshot> = {}): CheckoutLineSnapshot {
  return {
    product_id: 1,
    variant_id: 11,
    title: 'Item',
    variant_title: 'M',
    variant_options: {},
    unit_price: 100,
    qty: 1,
    line_total: 100,
    track_stock: true,
    ...overrides,
  };
}

describe('createCheckoutOrder transaction', () => {
  it('rolls back every line when only part of a multi-line stock update succeeds', async () => {
    environment = createTestDb();
    const { sqlite, db } = environment;
    insertProduct(sqlite, {
      id: 1,
      title: 'Item',
      price: 100,
      variants: [
        { id: 11, title: 'Short', stock: 1 },
        { id: 12, title: 'Enough', stock: 5 },
      ],
    });

    const result = await createCheckoutOrder({
      db,
      idempotencyKey: 'partial-key',
      customer,
      lines: [
        line({ variant_id: 11, qty: 2, line_total: 200, title: 'Short' }),
        line({ variant_id: 12, qty: 1, title: 'Enough' }),
      ],
      subtotal: 300,
      shippingFee: 60,
      total: 360,
      number: generateOrderNumber(),
      requestHash: 'hash-a',
    });

    expect(result).toEqual({ ok: false, code: 'out_of_stock' });
    const stocks = sqlite
      .prepare('SELECT id, stock FROM variants ORDER BY id')
      .all() as unknown as Array<{ id: number; stock: number }>;
    expect(stocks).toEqual([
      { id: 11, stock: 1 },
      { id: 12, stock: 5 },
    ]);
    expect(countRows(sqlite, 'orders')).toBe(0);
  });

  it('returns the existing order when a duplicate key reaches the batch', async () => {
    environment = createTestDb();
    const { sqlite, db } = environment;
    const now = new Date().toISOString();
    insertProduct(sqlite, {
      id: 1,
      title: 'Item',
      price: 100,
      variants: [{ id: 11, title: 'M', stock: 5 }],
    });
    sqlite
      .prepare(
        `INSERT INTO orders (number, status, customer_name, phone, address, subtotal,
           shipping_fee, total, payment_method, payment_status, idempotency_key,
           created_at, updated_at)
         VALUES ('BDEXISTING', 'pending', 'Existing', '01712345678', 'Addr', 100,
           0, 100, 'cod', 'unpaid', 'dup-key', ?, ?)`,
      )
      .run(now, now);

    const result = await createCheckoutOrder({
      db,
      idempotencyKey: 'dup-key',
      customer,
      lines: [line()],
      subtotal: 100,
      shippingFee: 60,
      total: 160,
      number: generateOrderNumber(),
      requestHash: 'hash-a',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.existing).toBe(true);
      expect(result.order.number).toBe('BDEXISTING');
    }
    expect(countRows(sqlite, 'orders')).toBe(1);
    expect(
      (sqlite.prepare('SELECT stock FROM variants WHERE id = 11').get() as { stock: number }).stock,
    ).toBe(5);
  });

  it('retries with a fresh order number on the rare UNIQUE collision', async () => {
    environment = createTestDb();
    const { sqlite, db, adapter } = environment;
    insertProduct(sqlite, {
      id: 1,
      title: 'Item',
      price: 100,
      variants: [{ id: 11, title: 'M', stock: 5 }],
    });

    adapter.failStatementIncludes = 'INSERT INTO orders';
    adapter.failStatementMessage =
      'D1_ERROR: UNIQUE constraint failed: orders.number: SQLITE_CONSTRAINT';
    const result = await createCheckoutOrder({
      db,
      idempotencyKey: 'collision-key',
      customer,
      lines: [line()],
      subtotal: 100,
      shippingFee: 60,
      total: 160,
      number: 'BDCOLLIDE',
      requestHash: 'hash-a',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.order.number).not.toBe('BDCOLLIDE');
    expect(countRows(sqlite, 'orders')).toBe(1);
    expect(
      (sqlite.prepare('SELECT stock FROM variants WHERE id = 11').get() as { stock: number }).stock,
    ).toBe(4);
  });

  it('records which lines checkout actually tracked', async () => {
    environment = createTestDb();
    const { sqlite, db } = environment;
    insertProduct(sqlite, {
      id: 1,
      title: 'Tracked',
      price: 100,
      variants: [{ id: 11, title: 'M', stock: 5 }],
    });
    insertProduct(sqlite, {
      id: 2,
      title: 'Untracked',
      price: 50,
      trackStock: false,
      variants: [{ id: 22, title: 'One size', stock: 0 }],
    });

    const result = await createCheckoutOrder({
      db,
      idempotencyKey: 'tracked-snapshot-key',
      customer,
      lines: [
        line(),
        line({
          product_id: 2,
          variant_id: 22,
          title: 'Untracked',
          variant_title: 'One size',
          unit_price: 50,
          line_total: 50,
          track_stock: false,
        }),
      ],
      subtotal: 150,
      shippingFee: 60,
      total: 210,
      number: generateOrderNumber(),
      requestHash: 'hash-a',
    });

    expect(result.ok).toBe(true);
    const items = sqlite
      .prepare(
        `SELECT oi.variant_id, oi.stock_tracked
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
          ORDER BY oi.id`,
      )
      .all() as unknown as Array<{ variant_id: number; stock_tracked: number }>;
    expect(items).toEqual([
      { variant_id: 11, stock_tracked: 1 },
      { variant_id: 22, stock_tracked: 0 },
    ]);
  });

  it('treats a missing guard table as a database outage, not out-of-stock', async () => {
    environment = createTestDb();
    const { sqlite, db, adapter } = environment;
    insertProduct(sqlite, {
      id: 1,
      title: 'Item',
      price: 100,
      variants: [{ id: 11, title: 'M', stock: 5 }],
    });
    adapter.failStatementIncludes = 'WITH wanted';
    adapter.failStatementMessage = 'D1_ERROR: no such table: checkout_guard: SQLITE_ERROR';

    const result = await createCheckoutOrder({
      db,
      idempotencyKey: 'missing-table-key',
      customer,
      lines: [line()],
      subtotal: 100,
      shippingFee: 60,
      total: 160,
      number: generateOrderNumber(),
      requestHash: 'hash-a',
    });
    expect(result).toEqual({ ok: false, code: 'db_unavailable' });
  });
});
