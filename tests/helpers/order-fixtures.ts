import type { DatabaseSync } from 'node:sqlite';

export interface OrderFixture {
  number?: string;
  status?: string;
  phone?: string;
  customerName?: string;
  address?: string;
  paymentMethod?: 'cod' | 'bkash' | 'nagad';
  paymentStatus?: string;
  subtotal?: number;
  shippingFee?: number;
  total?: number;
  discount?: number;
  createdAt?: string;
  updatedAt?: string;
  note?: string | null;
}

export function insertOrder(sqlite: DatabaseSync, order: OrderFixture = {}): number {
  const now = order.createdAt ?? new Date().toISOString();
  const result = sqlite
    .prepare(
      `INSERT INTO orders (
         number, status, customer_name, phone, email, division, district, upazila,
         address, note, subtotal, discount, shipping_fee, total, coupon_code,
         payment_method, payment_status, payment_trx_id, payment_sender, courier,
         consignment_id, tracking_code, ip_hash, idempotency_key, request_hash,
         created_at, updated_at
       ) VALUES (
         ?, ?, ?, ?, NULL, 'Dhaka', 'Dhaka', 'Savar', ?, ?, ?, ?, ?, ?, NULL,
         ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?
       )`,
    )
    .run(
      order.number ?? `BDTEST${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      order.status ?? 'pending',
      order.customerName ?? 'Test Customer',
      order.phone ?? '01712345678',
      order.address ?? 'House 1, Savar',
      order.note ?? null,
      order.subtotal ?? 1000,
      order.discount ?? 0,
      order.shippingFee ?? 60,
      order.total ?? 1060,
      order.paymentMethod ?? 'cod',
      order.paymentStatus ?? 'unpaid',
      now,
      order.updatedAt ?? now,
    );

  return Number(result.lastInsertRowid);
}

export function insertOrderItem(
  sqlite: DatabaseSync,
  orderId: number,
  item: {
    productId?: number | null;
    variantId?: number | null;
    title?: string;
    variant?: string | null;
    unitPrice?: number;
    qty?: number;
    lineTotal?: number;
    stockTracked?: boolean;
  } = {},
): number {
  const qty = item.qty ?? 1;
  const unitPrice = item.unitPrice ?? 1000;
  const result = sqlite
    .prepare(
      `INSERT INTO order_items (
         order_id, product_id, variant_id, title_snapshot, variant_snapshot,
         unit_price, qty, line_total, stock_tracked
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      orderId,
      item.productId ?? null,
      item.variantId ?? null,
      item.title ?? 'Snapshot product',
      item.variant ?? null,
      unitPrice,
      qty,
      item.lineTotal ?? unitPrice * qty,
      item.stockTracked === false ? 0 : 1,
    );

  return Number(result.lastInsertRowid);
}

export function insertOrderEvent(
  sqlite: DatabaseSync,
  orderId: number,
  type: string,
  createdAt = new Date().toISOString(),
  message: string | null = null,
): number {
  const result = sqlite
    .prepare(
      `INSERT INTO order_events (order_id, type, message, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(orderId, type, message, createdAt);

  return Number(result.lastInsertRowid);
}

export function orderStatusCount(sqlite: DatabaseSync, orderId: number, type: string): number {
  const row = sqlite
    .prepare('SELECT COUNT(*) AS count FROM order_events WHERE order_id = ? AND type = ?')
    .get(orderId, type) as unknown as { count: number };
  return row.count;
}

export function variantStock(sqlite: DatabaseSync, variantId: number): number {
  const row = sqlite
    .prepare('SELECT stock FROM variants WHERE id = ?')
    .get(variantId) as unknown as { stock: number } | undefined;
  return row?.stock ?? -1;
}
