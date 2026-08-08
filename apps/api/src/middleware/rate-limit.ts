import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { rateLimit } from "@bd/core";

// Simple global rate limiting keyed by IP. Public routes get a generous cap;
// auth routes use a stricter cap via their own limiter.
export function ipRateLimit(limit: number, windowSeconds: number): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
    const route = new URL(c.req.url).pathname;
    const result = await rateLimit({
      db: c.env.DB,
      key: `rl:${route}:${ip}`,
      limit,
      windowSeconds,
    });
    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfter));
      return c.json({ ok: false, error: "Too many requests", message: `Rate limit exceeded. Retry after ${result.retryAfter}s.` }, 429);
    }
    await next();
  };
}
