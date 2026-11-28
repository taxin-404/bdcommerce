export const ORDER_NUMBER_PATTERN = /^[A-Z0-9]{6,32}$/;

const RANDOM_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function generateOrderNumber(now = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  let suffix = '';
  for (const byte of bytes) {
    suffix += RANDOM_ALPHABET[byte % RANDOM_ALPHABET.length] ?? 'X';
  }
  return `BD${now.toString(36).toUpperCase()}${suffix}`;
}

export function normalizeOrderNumber(value: string): string {
  return value.trim().toUpperCase();
}

export interface OrderSummaryRow {
  id: number;
  number: string;
  status: string;
  phone: string;
  request_hash: string | null;
  subtotal: number;
  shipping_fee: number;
  total: number;
  payment_method: string;
  payment_status: string;
  created_at: string;
}

export interface OrderDetailRow extends Omit<OrderSummaryRow, 'request_hash'> {
  customer_name: string;
  email: string | null;
  division: string | null;
  district: string | null;
  upazila: string | null;
  address: string;
  note: string | null;
  discount: number;
  updated_at: string;
}

export interface OrderItemRow {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  title_snapshot: string;
  variant_snapshot: string | null;
  unit_price: number;
  qty: number;
  line_total: number;
}

export const ORDER_SUMMARY_COLUMNS = `id, number, status, phone, request_hash, subtotal,
  shipping_fee, total, payment_method, payment_status, created_at`;

const ORDER_DETAIL_COLUMNS = `id, number, status, phone, subtotal, shipping_fee, total,
  payment_method, payment_status, created_at, customer_name, email, division,
  district, upazila, address, note, discount, updated_at`;

export async function findOrderByIdempotencyKey(
  db: D1Database,
  key: string,
): Promise<OrderSummaryRow | null> {
  return db
    .prepare(`SELECT ${ORDER_SUMMARY_COLUMNS} FROM orders WHERE idempotency_key = ? LIMIT 1`)
    .bind(key)
    .first<OrderSummaryRow>();
}

export async function findOrderByNumber(
  db: D1Database,
  number: string,
): Promise<OrderDetailRow | null> {
  return db
    .prepare(`SELECT ${ORDER_DETAIL_COLUMNS} FROM orders WHERE number = ? LIMIT 1`)
    .bind(normalizeOrderNumber(number))
    .first<OrderDetailRow>();
}

export async function listOrderItems(
  db: D1Database,
  orderId: number,
): Promise<OrderItemRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, product_id, variant_id, title_snapshot, variant_snapshot,
              unit_price, qty, line_total
         FROM order_items
        WHERE order_id = ?
        ORDER BY id`,
    )
    .bind(orderId)
    .all<OrderItemRow>();
  return results;
}

/** Order details are only returned when the order number and phone both match. */
export async function findOrderForCustomer(
  db: D1Database,
  number: string,
  normalizedPhone: string,
): Promise<{ order: OrderDetailRow; items: OrderItemRow[] } | null> {
  const order = await findOrderByNumber(db, number);
  if (!order || order.phone !== normalizedPhone) return null;

  const items = await listOrderItems(db, order.id);
  return { order, items };
}

