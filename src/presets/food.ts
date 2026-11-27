import type { BusinessPreset } from './types';

export const foodPreset: BusinessPreset = {
  id: 'food',
  label: { en: 'Food & pantry', bn: 'খাদ্য ও মুদি' },
  description: {
    en: 'Ghee, honey, oil and pantry staples with weight options.',
    bn: 'ঘি, মধু, তেল ও মুদি পণ্য, ওজনের অপশনসহ।',
  },
  categories: [
    { slug: 'food', name: 'Food & Pantry', name_bn: 'খাদ্য ও মুদি', sort: 2 },
    { slug: 'ghee-honey', name: 'Ghee & Honey', name_bn: 'ঘি ও মধু', parent: 'food', sort: 1 },
    { slug: 'spices', name: 'Spices', name_bn: 'মসলা', parent: 'food', sort: 2 },
  ],
  attributeFields: [
    { key: 'origin', label: { en: 'Origin', bn: 'উৎস' } },
    { key: 'unit', label: { en: 'Packaging', bn: 'প্যাকেজিং' } },
    { key: 'shelf_life', label: { en: 'Shelf life', bn: 'মেয়াদ' } },
    { key: 'weight', label: { en: 'Weight', bn: 'ওজন' }, options: ['250g', '500g', '1kg'] },
  ],
  products: [
    {
      slug: 'pure-ghee',
      title: 'Pure Ghee',
      title_bn: 'খাঁটি ঘি',
      description: 'Slow-cooked clarified butter from Rajshahi, packed in a glass jar.',
      description_bn: 'রাজশাহীর ধীরে তৈরি খাঁটি ঘি, কাচের জারে সংরক্ষিত।',
      category: 'ghee-honey',
      price: 900,
      compareAtPrice: null,
      attributes: { origin: 'Rajshahi', unit: 'Glass jar', shelf_life: '6 months' },
      featured: true,
      variants: [
        {
          sku: 'GHEE-250',
          title: '250g',
          options: { weight: '250g' },
          price: 500,
          stock: 15,
        },
        {
          sku: 'GHEE-500',
          title: '500g',
          options: { weight: '500g' },
          price: 900,
          stock: 10,
        },
      ],
    },
    {
      slug: 'mustard-oil',
      title: 'Mustard Oil',
      title_bn: 'সরিষার তেল',
      description: 'Cold-pressed mustard oil in a food-grade bottle.',
      description_bn: 'খাদ্য উপযোগী বোতলে কোল্ড-প্রেসড সরিষার তেল।',
      category: 'food',
      price: 320,
      compareAtPrice: null,
      attributes: { origin: 'Faridpur', unit: 'Plastic bottle', shelf_life: '12 months' },
      variants: [
        {
          sku: 'OIL-1L',
          title: '1L',
          options: { weight: '1kg' },
          stock: 20,
        },
      ],
    },
  ],
};
