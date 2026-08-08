import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, gte, inArray, like, or, lte, sql } from "drizzle-orm";
import { brands, categories, products, productVariants, reviews, users } from "@bd/db";
import { paginationSchema } from "@bd/core";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { ok, HttpError } from "../lib/http";
import { paginated, paginationFromQuery, likeTerm } from "../lib/query";
import { attachTaxonomy, productDetail } from "../lib/serialize";

const origin = (c: { req: { url: string } }) => new URL(c.req.url).origin;

export const catalogRoutes = new Hono<AppEnv>()
  .get("/categories", async (c) => {
    const db = getDb(c.env);
    const featuredOnly = c.req.query("featured") === "true";
    const rows = await db
      .select()
      .from(categories)
      .where(and(eq(categories.isActive, true), featuredOnly ? eq(categories.isFeatured, true) : undefined))
      .orderBy(asc(categories.sortOrder), asc(categories.name));
    const base = origin(c);
    const byId = new Map(rows.map((r) => [r.id, { ...r, image: r.image ? `${base}/media/${r.image.replace(/^\//, "")}` : null, children: [] as unknown[] }]));
    const tree: unknown[] = [];
    for (const row of rows) {
      const node = byId.get(row.id)!;
      if (row.parentId && byId.has(row.parentId)) {
        (byId.get(row.parentId)! as { children: unknown[] }).children.push(node);
      } else {
        tree.push(node);
      }
    }
    return ok(c, { tree, flat: [...byId.values()] });
  })

  .get("/brands", async (c) => {
    const db = getDb(c.env);
    const rows = await db.select().from(brands).where(eq(brands.isActive, true)).orderBy(asc(brands.sortOrder), asc(brands.name));
    const base = origin(c);
    return ok(
      c,
      rows.map((b) => ({ ...b, logo: b.logo ? `${base}/media/${b.logo.replace(/^\//, "")}` : null })),
    );
  })

  .get("/products", zValidator("query", paginationSchema), async (c) => {
    const db = getDb(c.env);
    const q = c.req.valid("query");
    const query = new URL(c.req.url).searchParams;
    const { page, pageSize } = paginationFromQuery(query, 24);

    const conditions = [eq(products.isActive, true)];
    const categorySlug = query.get("category");
    const brandSlug = query.get("brand");
    const search = q.search;
    const sort = query.get("sort") || "newest";
    const min = query.get("minPrice");
    const max = query.get("maxPrice");
    const featured = query.get("featured");
    const bestSeller = query.get("bestSeller");
    const newArrival = query.get("newArrival");
    const label = query.get("label");

    let catId: string | null = null;
    if (categorySlug) {
      const cat = (await db.select().from(categories).where(eq(categories.slug, categorySlug)).limit(1))[0];
      if (!cat) return ok(c, paginated([], page, pageSize, 0));
      catId = cat.id;
      const children = await db.select().from(categories).where(eq(categories.parentId, cat.id));
      const childIds = children.map((ch) => ch.id);
      conditions.push(childIds.length ? inArray(products.categoryId, [cat.id, ...childIds]) : eq(products.categoryId, cat.id));
    }

    if (brandSlug) {
      const brand = (await db.select().from(brands).where(eq(brands.slug, brandSlug)).limit(1))[0];
      if (!brand) return ok(c, paginated([], page, pageSize, 0));
      conditions.push(eq(products.brandId, brand.id));
    }

    if (search) {
      const term = likeTerm(search);
      conditions.push(or(like(products.name, term), like(products.summary, term), like(products.sku, term))!);
    }
    if (min) conditions.push(gte(products.pricePaisa, parseInt(min, 10)));
    if (max) conditions.push(lte(products.pricePaisa, parseInt(max, 10)));
    if (featured === "true") conditions.push(eq(products.isFeatured, true));
    if (bestSeller === "true") conditions.push(eq(products.isBestSeller, true));
    if (newArrival === "true") conditions.push(eq(products.isNewArrival, true));
    if (label) conditions.push(eq(products.label, label as string));

    const orderBy =
      sort === "price_asc"
        ? asc(products.pricePaisa)
        : sort === "price_desc"
          ? desc(products.pricePaisa)
          : sort === "name"
            ? asc(products.name)
            : sort === "popular"
              ? desc(products.viewCount)
              : desc(products.createdAt);

    const [totalRows, items] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(products).where(and(...conditions)),
      db.select().from(products).where(and(...conditions)).orderBy(orderBy).limit(pageSize).offset((page - 1) * pageSize),
    ]);

    const enriched = await attachTaxonomy(db, c.env, origin(c), items as any);
    return ok(c, paginated(enriched, page, pageSize, totalRows[0]?.count ?? 0));
  })

  .get("/products/featured", async (c) => {
    const db = getDb(c.env);
    const items = await db
      .select()
      .from(products)
      .where(and(eq(products.isActive, true), eq(products.isFeatured, true)))
      .orderBy(desc(products.createdAt))
      .limit(Number(c.req.query("limit") ?? 8));
    return ok(c, await attachTaxonomy(db, c.env, origin(c), items as any));
  })

  .get("/products/best-sellers", async (c) => {
    const db = getDb(c.env);
    const items = await db
      .select()
      .from(products)
      .where(and(eq(products.isActive, true), eq(products.isBestSeller, true)))
      .orderBy(desc(products.viewCount))
      .limit(Number(c.req.query("limit") ?? 8));
    return ok(c, await attachTaxonomy(db, c.env, origin(c), items as any));
  })

  .get("/products/new-arrivals", async (c) => {
    const db = getDb(c.env);
    const items = await db
      .select()
      .from(products)
      .where(and(eq(products.isActive, true), eq(products.isNewArrival, true)))
      .orderBy(desc(products.createdAt))
      .limit(Number(c.req.query("limit") ?? 8));
    return ok(c, await attachTaxonomy(db, c.env, origin(c), items as any));
  })

  .get("/products/flash-sale", async (c) => {
    const db = getDb(c.env);
    const now = new Date();
    const items = await db
      .select()
      .from(products)
      .where(and(eq(products.isActive, true), sql`${products.compareAtPaisa} > ${products.pricePaisa}`, gte(products.saleEndsAt, now)))
      .orderBy(asc(products.saleEndsAt))
      .limit(Number(c.req.query("limit") ?? 8));
    return ok(c, await attachTaxonomy(db, c.env, origin(c), items as any));
  })

  .get("/products/related/:id", async (c) => {
    const db = getDb(c.env);
    const product = (await db.select().from(products).where(eq(products.id, c.req.param("id"))).limit(1))[0];
    if (!product) throw new HttpError(404, "Product not found");
    const conditions = [eq(products.isActive, true), sql`${products.id} != ${product.id}`];
    if (product.categoryId) conditions.push(eq(products.categoryId, product.categoryId));
    const items = await db.select().from(products).where(and(...conditions)).orderBy(desc(products.viewCount)).limit(8);
    return ok(c, await attachTaxonomy(db, c.env, origin(c), items as any));
  })

  .get("/products/:slug", async (c) => {
    const db = getDb(c.env);
    const detail = await productDetail(db, c.env, origin(c), c.req.param("slug"));
    if (!detail) throw new HttpError(404, "Product not found");
    await db.update(products).set({ viewCount: sql`${products.viewCount} + 1` }).where(eq(products.slug, c.req.param("slug")));
    return ok(c, detail);
  })

  .get("/products/:slug/reviews", async (c) => {
    const db = getDb(c.env);
    const { page, pageSize } = paginationFromQuery(new URL(c.req.url).searchParams, 10);
    const product = (await db.select().from(products).where(eq(products.slug, c.req.param("slug"))).limit(1))[0];
    if (!product) throw new HttpError(404, "Product not found");
    const [totalRows, rows] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(reviews).where(and(eq(reviews.productId, product.id), eq(reviews.isApproved, true))),
      db
        .select()
        .from(reviews)
        .where(and(eq(reviews.productId, product.id), eq(reviews.isApproved, true)))
        .orderBy(desc(reviews.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const usersRows = userIds.length ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
    const userMap = new Map(usersRows.map((u) => [u.id, u.name]));
    const data = rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      images: (r.images ?? []).map((img) => (img.startsWith("http") ? img : `${origin(c)}/media/${img.replace(/^\//, "")}`)),
      author: userMap.get(r.userId) ?? "Verified Customer",
      createdAt: r.createdAt.getTime(),
    }));
    return ok(c, paginated(data, page, pageSize, totalRows[0]?.count ?? 0));
  });
