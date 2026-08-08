import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, sql } from "drizzle-orm";
import { addresses, users } from "@bd/db";
import { addressSchema, profileUpdateSchema, passwordChangeSchema } from "@bd/core";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { ok, HttpError } from "../lib/http";
import { requireCustomer } from "../middleware/auth";
import { hashPassword, verifyPassword } from "../lib/password";
import { publicUser } from "./auth";

export const accountRoutes = new Hono<AppEnv>()
  // ---- Profile -----------------------------------------------------------
  .get("/profile", requireCustomer, async (c) => {
    const db = getDb(c.env);
    const user = (await db.select().from(users).where(eq(users.id, c.get("userId")!)).limit(1))[0];
    if (!user) throw new HttpError(404, "Account not found");
    return ok(c, { user: publicUser(user) });
  })

  .patch("/profile", requireCustomer, zValidator("json", profileUpdateSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const user = (await db.select().from(users).where(eq(users.id, c.get("userId")!)).limit(1))[0];
    if (!user) throw new HttpError(404, "Account not found");
    const updated = (
      await db
        .update(users)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(users.id, user.id))
        .returning()
    )[0]!;
    return ok(c, { user: publicUser(updated) });
  })

  .post("/change-password", requireCustomer, zValidator("json", passwordChangeSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const user = (await db.select().from(users).where(eq(users.id, c.get("userId")!)).limit(1))[0];
    if (!user || !user.passwordHash) throw new HttpError(404, "Account not found");
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) throw new HttpError(400, "Current password is incorrect");
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(body.newPassword), updatedAt: new Date() })
      .where(eq(users.id, user.id));
    return ok(c, { changed: true });
  })

  // ---- Addresses ----------------------------------------------------------
  .get("/addresses", requireCustomer, async (c) => {
    const db = getDb(c.env);
    const rows = await db.select().from(addresses).where(eq(addresses.userId, c.get("userId")!)).orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
    return ok(c, rows);
  })

  .post("/addresses", requireCustomer, zValidator("json", addressSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const count = (await db.select({ n: sql<number>`COUNT(*)` }).from(addresses).where(eq(addresses.userId, c.get("userId")!)))[0]?.n ?? 0;
    const isDefault = body.isDefault || count === 0;
    if (isDefault) {
      await db.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, c.get("userId")!));
    }
    const row = (
      await db
        .insert(addresses)
        .values({
          userId: c.get("userId")!,
          type: body.type,
          label: body.label ?? null,
          firstName: body.firstName,
          lastName: body.lastName ?? "",
          company: body.company ?? null,
          line1: body.line1,
          line2: body.line2 ?? null,
          city: body.city ?? "",
          district: body.district,
          upazila: body.upazila ?? null,
          postalCode: body.postalCode ?? null,
          phone: body.phone,
          isDefault,
        })
        .returning()
    )[0]!;
    return ok(c, row, undefined, 201);
  })

  .patch("/addresses/:id", requireCustomer, zValidator("json", addressSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const existing = (
      await db.select().from(addresses).where(and(eq(addresses.id, c.req.param("id")), eq(addresses.userId, c.get("userId")!))).limit(1)
    )[0];
    if (!existing) throw new HttpError(404, "Address not found");
    if (body.isDefault) {
      await db.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, c.get("userId")!));
    }
    const row = (
      await db
        .update(addresses)
        .set({
          type: body.type,
          label: body.label ?? existing.label,
          firstName: body.firstName,
          lastName: body.lastName ?? existing.lastName,
          company: body.company ?? existing.company,
          line1: body.line1,
          line2: body.line2 ?? existing.line2,
          city: body.city ?? existing.city,
          district: body.district,
          upazila: body.upazila ?? existing.upazila,
          postalCode: body.postalCode ?? existing.postalCode,
          phone: body.phone,
          isDefault: body.isDefault ?? existing.isDefault,
          updatedAt: new Date(),
        })
        .where(eq(addresses.id, existing.id))
        .returning()
    )[0]!;
    return ok(c, row);
  })

  .delete("/addresses/:id", requireCustomer, async (c) => {
    const db = getDb(c.env);
    const existing = (
      await db.select().from(addresses).where(and(eq(addresses.id, c.req.param("id")), eq(addresses.userId, c.get("userId")!))).limit(1)
    )[0];
    if (!existing) throw new HttpError(404, "Address not found");
    await db.delete(addresses).where(eq(addresses.id, existing.id));
    return ok(c, { deleted: true });
  });
