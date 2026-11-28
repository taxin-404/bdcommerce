import type { SiteConfig } from './src/lib/config';

const config = {
  name: { en: 'My Shop', bn: 'আমার দোকান' },
  tagline: {
    en: 'Quality products, delivered across Bangladesh',
    bn: 'মানসম্মত পণ্য, সারা বাংলাদেশে ডেলিভারি',
  },
  logo: '/logo.svg',
  theme: {
    preset: 'clean',
    primary: '#0f766e',
    accent: '#f59e0b',
    radius: '0.75rem',
    font: 'Hind Siliguri',
  },
  locale: { default: 'bn', available: ['bn', 'en'] },
  currency: { code: 'BDT', symbol: '৳', bnDigits: true },
  features: {
    stockTracking: true,
    variants: true,
    coupons: true,
    guestCheckout: true,
    reviews: false,
  },
  shipping: {
    zones: [
      { id: 'dhaka', label: { en: 'Inside Dhaka', bn: 'ঢাকার ভিতরে' }, fee: 60 },
      { id: 'outside', label: { en: 'Outside Dhaka', bn: 'ঢাকার বাইরে' }, fee: 120 },
    ],
    freeShippingOver: null,
  },
  payments: {
    cod: { enabled: true },
    bkash: { enabled: true, number: '01XXXXXXXXX', type: 'personal' },
    nagad: { enabled: false, number: '', type: 'personal' },
  },
  social: { facebook: '', messenger: '', whatsapp: '', instagram: '' },
  tracking: { fbPixelId: '', capi: false },
  fraud: {
    enabled: true,
    orderLimitPerPhone24h: 5,
    orderLimitPerIp24h: 50,
    advancePaymentForFlaggedPhones: true,
  },
  contact: { phone: '', email: '', address: { en: '', bn: '' } },
} satisfies SiteConfig;

export default config;
