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

const PRIVATE_HOST_SUFFIXES = ['.localhost', '.local', '.internal'];

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateHost(hostname: string): boolean {
  // A trailing dot is the same DNS name; strip it before the local checks.
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host === '0.0.0.0' || host === '[::1]' || host === '::1') {
    return true;
  }
  if (host.includes(':')) {
    const ipv6 = host.replace(/^\[|\]$/g, '');
    if (
      ipv6 === '::' ||
      ipv6.startsWith('::ffff:') ||
      ipv6.startsWith('fc') ||
      ipv6.startsWith('fd') ||
      ipv6.startsWith('fe80')
    ) {
      return true;
    }
  }
  return (
    isPrivateIpv4(host) ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

/** A public https base URL for R2 images. No trailing slash, no private hosts. */
export const imageAddressSchema = z
  .string()
  .max(300)
  .refine((value) => value === '' || isPublicImageAddress(value), {
    message: 'Use an https image address without a trailing slash',
  });

export function isPublicImageAddress(value: string): boolean {
  if (!value || value !== value.trim() || value.endsWith('/')) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.search || parsed.hash) return false;
  if (!parsed.hostname.includes('.') && !parsed.hostname.includes(':')) return false;
  return !isPrivateHost(parsed.hostname);
}

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

export const shippingZoneSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9][A-Za-z0-9 _-]*$/, 'Zone ids use letters, digits, spaces, - or _'),
  label: localizedTextSchema,
  fee: z.number().int().nonnegative().max(1_000_000_000),
});

const shippingObjectSchema = z
  .object({
    zones: z.array(shippingZoneSchema).min(1).max(50),
    districtZones: z.record(z.string().min(1).max(80), z.string().min(1).max(40)),
    fallbackZone: z.string().min(1).max(40),
    freeShippingOver: z.number().int().nonnegative().max(1_000_000_000).nullable(),
  })
  .superRefine((value, ctx) => {
    const ids = new Set(value.zones.map((zone) => zone.id));
    if (ids.size !== value.zones.length) {
      ctx.addIssue({ code: 'custom', path: ['zones'], message: 'Zone ids must be unique' });
    }
    if (!ids.has(value.fallbackZone)) {
      ctx.addIssue({
        code: 'custom',
        path: ['fallbackZone'],
        message: 'The fallback zone must be one of the zones',
      });
    }
    for (const [district, zoneId] of Object.entries(value.districtZones)) {
      if (!ids.has(zoneId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['districtZones', district],
          message: 'Every district must map to an existing zone',
        });
      }
    }
  });

/**
 * Forks can pull template updates without editing site.config.ts: an old
 * shipping object without fallbackZone defaults to its first zone. Explicit
 * invalid values from Settings are still rejected by the object schema.
 */
const shippingSchema = z.preprocess((value) => {
  if (
    isPlainObject(value) &&
    typeof value.fallbackZone !== 'string' &&
    Array.isArray(value.zones) &&
    value.zones.length > 0
  ) {
    const first = value.zones[0] as { id?: unknown };
    if (typeof first?.id === 'string') {
      return { ...value, fallbackZone: first.id };
    }
  }
  return value;
}, shippingObjectSchema);

const paymentMethodSchema = z.object({
  enabled: z.boolean(),
});

const walletPaymentSchema = paymentMethodSchema.extend({
  number: z.string(),
  type: z.enum(['personal', 'merchant']),
  qr: safePathOrUrl.default(''),
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

const imagesSchema = z.object({
  address: imageAddressSchema.default(''),
});

const inventorySchema = z.object({
  lowStockThreshold: z.number().int().min(1).max(10_000).default(5),
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
  images: imagesSchema,
  inventory: inventorySchema,
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

/**
 * A fork can keep an old site.config.ts after pulling this template. Fill the
 * new sections here instead of putting schema defaults on the top-level
 * fields, because `.partial()` would otherwise leak those defaults into every
 * settings PATCH and overwrite owner data.
 */
function normalizeLegacyBase(base: SiteConfig): Record<string, unknown> {
  const raw = base as unknown as Record<string, unknown>;
  const shipping = isPlainObject(raw.shipping) ? { ...raw.shipping } : raw.shipping;

  if (isPlainObject(shipping)) {
    if (!isPlainObject(shipping.districtZones)) shipping.districtZones = {};
    if (
      typeof shipping.fallbackZone !== 'string' &&
      Array.isArray(shipping.zones) &&
      shipping.zones.length > 0
    ) {
      const first = shipping.zones[0] as { id?: unknown };
      if (typeof first?.id === 'string') shipping.fallbackZone = first.id;
    }
  }

  return {
    ...raw,
    images: isPlainObject(raw.images) ? raw.images : { address: '' },
    inventory: isPlainObject(raw.inventory)
      ? raw.inventory
      : { lowStockThreshold: 5 },
    shipping,
  };
}

export function mergeConfig(base: SiteConfig, overrides: Record<string, unknown>): SiteConfig {
  return siteConfigSchema.parse(deepMerge(normalizeLegacyBase(base), overrides));
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
