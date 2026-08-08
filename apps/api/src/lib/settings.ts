import { eq } from "drizzle-orm";
import { settings } from "@bd/db";
import type { Db } from "../db";
import type { Env } from "../env";

const CACHE_PREFIX = "settings:";

export async function getSettingValue(db: Db, env: Env, key: string): Promise<Record<string, unknown>> {
  const cached = await env.KV.get(`${CACHE_PREFIX}${key}`).catch(() => null);
  if (cached) {
    try {
      return JSON.parse(cached) as Record<string, unknown>;
    } catch {
      // fall through to DB
    }
  }
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  const value = (rows[0]?.value ?? {}) as Record<string, unknown>;
  await env.KV.put(`${CACHE_PREFIX}${key}`, JSON.stringify(value), { expirationTtl: 60 }).catch(() => {});
  return value;
}

export async function setSettingValue(db: Db, env: Env, key: string, value: Record<string, unknown>) {
  const existing = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (existing[0]) {
    await db
      .update(settings)
      .set({ value, updatedAt: new Date() })
      .where(eq(settings.key, key));
  } else {
    await db.insert(settings).values({ key, value });
  }
  await env.KV.delete(`${CACHE_PREFIX}${key}`).catch(() => {});
}

// Defaults so the store works even before any settings are saved.
export const DEFAULT_SITE: Record<string, unknown> = {
  name: "BDCommerce",
  tagline: "Bangladesh's lightweight commerce engine",
  logo: "",
  favicon: "",
  currency: "BDT",
  primaryColor: "#22c55e",
  secondaryColor: "#111827",
  accentColor: "#f59e0b",
  font: "Inter",
  borderRadius: 8,
  darkMode: false,
};

export async function getSiteSettings(db: Db, env: Env) {
  const value = await getSettingValue(db, env, "site");
  return { ...DEFAULT_SITE, ...value };
}
