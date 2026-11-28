import { z } from 'zod';
import { ORDER_STATUSES } from '../order-status';

export const idParamSchema = z.coerce.number().int().positive();

export const orderStatusSchema = z.enum(ORDER_STATUSES);

export const orderStatusUpdateSchema = z.object({
  status: orderStatusSchema,
  note: z.string().trim().max(500).nullable().optional(),
});

export const paymentActionSchema = z.object({
  action: z.enum(['verify', 'reject', 'reverify']),
  note: z.string().trim().max(500).nullable().optional(),
});

const optionalIsoDate = z
  .string()
  .trim()
  .max(40)
  .nullable()
  .optional()
  .transform((value) => (value ? value : null))
  .refine(
    (value) =>
      value === null ||
      (value.includes('T') && !Number.isNaN(Date.parse(value))),
    'Invalid date',
  );

const couponCodeSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, digits, dashes, or underscores')
  .transform((value) => value.toUpperCase());

const couponFieldsShape = {
  type: z.enum(['percent', 'fixed']),
  value: z.number().int().positive().max(1_000_000_000),
  min_subtotal: z.number().int().nonnegative().max(1_000_000_000),
  max_uses: z.number().int().positive().max(1_000_000).nullable(),
  starts_at: optionalIsoDate,
  ends_at: optionalIsoDate,
  active: z.boolean(),
};

function refineCoupon(
  value: {
    type: 'percent' | 'fixed';
    value: number;
    starts_at?: string | null;
    ends_at?: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (value.type === 'percent' && value.value > 100) {
    ctx.addIssue({
      code: 'custom',
      path: ['value'],
      message: 'Percentage coupons must be between 1 and 100',
    });
  }
  if (value.starts_at && value.ends_at && value.ends_at <= value.starts_at) {
    ctx.addIssue({
      code: 'custom',
      path: ['ends_at'],
      message: 'The end date must be after the start date',
    });
  }
}

export const couponFieldsSchema = z
  .object(couponFieldsShape)
  .superRefine((value, ctx) => refineCoupon(value, ctx));

export const couponInputSchema = z
  .object({
    code: couponCodeSchema,
    ...couponFieldsShape,
    min_subtotal: couponFieldsShape.min_subtotal.default(0),
    max_uses: couponFieldsShape.max_uses.optional(),
    active: couponFieldsShape.active.default(true),
  })
  .superRefine((value, ctx) => refineCoupon(value, ctx));

export const couponPatchSchema = z.object(couponFieldsShape).partial();



export const blocklistInputSchema = z.object({
  phone: z.string().trim().min(1).max(30),
  reason: z.string().trim().max(200).nullable().optional(),
});

export const blocklistPhoneParamSchema = z.object({
  phone: z.string().trim().min(1).max(30),
});

export const courierActionSchema = z.object({
  action: z.enum(['send', 'refresh']),
});

export const phoneFlagUpdateSchema = z.object({
  flagged: z.boolean(),
  reason: z.string().trim().max(200).nullable().optional(),
});

export const loginSchema = z.object({
  passphrase: z.string().min(1).max(500),
});

const categoryFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  name_bn: z.string().trim().max(120).nullable().optional(),
  slug: z.string().trim().max(80).nullable().optional(),
  parent_id: z.number().int().positive().nullable().optional(),
  sort: z.number().int().min(0).max(9999),
  active: z.boolean(),
});

export const categoryInputSchema = categoryFieldsSchema.extend({
  sort: categoryFieldsSchema.shape.sort.default(0),
  active: categoryFieldsSchema.shape.active.default(true),
});

export const categoryPatchSchema = categoryFieldsSchema.partial();

const variantFieldsSchema = z.object({
  sku: z.string().trim().max(80).nullable().optional(),
  title: z.string().trim().min(1).max(160),
  options: z.record(z.string(), z.string()),
  price: z.number().int().nonnegative().max(1_000_000_000).nullable().optional(),
  stock: z.number().int().nonnegative(),
  active: z.boolean(),
});

export const variantInputSchema = variantFieldsSchema.extend({
  id: z.number().int().positive().optional(),
  options: variantFieldsSchema.shape.options.default({}),
  stock: variantFieldsSchema.shape.stock.default(0),
  active: variantFieldsSchema.shape.active.default(true),
});

export const variantUpdateSchema = variantFieldsSchema.partial().extend({
  id: z.number().int().positive(),
});

const productFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  title_bn: z.string().trim().max(200).nullable().optional(),
  slug: z.string().trim().max(100).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  description_bn: z.string().max(5000).nullable().optional(),
  category_id: z.number().int().positive().nullable().optional(),
  price: z.number().int().nonnegative().max(1_000_000_000),
  compare_at_price: z
    .number()
    .int()
    .nonnegative()
    .max(1_000_000_000)
    .nullable()
    .optional(),
  status: z.enum(['draft', 'active', 'archived']),
  track_stock: z.boolean(),
  attributes: z.record(z.string(), z.string()),
  featured: z.boolean(),
  variants: z.array(variantInputSchema).max(100),
});

export const productInputSchema = productFieldsSchema.extend({
  status: productFieldsSchema.shape.status.default('draft'),
  track_stock: productFieldsSchema.shape.track_stock.default(true),
  attributes: productFieldsSchema.shape.attributes.default({}),
  featured: productFieldsSchema.shape.featured.default(false),
  variants: productFieldsSchema.shape.variants.default([]),
});

export const productPatchSchema = productFieldsSchema.partial().extend({
  variants: z.array(z.union([variantUpdateSchema, variantInputSchema])).max(100).optional(),
});

export const imageUploadMetaSchema = z.object({
  product_id: z.coerce.number().int().positive(),
  alt: z.string().trim().max(200).optional(),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type CategoryPatchInput = z.infer<typeof categoryPatchSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductPatchInput = z.infer<typeof productPatchSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;
export type VariantUpdateInput = z.infer<typeof variantUpdateSchema>;
