const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SESSION_INFO = encoder.encode('bdcommerce/admin-session/v1');
const SALT_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const ADMIN_COOKIE_NAME = 'admin_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface AdminSession {
  v: 1;
  iat: number;
  exp: number;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sha256(value: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

export function parseCookieHeader(header: string | null, name: string): string | null {
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;

    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  return null;
}

export async function constantTimeEqual(first: string, second: string): Promise<boolean> {
  const [firstHash, secondHash] = await Promise.all([sha256(first), sha256(second)]);
  let difference = 0;
  for (let index = 0; index < firstHash.length; index += 1) {
    difference |= firstHash[index] ^ secondHash[index];
  }
  return difference === 0;
}

async function readSalt(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .bind('session_salt')
    .first<{ value: string }>();
  return row?.value ?? null;
}

function isValidSalt(salt: string | null): salt is string {
  return salt !== null && SALT_PATTERN.test(salt);
}

export async function readSessionSalt(db: D1Database): Promise<string | null> {
  const salt = await readSalt(db);
  return isValidSalt(salt) ? salt : null;
}

export async function getOrCreateSessionSalt(db: D1Database): Promise<string> {
  const existing = await readSalt(db);
  if (isValidSalt(existing)) return existing;

  const salt = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  await db
    .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .bind('session_salt', salt)
    .run();

  const stored = await readSalt(db);
  if (!isValidSalt(stored)) throw new Error('Could not create the session salt');
  return stored;
}

export async function deriveSessionKey(
  passphrase: string,
  salt: string,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'HKDF',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: base64UrlToBytes(salt),
      info: SESSION_INFO,
    },
    baseKey,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign', 'verify'],
  );
}

function isAdminSession(value: unknown): value is AdminSession {
  if (typeof value !== 'object' || value === null) return false;
  const session = value as Partial<AdminSession>;
  return (
    session.v === 1 &&
    typeof session.iat === 'number' &&
    Number.isFinite(session.iat) &&
    typeof session.exp === 'number' &&
    Number.isFinite(session.exp)
  );
}

export async function createSessionCookie(
  db: D1Database,
  passphrase: string,
  now = Date.now(),
): Promise<string> {
  const salt = await getOrCreateSessionSalt(db);
  const key = await deriveSessionKey(passphrase, salt);
  const issuedAt = Math.floor(now / 1000);
  const session: AdminSession = {
    v: 1,
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS,
  };

  const payload = bytesToBase64Url(encoder.encode(JSON.stringify(session)));
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(payload)),
  );

  return `${payload}.${bytesToBase64Url(signature)}`;
}

export async function verifySessionCookie(
  cookieValue: string,
  db: D1Database,
  passphrase: string,
  now = Date.now(),
): Promise<AdminSession | null> {
  if (!cookieValue || !passphrase) return null;

  const separator = cookieValue.lastIndexOf('.');
  if (separator <= 0) return null;

  const payload = cookieValue.slice(0, separator);
  const signature = cookieValue.slice(separator + 1);
  if (!payload || !signature) return null;

  const salt = await readSessionSalt(db);
  if (!salt) return null;

  const key = await deriveSessionKey(passphrase, salt);

  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    signatureBytes = base64UrlToBytes(signature);
  } catch {
    return null;
  }

  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(payload),
  );
  if (!valid) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(base64UrlToBytes(payload))) as unknown;
  } catch {
    return null;
  }

  if (!isAdminSession(parsed)) return null;
  if (parsed.exp <= Math.floor(now / 1000)) return null;
  return parsed;
}
