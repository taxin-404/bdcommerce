import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { orderItems, orderStatusLogs, orders, paymentLogs, products, productVariants, transactions } from "@bd/db";
import { orderNumberParamSchema, txnVerifySchema } from "@bd/core";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { ok, HttpError } from "../lib/http";
import { paginated, paginationFromQuery } from "../lib/query";
import { requireCustomer, authenticate } from "../middleware/auth";
import { createNotification } from "../lib/notifications";

const z2 = z.object({
  orderNumber: z.string().min(4).max(40).optional(),
  email: z.string().email().optional(),
});

const orderSummary = (o: typeof orders.$inferSelect) => ({
  id: o.id,
  orderNumber: o.orderNumber,
  status: o.status,
  paymentStatus: o.paymentStatus,
  paymentMethod: o.paymentMethod,
  subtotalPaisa: o.subtotalPaisa,
  discountPaisa: o.discountPaisa,
  shippingPaisa: o.shippingPaisa,
  taxPaisa: o.taxPaisa,
  totalPaisa: o.totalPaisa,
  placedAt: o.placedAt.getTime(),
  itemCount: ((o.itemsSnapshot as unknown[] | null) ?? []).length,
});

export { orderSummary };

export const orderRoutes = new Hono<AppEnv>()
  // List own orders (customer)
  .get("/", requireCustomer, async (c) => {
    const db = getDb(c.env);
    const { page, pageSize } = paginationFromQuery(new URL(c.req.url).searchParams, 10);
    const [totalRows, rows] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(orders).where(eq(orders.userId, c.get("userId")!)),
      db
        .select()
        .from(orders)
        .where(eq(orders.userId, c.get("userId")!))
        .orderBy(desc(orders.placedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);
    return ok(c, paginated(rows.map(orderSummary), page, pageSize, totalRows[0]?.count ?? 0));
  })

  // Full order detail (owner via auth, or guest via order number + email header)
  .get("/:orderNumber", zValidator("param", orderNumberParamSchema), async (c) => {
    const db = getDb(c.env);
    const order = (await db.select().from(orders).where(eq(orders.orderNumber, c.req.param("orderNumber"))).limit(1))[0];
    if (!order) throw new HttpError(404, "Order not found");

    const payload = await authenticate(c);
    const guestEmail = c.req.header("x-order-email")?.toLowerCase();
    const owns = payload ? payload.sub === order.userId : false;
    const matchesEmail = !!guestEmail && order.email.toLowerCase() === guestEmail;
    if (!owns && !matchesEmail) throw new HttpError(403, "Not your order");

    const [items, logs, txns, payments] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
      db.select().from(orderStatusLogs).where(eq(orderStatusLogs.orderId, order.id)).orderBy(desc(orderStatusLogs.createdAt)),
      db.select().from(transactions).where(eq(transactions.orderId, order.id)).orderBy(desc(transactions.createdAt)),
      db.select().from(paymentLogs).where(eq(paymentLogs.orderId, order.id)).orderBy(desc(paymentLogs.createdAt)),
    ]);

    return ok(c, {
      ...orderSummary(order),
      email: order.email,
      phone: order.phone,
      name: order.name,
      shippingAddress: order.shippingAddress ?? null,
      shippingMethod: order.shippingMethod,
      courier: order.courier,
      trackingNumber: order.trackingNumber,
      notes: order.notes,
      couponCode: order.couponCode,
      items: items.map((i) => ({
        id: i.id,
        productId: i.productId,
        variantId: i.variantId,
        name: i.productName,
        sku: i.sku,
        options: i.options ?? {},
        image: i.productImage,
        quantity: i.quantity,
        unitPricePaisa: i.unitPricePaisa,
        totalPricePaisa: i.totalPricePaisa,
      })),
      statusLogs: logs.map((l) => ({ status: l.status, note: l.note, createdAt: l.createdAt.getTime() })),
      transactions: txns.map((t) => ({ id: t.id, method: t.method, amountPaisa: t.amountPaisa, txnId: t.txnId, status: t.status, createdAt: t.createdAt.getTime() })),
      paymentLogs: payments.map((p) => ({ id: p.id, method: p.method, direction: p.direction, amountPaisa: p.amountPaisa, txnId: p.txnId, status: p.status, createdAt: p.createdAt.getTime() })),
    });
  })

  // Guest track-by-number without auth (public)
  .post("/track", zValidator("json", z2), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const order = body.orderNumber
      ? (await db.select().from(orders).where(eq(orders.orderNumber, body.orderNumber)).limit(1))[0]
      : undefined;
    if (!order) throw new HttpError(404, "Order not found");
    return ok(c, {
      ...orderSummary(order),
      email: order.email,
      statusLogs: (await db.select().from(orderStatusLogs).where(eq(orderStatusLogs.orderId, order.id)).orderBy(desc(orderStatusLogs.createdAt))).map((l) => ({
        status: l.status,
        note: l.note,
        createdAt: l.createdAt.getTime(),
      })),
    });
  })

  // Customer cancels a pending order (stock is restored)
  .post("/:orderNumber/cancel", zValidator("param", orderNumberParamSchema), requireCustomer, async (c) => {
    const db = getDb(c.env);
    const order = (await db.select().from(orders).where(eq(orders.orderNumber, c.req.param("orderNumber"))).limit(1))[0];
    if (!order) throw new HttpError(404, "Order not found");
    if (order.userId !== c.get("userId")) throw new HttpError(403, "Not your order");
    if (order.status !== "PENDING") throw new HttpError(400, "Only pending orders can be cancelled");
    if (order.paymentStatus === "PAID") throw new HttpError(400, "Paid orders cannot be cancelled online");

    await db.update(orders).set({ status: "CANCELLED", cancelledAt: new Date() }).where(eq(orders.id, order.id));
    await db.insert(orderStatusLogs).values({ orderId: order.id, status: "CANCELLED", note: "Cancelled by customer" });

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    for (const item of items) {
      if (item.variantId) {
        await db.update(productVariants).set({ stock: sql`${productVariants.stock} + ${item.quantity}` }).where(eq(productVariants.id, item.variantId));
      }
      if (item.productId) {
        await db.update(products).set({ stock: sql`${products.stock} + ${item.quantity}` }).where(eq(products.id, item.productId));
      }
    }

    await createNotification(db, c.env, {
      type: "ORDER",
      title: `Order ${order.orderNumber} cancelled`,
      body: "Cancelled by customer — stock restored",
      link: `/admin/orders/${order.id}`,
    });
    return ok(c, { cancelled: true });
  })

  // Customer submits payment txn id for manual wallet methods
  .post("/:orderNumber/payment", zValidator("param", orderNumberParamSchema), zValidator("json", txnVerifySchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const order = (await db.select().from(orders).where(eq(orders.orderNumber, c.req.param("orderNumber"))).limit(1))[0];
    if (!order) throw new HttpError(404, "Order not found");

    const payload = await authenticate(c);
    const guestEmail = c.req.header("x-order-email")?.toLowerCase();
    const owns = payload ? payload.sub === order.userId : false;
    const matchesEmail = !!guestEmail && order.email.toLowerCase() === guestEmail;
    if (!owns && !matchesEmail) throw new HttpError(403, "Not your order");

    if (order.paymentMethod === "COD") throw new HttpError(400, "Cash on Delivery needs no txn id");
    if (order.paymentStatus === "PAID") throw new HttpError(400, "Order already paid");

    await db.update(orders).set({ txnId: body.txnId }).where(eq(orders.id, order.id));
    const existing = (await db.select().from(transactions).where(and(eq(transactions.orderId, order.id), isNull(transactions.verifiedAt))).limit(1))[0];
    if (existing) {
      await db.update(transactions).set({ txnId: body.txnId, method: body.method ?? existing.method, status: "PENDING" }).where(eq(transactions.id, existing.id));
    } else {
      await db.insert(transactions).values({
        orderId: order.id,
        method: body.method ?? order.paymentMethod,
        amountPaisa: body.amountPaisa ?? order.totalPaisa,
        txnId: body.txnId,
        status: "PENDING",
      });
    }
    await db.insert(paymentLogs).values({
      orderId: order.id,
      method: body.method ?? order.paymentMethod,
      direction: "VERIFY",
      amountPaisa: body.amountPaisa ?? order.totalPaisa,
      txnId: body.txnId,
      status: "PENDING",
      request: { source: "customer" },
    });
    await createNotification(db, c.env, {
      type: "PAYMENT",
      title: `Payment txn submitted for ${order.orderNumber}`,
      body: `Txn ${body.txnId} · ${body.method ?? order.paymentMethod}`,
      link: `/admin/orders/${order.id}`,
    });
    return ok(c, { submitted: true });
  });
