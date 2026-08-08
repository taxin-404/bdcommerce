import type { OrderStatus, PaymentStatus } from "./constants";

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
  status: number;
}

export interface ApiListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  [key: string]: unknown;
}

// Public product shape returned by the API to the storefront
export interface ProductDto {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  pricePaisa: number;
  compareAtPaisa: number | null;
  coverImage: string | null;
  images: { src: string; alt?: string }[];
  category: { id: string; name: string; slug: string } | null;
  brand: { id: string; name: string; slug: string; logo: string | null } | null;
  rating: number | null;
  reviewCount: number;
  stock: number;
  tags: string[];
  label: string | null;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  saleEndsAt: number | null;
  variants: VariantDto[];
  specs: { label: string; value: string }[];
}

export interface VariantDto {
  id: string;
  name: string;
  options: Record<string, string>;
  sku: string | null;
  pricePaisa: number | null;
  stock: number;
  image: string | null;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  subtotalPaisa: number;
  discountPaisa: number;
  shippingPaisa: number;
  taxPaisa: number;
  totalPaisa: number;
  email: string;
  phone: string | null;
  name: string | null;
  shippingAddress: Record<string, unknown> | null;
  items: unknown[];
  couponCode: string | null;
  trackingNumber: string | null;
  courier: string | null;
  txnId: string | null;
  notes: string | null;
  placedAt: number;
}
