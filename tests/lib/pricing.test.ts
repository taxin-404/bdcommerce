import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/lib/config';
import { priceCart } from '../../src/lib/pricing';
import { createTestDb, insertProduct, type TestEnvironment } from '../helpers/d1-sqlite';

let environment: TestEnvironment | null = null;

afterEach(() => {
  environment?.close();
  environment = null;
});

describe('server-side cart pricing', () => {
  it('uses the variant price, then falls back to the product price', async () => {
    environment = createTestDb();
    const { sqlite, db } = environment;

    insertProduct(sqlite, {
      id: 1,
      title: 'Panjabi',
      price: 1250,
      variants: [
        { id: 11, title: 'M', price: 1400, stock: 5 },
        { id: 12, title: 'L', price: null, stock: 5 },
      ],
    });

    const priced = await priceCart(
      db,
      [
        { product_id: 1, variant_id: 11, qty: 2 },
        { product_id: 1, variant_id: 12, qty: 1 },
      ],
      defaultConfig,
    );

    expect(priced.lines[0]?.unit_price).toBe(1400);
    expect(priced.lines[0]?.line_total).toBe(2800);
    expect(priced.lines[1]?.unit_price).toBe(1250);
    expect(priced.lines[1]?.line_total).toBe(1250);
    expect(priced.subtotal).toBe(4050);
    expect(priced.all_available).toBe(true);
  });

  it('flags missing variants, inactive variants, and out-of-stock lines', async () => {
    environment = createTestDb();
    const { sqlite, db } = environment;

    insertProduct(sqlite, {
      id: 2,
      title: 'Ghee',
      price: 900,
      variants: [
        { id: 21, title: '250g', price: 250, stock: 1 },
        { id: 22, title: '500g', price: 480, stock: 0 },
        { id: 23, title: 'Inactive', price: 700, stock: 9, active: false },
      ],
    });

    const priced = await priceCart(
      db,
      [
        { product_id: 2, variant_id: null, qty: 1 },
        { product_id: 2, variant_id: 21, qty: 2 },
        { product_id: 2, variant_id: 22, qty: 1 },
        { product_id: 2, variant_id: 23, qty: 1 },
        { product_id: 99, variant_id: null, qty: 1 },
      ],
      defaultConfig,
    );

    expect(priced.lines.map((line) => line.reason)).toEqual([
      'variant_required',
      'out_of_stock',
      'out_of_stock',
      'variant_invalid',
      'not_found',
    ]);
    expect(priced.all_available).toBe(false);
    expect(priced.subtotal).toBe(0);
  });

  it('orders untracked and variantless products without stock checks', async () => {
    environment = createTestDb();
    const { sqlite, db } = environment;

    insertProduct(sqlite, {
      id: 3,
      title: 'Ebook',
      price: 300,
      trackStock: false,
      variants: [{ id: 31, title: 'PDF', stock: 0 }],
    });
    insertProduct(sqlite, { id: 4, title: 'Simple', price: 100, variants: [] });

    const priced = await priceCart(
      db,
      [
        { product_id: 3, variant_id: 31, qty: 3 },
        { product_id: 4, variant_id: null, qty: 2 },
      ],
      defaultConfig,
    );

    expect(priced.all_available).toBe(true);
    expect(priced.lines[0]?.track_stock).toBe(false);
    expect(priced.lines[1]?.track_stock).toBe(false);
    expect(priced.subtotal).toBe(1100);
  });

  it('marks unsafe line totals as unavailable instead of making them free', async () => {
    environment = createTestDb();
    const { sqlite, db } = environment;
    insertProduct(sqlite, { id: 6, title: 'Huge', price: 9_000_000_000_000_000, variants: [] });

    const priced = await priceCart(
      db,
      [{ product_id: 6, variant_id: null, qty: 2 }],
      defaultConfig,
    );

    expect(priced.lines[0]?.reason).toBe('invalid_price');
    expect(priced.lines[0]?.available).toBe(false);
    expect(priced.lines[0]?.line_total).toBe(0);
    expect(priced.all_available).toBe(false);
  });

  it('derives shipping from the district and applies the free-shipping threshold', async () => {
    environment = createTestDb();
    const { sqlite, db } = environment;
    insertProduct(sqlite, { id: 5, title: 'Item', price: 500, variants: [] });

    const inside = await priceCart(db, [{ product_id: 5, variant_id: null, qty: 1 }], defaultConfig, 'Dhaka');
    expect(inside.shipping_zone).toBe('dhaka');
    expect(inside.shipping_fee).toBe(60);
    expect(inside.total).toBe(560);

    const outside = await priceCart(
      db,
      [{ product_id: 5, variant_id: null, qty: 1 }],
      defaultConfig,
      'Cumilla',
    );
    expect(outside.shipping_zone).toBe('outside');
    expect(outside.shipping_fee).toBe(120);

    const freeConfig = {
      ...defaultConfig,
      shipping: { ...defaultConfig.shipping, freeShippingOver: 500 },
    };
    const free = await priceCart(db, [{ product_id: 5, variant_id: null, qty: 1 }], freeConfig, 'Dhaka');
    expect(free.free_shipping).toBe(true);
    expect(free.shipping_fee).toBe(0);
    expect(free.total).toBe(500);
  });
});
