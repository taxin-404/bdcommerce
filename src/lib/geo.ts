import geo from '../data/bd-geo.json';
import type { Locale } from './i18n';

export interface GeoUpazila {
  id: string;
  name: string;
  nameBn: string;
}

export interface GeoDistrict {
  id: string;
  name: string;
  nameBn: string;
  upazilas: GeoUpazila[];
}

export interface GeoDivision {
  id: string;
  name: string;
  nameBn: string;
  districts: GeoDistrict[];
}

export interface GeoDataset {
  source: {
    name: string;
    url: string;
    commit: string;
    license: string;
    copyright: string;
    note: string;
    retrieved: string;
  };
  divisions: GeoDivision[];
}

export const BD_GEO = geo as GeoDataset;

export interface GeoSelection {
  division: GeoDivision;
  district: GeoDistrict;
  upazila: GeoUpazila;
}

function key(value: string): string {
  return value.trim().toLocaleLowerCase('en');
}

export function findDivision(name: string): GeoDivision | undefined {
  const wanted = key(name);
  return BD_GEO.divisions.find((division) => key(division.name) === wanted);
}

export function findDistrict(division: GeoDivision, name: string): GeoDistrict | undefined {
  const wanted = key(name);
  return division.districts.find((district) => key(district.name) === wanted);
}

export function findUpazila(district: GeoDistrict, name: string): GeoUpazila | undefined {
  const wanted = key(name);
  return district.upazilas.find((upazila) => key(upazila.name) === wanted);
}

/** Resolves the three-level hierarchy, or null when any level does not match. */
export function resolveGeoSelection(input: {
  division: string;
  district: string;
  upazila: string;
}): GeoSelection | null {
  const division = findDivision(input.division);
  if (!division) return null;

  const district = findDistrict(division, input.district);
  if (!district) return null;

  const upazila = findUpazila(district, input.upazila);
  if (!upazila) return null;

  return { division, district, upazila };
}

export function localizedGeoName(
  entry: { name: string; nameBn: string },
  locale: Locale,
): string {
  return locale === 'bn' && entry.nameBn.trim() ? entry.nameBn : entry.name;
}

/**
 * Delivery zone comes from the district, never from the client. The mapping
 * and fallback are editable in Settings; an unknown district always resolves
 * to the fallback zone, so every district has a fee.
 */
export function shippingZoneForDistrict<T extends { id: string }>(
  shipping: {
    zones: readonly T[];
    districtZones: Record<string, string>;
    fallbackZone: string;
  },
  district: string,
): T {
  const wanted = key(district);
  let preferred: string | undefined;
  for (const [name, zoneId] of Object.entries(shipping.districtZones)) {
    if (key(name) === wanted) {
      preferred = zoneId;
      break;
    }
  }

  const zone =
    shipping.zones.find((candidate) => candidate.id === preferred) ??
    shipping.zones.find((candidate) => candidate.id === shipping.fallbackZone) ??
    shipping.zones[0];
  if (!zone) throw new Error('At least one shipping zone is required');
  return zone;
}
