/**
 * Best-effort, per-isolate fixed-window limiter. It never touches D1, so a
 * burst of coupon checks or order-number guesses cannot burn the daily write
 * quota. Limits reset when the isolate is recycled.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 2_000;
const ISOLATE_SALT = crypto.randomUUID();

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Map keys never contain a raw IP address. */
export function rateLimitKey(scope: string, value: string): string {
  return `${scope}:${fnv1a(`${ISOLATE_SALT}:${value}`)}`;
}

function prune(now: number): void {
  if (buckets.size <= MAX_BUCKETS) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size <= MAX_BUCKETS) return;

  for (const key of buckets.keys()) {
    buckets.delete(key);
    if (buckets.size <= MAX_BUCKETS) break;
  }
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
}

export function hitRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  if (limit <= 0) return { allowed: true, retryAfter: 0 };

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    prune(now);
    return { allowed: true, retryAfter: 0 };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { allowed: true, retryAfter: 0 };
}

/** Test helper; also useful after a deploy-free local restart. */
export function resetRateLimits(): void {
  buckets.clear();
}
