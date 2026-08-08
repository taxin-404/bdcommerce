import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, gte, sql } from "drizzle-orm";
import { cartItems, carts, coupons, orderItems, orderStatusLogs, orders, products, productVariants, shippingZones, transactions } from "@bd/db";
import { checkoutSchema, couponApplySchema, shippingEstimateSchema, validateCoupon, cartSubtotal, type CartLine } from "@bd/core";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { ok, HttpError } from "../lib/http";
import { loadCart, type CartLineOut } from "./cart";
import { authenticate } from "../middleware/auth";
import { createNotification } from "../lib/notifications";

function couponLike(row: typeof coupons.$inferSelect) {
  return {
    id: row.id,
    code: row.code,
    type: row.type as any,
    value: row.value,
    minSubtotalPaisa: row.minSubtotalPaisa,
    maxDiscountPaisa: row.maxDiscountPaisa,
    usageLimit: row.usageLimit,
    usedCount: row.usedCount,
    perUserLimit: row.perUserLimit,
    appliesTo: row.appliesTo as any,
    appliesToId: row.appliesToId,
    buyX: row.buyX,
    getY: row.getY,
    startsAt: row.startsAt,
    expiresAt: row.expiresAt,
    isActive: row.isActive,
  };
}

function toCartLines(lines: CartLineOut[], categoryId?: string | null): CartLine[] {
  return lines.map((l) => ({
    productId: l.productId,
    variantId: l.variantId,
    name: l.name,
    sku: l.sku,
    image: l.image,
    quantity: l.quantity,
    unitPricePaisa: l.unitPricePaisa,
    compareAtPaisa: l.compareAtPaisa,
    categoryId: categoryId ?? l.categoryId,
    stock: l.stock,
  }));
}

// Most-specific zone wins: upazila > district > dhaka/outside > countrywide.
async function bestZone(
  db: ReturnType<typeof getDb>,
  district: string,
  upazila?: string,
): Promise<typeof shippingZones.$inferSelect | undefined> {
  const zones = await db.select().from(shippingZones).where(eq(shippingZones.isActive, true));
  const score = (z: (typeof shippingZones.$inferSelect)) => {
    if (z.type === "UPAZILA" && z.district === district && z.upazila === upazila) return 5;
    if (z.type === "UPAZILA" && z.district === district) return 4;
    if (z.type === "DISTRICT" && z.district === district) return 3;
    if (z.type === "DHAKA" && district === "Dhaka") return 2;
    if (z.type === "OUTSIDE_DHAKA" && district !== "Dhaka") return 2;
    if (z.type === "COUNTRYWIDE") return 1;
    return 0;
  };
  let best: (typeof shippingZones.$inferSelect) | undefined;
  let bestScore = 0;
  for (const z of zones) {
    const s = score(z);
    if (s > bestScore) {
      best = z;
      bestScore = s;
    }
  }
  return best;
}

function zoneCharge(zone: typeof shippingZones.$inferSelect, subtotalPaisa: number) {
  if (zone.freeOverPaisa != null && subtotalPaisa >= zone.freeOverPaisa) return 0;
  return zone.chargePaisa;
}

function orderNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `BD-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export const checkoutRoutes = new Hono<AppEnv>()
  .get("/zones", async (c) => {
    const db = getDb(c.env);
    const zones = await db.select().from(shippingZones).where(eq(shippingZones.isActive, true)).orderBy(sql`${shippingZones.type}`);
    return ok(c, zones.map((z) => ({ id: z.id, name: z.name, type: z.type, district: z.district, upazila: z.upazila, chargePaisa: z.chargePaisa, freeOverPaisa: z.freeOverPaisa })));
  })

  .post("/estimate", zValidator("json", shippingEstimateSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const zone = await bestZone(db, body.district, body.upazila);
    if (!zone) return ok(c, { available: false, chargePaisa: 0, method: null });
    return ok(c, { available: true, chargePaisa: zoneCharge(zone, body.subtotalPaisa), freeOverPaisa: zone.freeOverPaisa, method: zone.name });
  })

  .post("/coupon/validate", zValidator("json", couponApplySchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const coupon = (
      await db
        .select()
        .from(coupons)
        .where(and(eq(coupons.code, body.code), eq(coupons.isActive, true)))
        .limit(1)
    )[0];
    if (!coupon) throw new HttpError(404, "Coupon not found or inactive");

    const lines: CartLine[] = (body.lines ?? []).map((l) => ({
      productId: l.productId,
      variantId: l.variantId ?? null,
      name: l.name ?? "item",
      quantity: l.quantity,
      unitPricePaisa: l.unitPricePaisa,
      categoryId: l.categoryId ?? null,
    }));

    const result = validateCoupon(couponLike(coupon), lines, { subtotalPaisa: body.subtotalPaisa });
    if (!result.ok) throw new HttpError(400, result.error || "Coupon is not valid");
    return ok(c, {
      valid: true,
      discountPaisa: result.discountPaisa,
      freeShipping: result.freeShipping,
      coupon: { id: coupon.id, code: coupon.code, type: coupon.type },
    });
  })

  .post("/", zValidator("json", checkoutSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);

    const key = await (async () => {
      const userId = c.get("userId");
      if (userId) {
        const cart = (await db.select().from(carts).where(eq(carts.userId, userId)).limit(1))[0];
        if (cart) return `user:${userId}`;
      }
      const token = c.req.header("x-cart-token") || "anon";
      return userId ? `user:${userId}` : `session:${token}`;
    })();

    const { cart, lines } = await loadCart(c, key);
    if (lines.length === 0) throw new HttpError(400, "Cart is empty");

    // Stock re-check before placing the order
    for (const line of lines) {
      if (line.stock < line.quantity) throw new HttpError(409, `"${line.name}" only has ${line.stock} in stock`);
    }

    const cartLines = toCartLines(lines);
    const subtotal = cartSubtotal(cartLines);

    const zone = await bestZone(db, body.shippingAddress.district, body.shippingAddress.upazila);
    const shippingCharge = zone ? zoneCharge(zone, subtotal) : 0;
    const shippingMethod = zone?.name ?? null;

    let discount = 0;
    let freeShipping = false;
    let couponRow: typeof coupons.$inferSelect | undefined;
    if (body.couponCode) {
      couponRow = (
        await db
          .select()
          .from(coupons)
          .where(and(eq(coupons.code, body.couponCode), eq(coupons.isActive, true)))
          .limit(1)
      )[0];
      if (!couponRow) throw new HttpError(400, "Invalid coupon");
      const result = validateCoupon(couponLike(couponRow), cartLines);
      if (!result.ok) throw new HttpError(400, result.error || "Invalid coupon");
      discount = result.discountPaisa;
      freeShipping = result.freeShipping;
    }

    const shipping = freeShipping ? 0 : shippingCharge;
    discount = Math.min(discount, subtotal);
    const total = Math.max(0, subtotal - discount + shipping);

    const payload = await authenticate(c);
    const address = { ...body.shippingAddress } as unknown as Record<string, unknown>;
    const order = (
      await db
        .insert(orders)
        .values({
          orderNumber: orderNumber(),
          userId: payload?.sub ?? null,
          email: body.email,
          phone: body.phone,
          name: body.name || `${body.shippingAddress.firstName} ${body.shippingAddress.lastName ?? ""}`.trim(),
          status: "PENDING",
          paymentStatus: body.paymentMethod === "COD" ? "COD" : "PENDING",
          paymentMethod: body.paymentMethod,
          subtotalPaisa: subtotal,
          discountPaisa: discount,
          shippingPaisa: shipping,
          taxPaisa: 0,
          totalPaisa: total,
          couponCode: body.couponCode ?? null,
          couponId: couponRow?.id ?? null,
          shippingAddress: address,
          itemsSnapshot: cartLines as unknown[],
          notes: body.notes ?? null,
          shippingMethod,
          txnId: null,
          transactionId: null,
        })
        .returning()
    )[0]!;

    await db.insert(orderItems).values(
      cartLines.map((l) => ({
        orderId: order.id,
        productId: l.productId,
        variantId: l.variantId,
        productName: l.name,
        sku: l.sku ?? null,
        productImage: l.image,
        quantity: l.quantity,
        unitPricePaisa: l.unitPricePaisa,
        totalPricePaisa: l.unitPricePaisa * l.quantity,
      })),
    );
    await db.insert(orderStatusLogs).values({ orderId: order.id, status: "PENDING", note: "Order placed" });

    // Decrement stock (conditional so we never go negative)
    for (const line of cartLines) {
      if (line.variantId) {
        await db
          .update(productVariants)
          .set({ stock: sql`${productVariants.stock} - ${line.quantity}` })
          .where(and(eq(productVariants.id, line.variantId), gte(productVariants.stock, line.quantity)));
      }
      await db
        .update(products)
        .set({ stock: sql`${products.stock} - ${line.quantity}` })
        .where(and(eq(products.id, line.productId), gte(products.stock, line.quantity)));
    }

    // Manual wallets need a transaction record the admin verifies later
    if (body.paymentMethod !== "COD") {
      await db.insert(transactions).values({
        orderId: order.id,
        method: body.paymentMethod,
        amountPaisa: total,
        status: "PENDING",
      });
    }

    if (couponRow) {
      await db.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.id, couponRow.id));
    }

    await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));

    await createNotification(db, c.env, {
      type: "ORDER",
      title: `New order ${order.orderNumber}`,
      body: `${body.name || body.email} · ${body.paymentMethod} · ৳${(total / 100).toLocaleString("en-BD")}`,
      link: `/admin/orders/${order.id}`,
    });

    return ok(c, {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        totalPaisa: total,
        status: order.status,
        paymentStatus: order.paymentStatus,
      },
    }, undefined, 201);
  });
