import { z } from 'zod';
import {
  loadConfigFromRows,
  localizedTextSchema,
  safePathOrUrl,
  shippingZoneSchema,
  siteConfigSchema,
  themePresetSchema,
  type SiteConfig,
} from './config';
import {
  homeSectionsSchema,
  parseHomeSections,
  type HomeSection,
} from './sections';

const editableConfigSchema = siteConfigSchema.pick({
  name: true,
  tagline: true,
  logo: true,
  theme: true,
  shipping: true,
  payments: true,
  images: true,
  inventory: true,
  social: true,
  fraud: true,
  contact: true,
});

function requireWalletNumbers(
  payments: SiteConfig['payments'],
  ctx: z.RefinementCtx,
): void {
  for (const wallet of ['bkash', 'nagad'] as const) {
    if (payments[wallet].enabled && !payments[wallet].number.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['payments', wallet, 'number'],
        message: 'An enabled wallet needs a number',
      });
    }
  }
}

export const settingsUpdateSchema = editableConfigSchema
  .partial()
  .extend({ home_sections: homeSectionsSchema.optional() })
  .strict()
  .superRefine((value, ctx) => {
    if (value.payments) requireWalletNumbers(value.payments, ctx);
  });

export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

const setupShippingSchema = z
  .object({
    zones: z.array(shippingZoneSchema).min(1).max(50),
    freeShippingOver: z.number().int().nonnegative().max(1_000_000_000).nullable(),
  })
  .superRefine((value, ctx) => {
    const ids = new Set(value.zones.map((zone) => zone.id));
    if (ids.size !== value.zones.length) {
      ctx.addIssue({ code: 'custom', path: ['zones'], message: 'Zone ids must be unique' });
    }
  });

const setupSchema = z
  .object({
    name: localizedTextSchema,
    tagline: localizedTextSchema.optional(),
    logo: safePathOrUrl.optional(),
    theme_preset: themePresetSchema.default('clean'),
    contact: siteConfigSchema.shape.contact,
    shipping: setupShippingSchema,
    payments: siteConfigSchema.shape.payments,
    first_category: z.object({
      name: z.string().trim().min(1).max(120),
      name_bn: z.string().trim().max(120).nullable().optional(),
    }),
  })
  .superRefine((value, ctx) => requireWalletNumbers(value.payments, ctx));

export type SetupInput = z.infer<typeof setupSchema>;

export interface AdminSettingsData {
  config: SiteConfig;
  sections: HomeSection[];
  setupCompleted: boolean;
}

const CONFIG_KEYS = new Set([
  'name',
  'tagline',
  'logo',
  'theme',
  'shipping',
  'payments',
  'images',
  'inventory',
  'social',
  'fraud',
  'contact',
]);

export function isSetupComplete(rows: { key: string; value: string }[]): boolean {
  const row = rows.find((item) => item.key === 'setup_completed');
  if (!row) return false;
  try {
    return JSON.parse(row.value) === true;
  } catch {
    return row.value === 'true' || row.value === '1';
  }
}

export async function loadAdminSettings(db: D1Database): Promise<AdminSettingsData> {
  const { results } = await db
    .prepare('SELECT key, value FROM settings')
    .all<{ key: string; value: string }>();

  return {
    config: loadConfigFromRows(results),
    sections: parseHomeSections(results.find((row) => row.key === 'home_sections')?.value),
    setupCompleted: isSetupComplete(results),
  };
}

function settingValue(value: unknown): string {
  return JSON.stringify(value);
}

export async function saveSettings(
  db: D1Database,
  update: SettingsUpdate,
): Promise<void> {
  const statements: D1PreparedStatement[] = [];

  for (const [key, value] of Object.entries(update)) {
    if (value === undefined) continue;
    if (key !== 'home_sections' && !CONFIG_KEYS.has(key)) continue;
    statements.push(
      db
        .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .bind(key, settingValue(value)),
    );
  }

  if (statements.length) await db.batch(statements);
}

/** Used by the setup wizard; all rows commit together. */
export async function completeSetup(
  db: D1Database,
  input: SetupInput,
  categorySlug: string,
): Promise<void> {
  const zoneIds = new Set(input.shipping.zones.map((zone) => zone.id));
  const shipping = {
    ...input.shipping,
    districtZones: zoneIds.has('dhaka') ? { Dhaka: 'dhaka' } : {},
    fallbackZone: zoneIds.has('outside') ? 'outside' : input.shipping.zones[0]!.id,
  };
  const settings: Array<[string, unknown]> = [
    ['name', input.name],
    ['contact', input.contact],
    ['shipping', shipping],
    ['payments', input.payments],
    ['theme', { preset: input.theme_preset }],
    ['setup_completed', true],
  ];
  if (input.tagline) settings.push(['tagline', input.tagline]);
  if (input.logo) settings.push(['logo', input.logo]);

  const statements: D1PreparedStatement[] = settings.map(([key, value]) =>
    db
      .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .bind(key, settingValue(value)),
  );

  statements.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO categories (slug, name, name_bn, parent_id, sort, active)
         VALUES (?, ?, ?, NULL, 0, 1)`,
      )
      .bind(categorySlug, input.first_category.name, input.first_category.name_bn ?? null),
  );

  await db.batch(statements);
}

export { setupSchema };
