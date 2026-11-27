import { describe, expect, it } from 'vitest';
import {
  listAdminOrders,
  parseOrderListFilters,
} from '../../src/lib/admin-orders';
import { loadAdminOrderDetail, loadOrderForPrint } from '../../src/lib/admin-order-detail';
import { loadAdminDashboard } from '../../src/lib/admin-dashboard';
import { loadConfig } from '../../src/lib/config';
import { countRoundTrips } from '../../src/lib/query-log';
import { createTestDb } from '../helpers/d1-sqlite';
import { insertOrder, insertOrderEvent, insertOrderItem } from '../helpers/order-fixtures';

/**
 * Page-body D1 round trips, measured against the same proxy used by dev logs.
 * The admin auth middleware adds one settings read that is outside the page.
 */
describe('admin page query counts', () => {
  function setup() {
    const env = createTestDb();
    const orderId = insertOrder(env.sqlite, { number: 'BDPAGE001' });
    insertOrderItem(env.sqlite, orderId, { title: 'Snapshot item' });
    insertOrderEvent(env.sqlite, orderId, 'created');
    return { ...env, orderId };
  }

  it('orders list page body: 2 round trips (list + config)', async () => {
    const { db, orderId } = setup();
    const { value: counted, count } = countRoundTrips(db);

    await Promise.all([
      listAdminOrders({
        db: counted,
        filters: parseOrderListFilters({}),
        cursor: null,
      }),
      loadConfig(counted),
    ]);

    expect(orderId).toBeGreaterThan(0);
    expect(count()).toBe(2);
  });

  it('dashboard page body: 1 KPI batch + 1 config = 2 round trips', async () => {
    const { db } = setup();
    const { value: counted, count } = countRoundTrips(db);

    await Promise.all([loadAdminDashboard(counted), loadConfig(counted)]);
    expect(count()).toBe(2);
  });

  it('order detail page body: 1 detail batch + 1 config = 2 round trips', async () => {
    const { db, orderId } = setup();
    const { value: counted, count } = countRoundTrips(db);

    await Promise.all([loadAdminOrderDetail(counted, orderId), loadConfig(counted)]);
    expect(count()).toBe(2);
  });

  it('invoice/packing-slip page body: 1 print batch + 1 config = 2 round trips', async () => {
    const { db, orderId } = setup();
    const { value: counted, count } = countRoundTrips(db);

    await Promise.all([loadOrderForPrint(counted, orderId), loadConfig(counted)]);
    expect(count()).toBe(2);
  });
});
