import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { newId } from "../id";
import { timestamps } from "./util";
import { products, productVariants } from "./catalog";
import { users } from "./people";

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: text("order_id"),
    rating: integer("rating").notNull(), // 1..5
    title: text("title"),
    body: text("body").notNull(),
    images: text("images", { mode: "json" }).$type<string[]>(),
    isApproved: integer("is_approved", { mode: "boolean" }).notNull().default(false),
    helpfulCount: integer("helpful_count").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("reviews_product_approved_idx").on(t.productId, t.isApproved),
  ],
);

// ---------------------------------------------------------------------------
// Cart & wishlist
// ---------------------------------------------------------------------------

export const carts = sqliteTable("carts", {
  id: text("id").primaryKey().$defaultFn(newId),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id").unique(),
  ...timestamps,
});

export const cartItems = sqliteTable(
  "cart_items",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    cartId: text("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: text("variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("cart_items_unique").on(t.cartId, t.productId, t.variantId),
  ],
);

export const wishlistItems = sqliteTable(
  "wishlist_items",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("wishlist_items_unique").on(t.userId, t.productId),
  ],
);

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orderNumber: text("order_number").notNull().unique(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    phone: text("phone"),
    name: text("name"),

    status: text("status").notNull().default("PENDING"), // PENDING|CONFIRMED|PACKED|SHIPPED|DELIVERED|RETURNED|CANCELLED|REFUNDED
    paymentStatus: text("payment_status").notNull().default("UNPAID"), // UNPAID|PAID|REFUNDED|FAILED|COD|PENDING
    paymentMethod: text("payment_method").notNull().default("COD"), // COD|BKASH|NAGAD|ROCKET|UPAY|BANK_TRANSFER|SSLCOMMERZ|...

    subtotalPaisa: integer("subtotal_paisa").notNull().default(0),
    discountPaisa: integer("discount_paisa").notNull().default(0),
    shippingPaisa: integer("shipping_paisa").notNull().default(0),
    taxPaisa: integer("tax_paisa").notNull().default(0),
    totalPaisa: integer("total_paisa").notNull().default(0),

    couponCode: text("coupon_code"),
    couponId: text("coupon_id"),

    // Denormalized snapshots so order history survives product/address changes
    shippingAddress: text("shipping_address", { mode: "json" }).$type<Record<string, unknown>>(),
    itemsSnapshot: text("items_snapshot", { mode: "json" }).$type<unknown[]>(),
    notes: text("notes"),

    shippingMethod: text("shipping_method"),
    courier: text("courier"),
    trackingNumber: text("tracking_number"),
    awbNumber: text("awb_number"),
    transactionId: text("transaction_id"),
    txnId: text("txn_id"),

    placedAt: integer("placed_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    shippedAt: integer("shipped_at", { mode: "timestamp_ms" }),
    deliveredAt: integer("delivered_at", { mode: "timestamp_ms" }),
    cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    index("orders_user_idx").on(t.userId),
    index("orders_email_idx").on(t.email),
    index("orders_placed_idx").on(t.placedAt),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    variantId: text("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    productName: text("product_name").notNull(),
    sku: text("sku"),
    options: text("options", { mode: "json" }).$type<Record<string, string>>(),
    productImage: text("product_image"),
    quantity: integer("quantity").notNull().default(1),
    unitPricePaisa: integer("unit_price_paisa").notNull().default(0),
    totalPricePaisa: integer("total_price_paisa").notNull().default(0),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
  ],
);

export const orderStatusLogs = sqliteTable(
  "order_status_logs",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    note: text("note"),
    createdBy: text("created_by"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("order_status_logs_order_idx").on(t.orderId),
  ],
);

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

export const coupons = sqliteTable("coupons", {
  id: text("id").primaryKey().$defaultFn(newId),
  code: text("code").notNull().unique(),
  type: text("type").notNull().default("PERCENTAGE"), // PERCENTAGE|FIXED|FREE_SHIPPING|BUY_X_GET_Y
  value: integer("value").notNull().default(0),
  minSubtotalPaisa: integer("min_subtotal_paisa").notNull().default(0),
  maxDiscountPaisa: integer("max_discount_paisa"),
  usageLimit: integer("usage_limit"),
  usedCount: integer("used_count").notNull().default(0),
  perUserLimit: integer("per_user_limit").notNull().default(1),
  appliesTo: text("applies_to").notNull().default("ALL"), // ALL|CATEGORY|PRODUCT
  appliesToId: text("applies_to_id"),
  buyX: integer("buy_x"),
  getY: integer("get_y"),
  startsAt: integer("starts_at", { mode: "timestamp_ms" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey().$defaultFn(newId),
  orderId: text("order_id").references(() => orders.id, { onDelete: "cascade" }),
  method: text("method").notNull(),
  amountPaisa: integer("amount_paisa").notNull().default(0),
  txnId: text("txn_id"),
  refId: text("ref_id"),
  status: text("status").notNull().default("PENDING"), // PENDING|PAID|VERIFIED|FAILED|REFUNDED
  request: text("request", { mode: "json" }),
  response: text("response", { mode: "json" }),
  verifiedBy: text("verified_by"),
  verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const paymentLogs = sqliteTable("payment_logs", {
  id: text("id").primaryKey().$defaultFn(newId),
  orderId: text("order_id").references(() => orders.id, { onDelete: "cascade" }),
  method: text("method").notNull(),
  direction: text("direction").notNull().default("REQUEST"), // REQUEST|CALLBACK|VERIFY
  amountPaisa: integer("amount_paisa").notNull().default(0),
  txnId: text("txn_id"),
  status: text("status").notNull().default("PENDING"),
  request: text("request", { mode: "json" }),
  response: text("response", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
