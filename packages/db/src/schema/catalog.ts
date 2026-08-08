import { sqliteTable, text, integer, index, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { newId } from "../id";
import { timestamps, updatedAt } from "./util";

// ---------------------------------------------------------------------------
// Categories (self-referencing tree for unlimited subcategories)
// ---------------------------------------------------------------------------

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  image: text("image"),
  parentId: text("parent_id").references((): AnySQLiteColumn => categories.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  isFeatured: integer("is_featured", { mode: "boolean" }).notNull().default(false),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  ...timestamps,
});

export const brands = sqliteTable("brands", {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    summary: text("summary"),
    description: text("description"),
    specifications: text("specifications", { mode: "json" }).$type<
      { label: string; value: string }[]
    >(),
    pricePaisa: integer("price_paisa").notNull().default(0),
    compareAtPaisa: integer("compare_at_paisa"),
    costPaisa: integer("cost_paisa"),
    sku: text("sku"),
    barcode: text("barcode"),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    brandId: text("brand_id").references(() => brands.id, { onDelete: "set null" }),
    images: text("images", { mode: "json" }).$type<{ src: string; alt?: string }[]>(),
    coverImage: text("cover_image"),
    videoUrl: text("video_url"),
    tags: text("tags", { mode: "json" }).$type<string[]>(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    isFeatured: integer("is_featured", { mode: "boolean" }).notNull().default(false),
    isBestSeller: integer("is_best_seller", { mode: "boolean" }).notNull().default(false),
    isNewArrival: integer("is_new_arrival", { mode: "boolean" }).notNull().default(false),
    label: text("label"), // HOT | NEW | SALE
    stock: integer("stock").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
    weight: integer("weight"), // grams
    saleEndsAt: integer("sale_ends_at", { mode: "timestamp_ms" }),
    viewCount: integer("view_count").notNull().default(0),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    ...timestamps,
  },
  (t) => [
    index("products_category_idx").on(t.categoryId),
    index("products_brand_idx").on(t.brandId),
    index("products_active_idx").on(t.isActive, t.isFeatured),
    index("products_slug_idx").on(t.slug),
  ],
);

export const productVariants = sqliteTable(
  "product_variants",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    options: text("options", { mode: "json" }).$type<Record<string, string>>(),
    sku: text("sku"),
    pricePaisa: integer("price_paisa"),
    stock: integer("stock").notNull().default(0),
    image: text("image"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("product_variants_product_idx").on(t.productId),
  ],
);
