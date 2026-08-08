import { Hono } from "hono";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { orderItems, orders, products, users } from "@bd/db";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { ok } from "../lib/http";
import { requireAdmin } from "../middleware/auth";
import { orderSummary } from "./orders";

const ACTIVE_REVENUE = ["PAID", "COD"];
const NON_REVENUE_STATUS = ["CANCELLED", "RETURNED", "REFUNDED"];

export const dashboardRoutes = new Hono<AppEnv>()
  .get("/stats", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 6);
    startOfWeek.setHours(0, 0, 0, 0);

    const revenueCond = (from?: Date, to?: Date) => {
      const conds = [
        inArray(orders.paymentStatus, ACTIVE_REVENUE),
        sql`${orders.status} NOT IN (${NON_REVENUE_STATUS.map((s) => `'${s}'`).join(",")})`,
      ];
      if (from) conds.push(gte(orders.placedAt, from));
      if (to) conds.push(lte(orders.placedAt, to));
      return and(...conds);
    };

    const [totals, today, week, month, orderCounts, lowStock, customerCount, recent] = await Promise.all([
      db
        .select({ revenue: sql<number>`COALESCE(SUM(${orders.totalPaisa}), 0)`, orders: sql<number>`COUNT(*)` })
        .from(orders)
        .where(revenueCond()),
      db.select({ revenue: sql<number>`COALESCE(SUM(${orders.totalPaisa}), 0)`, orders: sql<number>`COUNT(*)` }).from(orders).where(revenueCond(startOfDay)),
      db.select({ revenue: sql<number>`COALESCE(SUM(${orders.totalPaisa}), 0)`, orders: sql<number>`COUNT(*)` }).from(orders).where(revenueCond(startOfWeek)),
      db.select({ revenue: sql<number>`COALESCE(SUM(${orders.totalPaisa}), 0)`, orders: sql<number>`COUNT(*)` }).from(orders).where(revenueCond(startOfMonth)),
      db
        .select({ status: orders.status, n: sql<number>`COUNT(*)` })
        .from(orders)
        .groupBy(orders.status),
      db.select({ n: sql<number>`COUNT(*)` }).from(products).where(sql`${products.stock} <= ${products.lowStockThreshold} AND ${products.stock} > 0`),
      db.select({ n: sql<number>`COUNT(*)` }).from(users).where(eq(users.role, "CUSTOMER")),
      db.select().from(orders).orderBy(desc(orders.placedAt)).limit(10),
    ]);

    return ok(c, {
      revenue: totals[0]?.revenue ?? 0,
      orders: totals[0]?.orders ?? 0,
      today: { revenue: today[0]?.revenue ?? 0, orders: today[0]?.orders ?? 0 },
      week: { revenue: week[0]?.revenue ?? 0, orders: week[0]?.orders ?? 0 },
      month: { revenue: month[0]?.revenue ?? 0, orders: month[0]?.orders ?? 0 },
      statusBreakdown: orderCounts,
      lowStock: lowStock[0]?.n ?? 0,
      customers: customerCount[0]?.n ?? 0,
      recent: recent.map(orderSummary),
    });
  })

  // Revenue over the last N days (for charts). N between 7 and 90.
  .get("/revenue-timeline", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const days = Math.min(90, Math.max(7, Number(c.req.query("days") ?? 30)));
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    const rows = await db
      .select({
        day: sql<string>`date(${orders.placedAt} / 1000, 'unixepoch', 'localtime')`,
        revenue: sql<number>`COALESCE(SUM(${orders.totalPaisa}), 0)`,
        orders: sql<number>`COUNT(*)`,
      })
      .from(orders)
      .where(
        and(
          gte(orders.placedAt, start),
          inArray(orders.paymentStatus, ACTIVE_REVENUE),
          sql`${orders.status} NOT IN (${NON_REVENUE_STATUS.map((s) => `'${s}'`).join(",")})`,
        ),
      )
      .groupBy(sql`date(${orders.placedAt} / 1000, 'unixepoch', 'localtime')`)
      .orderBy(sql`day ASC`);

    // Fill missing days with zeros so charts render cleanly
    const map = new Map(rows.map((r) => [r.day, r]));
    const out: { day: string; revenue: number; orders: number }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      out.push({ day: key, revenue: map.get(key)?.revenue ?? 0, orders: map.get(key)?.orders ?? 0 });
    }
    return ok(c, out);
  })

  // Top selling products by units/quantity (revenue uses item total)
  .get("/top-products", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const limit = Math.min(20, Number(c.req.query("limit") ?? 10));
    const from = new URL(c.req.url).searchParams.get("from");
    const conds = [
      from ? gte(orders.placedAt, new Date(Number(from))) : undefined,
      sql`${orders.status} NOT IN (${NON_REVENUE_STATUS.map((s) => `'${s}'`).join(",")})`,
    ].filter(Boolean);

    const rows = await db
      .select({
        productId: orderItems.productId,
        name: orderItems.productName,
        units: sql<number>`SUM(${orderItems.quantity})`,
        revenue: sql<number>`SUM(${orderItems.totalPricePaisa})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(conds.length ? and(...(conds as any)) : undefined)
      .groupBy(orderItems.productId, orderItems.productName)
      .orderBy(sql`units DESC`)
      .limit(limit);

    return ok(c, rows);
  })

  // Low stock / out of stock list for the admin overview
  .get("/stock-alerts", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const rows = await db
      .select({
        id: products.id,
        slug: products.slug,
        name: products.name,
        sku: products.sku,
        stock: products.stock,
        lowStockThreshold: products.lowStockThreshold,
        image: products.coverImage,
      })
      .from(products)
      .where(sql`${products.stock} <= ${products.lowStockThreshold}`)
      .orderBy(sql`${products.stock} ASC`)
      .limit(50);
    return ok(c, rows);
  });
