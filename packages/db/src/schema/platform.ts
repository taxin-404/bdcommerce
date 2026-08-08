import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { newId } from "../id";
import { timestamps } from "./util";
import { products } from "./catalog";

// ---------------------------------------------------------------------------
// Settings (key -> JSON value, e.g. site, theme, shipping, payments, seo)
// ---------------------------------------------------------------------------

export const settings = sqliteTable("settings", {
  id: text("id").primaryKey().$defaultFn(newId),
  key: text("key").notNull().unique(),
  value: text("value", { mode: "json" }).$type<Record<string, unknown>>(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Media (R2-backed)
// ---------------------------------------------------------------------------

export const media = sqliteTable("media", {
  id: text("id").primaryKey().$defaultFn(newId),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull().default(0),
  width: integer("width"),
  height: integer("height"),
  url: text("url").notNull(),
  alt: text("alt"),
  folder: text("folder").notNull().default("media"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const paymentMethods = sqliteTable("payment_methods", {
  id: text("id").primaryKey().$defaultFn(newId),
  key: text("key").notNull().unique(), // COD|BKASH|NAGAD|ROCKET|UPAY|BANK_TRANSFER|SSLCOMMERZ|...
  name: text("name").notNull(),
  description: text("description"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  isSandbox: integer("is_sandbox", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  // store_id, store_password, sandbox/live keys, phone number, etc.
  config: text("config", { mode: "json" }).$type<Record<string, unknown>>(),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Shipping
// ---------------------------------------------------------------------------

export const shippingZones = sqliteTable("shipping_zones", {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  type: text("type").notNull().default("COUNTRYWIDE"), // DHAKA|OUTSIDE_DHAKA|DISTRICT|UPAZILA|COUNTRYWIDE
  district: text("district"),
  upazila: text("upazila"),
  chargePaisa: integer("charge_paisa").notNull().default(0),
  freeOverPaisa: integer("free_over_paisa"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Couriers (Pathao, Steadfast, RedX, Paperfly)
// ---------------------------------------------------------------------------

export const courierAccounts = sqliteTable("courier_accounts", {
  id: text("id").primaryKey().$defaultFn(newId),
  provider: text("provider").notNull().unique(), // PATHOA|STEADFAST|REDX|PAPERFLY|MANUAL
  name: text("name").notNull(),
  config: text("config", { mode: "json" }).$type<Record<string, unknown>>(),
  isSandbox: integer("is_sandbox", { mode: "boolean" }).notNull().default(true),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Flash sales
// ---------------------------------------------------------------------------

export const flashSales = sqliteTable("flash_sales", {
  id: text("id").primaryKey().$defaultFn(newId),
  title: text("title").notNull(),
  startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
  endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const flashSaleItems = sqliteTable(
  "flash_sale_items",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    flashSaleId: text("flash_sale_id")
      .notNull()
      .references(() => flashSales.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("flash_sale_items_unique").on(t.flashSaleId, t.productId),
  ],
);

// ---------------------------------------------------------------------------
// Rate limiting (D1-backed fixed windows)
// ---------------------------------------------------------------------------

export const rateLimitEntries = sqliteTable(
  "rate_limit_entries",
  {
    key: text("key").notNull(),
    windowStart: integer("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [
    uniqueIndex("rate_limit_unique").on(t.key, t.windowStart),
  ],
);

// ---------------------------------------------------------------------------
// Import / export jobs
// ---------------------------------------------------------------------------

export const importJobs = sqliteTable("import_jobs", {
  id: text("id").primaryKey().$defaultFn(newId),
  type: text("type").notNull().default("PRODUCT"),
  status: text("status").notNull().default("PENDING"), // PENDING|PROCESSING|DONE|FAILED
  fileName: text("file_name"),
  result: text("result", { mode: "json" }).$type<{
    imported?: number;
    failed?: number;
    errors?: string[];
  }>(),
  createdBy: text("created_by"),
  ...timestamps,
});
