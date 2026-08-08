import { Hono } from "hono";
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { coupons } from "@bd/db";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { ok } from "../lib/http";

// Public (read-only) coupon endpoint used by marketing pages and storefronts
// to show currently active promo codes. Full validation happens at checkout.
export const couponRoutes = new Hono<AppEnv>().get("/active", async (c) => {
  const db = getDb(c.env);
  const now = new Date();
  const rows = await db
    .select({
      code: coupons.code,
      type: coupons.type,
      value: coupons.value,
      minSubtotalPaisa: coupons.minSubtotalPaisa,
      maxDiscountPaisa: coupons.maxDiscountPaisa,
      appliesTo: coupons.appliesTo,
      expiresAt: coupons.expiresAt,
    })
    .from(coupons)
    .where(
      and(
        eq(coupons.isActive, true),
        or(isNull(coupons.startsAt), lte(coupons.startsAt, now)),
        or(isNull(coupons.expiresAt), gte(coupons.expiresAt, now)),
      ),
    )
    .limit(20);
  return ok(c, rows.map((r) => ({ ...r, expiresAt: r.expiresAt?.getTime() ?? null })));
});
