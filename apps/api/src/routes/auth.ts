import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { eq, and, gt, isNull } from "drizzle-orm";
import { sessions, users } from "@bd/db";
import {
  loginSchema,
  registerSchema,
  resetPasswordRequestSchema,
  resetPasswordSchema,
  passwordChangeSchema,
} from "@bd/core";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  setAuthCookies,
  clearAuthCookies,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE,
} from "../lib/jwt";
import { requireAuth } from "../middleware/auth";
import { ok, fail, unauthorized, HttpError } from "../lib/http";

export function publicUser(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    name: u.name,
    role: u.role,
    avatar: u.avatar,
    loyaltyPoints: u.loyaltyPoints,
    createdAt: u.createdAt.getTime(),
  };
}

export const authRoutes = new Hono<AppEnv>()
  .post("/register", zValidator("json", registerSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);

    const existing = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (existing[0]) throw new HttpError(409, "An account with this email already exists");

    const passwordHash = await hashPassword(body.password);
    const user = (
      await db
        .insert(users)
        .values({ email: body.email, name: body.name, phone: body.phone, passwordHash, role: "CUSTOMER" })
        .returning()
    )[0]!;

    return ok(c, { user: publicUser(user) }, undefined, 201);
  })

  .post("/login", zValidator("json", loginSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);

    const found = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    const user = found[0];
    if (!user || !user.passwordHash) throw new HttpError(401, "Invalid email or password");
    if (!user.isActive) throw new HttpError(403, "Account disabled");

    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) throw new HttpError(401, "Invalid email or password");

    const access = await signAccessToken(c.env, user);
    const refresh = generateRefreshToken();
    await db.insert(sessions).values({
      userId: user.id,
      tokenHash: await hashToken(refresh),
      userAgent: c.req.header("User-Agent"),
      ip: c.req.header("CF-Connecting-IP"),
      expiresAt: new Date(Date.now() + REFRESH_MAX_AGE * 1000),
    });

    setAuthCookies(c, c.env, access, refresh);
    return ok(c, { user: publicUser(user) });
  })

  .post("/refresh", async (c) => {
    const db = getDb(c.env);
    const refresh = getCookie(c, REFRESH_COOKIE);
    if (!refresh) return unauthorized(c, "No refresh token");

    const tokenHash = await hashToken(refresh);
    const session = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
      .limit(1);

    const row = session[0];
    if (!row) return unauthorized(c, "Session expired");

    const user = (await db.select().from(users).where(eq(users.id, row.userId)).limit(1))[0];
    if (!user || !user.isActive) return unauthorized(c, "Account unavailable");

    // Rotate the refresh token
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, row.id));
    const newRefresh = generateRefreshToken();
    await db.insert(sessions).values({
      userId: user.id,
      tokenHash: await hashToken(newRefresh),
      userAgent: c.req.header("User-Agent"),
      expiresAt: new Date(Date.now() + REFRESH_MAX_AGE * 1000),
    });

    const access = await signAccessToken(c.env, user);
    setAuthCookies(c, c.env, access, newRefresh);
    return ok(c, { user: publicUser(user) });
  })

  .post("/logout", requireAuth, async (c) => {
    const db = getDb(c.env);
    const refresh = getCookie(c, REFRESH_COOKIE);
    if (refresh) {
      const tokenHash = await hashToken(refresh);
      await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, tokenHash));
    }
    clearAuthCookies(c, c.env);
    return ok(c, { loggedOut: true });
  })

  .get("/me", requireAuth, async (c) => {
    const db = getDb(c.env);
    const user = (await db.select().from(users).where(eq(users.id, c.get("userId")!)).limit(1))[0];
    if (!user) return unauthorized(c);
    return ok(c, { user: publicUser(user) });
  })

  .post("/change-password", requireAuth, zValidator("json", passwordChangeSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const user = (await db.select().from(users).where(eq(users.id, c.get("userId")!)).limit(1))[0];
    if (!user || !user.passwordHash) throw new HttpError(404, "Account not found");
    const valid = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!valid) throw new HttpError(400, "Current password is incorrect");
    const passwordHash = await hashPassword(body.newPassword);
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    return ok(c, { changed: true });
  })

  .post("/forgot-password", zValidator("json", resetPasswordRequestSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const user = (await db.select().from(users).where(eq(users.email, body.email)).limit(1))[0];
    if (!user) return ok(c, { sent: true }); // do not reveal account existence

    const token = generateRefreshToken();
    await db.insert(sessions).values({
      userId: user.id,
      tokenHash: await hashToken(`reset:${token}`),
      userAgent: "password-reset",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    // In a full deployment this is sent via SMTP/transactional email.
    // Local/dev: return the reset token so the flow can be exercised.
    const base = c.req.header("Origin") || "http://localhost:3000";
    const resetLink = `${base}/reset-password?token=${token}`;
    if (c.env.ENVIRONMENT === "production") {
      return ok(c, { sent: true });
    }
    return ok(c, { sent: true, devToken: token, devResetLink: resetLink });
  })

  .post("/reset-password", zValidator("json", resetPasswordSchema), async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const tokenHash = await hashToken(`reset:${body.token}`);
    const session = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
      .limit(1);
    const row = session[0];
    if (!row) throw new HttpError(400, "Invalid or expired reset token");

    const passwordHash = await hashPassword(body.password);
    await db.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, row.id));
    return ok(c, { reset: true });
  });
