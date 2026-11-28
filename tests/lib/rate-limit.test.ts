import { afterEach, describe, expect, it } from 'vitest';
import { hitRateLimit, rateLimitKey, resetRateLimits } from '../../src/lib/rate-limit';

afterEach(() => resetRateLimits());

describe('hitRateLimit', () => {
  it('allows requests up to the limit inside the window', () => {
    const key = rateLimitKey('test', '1.2.3.4');
    expect(hitRateLimit(key, 2, 60_000, 0).allowed).toBe(true);
    expect(hitRateLimit(key, 2, 60_000, 0).allowed).toBe(true);
    const blocked = hitRateLimit(key, 2, 60_000, 0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('resets after the window passes', () => {
    const key = rateLimitKey('test', '1.2.3.4');
    hitRateLimit(key, 1, 1_000, 0);
    expect(hitRateLimit(key, 1, 1_000, 500).allowed).toBe(false);
    expect(hitRateLimit(key, 1, 1_000, 1_000).allowed).toBe(true);
  });

  it('never puts a raw value in the map key', () => {
    const key = rateLimitKey('coupon-check', '203.0.113.99');
    expect(key.startsWith('coupon-check:')).toBe(true);
    expect(key).not.toContain('203.0.113.99');
  });

  it('disables the limiter when the limit is zero', () => {
    const key = rateLimitKey('test', 'x');
    for (let index = 0; index < 100; index += 1) {
      expect(hitRateLimit(key, 0, 60_000, 0).allowed).toBe(true);
    }
  });
});
