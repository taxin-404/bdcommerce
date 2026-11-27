import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { categories } from '../../db/schema';
import { slugify } from '../../lib/slug';
import {
  categoryInputSchema,
  categoryPatchSchema,
  idParamSchema,
} from '../../lib/validation/admin';
import type { AdminEnv } from '../middleware/admin';

type CategoryRow = typeof categories.$inferSelect;

function fallbackSlug(name: string): string {
  return slugify(name) || `category-${crypto.randomUUID().slice(0, 8)}`;
}

async function uniqueSlug(
  db: ReturnType<typeof getDb>,
  base: string,
  excludeId?: number,
): Promise<string> {
  let candidate = base;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const [existing] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, candidate))
      .limit(1);

    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}-${suffix}`;
  }

  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

function categoryJson(row: CategoryRow, productCount = 0) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    name_bn: row.nameBn,
    parent_id: row.parentId,
    image_key: row.imageKey,
    sort: row.sort,
    active: row.active,
    product_count: productCount,
  };
}

export const adminCategoryRoutes = new Hono<AdminEnv>();

adminCategoryRoutes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.slug, c.name, c.name_bn, c.parent_id, c.image_key, c.sort, c.active,
            (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
       FROM categories c
      ORDER BY c.sort, c.id`,
  ).all<{
    id: number;
    slug: string;
    name: string;
    name_bn: string | null;
    parent_id: number | null;
    image_key: string | null;
    sort: number;
    active: number;
    product_count: number;
  }>();

  return c.json({
    ok: true,
    data: results.map((row) => ({
      ...row,
      active: row.active === 1,
      product_count: Number(row.product_count),
    })),
  });
});

adminCategoryRoutes.post('/', zValidator('json', categoryInputSchema), async (c) => {
  const input = c.req.valid('json');
  const db = getDb(c.env.DB);

  if (input.parent_id) {
    const [parent] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, input.parent_id))
      .limit(1);
    if (!parent) {
      return c.json(
        { ok: false, error: { code: 'invalid_parent', message: 'Parent category not found' } },
        400,
      );
    }
  }

  const slug = await uniqueSlug(db, input.slug ? slugify(input.slug) : fallbackSlug(input.name));

  const [created] = await db
    .insert(categories)
    .values({
      slug,
      name: input.name,
      nameBn: input.name_bn ?? null,
      parentId: input.parent_id ?? null,
      sort: input.sort,
      active: input.active,
    })
    .returning();

  if (!created) throw new Error('Category insert returned no row');

  return c.json({ ok: true, data: categoryJson(created) }, 201);
});

adminCategoryRoutes.patch(
  '/:id',
  zValidator('param', z.object({ id: idParamSchema })),
  zValidator('json', categoryPatchSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');
    const db = getDb(c.env.DB);

    const [existing] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    if (!existing) {
      return c.json(
        { ok: false, error: { code: 'not_found', message: 'Category not found' } },
        404,
      );
    }

    if (input.parent_id) {
      if (input.parent_id === id) {
        return c.json(
          { ok: false, error: { code: 'invalid_parent', message: 'A category cannot parent itself' } },
          400,
        );
      }
      const [parent] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, input.parent_id))
        .limit(1);
      if (!parent) {
        return c.json(
          { ok: false, error: { code: 'invalid_parent', message: 'Parent category not found' } },
          400,
        );
      }
    }

    const slug =
      input.slug !== undefined
        ? await uniqueSlug(db, slugify(input.slug ?? '') || fallbackSlug(input.name ?? existing.name), id)
        : existing.slug;

    const [updated] = await db
      .update(categories)
      .set({
        slug,
        name: input.name,
        nameBn: input.name_bn,
        parentId: input.parent_id,
        sort: input.sort,
        active: input.active,
      })
      .where(eq(categories.id, id))
      .returning();

    if (!updated) throw new Error('Category update returned no row');

    const productCount = await c.env.DB.prepare(
      'SELECT COUNT(*) AS count FROM products WHERE category_id = ?',
    )
      .bind(id)
      .first<{ count: number }>();

    return c.json({ ok: true, data: categoryJson(updated, Number(productCount?.count ?? 0)) });
  },
);

adminCategoryRoutes.delete(
  '/:id',
  zValidator('param', z.object({ id: idParamSchema })),
  async (c) => {
    const { id } = c.req.valid('param');

    const productCount = await c.env.DB.prepare(
      'SELECT COUNT(*) AS count FROM products WHERE category_id = ?',
    )
      .bind(id)
      .first<{ count: number }>();
    if ((productCount?.count ?? 0) > 0) {
      return c.json(
        {
          ok: false,
          error: {
            code: 'category_in_use',
            message: 'Move or delete the products in this category first',
          },
        },
        409,
      );
    }

    const childCount = await c.env.DB.prepare(
      'SELECT COUNT(*) AS count FROM categories WHERE parent_id = ?',
    )
      .bind(id)
      .first<{ count: number }>();
    if ((childCount?.count ?? 0) > 0) {
      return c.json(
        {
          ok: false,
          error: {
            code: 'category_has_children',
            message: 'Move or delete the subcategories first',
          },
        },
        409,
      );
    }

    const db = getDb(c.env.DB);
    const [deleted] = await db
      .delete(categories)
      .where(eq(categories.id, id))
      .returning({ id: categories.id });

    if (!deleted) {
      return c.json(
        { ok: false, error: { code: 'not_found', message: 'Category not found' } },
        404,
      );
    }

    return c.json({ ok: true, data: null });
  },
);
