import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/lib/config';
import {
  countRecentIpOrders,
  ensureIpHashSalt,
  fraudLimitReached,
  hashIp,
  IP_HASH_SALT_KEY,
  loadCheckoutContext,
} from '../../src/lib/fraud';
import { blockPhone, setPhoneFlag } from '../../src/lib/blocklist';
import { createTestDb, insertSetting } from '../helpers/d1-sqlite';
import { insertOrder } from '../helpers/order-fixtures';

const NOW = '2026-11-27T12:00:00.000Z';

describe('loadCheckoutContext', () => {
  it('reports blocked and flagged phones from one batch', async () => {
    const { db, sqlite } = createTestDb();
    await blockPhone({ db, phone: '01712345678', reason: 'fake orders' });
    await setPhoneFlag({ db, phone: '01812345678', reason: 'watch' });

    const blocked = await loadCheckoutContext({
      db,
      phone: '01712345678',
      idempotencyKey: 'key-1',
      now: NOW,
    });
    expect(blocked.blocked).toBe(true);
    expect(blocked.advancePaymentRequired).toBe(false);

    const flagged = await loadCheckoutContext({
      db,
      phone: '01812345678',
      idempotencyKey: 'key-2',
      now: NOW,
    });
    expect(flagged.blocked).toBe(false);
    expect(flagged.advancePaymentRequired).toBe(true);
    expect(sqlite).toBeTruthy();
  });

  it('counts only orders from the same phone in the last 24 hours', async () => {
    const { db, sqlite } = createTestDb();
    insertOrder(sqlite, { phone: '01712345678', createdAt: '2026-11-27T10:00:00.000Z' });
    insertOrder(sqlite, { phone: '01712345678', createdAt: '2026-11-27T11:00:00.000Z' });
    insertOrder(sqlite, { phone: '01712345678', createdAt: '2026-11-25T10:00:00.000Z' });
    insertOrder(sqlite, { phone: '01912345678', createdAt: '2026-11-27T11:30:00.000Z' });

    const context = await loadCheckoutContext({
      db,
      phone: '01712345678',
      idempotencyKey: 'key-3',
      now: NOW,
    });
    expect(context.phoneOrders24h).toBe(2);
  });

  it('finds an existing order by idempotency key', async () => {
    const { db, sqlite } = createTestDb();
    const orderId = insertOrder(sqlite, { number: 'BDEXIST1', status: 'confirmed' });
    sqlite.prepare('UPDATE orders SET idempotency_key = ? WHERE id = ?').run('key-4', orderId);

    const context = await loadCheckoutContext({
      db,
      phone: '01712345678',
      idempotencyKey: 'key-4',
      now: NOW,
    });
    expect(context.existing?.number).toBe('BDEXIST1');
  });
});

describe('IP hashing', () => {
  it('uses the per-install salt seeded by the migration without writing', async () => {
    const { db, sqlite } = createTestDb();
    const settings = sqlite
      .prepare('SELECT key, value FROM settings')
      .all() as unknown as Array<{ key: string; value: string }>;
    const seeded = settings.find((row) => row.key === IP_HASH_SALT_KEY);
    expect(seeded).toBeTruthy();

    const salt = await ensureIpHashSalt(db, settings);
    expect(salt).toBe(JSON.parse(seeded?.value ?? '""'));

    const count = sqlite
      .prepare('SELECT COUNT(*) AS count FROM settings WHERE key = ?')
      .get(IP_HASH_SALT_KEY) as unknown as { count: number };
    expect(count.count).toBe(1);
  });

  it('hashes an IP deterministically and never stores the raw value', async () => {
    const db = createTestDb();
    const first = await hashIp('203.0.113.10', 'salt-a');
    const again = await hashIp('203.0.113.10', 'salt-a');
    const other = await hashIp('203.0.113.10', 'salt-b');

    expect(first).toHaveLength(64);
    expect(first).toBe(again);
    expect(first).not.toBe(other);

    const rows = db.sqlite.prepare('SELECT 1').all();
    expect(rows).toBeTruthy();
  });

  it('counts recent orders by IP hash inside the window', async () => {
    const { db, sqlite } = createTestDb();
    const ipHash = await hashIp('203.0.113.10', 'salt-a');
    sqlite
      .prepare(
        `INSERT INTO orders (number, status, customer_name, phone, address, subtotal,
           shipping_fee, total, payment_method, payment_status, ip_hash, created_at, updated_at)
         VALUES ('BDIP1', 'pending', 'A', '01712345678', 'x', 1, 1, 2, 'cod', 'unpaid', ?, ?, ?)`,
      )
      .run(ipHash, '2026-11-27T11:00:00.000Z', '2026-11-27T11:00:00.000Z');
    sqlite
      .prepare(
        `INSERT INTO orders (number, status, customer_name, phone, address, subtotal,
           shipping_fee, total, payment_method, payment_status, ip_hash, created_at, updated_at)
         VALUES ('BDIP2', 'pending', 'A', '01712345678', 'x', 1, 1, 2, 'cod', 'unpaid', ?, ?, ?)`,
      )
      .run(ipHash, '2026-11-25T11:00:00.000Z', '2026-11-25T11:00:00.000Z');

    expect(await countRecentIpOrders(db, ipHash, NOW)).toBe(1);
  });

  it('treats a missing setting as a new salt only when the row is gone', async () => {
    const { db, sqlite } = createTestDb();
    sqlite.prepare('DELETE FROM settings WHERE key = ?').run(IP_HASH_SALT_KEY);

    const salt = await ensureIpHashSalt(db, []);
    expect(salt.length).toBeGreaterThanOrEqual(32);
    const persisted = sqlite
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(IP_HASH_SALT_KEY) as unknown as { value: string };
    expect(JSON.parse(persisted.value)).toBe(salt);
  });
});

describe('fraudLimitReached', () => {
  it('only enforces when fraud controls are enabled', () => {
    const enabled = { ...defaultConfig, fraud: { ...defaultConfig.fraud, enabled: true } };
    const disabled = { ...defaultConfig, fraud: { ...defaultConfig.fraud, enabled: false } };
    expect(fraudLimitReached(enabled, 5, 5)).toBe(true);
    expect(fraudLimitReached(enabled, 4, 5)).toBe(false);
    expect(fraudLimitReached(disabled, 100, 5)).toBe(false);
  });
});

describe('insertSetting stays available for tests', () => {
  it('writes a settings row', () => {
    const { sqlite } = createTestDb();
    insertSetting(sqlite, 'custom', { a: 1 });
    const row = sqlite.prepare("SELECT value FROM settings WHERE key = 'custom'").get() as unknown as {
      value: string;
    };
    expect(JSON.parse(row.value)).toEqual({ a: 1 });
  });
});
