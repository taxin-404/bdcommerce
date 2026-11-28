import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { createCheckoutOrder, type CheckoutLineSnapshot } from '../../lib/checkout';
import { loadConfigFromRows, type SiteConfig } from '../../lib/config';
import {
  COUPON_ERROR_MESSAGES,
  couponErrorStatus,
  type CouponErrorCode,
} from '../../lib/coupons';
import { isD1Unavailable } from '../../lib/db-errors';
import { buildCheckoutFallback } from '../../lib/fallback';
import {
  countRecentIpOrders,
  ensureIpHashSalt,
  fraudLimitReached,
  hashIp,
  loadCheckoutContext,
} from '../../lib/fraud';
import { resolveGeoSelection } from '../../lib/geo';
import { isAllowedOrigin } from '../../lib/http';
import { generateOrderNumber } from '../../lib/orders';
import { normalizePhone } from '../../lib/phone';
import { priceCart } from '../../lib/pricing';
import { countRoundTrips, logQueryCount } from '../../lib/query-log';
import { hitRateLimit, rateLimitKey } from '../../lib/rate-limit';
import { checkoutRequestHash } from '../../lib/request-hash';
import { readTurnstileConfig, verifyTurnstile } from '../../lib/turnstile';
import { checkoutSchema } from '../../lib/validation/checkout';
import { badRequest, serverUnavailable, validationErrorResponse } from '../validation';

export function couponErrorResponse(
  c: Parameters<typeof badRequest>[0],
  code: CouponErrorCode,
) {
  return c.json(
    {
      ok: false as const,
      error: { code, message: COUPON_ERROR_MESSAGES[code] },
    },
    couponErrorStatus(code),
  );
}

export const checkoutRoutes = new Hono<{ Bindings: Env }>();

checkoutRoutes.post(
  '/checkout',
  zValidator('json', checkoutSchema, (result, c) => {
    if (!result.success) return validationErrorResponse(c, result.error);
  }),
  async (c) => {
    if (!isAllowedOrigin(c.req.raw)) {
      return c.json(
        { ok: false, error: { code: 'bad_origin', message: 'Cross-origin request rejected' } },
        403,
      );
    }

    // Best-effort in-isolate pre-filter: blunts checkout floods before the
    // settings/limit D1 batch runs. It costs no D1 round trip and resets when
    // the isolate is recycled.
    const remoteIp = c.req.header('cf-connecting-ip')?.trim() || null;
    if (remoteIp) {
      const limit = hitRateLimit(rateLimitKey('checkout', remoteIp), 30, 60_000);
      if (!limit.allowed) {
        c.header('Retry-After', String(limit.retryAfter));
        return c.json(
          {
            ok: false,
            error: {
              code: 'rate_limited',
              message: 'Too many requests. Please wait a moment and try again.',
            },
          },
          429,
        );
      }
    }

    const input = c.req.valid('json');
    const phone = normalizePhone(input.customer.phone);
    if (!phone) return badRequest(c, 'invalid_phone', 'Enter a valid Bangladeshi mobile number.');

    const geo = resolveGeoSelection(input.customer);
    if (!geo) {
      return badRequest(c, 'invalid_geo', 'Choose a valid division, district, and upazila.');
    }

    const { value: db, count } = countRoundTrips(c.env.DB);
    const customer = {
      name: input.customer.name,
      phone,
      email: input.customer.email,
      division: geo.division.name,
      district: geo.district.name,
      upazila: geo.upazila.name,
      address: input.customer.address,
      note: input.customer.note,
    };

    const paymentMethod = input.payment_method;
    const paymentSender =
      paymentMethod === 'cod'
        ? null
        : normalizePhone(input.payment_sender ?? '');
    const paymentTrxId =
      paymentMethod === 'cod' ? null : (input.payment_trx_id?.trim().toUpperCase() ?? null);
    if (paymentMethod !== 'cod' && !paymentSender) {
      return badRequest(c, 'invalid_payment_sender', 'Enter a valid sender mobile number.');
    }

    const requestHash = await checkoutRequestHash({
      customer,
      items: input.items,
      paymentMethod,
      paymentSender,
      paymentTrxId,
      couponCode: input.coupon_code ?? null,
    });
    let config: SiteConfig | null = null;
    const now = new Date().toISOString();

    try {
      const context = await loadCheckoutContext({
        db,
        phone,
        idempotencyKey: input.idempotency_key,
        now,
      });
      config = context.config;

      const paymentConfig =
        paymentMethod === 'cod'
          ? config.payments.cod
          : paymentMethod === 'bkash'
            ? config.payments.bkash
            : config.payments.nagad;
      if (!paymentConfig.enabled) {
        return badRequest(c, 'payment_unavailable', 'That payment method is not available.');
      }

      if (context.existing) {
        if (
          context.existing.phone !== phone ||
          (context.existing.request_hash &&
            context.existing.request_hash !== requestHash)
        ) {
          return c.json(
            {
              ok: false,
              error: {
                code: 'idempotency_conflict',
                message: 'This idempotency key belongs to another order.',
              },
            },
            409,
          );
        }
        return c.json({
          ok: true,
          data: {
            number: context.existing.number,
            status: context.existing.status,
            total: context.existing.total,
            created_at: context.existing.created_at,
            existing: true,
          },
        });
      }

      if (context.blocked) {
        return c.json(
          {
            ok: false,
            error: {
              code: 'phone_blocked',
              message:
                'We cannot accept orders from this phone number. Please contact the shop.',
            },
          },
          403,
        );
      }

      if (
        fraudLimitReached(
          config,
          context.phoneOrders24h,
          config.fraud.orderLimitPerPhone24h,
        )
      ) {
        c.header('Retry-After', '3600');
        return c.json(
          {
            ok: false,
            error: {
              code: 'order_rate_limited',
              message:
                'Too many orders were placed from this phone number today. Please contact the shop.',
            },
          },
          429,
        );
      }

      if (
        config.fraud.enabled &&
        config.fraud.advancePaymentForFlaggedPhones &&
        context.advancePaymentRequired &&
        paymentMethod === 'cod'
      ) {
        return c.json(
          {
            ok: false,
            error: {
              code: 'advance_payment_required',
              message:
                'This phone number must pay in advance. Please choose bKash or Nagad.',
            },
          },
          409,
        );
      }

      // The salted IP hash is only needed while the fraud limits are on; with
      // fraud disabled no IP-derived value is computed or stored.
      let ipHash: string | null = null;
      if (remoteIp && config.fraud.enabled) {
        const salt = await ensureIpHashSalt(db, context.settings);
        ipHash = await hashIp(remoteIp, salt);
        const ipOrders = await countRecentIpOrders(db, ipHash, now);
        if (fraudLimitReached(config, ipOrders, config.fraud.orderLimitPerIp24h)) {
          c.header('Retry-After', '3600');
          return c.json(
            {
              ok: false,
              error: {
                code: 'order_rate_limited',
                message:
                  'Too many orders were placed from this network today. Please contact the shop.',
              },
            },
            429,
          );
        }
      }

      const turnstile = readTurnstileConfig(c.env);
      if (turnstile.enabled) {
        const verification = await verifyTurnstile({
          secretKey: turnstile.secretKey,
          token: input.turnstile_token,
          remoteIp,
        });
        if (!verification.ok) {
          return badRequest(
            c,
            'turnstile_failed',
            'Verification failed. Please try again.',
          );
        }
      }

      const priced = await priceCart(db, input.items, config, geo.district.name, {
        couponCode: input.coupon_code ?? null,
      });

      if (priced.coupon_error) {
        return couponErrorResponse(c, priced.coupon_error);
      }

      if (!priced.all_available) {
        return c.json(
          {
            ok: false,
            error: {
              code: 'cart_unavailable',
              message: 'Some items in your cart are no longer available.',
            },
            data: priced,
          },
          409,
        );
      }

      if (priced.shipping_fee === null) {
        return badRequest(c, 'invalid_geo', 'Choose a valid delivery district.');
      }

      const lines: CheckoutLineSnapshot[] = priced.lines.map((line) => ({
        product_id: line.product_id,
        variant_id: line.variant_id,
        title: input.locale === 'bn' && line.title_bn ? line.title_bn : line.title,
        variant_title: line.variant_title,
        variant_options: line.variant_options,
        unit_price: line.unit_price,
        qty: line.qty,
        line_total: line.line_total,
        track_stock: line.track_stock,
      }));

      const result = await createCheckoutOrder({
        db,
        idempotencyKey: input.idempotency_key,
        customer,
        lines,
        subtotal: priced.subtotal,
        discount: priced.discount,
        shippingFee: priced.shipping_fee,
        total: priced.total,
        number: generateOrderNumber(),
        requestHash,
        paymentMethod,
        paymentStatus: paymentMethod === 'cod' ? 'unpaid' : 'pending_verification',
        paymentSender,
        paymentTrxId,
        couponCode: priced.coupon?.code ?? null,
        ipHash,
        now,
      });

      if (result.ok) {
        return c.json(
          {
            ok: true,
            data: {
              number: result.order.number,
              status: result.order.status,
              total: result.order.total,
              created_at: result.order.created_at,
              existing: result.existing,
            },
          },
          result.existing ? 200 : 201,
        );
      }

      if (result.code === 'out_of_stock') {
        return c.json(
          {
            ok: false,
            error: {
              code: 'out_of_stock',
              message: 'One or more items went out of stock. Please review your cart.',
            },
          },
          409,
        );
      }

      if (result.code === 'idempotency_conflict') {
        return c.json(
          {
            ok: false,
            error: {
              code: 'idempotency_conflict',
              message: 'This idempotency key belongs to another order.',
            },
          },
          409,
        );
      }

      if (result.code === 'duplicate_payment_trx') {
        return c.json(
          {
            ok: false,
            error: {
              code: 'duplicate_payment_trx',
              message:
                'This transaction ID has already been used. Please check it and try again.',
            },
          },
          409,
        );
      }

      if (result.code === 'coupon_unavailable') {
        // Re-check the coupon to report the real reason (inactive, expired,
        // below minimum, exhausted) instead of always blaming exhaustion.
        const recheck = await priceCart(db, input.items, config, geo.district.name, {
          couponCode: input.coupon_code ?? null,
        });
        if (recheck.coupon_error) return couponErrorResponse(c, recheck.coupon_error);
        return c.json(
          {
            ok: false,
            error: {
              code: 'coupon_exhausted',
              message: COUPON_ERROR_MESSAGES.coupon_exhausted,
            },
          },
          409,
        );
      }

      const fallback = buildCheckoutFallback({
        config,
        locale: input.locale,
        priced,
        customer,
      });
      return serverUnavailable(
        c,
        'db_unavailable',
        'We could not save your order right now.',
        { fallback },
      );
    } catch (error) {
      if (isD1Unavailable(error)) {
        const fallback = buildCheckoutFallback({
          config: config ?? loadConfigFromRows([]),
          locale: input.locale,
          priced: null,
          customer,
        });
        return serverUnavailable(
          c,
          'db_unavailable',
          'We could not save your order right now.',
          { fallback },
        );
      }
      throw error;
    } finally {
      logQueryCount('checkout', count());
    }
  },
);
