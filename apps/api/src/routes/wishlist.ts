import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { products, wishlistItems } from "@bd/db";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { ok, HttpError } from "../lib/http";
import { paginated, paginationFromQuery } from "../lib/query";
import { requireCustomer } from "../middleware/auth";
import { mediaUrl } from "../lib/media";

const origin = (c: { req: { url: string } }) => new URL(c.req.url).origin;
const productIdSchema = z.object({ productId: z.string().min(1).max(80) });

export const wishlistRoutes = new Hono<AppEnv>()
  .get("/", requireCustomer, async (c) => {
    const db = getDb(c.env);
    const { page, pageSize } = paginationFromQuery(new URL(c.req.url).searchParams, 24);
    const [totalRows, rows] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(wishlistItems).where(eq(wishlistItems.userId, c.get("userId")!)),
      db
        .select()
        .from(wishlistItems)
        .where(eq(wishlistItems.userId, c.get("userId")!))
        .orderBy(desc(wishlistItems.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);
    const productRows = rows.length
      ? await db.select().from(products).where(inArray(products.id, rows.map((r) => r.productId)))
      : [];
    const map = new Map(productRows.map((p) => [p.id, p]));
    const base = origin(c);
    const items = rows.map((r) => {
      const p = map.get(r.productId);
      return {
        id: r.id,
        productId: r.productId,
        addedAt: r.createdAt.getTime(),
        product: p
          ? {
              id: p.id,
              slug: p.slug,
              name: p.name,
              pricePaisa: p.pricePaisa,
              compareAtPaisa: p.compareAtPaisa,
              stock: p.stock,
              image: mediaUrl(c.env, base, p.coverImage ?? p.images?.[0]?.src),
            }
          : null,
      };
    });
    return ok(c, paginated(items, page, pageSize, totalRows[0]?.count ?? 0));
  })

  .post("/", requireCustomer, zValidator("json", productIdSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const existing = (
      await db
        .select()
        .from(wishlistItems)
        .where(and(eq(wishlistItems.userId, c.get("userId")!), eq(wishlistItems.productId, body.productId)))
        .limit(1)
    )[0];
    if (existing) throw new HttpError(409, "Already in wishlist");
    await db.insert(wishlistItems).values({ userId: c.get("userId")!, productId: body.productId });
    return ok(c, { added: true }, undefined, 201);
  })

  .delete("/:productId", requireCustomer, async (c) => {
    const db = getDb(c.env);
    await db
      .delete(wishlistItems)
      .where(and(eq(wishlistItems.userId, c.get("userId")!), eq(wishlistItems.productId, c.req.param("productId"))));
    return ok(c, { removed: true });
  });
