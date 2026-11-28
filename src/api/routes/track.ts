import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { isD1Unavailable } from '../../lib/db-errors';
import { isAllowedOrigin } from '../../lib/http';
import { findOrderForCustomer } from '../../lib/orders';
import { normalizePhone } from '../../lib/phone';
import { countRoundTrips, logQueryCount } from '../../lib/query-log';
import { hitRateLimit, rateLimitKey } from '../../lib/rate-limit';
import { trackSchema } from '../../lib/validation/checkout';
import { badRequest, notFound, serverUnavailable, validationErrorResponse } from '../validation';

export const trackRoutes = new Hono<{ Bindings: Env }>();

trackRoutes.post(
  '/track',
  zValidator('json', trackSchema, (result, c) => {
    if (!result.success) return validationErrorResponse(c, result.error);
  }),
  async (c) => {
    if (!isAllowedOrigin(c.req.raw)) {
      return c.json(
        { ok: false, error: { code: 'bad_origin', message: 'Cross-origin request rejected' } },
        403,
      );
    }

    const remoteIp = c.req.header('cf-connecting-ip')?.trim() || null;
    if (remoteIp) {
      const limit = hitRateLimit(rateLimitKey('track', remoteIp), 10, 60_000);
      if (!limit.allowed) {
        c.header('Retry-After', String(limit.retryAfter));
        return c.json(
          {
            ok: false,
            error: {
              code: 'rate_limited',
              message: 'Too many tracking attempts. Please wait a minute and try again.',
            },
          },
          429,
        );
      }
    }

    const input = c.req.valid('json');
    const phone = normalizePhone(input.phone);
    if (!phone) return badRequest(c, 'invalid_phone', 'Enter a valid Bangladeshi mobile number.');

    const { value: db, count } = countRoundTrips(c.env.DB);
    try {
      const result = await findOrderForCustomer(db, input.order_number, phone);
      if (!result) {
        return notFound(c, 'not_found', 'No order matches that order number and mobile number.');
      }
      return c.json({ ok: true, data: result });
    } catch (error) {
      if (isD1Unavailable(error)) {
        return serverUnavailable(
          c,
          'db_unavailable',
          'Order tracking is temporarily unavailable. Please try again.',
        );
      }
      throw error;
    } finally {
      logQueryCount('track-api', count());
    }
  },
);
