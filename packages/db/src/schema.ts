import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import {
  PRODUCT_TYPES, PRODUCT_STATUSES, ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES,
  type StoreTheme, type StoreSettings,
} from "@bdc/shared";

// Conventions
// - ids are UUIDs generated in the app (crypto.randomUUID())
// - every tenant table has store_id and every query must filter on it
// - money is stored as integer poisha (1 BDT = 100 poisha)
// - timestamps are unix seconds
const createdAt = () => integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`);
const updatedAt = () => integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`).$onUpdate(() => new Date());

export const stores = sqliteTable("stores", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  customDomain: text("custom_domain").unique(),
  currency: text("currency").notNull().default("BDT"),
  locale: text("locale", { enum: ["bn", "en"] }).notNull().default("bn"),
  theme: text("theme", { mode: "json" }).$type<StoreTheme>().notNull().default(sql`'{}'`),
  settings: text("settings", { mode: "json" }).$type<StoreSettings>().notNull().default(sql`'{}'`),
  adminTokenHash: text("admin_token_hash").notNull(), // sha256 hex of the admin bearer token
  nextOrderNumber: integer("next_order_number").notNull().default(1),
  createdAt: createdAt(),
});

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [uniqueIndex("categories_store_slug").on(t.storeId, t.slug)]);

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  categoryId: text("category_id").references(() => categories.id),
  type: text("type", { enum: PRODUCT_TYPES }).notNull().default("physical"),
  status: text("status", { enum: PRODUCT_STATUSES }).notNull().default("draft"),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  basePrice: integer("base_price").notNull(),
  attributes: text("attributes", { mode: "json" }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  images: text("images", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`), // R2 keys
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("products_store_slug").on(t.storeId, t.slug),
  index("products_store_status").on(t.storeId, t.status, t.createdAt),
  index("products_store_category").on(t.storeId, t.categoryId),
]);

export const productVariants = sqliteTable("product_variants", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  productId: text("product_id").notNull().references(() => products.id),
  sku: text("sku").notNull(),
  title: text("title").notNull().default("Default"),
  price: integer("price").notNull(),
  compareAtPrice: integer("compare_at_price"),
  stock: integer("stock"), // NULL = stock not tracked (services, digital goods)
  options: text("options", { mode: "json" }).$type<Record<string, string>>().notNull().default(sql`'{}'`),
  weightGrams: integer("weight_grams"),
}, (t) => [
  uniqueIndex("variants_store_sku").on(t.storeId, t.sku),
  index("variants_product").on(t.productId),
]);

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("customers_store_phone").on(t.storeId, t.phone)]);

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  number: integer("number").notNull(), // human-friendly, per store
  customerId: text("customer_id").notNull().references(() => customers.id),
  status: text("status", { enum: ORDER_STATUSES }).notNull().default("pending"),
  paymentMethod: text("payment_method", { enum: PAYMENT_METHODS }).notNull().default("cod"),
  paymentStatus: text("payment_status", { enum: PAYMENT_STATUSES }).notNull().default("unpaid"),
  subtotal: integer("subtotal").notNull(),
  shippingFee: integer("shipping_fee").notNull().default(0),
  discount: integer("discount").notNull().default(0),
  total: integer("total").notNull(),
  shipName: text("ship_name").notNull(),
  shipPhone: text("ship_phone").notNull(),
  division: text("division").notNull(),
  district: text("district").notNull(),
  upazila: text("upazila"),
  area: text("area"),
  addressLine: text("address_line").notNull(),
  note: text("note"),
  courier: text("courier"),
  trackingCode: text("tracking_code"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("orders_store_number").on(t.storeId, t.number),
  index("orders_store_status").on(t.storeId, t.status, t.createdAt),
  index("orders_store_phone").on(t.storeId, t.shipPhone),
]);

export const orderItems = sqliteTable("order_items", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  orderId: text("order_id").notNull().references(() => orders.id),
  productId: text("product_id").notNull(),
  variantId: text("variant_id").notNull(),
  name: text("name").notNull(), // snapshot at purchase time
  sku: text("sku").notNull(),
  unitPrice: integer("unit_price").notNull(),
  quantity: integer("quantity").notNull(),
  total: integer("total").notNull(),
}, (t) => [index("order_items_order").on(t.orderId)]);

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  orderId: text("order_id").notNull().references(() => orders.id),
  provider: text("provider", { enum: PAYMENT_METHODS }).notNull(),
  amount: integer("amount").notNull(),
  status: text("status", { enum: PAYMENT_STATUSES }).notNull().default("unpaid"),
  providerRef: text("provider_ref"),
  raw: text("raw", { mode: "json" }),
  createdAt: createdAt(),
}, (t) => [index("payments_order").on(t.orderId)]);

// COD fraud protection: phones that may not place orders
export const blockedPhones = sqliteTable("blocked_phones", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  phone: text("phone").notNull(),
  reason: text("reason"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("blocked_store_phone").on(t.storeId, t.phone)]);
