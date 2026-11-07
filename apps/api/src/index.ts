import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import type { BatchItem } from "drizzle-orm/batch";
import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import * as s from "@bdc/db";
import {
  BD_DIVISIONS, bkashCredentialsSchema, blockPhoneSchema, checkoutSchema, createProductSchema, manualPaymentSettingsSchema, slugify,
  taka, updateOrderStatusSchema,
} from "@bdc/shared";
import { confirmBkashPayment, getPaymentProvider, type BkashCredentials, type ConfirmResult } from "@bdc/payments";
import { decryptJson, encryptJson } from "./crypto";

type Env = {
  DB: D1Database; CACHE: KVNamespace; MEDIA: R2Bucket; ROOT_DOMAIN: string;
  CREDENTIALS_KEY: string;               // secret: base64 32 bytes
  BKASH_BASE_URL_OVERRIDE?: string;      // operator-only, for local mock testing
};
type DB = DrizzleD1Database<typeof s>;
type Store = typeof s.stores.$inferSelect;
type Vars = { db: DB; store: Store };
type Batch = [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

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
  const callbackStore = c.req.path === "/api/payments/bkash/callback" ? c.req.query("store") : undefined;
  let slug = c.req.header("x-store-slug") ?? callbackStore ?? undefined;
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

/* ========================== helpers ========================== */
const methodsFor = async (db: DB, store: Store): Promise<string[]> => {
  const mp = store.settings.manualPayment;
  const rows = await db.select({ p: s.storePaymentCredentials.provider }).from(s.storePaymentCredentials)
    .where(eq(s.storePaymentCredentials.storeId, store.id));
  return [
    "cod",
    ...(mp && (mp.bkash || mp.nagad || mp.rocket) ? ["manual"] : []),
    ...rows.map((r) => r.p).filter((p) => getPaymentProvider(p).enabled),
  ];
};

async function loadBkash(c: Ctx): Promise<BkashCredentials | undefined> {
  const store = c.get("store");
  const [row] = await c.get("db").select({ ct: s.storePaymentCredentials.ciphertext }).from(s.storePaymentCredentials)
    .where(and(eq(s.storePaymentCredentials.storeId, store.id), eq(s.storePaymentCredentials.provider, "bkash"))).limit(1);
  if (!row) return undefined;
  const creds = await decryptJson<Omit<BkashCredentials, "baseUrl">>(c.env.CREDENTIALS_KEY, row.ct, `${store.id}:bkash`);
  return { ...creds, baseUrl: c.env.BKASH_BASE_URL_OVERRIDE || undefined };
}

/** Stock-restoring statements for every tracked item of an order. */
async function restockStmts(db: DB, storeId: string, orderId: string): Promise<BatchItem<"sqlite">[]> {
  const items = await db.select().from(s.orderItems).where(and(eq(s.orderItems.orderId, orderId), eq(s.orderItems.storeId, storeId)));
  return items.map((i) => db.update(s.productVariants).set({ stock: sql`${s.productVariants.stock} + ${i.quantity}` })
    .where(and(eq(s.productVariants.id, i.variantId), eq(s.productVariants.storeId, storeId), sql`${s.productVariants.stock} IS NOT NULL`)));
}

/** Cancels an order whose online payment failed/was cancelled, and releases its stock. */
async function failOnlineOrder(db: DB, storeId: string, orderId: string) {
  await db.batch([
    db.update(s.orders).set({ status: "cancelled", paymentStatus: "failed" }).where(and(eq(s.orders.id, orderId), eq(s.orders.storeId, storeId))),
    db.update(s.payments).set({ status: "failed" }).where(and(eq(s.payments.orderId, orderId), eq(s.payments.storeId, storeId))),
    ...(await restockStmts(db, storeId, orderId)),
  ] as Batch);
}

type PaymentRow = typeof s.payments.$inferSelect;
type OrderRow = typeof s.orders.$inferSelect;
async function applyConfirm(db: DB, storeId: string, p: PaymentRow, o: OrderRow, r: ConfirmResult): Promise<"paid" | "failed" | "pending"> {
  if (r.status === "paid") {
    await db.batch([
      db.update(s.payments).set({ status: "paid", transactionId: r.transactionId, raw: r.raw }).where(and(eq(s.payments.id, p.id), eq(s.payments.storeId, storeId))),
      db.update(s.orders).set({ paymentStatus: "paid" }).where(and(eq(s.orders.id, o.id), eq(s.orders.storeId, storeId))),
    ]);
    return "paid";
  }
  if (r.status === "failed") { await failOnlineOrder(db, storeId, o.id); return "failed"; }
  await db.update(s.payments).set({ raw: r.raw }).where(and(eq(s.payments.id, p.id), eq(s.payments.storeId, storeId)));
  return "pending";
}

/* ========================== Public: catalog ========================== */
app.get("/api/store", async (c) => {
  const store = c.get("store");
  const { id, name, slug, currency, locale, theme, settings } = store;
  const { contact, facebookPixelId, shipping } = settings;
  c.header("Cache-Control", "public, max-age=60");
  return c.json({ id, name, slug, currency, locale, theme, paymentMethods: await methodsFor(c.get("db"), store), manualPayment: settings.manualPayment, settings: { contact, facebookPixelId, shipping } });
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
  let bkashCreds: BkashCredentials | undefined;
  if (input.paymentMethod === "bkash") {
    bkashCreds = await loadBkash(c);
    if (!bkashCreds) return c.json({ error: "payment_method_unavailable" }, 400);
  }

  if (input.paymentMethod === "manual") {
    const mp = input.manualPayment!;
    if (!store.settings.manualPayment?.[mp.wallet]) return c.json({ error: "payment_method_unavailable" }, 400);
    const [dup] = await db.select({ id: s.payments.id }).from(s.payments)
      .where(and(eq(s.payments.storeId, store.id), eq(s.payments.provider, "manual"), eq(s.payments.providerRef, mp.trxId))).limit(1);
    if (dup) return c.json({ error: "trx_already_used", message: "This transaction ID was already submitted." }, 409);
  }

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

  const stmts: BatchItem<"sqlite">[] = [
    db.insert(s.orders).values({
      id: orderId, storeId: store.id, number, customerId: customer.id,
      paymentMethod: input.paymentMethod, paymentStatus: "unpaid",
      subtotal, shippingFee, total,
      shipName: input.customer.name, shipPhone: input.customer.phone,
      ...input.shipping, note: input.note,
    }),
    db.insert(s.payments).values({
      id: uuid(), storeId: store.id, orderId, provider: input.paymentMethod,
      amount: total, status: "unpaid",
      ...(input.paymentMethod === "manual" && input.manualPayment
        ? { providerRef: input.manualPayment.trxId,
            raw: { wallet: input.manualPayment.wallet, senderNumber: input.manualPayment.senderNumber, sentTo: store.settings.manualPayment?.[input.manualPayment.wallet] } }
        : {}),
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
  try { await db.batch(stmts as Batch); }
  catch (e) {
    if (String(e).includes("UNIQUE") && input.paymentMethod === "manual") return c.json({ error: "trx_already_used" }, 409); // race: two orders, same TrxID
    throw e;
  }

  const created = { orderNumber: number, total, status: "pending", paymentMethod: input.paymentMethod,
    ...(input.paymentMethod === "manual" ? { awaitingVerification: true } : {}) };
  if (!provider.online) return c.json(created, 201);

  // Online payment: the order (and its reserved stock) already exists; now start the gateway session.
  try {
    const callbackUrl = `${new URL(c.req.url).origin}/api/payments/${input.paymentMethod}/callback?store=${store.slug}`;
    const result = await provider.init({
      orderId, orderNumber: number, invoiceNumber: `${store.slug}-${number}`, amount: total,
      customerPhone: input.customer.phone, callbackUrl, credentials: bkashCreds, tokenCache: {
        get: (k) => c.env.CACHE.get(k), put: (k, v, ttl) => c.env.CACHE.put(k, v, { expirationTtl: ttl }),
      },
    });
    await db.update(s.payments).set({ providerRef: result.providerRef })
      .where(and(eq(s.payments.orderId, orderId), eq(s.payments.storeId, store.id)));
    return c.json({ ...created, redirectUrl: result.redirectUrl }, 201);
  } catch (e) {
    console.error("payment init failed", String(e));
    await failOnlineOrder(db, store.id, orderId); // release stock; customer can retry checkout
    return c.json({ error: "payment_init_failed" }, 502);
  }
});

// bKash redirects the customer's browser here after they pay/cancel. Never trust the query for money:
// the payment is confirmed server-to-server with bKash and the amount is checked against our own order total.
app.get("/api/payments/bkash/callback", async (c) => {
  const db = c.get("db"), store = c.get("store");
  const paymentId = c.req.query("paymentID") ?? "";
  const status = c.req.query("status") ?? "";
  const finish = (result: string, number?: number) => {
    const url = store.settings.storefrontUrl;
    if (url && number) return c.redirect(`${url.replace(/\/+$/, "")}/order/${number}?payment=${result}`, 302);
    return c.json({ result, orderNumber: number ?? null });
  };

  const [row] = paymentId ? await db.select({ p: s.payments, o: s.orders }).from(s.payments)
    .innerJoin(s.orders, eq(s.payments.orderId, s.orders.id))
    .where(and(eq(s.payments.storeId, store.id), eq(s.payments.provider, "bkash"), eq(s.payments.providerRef, paymentId))).limit(1) : [];
  if (!row) return finish("failed");
  const { p, o } = row;

  if (p.status === "paid") return finish("paid", o.number);          // callback can fire twice
  if (o.status === "cancelled") return finish("failed", o.number);
  if (status !== "success") {
    await failOnlineOrder(db, store.id, o.id);
    return finish(status === "cancel" ? "cancelled" : "failed", o.number);
  }

  const creds = await loadBkash(c);
  if (!creds) return finish("pending", o.number);
  const r = await confirmBkashPayment(creds, {
    get: (k) => c.env.CACHE.get(k), put: (k, v, ttl) => c.env.CACHE.put(k, v, { expirationTtl: ttl }),
  }, paymentId, o.total);
  return finish(await applyConfirm(db, store.id, p, o, r), o.number);
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
  const pay = c.req.query("paymentStatus") as (typeof s.orders.$inferSelect)["paymentStatus"] | undefined;
  const items = await c.get("db").select().from(s.orders)
    .where(and(eq(s.orders.storeId, store.id), ...(status ? [eq(s.orders.status, status)] : []), ...(pay ? [eq(s.orders.paymentStatus, pay)] : [])))
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
  if (status === "cancelled" && o.status !== "cancelled") stmts.push(...(await restockStmts(db, store.id, o.id)));
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

/* ---- payment gateway settings (secrets are encrypted at rest, never returned) ---- */
app.put("/api/admin/payment-settings/bkash", async (c) => {
  const db = c.get("db"), store = c.get("store");
  const parsed = bkashCredentialsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "validation", issues: parsed.error.flatten() }, 400);
  if (!c.env.CREDENTIALS_KEY) return c.json({ error: "server_not_configured", message: "CREDENTIALS_KEY secret is missing" }, 500);
  const ciphertext = await encryptJson(c.env.CREDENTIALS_KEY, parsed.data, `${store.id}:bkash`);
  await db.insert(s.storePaymentCredentials).values({ id: uuid(), storeId: store.id, provider: "bkash", ciphertext })
    .onConflictDoUpdate({ target: [s.storePaymentCredentials.storeId, s.storePaymentCredentials.provider], set: { ciphertext } });
  return c.json({ ok: true, sandbox: parsed.data.sandbox });
});

app.get("/api/admin/payment-settings", async (c) => {
  const rows = await c.get("db").select({ provider: s.storePaymentCredentials.provider, updatedAt: s.storePaymentCredentials.updatedAt })
    .from(s.storePaymentCredentials).where(eq(s.storePaymentCredentials.storeId, c.get("store").id));
  return c.json({ configured: rows });
});

app.delete("/api/admin/payment-settings/bkash", async (c) => {
  const store = c.get("store");
  await c.get("db").delete(s.storePaymentCredentials)
    .where(and(eq(s.storePaymentCredentials.storeId, store.id), eq(s.storePaymentCredentials.provider, "bkash")));
  return c.json({ ok: true });
});

/* Re-check an unpaid bKash order with bKash (customer closed the tab, timeout, etc.) */
app.post("/api/admin/orders/:id/verify-payment", async (c) => {
  const db = c.get("db"), store = c.get("store");
  const [row] = await db.select({ p: s.payments, o: s.orders }).from(s.payments)
    .innerJoin(s.orders, eq(s.payments.orderId, s.orders.id))
    .where(and(eq(s.payments.storeId, store.id), eq(s.orders.id, c.req.param("id")), eq(s.payments.provider, "bkash"))).limit(1);
  if (!row || !row.p.providerRef) return c.json({ error: "not_found" }, 404);
  if (row.p.status === "paid") return c.json({ result: "paid" });
  const creds = await loadBkash(c);
  if (!creds) return c.json({ error: "payment_method_unavailable" }, 400);
  const r = await confirmBkashPayment(creds, {
    get: (k) => c.env.CACHE.get(k), put: (k, v, ttl) => c.env.CACHE.put(k, v, { expirationTtl: ttl }),
  }, row.p.providerRef, row.o.total);
  return c.json({ result: await applyConfirm(db, store.id, row.p, row.o, r), reason: r.status === "paid" ? undefined : r.reason });
});

/* ---- manual wallet payments (no merchant account needed) ---- */
const bustStoreCache = async (c: Ctx, store: Store) => {
  await c.env.CACHE.delete(`store:slug:${store.slug}`);
  if (store.customDomain) await c.env.CACHE.delete(`store:domain:${store.customDomain}`);
};

app.put("/api/admin/payment-settings/manual", async (c) => {
  const store = c.get("store");
  const parsed = manualPaymentSettingsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "validation", issues: parsed.error.flatten() }, 400);
  await c.get("db").update(s.stores).set({ settings: { ...store.settings, manualPayment: parsed.data } }).where(eq(s.stores.id, store.id));
  await bustStoreCache(c, store);
  return c.json({ ok: true, manualPayment: parsed.data });
});

app.delete("/api/admin/payment-settings/manual", async (c) => {
  const store = c.get("store");
  const { manualPayment: _drop, ...rest } = store.settings;
  await c.get("db").update(s.stores).set({ settings: rest }).where(eq(s.stores.id, store.id));
  await bustStoreCache(c, store);
  return c.json({ ok: true });
});

app.get("/api/admin/orders/:id", async (c) => {
  const db = c.get("db"), store = c.get("store");
  const [order] = await db.select().from(s.orders).where(and(eq(s.orders.id, c.req.param("id")), eq(s.orders.storeId, store.id))).limit(1);
  if (!order) return c.json({ error: "not_found" }, 404);
  const [items, payments] = await Promise.all([
    db.select().from(s.orderItems).where(and(eq(s.orderItems.orderId, order.id), eq(s.orderItems.storeId, store.id))),
    db.select().from(s.payments).where(and(eq(s.payments.orderId, order.id), eq(s.payments.storeId, store.id))),
  ]);
  return c.json({ order, items, payments });
});

// Admin saw the money arrive in the wallet app (matching TrxID and amount): mark paid and confirm the order.
app.post("/api/admin/orders/:id/confirm-payment", async (c) => {
  const db = c.get("db"), store = c.get("store");
  const [row] = await db.select({ p: s.payments, o: s.orders }).from(s.payments)
    .innerJoin(s.orders, eq(s.payments.orderId, s.orders.id))
    .where(and(eq(s.payments.storeId, store.id), eq(s.orders.id, c.req.param("id")), eq(s.payments.provider, "manual"))).limit(1);
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.p.status === "paid") return c.json({ ok: true, result: "already_paid" });
  if (row.o.status === "cancelled") return c.json({ error: "order_cancelled" }, 409);
  await db.batch([
    db.update(s.payments).set({ status: "paid", transactionId: row.p.providerRef }).where(and(eq(s.payments.id, row.p.id), eq(s.payments.storeId, store.id))),
    db.update(s.orders).set({ paymentStatus: "paid", ...(row.o.status === "pending" ? { status: "confirmed" as const } : {}) })
      .where(and(eq(s.orders.id, row.o.id), eq(s.orders.storeId, store.id))),
  ]);
  return c.json({ ok: true, result: "paid" });
});

// TrxID not found / wrong amount / fake: cancel the order and release stock.
app.post("/api/admin/orders/:id/reject-payment", async (c) => {
  const db = c.get("db"), store = c.get("store");
  const [row] = await db.select({ p: s.payments, o: s.orders }).from(s.payments)
    .innerJoin(s.orders, eq(s.payments.orderId, s.orders.id))
    .where(and(eq(s.payments.storeId, store.id), eq(s.orders.id, c.req.param("id")), eq(s.payments.provider, "manual"))).limit(1);
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.p.status === "paid") return c.json({ error: "already_paid" }, 409);
  if (row.o.status === "cancelled") return c.json({ ok: true, result: "already_cancelled" });
  await failOnlineOrder(db, store.id, row.o.id);
  return c.json({ ok: true, result: "rejected" });
});

export default app;
