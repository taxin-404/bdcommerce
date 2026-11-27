import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  buildAdminOrderListQuery,
  decodeOrderCursor,
  encodeOrderCursor,
  listAdminOrders,
  parseOrderListFilters,
  type AdminOrderListFilters,
} from '../../src/lib/admin-orders';
import { loadAdminOrderDetail, loadOrderForPrint } from '../../src/lib/admin-order-detail';
import { buildAdminDashboardQueries, loadAdminDashboard } from '../../src/lib/admin-dashboard';
import { blockPhone } from '../../src/lib/blocklist';
import { createTestDb, insertProduct } from '../helpers/d1-sqlite';
import {
  insertOrder,
  insertOrderEvent,
  insertOrderItem,
} from '../helpers/order-fixtures';

function explain(sqlite: DatabaseSync, sql: string, bindings: unknown[] = []): string[] {
  const rows = sqlite
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all(...(bindings as never[])) as unknown as Array<{ detail: string }>;
  return rows.map((row) => row.detail);
}

function expectIndexed(plan: string[], label: string): void {
  console.log(`${label}: ${plan.join(' | ')}`);
  for (const line of plan) {
    expect(line, `${label} scanned: ${line}`).not.toMatch(/\bSCAN\b/i);
    expect(line, `${label} used a temp b-tree: ${line}`).not.toMatch(/TEMP B-TREE/i);
  }
}

const emptyFilters: AdminOrderListFilters = {
  status: null,
  phone: null,
  createdFrom: null,
  createdBefore: null,
};

describe('order list filters', () => {
  it('parses status, normalized phone, and Dhaka date ranges', () => {
    const parsed = parseOrderListFilters({
      status: 'shipped',
      phone: '+880 1712-345678',
      from: '2026-11-27',
      to: '2026-11-27',
    });

    expect(parsed.errors).toEqual([]);
    expect(parsed.status).toBe('shipped');
    expect(parsed.phone).toBe('01712345678');
    expect(parsed.createdFrom).toBe('2026-11-26T18:00:00.000Z');
    expect(parsed.createdBefore).toBe('2026-11-27T18:00:00.000Z');
  });

  it('reports invalid filters and clears contradictory dates', () => {
    expect(
      parseOrderListFilters({ status: 'lost', phone: '123', from: '2026-02-30' }).errors,
    ).toEqual(['invalid_status', 'invalid_phone', 'invalid_date']);

    const range = parseOrderListFilters({ from: '2026-11-28', to: '2026-11-27' });
    expect(range.errors).toContain('invalid_range');
    expect(range.createdFrom).toBeNull();
    expect(range.createdBefore).toBeNull();
  });

  it('round-trips keyset cursors and rejects tampering', () => {
    const cursor = encodeOrderCursor({ created_at: '2026-11-27T10:00:00.000Z', id: 42 });
    expect(decodeOrderCursor(cursor)).toEqual({
      createdAt: '2026-11-27T10:00:00.000Z',
      id: 42,
    });
    expect(decodeOrderCursor('not-a-cursor')).toBeNull();
    expect(decodeOrderCursor(btoa(JSON.stringify({ t: 'bad', i: 1 })))).toBeNull();
  });
});

describe('order list queries', () => {
  function setup() {
    const env = createTestDb();
    const older = insertOrder(env.sqlite, {
      number: 'BDOLD001',
      phone: '01711111111',
      status: 'pending',
      createdAt: '2026-11-26T17:00:00.000Z',
    });
    const middle = insertOrder(env.sqlite, {
      number: 'BDMID002',
      phone: '01722222222',
      status: 'confirmed',
      createdAt: '2026-11-27T09:00:00.000Z',
    });
    const newest = insertOrder(env.sqlite, {
      number: 'BDNEW003',
      phone: '01711111111',
      status: 'pending',
      createdAt: '2026-11-27T10:00:00.000Z',
    });
    return { ...env, older, middle, newest };
  }

  it('returns newest first and paginates with keyset cursors', async () => {
    const { db, newest, middle, older } = setup();

    const first = await listAdminOrders({ db, filters: emptyFilters, cursor: null, limit: 2 });
    expect(first.orders.map((order) => order.id)).toEqual([newest, middle]);
    expect(first.nextCursor).not.toBeNull();

    const second = await listAdminOrders({
      db,
      filters: emptyFilters,
      cursor: decodeOrderCursor(first.nextCursor),
      limit: 2,
    });
    expect(second.orders.map((order) => order.id)).toEqual([older]);
    expect(second.nextCursor).toBeNull();
  });

  it('filters by status, phone, and a Dhaka day', async () => {
    const { db, newest, middle, older } = setup();

    const pending = await listAdminOrders({
      db,
      filters: { ...emptyFilters, status: 'pending' },
      cursor: null,
    });
    expect(pending.orders.map((order) => order.id)).toEqual([newest, older]);

    const phone = await listAdminOrders({
      db,
      filters: { ...emptyFilters, phone: '01711111111' },
      cursor: null,
    });
    expect(phone.orders.map((order) => order.id)).toEqual([newest, older]);

    const day = parseOrderListFilters({ from: '2026-11-27', to: '2026-11-27' });
    const today = await listAdminOrders({ db, filters: day, cursor: null });
    expect(today.orders.map((order) => order.id)).toEqual([newest, middle]);

    const combined = await listAdminOrders({
      db,
      filters: { ...day, status: 'pending', phone: '01711111111' },
      cursor: null,
      limit: 1,
    });
    expect(combined.orders.map((order) => order.id)).toEqual([newest]);
  });

  it('uses indexes with no scans for every filter combination', () => {
    const { sqlite } = setup();
    const day = parseOrderListFilters({ from: '2026-11-27', to: '2026-11-27' });
    const cursor = { createdAt: '2026-11-27T10:00:00.000Z', id: 3 };

    const cases: Array<[string, AdminOrderListFilters, typeof cursor | null]> = [
      ['unfiltered', emptyFilters, null],
      ['status', { ...emptyFilters, status: 'pending' }, null],
      ['phone', { ...emptyFilters, phone: '01711111111' }, null],
      ['date', day, null],
      ['status+date', { ...day, status: 'pending' }, null],
      ['phone+status+date', { ...day, phone: '01711111111', status: 'pending' }, null],
      ['all+cursor', { ...day, phone: '01711111111', status: 'pending' }, cursor],
    ];

    for (const [label, filters, value] of cases) {
      const { sql, bindings } = buildAdminOrderListQuery(filters, value, 50);
      expectIndexed(explain(sqlite, sql, bindings), `orders ${label}`);
    }
  });
});

describe('dashboard', () => {
  it('counts Dhaka days, excludes cancelled/returned revenue, and lists low stock', async () => {
    const { db, sqlite, adapter } = createTestDb();
    insertProduct(sqlite, {
      id: 1,
      title: 'Low stock product',
      price: 100,
      trackStock: true,
      variants: [{ id: 11, stock: 2 }],
    });
    insertProduct(sqlite, {
      id: 2,
      title: 'Unlimited product',
      price: 100,
      trackStock: false,
      variants: [{ id: 22, stock: 0 }],
    });
    insertProduct(sqlite, {
      id: 3,
      title: 'Archived product',
      price: 100,
      status: 'archived',
      trackStock: true,
      variants: [{ id: 33, stock: 1 }],
    });

    insertOrder(sqlite, {
      number: 'BDTODAY1',
      status: 'pending',
      total: 500,
      createdAt: '2026-11-27T10:00:00.000Z',
    });
    insertOrder(sqlite, {
      number: 'BDTODAY2',
      status: 'delivered',
      total: 1000,
      createdAt: '2026-11-27T11:00:00.000Z',
    });
    insertOrder(sqlite, {
      number: 'BDTODAY3',
      status: 'cancelled',
      total: 700,
      createdAt: '2026-11-27T12:00:00.000Z',
    });
    insertOrder(sqlite, {
      number: 'BDTODAY4',
      status: 'delivered',
      paymentStatus: 'refunded',
      total: 600,
      createdAt: '2026-11-27T13:00:00.000Z',
    });
    insertOrder(sqlite, {
      number: 'BDYESTER1',
      status: 'pending',
      total: 300,
      createdAt: '2026-11-26T17:00:00.000Z',
    });
    insertOrder(sqlite, {
      number: 'BDOLD001',
      status: 'delivered',
      total: 999,
      createdAt: '2026-11-19T10:00:00.000Z',
    });

    const dashboard = await loadAdminDashboard(db, new Date('2026-11-27T10:00:00.000Z'));
    expect(dashboard.todayOrders).toBe(4);
    expect(dashboard.pendingOrders).toBe(2);
    expect(dashboard.weekRevenue).toBe(1800);
    expect(dashboard.lowStockCount).toBe(1);
    expect(dashboard.lowStock.map((row) => row.id)).toEqual([11]);
    expect(adapter.roundTrips).toBe(1);
  });

  it('uses indexed queries with no scans', () => {
    const { sqlite } = createTestDb();
    const { queries } = buildAdminDashboardQueries(new Date('2026-11-27T10:00:00.000Z'));

    for (const query of queries) {
      expectIndexed(explain(sqlite, query.sql, query.bindings), `dashboard ${query.label}`);
    }
  });
});

describe('order detail and print snapshots', () => {
  it('loads order, items, events, and blocklist state in one round trip', async () => {
    const { db, sqlite, adapter } = createTestDb();
    insertProduct(sqlite, {
      id: 1,
      title: 'Current title',
      price: 100,
      trackStock: true,
      variants: [{ id: 11, stock: 10 }],
    });
    const orderId = insertOrder(sqlite, {
      number: 'BDDETAIL1',
      phone: '01712345678',
      status: 'shipped',
    });
    insertOrderItem(sqlite, orderId, {
      productId: 1,
      variantId: 11,
      title: 'Stored title',
      variant: 'L / Red (size=L, color=Red)',
      qty: 2,
    });
    insertOrderEvent(sqlite, orderId, 'created', '2026-11-27T09:00:00.000Z');
    insertOrderEvent(sqlite, orderId, 'confirmed', '2026-11-27T10:00:00.000Z', 'Called buyer');

    const detail = await loadAdminOrderDetail(db, orderId);
    expect(adapter.roundTrips).toBe(1);
    expect(detail?.order.number).toBe('BDDETAIL1');
    expect(detail?.items[0]).toMatchObject({
      title_snapshot: 'Stored title',
      product_exists: 1,
    });
    expect(detail?.events.map((event) => event.type)).toEqual(['created', 'confirmed']);
    expect(detail?.blocked).toBe(false);

    await blockPhone({ db, phone: '+8801712345678', reason: 'Fake order' });
    const blocked = await loadAdminOrderDetail(db, orderId);
    expect(blocked?.blocked).toBe(true);
  });

  it('print loads never read current product data', async () => {
    const { db, sqlite, adapter } = createTestDb();
    insertProduct(sqlite, { id: 1, title: 'Current title', price: 100, trackStock: true });
    const orderId = insertOrder(sqlite, { number: 'BDPRINT1' });
    insertOrderItem(sqlite, orderId, {
      productId: 1,
      title: 'Stored title',
      qty: 1,
    });

    const data = await loadOrderForPrint(db, orderId);
    expect(adapter.roundTrips).toBe(1);
    expect(data?.items[0]?.title_snapshot).toBe('Stored title');
    expect(data?.items[0]?.product_exists).toBeNull();
  });

  it('returns null for missing orders', async () => {
    const { db } = createTestDb();
    expect(await loadAdminOrderDetail(db, 123_456)).toBeNull();
    expect(await loadOrderForPrint(db, 123_456)).toBeNull();
  });
});

describe('blocklist', () => {
  it('normalizes the phone and updates the reason on repeat', async () => {
    const { db, sqlite } = createTestDb();

    expect(await blockPhone({ db, phone: '01712345678', reason: 'First' })).toEqual({
      phone: '01712345678',
    });
    await blockPhone({ db, phone: '+880 1712-345678', reason: 'Second' });

    const rows = sqlite
      .prepare('SELECT phone, reason FROM blocklist')
      .all() as unknown as Array<{ phone: string; reason: string }>;
    expect(rows).toEqual([{ phone: '01712345678', reason: 'Second' }]);
  });

  it('rejects invalid phone numbers', async () => {
    const { db } = createTestDb();
    expect(await blockPhone({ db, phone: '12345' })).toBeNull();
  });
});
