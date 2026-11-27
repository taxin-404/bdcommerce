import { describe, expect, it } from 'vitest';
import { formatBdt, toBanglaDigits } from '../../src/lib/money';

describe('toBanglaDigits', () => {
  it('maps every ASCII digit to its Bangla counterpart', () => {
    expect(toBanglaDigits('0123456789')).toBe('০১২৩৪৫৬৭৮৯');
  });

  it('accepts a number as well as a string', () => {
    expect(toBanglaDigits(2026)).toBe('২০২৬');
  });
});

describe('formatBdt', () => {
  it('formats zero', () => {
    expect(formatBdt(0)).toBe('৳০');
  });

  it('uses Indian digit grouping', () => {
    expect(formatBdt(999)).toBe('৳৯৯৯');
    expect(formatBdt(1000)).toBe('৳১,০০০');
    expect(formatBdt(123456)).toBe('৳১,২৩,৪৫৬');
    expect(formatBdt(12345678)).toBe('৳১,২৩,৪৫,৬৭৮');
  });

  it('formats English digits when asked', () => {
    expect(formatBdt(123456, { locale: 'en' })).toBe('৳1,23,456');
  });

  it('can omit the currency symbol', () => {
    expect(formatBdt(1234, { withSymbol: false })).toBe('১,২৩৪');
  });

  it('rounds to whole taka', () => {
    expect(formatBdt(1234.5)).toBe('৳১,২৩৫');
  });

  it('puts a negative sign before the symbol', () => {
    expect(formatBdt(-1234)).toBe('-৳১,২৩৪');
  });

  it('rejects non-finite amounts', () => {
    expect(() => formatBdt(Number.NaN)).toThrow(RangeError);
    expect(() => formatBdt(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
