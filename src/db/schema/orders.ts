import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const orders = sqliteTable(
  'orders',
  {
    id: integer('id').primaryKey(),
    number: text('number').notNull().unique(),
    status: text('status', {
      enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned'],
    })
      .notNull()
      .default('pending'),
    customerName: text('customer_name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    division: text('division'),
    district: text('district'),
    upazila: text('upazila'),
    address: text('address').notNull(),
    note: text('note'),
    subtotal: integer('subtotal').notNull(),
    discount: integer('discount').notNull().default(0),
    shippingFee: integer('shipping_fee').notNull(),
    total: integer('total').notNull(),
    couponCode: text('coupon_code'),
    paymentMethod: text('payment_method', { enum: ['cod', 'bkash', 'nagad'] }).notNull(),
    paymentStatus: text('payment_status', {
      enum: ['unpaid', 'pending_verification', 'paid', 'refunded'],
    })
      .notNull()
      .default('unpaid'),
    paymentTrxId: text('payment_trx_id'),
    paymentSender: text('payment_sender'),
    courier: text('courier'),
    consignmentId: text('consignment_id'),
    trackingCode: text('tracking_code'),
    ipHash: text('ip_hash'),
    idempotencyKey: text('idempotency_key').unique(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_orders_phone').on(table.phone, table.createdAt),
    index('idx_orders_status').on(table.status, table.createdAt),
    check(
      'orders_status_check',
      sql`${table.status} in ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned')`,
    ),
    check('orders_payment_method_check', sql`${table.paymentMethod} in ('cod', 'bkash', 'nagad')`),
    check(
      'orders_payment_status_check',
      sql`${table.paymentStatus} in ('unpaid', 'pending_verification', 'paid', 'refunded')`,
    ),
  ],
);

export const orderItems = sqliteTable(
  'order_items',
  {
    id: integer('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: integer('product_id'),
    variantId: integer('variant_id'),
    titleSnapshot: text('title_snapshot').notNull(),
    variantSnapshot: text('variant_snapshot'),
    unitPrice: integer('unit_price').notNull(),
    qty: integer('qty').notNull(),
    lineTotal: integer('line_total').notNull(),
  },
  (table) => [index('idx_items_order').on(table.orderId)],
);

export const orderEvents = sqliteTable(
  'order_events',
  {
    id: integer('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    message: text('message'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_events_order').on(table.orderId)],
);

export const coupons = sqliteTable(
  'coupons',
  {
    code: text('code').primaryKey(),
    type: text('type', { enum: ['percent', 'fixed'] }).notNull(),
    value: integer('value').notNull(),
    minSubtotal: integer('min_subtotal').notNull().default(0),
    maxUses: integer('max_uses'),
    used: integer('used').notNull().default(0),
    startsAt: text('starts_at'),
    endsAt: text('ends_at'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
  },
  (table) => [check('coupons_type_check', sql`${table.type} in ('percent', 'fixed')`)],
);

export const blocklist = sqliteTable('blocklist', {
  phone: text('phone').primaryKey(),
  reason: text('reason'),
  createdAt: text('created_at').notNull(),
});
