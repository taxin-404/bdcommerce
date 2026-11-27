import { describe, expect, it } from 'vitest';
import {
  LOGIN_MAX_ATTEMPTS,
  clearLoginFailures,
  clientIp,
  hashClientIp,
  isLoginRateLimited,
  recordLoginFailure,
} from '../../src/lib/login-rate-limit';

function fakeDb(count: number) {
  const calls: unknown[][] = [];

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          calls.push([sql, ...args]);
          return {
            async first() {
              return { count };
            },
            async run() {
              return { success: true };
            },
          };
        },
      };
    },
    async batch(statements: unknown[]) {
      calls.push(['batch', statements.length]);
      return [];
    },
  } as unknown as D1Database;

  return { db, calls };
}

describe('clientIp', () => {
  it('prefers the Cloudflare connecting IP', () => {
    const request = new Request('https://shop.example/admin', {
      headers: {
        'cf-connecting-ip': '203.0.113.9',
        'x-forwarded-for': '198.51.100.1, 198.51.100.2',
      },
    });

    expect(clientIp(request)).toBe('203.0.113.9');
  });

  it('falls back to the first forwarded address', () => {
    const request = new Request('https://shop.example/admin', {
      headers: { 'x-forwarded-for': '198.51.100.1, 198.51.100.2' },
    });

    expect(clientIp(request)).toBe('198.51.100.1');
  });

  it('uses a stable placeholder when no address is present', () => {
    expect(clientIp(new Request('https://shop.example/admin'))).toBe('unknown');
  });
});

describe('hashClientIp', () => {
  it('is deterministic and does not contain the raw address', async () => {
    const first = await hashClientIp('203.0.113.9');
    const second = await hashClientIp('203.0.113.9');

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain('203.0.113.9');
  });

  it('changes for a different address', async () => {
    expect(await hashClientIp('203.0.113.9')).not.toBe(await hashClientIp('203.0.113.10'));
  });
});

describe('isLoginRateLimited', () => {
  it('allows attempts below the limit', async () => {
    const { db } = fakeDb(LOGIN_MAX_ATTEMPTS - 1);

    expect(await isLoginRateLimited(db, 'hash')).toBe(false);
  });

  it('blocks attempts at the limit', async () => {
    const { db } = fakeDb(LOGIN_MAX_ATTEMPTS);

    expect(await isLoginRateLimited(db, 'hash')).toBe(true);
  });
});

describe('failure tracking', () => {
  it('records a failure and prunes old rows in one batch', async () => {
    const { db, calls } = fakeDb(0);

    await recordLoginFailure(db, 'hash');

    expect(calls).toContainEqual(['batch', 2]);
  });

  it('clears failures for an address', async () => {
    const { db, calls } = fakeDb(0);

    await clearLoginFailures(db, 'hash');

    expect(calls.some(([sql]) => String(sql).includes('DELETE FROM login_attempts'))).toBe(true);
  });
});
