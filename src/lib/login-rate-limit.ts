const encoder = new TextEncoder();

export const LOGIN_WINDOW_SECONDS = 15 * 60;
export const LOGIN_MAX_ATTEMPTS = 5;

export function clientIp(request: Request): string {
  const cloudflare = request.headers.get('cf-connecting-ip');
  if (cloudflare) return cloudflare.trim();

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  return 'unknown';
}

export async function hashClientIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`bdcommerce-ip:${ip}`),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function isLoginRateLimited(
  db: D1Database,
  ipHash: string,
  now = Date.now(),
): Promise<boolean> {
  const cutoff = new Date(now - LOGIN_WINDOW_SECONDS * 1000).toISOString();
  const row = await db
    .prepare(
      'SELECT COUNT(*) AS count FROM login_attempts WHERE ip_hash = ? AND attempted_at >= ?',
    )
    .bind(ipHash, cutoff)
    .first<{ count: number }>();

  return (row?.count ?? 0) >= LOGIN_MAX_ATTEMPTS;
}

export async function recordLoginFailure(
  db: D1Database,
  ipHash: string,
  now = Date.now(),
): Promise<void> {
  const attemptedAt = new Date(now).toISOString();
  const cutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  await db.batch([
    db
      .prepare('INSERT INTO login_attempts (ip_hash, attempted_at) VALUES (?, ?)')
      .bind(ipHash, attemptedAt),
    db.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').bind(cutoff),
  ]);
}

export async function clearLoginFailures(
  db: D1Database,
  ipHash: string,
): Promise<void> {
  await db.prepare('DELETE FROM login_attempts WHERE ip_hash = ?').bind(ipHash).run();
}
