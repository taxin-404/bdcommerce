import { afterEach, describe, expect, it } from 'vitest';
import { applyPreset } from '../../src/lib/presets';
import { createTestDb, insertProduct, type TestEnvironment } from '../helpers/d1-sqlite';

let environment: TestEnvironment | null = null;

afterEach(() => {
  environment?.close();
  environment = null;
});

describe('business presets', () => {
  it('adds categories, products, variants and search rows', async () => {
    environment = createTestDb();
    const { db, sqlite } = environment;

    const result = await applyPreset(db, 'clothing');
    expect(result).toEqual({
      preset: 'clothing',
      categories: 3,
      products: 2,
      variants: 5,
    });

    const product = sqlite
      .prepare(
        `SELECT p.title, c.slug AS category_slug
           FROM products p JOIN categories c ON c.id = p.category_id
          WHERE p.slug = 'cotton-panjabi'`,
      )
      .get() as unknown as { title: string; category_slug: string };
    expect(product.title).toBe('Cotton Panjabi');
    expect(product.category_slug).toBe('panjabi');

    const fts = sqlite
      .prepare('SELECT COUNT(*) AS count FROM product_fts')
      .get() as unknown as { count: number };
    expect(fts.count).toBe(2);
  });

  it('is idempotent and never duplicates or overwrites existing rows', async () => {
    environment = createTestDb();
    const { db, sqlite } = environment;

    await applyPreset(db, 'clothing');
    sqlite
      .prepare('UPDATE products SET title = ? WHERE slug = ?')
      .run('Owner edited title', 'cotton-panjabi');

    const second = await applyPreset(db, 'clothing');
    expect(second).toEqual({
      preset: 'clothing',
      categories: 0,
      products: 0,
      variants: 0,
    });

    const counts = sqlite
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM categories) AS categories,
           (SELECT COUNT(*) FROM products) AS products,
           (SELECT COUNT(*) FROM variants) AS variants`,
      )
      .get() as unknown as { categories: number; products: number; variants: number };
    expect(counts).toEqual({ categories: 3, products: 2, variants: 5 });

    const title = sqlite
      .prepare('SELECT title FROM products WHERE slug = ?')
      .get('cotton-panjabi') as unknown as { title: string };
    expect(title.title).toBe('Owner edited title');
  });

  it('does not add preset variants to an existing product with the same slug', async () => {
    environment = createTestDb();
    const { db, sqlite } = environment;
    insertProduct(sqlite, { id: 50, slug: 'cotton-panjabi', title: 'Owner product', price: 999 });

    const result = await applyPreset(db, 'clothing');
    expect(result?.products).toBe(1);

    const variants = sqlite
      .prepare('SELECT COUNT(*) AS count FROM variants WHERE product_id = 50')
      .get() as unknown as { count: number };
    expect(variants.count).toBe(0);

    const owner = sqlite
      .prepare('SELECT title, price FROM products WHERE id = 50')
      .get() as unknown as { title: string; price: number };
    expect(owner).toEqual({ title: 'Owner product', price: 999 });
  });

  it('applies each preset and returns null for an unknown id', async () => {
    environment = createTestDb();
    const { db } = environment;

    for (const id of ['food', 'electronics', 'baby-gifts']) {
      const result = await applyPreset(db, id);
      expect(result?.preset).toBe(id);
      expect(result?.products).toBeGreaterThan(0);
    }

    expect(await applyPreset(db, 'unknown')).toBeNull();
  });
});
