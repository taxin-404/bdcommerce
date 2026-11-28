import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  loadAdminSettings,
  saveSettings,
  settingsUpdateSchema,
} from '../../lib/admin-settings';
import {
  brandKeyFromLogoUrl,
  brandLogoKey,
  brandLogoUrl,
  detectImageType,
  IMAGE_MAX_BYTES,
  isWebPBytes,
  PAYMENT_QR_MAX_BYTES,
  paymentQrKey,
  paymentQrUrl,
  readImageAddress,
  resolveImageBase,
} from '../../lib/image';
import type { AdminEnv } from '../middleware/admin';
import { badRequest, validationErrorResponse } from '../validation';

function parseSettingValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

async function readSetting(db: D1Database, key: string): Promise<unknown> {
  const row = await db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .bind(key)
    .first<{ value: string }>();
  return row ? parseSettingValue(row.value) : null;
}

export const adminSettingsRoutes = new Hono<AdminEnv>();

adminSettingsRoutes.get('/', async (c) => {
  const data = await loadAdminSettings(c.env.DB);
  return c.json({ ok: true, data });
});

adminSettingsRoutes.put(
  '/',
  zValidator('json', settingsUpdateSchema, (result, c) => {
    if (!result.success) return validationErrorResponse(c, result.error);
  }),
  async (c) => {
    const input = c.req.valid('json');
    await saveSettings(c.env.DB, input);
    const data = await loadAdminSettings(c.env.DB);
    return c.json({ ok: true, data });
  },
);

adminSettingsRoutes.post('/logo', async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.parseBody();
  } catch {
    return badRequest(c, 'invalid_upload', 'Upload a WebP logo');
  }

  const file = body.logo;
  if (!(file instanceof File)) {
    return badRequest(c, 'missing_file', 'Choose a logo image first');
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return c.json(
      { ok: false, error: { code: 'file_too_large', message: 'The logo exceeds 1 MB' } },
      413,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isWebPBytes(bytes)) {
    return badRequest(c, 'invalid_type', 'The logo must be a WebP image');
  }

  const previous = await readSetting(c.env.DB, 'logo');
  const previousKey =
    typeof previous === 'string' ? brandKeyFromLogoUrl(previous) : null;

  const key = brandLogoKey(crypto.randomUUID());
  await c.env.IMAGES.put(key, bytes, {
    httpMetadata: {
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  const address = await readImageAddress(c.env.DB);
  const url = brandLogoUrl(key, resolveImageBase(address, c.env.R2_PUBLIC_URL));
  try {
    await c.env.DB.prepare(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    )
      .bind('logo', JSON.stringify(url))
      .run();
  } catch (error) {
    try {
      await c.env.IMAGES.delete(key);
    } catch {
      // Best effort; the original DB error is the useful one.
    }
    throw error;
  }

  if (previousKey && previousKey !== key) {
    try {
      await c.env.IMAGES.delete(previousKey);
    } catch {
      // The new logo is already live; an orphaned old object is harmless.
    }
  }

  return c.json({ ok: true, data: { url } }, 201);
});

adminSettingsRoutes.post('/qr', async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.parseBody();
  } catch {
    return badRequest(c, 'invalid_upload', 'Upload a PNG, JPEG, or WebP QR image');
  }

  const wallet = body.wallet;
  if (wallet !== 'bkash' && wallet !== 'nagad') {
    return badRequest(c, 'invalid_wallet', 'Choose bKash or Nagad');
  }

  const file = body.qr;
  if (!(file instanceof File)) {
    return badRequest(c, 'missing_file', 'Choose a QR image first');
  }
  if (file.size > PAYMENT_QR_MAX_BYTES) {
    return c.json(
      { ok: false, error: { code: 'file_too_large', message: 'The QR image exceeds 1 MB' } },
      413,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) {
    return badRequest(c, 'invalid_type', 'The QR image must be PNG, JPEG, or WebP');
  }

  const key = paymentQrKey(wallet, type);
  await c.env.IMAGES.put(key, bytes, {
    httpMetadata: {
      contentType: type === 'jpg' ? 'image/jpeg' : `image/${type}`,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  const address = await readImageAddress(c.env.DB);
  const url = paymentQrUrl(key, resolveImageBase(address, c.env.R2_PUBLIC_URL));
  return c.json({ ok: true, data: { url } }, 201);
});
