import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../helpers/d1-sqlite';
import { insertOrder } from '../helpers/order-fixtures';

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

const NOW = '2026-11-27T12:00:00.000Z';

const queries: Array<{ label: string; sql: string; bindings: unknown[] }> = [
  {
    label: 'phone orders in 24h (fraud)',
    sql: 'SELECT COUNT(*) AS count FROM orders WHERE phone = ? AND created_at >= ?',
    bindings: ['01712345678', NOW],
  },
  {
    label: 'ip orders in 24h (fraud)',
    sql: 'SELECT COUNT(*) AS count FROM orders WHERE ip_hash = ? AND created_at >= ?',
    bindings: ['a'.repeat(64), NOW],
  },
  {
    label: 'blocklist lookup (checkout)',
    sql: 'SELECT 1 AS found FROM blocklist WHERE phone = ? LIMIT 1',
    bindings: ['01712345678'],
  },
  {
    label: 'phone flag lookup (checkout)',
    sql: 'SELECT 1 AS found FROM phone_flags WHERE phone = ? LIMIT 1',
    bindings: ['01712345678'],
  },
  {
    label: 'blocklist lookup by order (admin detail)',
    sql: 'SELECT phone FROM blocklist WHERE phone = (SELECT phone FROM orders WHERE id = ?) LIMIT 1',
    bindings: [1],
  },
  {
    label: 'phone flag lookup by order (admin detail)',
    sql: 'SELECT phone FROM phone_flags WHERE phone = (SELECT phone FROM orders WHERE id = ?) LIMIT 1',
    bindings: [1],
  },
  {
    label: 'duplicate transaction id (admin detail)',
    sql: `SELECT o.id, o.number, o.status, o.created_at
            FROM orders o
           WHERE o.id <> ?
             AND o.payment_trx_id IS NOT NULL
             AND o.payment_method = (SELECT payment_method FROM orders WHERE id = ?)
             AND o.payment_trx_id = (SELECT payment_trx_id FROM orders WHERE id = ?)
           ORDER BY o.id
           LIMIT 5`,
    bindings: [1, 1, 1],
  },
  {
    label: 'courier claim update',
    sql: `UPDATE orders
             SET courier_claim = ?, courier_claimed_at = ?
           WHERE id = ?
             AND status = 'confirmed'
             AND consignment_id IS NULL
             AND (courier_claim IS NULL OR courier_claimed_at IS NULL OR courier_claimed_at < ?)`,
    bindings: ['claim', NOW, 1, NOW],
  },
  {
    label: 'courier complete update',
    sql: `UPDATE orders
             SET courier = ?, consignment_id = ?, tracking_code = ?, courier_status = ?,
                 courier_status_updated_at = ?, courier_claim = NULL, courier_claimed_at = NULL,
                 updated_at = ?
           WHERE id = ? AND courier_claim = ? AND consignment_id IS NULL`,
    bindings: ['steadfast', 'CID', 'TRK', 'in_review', NOW, NOW, 1, 'claim'],
  },
  {
    label: 'courier refresh select',
    sql: 'SELECT courier, consignment_id FROM orders WHERE id = ? LIMIT 1',
    bindings: [1],
  },
  {
    label: 'courier refresh update',
    sql: `UPDATE orders
             SET courier_status = ?, courier_status_updated_at = ?
           WHERE id = ? AND consignment_id = ?`,
    bindings: ['delivered', NOW, 1, 'CID'],
  },
];

describe('Phase 7 query plans', () => {
  it.each(queries)('$label uses an index', ({ sql, bindings, label }) => {
    const { sqlite } = createTestDb();
    insertOrder(sqlite, { number: 'BDPLAN1', phone: '01712345678' });
    expectIndexed(explain(sqlite, sql, bindings), label);
  });
});
