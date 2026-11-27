import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TRANSITIONS,
  ORDER_STATUSES,
  canTransition,
  changeOrderStatus,
  type OrderStatus,
} from '../../src/lib/order-status';
import { createTestDb, insertProduct } from '../helpers/d1-sqlite';
import {
  insertOrder,
  insertOrderEvent,
  insertOrderItem,
  orderStatusCount,
  variantStock,
} from '../helpers/order-fixtures';

function setup() {
  const env = createTestDb();
  insertProduct(env.sqlite, {
    id: 1,
    price: 1000,
    trackStock: true,
    variants: [{ id: 11, stock: 10 }],
  });
  insertProduct(env.sqlite, {
    id: 2,
    price: 50,
    trackStock: false,
    variants: [{ id: 22, stock: 50 }],
  });

  const orderId = insertOrder(env.sqlite, { status: 'pending' });
  insertOrderItem(env.sqlite, orderId, {
    productId: 1,
    variantId: 11,
    qty: 2,
    unitPrice: 1000,
  });
  insertOrderItem(env.sqlite, orderId, {
    productId: 2,
    variantId: 22,
    qty: 1,
    unitPrice: 50,
    stockTracked: false,
  });
  insertOrderEvent(env.sqlite, orderId, 'created');

  return { ...env, orderId };
}

describe('transition map', () => {
  it('allows exactly the documented transitions', () => {
    const allowed = new Set(
      Object.entries(ALLOWED_TRANSITIONS).flatMap(([from, targets]) =>
        targets.map((to) => `${from}->${to}`),
      ),
    );

    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        expect(canTransition(from, to), `${from}->${to}`).toBe(allowed.has(`${from}->${to}`));
      }
    }
  });

  it('rejects skipping steps', () => {
    expect(canTransition('pending', 'delivered')).toBe(false);
    expect(canTransition('confirmed', 'delivered')).toBe(false);
    expect(canTransition('delivered', 'cancelled')).toBe(false);
    expect(canTransition('cancelled', 'pending')).toBe(false);
  });
});

describe('changeOrderStatus', () => {
  it('walks pending → confirmed → shipped → delivered and marks COD paid', async () => {
    const { db, sqlite, orderId } = setup();
    const times = [
      '2026-11-27T10:00:00.000Z',
      '2026-11-27T11:00:00.000Z',
      '2026-11-27T12:00:00.000Z',
    ];

    for (const [index, status] of (['confirmed', 'shipped', 'delivered'] as const).entries()) {
      const result = await changeOrderStatus({
        db,
        orderId,
        to: status,
        now: times[index],
      });
      expect(result).toMatchObject({ ok: true, from: expect.any(String), to: status });
    }

    const order = sqlite
      .prepare('SELECT status, payment_status FROM orders WHERE id = ?')
      .get(orderId) as unknown as { status: string; payment_status: string };
    expect(order).toEqual({ status: 'delivered', payment_status: 'paid' });
    expect(variantStock(sqlite, 11)).toBe(10);
    expect(variantStock(sqlite, 22)).toBe(50);

    const events = sqlite
      .prepare('SELECT type FROM order_events WHERE order_id = ? ORDER BY id')
      .all(orderId) as unknown as Array<{ type: string }>;
    expect(events.map((event) => event.type)).toEqual([
      'created',
      'confirmed',
      'shipped',
      'delivered',
    ]);
  });

  it('does not mark non-COD orders paid on delivery', async () => {
    const { db, sqlite, orderId } = setup();
    sqlite
      .prepare("UPDATE orders SET payment_method = 'bkash', payment_status = 'pending_verification' WHERE id = ?")
      .run(orderId);

    for (const to of ['confirmed', 'shipped', 'delivered'] as const) {
      const result = await changeOrderStatus({ db, orderId, to });
      expect(result.ok).toBe(true);
    }

    const order = sqlite
      .prepare('SELECT payment_status FROM orders WHERE id = ?')
      .get(orderId) as unknown as { payment_status: string };
    expect(order.payment_status).toBe('pending_verification');
  });

  it('restores tracked stock once on cancel and leaves untracked lines alone', async () => {
    const { db, sqlite, orderId } = setup();

    const result = await changeOrderStatus({ db, orderId, to: 'cancelled' });
    expect(result).toMatchObject({ ok: true, to: 'cancelled', restoredStock: true });
    expect(variantStock(sqlite, 11)).toBe(12);
    expect(variantStock(sqlite, 22)).toBe(50);
    expect(orderStatusCount(sqlite, orderId, 'cancelled')).toBe(1);

    const again = await changeOrderStatus({ db, orderId, to: 'cancelled' });
    expect(again).toMatchObject({ ok: false, code: 'invalid_transition' });
    expect(variantStock(sqlite, 11)).toBe(12);
  });

  it('restores stock from shipped and delivered on return', async () => {
    const { db, sqlite, orderId } = setup();

    for (const to of ['confirmed', 'shipped'] as const) {
      await changeOrderStatus({ db, orderId, to });
    }

    const result = await changeOrderStatus({ db, orderId, to: 'returned' });
    expect(result).toMatchObject({ ok: true, to: 'returned', restoredStock: true });
    expect(variantStock(sqlite, 11)).toBe(12);
    expect(orderStatusCount(sqlite, orderId, 'returned')).toBe(1);
  });

  it('restores a tracked snapshot even if live tracking was turned off afterwards', async () => {
    const { db, sqlite, orderId } = setup();
    sqlite.prepare('UPDATE products SET track_stock = 0 WHERE id = 1').run();

    const result = await changeOrderStatus({ db, orderId, to: 'cancelled' });
    expect(result).toMatchObject({ ok: true, restoredStock: true });
    expect(variantStock(sqlite, 11)).toBe(12);
  });

  it('does not restore a line that checkout did not track', async () => {
    const { db, sqlite, orderId } = setup();
    sqlite
      .prepare('UPDATE order_items SET stock_tracked = 0 WHERE order_id = ? AND variant_id = 11')
      .run(orderId);

    const result = await changeOrderStatus({ db, orderId, to: 'cancelled' });
    expect(result).toMatchObject({ ok: true, restoredStock: false });
    expect(variantStock(sqlite, 11)).toBe(10);
  });

  it('moves a paid order to refunded when it is returned', async () => {
    const { db, sqlite, orderId } = setup();

    for (const to of ['confirmed', 'shipped', 'delivered'] as const) {
      await changeOrderStatus({ db, orderId, to });
    }
    const result = await changeOrderStatus({ db, orderId, to: 'returned' });

    expect(result).toMatchObject({ ok: true, paymentStatus: 'refunded' });
    const order = sqlite
      .prepare('SELECT status, payment_status FROM orders WHERE id = ?')
      .get(orderId) as unknown as { status: string; payment_status: string };
    expect(order).toEqual({ status: 'returned', payment_status: 'refunded' });
  });

  it('rejects invalid transitions without writing an event or changing stock', async () => {
    const { db, sqlite, orderId } = setup();

    const result = await changeOrderStatus({ db, orderId, to: 'delivered' });
    expect(result).toMatchObject({ ok: false, code: 'invalid_transition' });

    const order = sqlite
      .prepare('SELECT status FROM orders WHERE id = ?')
      .get(orderId) as unknown as { status: string };
    expect(order.status).toBe('pending');
    expect(variantStock(sqlite, 11)).toBe(10);
    expect(
      (sqlite.prepare('SELECT COUNT(*) AS count FROM order_events WHERE order_id = ?').get(orderId) as unknown as { count: number })
        .count,
    ).toBe(1);
  });

  it('lets only one of two simultaneous cancels win and restores stock once', async () => {
    const { db, sqlite, orderId } = setup();

    const results = await Promise.all([
      changeOrderStatus({ db, orderId, to: 'cancelled' }),
      changeOrderStatus({ db, orderId, to: 'cancelled' }),
    ]);

    const ok = results.filter((result) => result.ok);
    const conflict = results.filter(
      (result) => !result.ok && result.code === 'status_conflict',
    );
    expect(ok).toHaveLength(1);
    expect(conflict).toHaveLength(1);

    expect(variantStock(sqlite, 11)).toBe(12);
    expect(variantStock(sqlite, 22)).toBe(50);
    expect(orderStatusCount(sqlite, orderId, 'cancelled')).toBe(1);
  });

  it('reports a missing order', async () => {
    const { db } = setup();
    const result = await changeOrderStatus({ db, orderId: 999_999, to: 'confirmed' });
    expect(result).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('reports a database outage', async () => {
    const { db, adapter, orderId } = setup();
    adapter.unavailable = true;
    const result = await changeOrderStatus({ db, orderId, to: 'confirmed' });
    expect(result).toMatchObject({ ok: false, code: 'db_unavailable' });
  });
});

describe('documented status list', () => {
  it('contains every status used by the plan', () => {
    const expected: OrderStatus[] = [
      'pending',
      'confirmed',
      'shipped',
      'delivered',
      'cancelled',
      'returned',
    ];
    expect([...ORDER_STATUSES]).toEqual(expected);
  });
});
