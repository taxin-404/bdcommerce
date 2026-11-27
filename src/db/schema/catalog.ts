import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    nameBn: text('name_bn'),
    parentId: integer('parent_id').references((): AnySQLiteColumn => categories.id),
    imageKey: text('image_key'),
    sort: integer('sort').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
  },
  (table) => [index('idx_cat_parent').on(table.parentId, table.sort)],
);

export const products = sqliteTable(
  'products',
  {
    id: integer('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    titleBn: text('title_bn'),
    description: text('description'),
    descriptionBn: text('description_bn'),
    categoryId: integer('category_id').references(() => categories.id),
    price: integer('price').notNull(),
    compareAtPrice: integer('compare_at_price'),
    status: text('status', { enum: ['draft', 'active', 'archived'] })
      .notNull()
      .default('draft'),
    trackStock: integer('track_stock', { mode: 'boolean' }).notNull().default(true),
    attributes: text('attributes', { mode: 'json' }).$type<Record<string, unknown>>(),
    featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_products_status_id').on(table.status, table.id),
    index('idx_products_status_cat').on(table.status, table.categoryId, table.id),
    index('idx_products_featured').on(table.status, table.featured, table.id),
    check('products_status_check', sql`${table.status} in ('draft', 'active', 'archived')`),
  ],
);

export const productImages = sqliteTable(
  'product_images',
  {
    id: integer('id').primaryKey(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    r2Key: text('r2_key').notNull(),
    alt: text('alt'),
    sort: integer('sort').notNull().default(0),
  },
  (table) => [index('idx_images_product').on(table.productId, table.sort)],
);

export const variants = sqliteTable(
  'variants',
  {
    id: integer('id').primaryKey(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sku: text('sku').unique(),
    title: text('title').notNull(),
    options: text('options', { mode: 'json' }).$type<Record<string, string>>(),
    price: integer('price'),
    stock: integer('stock').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
  },
  (table) => [index('idx_variants_product').on(table.productId)],
);
