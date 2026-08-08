// Fixed-window rate limiting backed by D1 (100k writes/day on the free tier —
// far friendlier than KV's 1000 writes/day). Falls back to a no-op limiter
// when no database is available.

export interface RateLimiterOptions {
  db: D1Database | null;
  key: string;
  limit: number;
  windowSeconds: number;
  now?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

export async function rateLimit(opts: RateLimiterOptions): Promise<RateLimitResult> {
  const now = opts.now ?? Date.now();
  const windowStart = Math.floor(now / 1000 / opts.windowSeconds) * opts.windowSeconds * 1000;

  if (!opts.db) {
    return { allowed: true, remaining: opts.limit, retryAfter: 0 };
  }

  try {
    await opts.db
      .prepare(
        `INSERT INTO rate_limit_entries (key, window_start, count)
         VALUES (?, ?, 1)
         ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1`,
      )
      .bind(opts.key, windowStart)
      .run();

    const row = await opts.db
      .prepare(
        `SELECT count AS c FROM rate_limit_entries
         WHERE key = ? AND window_start = ?`,
      )
      .bind(opts.key, windowStart)
      .first<{ c: number }>();

    const used = row?.c ?? 0;
    const remaining = Math.max(0, opts.limit - used);
    const allowed = used <= opts.limit;

    // Opportunistic cleanup of expired windows (keeps table small on free tier)
    if (Math.random() < 0.05) {
      await opts.db
        .prepare(`DELETE FROM rate_limit_entries WHERE window_start < ?`)
        .bind(windowStart - opts.windowSeconds * 1000 * 60)
        .run();
    }

    return {
      allowed,
      remaining,
      retryAfter: allowed ? 0 : Math.max(1, Math.ceil((windowStart + opts.windowSeconds * 1000 - now) / 1000)),
    };
  } catch {
    // Fail open: never let rate limiting break the store.
    return { allowed: true, remaining: opts.limit, retryAfter: 0 };
  }
}
