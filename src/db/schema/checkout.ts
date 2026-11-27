import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable } from 'drizzle-orm/sqlite-core';

/**
 * A single-row guard used inside the checkout batch. The statement
 * `INSERT OR REPLACE INTO checkout_guard (id, ok) VALUES (1, changes() = ?)`
 * fails its CHECK when not every tracked stock update matched, which makes D1
 * roll back the whole order transaction. See src/lib/checkout.ts.
 */
export const checkoutGuard = sqliteTable(
  'checkout_guard',
  {
    id: integer('id').primaryKey(),
    ok: integer('ok').notNull(),
  },
  (table) => [check('checkout_guard_ok_check', sql`${table.ok} = 1`)],
);

/**
 * A single-row guard for coupon usage inside the checkout batch. It fails its
 * CHECK when the coupon UPDATE changed no row (inactive, expired, or already
 * exhausted), which rolls back the order and stock changes in the same batch.
 */
export const couponGuard = sqliteTable(
  'coupon_guard',
  {
    id: integer('id').primaryKey(),
    ok: integer('ok').notNull(),
  },
  (table) => [check('coupon_guard_ok_check', sql`${table.ok} = 1`)],
);
