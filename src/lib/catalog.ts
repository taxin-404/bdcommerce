export interface ProductCardRow {
  id: number;
  slug: string;
  title: string;
  title_bn: string | null;
  price: number;
  compare_at_price: number | null;
  image_key: string | null;
  featured: number;
}

export interface CategoryNavRow {
  id: number;
  slug: string;
  name: string;
  name_bn: string | null;
  image_key: string | null;
  parent_id: number | null;
}

/** Shared card projection; the image subquery costs no extra round trip. */
export const PRODUCT_CARD_SELECT = `
  p.id, p.slug, p.title, p.title_bn, p.price, p.compare_at_price, p.featured,
  (
    SELECT i.r2_key FROM product_images i
    WHERE i.product_id = p.id
    ORDER BY i.sort, i.id
    LIMIT 1
  ) AS image_key
`;
