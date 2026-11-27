import { describe, expect, it } from 'vitest';
import {
  dhakaDayRange,
  dhakaWeekRange,
  formatDhakaDate,
  parseDhakaDate,
  todayDhakaInput,
} from '../../src/lib/dhaka-time';

describe('Asia/Dhaka day ranges', () => {
  it('uses the Dhaka day that contains the UTC instant', () => {
    expect(dhakaDayRange(new Date('2026-11-27T10:00:00.000Z'))).toEqual({
      startIso: '2026-11-26T18:00:00.000Z',
      endIso: '2026-11-27T18:00:00.000Z',
    });
  });

  it('rolls over at 18:00 UTC (midnight Dhaka)', () => {
    expect(dhakaDayRange(new Date('2026-11-27T20:00:00.000Z'))).toEqual({
      startIso: '2026-11-27T18:00:00.000Z',
      endIso: '2026-11-28T18:00:00.000Z',
    });
  });

  it('uses Saturday as the start of the Dhaka week', () => {
    // 2026-11-27 is a Friday in Dhaka.
    expect(dhakaWeekRange(new Date('2026-11-27T10:00:00.000Z'))).toEqual({
      startIso: '2026-11-20T18:00:00.000Z',
      endIso: '2026-11-27T18:00:00.000Z',
    });
  });
});

describe('parseDhakaDate', () => {
  it('returns the UTC half-open range for a Dhaka calendar day', () => {
    expect(parseDhakaDate('2026-11-27')).toEqual({
      startIso: '2026-11-26T18:00:00.000Z',
      endIso: '2026-11-27T18:00:00.000Z',
    });
  });

  it('rejects impossible and malformed dates', () => {
    expect(parseDhakaDate('2026-02-30')).toBeNull();
    expect(parseDhakaDate('27-11-2026')).toBeNull();
    expect(parseDhakaDate('')).toBeNull();
  });

  it('formats today as a Dhaka date input value', () => {
    expect(todayDhakaInput(new Date('2026-11-27T20:00:00.000Z'))).toBe('2026-11-28');
  });
});

describe('formatDhakaDate', () => {
  it('renders the Dhaka calendar date, not the UTC date', () => {
    expect(formatDhakaDate('2026-11-27T20:00:00.000Z', 'en')).toContain('28');
  });
});
