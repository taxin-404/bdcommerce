import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { isAllowedOrigin } from '../../lib/http';
import { loadConfig } from '../../lib/config';
import { isD1Unavailable } from '../../lib/db-errors';
import { priceCart } from '../../lib/pricing';
import { countRoundTrips, logQueryCount } from '../../lib/query-log';
import { cartPriceSchema } from '../../lib/validation/checkout';
import { serverUnavailable, validationErrorResponse } from '../validation';

export const cartRoutes = new Hono<{ Bindings: Env }>();

cartRoutes.post(
  '/cart/price',
  zValidator('json', cartPriceSchema, (result, c) => {
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
      const priced = await priceCart(db, input.items, config, input.district);
      logQueryCount('cart-price', count());
      return c.json({ ok: true, data: priced });
    } catch (error) {
      if (isD1Unavailable(error)) {
        logQueryCount('cart-price', count());
        return serverUnavailable(
          c,
          'db_unavailable',
          'Prices could not be refreshed right now. Please try again.',
        );
      }
      throw error;
    }
  },
);
