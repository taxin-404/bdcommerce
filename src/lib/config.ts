import { z } from 'zod';
import defaultConfig from '../../site.config';

export const localizedTextSchema = z.object({
  en: z.string(),
  bn: z.string(),
});

export const safePathOrUrl = z
  .string()
  .refine(
    (value) =>
      value === '' ||
      ((value.startsWith('/') || value.startsWith('./')) &&
        !value.startsWith('//') &&
        !value.startsWith('/\\')) ||
      /^https?:\/\//i.test(value),
    'Expected a site-relative path or an http(s) URL',
  );

export const themePresetSchema = z.enum(['clean', 'bold', 'soft', 'dark']);

const themeSchema = z.object({
  preset: themePresetSchema.default('clean'),
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a 6-digit hex colour'),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a 6-digit hex colour'),
  radius: z
    .string()
    .regex(/^(?:0|\d+(?:\.\d+)?(?:px|rem|em))$/, 'Expected a CSS length such as 0.75rem'),
  font: z.string().regex(/^[A-Za-z0-9 ,'-]+$/, 'Expected a font family name'),
});

const localeSchema = z
  .object({
    default: z.enum(['bn', 'en']),
    available: z.array(z.enum(['bn', 'en'])).min(1),
  })
  .refine((value) => value.available.includes(value.default), {
    message: 'locale.default must be one of locale.available',
    path: ['default'],
  });

const currencySchema = z.object({
  code: z.literal('BDT'),
  symbol: z.string().min(1),
  bnDigits: z.boolean(),
});

const featuresSchema = z.object({
  stockTracking: z.boolean(),
  variants: z.boolean(),
  coupons: z.boolean(),
  guestCheckout: z.boolean(),
  reviews: z.boolean(),
});

const shippingZoneSchema = z.object({
  id: z.string().min(1),
  label: localizedTextSchema,
  fee: z.number().int().nonnegative().max(1_000_000_000),
});

const shippingSchema = z.object({
  zones: z.array(shippingZoneSchema).min(1),
  freeShippingOver: z.number().int().nonnegative().max(1_000_000_000).nullable(),
});

const paymentMethodSchema = z.object({
  enabled: z.boolean(),
});

const walletPaymentSchema = paymentMethodSchema.extend({
  number: z.string(),
  type: z.enum(['personal', 'merchant']),
});

const paymentsSchema = z.object({
  cod: paymentMethodSchema,
  bkash: walletPaymentSchema,
  nagad: walletPaymentSchema,
});

const socialSchema = z.object({
  facebook: safePathOrUrl,
  messenger: safePathOrUrl,
  whatsapp: safePathOrUrl,
  instagram: safePathOrUrl,
});

const trackingSchema = z.object({
  fbPixelId: z.string(),
  capi: z.boolean(),
});

const fraudSchema = z.object({
  enabled: z.boolean().default(true),
  orderLimitPerPhone24h: z.number().int().positive().max(10_000).default(5),
  orderLimitPerIp24h: z.number().int().positive().max(10_000).default(50),
  advancePaymentForFlaggedPhones: z.boolean().default(true),
});

const contactSchema = z.object({
  phone: z.string(),
  email: z.string(),
  address: localizedTextSchema,
});

export const siteConfigSchema = z.object({
  name: localizedTextSchema,
  tagline: localizedTextSchema,
  logo: safePathOrUrl,
  theme: themeSchema,
  locale: localeSchema,
  currency: currencySchema,
  features: featuresSchema,
  shipping: shippingSchema,
  payments: paymentsSchema,
  social: socialSchema,
  tracking: trackingSchema,
  fraud: fraudSchema,
  contact: contactSchema,
});

export type SiteConfig = z.infer<typeof siteConfigSchema>;

const CONFIG_KEYS = new Set(Object.keys(siteConfigSchema.shape));

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(base: unknown, override: unknown): unknown {
  if (isPlainObject(base) && isPlainObject(override)) {
    const merged: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(override)) {
      merged[key] = key in merged ? deepMerge(merged[key], value) : value;
    }
    return merged;
  }

  if (Array.isArray(override)) return [...override];
  return override;
}

export function mergeConfig(base: SiteConfig, overrides: Record<string, unknown>): SiteConfig {
  return siteConfigSchema.parse(deepMerge(base, overrides));
}

function parseOverride(row: {
  key: string;
  value: string;
}): { key: string; value: unknown } | null {
  if (!CONFIG_KEYS.has(row.key)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value) as unknown;
  } catch {
    console.warn(`Ignoring settings row "${row.key}": invalid JSON`);
    return null;
  }

  try {
    mergeConfig(defaultConfig, { [row.key]: parsed });
  } catch {
    console.warn(`Ignoring settings row "${row.key}": value does not match the config schema`);
    return null;
  }

  return { key: row.key, value: parsed };
}

export function loadConfigFromRows(rows: { key: string; value: string }[]): SiteConfig {
  const overrides: Record<string, unknown> = {};
  for (const row of rows) {
    const override = parseOverride(row);
    if (override) overrides[override.key] = override.value;
  }

  return mergeConfig(defaultConfig, overrides);
}

export async function loadConfig(db: D1Database): Promise<SiteConfig> {
  const { results } = await db
    .prepare('SELECT key, value FROM settings')
    .all<{ key: string; value: string }>();

  return loadConfigFromRows(results);
}

export { defaultConfig };
