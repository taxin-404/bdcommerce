import { normalizePhone } from './phone';

export interface BlocklistRow {
  phone: string;
  reason: string | null;
  created_at: string;
}

/**
 * Adds a phone to the blocklist. Checkout rejects blocked phones before any
 * order or stock write happens.
 */
export async function blockPhone(input: {
  db: D1Database;
  phone: string;
  reason?: string | null;
  now?: string;
}): Promise<{ phone: string } | null> {
  const phone = normalizePhone(input.phone);
  if (!phone) return null;

  const now = input.now ?? new Date().toISOString();
  await input.db
    .prepare(
      `INSERT INTO blocklist (phone, reason, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(phone) DO UPDATE SET
         reason = excluded.reason,
         created_at = excluded.created_at`,
    )
    .bind(phone, input.reason?.trim() || null, now)
    .run();

  return { phone };
}

export async function unblockPhone(db: D1Database, value: string): Promise<boolean> {
  const phone = normalizePhone(value);
  if (!phone) return false;

  const result = await db.prepare('DELETE FROM blocklist WHERE phone = ?').bind(phone).run();
  return (result.meta?.changes ?? 0) > 0;
}

/** The blocklist is small; ordering by the primary key keeps this indexed. */
export async function listBlocklist(db: D1Database, limit = 100): Promise<BlocklistRow[]> {
  const { results } = await db
    .prepare(
      `SELECT phone, reason, created_at
         FROM blocklist
        ORDER BY phone
        LIMIT ?`,
    )
    .bind(limit)
    .all<BlocklistRow>();
  return results;
}

/** Marks a phone as requiring advance payment instead of COD. */
export async function setPhoneFlag(input: {
  db: D1Database;
  phone: string;
  reason?: string | null;
  now?: string;
}): Promise<{ phone: string } | null> {
  const phone = normalizePhone(input.phone);
  if (!phone) return null;

  const now = input.now ?? new Date().toISOString();
  await input.db
    .prepare(
      `INSERT INTO phone_flags (phone, reason, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(phone) DO UPDATE SET
         reason = excluded.reason,
         created_at = excluded.created_at`,
    )
    .bind(phone, input.reason?.trim() || null, now)
    .run();

  return { phone };
}

export async function clearPhoneFlag(db: D1Database, value: string): Promise<boolean> {
  const phone = normalizePhone(value);
  if (!phone) return false;

  const result = await db.prepare('DELETE FROM phone_flags WHERE phone = ?').bind(phone).run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function listPhoneFlags(db: D1Database, limit = 100): Promise<BlocklistRow[]> {
  const { results } = await db
    .prepare(
      `SELECT phone, reason, created_at
         FROM phone_flags
        ORDER BY phone
        LIMIT ?`,
    )
    .bind(limit)
    .all<BlocklistRow>();
  return results;
}
