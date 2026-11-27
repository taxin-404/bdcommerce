import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { createCheckoutOrder, type CheckoutLineSnapshot } from '../../lib/checkout';
import { loadConfig, loadConfigFromRows, type SiteConfig } from '../../lib/config';
import { isD1Unavailable } from '../../lib/db-errors';
import { buildCheckoutFallback } from '../../lib/fallback';
import { resolveGeoSelection } from '../../lib/geo';
import { isAllowedOrigin } from '../../lib/http';
import { findOrderByIdempotencyKey, generateOrderNumber } from '../../lib/orders';
import { normalizePhone } from '../../lib/phone';
import { priceCart } from '../../lib/pricing';
import { countRoundTrips, logQueryCount } from '../../lib/query-log';
import { checkoutRequestHash } from '../../lib/request-hash';
import { readTurnstileConfig, verifyTurnstile } from '../../lib/turnstile';
import { checkoutSchema } from '../../lib/validation/checkout';
import { badRequest, serverUnavailable, validationErrorResponse } from '../validation';

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

    const requestHash = await checkoutRequestHash({
      customer,
      items: input.items,
      paymentMethod: input.payment_method,
    });
    let config: SiteConfig | null = null;

    try {
      config = await loadConfig(db);

      if (!config.payments.cod.enabled) {
        return badRequest(c, 'payment_unavailable', 'Cash on delivery is not available.');
      }

      const existing = await findOrderByIdempotencyKey(db, input.idempotency_key);
      if (existing) {
        if (
          existing.phone !== phone ||
          (existing.request_hash && existing.request_hash !== requestHash)
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
            number: existing.number,
            status: existing.status,
            total: existing.total,
            created_at: existing.created_at,
            existing: true,
          },
        });
      }

      const turnstile = readTurnstileConfig(c.env);
      if (turnstile.enabled) {
        const verification = await verifyTurnstile({
          secretKey: turnstile.secretKey,
          token: input.turnstile_token,
          remoteIp: c.req.header('cf-connecting-ip') ?? null,
        });
        if (!verification.ok) {
          return badRequest(
            c,
            'turnstile_failed',
            'Verification failed. Please try again.',
          );
        }
      }

      const priced = await priceCart(db, input.items, config, geo.district.name);

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
        shippingFee: priced.shipping_fee,
        total: priced.total,
        number: generateOrderNumber(),
        requestHash,
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
