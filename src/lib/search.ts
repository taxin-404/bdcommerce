const MAX_TERMS = 8;
const TOKEN_PATTERN = /[\p{L}\p{M}\p{N}]+/gu;

/**
 * Turns free text into a safe FTS5 prefix query. Only letters and digits
 * survive, so user input cannot inject FTS operators or SQL.
 */
export function buildFtsQuery(input: string): string | null {
  const tokens = input.normalize('NFKC').toLowerCase().match(TOKEN_PATTERN) ?? [];
  const unique = [...new Set(tokens)].slice(0, MAX_TERMS);
  if (!unique.length) return null;

  return unique.map((token) => `"${token}"*`).join(' ');
}

interface SkuRow {
  sku: string | null;
  active: boolean | number;
}

export function ftsSkuText(rows: SkuRow[]): string {
  return rows
    .filter((row) => Boolean(row.active) && row.sku)
    .map((row) => row.sku as string)
    .join(' ');
}

interface SearchableRow {
  title: string;
  title_bn: string | null;
  description: string | null;
  description_bn: string | null;
}

/**
 * Rebuilds the search row for one product. Inactive and missing products are
 * removed from the index, so draft/archived items never appear in search.
 */
export async function syncProductFts(db: D1Database, productId: number): Promise<void> {
  await db.prepare('DELETE FROM product_fts WHERE rowid = ?').bind(productId).run();

  const product = await db
    .prepare(
      "SELECT title, title_bn, description, description_bn FROM products WHERE id = ? AND status = 'active'",
    )
    .bind(productId)
    .first<SearchableRow>();
  if (!product) return;

  const { results } = await db
    .prepare('SELECT sku, active FROM variants WHERE product_id = ?')
    .bind(productId)
    .all<SkuRow>();

  await db
    .prepare(
      'INSERT INTO product_fts (rowid, title, title_bn, description, description_bn, skus) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(
      productId,
      product.title,
      product.title_bn ?? '',
      product.description ?? '',
      product.description_bn ?? '',
      ftsSkuText(results),
    )
    .run();
}

export async function deleteProductFts(db: D1Database, productId: number): Promise<void> {
  await db.prepare('DELETE FROM product_fts WHERE rowid = ?').bind(productId).run();
}
