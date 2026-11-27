export const CART_STORAGE_KEY = 'bd_cart_v1';
export const MAX_CART_LINES = 50;
export const MAX_LINE_QTY = 99;

export interface CartLineInput {
  product_id: number;
  variant_id: number | null;
  qty: number;
}

/** What localStorage holds. Prices/titles here are display-only; the server reprices. */
export interface StoredCartLine extends CartLineInput {
  key: string;
  slug: string;
  title: string;
  variant_title: string | null;
  unit_price: number;
  image: string | null;
}

export function cartLineKey(productId: number, variantId: number | null): string {
  return `${productId}:${variantId ?? 0}`;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isQty(value: unknown): value is number {
  return isPositiveInt(value) && value <= MAX_LINE_QTY;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function normalizeLine(value: unknown): StoredCartLine | null {
  if (typeof value !== 'object' || value === null) return null;
  const line = value as Record<string, unknown>;
  if (!isPositiveInt(line.product_id) || !isQty(line.qty)) return null;

  const variantId = isPositiveInt(line.variant_id) ? line.variant_id : null;
  const unitPrice =
    typeof line.unit_price === 'number' &&
    Number.isSafeInteger(line.unit_price) &&
    line.unit_price >= 0
      ? line.unit_price
      : 0;

  return {
    key: cartLineKey(line.product_id, variantId),
    product_id: line.product_id,
    variant_id: variantId,
    qty: line.qty,
    slug: cleanText(line.slug, 120),
    title: cleanText(line.title, 200),
    variant_title: typeof line.variant_title === 'string' ? line.variant_title.slice(0, 160) : null,
    unit_price: unitPrice,
    image: typeof line.image === 'string' ? line.image.slice(0, 500) : null,
  };
}

/** Drops malformed rows instead of breaking the cart if localStorage was edited. */
export function parseStoredCart(value: unknown): StoredCartLine[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const lines: StoredCartLine[] = [];
  for (const raw of value) {
    const line = normalizeLine(raw);
    if (!line || seen.has(line.key)) continue;
    seen.add(line.key);
    lines.push(line);
    if (lines.length >= MAX_CART_LINES) break;
  }
  return lines;
}

export function mergeCartLine(
  lines: readonly StoredCartLine[],
  incoming: StoredCartLine,
): StoredCartLine[] {
  const index = lines.findIndex((line) => line.key === incoming.key);
  if (index === -1) {
    if (lines.length >= MAX_CART_LINES) return [...lines];
    return [...lines, incoming];
  }

  const next = [...lines];
  const existing = next[index];
  if (!existing) return next;
  next[index] = {
    ...incoming,
    qty: Math.min(existing.qty + incoming.qty, MAX_LINE_QTY),
  };
  return next;
}

export function updateCartQty(
  lines: readonly StoredCartLine[],
  key: string,
  qty: number,
): StoredCartLine[] {
  if (!isQty(qty)) {
    return lines.filter((line) => line.key !== key);
  }
  return lines.map((line) => (line.key === key ? { ...line, qty } : line));
}

export function removeCartLine(
  lines: readonly StoredCartLine[],
  key: string,
): StoredCartLine[] {
  return lines.filter((line) => line.key !== key);
}

export function cartCount(lines: readonly StoredCartLine[]): number {
  return lines.reduce((total, line) => total + line.qty, 0);
}

/** Display-only estimate. Checkout always asks the server. */
export function cartSubtotal(lines: readonly StoredCartLine[]): number {
  return lines.reduce((total, line) => total + line.unit_price * line.qty, 0);
}

export function toCartItems(lines: readonly StoredCartLine[]): CartLineInput[] {
  return lines.map((line) => ({
    product_id: line.product_id,
    variant_id: line.variant_id,
    qty: line.qty,
  }));
}

export function hasDuplicateCartLines<
  T extends { product_id: number; variant_id?: number | null },
>(lines: readonly T[]): boolean {
  const seen = new Set<string>();
  for (const line of lines) {
    const key = cartLineKey(line.product_id, line.variant_id ?? null);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/** A stable fingerprint used to bind an idempotency key to one cart attempt. */
export function cartSignature(lines: readonly CartLineInput[]): string {
  return lines
    .map((line) => `${line.product_id}:${line.variant_id ?? 0}:${line.qty}`)
    .sort()
    .join('|');
}
