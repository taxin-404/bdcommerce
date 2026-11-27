import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { loadConfig } from '../../lib/config';
import { isD1Unavailable } from '../../lib/db-errors';
import { isAllowedOrigin } from '../../lib/http';
import { priceCart } from '../../lib/pricing';
import { countRoundTrips, logQueryCount } from '../../lib/query-log';
import { couponCheckSchema } from '../../lib/validation/checkout';
import { serverUnavailable, validationErrorResponse } from '../validation';

export const couponRoutes = new Hono<{ Bindings: Env }>();

couponRoutes.post(
  '/coupons/check',
  zValidator('json', couponCheckSchema, (result, c) => {
    if (!result.success) return validationErrorResponse(c, result.error);
  }),
  async (c) => {
    if (!isAllowedOrigin(c.req.raw)) {
      return c.json(
        { ok: false, error: { code: 'bad_origin', message: 'Cross-origin request rejected' } },
        403,
      );
    }

    const input = c.req.valid('json');
    const { value: db, count } = countRoundTrips(c.env.DB);

    try {
      const config = await loadConfig(db);
      const priced = await priceCart(db, input.items, config, input.district, {
        couponCode: input.coupon_code,
      });
      logQueryCount('coupon-check', count());
      return c.json({ ok: true, data: priced });
    } catch (error) {
      if (isD1Unavailable(error)) {
        logQueryCount('coupon-check', count());
        return serverUnavailable(
          c,
          'db_unavailable',
          'Coupons could not be checked right now. Please try again.',
        );
      }
      throw error;
    }
  },
);
