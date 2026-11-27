import type { BusinessPreset } from '../presets';
import { findPreset } from '../presets';

export interface PresetApplyResult {
  preset: string;
  categories: number;
  products: number;
  variants: number;
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

/**
 * Adds only missing rows by deterministic category slug and product slug/SKU.
 * Re-applying a preset is safe and never overwrites owner edits.
 */
export async function applyPreset(
  db: D1Database,
  presetId: string,
  now = new Date().toISOString(),
): Promise<PresetApplyResult | null> {
  const preset = findPreset(presetId);
  if (!preset) return null;

  // Never add preset variants to a product the owner already has, even when
  // the slug matches. This keeps applying a preset strictly add-only.
  const existingProducts = new Set<string>();
  if (preset.products.length) {
    const existingProductRows = await db
      .prepare(
        `SELECT slug FROM products WHERE slug IN (${placeholders(preset.products.length)})`,
      )
      .bind(...preset.products.map((product) => product.slug))
      .all<{ slug: string }>();
    for (const row of existingProductRows.results) existingProducts.add(row.slug);
  }

  const statements: D1PreparedStatement[] = [];
  const categoryCount = preset.categories.length;

  for (const category of preset.categories) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO categories (slug, name, name_bn, parent_id, sort, active)
           VALUES (?, ?, ?, (SELECT id FROM categories WHERE slug = ?), ?, 1)`,
        )
        .bind(
          category.slug,
          category.name,
          category.name_bn,
          category.parent ?? null,
          category.sort ?? 0,
        ),
    );
  }

  for (const product of preset.products) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO products (
             slug, title, title_bn, description, description_bn, category_id,
             price, compare_at_price, status, track_stock, attributes, featured,
             created_at, updated_at
           ) VALUES (
             ?, ?, ?, ?, ?, (SELECT id FROM categories WHERE slug = ?),
             ?, ?, 'active', 1, ?, ?, ?, ?
           )`,
        )
        .bind(
          product.slug,
          product.title,
          product.title_bn,
          product.description,
          product.description_bn,
          product.category,
          product.price,
          product.compareAtPrice ?? null,
          JSON.stringify(product.attributes),
          product.featured ? 1 : 0,
          now,
          now,
        ),
    );

    if (existingProducts.has(product.slug)) continue;

    for (const variant of product.variants) {
      statements.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO variants (product_id, sku, title, options, price, stock, active)
             SELECT id, ?, ?, ?, ?, ?, 1 FROM products WHERE slug = ?`,
          )
          .bind(
            variant.sku,
            variant.title,
            JSON.stringify(variant.options),
            variant.price ?? null,
            variant.stock,
            product.slug,
          ),
      );
    }
  }

  const productSlugs = preset.products.map((product) => product.slug);
  if (productSlugs.length) {
    statements.push(
      db
        .prepare(
          `INSERT OR REPLACE INTO product_fts
             (rowid, title, title_bn, description, description_bn, skus, slug)
           SELECT p.id, p.title, COALESCE(p.title_bn, ''),
                  COALESCE(p.description, ''), COALESCE(p.description_bn, ''),
                  COALESCE((
                    SELECT group_concat(v.sku, ' ')
                      FROM variants v
                     WHERE v.product_id = p.id AND v.active = 1 AND v.sku IS NOT NULL
                  ), ''),
                  p.slug
             FROM products p
            WHERE p.slug IN (${placeholders(productSlugs.length)})`,
        )
        .bind(...productSlugs),
    );
  }

  const results = await db.batch(statements);
  const sumChanges = (from: number, to: number) =>
    results.slice(from, to).reduce((total, result) => total + Number(result.meta.changes ?? 0), 0);

  const productStart = categoryCount;
  const productEnd = productStart + preset.products.length;

  return {
    preset: preset.id,
    categories: sumChanges(0, productStart),
    products: sumChanges(productStart, productEnd),
    variants: results
      .slice(productEnd, statements.length - (productSlugs.length ? 1 : 0))
      .reduce((total, result) => total + Number(result.meta.changes ?? 0), 0),
  };
}

export type { BusinessPreset };
