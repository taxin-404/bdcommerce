import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  couponActiveSchema,
  couponInputSchema,
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
  zValidator('json', couponActiveSchema, (result, c) => {
    if (!result.success) return validationErrorResponse(c, result.error);
  }),
  async (c) => {
    const code = (c.req.param('code') ?? '').toUpperCase();
    const { active } = c.req.valid('json');
    const result = await c.env.DB.prepare('UPDATE coupons SET active = ? WHERE code = ?')
      .bind(active ? 1 : 0, code)
      .run();

    if (!result.meta.changes) {
      return notFound(c, 'coupon_not_found', 'Coupon not found');
    }
    return c.json({ ok: true, data: { code, active } });
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
