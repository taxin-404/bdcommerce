import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { productImages } from '../../db/schema';
import {
  IMAGE_MAX_BYTES,
  IMAGE_SIZES,
  imageBaseKey,
  imageUrl,
  imageVariantKey,
  isWebPBytes,
} from '../../lib/image';
import { idParamSchema } from '../../lib/validation/admin';
import type { AdminEnv } from '../middleware/admin';

function imageJson(
  row: typeof productImages.$inferSelect,
  publicUrl: string,
) {
  return {
    id: row.id,
    r2_key: row.r2Key,
    alt: row.alt,
    sort: row.sort,
    urls: {
      thumb: imageUrl(row.r2Key, 'thumb', publicUrl),
      md: imageUrl(row.r2Key, 'md', publicUrl),
      full: imageUrl(row.r2Key, 'full', publicUrl),
    },
  };
}

export const adminImageRoutes = new Hono<AdminEnv>();

adminImageRoutes.post('/upload', async (c) => {
  const body = await c.req.parseBody();

  const productId = z.coerce.number().int().positive().safeParse(body.product_id);
  if (!productId.success) {
    return c.json(
      { ok: false, error: { code: 'invalid_product', message: 'A valid product_id is required' } },
      400,
    );
  }

  const product = await c.env.DB.prepare('SELECT id FROM products WHERE id = ?')
    .bind(productId.data)
    .first<{ id: number }>();
  if (!product) {
    return c.json(
      { ok: false, error: { code: 'not_found', message: 'Product not found' } },
      404,
    );
  }

  const files = {} as Record<(typeof IMAGE_SIZES)[number], Uint8Array>;
  for (const size of IMAGE_SIZES) {
    const value = body[size];
    if (!(value instanceof File)) {
      return c.json(
        {
          ok: false,
          error: { code: 'missing_file', message: `Missing the ${size} WebP file` },
        },
        400,
      );
    }
    if (value.size > IMAGE_MAX_BYTES) {
      return c.json(
        {
          ok: false,
          error: { code: 'file_too_large', message: `The ${size} image exceeds 1 MB` },
        },
        413,
      );
    }

    const bytes = new Uint8Array(await value.arrayBuffer());
    if (!isWebPBytes(bytes)) {
      return c.json(
        {
          ok: false,
          error: { code: 'invalid_type', message: `The ${size} file is not WebP` },
        },
        400,
      );
    }
    files[size] = bytes;
  }

  const baseKey = imageBaseKey(productId.data, crypto.randomUUID());

  await Promise.all(
    IMAGE_SIZES.map((size) =>
      c.env.IMAGES.put(imageVariantKey(baseKey, size), files[size], {
        httpMetadata: {
          contentType: 'image/webp',
          cacheControl: 'public, max-age=31536000, immutable',
        },
      }),
    ),
  );

  const next = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(sort), -1) + 1 AS next FROM product_images WHERE product_id = ?',
  )
    .bind(productId.data)
    .first<{ next: number }>();

  const alt = typeof body.alt === 'string' ? body.alt.trim().slice(0, 200) : null;

  const [created] = await getDb(c.env.DB)
    .insert(productImages)
    .values({
      productId: productId.data,
      r2Key: baseKey,
      alt: alt || null,
      sort: Number(next?.next ?? 0),
    })
    .returning();

  if (!created) throw new Error('Image insert returned no row');

  return c.json(
    { ok: true, data: imageJson(created, c.env.R2_PUBLIC_URL ?? '') },
    201,
  );
});

adminImageRoutes.delete(
  '/images/:id',
  zValidator('param', z.object({ id: idParamSchema })),
  async (c) => {
    const { id } = c.req.valid('param');
    const db = getDb(c.env.DB);

    const [image] = await db
      .select()
      .from(productImages)
      .where(eq(productImages.id, id))
      .limit(1);

    if (!image) {
      return c.json(
        { ok: false, error: { code: 'not_found', message: 'Image not found' } },
        404,
      );
    }

    await c.env.IMAGES.delete(
      IMAGE_SIZES.map((size) => imageVariantKey(image.r2Key, size)),
    );
    await db.delete(productImages).where(eq(productImages.id, id));

    return c.json({ ok: true, data: null });
  },
);
