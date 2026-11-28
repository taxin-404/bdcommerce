import { errorMessage, isD1Unavailable } from './db-errors';

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return ALLOWED_TRANSITIONS[from];
}

export function restoresStock(to: OrderStatus): boolean {
  return to === 'cancelled' || to === 'returned';
}

interface CurrentOrderRow {
  id: number;
  status: OrderStatus;
  payment_status: string;
}

export type ChangeOrderStatusCode =
  | 'not_found'
  | 'invalid_transition'
  | 'status_conflict'
  | 'db_unavailable';

export type ChangeOrderStatusResult =
  | {
      ok: true;
      id: number;
      from: OrderStatus;
      to: OrderStatus;
      paymentStatus: string;
      restoredStock: boolean;
    }
  | { ok: false; code: ChangeOrderStatusCode; currentStatus?: OrderStatus };

function isGuardError(message: string): boolean {
  return /order_transition_guard/i.test(message) && /CHECK constraint failed/i.test(message);
}

/**
 * Optimistic status change: the UPDATE only wins when the status is still the
 * one the admin saw. A one-row CHECK guard aborts the whole batch when the
 * update changed nothing, so a concurrent admin can never apply the same
 * transition (or restore stock) twice.
 */
export async function changeOrderStatus(input: {
  db: D1Database;
  orderId: number;
  to: OrderStatus;
  note?: string | null;
  now?: string;
}): Promise<ChangeOrderStatusResult> {
  const { db, orderId, to } = input;
  const now = input.now ?? new Date().toISOString();

  let current: CurrentOrderRow | null;
  try {
    current = await db
      .prepare('SELECT id, status, payment_status FROM orders WHERE id = ? LIMIT 1')
      .bind(orderId)
      .first<CurrentOrderRow>();
  } catch (error) {
    if (isD1Unavailable(error)) return { ok: false, code: 'db_unavailable' };
    throw error;
  }

  if (!current) return { ok: false, code: 'not_found' };
  if (!canTransition(current.status, to)) {
    return {
      ok: false,
      code: 'invalid_transition',
      currentStatus: current.status,
    };
  }

  const restore = restoresStock(to);
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE orders
            SET status = ?,
                updated_at = ?,
                payment_status = CASE
                  WHEN ? IN ('cancelled', 'returned') AND payment_status = 'paid'
                    THEN 'refunded'
                  WHEN ? = 'delivered'
                       AND payment_method = 'cod'
                       AND payment_status <> 'refunded' THEN 'paid'
                  ELSE payment_status
                END
          WHERE id = ? AND status = ?
          RETURNING status, payment_status`,
      )
      .bind(to, now, to, to, orderId, current.status),
    db
      .prepare('INSERT OR REPLACE INTO order_transition_guard (id, ok) VALUES (1, changes() = 1)'),
  ];

  if (restore) {
    statements.push(
      db
        .prepare(
          `UPDATE variants
              SET stock = stock + (
                SELECT COALESCE(SUM(oi.qty), 0)
                  FROM order_items oi
                 WHERE oi.order_id = ?
                   AND oi.variant_id = variants.id
                   AND oi.stock_tracked = 1
              )
            WHERE variants.id IN (
              SELECT oi.variant_id
                FROM order_items oi
               WHERE oi.order_id = ?
                 AND oi.variant_id IS NOT NULL
                 AND oi.stock_tracked = 1
            )
            RETURNING id`,
        )
        .bind(orderId, orderId),
    );

    // The optimistic transition above is the exactly-once guard: this batch
    // only reaches the release when the status changed, so a concurrent
    // cancel/return cannot decrement the coupon twice.
    statements.push(
      db
        .prepare(
          `UPDATE coupons
              SET used = MAX(used - 1, 0)
            WHERE code = (SELECT coupon_code FROM orders WHERE id = ?)
              AND EXISTS (
                SELECT 1 FROM orders
                 WHERE id = ? AND status IN ('cancelled', 'returned')
              )`,
        )
        .bind(orderId, orderId),
    );
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO order_events (order_id, type, message, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(orderId, to, input.note?.trim() || null, now),
  );

  let results: D1Result[];
  try {
    results = await db.batch(statements);
  } catch (error) {
    const message = errorMessage(error);
    if (isGuardError(message)) {
      return { ok: false, code: 'status_conflict' };
    }
    if (isD1Unavailable(error)) return { ok: false, code: 'db_unavailable' };
    throw error;
  }

  const updated = results[0]?.results?.[0] as
    | { status: OrderStatus; payment_status: string }
    | undefined;
  const restoredStock = restore && (results[2]?.results?.length ?? 0) > 0;

  return {
    ok: true,
    id: orderId,
    from: current.status,
    to: updated?.status ?? to,
    paymentStatus: updated?.payment_status ?? current.payment_status,
    restoredStock,
  };
}
