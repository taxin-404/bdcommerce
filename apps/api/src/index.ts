import { Hono } from "hono";
import { cors } from "hono/cors";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import type { BatchItem } from "drizzle-orm/batch";
import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import * as s from "@bdc/db";
import {
  BD_DIVISIONS, blockPhoneSchema, checkoutSchema, createProductSchema, slugify,
  taka, updateOrderStatusSchema,
} from "@bdc/shared";
import { getPaymentProvider } from "@bdc/payments";

type Env = { DB: D1Database; CACHE: KVNamespace; MEDIA: R2Bucket; ROOT_DOMAIN: string };
type DB = DrizzleD1Database<typeof s>;
type Store = typeof s.stores.$inferSelect;
type Vars = { db: DB; store: Store };
type Batch = [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];

const app = new Hono<{ Bindings: Env; Variables: Vars }>();
const uuid = () => crypto.randomUUID();
const sha256 = async (v: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");

app.use("*", cors());
app.onError((err, c) => { console.error(err); return c.json({ error: "internal_error" }, 500); });

app.get("/api/health", (c) => c.json({ ok: true }));
app.get("/api/meta/bd-address", (c) => {
  c.header("Cache-Control", "public, max-age=86400");
  return c.json(BD_DIVISIONS);
});

// ---- Tenant resolution: x-store-slug header > <slug>.ROOT_DOMAIN > custom domain ----
app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/health" || c.req.path.startsWith("/api/meta/")) return next();
  const db = drizzle(c.env.DB, { schema: s });
  c.set("db", db);

  const host = (c.req.header("host") ?? "").split(":")[0];
  const root = c.env.ROOT_DOMAIN;
  let slug = c.req.header("x-store-slug") ?? undefined;
  let domain: string | undefined;
  if (!slug) {
    if (host.endsWith("." + root)) slug = host.slice(0, -(root.length + 1));
    else domain = host;
  }
  const cacheKey = slug ? `store:slug:${slug}` : `store:domain:${domain}`;

  let store = await c.env.CACHE.get<Store>(cacheKey, "json");
  if (!store) {
    const [row] = await db.select().from(s.stores)
      .where(slug ? eq(s.stores.slug, slug) : eq(s.stores.customDomain, domain!)).limit(1);
    if (!row) return c.json({ error: "store_not_found" }, 404);
    store = row;
    await c.env.CACHE.put(cacheKey, JSON.stringify(row), { expirationTtl: 300 });
  }
  c.set("store", store);
  return next();
});

// ---- Admin auth: Bearer token, compared by hash against the store's admin_token_hash ----
app.use("/api/admin/*", async (c, next) => {
  const token = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || (await sha256(token)) !== c.get("store").adminTokenHash)
    return c.json({ error: "unauthorized" }, 401);
  return next();
});

/* ========================== Public: catalog ========================== */
app.get("/api/store", (c) => {
  const { id, name, slug, currency, locale, theme, settings } = c.get("store");
  const { contact, facebookPixelId, shipping } = settings;
  return c.json({ id, name, slug, currency, locale, theme, settings: { contact, facebookPixelId, shipping } });
});

app.get("/api/products", async (c) => {
  const db = c.get("db"), store = c.get("store");
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit")) || 20));
  const conds = [eq(s.products.storeId, store.id), eq(s.products.status, "active")];
  const q = c.req.query("q");
  if (q) conds.push(like(s.products.name, `%${q}%`));
  const catSlug = c.req.query("category");
  if (catSlug) {
    const [cat] = await db.select({ id: s.categories.id }).from(s.categories)
      .where(and(eq(s.categories.storeId, store.id), eq(s.categories.slug, catSlug))).limit(1);
    if (!cat) return c.json({ items: [], page, limit });
    conds.push(eq(s.products.categoryId, cat.id));
  }
  const items = await db.select().from(s.products).where(and(...conds))
    .orderBy(desc(s.products.createdAt)).limit(limit).offset((page - 1) * limit);
  c.header("Cache-Control", "public, max-age=60");
  return c.json({ items, page, limit });
});

app.get("/api/products/:slug", async (c) => {
  const db = c.get("db"), store = c.get("store");
  const [product] = await db.select().from(s.products)
    .where(and(eq(s.products.storeId, store.id), eq(s.products.slug, c.req.param("slug")), eq(s.products.status, "active"))).limit(1);
  if (!product) return c.json({ error: "not_found" }, 404);
  const variants = await db.select().from(s.productVariants)
    .where(and(eq(s.productVariants.storeId, store.id), eq(s.productVariants.productId, product.id)));
  c.header("Cache-Control", "public, max-age=60");
  return c.json({ ...product, variants });
});

app.get("/api/categories", async (c) => {
  const store = c.get("store");
  const items = await c.get("db").select().from(s.categories)
    .where(eq(s.categories.storeId, store.id)).orderBy(s.categories.sortOrder);
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ items });
});

/* ========================== Public: checkout ========================== */
app.post("/api/orders", async (c) => {
  const db = c.get("db"), store = c.get("store");
  const parsed = checkoutSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "validation", issues: parsed.error.flatten() }, 400);
  const input = parsed.data;

  const provider = getPaymentProvider(input.paymentMethod);
  if (!provider.enabled) return c.json({ error: "payment_method_unavailable" }, 501);

  // COD fraud protection
  const [blocked] = await db.select({ id: s.blockedPhones.id }).from(s.blockedPhones)
    .where(and(eq(s.blockedPhones.storeId, store.id), eq(s.blockedPhones.phone, input.customer.phone))).limit(1);
  if (blocked) return c.json({ error: "order_not_allowed", message: "Please contact the store to place this order." }, 403);

  // Prices ALWAYS come from the DB, never from the client.
  const qty = new Map<string, number>();
  for (const i of input.items) qty.set(i.variantId, (qty.get(i.variantId) ?? 0) + i.quantity);
  const rows = await db.select({ v: s.productVariants, p: s.products }).from(s.productVariants)
    .innerJoin(s.products, eq(s.productVariants.productId, s.products.id))
    .where(and(eq(s.productVariants.storeId, store.id), inArray(s.productVariants.id, [...qty.keys()]), eq(s.products.status, "active")));
  if (rows.length !== qty.size) return c.json({ error: "invalid_items" }, 400);
  for (const { v, p } of rows) {
    if (v.stock !== null && v.stock < qty.get(v.id)!)
      return c.json({ error: "out_of_stock", variantId: v.id, product: p.name }, 409);
  }

  const subtotal = rows.reduce((sum, { v }) => sum + v.price * qty.get(v.id)!, 0);
  const needsShipping = rows.some(({ p }) => p.type === "physical");
  const cfg = store.settings.shipping ?? {};
  const shippingFee = !needsShipping ? 0
    : input.shipping.district === "Dhaka" ? (cfg.insideDhaka ?? taka(60)) : (cfg.outsideDhaka ?? taka(120));
  const total = subtotal + shippingFee;

  const [customer] = await db.insert(s.customers).values({
    id: uuid(), storeId: store.id, name: input.customer.name, phone: input.customer.phone, email: input.customer.email,
  }).onConflictDoUpdate({ target: [s.customers.storeId, s.customers.phone], set: { name: input.customer.name } })
    .returning({ id: s.customers.id });

  // Atomic per-store order number
  const [ctr] = await db.update(s.stores).set({ nextOrderNumber: sql`${s.stores.nextOrderNumber} + 1` })
    .where(eq(s.stores.id, store.id)).returning({ n: s.stores.nextOrderNumber });
  const number = ctr.n - 1;

  const orderId = uuid();
  const result = await provider.init({ orderId, orderNumber: number, amount: total, customerPhone: input.customer.phone });

  const stmts: BatchItem<"sqlite">[] = [
    db.insert(s.orders).values({
      id: orderId, storeId: store.id, number, customerId: customer.id,
      paymentMethod: input.paymentMethod, paymentStatus: result.status,
      subtotal, shippingFee, total,
      shipName: input.customer.name, shipPhone: input.customer.phone,
      ...input.shipping, note: input.note,
    }),
    db.insert(s.payments).values({
      id: uuid(), storeId: store.id, orderId, provider: input.paymentMethod,
      amount: total, status: result.status, providerRef: result.providerRef,
    }),
  ];
  for (const { v, p } of rows) {
    const q = qty.get(v.id)!;
    stmts.push(db.insert(s.orderItems).values({
      id: uuid(), storeId: store.id, orderId, productId: p.id, variantId: v.id,
      name: v.title === "Default" ? p.name : `${p.name} - ${v.title}`, sku: v.sku,
      unitPrice: v.price, quantity: q, total: v.price * q,
    }));
    if (v.stock !== null) {
      stmts.push(db.update(s.productVariants).set({ stock: sql`${s.productVariants.stock} - ${q}` })
        .where(and(eq(s.productVariants.id, v.id), eq(s.productVariants.storeId, store.id))));
    }
  }
  await db.batch(stmts as Batch);

  return c.json({ orderNumber: number, total, status: "pending", paymentMethod: input.paymentMethod, redirectUrl: result.redirectUrl }, 201);
});

// Customer-facing tracking: order number + phone must match
app.get("/api/orders/:number", async (c) => {
  const db = c.get("db"), store = c.get("store");
  const phone = (c.req.query("phone") ?? "").replace(/[\s-]/g, "").replace(/^\+?88/, "");
  const [o] = await db.select().from(s.orders).where(and(
    eq(s.orders.storeId, store.id), eq(s.orders.number, Number(c.req.param("number"))), eq(s.orders.shipPhone, phone))).limit(1);
  if (!o) return c.json({ error: "not_found" }, 404);
  const items = await db.select().from(s.orderItems).where(and(eq(s.orderItems.storeId, store.id), eq(s.orderItems.orderId, o.id)));
  return c.json({ number: o.number, status: o.status, paymentStatus: o.paymentStatus, total: o.total, courier: o.courier, trackingCode: o.trackingCode, items });
});

/* ========================== Admin ========================== */
app.post("/api/admin/products", async (c) => {
  const db = c.get("db"), store = c.get("store");
  const parsed = createProductSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "validation", issues: parsed.error.flatten() }, 400);
  const d = parsed.data;
  const id = uuid(), slug = d.slug ?? slugify(d.name);
  const variants = d.variants.length ? d.variants : [{ sku: slug, title: "Default", price: d.basePrice, stock: null, options: {} }];

  const stmts: BatchItem<"sqlite">[] = [
    db.insert(s.products).values({
      id, storeId: store.id, categoryId: d.categoryId, type: d.type, status: d.status, name: d.name, slug,
      description: d.description, basePrice: d.basePrice, attributes: d.attributes, images: d.images,
    }),
    ...variants.map((v) => db.insert(s.productVariants).values({ id: uuid(), storeId: store.id, productId: id, ...v })),
  ];
  try { await db.batch(stmts as Batch); }
  catch (e) {
    if (String(e).includes("UNIQUE")) return c.json({ error: "slug_or_sku_exists" }, 409);
    throw e;
  }
  return c.json({ id, slug }, 201);
});

app.get("/api/admin/orders", async (c) => {
  const store = c.get("store");
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 25));
  const status = c.req.query("status") as (typeof s.orders.$inferSelect)["status"] | undefined;
  const items = await c.get("db").select().from(s.orders)
    .where(status ? and(eq(s.orders.storeId, store.id), eq(s.orders.status, status)) : eq(s.orders.storeId, store.id))
    .orderBy(desc(s.orders.createdAt)).limit(limit).offset((page - 1) * limit);
  return c.json({ items, page, limit });
});

app.patch("/api/admin/orders/:id/status", async (c) => {
  const db = c.get("db"), store = c.get("store");
  const parsed = updateOrderStatusSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "validation", issues: parsed.error.flatten() }, 400);
  const [o] = await db.select().from(s.orders)
    .where(and(eq(s.orders.id, c.req.param("id")), eq(s.orders.storeId, store.id))).limit(1);
  if (!o) return c.json({ error: "not_found" }, 404);

  const { status, courier, trackingCode } = parsed.data;
  const stmts: BatchItem<"sqlite">[] = [
    db.update(s.orders).set({ status, courier, trackingCode, ...(status === "delivered" && o.paymentMethod === "cod" ? { paymentStatus: "paid" as const } : {}) })
      .where(and(eq(s.orders.id, o.id), eq(s.orders.storeId, store.id))),
  ];
  // Cancelling returns reserved stock (returned goods are restocked manually after inspection)
  if (status === "cancelled" && o.status !== "cancelled") {
    const items = await db.select().from(s.orderItems).where(and(eq(s.orderItems.orderId, o.id), eq(s.orderItems.storeId, store.id)));
    for (const i of items) {
      stmts.push(db.update(s.productVariants).set({ stock: sql`${s.productVariants.stock} + ${i.quantity}` })
        .where(and(eq(s.productVariants.id, i.variantId), eq(s.productVariants.storeId, store.id), sql`${s.productVariants.stock} IS NOT NULL`)));
    }
  }
  await db.batch(stmts as Batch);
  return c.json({ ok: true });
});

app.post("/api/admin/blocked-phones", async (c) => {
  const store = c.get("store");
  const parsed = blockPhoneSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "validation", issues: parsed.error.flatten() }, 400);
  await c.get("db").insert(s.blockedPhones).values({ id: uuid(), storeId: store.id, ...parsed.data }).onConflictDoNothing();
  return c.json({ ok: true }, 201);
});

export default app;
