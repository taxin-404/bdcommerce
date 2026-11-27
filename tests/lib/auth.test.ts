import { describe, expect, it } from 'vitest';
import {
  ADMIN_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  constantTimeEqual,
  createSessionCookie,
  getOrCreateSessionSalt,
  parseCookieHeader,
  readSessionSalt,
  verifySessionCookie,
} from '../../src/lib/auth';

function fakeDb(initial = new Map<string, string>()) {
  const store = new Map(initial);

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (sql.includes('SELECT value FROM settings')) {
                const value = store.get(String(args[0]));
                return value ? { value } : null;
              }
              return null;
            },
            async run() {
              if (sql.includes('INSERT') && sql.includes('INTO settings')) {
                const [key, value] = args as [string, string];
                if (sql.includes('OR REPLACE') || !store.has(key)) store.set(key, value);
              }
              return { success: true };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, store };
}

describe('parseCookieHeader', () => {
  it('extracts a named cookie', () => {
    expect(parseCookieHeader('a=1; admin_session=abc.def; b=2', ADMIN_COOKIE_NAME)).toBe(
      'abc.def',
    );
  });

  it('returns null when the cookie is absent', () => {
    expect(parseCookieHeader('a=1; b=2', ADMIN_COOKIE_NAME)).toBeNull();
    expect(parseCookieHeader(null, ADMIN_COOKIE_NAME)).toBeNull();
  });

  it('decodes URL-encoded values', () => {
    expect(parseCookieHeader('admin_session=a%2Eb', ADMIN_COOKIE_NAME)).toBe('a.b');
  });
});

describe('constantTimeEqual', () => {
  it('accepts identical strings', async () => {
    expect(await constantTimeEqual('correct horse', 'correct horse')).toBe(true);
  });

  it('rejects different strings, including different lengths', async () => {
    expect(await constantTimeEqual('correct horse', 'correct hors')).toBe(false);
    expect(await constantTimeEqual('correct horse', 'wrong horse')).toBe(false);
  });
});

describe('session salt', () => {
  const validSalt = 'A'.repeat(43);

  it('reads a valid existing salt', async () => {
    const { db } = fakeDb(new Map([['session_salt', validSalt]]));

    expect(await readSessionSalt(db)).toBe(validSalt);
  });

  it('ignores a corrupt salt instead of throwing', async () => {
    const { db } = fakeDb(new Map([['session_salt', 'not a valid salt']]));

    expect(await readSessionSalt(db)).toBeNull();
    expect(await verifySessionCookie('a.b', db, 'passphrase')).toBeNull();
  });

  it('replaces a corrupt salt on the next login', async () => {
    const { db, store } = fakeDb(new Map([['session_salt', 'broken']]));

    const salt = await getOrCreateSessionSalt(db);

    expect(salt).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(store.get('session_salt')).toBe(salt);
  });

  it('creates and persists a salt on first use', async () => {
    const { db, store } = fakeDb();

    const first = await getOrCreateSessionSalt(db);
    const second = await getOrCreateSessionSalt(db);

    expect(first).toBeTruthy();
    expect(second).toBe(first);
    expect(store.get('session_salt')).toBe(first);
  });

  it('does not create a salt when only verifying', async () => {
    const { db, store } = fakeDb();

    expect(await verifySessionCookie('a.b', db, 'passphrase')).toBeNull();
    expect(store.has('session_salt')).toBe(false);
  });
});

describe('session cookie', () => {
  it('round-trips a signed session', async () => {
    const { db } = fakeDb();
    const now = 1_700_000_000_000;

    const cookie = await createSessionCookie(db, 'passphrase', now);
    const session = await verifySessionCookie(cookie, db, 'passphrase', now + 1_000);

    expect(session).not.toBeNull();
    expect(session?.exp).toBe(Math.floor(now / 1000) + SESSION_TTL_SECONDS);
  });

  it('rejects the wrong passphrase', async () => {
    const { db } = fakeDb();
    const now = 1_700_000_000_000;
    const cookie = await createSessionCookie(db, 'passphrase', now);

    expect(await verifySessionCookie(cookie, db, 'wrong-passphrase', now + 1_000)).toBeNull();
  });

  it('rejects an expired session', async () => {
    const { db } = fakeDb();
    const now = 1_700_000_000_000;
    const cookie = await createSessionCookie(db, 'passphrase', now);

    const expiredAt = (SESSION_TTL_SECONDS + 1) * 1000 + now;
    expect(await verifySessionCookie(cookie, db, 'passphrase', expiredAt)).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const { db } = fakeDb();
    const now = 1_700_000_000_000;
    const cookie = await createSessionCookie(db, 'passphrase', now);
    const [, signature] = cookie.split('.');
    const tampered = `eyJ2IjoxfQ.${signature}`;

    expect(await verifySessionCookie(tampered, db, 'passphrase', now + 1_000)).toBeNull();
  });

  it('rejects malformed cookies', async () => {
    const { db } = fakeDb();

    expect(await verifySessionCookie('', db, 'passphrase')).toBeNull();
    expect(await verifySessionCookie('only-one-part', db, 'passphrase')).toBeNull();
  });
});
