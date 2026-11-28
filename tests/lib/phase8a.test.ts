import { describe, expect, it } from 'vitest';
import defaultConfig from '../../site.config';
import { settingsUpdateSchema } from '../../src/lib/admin-settings';
import {
  defaultConfig as configDefaults,
  loadConfigFromRows,
  mergeConfig,
  type SiteConfig,
} from '../../src/lib/config';
import { BD_GEO, shippingZoneForDistrict } from '../../src/lib/geo';
import {
  detectImageType,
  isValidImageKey,
  paymentQrKey,
  readImageAddress,
  resolveImageBase,
} from '../../src/lib/image';
import { buildManualFallback } from '../../src/lib/fallback';
import { createTestDb } from '../helpers/d1-sqlite';

describe('Phase 8A shipping zones', () => {
  it('upgrades an old hardcoded dhaka/outside shipping row without a manual migration', () => {
    const legacy = {
      zones: [
        { id: 'dhaka', label: { en: 'Inside Dhaka', bn: 'ঢাকার ভিতরে' }, fee: 60 },
        { id: 'outside', label: { en: 'Outside Dhaka', bn: 'ঢাকার বাইরে' }, fee: 120 },
      ],
      freeShippingOver: null,
    };

    const config = loadConfigFromRows([
      { key: 'shipping', value: JSON.stringify(legacy) },
    ]);

    expect(config.shipping.districtZones).toEqual({ Dhaka: 'dhaka' });
    expect(config.shipping.fallbackZone).toBe('outside');
    expect(shippingZoneForDistrict(config.shipping, 'Dhaka').id).toBe('dhaka');
    expect(shippingZoneForDistrict(config.shipping, 'Cumilla').id).toBe('outside');
  });

  it('maps every district in the geo dataset to an existing zone', () => {
    for (const division of BD_GEO.divisions) {
      for (const district of division.districts) {
        const zone = shippingZoneForDistrict(configDefaults.shipping, district.name);
        expect(
          configDefaults.shipping.zones.some((candidate) => candidate.id === zone.id),
          `${division.name} > ${district.name}`,
        ).toBe(true);
      }
    }
  });

  it('honours editable mappings, case-insensitive district names, and the fallback', () => {
    const shipping = {
      ...configDefaults.shipping,
      districtZones: { Dhaka: 'dhaka', Cumilla: 'dhaka' },
      fallbackZone: 'outside',
    };

    expect(shippingZoneForDistrict(shipping, '  dhaka ').id).toBe('dhaka');
    expect(shippingZoneForDistrict(shipping, 'CUMILLA').id).toBe('dhaka');
    expect(shippingZoneForDistrict(shipping, 'Sylhet').id).toBe('outside');
  });

  it('falls back to the first zone when the configured fallback id is missing at runtime', () => {
    const zone = shippingZoneForDistrict(
      {
        zones: [{ id: 'only', label: { en: 'Only', bn: 'একমাত্র' }, fee: 1 }],
        districtZones: { Dhaka: 'deleted-zone' },
        fallbackZone: 'also-deleted',
      },
      'Dhaka',
    );
    expect(zone.id).toBe('only');
  });

  it('accepts legacy zone ids with capitals or spaces', () => {
    const merged = mergeConfig(defaultConfig, {
      shipping: {
        zones: [
          { id: 'Inside Dhaka', label: { en: 'Inside Dhaka', bn: 'ঢাকার ভিতরে' }, fee: 80 },
        ],
        districtZones: { Dhaka: 'Inside Dhaka' },
        fallbackZone: 'Inside Dhaka',
        freeShippingOver: null,
      },
    });
    expect(merged.shipping.zones[0]?.id).toBe('Inside Dhaka');
    expect(shippingZoneForDistrict(merged.shipping, 'Dhaka').id).toBe('Inside Dhaka');
  });

  it('rejects duplicate zones, unknown mappings, and an unknown fallback', () => {
    const zones = configDefaults.shipping.zones;

    expect(() =>
      settingsUpdateSchema.parse({
        shipping: {
          zones: [zones[0], { ...zones[0], fee: 99 }],
          districtZones: {},
          fallbackZone: 'dhaka',
          freeShippingOver: null,
        },
      }),
    ).toThrow();

    expect(() =>
      settingsUpdateSchema.parse({
        shipping: {
          zones,
          districtZones: { Dhaka: 'missing' },
          fallbackZone: 'outside',
          freeShippingOver: null,
        },
      }),
    ).toThrow();

    expect(() =>
      settingsUpdateSchema.parse({
        shipping: {
          zones,
          districtZones: {},
          fallbackZone: 'missing',
          freeShippingOver: null,
        },
      }),
    ).toThrow();
  });
});

describe('Phase 8A image address', () => {
  const address = (value: string) =>
    settingsUpdateSchema.safeParse({ images: { address: value } });

  it('accepts a public https address without a trailing slash', () => {
    expect(address('https://images.example.com').success).toBe(true);
    expect(address('https://cdn.example.com/shop').success).toBe(true);
    expect(address('').success).toBe(true);
  });

  it.each([
    'http://images.example.com',
    'https://images.example.com/',
    'https://localhost',
    'https://localhost.',
    'https://127.0.0.1',
    'https://127.0.0.1.',
    'https://10.0.0.5',
    'https://192.168.1.2',
    'https://169.254.1.1',
    'https://[::1]',
    'https://[::ffff:127.0.0.1]',
    'https://user:pass@images.example.com',
    'https://images.example.com/path/',
    'https://intranet',
    'https://images.example.com?x=1',
    ' https://images.example.com',
  ])('rejects %s', (value) => {
    expect(address(value).success).toBe(false);
  });

  it('prefers the setting over the R2_PUBLIC_URL variable and strips trailing slashes', () => {
    expect(resolveImageBase('https://settings.example.com/', 'https://env.example.com')).toBe(
      'https://settings.example.com',
    );
    expect(resolveImageBase('', 'https://env.example.com/')).toBe('https://env.example.com');
    expect(resolveImageBase('', '')).toBe('');
  });

  it('reads the images row and ignores invalid JSON', async () => {
    const { db, sqlite } = createTestDb();
    expect(await readImageAddress(db)).toBe('');

    sqlite
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run('images', JSON.stringify({ address: 'https://images.example.com' }));
    expect(await readImageAddress(db)).toBe('https://images.example.com');

    sqlite.prepare('UPDATE settings SET value = ? WHERE key = ?').run('{bad', 'images');
    expect(await readImageAddress(db)).toBe('');
  });
});

describe('Phase 8A QR images', () => {
  it('detects PNG, JPEG, and WebP magic bytes', () => {
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe('png');
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe('jpg');
    expect(
      detectImageType(
        new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
      ),
    ).toBe('webp');
    expect(detectImageType(new Uint8Array([0x47, 0x49, 0x46]))).toBeNull();
  });

  it('accepts only payment-qr keys in the Worker image route', () => {
    const key = paymentQrKey('bkash', 'png');
    expect(key.startsWith('payment-qr/bkash-')).toBe(true);
    expect(isValidImageKey(key)).toBe(true);
    expect(isValidImageKey('payment-qr/../../secret.png')).toBe(false);
    expect(isValidImageKey('payment-qr/evil.svg')).toBe(false);
  });
});

describe('Phase 8A Turnstile fallback', () => {
  it('builds Messenger/WhatsApp fallback links without bypassing the server', () => {
    const fallback = buildManualFallback({
      locale: 'en',
      symbol: '৳',
      bnDigits: false,
      social: {
        facebook: '',
        messenger: 'https://m.me/example',
        whatsapp: 'https://wa.me/8801712345678',
        instagram: '',
      },
      contact: { phone: '01712345678', email: '', address: { en: '', bn: '' } },
      priced: null,
      customer: {
        name: 'Customer',
        phone: '01712345678',
        address: 'House 1',
        upazila: 'Savar',
        district: 'Dhaka',
        division: 'Dhaka',
      },
    });

    expect(fallback.message).toContain('The items in my cart');
    expect(fallback.messenger).toContain('https://m.me/example?text=');
    expect(fallback.whatsapp).toContain('https://wa.me/8801712345678?text=');
    expect(fallback.phone).toBe('tel:+8801712345678');
  });
});

describe('Phase 8A settings schema', () => {
  it('validates the low-stock threshold and defaults it to 5', () => {
    expect(settingsUpdateSchema.parse({ inventory: { lowStockThreshold: 3 } })).toEqual({
      inventory: { lowStockThreshold: 3 },
    });
    expect(() => settingsUpdateSchema.parse({ inventory: { lowStockThreshold: 0 } })).toThrow();
  });

  it('does not inject images or inventory into an unrelated settings patch', () => {
    const parsed = settingsUpdateSchema.parse({
      name: { en: 'Shop', bn: 'দোকান' },
    });
    expect(parsed).not.toHaveProperty('images');
    expect(parsed).not.toHaveProperty('inventory');
  });

  it('keeps old shipping rows valid through mergeConfig', () => {
    const merged = mergeConfig(defaultConfig, {
      shipping: { freeShippingOver: 1000 },
    });
    expect(merged.shipping.fallbackZone).toBe('outside');
    expect(merged.shipping.districtZones.Dhaka).toBe('dhaka');
  });

  it('parses a fork site.config.ts that predates the new sections', () => {
    const legacy = {
      ...defaultConfig,
      images: undefined,
      inventory: undefined,
      shipping: {
        zones: defaultConfig.shipping.zones,
        freeShippingOver: null,
      },
    };

    const parsed = mergeConfig(legacy as unknown as SiteConfig, {});
    expect(parsed.images.address).toBe('');
    expect(parsed.inventory.lowStockThreshold).toBe(5);
    expect(parsed.shipping.fallbackZone).toBe('dhaka');
    expect(parsed.shipping.districtZones).toEqual({});
  });
});