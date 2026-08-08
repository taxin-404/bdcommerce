import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { cartItems, carts, productVariants, products } from "@bd/db";
import { cartItemInputSchema, cartSubtotal } from "@bd/core";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { ok, HttpError } from "../lib/http";
import { mediaUrl } from "../lib/media";

type CartCtx = import("hono").Context<AppEnv>;

// Resolve the cart key: authenticated users own a per-user cart; guests use a
// client-provided token so the cart survives page reloads.
async function getOrCreateCartKey(c: CartCtx): Promise<string> {
  const userId = c.get("userId");
  const token = c.req.header("x-cart-token") || "anon";
  if (userId) {
    if (token !== "anon") await mergeGuestCart(c, userId, token);
    return `user:${userId}`;
  }
  return `session:${token}`;
}

async function mergeGuestCart(c: CartCtx, userId: string, token: string) {
  const db = getDb(c.env);
  const guest = (await db.select().from(carts).where(eq(carts.sessionId, `session:${token}`)).limit(1))[0];
  if (!guest) return;
  const userCart = (await db.select().from(carts).where(eq(carts.userId, userId)).limit(1))[0];
  if (!userCart) {
    await db.update(carts).set({ userId }).where(eq(carts.id, guest.id));
    return;
  }
  const guestItems = await db.select().from(cartItems).where(eq(cartItems.cartId, guest.id));
  for (const item of guestItems) {
    const existing = await db
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.cartId, userCart.id), eq(cartItems.productId, item.productId), item.variantId ? eq(cartItems.variantId, item.variantId) : isNull(cartItems.variantId)))
      .limit(1);
    if (existing[0]) {
      await db.update(cartItems).set({ quantity: existing[0].quantity + item.quantity }).where(eq(cartItems.id, existing[0].id));
    } else {
      await db.insert(cartItems).values({
        cartId: userCart.id,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
      });
    }
  }
  await db.delete(cartItems).where(eq(cartItems.cartId, guest.id));
  await db.delete(carts).where(eq(carts.id, guest.id));
}

export async function loadCart(c: CartCtx, cartKey: string) {
  const db = getDb(c.env);
  let cart = (
    await db
      .select()
      .from(carts)
      .where(cartKey.startsWith("user:") ? eq(carts.userId, cartKey.slice(5)) : eq(carts.sessionId, cartKey))
      .limit(1)
  )[0];
  if (!cart) {
    cart = (
      await db
        .insert(carts)
        .values(cartKey.startsWith("user:") ? { userId: cartKey.slice(5) } : { sessionId: cartKey })
        .returning()
    )[0]!;
  }

  const items = await db.select().from(cartItems).where(eq(cartItems.cartId, cart.id)).orderBy(desc(cartItems.createdAt));
  const productIds = [...new Set(items.map((i) => i.productId))];
  const variantIds = [...new Set(items.map((i) => i.variantId).filter(Boolean) as string[])];

  const [prodRows, varRows] = await Promise.all([
    productIds.length ? db.select().from(products).where(inArray(products.id, productIds)) : Promise.resolve([]),
    variantIds.length ? db.select().from(productVariants).where(inArray(productVariants.id, variantIds)) : Promise.resolve([]),
  ]);
  const prodMap = new Map(prodRows.map((p) => [p.id, p]));
  const varMap = new Map(varRows.map((v) => [v.id, v]));
  const base = new URL(c.req.url).origin;

  const lines = items
    .map((item) => {
      const product = prodMap.get(item.productId);
      if (!product || !product.isActive) return null;
      const variant = item.variantId ? varMap.get(item.variantId) : undefined;
      const unitPrice = variant?.pricePaisa ?? product.pricePaisa;
      return {
        id: item.id,
        productId: product.id,
        variantId: item.variantId,
        quantity: item.quantity,
        name: product.name,
        slug: product.slug,
        sku: variant?.sku ?? product.sku,
        categoryId: product.categoryId,
        unitPricePaisa: unitPrice,
        compareAtPaisa: product.compareAtPaisa,
        stock: variant?.stock ?? product.stock,
        image: mediaUrl(c.env, base, variant?.image ?? product.coverImage ?? product.images?.[0]?.src),
        variant: variant ? { id: variant.id, name: variant.name, options: variant.options ?? {} } : null,
      };
    })
    .filter(Boolean) as CartLineOut[];

  return { cart, lines, subtotalPaisa: cartSubtotal(lines) };
}

export interface CartLineOut {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  name: string;
  slug: string;
  sku: string | null;
  categoryId: string | null;
  unitPricePaisa: number;
  compareAtPaisa: number | null;
  stock: number;
  image: string | null;
  variant: { id: string; name: string; options: Record<string, string> } | null;
}

const qtySchema = z.object({ quantity: z.coerce.number().int().min(1).max(99) });

export const cartRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const key = await getOrCreateCartKey(c);
    const { lines, subtotalPaisa } = await loadCart(c, key);
    return ok(c, { lines, subtotalPaisa, count: lines.reduce((s, l) => s + l.quantity, 0) });
  })

  .post("/items", zValidator("json", cartItemInputSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const key = await getOrCreateCartKey(c);
    const { cart } = await loadCart(c, key);

    const product = (await db.select().from(products).where(eq(products.id, body.productId)).limit(1))[0];
    if (!product || !product.isActive) throw new HttpError(404, "Product not found");

    let stock = product.stock;
    if (body.variantId) {
      const variant = (await db.select().from(productVariants).where(eq(productVariants.id, body.variantId)).limit(1))[0];
      if (!variant || variant.productId !== product.id || !variant.isActive) throw new HttpError(404, "Variant not found");
      stock = variant.stock;
    }
    if (body.quantity > stock) throw new HttpError(409, "Requested quantity exceeds available stock");

    const existing = await db
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.productId, body.productId), body.variantId ? eq(cartItems.variantId, body.variantId) : isNull(cartItems.variantId)))
      .limit(1);
    if (existing[0]) {
      const qty = existing[0].quantity + body.quantity;
      if (qty > stock) throw new HttpError(409, "Requested quantity exceeds available stock");
      await db.update(cartItems).set({ quantity: qty }).where(eq(cartItems.id, existing[0].id));
    } else {
      await db.insert(cartItems).values({
        cartId: cart.id,
        productId: body.productId,
        variantId: body.variantId ?? null,
        quantity: body.quantity,
      });
    }

    const { lines, subtotalPaisa } = await loadCart(c, key);
    return ok(c, { lines, subtotalPaisa, count: lines.reduce((s, l) => s + l.quantity, 0) }, undefined, 201);
  })

  .patch("/items/:id", zValidator("json", qtySchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const key = await getOrCreateCartKey(c);
    const { cart } = await loadCart(c, key);
    const item = (
      await db.select().from(cartItems).where(and(eq(cartItems.id, c.req.param("id")), eq(cartItems.cartId, cart.id))).limit(1)
    )[0];
    if (!item) throw new HttpError(404, "Cart item not found");

    if (body.quantity < 1) {
      await db.delete(cartItems).where(eq(cartItems.id, item.id));
    } else {
      const product = (await db.select().from(products).where(eq(products.id, item.productId)).limit(1))[0];
      const stock = item.variantId
        ? (await db.select().from(productVariants).where(eq(productVariants.id, item.variantId)).limit(1))[0]?.stock ?? 0
        : product?.stock ?? 0;
      if (body.quantity > stock) throw new HttpError(409, "Requested quantity exceeds available stock");
      await db.update(cartItems).set({ quantity: body.quantity }).where(eq(cartItems.id, item.id));
    }

    const { lines, subtotalPaisa } = await loadCart(c, key);
    return ok(c, { lines, subtotalPaisa, count: lines.reduce((s, l) => s + l.quantity, 0) });
  })

  .delete("/items/:id", async (c) => {
    const db = getDb(c.env);
    const key = await getOrCreateCartKey(c);
    const { cart } = await loadCart(c, key);
    await db.delete(cartItems).where(and(eq(cartItems.id, c.req.param("id")), eq(cartItems.cartId, cart.id)));
    const { lines, subtotalPaisa } = await loadCart(c, key);
    return ok(c, { lines, subtotalPaisa, count: lines.reduce((s, l) => s + l.quantity, 0) });
  })

  .delete("/", async (c) => {
    const db = getDb(c.env);
    const key = await getOrCreateCartKey(c);
    const { cart } = await loadCart(c, key);
    await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    return ok(c, { cleared: true });
  });
