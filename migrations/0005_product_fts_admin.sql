DROP TABLE product_fts;
--> statement-breakpoint
CREATE VIRTUAL TABLE product_fts USING fts5(
  title,
  title_bn,
  description,
  description_bn,
  skus,
  slug,
  tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
INSERT INTO product_fts (rowid, title, title_bn, description, description_bn, skus, slug)
SELECT
  p.id,
  p.title,
  COALESCE(p.title_bn, ''),
  COALESCE(p.description, ''),
  COALESCE(p.description_bn, ''),
  COALESCE(
    (
      SELECT group_concat(v.sku, ' ')
      FROM variants v
      WHERE v.product_id = p.id AND v.active = 1 AND v.sku IS NOT NULL
    ),
    ''
  ),
  p.slug
FROM products p;
