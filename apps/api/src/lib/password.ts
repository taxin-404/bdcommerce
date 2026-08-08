// PBKDF2-SHA256 password hashing via WebCrypto (edge-safe, zero deps).
// Format: pbkdf2$sha256$<iterations>$<saltHex>$<hashHex>

const ITERATIONS = 120_000;
const KEY_LENGTH = 32;

const enc = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function derive(password: string, salt: Uint8Array, iterations: number, length: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    keyMaterial,
    length * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await derive(password, salt, ITERATIONS, KEY_LENGTH);
  return `pbkdf2$sha256$${ITERATIONS}$${toHex(salt)}$${toHex(key)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2") return false;
  const [, , iterationsStr, saltHex, hashHex] = parts;
  const iterations = parseInt(iterationsStr!, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const expected = fromHex(hashHex!);
  const actual = await derive(password, fromHex(saltHex!), iterations, expected.length);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}
