import { generateOrderNumber, type OrderSummaryRow } from './orders';
import { errorMessage, isD1Unavailable } from './db-errors';

export interface CheckoutCustomer {
  name: string;
  phone: string;
  email: string | null;
  division: string;
  district: string;
  upazila: string;
  address: string;
  note: string | null;
}

export interface CheckoutLineSnapshot {
  product_id: number;
  variant_id: number | null;
  title: string;
  variant_title: string | null;
  variant_options: Record<string, string>;
  unit_price: number;
  qty: number;
  line_total: number;
  track_stock: boolean;
}

export type CheckoutFailure =
  | { ok: false; code: 'out_of_stock' }
  | { ok: false; code: 'idempotency_conflict' }
  | { ok: false; code: 'coupon_unavailable' }
  | { ok: false; code: 'db_unavailable' };

export type CheckoutResult =
  | { ok: true; order: OrderSummaryRow; existing: boolean }
  | CheckoutFailure;

function isDuplicateKeyError(message: string): boolean {
  return /idempotency_key/i.test(message) && /UNIQUE|constraint/i.test(message);
}

function isGuardError(message: string): boolean {
  return /checkout_guard/i.test(message) && /CHECK constraint failed/i.test(message);
}

function isCouponGuardError(message: string): boolean {
  return /coupon_guard/i.test(message) && /CHECK constraint failed/i.test(message);
}

function isNumberCollision(message: string): boolean {
  return /UNIQUE constraint failed: orders\.number/i.test(message);
}

function variantSnapshot(line: CheckoutLineSnapshot): string | null {
  if (!line.variant_title) return null;
  const options = Object.entries(line.variant_options)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
  return options ? `${line.variant_title} (${options})` : line.variant_title;
}

export async function createCheckoutOrder(input: {
  db: D1Database;
  idempotencyKey: string;
  customer: CheckoutCustomer;
  lines: CheckoutLineSnapshot[];
  subtotal: number;
  discount?: number;
  shippingFee: number;
  total: number;
  number: string;
  requestHash: string;
  paymentMethod?: 'cod' | 'bkash' | 'nagad';
  paymentStatus?: 'unpaid' | 'pending_verification';
  paymentSender?: string | null;
  paymentTrxId?: string | null;
  couponCode?: string | null;
  now?: string;
}): Promise<CheckoutResult> {
  const { db, idempotencyKey, customer, lines } = input;
  const now = input.now ?? new Date().toISOString();
  const discount = input.discount ?? 0;
  const paymentMethod = input.paymentMethod ?? 'cod';
  const paymentStatus = input.paymentStatus ?? 'unpaid';
  const paymentSender = input.paymentSender ?? null;
  const paymentTrxId = input.paymentTrxId ?? null;
  const couponCode = input.couponCode ?? null;

  const tracked = lines.filter(
    (line): line is CheckoutLineSnapshot & { variant_id: number } =>
      line.track_stock && line.variant_id !== null,
  );

  // One JSON parameter keeps the statement under D1's 100-bound-parameter
  // limit even when the cart has the maximum number of lines.
  const wanted = tracked.length
    ? JSON.stringify(tracked.map((line) => ({ id: line.variant_id, qty: line.qty })))
    : '';

  const buildStatements = (orderNumber: string): D1PreparedStatement[] => {
    const statements: D1PreparedStatement[] = [];

    if (couponCode) {
      // Atomic usage check: the UPDATE only matches while the coupon is still
      // active, in its date window, and below max_uses. The guard fails the
      // CHECK when it matched nothing, rolling back the order and stock too.
      statements.push(
        db
          .prepare(
            `UPDATE coupons
                SET used = used + 1
              WHERE code = ?
                AND active = 1
                AND min_subtotal <= ?
                AND (max_uses IS NULL OR used < max_uses)
                AND (starts_at IS NULL OR starts_at <= ?)
                AND (ends_at IS NULL OR ends_at > ?)`,
          )
          .bind(couponCode, input.subtotal, now, now),
      );
      statements.push(
        db.prepare(
          'INSERT OR REPLACE INTO coupon_guard (id, ok) VALUES (1, changes() = 1)',
        ),
      );
    }

    if (tracked.length) {
      statements.push(
        db
          .prepare(
            `WITH wanted(id, qty) AS (
               SELECT CAST(json_extract(value, '$.id') AS INTEGER),
                      CAST(json_extract(value, '$.qty') AS INTEGER)
                 FROM json_each(?)
             )
             UPDATE variants
                SET stock = stock - (SELECT qty FROM wanted w WHERE w.id = variants.id)
              WHERE id IN (SELECT id FROM wanted)
                AND stock >= (SELECT qty FROM wanted w WHERE w.id = variants.id)`,
          )
          .bind(wanted),
      );

      // Fails the CHECK (and therefore rolls back the batch) when any tracked
      // line could not be decremented because its stock was too low.
      statements.push(
        db
          .prepare('INSERT OR REPLACE INTO checkout_guard (id, ok) VALUES (1, changes() = ?)')
          .bind(tracked.length),
      );
    }

    statements.push(
      db
        .prepare(
          `INSERT INTO orders (
             number, status, customer_name, phone, email, division, district, upazila,
             address, note, subtotal, discount, shipping_fee, total, coupon_code,
             payment_method, payment_status, payment_trx_id, payment_sender, courier,
             consignment_id, tracking_code, ip_hash, idempotency_key, request_hash,
             created_at, updated_at
           ) VALUES (
             ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?
           )`,
        )
        .bind(
          orderNumber,
          customer.name,
          customer.phone,
          customer.email,
          customer.division,
          customer.district,
          customer.upazila,
          customer.address,
          customer.note,
          input.subtotal,
          discount,
          input.shippingFee,
          input.total,
          couponCode,
          paymentMethod,
          paymentStatus,
          paymentTrxId,
          paymentSender,
          idempotencyKey,
          input.requestHash,
          now,
          now,
        ),
    );

    for (const line of lines) {
      statements.push(
        db
          .prepare(
            `INSERT INTO order_items (
               order_id, product_id, variant_id, title_snapshot, variant_snapshot,
               unit_price, qty, line_total, stock_tracked
             )
             SELECT o.id, ?, ?, ?, ?, ?, ?, ?, ?
               FROM orders o
              WHERE o.number = ?`,
          )
          .bind(
            line.product_id,
            line.variant_id,
            line.title,
            variantSnapshot(line),
            line.unit_price,
            line.qty,
            line.line_total,
            line.track_stock && line.variant_id !== null ? 1 : 0,
            orderNumber,
          ),
      );
    }

    statements.push(
      db
        .prepare(
          `INSERT INTO order_events (order_id, type, message, created_at)
           SELECT id, 'created', NULL, ?
             FROM orders
            WHERE number = ?`,
        )
        .bind(now, orderNumber),
    );

    return statements;
  };

  let orderNumber = input.number;
  const maxAttempts = 4;

  const findExistingOrder = () =>
    db
      .prepare(
        `SELECT id, number, status, phone, request_hash, subtotal, shipping_fee,
                total, payment_method, payment_status, created_at
           FROM orders
          WHERE idempotency_key = ?
          LIMIT 1`,
      )
      .bind(idempotencyKey)
      .first<OrderSummaryRow>();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await db.batch(buildStatements(orderNumber));
    } catch (error) {
      const message = errorMessage(error);

      if (isNumberCollision(message)) {
        if (attempt + 1 < maxAttempts) {
          orderNumber = generateOrderNumber();
          continue;
        }
        throw error;
      }

      if (isDuplicateKeyError(message)) {
        const existing = await findExistingOrder();

        if (
          existing &&
          existing.phone === customer.phone &&
          (!existing.request_hash || existing.request_hash === input.requestHash)
        ) {
          return { ok: true, order: existing, existing: true };
        }
        if (existing) return { ok: false, code: 'idempotency_conflict' };
        throw error;
      }

      if (isCouponGuardError(message)) {
        // A concurrent request with the same idempotency key may have just
        // consumed the last use. Return that order instead of a false
        // "coupon exhausted" error.
        const existing = await findExistingOrder();
        if (
          existing &&
          existing.phone === customer.phone &&
          (!existing.request_hash || existing.request_hash === input.requestHash)
        ) {
          return { ok: true, order: existing, existing: true };
        }
        return { ok: false, code: 'coupon_unavailable' };
      }

      if (isGuardError(message)) {
        return { ok: false, code: 'out_of_stock' };
      }

      if (isD1Unavailable(error)) {
        return { ok: false, code: 'db_unavailable' };
      }

      throw error;
    }

    return {
      ok: true,
      existing: false,
      order: {
        id: 0,
        number: orderNumber,
        status: 'pending',
        phone: customer.phone,
        request_hash: input.requestHash,
        subtotal: input.subtotal,
        shipping_fee: input.shippingFee,
        total: input.total,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        created_at: now,
      },
    };
  }

  throw new Error('Could not allocate an order number');
}
