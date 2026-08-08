import { z } from "zod";
import { DISTRICTS } from "./constants";

export const emailSchema = z.string().email().max(160).toLowerCase().trim();
export const phoneSchema = z
  .string()
  .regex(/^\+?(88)?0?1[3-9]\d{8}$/, "Invalid Bangladeshi phone number")
  .or(z.string().max(30));
export const passwordSchema = z.string().min(8).max(128);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
  search: z.string().max(200).optional(),
  sort: z.string().max(40).optional(),
});

export const idParamSchema = z.object({
  id: z.string().min(1).max(80),
});

export const slugParamSchema = z.object({
  slug: z.string().min(1).max(200),
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: emailSchema,
  phone: phoneSchema.optional(),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const resetPasswordRequestSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: passwordSchema,
});

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const addressSchema = z.object({
  type: z.enum(["SHIPPING", "BILLING"]).default("SHIPPING"),
  label: z.string().max(40).optional(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().max(80).optional(),
  company: z.string().max(120).optional(),
  line1: z.string().min(3).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().max(80).optional(),
  district: z.string().refine((d) => DISTRICTS.includes(d as (typeof DISTRICTS)[number]), {
    message: "Invalid district",
  }),
  upazila: z.string().max(80).optional(),
  postalCode: z.string().max(20).optional(),
  phone: z.string().min(8).max(30),
  isDefault: z.boolean().optional(),
});

export const productImageSchema = z.object({
  src: z.string().max(600),
  alt: z.string().max(200).optional(),
});

export const productSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).optional(),
  summary: z.string().max(500).optional(),
  description: z.string().max(100_000).optional(),
  specifications: z.array(z.object({ label: z.string().max(100), value: z.string().max(300) })).optional(),
  pricePaisa: z.coerce.number().int().min(0),
  compareAtPaisa: z.coerce.number().int().min(0).optional().nullable(),
  costPaisa: z.coerce.number().int().min(0).optional().nullable(),
  sku: z.string().max(60).optional().nullable(),
  barcode: z.string().max(80).optional().nullable(),
  categoryId: z.string().max(80).optional().nullable(),
  brandId: z.string().max(80).optional().nullable(),
  images: z.array(productImageSchema).max(30).optional(),
  coverImage: z.string().max(600).optional().nullable(),
  videoUrl: z.string().max(600).optional().nullable(),
  tags: z.array(z.string().max(40)).max(30).optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  isBestSeller: z.boolean().optional(),
  isNewArrival: z.boolean().optional(),
  label: z.enum(["HOT", "NEW", "SALE"]).optional().nullable(),
  stock: z.coerce.number().int().min(0).default(0),
  lowStockThreshold: z.coerce.number().int().min(0).default(5),
  weight: z.coerce.number().int().min(0).optional().nullable(),
  saleEndsAt: z.coerce.number().int().optional().nullable(),
  metaTitle: z.string().max(160).optional().nullable(),
  metaDescription: z.string().max(300).optional().nullable(),
  variants: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1).max(120),
        options: z.record(z.string()).optional(),
        sku: z.string().max(60).optional(),
        pricePaisa: z.coerce.number().int().min(0).optional(),
        stock: z.coerce.number().int().min(0).default(0),
        image: z.string().max(600).optional(),
      }),
    )
    .optional(),
});

export const categorySchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().max(160).optional(),
  description: z.string().max(2000).optional(),
  image: z.string().max(600).optional(),
  parentId: z.string().max(80).optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  metaTitle: z.string().max(160).optional(),
  metaDescription: z.string().max(300).optional(),
});

export const brandSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().max(160).optional(),
  logo: z.string().max(600).optional(),
  description: z.string().max(2000).optional(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().optional(),
});

export const reviewSchema = z.object({
  productId: z.string().min(1).max(80),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().max(200).optional(),
  body: z.string().min(3).max(5000),
  images: z.array(z.string().max(600)).max(6).optional(),
});

export const reviewAdminSchema = z.object({
  isApproved: z.boolean().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  body: z.string().min(3).max(5000).optional(),
});

// ---------------------------------------------------------------------------
// Cart & checkout
// ---------------------------------------------------------------------------

export const cartItemInputSchema = z.object({
  productId: z.string().min(1).max(80),
  variantId: z.string().max(80).optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(99),
});

export const couponApplySchema = z.object({
  code: z.string().min(2).max(40).toUpperCase(),
  subtotalPaisa: z.coerce.number().int().min(0),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1).max(80),
        variantId: z.string().max(80).optional().nullable(),
        name: z.string().max(200).optional(),
        quantity: z.coerce.number().int().min(1),
        unitPricePaisa: z.coerce.number().int().min(0),
        categoryId: z.string().max(80).optional().nullable(),
      }),
    )
    .max(100)
    .optional(),
});

export const shippingEstimateSchema = z.object({
  district: z.string().min(1).max(80),
  upazila: z.string().max(80).optional(),
  subtotalPaisa: z.coerce.number().int().min(0).default(0),
});

export const checkoutSchema = z.object({
  email: z.string().email().max(160),
  phone: phoneSchema,
  name: z.string().min(2).max(160).optional(),
  paymentMethod: z.enum(["COD", "BKASH", "NAGAD", "ROCKET", "UPAY", "BANK_TRANSFER"]),
  shippingAddress: addressSchema,
  billingSameAsShipping: z.boolean().optional(),
  billingAddress: addressSchema.optional(),
  couponCode: z.string().max(40).optional(),
  notes: z.string().max(2000).optional(),
  shipFrom: z
    .object({
      district: z.string().max(80).optional(),
      upazila: z.string().max(80).optional(),
      area: z.string().max(120).optional(),
      deliveryType: z.enum(["INSIDE_DHAKA", "OUTSIDE_DHAKA", "DISTRICT"]).optional(),
    })
    .optional(),
});

export const txnVerifySchema = z.object({
  orderId: z.string().min(1).max(80),
  txnId: z.string().min(3).max(120),
  amountPaisa: z.coerce.number().int().min(0).optional(),
  method: z.string().max(40).optional(),
});

export const orderStatusSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "RETURNED", "CANCELLED", "REFUNDED"]),
  note: z.string().max(2000).optional(),
  trackingNumber: z.string().max(120).optional(),
  courier: z.string().max(40).optional(),
});

export const orderNumberParamSchema = z.object({
  orderNumber: z.string().min(4).max(40),
});

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

export const couponSchema = z.object({
  code: z.string().min(2).max(40).toUpperCase(),
  type: z.enum(["PERCENTAGE", "FIXED", "FREE_SHIPPING", "BUY_X_GET_Y"]),
  value: z.coerce.number().int().min(0),
  minSubtotalPaisa: z.coerce.number().int().min(0).default(0),
  maxDiscountPaisa: z.coerce.number().int().min(0).optional().nullable(),
  usageLimit: z.coerce.number().int().min(0).optional().nullable(),
  perUserLimit: z.coerce.number().int().min(1).default(1),
  appliesTo: z.enum(["ALL", "CATEGORY", "PRODUCT"]).default("ALL"),
  appliesToId: z.string().max(80).optional().nullable(),
  buyX: z.coerce.number().int().min(1).optional(),
  getY: z.coerce.number().int().min(1).optional(),
  startsAt: z.coerce.number().int().optional().nullable(),
  expiresAt: z.coerce.number().int().optional().nullable(),
  isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Settings & admin
// ---------------------------------------------------------------------------

export const settingsPatchSchema = z.object({
  key: z.string().min(1).max(80),
  value: z.record(z.unknown()),
});

export const menuItemSchema = z.object({
  label: z.string().min(1).max(120),
  url: z.string().max(300),
  type: z.enum(["URL", "PRODUCT", "CATEGORY", "PAGE"]).default("URL"),
  location: z.enum(["HEADER", "FOOTER"]).default("HEADER"),
  sortOrder: z.coerce.number().int().default(0),
  parentId: z.string().max(80).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const pageSchema = z.object({
  slug: z.string().min(1).max(160),
  title: z.string().min(1).max(200),
  content: z.string().max(100_000).optional(),
  metaTitle: z.string().max(160).optional(),
  metaDescription: z.string().max(300).optional(),
  isPublished: z.boolean().optional(),
});

export const blogPostSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().max(200).optional(),
  excerpt: z.string().max(500).optional(),
  content: z.string().max(100_000).optional(),
  coverImage: z.string().max(600).optional(),
  categoryId: z.string().max(80).optional().nullable(),
  isPublished: z.boolean().optional(),
  publishedAt: z.coerce.number().int().optional().nullable(),
  metaTitle: z.string().max(160).optional(),
  metaDescription: z.string().max(300).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

export const blogCategorySchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().max(160).optional(),
});

export const shippingZoneSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["COUNTRYWIDE", "DHAKA", "OUTSIDE_DHAKA", "DISTRICT", "UPAZILA"]),
  district: z.string().max(80).optional(),
  upazila: z.string().max(80).optional(),
  chargePaisa: z.coerce.number().int().min(0),
  freeOverPaisa: z.coerce.number().int().min(0).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const couponBulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export const productBulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  patch: z.object({
    isActive: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    isBestSeller: z.boolean().optional(),
    label: z.enum(["HOT", "NEW", "SALE"]).optional().nullable(),
    categoryId: z.string().max(80).optional().nullable(),
    brandId: z.string().max(80).optional().nullable(),
    stock: z.coerce.number().int().optional(),
    pricePaisa: z.coerce.number().int().optional(),
  }),
});

export const notificationSchema = z.object({
  type: z.string().max(40).optional(),
  title: z.string().min(1).max(200),
  body: z.string().max(1000).optional(),
  link: z.string().max(300).optional(),
});

export const testimonialSchema = z.object({
  name: z.string().min(1).max(120),
  role: z.string().max(120).optional(),
  content: z.string().min(1).max(2000),
  rating: z.coerce.number().int().min(1).max(5).default(5),
  image: z.string().max(600).optional(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().optional(),
});

export const bannerSchema = z.object({
  title: z.string().max(200).optional(),
  subtitle: z.string().max(400).optional(),
  image: z.string().max(600).optional(),
  link: z.string().max(300).optional(),
  position: z.string().max(40).default("HOMEPAGE_HERO"),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().optional(),
  startsAt: z.coerce.number().int().optional().nullable(),
  expiresAt: z.coerce.number().int().optional().nullable(),
});

export const adminUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(["ADMIN", "STAFF"]).default("STAFF"),
});

export const userUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: phoneSchema.optional(),
  avatar: z.string().max(600).optional(),
  isActive: z.boolean().optional(),
  loyaltyPoints: z.coerce.number().int().optional(),
});

export const profileUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: phoneSchema.optional(),
  avatar: z.string().max(600).optional(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const newsletterSchema = z.object({
  email: emailSchema,
});

export const contactSchema = z.object({
  name: z.string().min(2).max(120),
  email: emailSchema,
  phone: phoneSchema.optional(),
  subject: z.string().max(200).optional(),
  message: z.string().min(3).max(5000),
});
