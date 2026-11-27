import type { BusinessPreset } from './types';

export const electronicsPreset: BusinessPreset = {
  id: 'electronics',
  label: { en: 'Electronics', bn: 'ইলেকট্রনিক্স' },
  description: {
    en: 'Audio, charging and everyday gadgets with specification fields.',
    bn: 'অডিও, চার্জিং ও প্রতিদিনের গ্যাজেট, স্পেসিফিকেশন ফিল্ডসহ।',
  },
  categories: [
    { slug: 'electronics', name: 'Electronics', name_bn: 'ইলেকট্রনিক্স', sort: 3 },
    { slug: 'audio', name: 'Audio', name_bn: 'অডিও', parent: 'electronics', sort: 1 },
    {
      slug: 'accessories',
      name: 'Accessories',
      name_bn: 'অ্যাকসেসরিজ',
      parent: 'electronics',
      sort: 2,
    },
  ],
  attributeFields: [
    { key: 'bluetooth', label: { en: 'Bluetooth', bn: 'ব্লুটুথ' } },
    { key: 'battery', label: { en: 'Battery', bn: 'ব্যাটারি' } },
    { key: 'charging', label: { en: 'Charging', bn: 'চার্জিং' } },
    { key: 'warranty', label: { en: 'Warranty', bn: 'ওয়ারেন্টি' } },
  ],
  products: [
    {
      slug: 'wireless-earbuds',
      title: 'Wireless Earbuds',
      title_bn: 'ওয়্যারলেস ইয়ারবাডস',
      description: 'Everyday Bluetooth earbuds with USB-C charging and a pocket case.',
      description_bn: 'প্রতিদিনের ব্যবহারের জন্য ব্লুটুথ ইয়ারবাডস, ইউএসবি-সি চার্জিং ও পকেট কেস।',
      category: 'audio',
      price: 2490,
      compareAtPrice: 2990,
      attributes: {
        bluetooth: '5.3',
        battery: '6 hours',
        charging: 'USB-C',
        warranty: '6 months',
      },
      featured: true,
      variants: [
        {
          sku: 'BUDS-BLACK',
          title: 'Black',
          options: { color: 'Black' },
          stock: 12,
        },
        {
          sku: 'BUDS-WHITE',
          title: 'White',
          options: { color: 'White' },
          stock: 8,
        },
      ],
    },
    {
      slug: 'power-bank-10000',
      title: '10,000 mAh Power Bank',
      title_bn: '১০,০০০ mAh পাওয়ার ব্যাংক',
      description: 'Slim power bank with fast charging for phones and earbuds.',
      description_bn: 'ফোন ও ইয়ারবাডসের জন্য দ্রুত চার্জিংসহ স্লিম পাওয়ার ব্যাংক।',
      category: 'accessories',
      price: 1650,
      compareAtPrice: null,
      attributes: {
        battery: '10,000 mAh',
        charging: '20W USB-C',
        warranty: '3 months',
      },
      variants: [
        {
          sku: 'PB-10000',
          title: 'Standard',
          options: {},
          stock: 15,
        },
      ],
    },
  ],
};
