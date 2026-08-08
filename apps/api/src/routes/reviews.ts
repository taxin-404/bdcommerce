import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, sql } from "drizzle-orm";
import { orderItems, orders, products, reviews } from "@bd/db";
import { reviewSchema } from "@bd/core";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { ok, HttpError } from "../lib/http";
import { requireCustomer } from "../middleware/auth";
import { createNotification } from "../lib/notifications";

export const reviewRoutes = new Hono<AppEnv>()
  // Customer submits a review. Only allowed if they have a DELIVERED order
  // containing the product (verified purchase).
  .post("/", requireCustomer, zValidator("json", reviewSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const userId = c.get("userId")!;

    const product = (await db.select().from(products).where(eq(products.id, body.productId)).limit(1))[0];
    if (!product) throw new HttpError(404, "Product not found");

    const verified = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orders.userId, userId), eq(orders.status, "DELIVERED"), eq(orderItems.productId, body.productId)))
      .limit(1);
    if (verified.length === 0) throw new HttpError(403, "Only verified buyers can review this product");

    const existing = (await db.select().from(reviews).where(and(eq(reviews.userId, userId), eq(reviews.productId, body.productId))).limit(1))[0];
    if (existing) throw new HttpError(409, "You already reviewed this product");

    const review = (
      await db
        .insert(reviews)
        .values({
          productId: body.productId,
          userId,
          rating: body.rating,
          title: body.title ?? null,
          body: body.body,
          images: body.images ?? null,
          isApproved: false,
          orderId: verified[0]!.id,
        })
        .returning()
    )[0]!;

    await createNotification(db, c.env, {
      type: "REVIEW",
      title: `New review for ${product.name}`,
      body: `${body.rating}/5 — awaiting approval`,
      link: `/admin/reviews/${review.id}`,
    });
    return ok(c, { id: review.id, pendingApproval: true }, undefined, 201);
  })

  // Vote a review helpful
  .post("/:id/helpful", async (c) => {
    const db = getDb(c.env);
    const review = (await db.select().from(reviews).where(eq(reviews.id, c.req.param("id"))).limit(1))[0];
    if (!review) throw new HttpError(404, "Review not found");
    await db.update(reviews).set({ helpfulCount: sql`${reviews.helpfulCount} + 1` }).where(eq(reviews.id, review.id));
    return ok(c, { helpfulCount: review.helpfulCount + 1 });
  });
