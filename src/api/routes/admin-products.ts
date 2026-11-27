import { zValidator } from '@hono/zod-validator';
import type { BatchItem } from 'drizzle-orm/batch';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { productImages, products, variants } from '../../db/schema';
import { imageVariantKey } from '../../lib/image';
import { deleteProductFts, syncProductFts } from '../../lib/search';
import { buildFtsQuery } from '../../lib/search';
import { slugify } from '../../lib/slug';
import {
  idParamSchema,
  productInputSchema,
  productPatchSchema,
  variantInputSchema,
} from '../../lib/validation/admin';
import type { AdminEnv } from '../middleware/admin';

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  category: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

type ProductRow = typeof products.$inferSelect;
type VariantRow = typeof variants.$inferSelect;
type ImageRow = typeof productImages.$inferSelect;

function fallbackSlug(title: string): string {
  return slugify(title) || `product-${crypto.randomUUID().slice(0, 8)}`;
}

async function uniqueProductSlug(
  db: ReturnType<typeof getDb>,
  base: string,
  excludeId?: number,
): Promise<string> {
  let candidate = base;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, candidate))
      .limit(1);

    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}-${suffix}`;
  }

  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

function variantJson(row: VariantRow) {
  return {
    id: row.id,
    sku: row.sku,
    title: row.title,
    options: row.options ?? {},
    price: row.price,
    stock: row.stock,
    active: row.active,
  };
}

function productJson(
  row: ProductRow,
  variantRows: VariantRow[] = [],
  imageRows: ImageRow[] = [],
) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    title_bn: row.titleBn,
    description: row.description,
    description_bn: row.descriptionBn,
    category_id: row.categoryId,
    price: row.price,
    compare_at_price: row.compareAtPrice,
    status: row.status,
    track_stock: row.trackStock,
    attributes: row.attributes ?? {},
    featured: row.featured,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    variants: variantRows.map(variantJson),
    images: imageRows.map((image) => ({
      id: image.id,
      r2_key: image.r2Key,
      alt: image.alt,
      sort: image.sort,
    })),
  };
}

function variantInsertValues(
  productId: number,
  input: z.infer<typeof variantInputSchema>,
) {
  return {
    productId,
    sku: input.sku ?? null,
    title: input.title,
    options: input.options,
    price: input.price ?? null,
    stock: input.stock,
    active: input.active,
  };
}

function firstDuplicateSku(skus: Array<string | null | undefined>): string | null {
  const seen = new Set<string>();
  for (const sku of skus) {
    if (!sku) continue;
    if (seen.has(sku)) return sku;
    seen.add(sku);
  }
  return null;
}

async function findSkuConflict(
  db: D1Database,
  skus: Array<string | null | undefined>,
  excludeProductId?: number,
): Promise<string | null> {
  const unique = [...new Set(skus.filter((sku): sku is string => Boolean(sku)))];
  if (!unique.length) return null;

  const placeholders = unique.map(() => '?').join(', ');
  const query = `SELECT sku FROM variants WHERE sku IN (${placeholders})${
    excludeProductId === undefined ? '' : ' AND product_id != ?'
  } LIMIT 1`;
  const bindings: unknown[] = [...unique];
  if (excludeProductId !== undefined) bindings.push(excludeProductId);

  const row = await db.prepare(query).bind(...bindings).first<{ sku: string }>();
  return row?.sku ?? null;
}

function duplicateSkuResponse(sku: string) {
  return {
    ok: false as const,
    error: {
      code: 'duplicate_sku',
      message: `SKU "${sku}" is already used by another variant`,
    },
  };
}

async function loadProduct(db: ReturnType<typeof getDb>, id: number) {
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) return null;

  const variantRows = await db
    .select()
    .from(variants)
    .where(eq(variants.productId, id))
    .orderBy(variants.id);
  const imageRows = await db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, id))
    .orderBy(productImages.sort, productImages.id);

  return productJson(product, variantRows, imageRows);
}

export const adminProductRoutes = new Hono<AdminEnv>();

adminProductRoutes.get('/', zValidator('query', listQuerySchema), async (c) => {
  const { q, status, category, limit, offset } = c.req.valid('query');

  const where: string[] = [];
  const bindings: unknown[] = [];
  let from = 'FROM products p LEFT JOIN categories c ON c.id = p.category_id';

  if (status) {
    where.push('p.status = ?');
    bindings.push(status);
  }
  if (category) {
    where.push('p.category_id = ?');
    bindings.push(category);
  }
  if (q) {
    const ftsQuery = buildFtsQuery(q);
    if (!ftsQuery) {
      where.push('0 = 1');
    } else {
      from = 'FROM products p JOIN product_fts ON product_fts.rowid = p.id LEFT JOIN categories c ON c.id = p.category_id';
      where.push('product_fts MATCH ?');
      bindings.push(ftsQuery);
    }
  }

  const sql = `SELECT p.id, p.slug, p.title, p.title_bn, p.price, p.compare_at_price,
                      p.status, p.featured, p.category_id, p.updated_at,
                      c.name AS category_name,
                      (SELECT i.r2_key FROM product_images i
                        WHERE i.product_id = p.id ORDER BY i.sort, i.id LIMIT 1) AS image_key
                 ${from}
                ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                ORDER BY p.updated_at DESC, p.id DESC
                LIMIT ? OFFSET ?`;

  const { results } = await c.env.DB.prepare(sql)
    .bind(...bindings, limit, offset)
    .all<Record<string, unknown>>();

  return c.json({ ok: true, data: results });
});

adminProductRoutes.get(
  '/:id',
  zValidator('param', z.object({ id: idParamSchema })),
  async (c) => {
    const { id } = c.req.valid('param');
    const product = await loadProduct(getDb(c.env.DB), id);

    if (!product) {
      return c.json(
        { ok: false, error: { code: 'not_found', message: 'Product not found' } },
        404,
      );
    }

    return c.json({ ok: true, data: product });
  },
);

adminProductRoutes.post('/', zValidator('json', productInputSchema), async (c) => {
  const input = c.req.valid('json');
  const db = getDb(c.env.DB);
  const now = new Date().toISOString();

  if (input.category_id) {
    const categoryRow = await c.env.DB.prepare('SELECT id FROM categories WHERE id = ?')
      .bind(input.category_id)
      .first<{ id: number }>();
    if (!categoryRow) {
      return c.json(
        { ok: false, error: { code: 'invalid_category', message: 'Category not found' } },
        400,
      );
    }
  }

  const duplicateSku = firstDuplicateSku(input.variants.map((variant) => variant.sku));
  if (duplicateSku) return c.json(duplicateSkuResponse(duplicateSku), 409);

  const usedSku = await findSkuConflict(
    c.env.DB,
    input.variants.map((variant) => variant.sku),
  );
  if (usedSku) return c.json(duplicateSkuResponse(usedSku), 409);

  const slug = await uniqueProductSlug(
    db,
    input.slug ? slugify(input.slug) : fallbackSlug(input.title),
  );

  const [created] = await db
    .insert(products)
    .values({
      slug,
      title: input.title,
      titleBn: input.title_bn ?? null,
      description: input.description ?? null,
      descriptionBn: input.description_bn ?? null,
      categoryId: input.category_id ?? null,
      price: input.price,
      compareAtPrice: input.compare_at_price ?? null,
      status: input.status,
      trackStock: input.track_stock,
      attributes: input.attributes,
      featured: input.featured,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) throw new Error('Product insert returned no row');

  if (input.variants.length) {
    try {
      await db
        .insert(variants)
        .values(input.variants.map((variant) => variantInsertValues(created.id, variant)));
    } catch (error) {
      await db.delete(products).where(eq(products.id, created.id));
      throw error;
    }
  }

  await syncProductFts(c.env.DB, created.id);

  const product = await loadProduct(db, created.id);
  return c.json({ ok: true, data: product }, 201);
});

adminProductRoutes.patch(
  '/:id',
  zValidator('param', z.object({ id: idParamSchema })),
  zValidator('json', productPatchSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');
    const db = getDb(c.env.DB);

    const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!existing) {
      return c.json(
        { ok: false, error: { code: 'not_found', message: 'Product not found' } },
        404,
      );
    }

    if (input.category_id) {
      const categoryRow = await c.env.DB.prepare('SELECT id FROM categories WHERE id = ?')
        .bind(input.category_id)
        .first<{ id: number }>();
      if (!categoryRow) {
        return c.json(
          { ok: false, error: { code: 'invalid_category', message: 'Category not found' } },
          400,
        );
      }
    }

    let removed: VariantRow[] = [];

    if (input.variants !== undefined) {
      const duplicateSku = firstDuplicateSku(input.variants.map((variant) => variant.sku));
      if (duplicateSku) return c.json(duplicateSkuResponse(duplicateSku), 409);

      const usedSku = await findSkuConflict(
        c.env.DB,
        input.variants.map((variant) => variant.sku),
        id,
      );
      if (usedSku) return c.json(duplicateSkuResponse(usedSku), 409);

      const current = await db.select().from(variants).where(eq(variants.productId, id));
      const currentIds = new Set(current.map((variant) => variant.id));

      for (const variant of input.variants) {
        if (variant.id !== undefined && !currentIds.has(variant.id)) {
          return c.json(
            {
              ok: false,
              error: {
                code: 'invalid_variant',
                message: `Variant ${variant.id} does not belong to this product`,
              },
            },
            400,
          );
        }
      }

      const keptIds = new Set(
        input.variants.flatMap((variant) => (variant.id === undefined ? [] : [variant.id])),
      );
      removed = current.filter((variant) => !keptIds.has(variant.id));
    }

    const slug =
      input.slug !== undefined
        ? await uniqueProductSlug(
            db,
            slugify(input.slug ?? '') || fallbackSlug(input.title ?? existing.title),
            id,
          )
        : existing.slug;

    const statements: BatchItem<'sqlite'>[] = [
      db
        .update(products)
        .set({
          slug,
          title: input.title,
          titleBn: input.title_bn,
          description: input.description,
          descriptionBn: input.description_bn,
          categoryId: input.category_id,
          price: input.price,
          compareAtPrice: input.compare_at_price,
          status: input.status,
          trackStock: input.track_stock,
          attributes: input.attributes,
          featured: input.featured,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(products.id, id)),
    ];

    if (input.variants !== undefined) {
      for (const variant of input.variants) {
        if (variant.id !== undefined) {
          statements.push(
            db
              .update(variants)
              .set({
                sku: variant.sku,
                title: variant.title,
                options: variant.options,
                price: variant.price,
                stock: variant.stock,
                active: variant.active,
              })
              .where(eq(variants.id, variant.id)),
          );
        } else {
          statements.push(
            db
              .insert(variants)
              .values(variantInsertValues(id, variant as z.infer<typeof variantInputSchema>)),
          );
        }
      }

      for (const variant of removed) {
        statements.push(db.delete(variants).where(eq(variants.id, variant.id)));
      }
    }

    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
    await syncProductFts(c.env.DB, id);

    const product = await loadProduct(db, id);
    return c.json({ ok: true, data: product });
  },
);

adminProductRoutes.delete(
  '/:id',
  zValidator('param', z.object({ id: idParamSchema })),
  async (c) => {
    const { id } = c.req.valid('param');
    const db = getDb(c.env.DB);

    const [existing] = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
    if (!existing) {
      return c.json(
        { ok: false, error: { code: 'not_found', message: 'Product not found' } },
        404,
      );
    }

    const imageRows = await db
      .select({ r2Key: productImages.r2Key })
      .from(productImages)
      .where(eq(productImages.productId, id));

    const keys = imageRows.flatMap((image) => [
      imageVariantKey(image.r2Key, 'thumb'),
      imageVariantKey(image.r2Key, 'md'),
      imageVariantKey(image.r2Key, 'full'),
    ]);
    if (keys.length) await c.env.IMAGES.delete(keys);

    await deleteProductFts(c.env.DB, id);
    await db.delete(products).where(eq(products.id, id));

    return c.json({ ok: true, data: null });
  },
);
