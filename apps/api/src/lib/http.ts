import type { Context } from "hono";
import type { AppEnv } from "../env";

// ---------------------------------------------------------------------------
// Standard response envelope
//   Success: { ok: true, data, meta? }
//   Error:   { ok: false, error, message, details? }
// ---------------------------------------------------------------------------

export function ok(c: Context<AppEnv>, data: unknown, meta?: Record<string, unknown>, status = 200) {
  return c.json({ ok: true, data, meta }, status as any);
}

export function fail(c: Context<AppEnv>, status: number, message: string, error = message, details?: unknown) {
  return c.json({ ok: false, error, message, details }, status as any);
}

export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function notFound(c: Context<AppEnv>) {
  return fail(c, 404, "Not found");
}

export function badRequest(c: Context<AppEnv>, message: string, details?: unknown) {
  return fail(c, 400, message, "Validation error", details);
}

export function unauthorized(c: Context<AppEnv>, message = "Unauthorized") {
  return fail(c, 401, message);
}

export function forbidden(c: Context<AppEnv>, message = "Forbidden") {
  return fail(c, 403, message);
}
