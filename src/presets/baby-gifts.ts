import type { BusinessPreset } from './types';

export const babyGiftsPreset: BusinessPreset = {
  id: 'baby-gifts',
  label: { en: 'Baby & gifts', bn: 'শিশু ও উপহার' },
  description: {
    en: 'Baby clothing, toys and gift boxes with age and material labels.',
    bn: 'শিশুর পোশাক, খেলনা ও গিফট বক্স, বয়স ও উপকরণের লেবেলসহ।',
  },
  categories: [
    { slug: 'baby-gifts', name: 'Baby & Gifts', name_bn: 'শিশু ও উপহার', sort: 4 },
    {
      slug: 'baby-clothing',
      name: 'Baby Clothing',
      name_bn: 'শিশুর পোশাক',
      parent: 'baby-gifts',
      sort: 1,
    },
    { slug: 'toys', name: 'Toys', name_bn: 'খেলনা', parent: 'baby-gifts', sort: 2 },
  ],
  attributeFields: [
    { key: 'age', label: { en: 'Age', bn: 'বয়স' } },
    { key: 'material', label: { en: 'Material', bn: 'উপকরণ' } },
    { key: 'care', label: { en: 'Care', bn: 'যত্ন' } },
    { key: 'size', label: { en: 'Size', bn: 'সাইজ' }, options: ['0-6m', '6-12m', '1-2y'] },
    { key: 'colour', label: { en: 'Colour', bn: 'রঙ' } },
  ],
  products: [
    {
      slug: 'baby-gift-box',
      title: 'Baby Gift Box',
      title_bn: 'বেবি গিফট বক্স',
      description: 'A soft cotton set with a bib and mittens in a gift box.',
      description_bn: 'গিফট বক্সে নরম কটন সেট, বিব ও মিটেনসহ।',
      category: 'baby-gifts',
      price: 1450,
      compareAtPrice: 1700,
      attributes: { age: '0-12 months', material: 'Cotton', care: 'Machine wash' },
      featured: true,
      variants: [
        {
          sku: 'GIFT-PINK',
          title: 'Pink',
          options: { colour: 'Pink' },
          stock: 8,
        },
        {
          sku: 'GIFT-BLUE',
          title: 'Blue',
          options: { colour: 'Blue' },
          stock: 7,
        },
      ],
    },
    {
      slug: 'soft-plush-toy',
      title: 'Soft Plush Toy',
      title_bn: 'নরম প্লাশ খেলনা',
      description: 'A washable plush toy sized for small hands.',
      description_bn: 'ছোট হাতের জন্য উপযোগী, ধোয়া যায় এমন নরম প্লাশ খেলনা।',
      category: 'toys',
      price: 650,
      compareAtPrice: null,
      attributes: { age: '1-3 years', material: 'Polyester plush', care: 'Hand wash' },
      variants: [
        {
          sku: 'TOY-BEAR',
          title: 'Bear',
          options: { colour: 'Brown' },
          stock: 10,
        },
        {
          sku: 'TOY-RABBIT',
          title: 'Rabbit',
          options: { colour: 'White' },
          stock: 6,
        },
      ],
    },
  ],
};
