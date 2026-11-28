import { loadConfigFromRows, type SiteConfig } from './config';
import { ORDER_SUMMARY_COLUMNS, type OrderSummaryRow } from './orders';

export const ORDER_RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const IP_HASH_SALT_KEY = 'ip_hash_salt';

interface SettingRow {
  key: string;
  value: string;
}

export interface CheckoutContext {
  config: SiteConfig;
  settings: SettingRow[];
  blocked: boolean;
  advancePaymentRequired: boolean;
  phoneOrders24h: number;
  existing: OrderSummaryRow | null;
}

/**
 * One D1 batch for everything checkout needs before pricing: settings, the
 * blocklist, the advance-payment flag, the last-24h phone count, and an
 * idempotent retry. Keeping the retry in the same batch means a repeat costs
 * one round trip instead of two.
 */
export async function loadCheckoutContext(input: {
  db: D1Database;
  phone: string;
  idempotencyKey: string;
  now?: string;
}): Promise<CheckoutContext> {
  const now = input.now ?? new Date().toISOString();
  const since = new Date(Date.parse(now) - ORDER_RATE_WINDOW_MS).toISOString();

  const results = await input.db.batch([
    input.db.prepare('SELECT key, value FROM settings'),
    input.db.prepare('SELECT 1 AS found FROM blocklist WHERE phone = ? LIMIT 1').bind(input.phone),
    input.db.prepare('SELECT 1 AS found FROM phone_flags WHERE phone = ? LIMIT 1').bind(input.phone),
    input.db
      .prepare('SELECT COUNT(*) AS count FROM orders WHERE phone = ? AND created_at >= ?')
      .bind(input.phone, since),
    input.db
      .prepare(`SELECT ${ORDER_SUMMARY_COLUMNS} FROM orders WHERE idempotency_key = ? LIMIT 1`)
      .bind(input.idempotencyKey),
  ]);

  const settings = (results[0]?.results ?? []) as SettingRow[];
  const phoneCount = (results[3]?.results?.[0] as { count?: number } | undefined)?.count ?? 0;

  return {
    config: loadConfigFromRows(settings),
    settings,
    blocked: (results[1]?.results?.length ?? 0) > 0,
    advancePaymentRequired: (results[2]?.results?.length ?? 0) > 0,
    phoneOrders24h: Number(phoneCount),
    existing: (results[4]?.results?.[0] as OrderSummaryRow | undefined) ?? null,
  };
}

function parseSalt(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === 'string' && parsed.trim().length >= 32) return parsed.trim();
  } catch {
    // Older/raw values are accepted below.
  }
  return value.trim().length >= 32 ? value.trim() : null;
}

function randomSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let salt = '';
  for (const byte of bytes) salt += byte.toString(16).padStart(2, '0');
  return salt;
}

/**
 * The migration seeds the salt for new and existing installs. This fallback
 * covers a manually restored settings table; it writes only when the row is
 * genuinely missing, never on normal checkouts.
 */
export async function ensureIpHashSalt(
  db: D1Database,
  settings: SettingRow[],
): Promise<string> {
  const existing = parseSalt(settings.find((row) => row.key === IP_HASH_SALT_KEY)?.value);
  if (existing) return existing;

  await db
    .prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
    .bind(IP_HASH_SALT_KEY, JSON.stringify(randomSalt()))
    .run();

  const row = await db
    .prepare('SELECT value FROM settings WHERE key = ? LIMIT 1')
    .bind(IP_HASH_SALT_KEY)
    .first<{ value: string }>();
  const salt = parseSalt(row?.value);
  if (!salt) throw new Error('Could not create the IP hash salt');
  return salt;
}

/** SHA-256(salt + ":" + normalized IP), hex encoded. The raw IP is never stored. */
export async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip.trim().toLowerCase()}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let hash = '';
  for (const byte of bytes) hash += byte.toString(16).padStart(2, '0');
  return hash;
}

export async function countRecentIpOrders(
  db: D1Database,
  ipHash: string,
  now = new Date().toISOString(),
): Promise<number> {
  const since = new Date(Date.parse(now) - ORDER_RATE_WINDOW_MS).toISOString();
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM orders WHERE ip_hash = ? AND created_at >= ?')
    .bind(ipHash, since)
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export function fraudLimitReached(config: SiteConfig, count: number, limit: number): boolean {
  return config.fraud.enabled && count >= limit;
}
