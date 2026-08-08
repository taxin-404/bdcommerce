import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { contactMessages, newsletterSubscribers, paymentMethods } from "@bd/db";
import { contactSchema, newsletterSchema } from "@bd/core";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { ok, HttpError } from "../lib/http";
import { getSiteSettings } from "../lib/settings";
import { createNotification } from "../lib/notifications";

export const miscRoutes = new Hono<AppEnv>()
  // Public site settings (name, theme colors, etc.)
  .get("/site", async (c) => {
    const db = getDb(c.env);
    return ok(c, await getSiteSettings(db, c.env));
  })

  // Active payment methods (public — storefront checkout renders these)
  .get("/payment-methods", async (c) => {
    const db = getDb(c.env);
    const rows = await db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.isActive, true))
      .orderBy(desc(paymentMethods.sortOrder));
    return ok(
      c,
      rows.map((p) => ({
        key: p.key,
        name: p.name,
        description: p.description,
      })),
    );
  })

  .post("/newsletter", zValidator("json", newsletterSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const existing = (await db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.email, body.email)).limit(1))[0];
    if (!existing) {
      await db.insert(newsletterSubscribers).values({ email: body.email });
    } else if (!existing.isActive) {
      await db.update(newsletterSubscribers).set({ isActive: true }).where(eq(newsletterSubscribers.id, existing.id));
    }
    return ok(c, { subscribed: true }, undefined, 201);
  })

  .post("/contact", zValidator("json", contactSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const msg = (
      await db
        .insert(contactMessages)
        .values({ name: body.name, email: body.email, phone: body.phone ?? null, subject: body.subject ?? null, message: body.message })
        .returning()
    )[0]!;
    await createNotification(db, c.env, {
      type: "CONTACT",
      title: `Contact message from ${body.name}`,
      body: body.subject ? `${body.subject} — ${body.message.slice(0, 120)}` : body.message.slice(0, 120),
      link: `/admin/messages/${msg.id}`,
    });
    return ok(c, { sent: true }, undefined, 201);
  });
