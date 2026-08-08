import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { brands, categories, productVariants, products } from "@bd/db";
import { productSchema, categorySchema, brandSchema, productBulkSchema } from "@bd/core";
import { slugify } from "@bd/core";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { ok, HttpError } from "../lib/http";
import { paginated, paginationFromQuery, likeTerm } from "../lib/query";
import { requireAdmin } from "../middleware/auth";
import { mediaUrl } from "../lib/media";

const origin = (c: { req: { url: string } }) => new URL(c.req.url).origin;

export const adminCatalogRoutes = new Hono<AppEnv>()
  // ---------------------------------------------------------------------------
  // Products
  // ---------------------------------------------------------------------------
  .get("/products", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const q = new URL(c.req.url);
    const { page, pageSize } = paginationFromQuery(q.searchParams, 25);
    const search = q.searchParams.get("search");
    const category = q.searchParams.get("category");
    const brand = q.searchParams.get("brand");
    const status = q.searchParams.get("status");
    const sort = q.searchParams.get("sort") || "newest";

    const conditions = [
      search ? or(like(products.name, likeTerm(search)), like(products.sku, likeTerm(search)), like(products.slug, likeTerm(search))) : undefined,
      category ? eq(products.categoryId, category) : undefined,
      brand ? eq(products.brandId, brand) : undefined,
      status === "active" ? eq(products.isActive, true) : undefined,
      status === "inactive" ? eq(products.isActive, false) : undefined,
      status === "low" ? sql`${products.stock} <= ${products.lowStockThreshold}` : undefined,
      status === "out" ? eq(products.stock, 0) : undefined,
    ].filter(Boolean);

    const orderBy =
      sort === "price_asc"
        ? asc(products.pricePaisa)
        : sort === "price_desc"
          ? desc(products.pricePaisa)
          : sort === "stock"
            ? asc(products.stock)
            : sort === "name"
              ? asc(products.name)
              : desc(products.createdAt);

    const [totalRows, rows] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(products).where(conditions.length ? and(...(conditions as any)) : undefined),
      db
        .select()
        .from(products)
        .where(conditions.length ? and(...(conditions as any)) : undefined)
        .orderBy(orderBy)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);

    const base = origin(c);
    return ok(
      c,
      paginated(
        rows.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          sku: p.sku,
          pricePaisa: p.pricePaisa,
          compareAtPaisa: p.compareAtPaisa,
          costPaisa: p.costPaisa,
          stock: p.stock,
          lowStockThreshold: p.lowStockThreshold,
          isActive: p.isActive,
          isFeatured: p.isFeatured,
          isBestSeller: p.isBestSeller,
          isNewArrival: p.isNewArrival,
          label: p.label,
          categoryId: p.categoryId,
          brandId: p.brandId,
          image: mediaUrl(c.env, base, p.coverImage ?? p.images?.[0]?.src),
          createdAt: p.createdAt.getTime(),
          updatedAt: p.updatedAt.getTime(),
        })),
        page,
        pageSize,
        totalRows[0]?.count ?? 0,
      ),
    );
  })

  .get("/products/:id", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const p = (await db.select().from(products).where(eq(products.id, c.req.param("id"))).limit(1))[0];
    if (!p) throw new HttpError(404, "Product not found");
    const variants = await db.select().from(productVariants).where(eq(productVariants.productId, p.id)).orderBy(asc(productVariants.createdAt));
    return ok(c, { ...p, variants });
  })

  .post("/products", requireAdmin, zValidator("json", productSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);

    const slug = await uniqueSlug(db, body.slug || slugify(body.name));
    const product = (
      await db
        .insert(products)
        .values({
          name: body.name,
          slug,
          summary: body.summary ?? null,
          description: body.description ?? null,
          specifications: body.specifications ?? null,
          pricePaisa: body.pricePaisa,
          compareAtPaisa: body.compareAtPaisa ?? null,
          costPaisa: body.costPaisa ?? null,
          sku: body.sku ?? null,
          barcode: body.barcode ?? null,
          categoryId: body.categoryId ?? null,
          brandId: body.brandId ?? null,
          images: body.images ?? null,
          coverImage: body.coverImage ?? null,
          videoUrl: body.videoUrl ?? null,
          tags: body.tags ?? null,
          isActive: body.isActive ?? true,
          isFeatured: body.isFeatured ?? false,
          isBestSeller: body.isBestSeller ?? false,
          isNewArrival: body.isNewArrival ?? false,
          label: body.label ?? null,
          stock: body.stock,
          lowStockThreshold: body.lowStockThreshold,
          weight: body.weight ?? null,
          saleEndsAt: body.saleEndsAt ? new Date(body.saleEndsAt) : null,
          metaTitle: body.metaTitle ?? null,
          metaDescription: body.metaDescription ?? null,
        })
        .returning()
    )[0]!;

    if (body.variants?.length) {
      await db.insert(productVariants).values(
        body.variants.map((v) => ({
          productId: product.id,
          name: v.name,
          options: v.options ?? {},
          sku: v.sku ?? null,
          pricePaisa: v.pricePaisa ?? null,
          stock: v.stock,
          image: v.image ?? null,
        })),
      );
    }
    return ok(c, { id: product.id, slug: product.slug }, undefined, 201);
  })

  .patch("/products/:id", requireAdmin, zValidator("json", productSchema.partial()), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const existing = (await db.select().from(products).where(eq(products.id, c.req.param("id"))).limit(1))[0];
    if (!existing) throw new HttpError(404, "Product not found");

    let slug = existing.slug;
    if (body.slug && body.slug !== existing.slug) {
      slug = await uniqueSlug(db, body.slug, existing.id);
    } else if (body.name && body.name !== existing.name && !body.slug) {
      slug = await uniqueSlug(db, slugify(body.name), existing.id);
    }

    const product = (
      await db
        .update(products)
        .set({
          ...(body.name !== undefined ? { name: body.name } : {}),
          slug,
          ...(body.summary !== undefined ? { summary: body.summary } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.specifications !== undefined ? { specifications: body.specifications } : {}),
          ...(body.pricePaisa !== undefined ? { pricePaisa: body.pricePaisa } : {}),
          ...(body.compareAtPaisa !== undefined ? { compareAtPaisa: body.compareAtPaisa } : {}),
          ...(body.costPaisa !== undefined ? { costPaisa: body.costPaisa } : {}),
          ...(body.sku !== undefined ? { sku: body.sku } : {}),
          ...(body.barcode !== undefined ? { barcode: body.barcode } : {}),
          ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
          ...(body.brandId !== undefined ? { brandId: body.brandId } : {}),
          ...(body.images !== undefined ? { images: body.images } : {}),
          ...(body.coverImage !== undefined ? { coverImage: body.coverImage } : {}),
          ...(body.videoUrl !== undefined ? { videoUrl: body.videoUrl } : {}),
          ...(body.tags !== undefined ? { tags: body.tags } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.isFeatured !== undefined ? { isFeatured: body.isFeatured } : {}),
          ...(body.isBestSeller !== undefined ? { isBestSeller: body.isBestSeller } : {}),
          ...(body.isNewArrival !== undefined ? { isNewArrival: body.isNewArrival } : {}),
          ...(body.label !== undefined ? { label: body.label } : {}),
          ...(body.stock !== undefined ? { stock: body.stock } : {}),
          ...(body.lowStockThreshold !== undefined ? { lowStockThreshold: body.lowStockThreshold } : {}),
          ...(body.weight !== undefined ? { weight: body.weight } : {}),
          ...(body.saleEndsAt !== undefined ? { saleEndsAt: body.saleEndsAt ? new Date(body.saleEndsAt) : null } : {}),
          ...(body.metaTitle !== undefined ? { metaTitle: body.metaTitle } : {}),
          ...(body.metaDescription !== undefined ? { metaDescription: body.metaDescription } : {}),
          updatedAt: new Date(),
        })
        .where(eq(products.id, existing.id))
        .returning()
    )[0]!;

    // Replace variants wholesale when supplied
    if (body.variants) {
      await db.delete(productVariants).where(eq(productVariants.productId, existing.id));
      if (body.variants.length) {
        await db.insert(productVariants).values(
          body.variants.map((v) => ({
            productId: existing.id,
            name: v.name,
            options: v.options ?? {},
            sku: v.sku ?? null,
            pricePaisa: v.pricePaisa ?? null,
            stock: v.stock,
            image: v.image ?? null,
          })),
        );
      }
    }

    return ok(c, { id: product.id, slug: product.slug });
  })

  .delete("/products/:id", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const existing = (await db.select().from(products).where(eq(products.id, c.req.param("id"))).limit(1))[0];
    if (!existing) throw new HttpError(404, "Product not found");
    await db.delete(productVariants).where(eq(productVariants.productId, existing.id));
    await db.delete(products).where(eq(products.id, existing.id));
    return ok(c, { deleted: true });
  })

  .post("/products/bulk", requireAdmin, zValidator("json", productBulkSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    await db
      .update(products)
      .set({ ...body.patch, updatedAt: new Date() })
      .where(inArray(products.id, body.ids));
    return ok(c, { updated: body.ids.length });
  })

  // ---------------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------------
  .get("/categories", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const rows = await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
    return ok(c, rows);
  })

  .post("/categories", requireAdmin, zValidator("json", categorySchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const slug = await uniqueSlug(db, body.slug || slugify(body.name), undefined, categories);
    const row = (
      await db
        .insert(categories)
        .values({
          name: body.name,
          slug,
          description: body.description ?? null,
          image: body.image ?? null,
          parentId: body.parentId ?? null,
          sortOrder: body.sortOrder,
          isActive: body.isActive ?? true,
          isFeatured: body.isFeatured ?? false,
          metaTitle: body.metaTitle ?? null,
          metaDescription: body.metaDescription ?? null,
        })
        .returning()
    )[0]!;
    return ok(c, row, undefined, 201);
  })

  .patch("/categories/:id", requireAdmin, zValidator("json", categorySchema.partial()), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const existing = (await db.select().from(categories).where(eq(categories.id, c.req.param("id"))).limit(1))[0];
    if (!existing) throw new HttpError(404, "Category not found");
    const slug = body.slug && body.slug !== existing.slug ? await uniqueSlug(db, body.slug, existing.id, categories) : existing.slug;
    const row = (
      await db
        .update(categories)
        .set({ ...body, slug, updatedAt: new Date() })
        .where(eq(categories.id, existing.id))
        .returning()
    )[0]!;
    return ok(c, row);
  })

  .delete("/categories/:id", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const existing = (await db.select().from(categories).where(eq(categories.id, c.req.param("id"))).limit(1))[0];
    if (!existing) throw new HttpError(404, "Category not found");
    await db.delete(categories).where(eq(categories.id, existing.id));
    return ok(c, { deleted: true });
  })

  // ---------------------------------------------------------------------------
  // Brands
  // ---------------------------------------------------------------------------
  .get("/brands", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const rows = await db.select().from(brands).orderBy(asc(brands.sortOrder), asc(brands.name));
    return ok(c, rows);
  })

  .post("/brands", requireAdmin, zValidator("json", brandSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const slug = await uniqueSlug(db, body.slug || slugify(body.name), undefined, brands);
    const row = (
      await db
        .insert(brands)
        .values({
          name: body.name,
          slug,
          logo: body.logo ?? null,
          description: body.description ?? null,
          sortOrder: body.sortOrder,
          isActive: body.isActive ?? true,
        })
        .returning()
    )[0]!;
    return ok(c, row, undefined, 201);
  })

  .patch("/brands/:id", requireAdmin, zValidator("json", brandSchema.partial()), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const existing = (await db.select().from(brands).where(eq(brands.id, c.req.param("id"))).limit(1))[0];
    if (!existing) throw new HttpError(404, "Brand not found");
    const slug = body.slug && body.slug !== existing.slug ? await uniqueSlug(db, body.slug, existing.id, brands) : existing.slug;
    const row = (
      await db
        .update(brands)
        .set({ ...body, slug, updatedAt: new Date() })
        .where(eq(brands.id, existing.id))
        .returning()
    )[0]!;
    return ok(c, row);
  })

  .delete("/brands/:id", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const existing = (await db.select().from(brands).where(eq(brands.id, c.req.param("id"))).limit(1))[0];
    if (!existing) throw new HttpError(404, "Brand not found");
    await db.delete(brands).where(eq(brands.id, existing.id));
    return ok(c, { deleted: true });
  });

// Ensure slugs are unique; append -2, -3, ... when a collision exists.
async function uniqueSlug(
  db: ReturnType<typeof getDb>,
  base: string,
  excludeId?: string,
  table: typeof products | typeof categories | typeof brands = products,
): Promise<string> {
  let slug = base;
  let i = 2;
  for (;;) {
    const rows = await db.select({ id: table.id }).from(table).where(eq(table.slug, slug)).limit(1);
    if (!rows[0] || rows[0].id === excludeId) return slug;
    slug = `${base}-${i++}`;
  }
}
