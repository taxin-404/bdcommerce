import { describe, expect, it } from 'vitest';
import { formatOrderAddress } from '../../src/lib/address';

describe('formatOrderAddress', () => {
  it('does not repeat localities already in the street address', () => {
    expect(
      formatOrderAddress({
        address: 'House 12, Road 5, Savar',
        upazila: 'Savar',
        district: 'Dhaka',
        division: 'Dhaka',
      }),
    ).toBe('House 12, Road 5, Savar, Dhaka');
  });

  it('adds the locality chain when the street address does not contain it', () => {
    expect(
      formatOrderAddress({
        address: 'House 1, Road 2',
        upazila: 'Savar',
        district: 'Dhaka',
        division: 'Dhaka',
      }),
    ).toBe('House 1, Road 2, Savar, Dhaka');
  });

  it('handles missing optional parts', () => {
    expect(formatOrderAddress({ address: 'House 1' })).toBe('House 1');
    expect(
      formatOrderAddress({ address: 'House 1', district: 'Cumilla', division: 'Chattogram' }),
    ).toBe('House 1, Cumilla, Chattogram');
  });
});
