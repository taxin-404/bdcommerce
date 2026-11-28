import { isD1Unavailable } from '../db-errors';
import { CourierError, type Courier, type CourierErrorCode, type CourierParcel } from './types';

const CLAIM_TTL_MS = 2 * 60 * 1000;

interface CourierOrderRow {
  id: number;
  number: string;
  status: string;
  customer_name: string;
  phone: string;
  address: string;
  upazila: string | null;
  district: string | null;
  division: string | null;
  note: string | null;
  total: number;
  payment_method: string;
  courier: string | null;
  consignment_id: string | null;
  tracking_code: string | null;
  courier_status: string | null;
}

interface CourierItemRow {
  title_snapshot: string;
  qty: number;
}

export type CourierOrderErrorCode =
  | 'not_found'
  | 'not_confirmed'
  | 'not_sent'
  | 'in_progress'
  | 'courier_conflict'
  | 'courier_duplicate'
  | 'db_unavailable'
  | CourierErrorCode;

export type SendParcelResult =
  | { ok: true; parcel: CourierParcel; existing: boolean }
  | { ok: false; code: CourierOrderErrorCode };

export type RefreshParcelResult =
  | { ok: true; status: string }
  | { ok: false; code: CourierOrderErrorCode };

const ORDER_SQL = `SELECT id, number, status, customer_name, phone, address, upazila,
  district, division, note, total, payment_method, courier, consignment_id,
  tracking_code, courier_status
  FROM orders WHERE id = ? LIMIT 1`;

const ITEMS_SQL = `SELECT title_snapshot, qty FROM order_items
  WHERE order_id = ? ORDER BY id`;

function existingParcel(row: CourierOrderRow): CourierParcel {
  return {
    consignmentId: row.consignment_id ?? '',
    trackingCode: row.tracking_code ?? '',
    status: row.courier_status ?? '',
  };
}

async function releaseClaim(
  db: D1Database,
  orderId: number,
  claim: string,
): Promise<void> {
  try {
    await db
      .prepare(
        `UPDATE orders
            SET courier_claim = NULL, courier_claimed_at = NULL
          WHERE id = ? AND courier_claim = ?`,
      )
      .bind(orderId, claim)
      .run();
  } catch {
    // Best effort: the stale-claim window lets an admin retry later.
  }
}

/**
 * Sends an order to the courier only after winning a short-lived claim on the
 * order row. Two admins (or a double click) can never create two parcels.
 */
export async function sendOrderToCourier(input: {
  db: D1Database;
  courier: Courier;
  orderId: number;
  now?: string;
}): Promise<SendParcelResult> {
  const { db, courier, orderId } = input;
  const now = input.now ?? new Date().toISOString();
  const staleBefore = new Date(Date.parse(now) - CLAIM_TTL_MS).toISOString();
  const claim = crypto.randomUUID();

  let results: D1Result[];
  try {
    results = await db.batch([
      db
        .prepare(
          `UPDATE orders
              SET courier_claim = ?, courier_claimed_at = ?
            WHERE id = ?
              AND status = 'confirmed'
              AND consignment_id IS NULL
              AND (
                courier_claim IS NULL
                OR courier_claimed_at IS NULL
                OR courier_claimed_at < ?
              )
            RETURNING id`,
        )
        .bind(claim, now, orderId, staleBefore),
      db.prepare(ORDER_SQL).bind(orderId),
      db.prepare(ITEMS_SQL).bind(orderId),
    ]);
  } catch (error) {
    if (isD1Unavailable(error)) return { ok: false, code: 'db_unavailable' };
    throw error;
  }

  const claimed = (results[0]?.results?.length ?? 0) > 0;
  const order = results[1]?.results?.[0] as CourierOrderRow | undefined;
  if (!order) return { ok: false, code: 'not_found' };

  if (!claimed) {
    if (order.consignment_id) {
      return { ok: true, existing: true, parcel: existingParcel(order) };
    }
    if (order.status !== 'confirmed') return { ok: false, code: 'not_confirmed' };
    return { ok: false, code: 'in_progress' };
  }

  const items = (results[2]?.results ?? []) as CourierItemRow[];
  const recipientAddress = [order.address, order.upazila, order.district, order.division]
    .filter(Boolean)
    .join(', ');
  const totalLot = items.reduce((total, item) => total + item.qty, 0);
  const itemDescription =
    items
      .map((item) => `${item.qty}x ${item.title_snapshot}`)
      .join(', ')
      .slice(0, 250) || `Order ${order.number}`;

  let parcel: CourierParcel;
  try {
    parcel = await courier.createParcel({
      invoice: order.number,
      recipientName: order.customer_name,
      recipientPhone: order.phone,
      recipientAddress,
      codAmount: order.payment_method === 'cod' ? order.total : 0,
      note: order.note,
      itemDescription,
      totalLot,
    });
  } catch (error) {
    await releaseClaim(db, orderId, claim);
    if (error instanceof CourierError) {
      // Steadfast already has a parcel for this invoice. Retrying is safe
      // (no second parcel is created), but an admin must reconcile it in the
      // Steadfast portal before the order is marked sent.
      if (error.code === 'duplicate_invoice') {
        return { ok: false, code: 'courier_duplicate' };
      }
      return { ok: false, code: error.code };
    }
    throw error;
  }

  let completed: { id: number } | null;
  try {
    completed = await db
      .prepare(
        `UPDATE orders
            SET courier = ?,
                consignment_id = ?,
                tracking_code = ?,
                courier_status = ?,
                courier_status_updated_at = ?,
                courier_claim = NULL,
                courier_claimed_at = NULL,
                updated_at = ?
          WHERE id = ? AND courier_claim = ? AND consignment_id IS NULL
          RETURNING id`,
      )
      .bind(
        courier.id,
        parcel.consignmentId,
        parcel.trackingCode,
        parcel.status || null,
        now,
        now,
        orderId,
        claim,
      )
      .first<{ id: number }>();
  } catch (error) {
    if (isD1Unavailable(error)) return { ok: false, code: 'db_unavailable' };
    throw error;
  }

  if (!completed) {
    const current = await db
      .prepare('SELECT consignment_id, tracking_code, courier_status FROM orders WHERE id = ?')
      .bind(orderId)
      .first<{
        consignment_id: string | null;
        tracking_code: string | null;
        courier_status: string | null;
      }>();
    if (current?.consignment_id) {
      return {
        ok: true,
        existing: true,
        parcel: {
          consignmentId: current.consignment_id,
          trackingCode: current.tracking_code ?? '',
          status: current.courier_status ?? '',
        },
      };
    }
    return { ok: false, code: 'courier_conflict' };
  }

  return { ok: true, existing: false, parcel };
}

export async function refreshOrderCourierStatus(input: {
  db: D1Database;
  courier: Courier;
  orderId: number;
  now?: string;
}): Promise<RefreshParcelResult> {
  const { db, courier, orderId } = input;
  const now = input.now ?? new Date().toISOString();

  let order:
    | { courier: string | null; consignment_id: string | null }
    | null;
  try {
    order = await db
      .prepare('SELECT courier, consignment_id FROM orders WHERE id = ? LIMIT 1')
      .bind(orderId)
      .first<{ courier: string | null; consignment_id: string | null }>();
  } catch (error) {
    if (isD1Unavailable(error)) return { ok: false, code: 'db_unavailable' };
    throw error;
  }

  if (!order) return { ok: false, code: 'not_found' };
  if (!order.consignment_id || order.courier !== courier.id) {
    return { ok: false, code: 'not_sent' };
  }

  let status: string;
  try {
    status = (await courier.getStatus(order.consignment_id)).status;
  } catch (error) {
    if (error instanceof CourierError) return { ok: false, code: error.code };
    throw error;
  }

  try {
    // A courier refresh is not an order change, so it must not move the
    // customer-visible `updated_at` (shown as "Last updated" on /track).
    await db
      .prepare(
        `UPDATE orders
            SET courier_status = ?,
                courier_status_updated_at = ?
          WHERE id = ? AND consignment_id = ?`,
      )
      .bind(status, now, orderId, order.consignment_id)
      .run();
  } catch (error) {
    if (isD1Unavailable(error)) return { ok: false, code: 'db_unavailable' };
    throw error;
  }

  return { ok: true, status };
}
