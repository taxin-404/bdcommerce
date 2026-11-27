export const MIN_ADMIN_PASSPHRASE_LENGTH = 16;

export type AdminPassphraseProblem = 'missing' | 'short' | 'weak';

export type AdminPassphraseCheck =
  | { ok: true; passphrase: string }
  | { ok: false; reason: AdminPassphraseProblem };

const KNOWN_WEAK = new Set([
  'replace-with-a-long-random-passphrase',
  'replace-with-a-random-passphrase',
  'your-passphrase',
  'changeme',
  'change-me',
  'password',
  'password123',
  'passphrase',
  'passphrase123',
  'admin',
  'admin123',
  'administrator',
  'letmein',
  'secret',
  'secret123',
  'test',
  'test123',
  'test-passphrase-123',
  'local-test-passphrase-123',
  'example',
  'example-password',
  'placeholder',
  '1234567890123456',
  'qwertyuiopasdfgh',
]);

const PLACEHOLDER_PREFIX = /^(replace|change|your|example|placeholder)[-_ ]/;
const WEAK_PREFIX = /^(password|passphrase|admin|secret|test|changeme|change-me)/;
const REPEATED_CHARACTER = /^(.)\1+$/u;

/**
 * Rejects missing, too-short, and placeholder/known-weak admin passphrases
 * before any login attempt or session check can use them.
 */
export function validateAdminPassphrase(
  value: string | null | undefined,
): AdminPassphraseCheck {
  const passphrase = value ?? '';
  const trimmed = passphrase.trim();

  if (!trimmed) return { ok: false, reason: 'missing' };

  const normalized = trimmed.toLowerCase();
  if (
    KNOWN_WEAK.has(normalized) ||
    PLACEHOLDER_PREFIX.test(normalized) ||
    WEAK_PREFIX.test(normalized)
  ) {
    return { ok: false, reason: 'weak' };
  }

  if (Array.from(trimmed).length < MIN_ADMIN_PASSPHRASE_LENGTH) {
    return { ok: false, reason: 'short' };
  }

  if (REPEATED_CHARACTER.test(normalized)) {
    return { ok: false, reason: 'weak' };
  }

  return { ok: true, passphrase };
}
