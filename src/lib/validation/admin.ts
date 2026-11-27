import { z } from 'zod';

export const idParamSchema = z.coerce.number().int().positive();

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
  price: z.number().int().nonnegative().nullable().optional(),
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
  price: z.number().int().nonnegative(),
  compare_at_price: z.number().int().nonnegative().nullable().optional(),
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
