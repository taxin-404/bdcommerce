import { describe, expect, it } from 'vitest';
import {
  BD_GEO,
  findDivision,
  localizedGeoName,
  resolveGeoSelection,
  shippingZoneForDistrict,
} from '../../src/lib/geo';

describe('bd-geo dataset', () => {
  it('has the expected national counts', () => {
    expect(BD_GEO.divisions).toHaveLength(8);
    expect(BD_GEO.divisions.reduce((total, division) => total + division.districts.length, 0)).toBe(
      64,
    );
    expect(
      BD_GEO.divisions.reduce(
        (total, division) =>
          total +
          division.districts.reduce(
            (subtotal, district) => subtotal + district.upazilas.length,
            0,
          ),
        0,
      ),
    ).toBe(495);
    for (const division of BD_GEO.divisions) {
      expect(division.districts.length).toBeGreaterThan(0);
      for (const district of division.districts) {
        expect(district.upazilas.length).toBeGreaterThan(0);
      }
    }
  });

  it('spot-checks known division/district/upazila chains', () => {
    const checks: Array<[string, string, string]> = [
      ['Dhaka', 'Dhaka', 'Savar'],
      ['Dhaka', 'Dhaka', 'Dhamrai'],
      ['Dhaka', 'Dhaka', 'Keraniganj'],
      ['Chattogram', 'Chattogram', 'Anwara'],
      ['Chattogram', "Cox's Bazar", 'Teknaf'],
      ['Chattogram', 'Cumilla', 'Debidwar'],
      ['Sylhet', 'Sylhet', 'Beanibazar'],
      ['Khulna', 'Khulna', 'Dumuria'],
      ['Rajshahi', 'Rajshahi', 'Puthia'],
      ['Barishal', 'Barishal', 'Bakerganj'],
      ['Rangpur', 'Rangpur', 'Badarganj'],
      ['Mymensingh', 'Mymensingh', 'Bhaluka'],
    ];

    for (const [division, district, upazila] of checks) {
      expect(
        resolveGeoSelection({ division, district, upazila }),
        `${division} > ${district} > ${upazila}`,
      ).not.toBeNull();
    }
  });

  it('rejects mismatched hierarchies and unknown names', () => {
    expect(
      resolveGeoSelection({ division: 'Chattogram', district: 'Dhaka', upazila: 'Savar' }),
    ).toBeNull();
    expect(
      resolveGeoSelection({ division: 'Dhaka', district: 'Dhaka', upazila: 'Teknaf' }),
    ).toBeNull();
    expect(
      resolveGeoSelection({ division: 'Atlantis', district: 'Dhaka', upazila: 'Savar' }),
    ).toBeNull();
  });

  it('localizes names and derives the delivery zone from the district', () => {
    const dhaka = findDivision('Dhaka');
    expect(dhaka).toBeDefined();
    expect(localizedGeoName(dhaka!, 'bn')).toBe('ঢাকা');
    expect(localizedGeoName(dhaka!, 'en')).toBe('Dhaka');

    const zones = [
      { id: 'dhaka', label: { en: 'Inside Dhaka', bn: 'ঢাকার ভিতরে' }, fee: 60 },
      { id: 'outside', label: { en: 'Outside Dhaka', bn: 'ঢাকার বাইরে' }, fee: 120 },
    ];
    expect(shippingZoneForDistrict(zones, 'Dhaka').id).toBe('dhaka');
    expect(shippingZoneForDistrict(zones, 'Cumilla').id).toBe('outside');
    expect(shippingZoneForDistrict(zones, "Cox's Bazar").id).toBe('outside');
  });
});
