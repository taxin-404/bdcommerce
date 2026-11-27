import { describe, expect, it } from 'vitest';
import {
  MIN_ADMIN_PASSPHRASE_LENGTH,
  validateAdminPassphrase,
} from '../../src/lib/admin-passphrase';

describe('validateAdminPassphrase', () => {
  it('rejects missing values', () => {
    for (const value of [undefined, null, '', '   ']) {
      expect(validateAdminPassphrase(value)).toEqual({ ok: false, reason: 'missing' });
    }
  });

  it('rejects values shorter than 16 characters', () => {
    expect(validateAdminPassphrase('a'.repeat(MIN_ADMIN_PASSPHRASE_LENGTH - 1))).toEqual({
      ok: false,
      reason: 'short',
    });
  });

  it('rejects the old example passphrase', () => {
    expect(validateAdminPassphrase('replace-with-a-long-random-passphrase')).toEqual({
      ok: false,
      reason: 'weak',
    });
  });

  it('rejects known weak values case-insensitively and with surrounding spaces', () => {
    for (const value of [
      'password',
      'PASSWORD',
      ' changeme ',
      'admin123',
      'your-passphrase',
      'passwordpassword',
      'adminadminadmin',
      'local-test-passphrase-123',
    ]) {
      expect(validateAdminPassphrase(value)).toEqual({ ok: false, reason: 'weak' });
    }
  });

  it('rejects repeated characters and placeholder prefixes', () => {
    expect(validateAdminPassphrase('a'.repeat(20))).toEqual({ ok: false, reason: 'weak' });
    expect(validateAdminPassphrase('replace-this-with-something-random')).toEqual({
      ok: false,
      reason: 'weak',
    });
    expect(validateAdminPassphrase('placeholder-passphrase-123')).toEqual({
      ok: false,
      reason: 'weak',
    });
  });

  it('accepts a random passphrase of at least 16 characters', () => {
    const value = 'vN7#qL2!mR9@xT4$';
    expect(validateAdminPassphrase(value)).toEqual({ ok: true, passphrase: value });
  });

  it('accepts a 16-character Unicode passphrase', () => {
    const value = 'কমপক্ষে১৬অক্ষরেরপাসফ্রেজ';
    expect(validateAdminPassphrase(value).ok).toBe(true);
  });
});
