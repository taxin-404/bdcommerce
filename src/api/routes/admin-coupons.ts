import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  couponFieldsSchema,
  couponInputSchema,
  couponPatchSchema,
} from '../../lib/validation/admin';
import type { AdminEnv } from '../middleware/admin';
import { notFound, validationErrorResponse } from '../validation';

interface CouponListRow {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  min_subtotal: number;
  max_uses: number | null;
  used: number;
  starts_at: string | null;
  ends_at: string | null;
  active: number;
}

function couponJson(row: CouponListRow) {
  return {
    code: row.code,
    type: row.type,
    value: row.value,
    min_subtotal: row.min_subtotal,
    max_uses: row.max_uses,
    used: row.used,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    active: Boolean(row.active),
  };
}

export const adminCouponRoutes = new Hono<AdminEnv>();

adminCouponRoutes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT code, type, value, min_subtotal, max_uses, used, starts_at, ends_at, active
       FROM coupons
      ORDER BY code`,
  ).all<CouponListRow>();

  return c.json({ ok: true, data: results.map(couponJson) });
});

adminCouponRoutes.post(
  '/',
  zValidator('json', couponInputSchema, (result, c) => {
    if (!result.success) return validationErrorResponse(c, result.error);
  }),
  async (c) => {
    const input = c.req.valid('json');
    const existing = await c.env.DB.prepare('SELECT code FROM coupons WHERE code = ?')
      .bind(input.code)
      .first<{ code: string }>();
    if (existing) {
      return c.json(
        {
          ok: false,
          error: { code: 'duplicate_coupon', message: 'That coupon code already exists' },
        },
        409,
      );
    }

    await c.env.DB.prepare(
      `INSERT INTO coupons (
         code, type, value, min_subtotal, max_uses, used, starts_at, ends_at, active
       ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    )
      .bind(
        input.code,
        input.type,
        input.value,
        input.min_subtotal,
        input.max_uses ?? null,
        input.starts_at ?? null,
        input.ends_at ?? null,
        input.active ? 1 : 0,
      )
      .run();

    return c.json({ ok: true, data: { code: input.code } }, 201);
  },
);

adminCouponRoutes.patch(
  '/:code',
  zValidator('json', couponPatchSchema, (result, c) => {
    if (!result.success) return validationErrorResponse(c, result.error);
  }),
  async (c) => {
    const code = (c.req.param('code') ?? '').toUpperCase();
    const input = c.req.valid('json');

    const current = await c.env.DB.prepare(
      `SELECT code, type, value, min_subtotal, max_uses, used, starts_at, ends_at, active
         FROM coupons WHERE code = ? LIMIT 1`,
    )
      .bind(code)
      .first<CouponListRow>();
    if (!current) return notFound(c, 'coupon_not_found', 'Coupon not found');

    const merged = couponFieldsSchema.safeParse({
      type: input.type ?? current.type,
      value: input.value ?? current.value,
      min_subtotal: input.min_subtotal ?? current.min_subtotal,
      max_uses:
        input.max_uses !== undefined ? input.max_uses : current.max_uses,
      starts_at: input.starts_at !== undefined ? input.starts_at : current.starts_at,
      ends_at: input.ends_at !== undefined ? input.ends_at : current.ends_at,
      active: input.active !== undefined ? input.active : Boolean(current.active),
    });
    if (!merged.success) return validationErrorResponse(c, merged.error);

    if (merged.data.max_uses !== null && merged.data.max_uses < current.used) {
      return c.json(
        {
          ok: false,
          error: {
            code: 'coupon_max_uses_below_used',
            message: `This coupon has already been used ${current.used} times`,
          },
        },
        409,
      );
    }

    const updated = await c.env.DB.prepare(
      `UPDATE coupons
          SET type = ?, value = ?, min_subtotal = ?, max_uses = ?,
              starts_at = ?, ends_at = ?, active = ?
        WHERE code = ?
          AND (? IS NULL OR ? >= used)`,
    )
      .bind(
        merged.data.type,
        merged.data.value,
        merged.data.min_subtotal,
        merged.data.max_uses,
        merged.data.starts_at,
        merged.data.ends_at,
        merged.data.active ? 1 : 0,
        code,
        merged.data.max_uses,
        merged.data.max_uses,
      )
      .run();

    if (!updated.meta.changes) {
      const stillExists = await c.env.DB.prepare('SELECT code FROM coupons WHERE code = ? LIMIT 1')
        .bind(code)
        .first<{ code: string }>();
      if (!stillExists) return notFound(c, 'coupon_not_found', 'Coupon not found');
      return c.json(
        {
          ok: false,
          error: {
            code: 'coupon_max_uses_below_used',
            message: 'Maximum uses cannot be lower than the current used count',
          },
        },
        409,
      );
    }

    return c.json({
      ok: true,
      data: {
        code,
        type: merged.data.type,
        value: merged.data.value,
        min_subtotal: merged.data.min_subtotal,
        max_uses: merged.data.max_uses,
        used: current.used,
        starts_at: merged.data.starts_at,
        ends_at: merged.data.ends_at,
        active: merged.data.active,
      },
    });
  },
);

adminCouponRoutes.delete('/:code', async (c) => {
  const code = (c.req.param('code') ?? '').toUpperCase();
  const result = await c.env.DB.prepare('DELETE FROM coupons WHERE code = ?')
    .bind(code)
    .run();

  if (!result.meta.changes) {
    return notFound(c, 'coupon_not_found', 'Coupon not found');
  }
  return c.json({ ok: true, data: null });
});
