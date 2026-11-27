import { errorMessage, isD1Unavailable } from './db-errors';

export type PaymentAction = 'verify' | 'reject';

export type PaymentChangeCode =
  | 'not_found'
  | 'invalid_payment_method'
  | 'invalid_transition'
  | 'status_conflict'
  | 'db_unavailable';

export type PaymentChangeResult =
  | {
      ok: true;
      id: number;
      action: PaymentAction;
      from: string;
      to: 'paid' | 'unpaid' | 'refunded';
      event: 'payment_verified' | 'payment_rejected' | 'payment_refunded';
    }
  | { ok: false; code: PaymentChangeCode; currentStatus?: string };

interface CurrentPaymentRow {
  id: number;
  payment_method: string;
  payment_status: string;
  status: string;
}

function isGuardError(message: string): boolean {
  return /order_transition_guard/i.test(message) && /CHECK constraint failed/i.test(message);
}

type PaymentTarget = {
  to: 'paid' | 'unpaid' | 'refunded';
  event: 'payment_verified' | 'payment_rejected' | 'payment_refunded';
};

function targetFor(action: PaymentAction, currentStatus: string): PaymentTarget | null {
  if (action === 'verify') {
    return currentStatus === 'pending_verification'
      ? { to: 'paid', event: 'payment_verified' }
      : null;
  }
  if (currentStatus === 'pending_verification') {
    return { to: 'unpaid', event: 'payment_rejected' };
  }
  if (currentStatus === 'paid') {
    return { to: 'refunded', event: 'payment_refunded' };
  }
  return null;
}

/**
 * Manual wallet payment verification. The optimistic UPDATE plus one-row
 * guard makes verify/reject idempotent and race-safe: two admins cannot apply
 * the same payment decision or write two audit events.
 */
export async function changePaymentStatus(input: {
  db: D1Database;
  orderId: number;
  action: PaymentAction;
  note?: string | null;
  now?: string;
}): Promise<PaymentChangeResult> {
  const { db, orderId, action } = input;
  const now = input.now ?? new Date().toISOString();

  let current: CurrentPaymentRow | null;
  try {
    current = await db
      .prepare(
        'SELECT id, payment_method, payment_status, status FROM orders WHERE id = ? LIMIT 1',
      )
      .bind(orderId)
      .first<CurrentPaymentRow>();
  } catch (error) {
    if (isD1Unavailable(error)) return { ok: false, code: 'db_unavailable' };
    throw error;
  }

  if (!current) return { ok: false, code: 'not_found' };
  if (current.payment_method !== 'bkash' && current.payment_method !== 'nagad') {
    return { ok: false, code: 'invalid_payment_method' };
  }
  if (current.status === 'cancelled' || current.status === 'returned') {
    return {
      ok: false,
      code: 'invalid_transition',
      currentStatus: current.payment_status,
    };
  }

  const target = targetFor(action, current.payment_status);
  if (!target) {
    return {
      ok: false,
      code: 'invalid_transition',
      currentStatus: current.payment_status,
    };
  }

  let results: D1Result[];
  try {
    results = await db.batch([
      db
        .prepare(
          `UPDATE orders
              SET payment_status = ?, updated_at = ?
            WHERE id = ?
              AND payment_status = ?
              AND payment_method IN ('bkash', 'nagad')
              AND status NOT IN ('cancelled', 'returned')`,
        )
        .bind(target.to, now, orderId, current.payment_status),
      db.prepare(
        'INSERT OR REPLACE INTO order_transition_guard (id, ok) VALUES (1, changes() = 1)',
      ),
      db
        .prepare(
          `INSERT INTO order_events (order_id, type, message, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(orderId, target.event, input.note?.trim() || null, now),
    ]);
  } catch (error) {
    if (isGuardError(errorMessage(error))) {
      return { ok: false, code: 'status_conflict' };
    }
    if (isD1Unavailable(error)) return { ok: false, code: 'db_unavailable' };
    throw error;
  }

  if (!results[0]?.meta.changes) {
    return { ok: false, code: 'status_conflict' };
  }

  return {
    ok: true,
    id: orderId,
    action,
    from: current.payment_status,
    to: target.to,
    event: target.event as 'payment_verified' | 'payment_rejected' | 'payment_refunded',
  };
}
