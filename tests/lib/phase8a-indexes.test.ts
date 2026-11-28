import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../helpers/d1-sqlite';
import { insertOrder, insertOrderItem } from '../helpers/order-fixtures';

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

describe('Phase 8A query plans', () => {
  it('paid-only cash metric searches the created_at index', () => {
    const { sqlite } = createTestDb();
    const plan = explain(
      sqlite,
      `SELECT COALESCE(SUM(total), 0) AS cash
         FROM orders
        WHERE payment_status = 'paid'
          AND created_at >= ? AND created_at < ?`,
      ['2026-11-21T18:00:00.000Z', '2026-11-28T18:00:00.000Z'],
    );
    expectIndexed(plan, 'dashboard cash collected');
    expect(plan.join(' ')).toMatch(/idx_orders_created_id/);
  });

  it('inventory delete guards search orders and order_items by index', () => {
    const { sqlite } = createTestDb();
    const orderId = insertOrder(sqlite, { number: 'BDPLAN8A' });
    insertOrderItem(sqlite, orderId, { productId: 1, variantId: 11 });

    expectIndexed(
      explain(
        sqlite,
        `SELECT 1 AS found
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
          WHERE oi.product_id = ?
            AND o.status IN ('pending', 'confirmed', 'shipped')
          LIMIT 1`,
        [1],
      ),
      'product active-order guard',
    );

    expectIndexed(
      explain(
        sqlite,
        `SELECT oi.variant_id
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
          WHERE oi.variant_id IN (?)
            AND o.status IN ('pending', 'confirmed', 'shipped')`,
        [11],
      ),
      'variant active-order guard',
    );
  });

  });