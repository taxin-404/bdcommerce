import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gte, lte, or, like, sql } from "drizzle-orm";
import { orderItems, orders, orderStatusLogs, paymentLogs, products, productVariants, transactions } from "@bd/db";
import { orderStatusSchema, idParamSchema } from "@bd/core";
import { ORDER_FLOW } from "@bd/core";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { ok, HttpError } from "../lib/http";
import { paginated, paginationFromQuery, likeTerm } from "../lib/query";
import { requireAdmin } from "../middleware/auth";
import { createNotification } from "../lib/notifications";

export const adminOrderRoutes = new Hono<AppEnv>()
  .get("/", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const q = new URL(c.req.url);
    const { page, pageSize } = paginationFromQuery(q.searchParams, 25);
    const status = q.searchParams.get("status");
    const paymentStatus = q.searchParams.get("paymentStatus");
    const paymentMethod = q.searchParams.get("paymentMethod");
    const search = q.searchParams.get("search");
    const from = q.searchParams.get("from");
    const to = q.searchParams.get("to");

    const conditions = [
      status ? eq(orders.status, status) : undefined,
      paymentStatus ? eq(orders.paymentStatus, paymentStatus) : undefined,
      paymentMethod ? eq(orders.paymentMethod, paymentMethod) : undefined,
      from ? gte(orders.placedAt, new Date(Number(from))) : undefined,
      to ? lte(orders.placedAt, new Date(Number(to))) : undefined,
      search
        ? or(like(orders.orderNumber, likeTerm(search)), like(orders.email, likeTerm(search)), like(orders.name ?? "", likeTerm(search)), like(orders.phone ?? "", likeTerm(search)))
        : undefined,
    ].filter(Boolean);

    const [totalRows, rows] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(orders).where(conditions.length ? and(...(conditions as any)) : undefined),
      db
        .select()
        .from(orders)
        .where(conditions.length ? and(...(conditions as any)) : undefined)
        .orderBy(desc(orders.placedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);

    const summaries = rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      email: o.email,
      phone: o.phone,
      name: o.name,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      totalPaisa: o.totalPaisa,
      itemCount: ((o.itemsSnapshot as unknown[] | null) ?? []).length,
      placedAt: o.placedAt.getTime(),
      txnId: o.txnId,
    }));

    return ok(c, paginated(summaries, page, pageSize, totalRows[0]?.count ?? 0));
  })

  .get("/:id", requireAdmin, zValidator("param", idParamSchema), async (c) => {
    const db = getDb(c.env);
    const order = (await db.select().from(orders).where(eq(orders.id, c.req.param("id"))).limit(1))[0];
    if (!order) throw new HttpError(404, "Order not found");

    const [items, logs, txns, payments] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
      db.select().from(orderStatusLogs).where(eq(orderStatusLogs.orderId, order.id)).orderBy(desc(orderStatusLogs.createdAt)),
      db.select().from(transactions).where(eq(transactions.orderId, order.id)).orderBy(desc(transactions.createdAt)),
      db.select().from(paymentLogs).where(eq(paymentLogs.orderId, order.id)).orderBy(desc(paymentLogs.createdAt)),
    ]);

    return ok(c, {
      ...order,
      placedAt: order.placedAt.getTime(),
      paidAt: order.paidAt?.getTime() ?? null,
      shippedAt: order.shippedAt?.getTime() ?? null,
      deliveredAt: order.deliveredAt?.getTime() ?? null,
      cancelledAt: order.cancelledAt?.getTime() ?? null,
      items,
      statusLogs: logs.map((l) => ({ ...l, createdAt: l.createdAt.getTime() })),
      transactions: txns.map((t) => ({ ...t, createdAt: t.createdAt.getTime(), verifiedAt: t.verifiedAt?.getTime() ?? null })),
      paymentLogs: payments.map((p) => ({ ...p, createdAt: p.createdAt.getTime() })),
      allowedTransitions: ORDER_FLOW[order.status as keyof typeof ORDER_FLOW] ?? [],
    });
  })

  // Move an order to the next status (validates the transition).
  .patch("/:id/status", requireAdmin, zValidator("param", idParamSchema), zValidator("json", orderStatusSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const order = (await db.select().from(orders).where(eq(orders.id, c.req.param("id"))).limit(1))[0];
    if (!order) throw new HttpError(404, "Order not found");

    const allowed = (ORDER_FLOW[order.status as keyof typeof ORDER_FLOW] ?? []) as string[];
    if (!allowed.includes(body.status)) {
      throw new HttpError(400, `Cannot move order from ${order.status} to ${body.status}`);
    }

    const updates: Record<string, unknown> = {
      status: body.status,
      updatedAt: new Date(),
    };
    if (body.status === "SHIPPED") updates.shippedAt = new Date();
    if (body.status === "DELIVERED") updates.deliveredAt = new Date();
    if (body.status === "CANCELLED" || body.status === "REFUNDED") updates.cancelledAt = new Date();
    if (body.trackingNumber) updates.trackingNumber = body.trackingNumber;
    if (body.courier) updates.courier = body.courier;

    await db.update(orders).set(updates).where(eq(orders.id, order.id));
    await db.insert(orderStatusLogs).values({
      orderId: order.id,
      status: body.status,
      note: body.note ?? null,
      createdBy: c.get("userId") ?? null,
    });

    // Restock on cancellation/return/refund
    if (["CANCELLED", "RETURNED", "REFUNDED"].includes(body.status)) {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      for (const item of items) {
        if (item.variantId) {
          await db.update(productVariants).set({ stock: sql`${productVariants.stock} + ${item.quantity}` }).where(eq(productVariants.id, item.variantId));
        }
        if (item.productId) {
          await db.update(products).set({ stock: sql`${products.stock} + ${item.quantity}` }).where(eq(products.id, item.productId));
        }
      }
    }

    if (body.status === "DELIVERED") {
      await db.update(orders).set({ paidAt: new Date() }).where(eq(orders.id, order.id));
    }

    await createNotification(db, c.env, {
      type: "ORDER",
      title: `Order ${order.orderNumber} → ${body.status}`,
      body: body.note ?? undefined,
      link: `/admin/orders/${order.id}`,
    });

    return ok(c, { id: order.id, status: body.status });
  })

  // Verify a manual-payment transaction (bKash/Nagad/Rocket/Upay/bank).
  .post("/:id/verify-payment", requireAdmin, zValidator("param", idParamSchema), async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { txnId?: string; status?: "PAID" | "FAILED"; amountPaisa?: number };
    const db = getDb(c.env);
    const order = (await db.select().from(orders).where(eq(orders.id, c.req.param("id"))).limit(1))[0];
    if (!order) throw new HttpError(404, "Order not found");
    if (order.paymentMethod === "COD") throw new HttpError(400, "COD orders have no payment to verify");

    const status = body.status === "FAILED" ? "FAILED" : "PAID";
    const txnId = body.txnId ?? order.txnId;
    const verifiedAt = new Date();

    await db.update(orders).set({ paymentStatus: status, txnId: txnId ?? null, paidAt: status === "PAID" ? verifiedAt : order.paidAt }).where(eq(orders.id, order.id));
    await db.update(transactions).set({ status: status === "PAID" ? "VERIFIED" : "FAILED", verifiedAt, verifiedBy: c.get("userId") ?? null, response: { adminVerified: true } }).where(eq(transactions.orderId, order.id));
    await db.insert(paymentLogs).values({
      orderId: order.id,
      method: order.paymentMethod,
      direction: "VERIFY",
      amountPaisa: body.amountPaisa ?? order.totalPaisa,
      txnId: txnId ?? null,
      status,
      request: { by: c.get("userId") ?? null },
      response: { adminVerified: true },
    });

    await createNotification(db, c.env, {
      type: "PAYMENT",
      title: `Payment ${status} for ${order.orderNumber}`,
      body: txnId ? `Txn ${txnId}` : undefined,
      link: `/admin/orders/${order.id}`,
    });
    return ok(c, { paymentStatus: status });
  })

  // Manually record a refund.
  .post("/:id/refund", requireAdmin, zValidator("param", idParamSchema), async (c) => {
    const db = getDb(c.env);
    const order = (await db.select().from(orders).where(eq(orders.id, c.req.param("id"))).limit(1))[0];
    if (!order) throw new HttpError(404, "Order not found");
    if (order.paymentStatus !== "PAID" && order.paymentStatus !== "COD") throw new HttpError(400, "Order is not paid");

    await db.update(orders).set({ paymentStatus: "REFUNDED", updatedAt: new Date() }).where(eq(orders.id, order.id));
    await db.update(transactions).set({ status: "REFUNDED", verifiedBy: c.get("userId") ?? null, verifiedAt: new Date() }).where(eq(transactions.orderId, order.id));
    await db.insert(paymentLogs).values({
      orderId: order.id,
      method: order.paymentMethod,
      direction: "VERIFY",
      amountPaisa: order.totalPaisa,
      status: "REFUNDED",
      request: { action: "refund", by: c.get("userId") ?? null },
    });
    await createNotification(db, c.env, {
      type: "PAYMENT",
      title: `Refunded ${order.orderNumber}`,
      body: `৳${(order.totalPaisa / 100).toLocaleString("en-BD")}`,
      link: `/admin/orders/${order.id}`,
    });
    return ok(c, { refunded: true });
  });
