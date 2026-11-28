import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../../src/api/app';
import { ADMIN_COOKIE_NAME, createSessionCookie } from '../../src/lib/auth';
import { createTestDb, insertCoupon, type TestEnvironment } from '../helpers/d1-sqlite';
import { insertOrder } from '../helpers/order-fixtures';

const PASSPHRASE = 'a-strong-test-passphrase-123';
let environment: TestEnvironment | null = null;

afterEach(() => {
  environment?.close();
  environment = null;
});

function env(): Env {
  if (!environment) throw new Error('test database is not ready');
  return { DB: environment.adapter, ADMIN_PASSPHRASE: PASSPHRASE } as unknown as Env;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!environment) throw new Error('test database is not ready');
  const cookie = await createSessionCookie(environment.db, PASSPHRASE, Date.now());
  return {
    'content-type': 'application/json',
    cookie: `${ADMIN_COOKIE_NAME}=${cookie}`,
  };
}

async function patch(code: string, body: unknown): Promise<Response> {
  return app.request(
    `/api/admin/coupons/${code}`,
    { method: 'PATCH', headers: await authHeaders(), body: JSON.stringify(body) },
    env(),
  );
}

describe('Phase 8A coupon editing', () => {
  it('edits value, type, window, and max uses', async () => {
    environment = createTestDb();
    insertCoupon(environment.sqlite, {
      code: 'SAVE10',
      type: 'percent',
      value: 10,
      used: 2,
      maxUses: 10,
    });

    const response = await patch('SAVE10', {
      type: 'fixed',
      value: 150,
      min_subtotal: 1000,
      max_uses: 20,
      starts_at: '2026-11-01T00:00:00.000Z',
      ends_at: '2026-12-01T00:00:00.000Z',
      active: true,
    });

    expect(response.status).toBe(200);
    const row = environment.sqlite
      .prepare('SELECT * FROM coupons WHERE code = ?')
      .get('SAVE10') as unknown as Record<string, unknown>;
    expect(row).toMatchObject({
      type: 'fixed',
      value: 150,
      min_subtotal: 1000,
      max_uses: 20,
      used: 2,
      starts_at: '2026-11-01T00:00:00.000Z',
      ends_at: '2026-12-01T00:00:00.000Z',
      active: 1,
    });
  });

  it('never sets max uses below the current used count', async () => {
    environment = createTestDb();
    insertCoupon(environment.sqlite, { code: 'USED5', used: 5, maxUses: 10 });

    const response = await patch('USED5', { max_uses: 4 });
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('coupon_max_uses_below_used');

    const row = environment.sqlite
      .prepare('SELECT max_uses FROM coupons WHERE code = ?')
      .get('USED5') as unknown as { max_uses: number };
    expect(row.max_uses).toBe(10);
  });

  it('allows clearing max uses (unlimited) even after use', async () => {
    environment = createTestDb();
    insertCoupon(environment.sqlite, { code: 'UNLIMIT', used: 50, maxUses: 50 });

    const response = await patch('UNLIMIT', { max_uses: null });
    expect(response.status).toBe(200);
    const row = environment.sqlite
      .prepare('SELECT max_uses FROM coupons WHERE code = ?')
      .get('UNLIMIT') as unknown as { max_uses: number | null };
    expect(row.max_uses).toBeNull();
  });

  it('validates percent values and the date window on edit', async () => {
    environment = createTestDb();
    insertCoupon(environment.sqlite, { code: 'BADEDIT', type: 'percent', value: 10 });

    const percent = await patch('BADEDIT', { value: 150 });
    expect(percent.status).toBe(400);

    const window = await patch('BADEDIT', {
      starts_at: '2026-12-02T00:00:00.000Z',
      ends_at: '2026-12-01T00:00:00.000Z',
    });
    expect(window.status).toBe(400);
  });

  it('does not change discounts already stored on past orders', async () => {
    environment = createTestDb();
    insertCoupon(environment.sqlite, { code: 'PAST10', type: 'percent', value: 10 });
    const orderId = insertOrder(environment.sqlite, {
      number: 'BDPAST001',
      subtotal: 2000,
      discount: 200,
      total: 1860,
    });
    environment.sqlite
      .prepare('UPDATE orders SET coupon_code = ? WHERE id = ?')
      .run('PAST10', orderId);

    const response = await patch('PAST10', { value: 50 });
    expect(response.status).toBe(200);

    const order = environment.sqlite
      .prepare('SELECT discount, total, coupon_code FROM orders WHERE id = ?')
      .get(orderId) as unknown as { discount: number; total: number; coupon_code: string };
    expect(order).toEqual({ discount: 200, total: 1860, coupon_code: 'PAST10' });
  });

  it('keeps the active toggle working through the same endpoint', async () => {
    environment = createTestDb();
    insertCoupon(environment.sqlite, { code: 'TOGGLE', active: true });

    const response = await patch('TOGGLE', { active: false });
    expect(response.status).toBe(200);
    const row = environment.sqlite
      .prepare('SELECT active FROM coupons WHERE code = ?')
      .get('TOGGLE') as unknown as { active: number };
    expect(row.active).toBe(0);
  });
});