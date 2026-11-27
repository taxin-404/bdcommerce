import type { CartLineInput } from './cart';
import type { SiteConfig } from './config';
import { shippingZoneForDistrict } from './geo';

export type LineUnavailableReason =
  | 'not_found'
  | 'variant_required'
  | 'variant_invalid'
  | 'out_of_stock'
  | 'invalid_price';

export interface PricedLine {
  product_id: number;
  variant_id: number | null;
  slug: string | null;
  title: string;
  title_bn: string | null;
  variant_title: string | null;
  variant_options: Record<string, string>;
  unit_price: number;
  qty: number;
  line_total: number;
  available: boolean;
  reason: LineUnavailableReason | null;
  track_stock: boolean;
  stock: number | null;
}

export interface PricedCart {
  lines: PricedLine[];
  subtotal: number;
  discount: number;
  shipping_zone: string | null;
  shipping_zone_label: { en: string; bn: string } | null;
  shipping_fee: number | null;
  total: number;
  free_shipping: boolean;
  all_available: boolean;
}

interface ProductRow {
  id: number;
  slug: string;
  title: string;
  title_bn: string | null;
  price: number;
  track_stock: number;
  variant_count: number;
}

interface VariantRow {
  id: number;
  product_id: number;
  title: string;
  options: string | null;
  price: number | null;
  stock: number;
  active: number;
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

function parseOptions(value: string | null): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, item]) => [
        key,
        String(item).slice(0, 80),
      ]),
    );
  } catch {
    return {};
  }
}

function isMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export async function priceCart(
  db: D1Database,
  items: readonly CartLineInput[],
  config: SiteConfig,
  district?: string,
): Promise<PricedCart> {
  const productIds = [...new Set(items.map((item) => item.product_id))];
  const variantIds = [
    ...new Set(
      items.flatMap((item) => (item.variant_id === null ? [] : [item.variant_id])),
    ),
  ];

  const productStatement = db
    .prepare(
      `SELECT p.id, p.slug, p.title, p.title_bn, p.price, p.track_stock,
              (SELECT COUNT(*) FROM variants v
                WHERE v.product_id = p.id AND v.active = 1) AS variant_count
         FROM products p
        WHERE p.id IN (${placeholders(productIds.length)})
          AND p.status = 'active'`,
    )
    .bind(...productIds);

  const statements = [productStatement];
  if (variantIds.length) {
    statements.push(
      db
        .prepare(
          `SELECT id, product_id, title, options, price, stock, active
             FROM variants
            WHERE id IN (${placeholders(variantIds.length)})`,
        )
        .bind(...variantIds),
    );
  }

  const results = await db.batch(statements);
  const products = (results[0]?.results ?? []) as ProductRow[];
  const variants = (variantIds.length ? (results[1]?.results ?? []) : []) as VariantRow[];

  const productById = new Map(products.map((product) => [product.id, product]));
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));

  const lines: PricedLine[] = items.map((item) => {
    const product = productById.get(item.product_id);
    if (!product) {
      return {
        product_id: item.product_id,
        variant_id: item.variant_id,
        slug: null,
        title: '',
        title_bn: null,
        variant_title: null,
        variant_options: {},
        unit_price: 0,
        qty: item.qty,
        line_total: 0,
        available: false,
        reason: 'not_found',
        track_stock: false,
        stock: null,
      };
    }

    const variant =
      item.variant_id === null ? undefined : variantById.get(item.variant_id);
    const variantValid =
      variant !== undefined && variant.product_id === product.id && variant.active === 1;
    const variantRequired = product.variant_count > 0;

    let reason: LineUnavailableReason | null = null;
    if (variantRequired && item.variant_id === null) reason = 'variant_required';
    else if (item.variant_id !== null && !variantValid) reason = 'variant_invalid';

    const unitPrice = variantValid && variant.price !== null ? variant.price : product.price;
    if (reason === null && !isMoney(unitPrice)) reason = 'invalid_price';

    const trackStock =
      product.track_stock === 1 && config.features.stockTracking && variantRequired;
    if (reason === null && trackStock && variant !== undefined && variant.stock < item.qty) {
      reason = 'out_of_stock';
    }

    const rawLineTotal = isMoney(unitPrice) ? unitPrice * item.qty : 0;
    if (reason === null && !Number.isSafeInteger(rawLineTotal)) {
      reason = 'invalid_price';
    }
    const lineTotal = reason === null ? rawLineTotal : 0;

    return {
      product_id: product.id,
      variant_id: variantValid ? variant.id : null,
      slug: product.slug,
      title: product.title,
      title_bn: product.title_bn,
      variant_title: variantValid ? variant.title : null,
      variant_options: variantValid ? parseOptions(variant.options) : {},
      unit_price: isMoney(unitPrice) ? unitPrice : 0,
      qty: item.qty,
      line_total: lineTotal,
      available: reason === null,
      reason,
      track_stock: trackStock && variantValid,
      stock: variantValid ? variant.stock : null,
    };
  });

  const availableLines = lines.filter((line) => line.available);
  const rawSubtotal = availableLines.reduce((total, line) => total + line.line_total, 0);
  const subtotal = Number.isSafeInteger(rawSubtotal) ? rawSubtotal : 0;

  let shippingZone: SiteConfig['shipping']['zones'][number] | null = null;
  let freeShipping = false;
  let shippingFee: number | null = null;

  if (district) {
    shippingZone = shippingZoneForDistrict(config.shipping.zones, district);
    freeShipping =
      config.shipping.freeShippingOver !== null &&
      subtotal >= config.shipping.freeShippingOver;
    shippingFee = freeShipping ? 0 : shippingZone.fee;
  }

  const rawTotal = subtotal + (shippingFee ?? 0);
  const total = Number.isSafeInteger(rawTotal) ? rawTotal : 0;
  const moneySafe = Number.isSafeInteger(rawSubtotal) && Number.isSafeInteger(rawTotal);

  return {
    lines,
    subtotal,
    discount: 0,
    shipping_zone: shippingZone?.id ?? null,
    shipping_zone_label: shippingZone?.label ?? null,
    shipping_fee: shippingFee,
    total,
    free_shipping: freeShipping,
    all_available: moneySafe && lines.every((line) => line.available),
  };
}
