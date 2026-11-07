import { z } from "zod";
import { BD_DIVISIONS, isValidDistrict } from "./bd-address";
export * from "./bd-address";

export const PRODUCT_TYPES = ["physical", "digital", "service"] as const;
export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export const ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled", "returned"] as const;
export const PAYMENT_METHODS = ["cod", "bkash", "sslcommerz"] as const;
export const PAYMENT_STATUSES = ["unpaid", "paid", "failed", "refunded"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface StoreTheme { logoKey?: string; primaryColor?: string; bannerKey?: string }
export interface StoreSettings {
  // all money values are in poisha (1 BDT = 100 poisha)
  shipping?: { insideDhaka?: number; outsideDhaka?: number };
  contact?: { phone?: string; whatsapp?: string; messenger?: string };
  facebookPixelId?: string;
}

/** Money helper: BDT -> poisha */
export const taka = (n: number) => Math.round(n * 100);

export const BD_PHONE = /^(?:\+?88)?01[3-9]\d{8}$/;
export const normalizePhone = (p: string) => p.replace(/[\s-]/g, "").replace(/^\+?88/, "");

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";

export const checkoutSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().regex(BD_PHONE, "Invalid Bangladeshi phone number").transform(normalizePhone),
    email: z.string().email().optional(),
  }),
  shipping: z.object({
    division: z.string().refine((d) => d in BD_DIVISIONS, "Unknown division"),
    district: z.string(),
    upazila: z.string().max(100).optional(),
    area: z.string().max(100).optional(),
    addressLine: z.string().trim().min(5).max(300),
  }).refine((s) => isValidDistrict(s.division, s.district), { message: "District does not belong to division", path: ["district"] }),
  items: z.array(z.object({ variantId: z.string().min(1), quantity: z.number().int().min(1).max(100) })).min(1).max(50),
  paymentMethod: z.enum(PAYMENT_METHODS).default("cod"),
  note: z.string().max(500).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().regex(slugRe).optional(),
  type: z.enum(PRODUCT_TYPES).default("physical"),
  status: z.enum(PRODUCT_STATUSES).default("draft"),
  description: z.string().max(10000).optional(),
  categoryId: z.string().optional(),
  basePrice: z.number().int().min(0), // poisha
  attributes: z.record(z.unknown()).default({}),
  images: z.array(z.string()).max(20).default([]), // R2 keys
  variants: z.array(z.object({
    sku: z.string().min(1).max(64),
    title: z.string().min(1).max(100).default("Default"),
    price: z.number().int().min(0),
    compareAtPrice: z.number().int().min(0).optional(),
    stock: z.number().int().min(0).nullable().default(null), // null = not tracked
    options: z.record(z.string()).default({}), // { size: "M", color: "Red" }
    weightGrams: z.number().int().min(0).optional(),
  })).max(100).default([]),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  courier: z.string().max(50).optional(),
  trackingCode: z.string().max(100).optional(),
});

export const blockPhoneSchema = z.object({
  phone: z.string().regex(BD_PHONE).transform(normalizePhone),
  reason: z.string().max(200).optional(),
});
