import { normalizePhone } from './phone';

/**
 * Adds a phone to the blocklist. Enforcement happens at checkout in Phase 7;
 * this only records the admin decision.
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
