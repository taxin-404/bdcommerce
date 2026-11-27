import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * GET handlers and pages may read D1, but must never write. This guards the
 * AGENTS rule: zero D1 writes on GET. Admin mutations live in POST/PATCH/DELETE
 * API handlers, not in the pages that render them.
 */
const readOnlyFiles = [
  'src/pages/index.astro',
  'src/pages/shop.astro',
  'src/pages/p/[slug].astro',
  'src/pages/cart.astro',
  'src/pages/checkout.astro',
  'src/pages/order/[number].astro',
  'src/pages/track.astro',
  'src/pages/404.astro',
  'src/pages/admin/index.astro',
  'src/pages/admin/login.astro',
  'src/pages/admin/categories.astro',
  'src/pages/admin/products/index.astro',
  'src/pages/admin/products/new.astro',
  'src/pages/admin/products/[id].astro',
  'src/pages/admin/orders/index.astro',
  'src/pages/admin/orders/[id].astro',
  'src/pages/admin/orders/[id]/invoice.astro',
  'src/pages/admin/orders/[id]/packing-slip.astro',
  'src/pages/img/[...key].ts',
  'src/pages/api/[...route].ts',
  'src/components/AdminProductForm.astro',
  'src/components/ProductCard.astro',
  'src/components/home/HomeSections.astro',
  'src/layouts/StorefrontLayout.astro',
  'src/layouts/AdminLayout.astro',
  'src/layouts/PrintLayout.astro',
  'src/api/routes/health.ts',
  'src/api/routes/images.ts',
];

const writePatterns = [
  /\.run\s*\(/,
  /\.batch\s*\(/,
  /INSERT\s+INTO/i,
  /DELETE\s+FROM/i,
  /UPDATE\s+[A-Za-z_]+\s+SET/i,
  /syncProductFts|deleteProductFts|reindexProductFts/,
];

describe('no D1 writes on GET pages and public GET routes', () => {
  it.each(readOnlyFiles)('%s', (file) => {
    const source = readFileSync(file, 'utf8');

    for (const pattern of writePatterns) {
      expect(source, `${file} matched ${pattern}`).not.toMatch(pattern);
    }
  });
});
