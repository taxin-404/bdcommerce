import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { HttpError, fail } from "../lib/http";

// Global error handler: converts thrown errors into the API error envelope.
export const errorHandler = (err: unknown, c: Context<AppEnv>) => {
  if (err instanceof HttpError) {
    return fail(c, err.status, err.message, err.message, err.details);
  }
  if (err instanceof SyntaxError) {
    return fail(c, 400, "Invalid JSON body");
  }
  console.error("[api] unhandled error", err);
  return fail(c, 500, "Internal server error");
};

export function securityHeaders(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "SAMEORIGIN");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("X-XSS-Protection", "0");
    c.header("Strict-Transport-Security", "max-age=15552000");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    c.header("Cache-Control", "no-store");
    await next();
  };
}

// CORS + CSRF origin check. Allowed origins come from ALLOWED_ORIGINS env.
export function corsSecurity(allowedOrigins?: string[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const origins = allowedOrigins ?? (c.env.ALLOWED_ORIGINS ?? "http://localhost:3000").split(",").map((s) => s.trim());
    const origin = c.req.header("Origin");
    const allowAll = origins.includes("*");

    if (origin) {
      const isAllowed = allowAll || origins.includes(origin) || origins.some((o) => o !== "*" && origin.startsWith(o.replace(/\/$/, "")));
      if (!isAllowed) {
        // Unknown origin: deny credentials, still serve public data
        c.header("Access-Control-Allow-Origin", "null");
      } else {
        c.header("Access-Control-Allow-Origin", origin);
        c.header("Vary", "Origin");
        c.header("Access-Control-Allow-Credentials", "true");
        c.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
        c.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      }
    }

    if (c.req.method === "OPTIONS") {
      return c.newResponse(null, { status: 204 });
    }

    // CSRF protection on state-changing requests: reject mismatched Origin/Referer.
    if (["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) {
      const ref = c.req.header("Referer") || c.req.header("Origin");
      if (ref && origin && origin !== ref.replace(/\/$/, "").split("/").slice(0, 3).join("/")) {
        return c.newResponse("Forbidden", { status: 403 });
      }
    }

    await next();
  };
}
