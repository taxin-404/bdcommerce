import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv, UserPayload } from "../env";
import { ACCESS_COOKIE, verifyAccessToken } from "../lib/jwt";
import { fail } from "../lib/http";

// Shared token extraction + verification.
export async function authenticate(c: Context<AppEnv>): Promise<UserPayload | null> {
  const cookieToken = getCookie(c, ACCESS_COOKIE);
  const authHeader = c.req.header("Authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const token = cookieToken ?? bearer;
  if (!token) return null;
  return verifyAccessToken(token, c.env.JWT_SECRET);
}

// Verifies the access token from cookie or Authorization header, stores the
// user on context, and rejects when absent/invalid.
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const payload = await authenticate(c);
  if (!payload) return fail(c, 401, "Authentication required");
  c.set("userId", payload.sub);
  c.set("userRole", payload.role);
  c.set("userEmail", payload.email);
  await next();
};

// Requires an authenticated user with an admin/staff role.
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const payload = await authenticate(c);
  if (!payload) return fail(c, 401, "Authentication required");
  if (payload.role !== "ADMIN" && payload.role !== "STAFF") return fail(c, 403, "Admin access required");
  c.set("userId", payload.sub);
  c.set("userRole", payload.role);
  c.set("userEmail", payload.email);
  await next();
};

// Requires a CUSTOMER (account-area actions).
export const requireCustomer: MiddlewareHandler<AppEnv> = async (c, next) => {
  const payload = await authenticate(c);
  if (!payload) return fail(c, 401, "Authentication required");
  if (payload.role !== "CUSTOMER") return fail(c, 403, "Customer access required");
  c.set("userId", payload.sub);
  c.set("userRole", payload.role);
  c.set("userEmail", payload.email);
  await next();
};
