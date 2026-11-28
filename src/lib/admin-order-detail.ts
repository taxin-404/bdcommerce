import type { OrderStatus } from './order-status';

export interface AdminOrderDetailRow {
  id: number;
  number: string;
  status: OrderStatus;
  customer_name: string;
  phone: string;
  email: string | null;
  division: string | null;
  district: string | null;
  upazila: string | null;
  address: string;
  note: string | null;
  subtotal: number;
  discount: number;
  shipping_fee: number;
  total: number;
  coupon_code: string | null;
  payment_method: string;
  payment_status: string;
  payment_trx_id: string | null;
  payment_sender: string | null;
  courier: string | null;
  consignment_id: string | null;
  tracking_code: string | null;
  courier_status: string | null;
  courier_status_updated_at: string | null;
  courier_claim: string | null;
  courier_claimed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminOrderItemRow {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  title_snapshot: string;
  variant_snapshot: string | null;
  unit_price: number;
  qty: number;
  line_total: number;
  product_exists: number | null;
}

export interface AdminOrderEventRow {
  id: number;
  type: string;
  message: string | null;
  created_at: string;
}

export interface DuplicateTrxOrderRow {
  id: number;
  number: string;
  status: OrderStatus;
  created_at: string;
}

export interface AdminOrderDetail {
  order: AdminOrderDetailRow;
  items: AdminOrderItemRow[];
  events: AdminOrderEventRow[];
  blocked: boolean;
  advancePaymentRequired: boolean;
  duplicateTrxOrders: DuplicateTrxOrderRow[];
}

const ORDER_DETAIL_SQL = `SELECT id, number, status, customer_name, phone, email,
  division, district, upazila, address, note, subtotal, discount, shipping_fee, total,
  coupon_code, payment_method, payment_status, payment_trx_id, payment_sender, courier,
  consignment_id, tracking_code, courier_status, courier_status_updated_at,
  courier_claim, courier_claimed_at, created_at, updated_at
  FROM orders WHERE id = ? LIMIT 1`;

const ORDER_ITEMS_SQL = `SELECT oi.id, oi.product_id, oi.variant_id, oi.title_snapshot,
  oi.variant_snapshot, oi.unit_price, oi.qty, oi.line_total, p.id AS product_exists
  FROM order_items oi
  LEFT JOIN products p ON p.id = oi.product_id
  WHERE oi.order_id = ?
  ORDER BY oi.id`;

const ORDER_EVENTS_SQL = `SELECT id, type, message, created_at
  FROM order_events WHERE order_id = ? ORDER BY id`;

const ORDER_BLOCKED_SQL = `SELECT phone FROM blocklist
  WHERE phone = (SELECT phone FROM orders WHERE id = ?) LIMIT 1`;

const ORDER_FLAGGED_SQL = `SELECT phone FROM phone_flags
  WHERE phone = (SELECT phone FROM orders WHERE id = ?) LIMIT 1`;

const ORDER_DUPLICATE_TRX_SQL = `SELECT o.id, o.number, o.status, o.created_at
  FROM orders o
  WHERE o.id <> ?
    AND o.payment_trx_id IS NOT NULL
    AND o.payment_method = (SELECT payment_method FROM orders WHERE id = ?)
    AND o.payment_trx_id = (SELECT payment_trx_id FROM orders WHERE id = ?)
  ORDER BY o.id
  LIMIT 5`;

export async function loadAdminOrderDetail(
  db: D1Database,
  orderId: number,
): Promise<AdminOrderDetail | null> {
  const results = await db.batch([
    db.prepare(ORDER_DETAIL_SQL).bind(orderId),
    db.prepare(ORDER_ITEMS_SQL).bind(orderId),
    db.prepare(ORDER_EVENTS_SQL).bind(orderId),
    db.prepare(ORDER_BLOCKED_SQL).bind(orderId),
    db.prepare(ORDER_FLAGGED_SQL).bind(orderId),
    db.prepare(ORDER_DUPLICATE_TRX_SQL).bind(orderId, orderId, orderId),
  ]);

  const order = (results[0]?.results?.[0] ?? null) as AdminOrderDetailRow | null;
  if (!order) return null;

  return {
    order,
    items: (results[1]?.results ?? []) as AdminOrderItemRow[],
    events: (results[2]?.results ?? []) as AdminOrderEventRow[],
    blocked: Boolean(results[3]?.results?.length),
    advancePaymentRequired: Boolean(results[4]?.results?.length),
    duplicateTrxOrders: (results[5]?.results ?? []) as DuplicateTrxOrderRow[],
  };
}

/** Invoice and packing slips must not read current product/variant data. */
export async function loadOrderForPrint(
  db: D1Database,
  orderId: number,
): Promise<{ order: AdminOrderDetailRow; items: AdminOrderItemRow[] } | null> {
  const results = await db.batch([
    db.prepare(ORDER_DETAIL_SQL).bind(orderId),
    db.prepare(
      `SELECT id, product_id, variant_id, title_snapshot, variant_snapshot,
              unit_price, qty, line_total, NULL AS product_exists
         FROM order_items WHERE order_id = ? ORDER BY id`,
    ).bind(orderId),
  ]);

  const order = (results[0]?.results?.[0] ?? null) as AdminOrderDetailRow | null;
  if (!order) return null;

  return {
    order,
    items: (results[1]?.results ?? []) as AdminOrderItemRow[],
  };
}
