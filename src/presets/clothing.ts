import type { BusinessPreset } from './types';

export const clothingPreset: BusinessPreset = {
  id: 'clothing',
  label: { en: 'Clothing', bn: 'পোশাক' },
  description: {
    en: 'Panjabi, saree and everyday wear with size and colour options.',
    bn: 'পাঞ্জাবি, শাড়ি ও প্রতিদিনের পোশাক, সাইজ ও রঙের অপশনসহ।',
  },
  categories: [
    { slug: 'clothing', name: 'Clothing', name_bn: 'পোশাক', sort: 1 },
    { slug: 'panjabi', name: 'Panjabi', name_bn: 'পাঞ্জাবি', parent: 'clothing', sort: 1 },
    { slug: 'saree', name: 'Saree', name_bn: 'শাড়ি', parent: 'clothing', sort: 2 },
  ],
  attributeFields: [
    { key: 'fabric', label: { en: 'Fabric', bn: 'কাপড়' } },
    { key: 'fit', label: { en: 'Fit', bn: 'ফিট' } },
    { key: 'care', label: { en: 'Care', bn: 'যত্ন' } },
    { key: 'size', label: { en: 'Size', bn: 'সাইজ' }, options: ['S', 'M', 'L', 'XL'] },
    { key: 'color', label: { en: 'Colour', bn: 'রঙ' } },
  ],
  products: [
    {
      slug: 'cotton-panjabi',
      title: 'Cotton Panjabi',
      title_bn: 'কটন পাঞ্জাবি',
      description: 'A breathable cotton panjabi for everyday wear and festive occasions.',
      description_bn: 'প্রতিদিনের ব্যবহার ও উৎসবের জন্য আরামদায়ক কটন পাঞ্জাবি।',
      category: 'panjabi',
      price: 1250,
      compareAtPrice: 1500,
      attributes: { fabric: '100% cotton', fit: 'regular', care: 'Machine wash cold' },
      featured: true,
      variants: [
        {
          sku: 'PAN-S-WHITE',
          title: 'S / White',
          options: { size: 'S', color: 'White' },
          stock: 10,
        },
        {
          sku: 'PAN-M-WHITE',
          title: 'M / White',
          options: { size: 'M', color: 'White' },
          stock: 12,
        },
        {
          sku: 'PAN-L-WHITE',
          title: 'L / White',
          options: { size: 'L', color: 'White' },
          stock: 8,
        },
      ],
    },
    {
      slug: 'handloom-saree',
      title: 'Handloom Saree',
      title_bn: 'হাতে বোনা শাড়ি',
      description: 'A soft handloom saree woven by local weavers.',
      description_bn: 'স্থানীয় তাঁতিদের বোনা নরম হাতে বোনা শাড়ি।',
      category: 'saree',
      price: 1850,
      compareAtPrice: null,
      attributes: { fabric: 'Handloom cotton', care: 'Dry clean', origin: 'Bangladesh' },
      variants: [
        {
          sku: 'SAR-RED',
          title: 'Red',
          options: { color: 'Red' },
          stock: 5,
        },
        {
          sku: 'SAR-BLUE',
          title: 'Blue',
          options: { color: 'Blue' },
          stock: 4,
        },
      ],
    },
  ],
};
