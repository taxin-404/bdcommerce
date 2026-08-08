export const ROLES = ["CUSTOMER", "ADMIN", "STAFF"] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
  "RETURNED",
  "CANCELLED",
  "REFUNDED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["UNPAID", "PENDING", "PAID", "REFUNDED", "FAILED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = [
  "COD",
  "BKASH",
  "NAGAD",
  "ROCKET",
  "UPAY",
  "BANK_TRANSFER",
  "SSLCOMMERZ",
] as const;
export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number];

export const COURIER_PROVIDERS = ["MANUAL", "PATHOA", "STEADFAST", "REDX", "PAPERFLY"] as const;
export type CourierProvider = (typeof COURIER_PROVIDERS)[number];

export const COUPON_TYPES = ["PERCENTAGE", "FIXED", "FREE_SHIPPING", "BUY_X_GET_Y"] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export const PRODUCT_LABELS = ["HOT", "NEW", "SALE"] as const;
export type ProductLabel = (typeof PRODUCT_LABELS)[number];

// ---------------------------------------------------------------------------
// Order status -> next allowed transitions
// ---------------------------------------------------------------------------

export const ORDER_FLOW: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PACKED", "CANCELLED", "REFUNDED"],
  PACKED: ["SHIPPED", "CANCELLED", "REFUNDED"],
  SHIPPED: ["DELIVERED", "RETURNED", "CANCELLED"],
  DELIVERED: ["RETURNED", "REFUNDED"],
  RETURNED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  COD: "Cash on Delivery",
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket (DBBL)",
  UPAY: "Upay",
  BANK_TRANSFER: "Bank Transfer",
  SSLCOMMERZ: "SSLCommerz",
};

// ---------------------------------------------------------------------------
// Shipping zones
// ---------------------------------------------------------------------------

export const SHIPPING_ZONE_TYPES = [
  "COUNTRYWIDE",
  "DHAKA",
  "OUTSIDE_DHAKA",
  "DISTRICT",
  "UPAZILA",
] as const;
export type ShippingZoneType = (typeof SHIPPING_ZONE_TYPES)[number];

// The 64 districts of Bangladesh
export const DISTRICTS = [
  "Bagerhat", "Bandarban", "Barguna", "Barishal", "Bhola", "Bogura", "Brahmanbaria",
  "Chandpur", "Chattogram", "Chuadanga", "Cumilla", "Cox's Bazar", "Dhaka", "Dinajpur",
  "Faridpur", "Feni", "Gaibandha", "Gazipur", "Gopalganj", "Habiganj", "Jamalpur",
  "Jashore", "Jhalokati", "Jhenaidah", "Joypurhat", "Khagrachhari", "Khulna", "Kishoreganj",
  "Kurigram", "Kushtia", "Lakshmipur", "Lalmonirhat", "Madaripur", "Magura", "Manikganj",
  "Meherpur", "Moulvibazar", "Munshiganj", "Mymensingh", "Naogaon", "Narail", "Narayanganj",
  "Narsingdi", "Natore", "Nawabganj", "Netrokona", "Nilphamari", "Noakhali", "Pabna",
  "Panchagarh", "Patuakhali", "Pirojpur", "Rajbari", "Rajshahi", "Rangamati", "Rangpur",
  "Satkhira", "Shariatpur", "Sherpur", "Sirajganj", "Sunamganj", "Sylhet", "Tangail", "Thakurgaon",
] as const;

export const isInsideDhaka = (district: string) => district === "Dhaka";

// ---------------------------------------------------------------------------
// Settings keys
// ---------------------------------------------------------------------------

export const SETTING_KEYS = {
  SITE: "site",
  THEME: "theme",
  SEO: "seo",
  SHIPPING: "shipping",
  CONTACT: "contact",
  SOCIAL: "social",
  EMAIL: "email",
  SMS: "sms",
  WHATSAPP: "whatsapp",
  ANALYTICS: "analytics",
  HOMEPAGE: "homepage_sections",
  STORE: "store",
} as const;

// ---------------------------------------------------------------------------
// Homepage builder sections (orderable, enabled/disabled)
// ---------------------------------------------------------------------------

export const HOMEPAGE_SECTIONS = [
  "hero",
  "featuredCategories",
  "flashSale",
  "promoBanner",
  "trending",
  "bestSellers",
  "newArrivals",
  "brandLogos",
  "testimonials",
  "instagram",
  "blog",
  "newsletter",
] as const;
export type HomepageSection = (typeof HOMEPAGE_SECTIONS)[number];

export const HOMEPAGE_SECTION_LABELS: Record<HomepageSection, string> = {
  hero: "Hero Slider",
  featuredCategories: "Featured Categories",
  flashSale: "Flash Sale",
  promoBanner: "Promotional Banner",
  trending: "Trending Products",
  bestSellers: "Best Sellers",
  newArrivals: "New Arrivals",
  brandLogos: "Brand Logos",
  testimonials: "Testimonials",
  instagram: "Instagram Feed",
  blog: "Blog",
  newsletter: "Newsletter",
};
