import { describe, expect, it } from 'vitest';
import {
  refreshOrderCourierStatus,
  sendOrderToCourier,
} from '../../src/lib/courier/order-courier';
import {
  CourierError,
  type Courier,
  type CourierErrorCode,
  type CourierParcelInput,
} from '../../src/lib/courier/types';
import { createTestDb } from '../helpers/d1-sqlite';
import { insertOrder, insertOrderItem } from '../helpers/order-fixtures';

class FakeCourier implements Courier {
  readonly id = 'steadfast';
  created: CourierParcelInput[] = [];
  status = 'in_review';
  failWith: CourierErrorCode | null = null;

  async createParcel(input: CourierParcelInput) {
    if (this.failWith) throw new CourierError(this.failWith);
    this.created.push(input);
    return { consignmentId: 'CID1', trackingCode: 'TRK1', status: 'in_review' };
  }

  async getStatus() {
    if (this.failWith) throw new CourierError(this.failWith);
    return { status: this.status };
  }
}

function setup(status = 'confirmed') {
  const env = createTestDb();
  const orderId = insertOrder(env.sqlite, { number: 'BDCOURIER1', status, total: 1060 });
  insertOrderItem(env.sqlite, orderId, { title: 'Panjabi', qty: 2, unitPrice: 500 });
  return { ...env, orderId };
}

function orderRow(sqlite: ReturnType<typeof createTestDb>['sqlite'], orderId: number) {
  return sqlite
    .prepare(
      `SELECT courier, consignment_id, tracking_code, courier_status,
              courier_status_updated_at, courier_claim, courier_claimed_at, updated_at
         FROM orders WHERE id = ?`,
    )
    .get(orderId) as unknown as Record<string, unknown>;
}

describe('sendOrderToCourier', () => {
  it('sends a confirmed order once and stores the parcel', async () => {
    const { db, sqlite, orderId } = setup();
    const courier = new FakeCourier();

    const result = await sendOrderToCourier({
      db,
      courier,
      orderId,
      now: '2026-11-27T10:00:00.000Z',
    });

    expect(result).toMatchObject({
      ok: true,
      existing: false,
      parcel: { consignmentId: 'CID1', trackingCode: 'TRK1', status: 'in_review' },
    });
    expect(courier.created).toHaveLength(1);
    expect(courier.created[0]).toMatchObject({
      invoice: 'BDCOURIER1',
      recipientPhone: '01712345678',
      codAmount: 1060,
      totalLot: 2,
      itemDescription: '2x Panjabi',
    });
    expect(courier.created[0]?.recipientAddress).toContain('Savar');

    expect(orderRow(sqlite, orderId)).toMatchObject({
      courier: 'steadfast',
      consignment_id: 'CID1',
      tracking_code: 'TRK1',
      courier_status: 'in_review',
      courier_status_updated_at: '2026-11-27T10:00:00.000Z',
      courier_claim: null,
      courier_claimed_at: null,
    });
  });

  it('refuses an order that is not confirmed', async () => {
    const { db, orderId } = setup('pending');
    const courier = new FakeCourier();

    const result = await sendOrderToCourier({ db, courier, orderId });
    expect(result).toMatchObject({ ok: false, code: 'not_confirmed' });
    expect(courier.created).toHaveLength(0);
  });

  it('returns the existing parcel instead of sending twice', async () => {
    const { db, orderId } = setup();
    const courier = new FakeCourier();

    await sendOrderToCourier({ db, courier, orderId });
    const second = await sendOrderToCourier({ db, courier, orderId });

    expect(second).toMatchObject({
      ok: true,
      existing: true,
      parcel: { consignmentId: 'CID1', trackingCode: 'TRK1' },
    });
    expect(courier.created).toHaveLength(1);
  });

  it('never creates two parcels when two admins click at once', async () => {
    const { db, sqlite, orderId } = setup();
    const courier = new FakeCourier();
    const now = '2026-11-27T10:00:00.000Z';

    const results = await Promise.all([
      sendOrderToCourier({ db, courier, orderId, now }),
      sendOrderToCourier({ db, courier, orderId, now }),
    ]);

    const sent = results.filter((result) => result.ok && !result.existing);
    const blocked = results.filter((result) => !result.ok && result.code === 'in_progress');
    expect(sent).toHaveLength(1);
    expect(blocked).toHaveLength(1);
    expect(courier.created).toHaveLength(1);
    expect(orderRow(sqlite, orderId).consignment_id).toBe('CID1');
  });

  it('releases the claim when the courier rejects the order', async () => {
    const { db, sqlite, orderId } = setup();
    const courier = new FakeCourier();
    courier.failWith = 'rejected';

    const failed = await sendOrderToCourier({ db, courier, orderId });
    expect(failed).toMatchObject({ ok: false, code: 'rejected' });
    expect(orderRow(sqlite, orderId)).toMatchObject({
      courier_claim: null,
      consignment_id: null,
    });

    courier.failWith = null;
    const retry = await sendOrderToCourier({ db, courier, orderId });
    expect(retry).toMatchObject({ ok: true, existing: false });
  });

  it('reports a duplicate invoice without sending again', async () => {
    const { db, sqlite, orderId } = setup();
    const courier = new FakeCourier();
    courier.failWith = 'duplicate_invoice';

    const result = await sendOrderToCourier({ db, courier, orderId });
    expect(result).toMatchObject({ ok: false, code: 'courier_duplicate' });
    expect(courier.created).toHaveLength(0);
    // The claim is released so an admin can safely retry; a retry returns the
    // same duplicate outcome rather than creating a second parcel.
    expect(orderRow(sqlite, orderId).courier_claim).toBeNull();
  });

  it('reports a missing order and a database outage', async () => {
    const { db, adapter, orderId } = setup();
    const courier = new FakeCourier();

    expect(await sendOrderToCourier({ db, courier, orderId: 999_999 })).toMatchObject({
      ok: false,
      code: 'not_found',
    });

    adapter.unavailable = true;
    expect(await sendOrderToCourier({ db, courier, orderId })).toMatchObject({
      ok: false,
      code: 'db_unavailable',
    });
  });
});

describe('refreshOrderCourierStatus', () => {
  it('refreshes the status of a sent order without changing its order status', async () => {
    const { db, sqlite, orderId } = setup();
    sqlite
      .prepare("UPDATE orders SET courier = 'steadfast', consignment_id = 'CID1' WHERE id = ?")
      .run(orderId);
    const courier = new FakeCourier();
    courier.status = 'delivered';
    const updatedBefore = orderRow(sqlite, orderId).updated_at;

    const result = await refreshOrderCourierStatus({
      db,
      courier,
      orderId,
      now: '2026-11-27T11:00:00.000Z',
    });

    expect(result).toMatchObject({ ok: true, status: 'delivered' });
    const row = orderRow(sqlite, orderId);
    expect(row).toMatchObject({
      courier_status: 'delivered',
      courier_status_updated_at: '2026-11-27T11:00:00.000Z',
    });
    // A courier refresh must not move the customer-visible "Last updated".
    expect(row.updated_at).toBe(updatedBefore);
    expect(
      (sqlite.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as { status: string })
        .status,
    ).toBe('confirmed');
  });

  it('refuses to refresh an order that was not sent', async () => {
    const { db, orderId } = setup();
    const courier = new FakeCourier();
    expect(await refreshOrderCourierStatus({ db, courier, orderId })).toMatchObject({
      ok: false,
      code: 'not_sent',
    });
  });

  it('surfaces a courier timeout during refresh', async () => {
    const { db, sqlite, orderId } = setup();
    sqlite
      .prepare("UPDATE orders SET courier = 'steadfast', consignment_id = 'CID1' WHERE id = ?")
      .run(orderId);
    const courier = new FakeCourier();
    courier.failWith = 'timeout';

    expect(await refreshOrderCourierStatus({ db, courier, orderId })).toMatchObject({
      ok: false,
      code: 'timeout',
    });
  });
});
