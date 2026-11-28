import { and, inArray, sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../../src/api/app';
import { getDb } from '../../src/db/client';
import { orderTransitionGuard, variants } from '../../src/db/schema';
import { ADMIN_COOKIE_NAME, createSessionCookie } from '../../src/lib/auth';
import { createTestDb, insertProduct, type TestEnvironment } from '../helpers/d1-sqlite';
import { insertOrder, insertOrderItem } from '../helpers/order-fixtures';

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

function seedProductAndOrder(status: string): number {
  if (!environment) throw new Error('test database is not ready');
  insertProduct(environment.sqlite, {
    id: 1,
    title: 'Panjabi',
    price: 1000,
    variants: [{ id: 11, title: 'L', stock: 3 }],
  });
  const orderId = insertOrder(environment.sqlite, {
    number: `BDINV${status.toUpperCase()}`,
    status,
  });
  insertOrderItem(environment.sqlite, orderId, { productId: 1, variantId: 11 });
  return orderId;
}

describe('Phase 8A inventory delete guards', () => {
  it.each(['pending', 'confirmed', 'shipped'])(
    'refuses to delete a product that is in a %s order',
    async (status) => {
      environment = createTestDb();
      seedProductAndOrder(status);

      const response = await app.request(
        '/api/admin/products/1',
        { method: 'DELETE', headers: await authHeaders() },
        env(),
      );

      expect(response.status).toBe(409);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe('product_in_active_orders');
      expect(
        environment.sqlite.prepare('SELECT COUNT(*) AS count FROM products').get(),
      ).toMatchObject({ count: 1 });
    },
  );

  it('refuses to delete a variant that is in an active order', async () => {
    environment = createTestDb();
    seedProductAndOrder('confirmed');

    const response = await app.request(
      '/api/admin/products/1',
      {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ variants: [] }),
      },
      env(),
    );

    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('variant_in_active_orders');
    expect(
      environment.sqlite.prepare('SELECT COUNT(*) AS count FROM variants').get(),
    ).toMatchObject({ count: 1 });
  });

  it.each(['delivered', 'cancelled', 'returned'])(
    'allows deleting a product that only appears in %s orders',
    async (status) => {
      environment = createTestDb();
      seedProductAndOrder(status);

      const response = await app.request(
        '/api/admin/products/1',
        { method: 'DELETE', headers: await authHeaders() },
        env(),
      );

      expect(response.status).toBe(200);
      expect(
        environment.sqlite.prepare('SELECT COUNT(*) AS count FROM products').get(),
      ).toMatchObject({ count: 0 });
    },
  );

  it('rolls back a mixed variant delete when the active-order guard fails', async () => {
    environment = createTestDb();
    insertProduct(environment.sqlite, {
      id: 1,
      title: 'Panjabi',
      price: 1000,
      variants: [
        { id: 11, title: 'L', stock: 3 },
        { id: 12, title: 'M', stock: 3 },
      ],
    });
    const orderId = insertOrder(environment.sqlite, {
      number: 'BDINVRACE',
      status: 'pending',
    });
    insertOrderItem(environment.sqlite, orderId, { productId: 1, variantId: 11 });

    const db = getDb(environment.db);
    const removed = [11, 12];
    const statements = [
      db
        .delete(variants)
        .where(
          and(
            inArray(variants.id, removed),
            sql`NOT EXISTS (
              SELECT 1
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
               WHERE oi.variant_id = variants.id
                 AND o.status IN ('pending', 'confirmed', 'shipped')
            )`,
          ),
        ),
      db
        .insert(orderTransitionGuard)
        .values({
          id: 1,
          ok: sql`changes() = ${removed.length}` as unknown as number,
        })
        .onConflictDoUpdate({
          target: orderTransitionGuard.id,
          set: { ok: sql`changes() = ${removed.length}` as unknown as number },
        }),
    ];

    const batch = statements as unknown as Parameters<typeof db.batch>[0];
    await expect(db.batch(batch)).rejects.toThrow(/CHECK constraint failed/i);

    expect(
      environment.sqlite.prepare('SELECT COUNT(*) AS count FROM variants').get(),
    ).toMatchObject({ count: 2 });
  });

  it('allows removing a variant that only appears in a delivered order', async () => {
    environment = createTestDb();
    seedProductAndOrder('delivered');

    const response = await app.request(
      '/api/admin/products/1',
      {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ variants: [] }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    expect(
      environment.sqlite.prepare('SELECT COUNT(*) AS count FROM variants').get(),
    ).toMatchObject({ count: 0 });
  });
});