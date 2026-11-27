export const SHOP_SORTS = ['new', 'price-asc', 'price-desc'] as const;
export type ShopSort = (typeof SHOP_SORTS)[number];

export const SHOP_PAGE_SIZE = 12;

export interface ShopCursor {
  id: number;
  price?: number;
}

export interface ShopQuery {
  q: string;
  category: string | null;
  sort: ShopSort;
  cursor: ShopCursor | null;
}

export function parseShopSort(value: string | null | undefined): ShopSort {
  return SHOP_SORTS.includes(value as ShopSort) ? (value as ShopSort) : 'new';
}

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
}

function isCursor(value: unknown): value is ShopCursor {
  if (typeof value !== 'object' || value === null) return false;
  const cursor = value as Record<string, unknown>;

  if (!Number.isSafeInteger(cursor.id) || (cursor.id as number) <= 0) return false;
  if (
    cursor.price !== undefined &&
    (!Number.isSafeInteger(cursor.price) || (cursor.price as number) < 0)
  ) {
    return false;
  }

  return true;
}

export function encodeCursor(cursor: ShopCursor): string {
  return toBase64Url(JSON.stringify(cursor));
}

export function decodeCursor(value: string | null | undefined): ShopCursor | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(fromBase64Url(value));
    if (!isCursor(parsed)) return null;
    return { id: parsed.id, ...(parsed.price === undefined ? {} : { price: parsed.price }) };
  } catch {
    return null;
  }
}

export function parseShopQuery(params: URLSearchParams): ShopQuery {
  const q = (params.get('q') ?? '').trim().slice(0, 100);
  const rawCategory = (params.get('category') ?? '').trim().toLowerCase();
  const category = /^[a-z0-9-]{1,80}$/.test(rawCategory) ? rawCategory : null;

  return {
    q,
    category,
    sort: parseShopSort(params.get('sort')),
    cursor: decodeCursor(params.get('cursor')),
  };
}
