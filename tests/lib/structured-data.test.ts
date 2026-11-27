import { describe, expect, it } from 'vitest';
import { buildProductJsonLd, serializeJsonLd } from '../../src/lib/structured-data';

const base = {
  name: 'Cotton Panjabi',
  description: 'Breathable cotton.',
  url: 'https://shop.example/p/cotton-panjabi',
  images: ['https://shop.example/img/products/1/a-md.webp'],
  sku: 'PAN-M-WHITE',
  brand: 'My Shop',
  price: 1250,
  currency: 'BDT',
  inStock: true,
};

describe('buildProductJsonLd', () => {
  it('builds a Product with an in-stock Offer', () => {
    const data = buildProductJsonLd(base) as {
      '@type': string;
      name: string;
      offers: Record<string, string>;
    };

    expect(data['@type']).toBe('Product');
    expect(data.name).toBe('Cotton Panjabi');
    expect(data.offers.price).toBe('1250');
    expect(data.offers.priceCurrency).toBe('BDT');
    expect(data.offers.availability).toBe('https://schema.org/InStock');
  });

  it('marks an out-of-stock product', () => {
    const data = buildProductJsonLd({ ...base, inStock: false }) as {
      offers: Record<string, string>;
    };

    expect(data.offers.availability).toBe('https://schema.org/OutOfStock');
  });
});

describe('serializeJsonLd', () => {
  it('escapes a closing script tag', () => {
    const json = serializeJsonLd({ name: '</script><script>alert(1)</script>' });

    expect(json).not.toContain('</script>');
    expect(json).toContain('\\u003c/script>');
  });
});
