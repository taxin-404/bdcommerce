import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable } from 'drizzle-orm/sqlite-core';

/**
 * A single-row guard used inside the order status batch. The statement
 * `INSERT OR REPLACE INTO order_transition_guard (id, ok) VALUES (1, changes() = 1)`
 * aborts the batch (and rolls back the status change and stock restore) when
 * another admin already won the optimistic UPDATE.
 */
export const orderTransitionGuard = sqliteTable(
  'order_transition_guard',
  {
    id: integer('id').primaryKey(),
    ok: integer('ok').notNull(),
  },
  (table) => [check('order_transition_guard_ok_check', sql`${table.ok} = 1`)],
);
