import { sign, verify } from "hono/jwt";
import type { Env, UserPayload } from "../env";

const ACCESS_COOKIE = "bd_access";
const REFRESH_COOKIE = "bd_refresh";
const ACCESS_MAX_AGE = 15 * 60;
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

export async function signAccessToken(env: Env, user: { id: string; email: string; role: string }): Promise<string> {
  const ttl = parseInt(env.JWT_ACCESS_TTL ?? "", 10) || ACCESS_MAX_AGE;
  const payload: UserPayload = {
    sub: user.id,
    email: user.email,
    role: user.role as UserPayload["role"],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttl,
  };
  return sign(payload, env.JWT_SECRET, "HS256");
}

export async function verifyAccessToken(token: string, secret: string): Promise<UserPayload | null> {
  try {
    const payload = await verify(token, secret, "HS256");
    if (typeof payload === "string") return null;
    return payload as unknown as UserPayload;
  } catch {
    return null;
  }
}

export function generateRefreshToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CookieOptions {
  maxAge: number;
}

function cookieDomain(env: Env): string {
  return env.COOKIE_DOMAIN || "";
}

interface HeaderSetter {
  header: (name: string, value: string, options?: { append?: boolean }) => void;
}

export function setAuthCookies(c: HeaderSetter, env: Env, access: string, refresh: string) {
  const secure = env.ENVIRONMENT === "production" || env.COOKIE_DOMAIN !== "" ? "; Secure" : "";
  const domain = cookieDomain(env) ? `; Domain=${env.COOKIE_DOMAIN}` : "";
  c.header("Set-Cookie", `${ACCESS_COOKIE}=${access}; HttpOnly; Path=/; Max-Age=${ACCESS_MAX_AGE}; SameSite=Lax${secure}${domain}`, { append: true });
  c.header("Set-Cookie", `${REFRESH_COOKIE}=${refresh}; HttpOnly; Path=/api/v1; Max-Age=${REFRESH_MAX_AGE}; SameSite=Lax${secure}${domain}`, { append: true });
}

export function clearAuthCookies(c: HeaderSetter, env: Env) {
  const secure = env.ENVIRONMENT === "production" || env.COOKIE_DOMAIN !== "" ? "; Secure" : "";
  const domain = cookieDomain(env) ? `; Domain=${env.COOKIE_DOMAIN}` : "";
  c.header("Set-Cookie", `${ACCESS_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}${domain}`, { append: true });
  c.header("Set-Cookie", `${REFRESH_COOKIE}=; HttpOnly; Path=/api/v1; Max-Age=0; SameSite=Lax${secure}${domain}`, { append: true });
}

export { ACCESS_COOKIE, REFRESH_COOKIE, ACCESS_MAX_AGE, REFRESH_MAX_AGE };
