#!/usr/bin/env node
/**
 * Generates src/data/bd-geo.json from the open `nuhil/bangladesh-geocode`
 * dataset (MIT). The source mirrors the Bangladesh Bureau of Statistics
 * geo-codes (8 divisions, 64 districts, 495 upazilas).
 *
 * Usage: node scripts/generate-bd-geo.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_COMMIT = 'c4b950b5cd2a65d42d75b12f7fad459e12777df6';
const SOURCE = {
  name: 'nuhil/bangladesh-geocode',
  url: `https://github.com/nuhil/bangladesh-geocode/tree/${SOURCE_COMMIT}`,
  commit: SOURCE_COMMIT,
  license: 'MIT',
  copyright: 'Copyright (c) 2014 Nuhil Mehdy',
  note: 'Division/district/upazila names and BBS geo-codes.',
};

const BASE_URL = `https://raw.githubusercontent.com/nuhil/bangladesh-geocode/${SOURCE_COMMIT}`;

async function readTable(path) {
  const response = await fetch(`${BASE_URL}/${path}`);
  if (!response.ok) throw new Error(`Failed to fetch ${path}: ${response.status}`);

  const payload = await response.json();
  const table = Array.isArray(payload)
    ? payload.find((entry) => entry?.type === 'table')
    : null;
  if (!table || !Array.isArray(table.data)) {
    throw new Error(`Unexpected dataset shape in ${path}`);
  }
  return table.data;
}

const [divisions, districts, upazilas] = await Promise.all([
  readTable('divisions/divisions.json'),
  readTable('districts/districts.json'),
  readTable('upazilas/upazilas.json'),
]);

const upazilasByDistrict = new Map();
for (const upazila of upazilas) {
  const list = upazilasByDistrict.get(String(upazila.district_id)) ?? [];
  list.push({
    id: String(upazila.id),
    name: upazila.name,
    nameBn: upazila.bn_name,
  });
  upazilasByDistrict.set(String(upazila.district_id), list);
}

const districtsByDivision = new Map();
for (const district of districts) {
  const list = districtsByDivision.get(String(district.division_id)) ?? [];
  list.push({
    id: String(district.id),
    name: district.name,
    nameBn: district.bn_name,
    upazilas: upazilasByDistrict.get(String(district.id)) ?? [],
  });
  districtsByDivision.set(String(district.division_id), list);
}

const output = {
  source: { ...SOURCE, retrieved: new Date().toISOString().slice(0, 10) },
  divisions: divisions.map((division) => ({
    id: String(division.id),
    name: division.name,
    nameBn: division.bn_name,
    districts: districtsByDivision.get(String(division.id)) ?? [],
  })),
};

const districtCount = districts.length;
const upazilaCount = upazilas.length;
if (divisions.length !== 8 || districtCount !== 64 || upazilaCount !== 495) {
  throw new Error(
    `Unexpected counts: ${divisions.length} divisions, ${districtCount} districts, ${upazilaCount} upazilas`,
  );
}

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'src', 'data', 'bd-geo.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(output)}\n`, 'utf8');
console.log(
  `Wrote ${target}: ${divisions.length} divisions, ${districtCount} districts, ${upazilaCount} upazilas.`,
);
