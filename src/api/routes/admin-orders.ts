import { zValidator } from '@hono/zod-validator';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AdminEnv } from '../middleware/admin';
import { changeOrderStatus } from '../../lib/order-status';
import { changePaymentStatus } from '../../lib/payments';
import {
  blockPhone,
  clearPhoneFlag,
  listBlocklist,
  listPhoneFlags,
  setPhoneFlag,
  unblockPhone,
} from '../../lib/blocklist';
import { getCourier } from '../../lib/courier';
import {
  refreshOrderCourierStatus,
  sendOrderToCourier,
  type CourierOrderErrorCode,
} from '../../lib/courier/order-courier';
import { isD1Unavailable } from '../../lib/db-errors';
import {
  blocklistInputSchema,
  blocklistPhoneParamSchema,
  courierActionSchema,
  idParamSchema,
  orderStatusUpdateSchema,
  paymentActionSchema,
  phoneFlagUpdateSchema,
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

adminOrderRoutes.post(
  '/:id/payment',
  zValidator('param', orderParamSchema, (result, c) => {
    if (!result.success) return invalidInput(result, c);
  }),
  zValidator('json', paymentActionSchema, (result, c) => {
    if (!result.success) return invalidInput(result, c);
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');

    const result = await changePaymentStatus({
      db: c.env.DB,
      orderId: id,
      action: input.action,
      note: input.note ?? null,
    });

    if (!result.ok) {
      if (result.code === 'not_found') {
        return notFound(c, 'order_not_found', 'Order not found');
      }
      if (result.code === 'invalid_payment_method') {
        return c.json(
          {
            ok: false,
            error: {
              code: 'invalid_payment_method',
              message: 'Only bKash and Nagad payments can be verified',
            },
          },
          409,
        );
      }
      if (result.code === 'invalid_transition') {
        return c.json(
          {
            ok: false,
            error: {
              code: 'invalid_transition',
              message: `Cannot ${input.action} a payment that is ${result.currentStatus ?? 'in another state'}`,
              current_status: result.currentStatus ?? null,
            },
          },
          409,
        );
      }
      if (result.code === 'status_conflict') {
        return c.json(
          {
            ok: false,
            error: {
              code: 'status_conflict',
              message: 'Another admin changed this payment. Reload and try again.',
            },
          },
          409,
        );
      }
      return serverUnavailable(
        c,
        'db_unavailable',
        'The payment could not be updated right now. Try again.',
      );
    }

    return c.json({
      ok: true,
      data: {
        id: result.id,
        action: result.action,
        previous_status: result.from,
        payment_status: result.to,
        event: result.event,
      },
    });
  },
);

const courierFailure = {
  not_confirmed: {
    status: 409,
    code: 'order_not_confirmed',
    message: 'Only confirmed orders can be sent to the courier.',
  },
  not_sent: {
    status: 409,
    code: 'courier_not_sent',
    message: 'This order has not been sent to the courier yet.',
  },
  in_progress: {
    status: 409,
    code: 'courier_in_progress',
    message: 'Another admin is sending this order. Try again in a minute.',
  },
  courier_conflict: {
    status: 409,
    code: 'courier_conflict',
    message: 'The courier response could not be saved. Refresh and check the order.',
  },
  courier_duplicate: {
    status: 409,
    code: 'courier_duplicate',
    message:
      'Steadfast already has a parcel for this invoice. Check the Steadfast portal before resending.',
  },
  duplicate_invoice: {
    status: 409,
    code: 'courier_duplicate',
    message:
      'Steadfast already has a parcel for this invoice. Check the Steadfast portal before resending.',
  },
  timeout: {
    status: 504,
    code: 'courier_timeout',
    message: 'The courier did not respond in time. Try again.',
  },
  auth: {
    status: 502,
    code: 'courier_auth',
    message: 'The courier rejected the API keys. Check the Steadfast credentials.',
  },
  rejected: {
    status: 422,
    code: 'courier_rejected',
    message: 'The courier rejected this order. Check the phone, address, and invoice.',
  },
  rate_limited: {
    status: 429,
    code: 'courier_rate_limited',
    message: 'The courier is rate limiting requests. Try again later.',
  },
  unavailable: {
    status: 502,
    code: 'courier_unavailable',
    message: 'The courier is unavailable right now. Try again later.',
  },
  invalid_response: {
    status: 502,
    code: 'courier_invalid_response',
    message: 'The courier returned an unexpected response.',
  },
} as const;

function courierErrorResponse(c: Context, code: CourierOrderErrorCode) {
  if (code === 'not_found') return notFound(c, 'order_not_found', 'Order not found');
  if (code === 'db_unavailable') {
    return serverUnavailable(
      c,
      'db_unavailable',
      'The order could not be updated right now. Try again.',
    );
  }

  const failure = courierFailure[code] ?? courierFailure.unavailable;
  return c.json(
    { ok: false as const, error: { code: failure.code, message: failure.message } },
    failure.status,
  );
}

adminOrderRoutes.post(
  '/:id/courier',
  zValidator('param', orderParamSchema, (result, c) => {
    if (!result.success) return invalidInput(result, c);
  }),
  zValidator('json', courierActionSchema, (result, c) => {
    if (!result.success) return invalidInput(result, c);
  }),
  async (c) => {
    const courier = getCourier(c.env);
    if (!courier) {
      return badRequest(
        c,
        'courier_not_configured',
        'Set STEADFAST_API_KEY and STEADFAST_SECRET_KEY to use the courier.',
      );
    }

    const { id } = c.req.valid('param');
    const { action } = c.req.valid('json');

    if (action === 'send') {
      const result = await sendOrderToCourier({ db: c.env.DB, courier, orderId: id });
      if (!result.ok) return courierErrorResponse(c, result.code);

      return c.json({
        ok: true,
        data: {
          action,
          consignment_id: result.parcel.consignmentId,
          tracking_code: result.parcel.trackingCode,
          courier_status: result.parcel.status || null,
          existing: result.existing,
        },
      });
    }

    const result = await refreshOrderCourierStatus({
      db: c.env.DB,
      courier,
      orderId: id,
    });
    if (!result.ok) return courierErrorResponse(c, result.code);

    return c.json({
      ok: true,
      data: { action, courier_status: result.status },
    });
  },
);

adminOrderRoutes.post(
  '/:id/phone-flag',
  zValidator('param', orderParamSchema, (result, c) => {
    if (!result.success) return invalidInput(result, c);
  }),
  zValidator('json', phoneFlagUpdateSchema, (result, c) => {
    if (!result.success) return invalidInput(result, c);
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');

    try {
      const order = await c.env.DB.prepare('SELECT phone FROM orders WHERE id = ? LIMIT 1')
        .bind(id)
        .first<{ phone: string }>();
      if (!order) return notFound(c, 'order_not_found', 'Order not found');

      if (input.flagged) {
        const flagged = await setPhoneFlag({
          db: c.env.DB,
          phone: order.phone,
          reason: input.reason ?? null,
        });
        if (!flagged) {
          return badRequest(c, 'invalid_phone', 'Enter a valid Bangladeshi mobile number.');
        }
      } else {
        await clearPhoneFlag(c.env.DB, order.phone);
      }

      return c.json({ ok: true, data: { flagged: input.flagged } });
    } catch (error) {
      if (isD1Unavailable(error)) {
        return serverUnavailable(
          c,
          'db_unavailable',
          'The phone flag could not be updated right now. Try again.',
        );
      }
      throw error;
    }
  },
);

export const adminBlocklistRoutes = new Hono<AdminEnv>();

adminBlocklistRoutes.get('/', async (c) => {
  try {
    const [blocked, flagged] = await Promise.all([
      listBlocklist(c.env.DB),
      listPhoneFlags(c.env.DB),
    ]);
    return c.json({ ok: true, data: { blocked, flagged } });
  } catch (error) {
    if (isD1Unavailable(error)) {
      return serverUnavailable(
        c,
        'db_unavailable',
        'The blocklist could not be loaded right now. Try again.',
      );
    }
    throw error;
  }
});

adminBlocklistRoutes.post(
  '/',
  zValidator('json', blocklistInputSchema, (result, c) => {
    if (!result.success) return invalidInput(result, c);
  }),
  async (c) => {
    const input = c.req.valid('json');
    try {
      const result = await blockPhone({
        db: c.env.DB,
        phone: input.phone,
        reason: input.reason ?? null,
      });

      if (!result) {
        return badRequest(c, 'invalid_phone', 'Enter a valid Bangladeshi mobile number.');
      }

      return c.json({ ok: true, data: { blocked: true } }, 201);
    } catch (error) {
      if (isD1Unavailable(error)) {
        return serverUnavailable(
          c,
          'db_unavailable',
          'The blocklist could not be updated right now. Try again.',
        );
      }
      throw error;
    }
  },
);

adminBlocklistRoutes.delete(
  '/flags/:phone',
  zValidator('param', blocklistPhoneParamSchema, (result, c) => {
    if (!result.success) return invalidInput(result, c);
  }),
  async (c) => {
    const { phone } = c.req.valid('param');
    try {
      const cleared = await clearPhoneFlag(c.env.DB, phone);
      if (!cleared) {
        return notFound(c, 'phone_not_flagged', 'That phone is not flagged.');
      }
      return c.json({ ok: true, data: { flagged: false } });
    } catch (error) {
      if (isD1Unavailable(error)) {
        return serverUnavailable(
          c,
          'db_unavailable',
          'The phone flag could not be updated right now. Try again.',
        );
      }
      throw error;
    }
  },
);

adminBlocklistRoutes.delete(
  '/:phone',
  zValidator('param', blocklistPhoneParamSchema, (result, c) => {
    if (!result.success) return invalidInput(result, c);
  }),
  async (c) => {
    const { phone } = c.req.valid('param');
    try {
      const removed = await unblockPhone(c.env.DB, phone);
      if (!removed) {
        return notFound(c, 'phone_not_blocked', 'That phone is not on the blocklist.');
      }
      return c.json({ ok: true, data: { blocked: false } });
    } catch (error) {
      if (isD1Unavailable(error)) {
        return serverUnavailable(
          c,
          'db_unavailable',
          'The blocklist could not be updated right now. Try again.',
        );
      }
      throw error;
    }
  },
);
