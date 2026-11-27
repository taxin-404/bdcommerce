import { describe, expect, it } from 'vitest';
import { isValidPhone, normalizePhone } from '../../src/lib/phone';

describe('normalizePhone', () => {
  it.each([
    ['01712345678', '01712345678'],
    ['+8801712345678', '01712345678'],
    ['8801712345678', '01712345678'],
    ['01712-345678', '01712345678'],
    [' 01712 345678 ', '01712345678'],
    ['(017) 1234-5678', '01712345678'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    '01234567890',
    '0171234567',
    '017123456789',
    '+880171234567',
    '0171234567a',
    '',
  ])('rejects %s', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe('isValidPhone', () => {
  it('returns true for a valid number in any accepted format', () => {
    expect(isValidPhone('+8801712345678')).toBe(true);
  });

  it('returns false for an invalid number', () => {
    expect(isValidPhone('01234567890')).toBe(false);
  });
});
