export interface ProductJsonLdInput {
  name: string;
  description: string;
  url: string;
  images: string[];
  sku: string;
  brand: string;
  price: number;
  currency: string;
  inStock: boolean;
}

export function buildProductJsonLd(input: ProductJsonLdInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    description: input.description,
    ...(input.images.length ? { image: input.images } : {}),
    sku: input.sku,
    brand: { '@type': 'Brand', name: input.brand },
    offers: {
      '@type': 'Offer',
      url: input.url,
      priceCurrency: input.currency,
      price: String(input.price),
      availability: input.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  };
}

/** Safe for inline JSON-LD: a closing script tag cannot break out. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
