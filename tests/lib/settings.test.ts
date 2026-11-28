import { afterEach, describe, expect, it } from 'vitest';
import {
  completeSetup,
  isSetupComplete,
  loadAdminSettings,
  saveSettings,
  settingsUpdateSchema,
} from '../../src/lib/admin-settings';
import { defaultConfig } from '../../src/lib/config';
import { parseHomeSections } from '../../src/lib/sections';
import {
  createTestDb,
  type TestEnvironment,
} from '../helpers/d1-sqlite';

let environment: TestEnvironment | null = null;

afterEach(() => {
  environment?.close();
  environment = null;
});

describe('settings merge', () => {
  it('persists overrides that merge over site.config.ts', async () => {
    environment = createTestDb();
    const { db } = environment;

    await saveSettings(db, {
      name: { en: 'New Shop', bn: 'নতুন দোকান' },
      theme: { ...defaultConfig.theme, preset: 'dark' },
      shipping: {
        zones: defaultConfig.shipping.zones.map((zone) => ({ ...zone, fee: 99 })),
        districtZones: defaultConfig.shipping.districtZones,
        fallbackZone: defaultConfig.shipping.fallbackZone,
        freeShippingOver: 2000,
      },
    });

    const settings = await loadAdminSettings(db);
    expect(settings.config.name.en).toBe('New Shop');
    expect(settings.config.theme.preset).toBe('dark');
    expect(settings.config.theme.primary).toBe(defaultConfig.theme.primary);
    expect(settings.config.shipping.zones[0]?.fee).toBe(99);
    expect(settings.config.shipping.freeShippingOver).toBe(2000);
  });

  it('saves homepage section order as a separate settings row', async () => {
    environment = createTestDb();
    const { db } = environment;
    const sections = [{ type: 'featured' as const }, { type: 'hero' as const }];

    await saveSettings(db, { home_sections: sections });
    const settings = await loadAdminSettings(db);
    expect(settings.sections.map((section) => section.type)).toEqual(['featured', 'hero']);
  });

  it('rejects unknown keys instead of writing them', () => {
    expect(() => settingsUpdateSchema.parse({ unknown: true })).toThrow();
  });

  it('requires a number when a wallet is enabled', () => {
    expect(() =>
      settingsUpdateSchema.parse({
        payments: {
          ...defaultConfig.payments,
          nagad: { enabled: true, number: '', type: 'personal' },
        },
      }),
    ).toThrow();
  });
});

describe('homepage section validation', () => {
  it('keeps valid sections and drops only the invalid ones', () => {
    const sections = parseHomeSections(
      JSON.stringify([
        { type: 'hero' },
        { type: 'not-a-section' },
        { type: 'featured', title: { en: 'Featured', bn: 'ফিচার্ড' } },
      ]),
    );

    expect(sections.map((section) => section.type)).toEqual(['hero', 'featured']);
  });

  it('falls back to the default layout when the row is unusable', () => {
    expect(parseHomeSections('not json').length).toBeGreaterThan(0);
    expect(parseHomeSections(JSON.stringify([])).length).toBeGreaterThan(0);
  });
});

describe('first-run setup', () => {
  it('detects completed setup and creates the first category', async () => {
    environment = createTestDb();
    const { db, sqlite } = environment;

    const before = await loadAdminSettings(db);
    expect(before.setupCompleted).toBe(false);

    await completeSetup(
      db,
      {
        name: { en: 'Fresh Shop', bn: 'ফ্রেশ দোকান' },
        tagline: { en: 'Fresh', bn: 'নতুন' },
        theme_preset: 'soft',
        contact: { phone: '01712345678', email: '', address: { en: 'Dhaka', bn: 'ঢাকা' } },
        shipping: defaultConfig.shipping,
        payments: defaultConfig.payments,
        first_category: { name: 'Panjabi', name_bn: 'পাঞ্জাবি' },
      },
      'panjabi',
    );

    const after = await loadAdminSettings(db);
    expect(after.setupCompleted).toBe(true);
    expect(after.config.name.en).toBe('Fresh Shop');
    expect(after.config.theme.preset).toBe('soft');

    const category = sqlite
      .prepare('SELECT name, name_bn FROM categories WHERE slug = ?')
      .get('panjabi') as unknown as { name: string; name_bn: string };
    expect(category.name).toBe('Panjabi');
    expect(category.name_bn).toBe('পাঞ্জাবি');

    expect(isSetupComplete([{ key: 'setup_completed', value: 'true' }])).toBe(true);
    expect(isSetupComplete([{ key: 'setup_completed', value: '{"bad":true}' }])).toBe(false);
  });
});
