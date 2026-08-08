import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, like, sql } from "drizzle-orm";
import {
  banners,
  blogCategories,
  blogPosts,
  contactMessages,
  menuItems,
  pages,
  testimonials,
  newsletterSubscribers,
  coupons,
  shippingZones,
  paymentMethods,
} from "@bd/db";
import {
  bannerSchema,
  blogCategorySchema,
  blogPostSchema,
  couponBulkSchema,
  couponSchema,
  menuItemSchema,
  pageSchema,
  shippingZoneSchema,
  testimonialSchema,
} from "@bd/core";
import { slugify } from "@bd/core";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { ok, HttpError } from "../lib/http";
import { paginated, paginationFromQuery, likeTerm } from "../lib/query";
import { requireAdmin } from "../middleware/auth";
import { createNotification } from "../lib/notifications";

export const adminContentRoutes = new Hono<AppEnv>()
  // ---- Pages --------------------------------------------------------------
  .get("/pages", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const rows = await db.select().from(pages).orderBy(asc(pages.title));
    return ok(c, rows);
  })
  .post("/pages", requireAdmin, zValidator("json", pageSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const slug = await uniqueContentSlug(db, pages, body.slug || slugify(body.title));
    const row = (
      await db
        .insert(pages)
        .values({
          slug,
          title: body.title,
          content: body.content ?? null,
          metaTitle: body.metaTitle ?? null,
          metaDescription: body.metaDescription ?? null,
          isPublished: body.isPublished ?? true,
        })
        .returning()
    )[0]!;
    return ok(c, row, undefined, 201);
  })
  .patch("/pages/:id", requireAdmin, zValidator("json", pageSchema.partial()), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const existing = (await db.select().from(pages).where(eq(pages.id, c.req.param("id"))).limit(1))[0];
    if (!existing) throw new HttpError(404, "Page not found");
    const slug = body.slug && body.slug !== existing.slug ? await uniqueContentSlug(db, pages, body.slug, existing.id) : existing.slug;
    const row = (await db.update(pages).set({ ...body, slug, updatedAt: new Date() }).where(eq(pages.id, existing.id)).returning())[0]!;
    return ok(c, row);
  })
  .delete("/pages/:id", requireAdmin, async (c) => {
    const db = getDb(c.env);
    await db.delete(pages).where(eq(pages.id, c.req.param("id")));
    return ok(c, { deleted: true });
  })

  // ---- Menu ---------------------------------------------------------------
  .get("/menu", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const rows = await db.select().from(menuItems).orderBy(asc(menuItems.location), asc(menuItems.sortOrder));
    return ok(c, rows);
  })
  .post("/menu", requireAdmin, zValidator("json", menuItemSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const row = (await db.insert(menuItems).values(body as any).returning())[0]!;
    return ok(c, row, undefined, 201);
  })
  .patch("/menu/:id", requireAdmin, zValidator("json", menuItemSchema.partial()), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const existing = (await db.select().from(menuItems).where(eq(menuItems.id, c.req.param("id"))).limit(1))[0];
    if (!existing) throw new HttpError(404, "Menu item not found");
    const row = (await db.update(menuItems).set({ ...body, updatedAt: new Date() }).where(eq(menuItems.id, existing.id)).returning())[0]!;
    return ok(c, row);
  })
  .delete("/menu/:id", requireAdmin, async (c) => {
    const db = getDb(c.env);
    await db.delete(menuItems).where(eq(menuItems.id, c.req.param("id")));
    return ok(c, { deleted: true });
  })

  // ---- Banners ------------------------------------------------------------
  .get("/banners", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const rows = await db.select().from(banners).orderBy(asc(banners.position), asc(banners.sortOrder));
    return ok(c, rows);
  })
  .post("/banners", requireAdmin, zValidator("json", bannerSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const row = (
      await db
        .insert(banners)
        .values({
          title: body.title ?? null,
          subtitle: body.subtitle ?? null,
          image: body.image ?? null,
          link: body.link ?? null,
          position: body.position,
          sortOrder: body.sortOrder,
          isActive: body.isActive ?? true,
          startsAt: body.startsAt ? new Date(body.startsAt) : null,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        })
        .returning()
    )[0]!;
    return ok(c, row, undefined, 201);
  })
  .patch("/banners/:id", requireAdmin, zValidator("json", bannerSchema.partial()), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const existing = (await db.select().from(banners).where(eq(banners.id, c.req.param("id"))).limit(1))[0];
    if (!existing) throw new HttpError(404, "Banner not found");
    const row = (
      await db
        .update(banners)
        .set({
          ...body,
          startsAt: body.startsAt !== undefined ? (body.startsAt ? new Date(body.startsAt) : null) : existing.startsAt,
          expiresAt: body.expiresAt !== undefined ? (body.expiresAt ? new Date(body.expiresAt) : null) : existing.expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(banners.id, existing.id))
        .returning()
    )[0]!;
    return ok(c, row);
  })
  .delete("/banners/:id", requireAdmin, async (c) => {
    const db = getDb(c.env);
    await db.delete(banners).where(eq(banners.id, c.req.param("id")));
    return ok(c, { deleted: true });
  })

  // ---- Testimonials -------------------------------------------------------
  .get("/testimonials", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const rows = await db.select().from(testimonials).orderBy(asc(testimonials.sortOrder));
    return ok(c, rows);
  })
  .post("/testimonials", requireAdmin, zValidator("json", testimonialSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const row = (
      await db
        .insert(testimonials)
        .values({ name: body.name, role: body.role ?? null, content: body.content, rating: body.rating, image: body.image ?? null, sortOrder: body.sortOrder, isActive: body.isActive ?? true })
        .returning()
    )[0]!;
    return ok(c, row, undefined, 201);
  })
  .patch("/testimonials/:id", requireAdmin, zValidator("json", testimonialSchema.partial()), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const existing = (await db.select().from(testimonials).where(eq(testimonials.id, c.req.param("id"))).limit(1))[0];
    if (!existing) throw new HttpError(404, "Testimonial not found");
    const row = (await db.update(testimonials).set({ ...body, updatedAt: new Date() }).where(eq(testimonials.id, existing.id)).returning())[0]!;
    return ok(c, row);
  })
  .delete("/testimonials/:id", requireAdmin, async (c) => {
    const db = getDb(c.env);
    await db.delete(testimonials).where(eq(testimonials.id, c.req.param("id")));
    return ok(c, { deleted: true });
  })

  // ---- Blog ---------------------------------------------------------------
  .get("/blog", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const { page, pageSize } = paginationFromQuery(new URL(c.req.url).searchParams, 20);
    const [totalRows, rows] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(blogPosts),
      db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    ]);
    return ok(c, paginated(rows, page, pageSize, totalRows[0]?.count ?? 0));
  })
  .get("/blog/:id", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const row = (await db.select().from(blogPosts).where(eq(blogPosts.id, c.req.param("id"))).limit(1))[0];
    if (!row) throw new HttpError(404, "Post not found");
    return ok(c, row);
  })
  .post("/blog", requireAdmin, zValidator("json", blogPostSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const slug = await uniqueContentSlug(db, blogPosts, body.slug || slugify(body.title));
    const row = (
      await db
        .insert(blogPosts)
        .values({
          title: body.title,
          slug,
          excerpt: body.excerpt ?? null,
          content: body.content ?? null,
          coverImage: body.coverImage ?? null,
          categoryId: body.categoryId ?? null,
          isPublished: body.isPublished ?? false,
          publishedAt: body.publishedAt ? new Date(body.publishedAt) : body.isPublished ? new Date() : null,
          metaTitle: body.metaTitle ?? null,
          metaDescription: body.metaDescription ?? null,
          tags: body.tags ?? null,
        })
        .returning()
    )[0]!;
    return ok(c, row, undefined, 201);
  })
  .patch("/blog/:id", requireAdmin, zValidator("json", blogPostSchema.partial()), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const existing = (await db.select().from(blogPosts).where(eq(blogPosts.id, c.req.param("id"))).limit(1))[0];
    if (!existing) throw new HttpError(404, "Post not found");
    const slug = body.slug && body.slug !== existing.slug ? await uniqueContentSlug(db, blogPosts, body.slug, existing.id) : existing.slug;
    const row = (
      await db
        .update(blogPosts)
        .set({
          ...body,
          slug,
          publishedAt: body.publishedAt !== undefined ? (body.publishedAt ? new Date(body.publishedAt) : null) : existing.publishedAt,
          updatedAt: new Date(),
        })
        .where(eq(blogPosts.id, existing.id))
        .returning()
    )[0]!;
    return ok(c, row);
  })
  .delete("/blog/:id", requireAdmin, async (c) => {
    const db = getDb(c.env);
    await db.delete(blogPosts).where(eq(blogPosts.id, c.req.param("id")));
    return ok(c, { deleted: true });
  })
  .get("/blog-categories", requireAdmin, async (c) => {
    const db = getDb(c.env);
    return ok(c, await db.select().from(blogCategories).orderBy(asc(blogCategories.name)));
  })
  .post("/blog-categories", requireAdmin, zValidator("json", blogCategorySchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const slug = body.slug || slugify(body.name);
    const row = (await db.insert(blogCategories).values({ name: body.name, slug }).returning())[0]!;
    return ok(c, row, undefined, 201);
  })
  .delete("/blog-categories/:id", requireAdmin, async (c) => {
    const db = getDb(c.env);
    await db.delete(blogCategories).where(eq(blogCategories.id, c.req.param("id")));
    return ok(c, { deleted: true });
  })

  // ---- Coupons ------------------------------------------------------------
  .get("/coupons", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const rows = await db.select().from(coupons).orderBy(desc(coupons.createdAt));
    return ok(c, rows);
  })
  .post("/coupons", requireAdmin, zValidator("json", couponSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const existing = (await db.select().from(coupons).where(eq(coupons.code, body.code)).limit(1))[0];
    if (existing) throw new HttpError(409, "Coupon code already exists");
    const row = (
      await db
        .insert(coupons)
        .values({
          code: body.code,
          type: body.type,
          value: body.value,
          minSubtotalPaisa: body.minSubtotalPaisa,
          maxDiscountPaisa: body.maxDiscountPaisa ?? null,
          usageLimit: body.usageLimit ?? null,
          perUserLimit: body.perUserLimit,
          appliesTo: body.appliesTo,
          appliesToId: body.appliesToId ?? null,
          buyX: body.buyX ?? null,
          getY: body.getY ?? null,
          startsAt: body.startsAt ? new Date(body.startsAt) : null,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          isActive: body.isActive ?? true,
        })
        .returning()
    )[0]!;
    return ok(c, row, undefined, 201);
  })
  .patch("/coupons/:id", requireAdmin, zValidator("json", couponSchema.partial()), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const existing = (await db.select().from(coupons).where(eq(coupons.id, c.req.param("id"))).limit(1))[0];
    if (!existing) throw new HttpError(404, "Coupon not found");
    const row = (
      await db
        .update(coupons)
        .set({
          ...body,
          startsAt: body.startsAt !== undefined ? (body.startsAt ? new Date(body.startsAt) : null) : existing.startsAt,
          expiresAt: body.expiresAt !== undefined ? (body.expiresAt ? new Date(body.expiresAt) : null) : existing.expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(coupons.id, existing.id))
        .returning()
    )[0]!;
    return ok(c, row);
  })
  .post("/coupons/bulk", requireAdmin, zValidator("json", couponBulkSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const first = (await db.select().from(coupons).where(eq(coupons.id, body.ids[0]!)).limit(1))[0];
    const toggleTo = !first?.isActive;
    await db.update(coupons).set({ isActive: toggleTo, updatedAt: new Date() }).where(and(...body.ids.map((id) => eq(coupons.id, id))));
    return ok(c, { updated: body.ids.length, isActive: toggleTo });
  })
  .delete("/coupons/:id", requireAdmin, async (c) => {
    const db = getDb(c.env);
    await db.delete(coupons).where(eq(coupons.id, c.req.param("id")));
    return ok(c, { deleted: true });
  })

  // ---- Shipping zones -------------------------------------------------------
  .get("/shipping-zones", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const rows = await db.select().from(shippingZones).orderBy(asc(shippingZones.type), asc(shippingZones.district));
    return ok(c, rows);
  })
  .post("/shipping-zones", requireAdmin, zValidator("json", shippingZoneSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const row = (
      await db
        .insert(shippingZones)
        .values({
          name: body.name,
          type: body.type,
          district: body.district ?? null,
          upazila: body.upazila ?? null,
          chargePaisa: body.chargePaisa,
          freeOverPaisa: body.freeOverPaisa ?? null,
          isActive: body.isActive ?? true,
        })
        .returning()
    )[0]!;
    return ok(c, row, undefined, 201);
  })
  .patch("/shipping-zones/:id", requireAdmin, zValidator("json", shippingZoneSchema.partial()), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const existing = (await db.select().from(shippingZones).where(eq(shippingZones.id, c.req.param("id"))).limit(1))[0];
    if (!existing) throw new HttpError(404, "Zone not found");
    const row = (await db.update(shippingZones).set({ ...body, updatedAt: new Date() }).where(eq(shippingZones.id, existing.id)).returning())[0]!;
    return ok(c, row);
  })
  .delete("/shipping-zones/:id", requireAdmin, async (c) => {
    const db = getDb(c.env);
    await db.delete(shippingZones).where(eq(shippingZones.id, c.req.param("id")));
    return ok(c, { deleted: true });
  })

  // ---- Payment methods ------------------------------------------------------
  .get("/payment-methods", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const rows = await db.select().from(paymentMethods).orderBy(asc(paymentMethods.sortOrder));
    return ok(c, rows);
  })
  .patch("/payment-methods/:key", requireAdmin, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { isActive?: boolean; name?: string; description?: string; config?: Record<string, unknown>; sortOrder?: number };
    const db = getDb(c.env);
    const existing = (await db.select().from(paymentMethods).where(eq(paymentMethods.key, c.req.param("key"))).limit(1))[0];
    if (!existing) {
      const row = (
        await db
          .insert(paymentMethods)
          .values({ key: c.req.param("key"), name: body.name ?? c.req.param("key"), isActive: body.isActive ?? false, config: body.config ?? {} })
          .returning()
      )[0]!;
      return ok(c, row);
    }
    const row = (await db.update(paymentMethods).set({ ...body, updatedAt: new Date() }).where(eq(paymentMethods.id, existing.id)).returning())[0]!;
    return ok(c, row);
  })

  // ---- Contact messages ------------------------------------------------------
  .get("/messages", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const { page, pageSize } = paginationFromQuery(new URL(c.req.url).searchParams, 20);
    const [totalRows, rows] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(contactMessages),
      db.select().from(contactMessages).orderBy(desc(contactMessages.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    ]);
    return ok(c, paginated(rows, page, pageSize, totalRows[0]?.count ?? 0));
  })
  .patch("/messages/:id/read", requireAdmin, async (c) => {
    const db = getDb(c.env);
    await db.update(contactMessages).set({ isRead: true }).where(eq(contactMessages.id, c.req.param("id")));
    return ok(c, { read: true });
  })
  .delete("/messages/:id", requireAdmin, async (c) => {
    const db = getDb(c.env);
    await db.delete(contactMessages).where(eq(contactMessages.id, c.req.param("id")));
    return ok(c, { deleted: true });
  })

  // ---- Newsletter -------------------------------------------------------------
  .get("/newsletter", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const { page, pageSize } = paginationFromQuery(new URL(c.req.url).searchParams, 50);
    const search = new URL(c.req.url).searchParams.get("search");
    const conditions = [search ? like(newsletterSubscribers.email, likeTerm(search)) : undefined].filter(Boolean);
    const [totalRows, rows] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(newsletterSubscribers).where(conditions.length ? and(...(conditions as any)) : undefined),
      db.select().from(newsletterSubscribers).where(conditions.length ? and(...(conditions as any)) : undefined).orderBy(desc(newsletterSubscribers.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    ]);
    return ok(c, paginated(rows, page, pageSize, totalRows[0]?.count ?? 0));
  })
  .delete("/newsletter/:id", requireAdmin, async (c) => {
    const db = getDb(c.env);
    await db.delete(newsletterSubscribers).where(eq(newsletterSubscribers.id, c.req.param("id")));
    return ok(c, { deleted: true });
  });

// Unique slug helper for content tables (pages, blog posts).
async function uniqueContentSlug<T extends { id: string; slug: string }>(db: ReturnType<typeof getDb>, table: any, base: string, excludeId?: string): Promise<string> {
  let slug = base || `item-${Date.now().toString(36)}`;
  let i = 2;
  for (;;) {
    const rows = await db.select({ id: table.id }).from(table).where(eq(table.slug, slug)).limit(1);
    if (!rows[0] || rows[0].id === excludeId) return slug;
    slug = `${base}-${i++}`;
  }
}
