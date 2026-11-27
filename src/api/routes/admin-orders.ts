import { zValidator } from '@hono/zod-validator';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AdminEnv } from '../middleware/admin';
import { changeOrderStatus } from '../../lib/order-status';
import { blockPhone } from '../../lib/blocklist';
import {
  blocklistInputSchema,
  idParamSchema,
  orderStatusUpdateSchema,
} from '../../lib/validation/admin';
import { badRequest, notFound, serverUnavailable, validationErrorResponse } from '../validation';

const orderParamSchema = z.object({ id: idParamSchema });

function invalidInput(
  result: { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } },
  c: Context,
) {
  return validationErrorResponse(c, result.error);
}

export const adminOrderRoutes = new Hono<AdminEnv>();

adminOrderRoutes.post(
  '/:id/status',
  zValidator('param', orderParamSchema, (result, c) => {
    if (!result.success) return invalidInput(result, c);
  }),
  zValidator('json', orderStatusUpdateSchema, (result, c) => {
    if (!result.success) return invalidInput(result, c);
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');

    const result = await changeOrderStatus({
      db: c.env.DB,
      orderId: id,
      to: input.status,
      note: input.note ?? null,
    });

    if (!result.ok) {
      if (result.code === 'not_found') {
        return notFound(c, 'order_not_found', 'Order not found');
      }
      if (result.code === 'invalid_transition') {
        return c.json(
          {
            ok: false as const,
            error: {
              code: 'invalid_transition',
              message: `Cannot change an order from ${result.currentStatus ?? 'its current status'} to ${input.status}`,
              current_status: result.currentStatus ?? null,
            },
          },
          409,
        );
      }
      if (result.code === 'status_conflict') {
        return c.json(
          {
            ok: false as const,
            error: {
              code: 'status_conflict',
              message: 'Another admin changed this order. Reload and try again.',
            },
          },
          409,
        );
      }
      return serverUnavailable(
        c,
        'db_unavailable',
        'The order could not be updated right now. Try again.',
      );
    }

    return c.json({
      ok: true,
      data: {
        id: result.id,
        status: result.to,
        previous_status: result.from,
        payment_status: result.paymentStatus,
        stock_restored: result.restoredStock,
      },
    });
  },
);

export const adminBlocklistRoutes = new Hono<AdminEnv>();

adminBlocklistRoutes.post(
  '/',
  zValidator('json', blocklistInputSchema, (result, c) => {
    if (!result.success) return invalidInput(result, c);
  }),
  async (c) => {
    const input = c.req.valid('json');
    const result = await blockPhone({
      db: c.env.DB,
      phone: input.phone,
      reason: input.reason ?? null,
    });

    if (!result) {
      return badRequest(c, 'invalid_phone', 'Enter a valid Bangladeshi mobile number.');
    }

    return c.json({ ok: true, data: { blocked: true } }, 201);
  },
);
