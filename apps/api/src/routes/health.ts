import { Hono } from "hono";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { ok } from "../lib/http";
import { getSiteSettings } from "../lib/settings";

export const healthRoutes = new Hono<AppEnv>().get("/", async (c) => {
  let dbOk = false;
  try {
    await c.env.DB.prepare("SELECT 1").all();
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const site = await getSiteSettings(getDb(c.env), c.env).catch(() => null);
  return ok(c, {
    status: dbOk ? "ok" : "degraded",
    database: dbOk ? "ok" : "down",
    time: Date.now(),
    site: site?.name ?? "unknown",
    env: c.env.ENVIRONMENT ?? "dev",
  });
});
