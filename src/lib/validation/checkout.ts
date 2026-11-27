import { z } from 'zod';
import { MAX_CART_LINES, MAX_LINE_QTY, hasDuplicateCartLines } from '../cart';

export const cartItemInputSchema = z.object({
  product_id: z.number().int().positive(),
  variant_id: z.number().int().positive().nullable().optional(),
  qty: z.number().int().min(1).max(MAX_LINE_QTY),
});

export const cartItemsSchema = z
  .array(cartItemInputSchema)
  .min(1)
  .max(MAX_CART_LINES)
  .refine((items) => !hasDuplicateCartLines(items), {
    message: 'Each product/variant may appear only once',
  })
  .transform((items) =>
    items.map((item) => ({
      product_id: item.product_id,
      variant_id: item.variant_id ?? null,
      qty: item.qty,
    })),
  );

export const cartPriceSchema = z.object({
  items: cartItemsSchema,
  district: z.string().trim().max(80).optional(),
});

const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .refine((value) => value === '' || z.email().safeParse(value).success, 'Invalid email')
  .nullable()
  .optional()
  .transform((value) => (value ? value : null));

const customerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(11).max(20),
  email: optionalEmail,
  division: z.string().trim().min(1).max(80),
  district: z.string().trim().min(1).max(80),
  upazila: z.string().trim().min(1).max(80),
  address: z.string().trim().min(5).max(500),
  note: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
});

export const checkoutSchema = z.object({
  idempotency_key: z
    .string()
    .trim()
    .min(8)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, digits, dashes, or underscores'),
  locale: z.enum(['bn', 'en']).default('bn'),
  customer: customerSchema,
  items: cartItemsSchema,
  payment_method: z.literal('cod'),
  turnstile_token: z.string().trim().max(2048).optional(),
});

export const trackSchema = z.object({
  order_number: z
    .string()
    .trim()
    .min(6)
    .max(32)
    .regex(/^[A-Za-z0-9]+$/)
    .transform((value) => value.toUpperCase()),
  phone: z.string().trim().min(11).max(20),
});

export type CartItemInputParsed = z.infer<typeof cartItemInputSchema>;
export type CartPriceInput = z.infer<typeof cartPriceSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type TrackInput = z.infer<typeof trackSchema>;
