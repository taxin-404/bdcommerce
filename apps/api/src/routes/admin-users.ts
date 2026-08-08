import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { notifications, orders, settings, users } from "@bd/db";
import { adminUserSchema, userUpdateSchema } from "@bd/core";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { ok, HttpError } from "../lib/http";
import { paginated, paginationFromQuery, likeTerm } from "../lib/query";
import { requireAdmin } from "../middleware/auth";
import { hashPassword } from "../lib/password";
import { setSettingValue } from "../lib/settings";

const publicUser = (u: typeof users.$inferSelect) => ({
  id: u.id,
  email: u.email,
  phone: u.phone,
  name: u.name,
  role: u.role,
  avatar: u.avatar,
  isActive: u.isActive,
  loyaltyPoints: u.loyaltyPoints,
  createdAt: u.createdAt.getTime(),
});

export const adminUserRoutes = new Hono<AppEnv>()
  // ---- Customers ----------------------------------------------------------
  .get("/customers", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const q = new URL(c.req.url);
    const { page, pageSize } = paginationFromQuery(q.searchParams, 25);
    const search = q.searchParams.get("search");
    const conditions = [
      eq(users.role, "CUSTOMER"),
      search ? or(like(users.name, likeTerm(search)), like(users.email, likeTerm(search)), like(users.phone ?? "", likeTerm(search))) : undefined,
    ].filter(Boolean);

    const [totalRows, rows] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(users).where(and(...(conditions as any))),
      db.select().from(users).where(and(...(conditions as any))).orderBy(desc(users.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    ]);

    const orderCounts = rows.length
      ? await db.select({ userId: orders.userId, n: sql<number>`COUNT(*)` }).from(orders).where(inArray(orders.userId, rows.map((r) => r.id))).groupBy(orders.userId)
      : [];
    const countMap = new Map(orderCounts.map((o) => [o.userId, o.n]));
    const spentMap = new Map(
      (
        await (rows.length
          ? db
              .select({ userId: orders.userId, total: sql<number>`COALESCE(SUM(${orders.totalPaisa}), 0)` })
              .from(orders)
              .where(inArray(orders.userId, rows.map((r) => r.id)))
              .groupBy(orders.userId)
          : Promise.resolve([]))
      ).map((o) => [o.userId, o.total]),
    );

    return ok(
      c,
      paginated(
        rows.map((u) => ({ ...publicUser(u), orderCount: countMap.get(u.id) ?? 0, totalSpentPaisa: spentMap.get(u.id) ?? 0 })),
        page,
        pageSize,
        totalRows[0]?.count ?? 0,
      ),
    );
  })

  .get("/customers/:id", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const user = (await db.select().from(users).where(eq(users.id, c.req.param("id"))).limit(1))[0];
    if (!user) throw new HttpError(404, "User not found");
    const orderRows = await db.select().from(orders).where(eq(orders.userId, user.id)).orderBy(desc(orders.placedAt)).limit(100);
    return ok(c, {
      user: publicUser(user),
      orders: orderRows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        totalPaisa: o.totalPaisa,
        placedAt: o.placedAt.getTime(),
      })),
    });
  })

  .patch("/customers/:id", requireAdmin, zValidator("json", userUpdateSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const user = (await db.select().from(users).where(eq(users.id, c.req.param("id"))).limit(1))[0];
    if (!user) throw new HttpError(404, "User not found");
    const updated = (
      await db
        .update(users)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(users.id, user.id))
        .returning()
    )[0]!;
    return ok(c, publicUser(updated));
  })

  // ---- Staff --------------------------------------------------------------
  .get("/staff", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const rows = await db.select().from(users).where(or(eq(users.role, "ADMIN"), eq(users.role, "STAFF")));
    return ok(c, rows.map(publicUser));
  })

  .post("/staff", requireAdmin, zValidator("json", adminUserSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const existing = (await db.select().from(users).where(eq(users.email, body.email)).limit(1))[0];
    if (existing) throw new HttpError(409, "A user with this email already exists");
    const user = (
      await db
        .insert(users)
        .values({ name: body.name, email: body.email, passwordHash: await hashPassword(body.password), role: body.role })
        .returning()
    )[0]!;
    return ok(c, publicUser(user), undefined, 201);
  })

  .delete("/staff/:id", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const user = (await db.select().from(users).where(eq(users.id, c.req.param("id"))).limit(1))[0];
    if (!user) throw new HttpError(404, "User not found");
    if (user.role === "ADMIN") throw new HttpError(400, "Admins cannot be removed via API");
    await db.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, user.id));
    return ok(c, { disabled: true });
  })

  // ---- Notifications (admin inbox) -----------------------------------------
  .get("/notifications", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const { page, pageSize } = paginationFromQuery(new URL(c.req.url).searchParams, 30);
    const [totalRows, rows] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(notifications),
      db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    ]);
    return ok(
      c,
      paginated(
        rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, isRead: n.isRead, createdAt: n.createdAt.getTime() })),
        page,
        pageSize,
        totalRows[0]?.count ?? 0,
      ),
    );
  })

  .get("/notifications/unread-count", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const rows = await db.select({ n: sql<number>`COUNT(*)` }).from(notifications).where(eq(notifications.isRead, false));
    return ok(c, { unread: rows[0]?.n ?? 0 });
  })

  .post("/notifications/:id/read", requireAdmin, async (c) => {
    const db = getDb(c.env);
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, c.req.param("id")));
    return ok(c, { read: true });
  })

  .post("/notifications/read-all", requireAdmin, async (c) => {
    const db = getDb(c.env);
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.isRead, false));
    return ok(c, { readAll: true });
  })

  .delete("/notifications/:id", requireAdmin, async (c) => {
    const db = getDb(c.env);
    await db.delete(notifications).where(eq(notifications.id, c.req.param("id")));
    return ok(c, { deleted: true });
  })

  // ---- Settings ------------------------------------------------------------
  .get("/settings", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const rows = await db.select().from(settings);
    const out: Record<string, unknown> = {};
    for (const r of rows) out[r.key] = r.value;
    return ok(c, out);
  })

  .patch("/settings", requireAdmin, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, Record<string, unknown>>;
    const db = getDb(c.env);
    for (const [key, value] of Object.entries(body)) {
      await setSettingValue(db, c.env, key, value ?? {});
    }
    return ok(c, { saved: Object.keys(body) });
  });
