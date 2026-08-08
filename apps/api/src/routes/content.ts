import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { banners, blogCategories, blogPosts, menuItems, pages, testimonials } from "@bd/db";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { ok, HttpError } from "../lib/http";
import { paginated, paginationFromQuery } from "../lib/query";
import { mediaUrl } from "../lib/media";

const origin = (c: { req: { url: string } }) => new URL(c.req.url).origin;

function bannerOut(env: AppEnv["Bindings"], base: string, b: typeof banners.$inferSelect) {
  return {
    id: b.id,
    title: b.title,
    subtitle: b.subtitle,
    image: mediaUrl(env, base, b.image),
    link: b.link,
    position: b.position,
    sortOrder: b.sortOrder,
  };
}

export const contentRoutes = new Hono<AppEnv>()
  // ---- Navigation ---------------------------------------------------------
  .get("/menu", async (c) => {
    const db = getDb(c.env);
    const rows = await db.select().from(menuItems).where(eq(menuItems.isActive, true)).orderBy(asc(menuItems.location), asc(menuItems.sortOrder));
    return ok(c, rows);
  })

  // ---- Pages --------------------------------------------------------------
  .get("/pages", async (c) => {
    const db = getDb(c.env);
    const rows = await db.select({ slug: pages.slug, title: pages.title }).from(pages).where(eq(pages.isPublished, true)).orderBy(asc(pages.title));
    return ok(c, rows);
  })

  .get("/pages/:slug", async (c) => {
    const db = getDb(c.env);
    const page = (await db.select().from(pages).where(and(eq(pages.slug, c.req.param("slug")), eq(pages.isPublished, true))).limit(1))[0];
    if (!page) throw new HttpError(404, "Page not found");
    return ok(c, {
      slug: page.slug,
      title: page.title,
      content: page.content,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      updatedAt: page.updatedAt.getTime(),
    });
  })

  // ---- Banners ------------------------------------------------------------
  .get("/banners", async (c) => {
    const db = getDb(c.env);
    const now = new Date();
    const rows = await db
      .select()
      .from(banners)
      .where(
        and(
          eq(banners.isActive, true),
          or(isNull(banners.startsAt), lte(banners.startsAt, now)),
          or(isNull(banners.expiresAt), gte(banners.expiresAt, now)),
        ),
      )
      .orderBy(asc(banners.position), asc(banners.sortOrder));
    const base = origin(c);
    return ok(c, rows.map((b) => bannerOut(c.env, base, b)));
  })

  // ---- Testimonials -------------------------------------------------------
  .get("/testimonials", async (c) => {
    const db = getDb(c.env);
    const rows = await db.select().from(testimonials).where(eq(testimonials.isActive, true)).orderBy(asc(testimonials.sortOrder)).limit(Number(c.req.query("limit") ?? 20));
    const base = origin(c);
    return ok(
      c,
      rows.map((t) => ({ id: t.id, name: t.name, role: t.role, content: t.content, rating: t.rating, image: mediaUrl(c.env, base, t.image) })),
    );
  })

  // ---- Blog ---------------------------------------------------------------
  .get("/blog/categories", async (c) => {
    const db = getDb(c.env);
    const rows = await db.select().from(blogCategories).orderBy(asc(blogCategories.name));
    return ok(c, rows);
  })

  .get("/blog", async (c) => {
    const db = getDb(c.env);
    const { page, pageSize } = paginationFromQuery(new URL(c.req.url).searchParams, 12);
    const category = c.req.query("category");
    const conditions = [eq(blogPosts.isPublished, true), or(isNull(blogPosts.publishedAt), lte(blogPosts.publishedAt, new Date()))];
    if (category) {
      const cat = (await db.select().from(blogCategories).where(eq(blogCategories.slug, category)).limit(1))[0];
      if (!cat) return ok(c, paginated([], page, pageSize, 0));
      conditions.push(eq(blogPosts.categoryId, cat.id));
    }
    const [totalRows, rows] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(blogPosts).where(and(...conditions)),
      db.select().from(blogPosts).where(and(...conditions)).orderBy(desc(blogPosts.publishedAt), desc(blogPosts.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    ]);
    const catIds = [...new Set(rows.map((r) => r.categoryId).filter(Boolean) as string[])];
    const cats = catIds.length ? await db.select().from(blogCategories).where(inArray(blogCategories.id, catIds)) : [];
    const catMap = new Map(cats.map((x) => [x.id, x]));
    const base = origin(c);
    return ok(
      c,
      paginated(
        rows.map((r) => ({
          id: r.id,
          slug: r.slug,
          title: r.title,
          excerpt: r.excerpt,
          coverImage: mediaUrl(c.env, base, r.coverImage),
          category: r.categoryId ? { id: r.categoryId, name: catMap.get(r.categoryId)?.name ?? "", slug: catMap.get(r.categoryId)?.slug ?? "" } : null,
          publishedAt: r.publishedAt?.getTime() ?? r.createdAt.getTime(),
          tags: r.tags ?? [],
        })),
        page,
        pageSize,
        totalRows[0]?.count ?? 0,
      ),
    );
  })

  .get("/blog/:slug", async (c) => {
    const db = getDb(c.env);
    const post = (await db.select().from(blogPosts).where(and(eq(blogPosts.slug, c.req.param("slug")), eq(blogPosts.isPublished, true))).limit(1))[0];
    if (!post) throw new HttpError(404, "Post not found");
    const cat = post.categoryId ? (await db.select().from(blogCategories).where(eq(blogCategories.id, post.categoryId)).limit(1))[0] : undefined;
    const base = origin(c);
    return ok(c, {
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      coverImage: mediaUrl(c.env, base, post.coverImage),
      category: cat ? { id: cat.id, name: cat.name, slug: cat.slug } : null,
      tags: post.tags ?? [],
      publishedAt: post.publishedAt?.getTime() ?? post.createdAt.getTime(),
      metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
    });
  });
