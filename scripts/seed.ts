import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface CategorySeed {
  id: number;
  slug: string;
  name: string;
  nameBn: string;
  parentId: number | null;
  sort: number;
}

interface ProductSeed {
  id: number;
  slug: string;
  title: string;
  titleBn: string;
  description: string;
  descriptionBn: string;
  categoryId: number;
  price: number;
  compareAtPrice: number | null;
  attributes: Record<string, string>;
  featured: number;
}

interface VariantSeed {
  id: number;
  productId: number;
  sku: string;
  title: string;
  options: Record<string, string>;
  price: number | null;
  stock: number;
}

const categories: CategorySeed[] = [
  { id: 1, slug: 'clothing', name: 'Clothing', nameBn: 'পোশাক', parentId: null, sort: 1 },
  { id: 2, slug: 'food', name: 'Food & Pantry', nameBn: 'খাদ্য ও মুদি', parentId: null, sort: 2 },
  {
    id: 3,
    slug: 'electronics',
    name: 'Electronics',
    nameBn: 'ইলেকট্রনিক্স',
    parentId: null,
    sort: 3,
  },
  { id: 4, slug: 'panjabi', name: 'Panjabi', nameBn: 'পাঞ্জাবি', parentId: 1, sort: 1 },
  { id: 5, slug: 'ghee-honey', name: 'Ghee & Honey', nameBn: 'ঘি ও মধু', parentId: 2, sort: 1 },
  { id: 6, slug: 'audio', name: 'Audio', nameBn: 'অডিও', parentId: 3, sort: 1 },
];

const products: ProductSeed[] = [
  {
    id: 1,
    slug: 'cotton-panjabi',
    title: 'Cotton Panjabi',
    titleBn: 'কটন পাঞ্জাবি',
    description: 'A breathable cotton panjabi for everyday wear and festive occasions.',
    descriptionBn: 'প্রতিদিনের ব্যবহার ও উৎসবের জন্য আরামদায়ক কটন পাঞ্জাবি।',
    categoryId: 4,
    price: 1250,
    compareAtPrice: 1500,
    attributes: { fabric: '100% cotton', fit: 'regular', care: 'Machine wash cold' },
    featured: 1,
  },
  {
    id: 2,
    slug: 'pure-ghee',
    title: 'Pure Ghee',
    titleBn: 'খাঁটি ঘি',
    description: 'Slow-cooked clarified butter from Rajshahi, packed in a glass jar.',
    descriptionBn: 'রাজশাহীর ধীরে তৈরি খাঁটি ঘি, কাচের জারে সংরক্ষিত।',
    categoryId: 5,
    price: 900,
    compareAtPrice: null,
    attributes: { origin: 'Rajshahi', unit: 'Glass jar', shelf_life: '6 months' },
    featured: 1,
  },
  {
    id: 3,
    slug: 'wireless-earbuds',
    title: 'Wireless Earbuds',
    titleBn: 'ওয়্যারলেস ইয়ারবাডস',
    description: 'Everyday Bluetooth earbuds with USB-C charging and a pocket case.',
    descriptionBn: 'প্রতিদিনের ব্যবহারের জন্য ব্লুটুথ ইয়ারবাডস, ইউএসবি-সি চার্জিং ও পকেট কেস।',
    categoryId: 6,
    price: 2490,
    compareAtPrice: 2990,
    attributes: {
      bluetooth: '5.3',
      battery: '6 hours',
      charging: 'USB-C',
      warranty: '6 months',
    },
    featured: 0,
  },
];

const variants: VariantSeed[] = [
  {
    id: 1,
    productId: 1,
    sku: 'PAN-S-WHITE',
    title: 'S / White',
    options: { size: 'S', color: 'White' },
    price: null,
    stock: 10,
  },
  {
    id: 2,
    productId: 1,
    sku: 'PAN-M-WHITE',
    title: 'M / White',
    options: { size: 'M', color: 'White' },
    price: null,
    stock: 12,
  },
  {
    id: 3,
    productId: 1,
    sku: 'PAN-L-WHITE',
    title: 'L / White',
    options: { size: 'L', color: 'White' },
    price: null,
    stock: 8,
  },
  {
    id: 4,
    productId: 1,
    sku: 'PAN-M-NAVY',
    title: 'M / Navy',
    options: { size: 'M', color: 'Navy' },
    price: null,
    stock: 6,
  },
  {
    id: 5,
    productId: 1,
    sku: 'PAN-L-NAVY',
    title: 'L / Navy',
    options: { size: 'L', color: 'Navy' },
    price: null,
    stock: 4,
  },
  {
    id: 6,
    productId: 2,
    sku: 'GHEE-250',
    title: '250 g',
    options: { weight: '250 g' },
    price: 250,
    stock: 20,
  },
  {
    id: 7,
    productId: 2,
    sku: 'GHEE-500',
    title: '500 g',
    options: { weight: '500 g' },
    price: 480,
    stock: 15,
  },
  {
    id: 8,
    productId: 2,
    sku: 'GHEE-1KG',
    title: '1 kg',
    options: { weight: '1 kg' },
    price: 900,
    stock: 10,
  },
  {
    id: 9,
    productId: 3,
    sku: 'BUD-BLACK',
    title: 'Black',
    options: { color: 'Black' },
    price: null,
    stock: 7,
  },
  {
    id: 10,
    productId: 3,
    sku: 'BUD-WHITE',
    title: 'White',
    options: { color: 'White' },
    price: null,
    stock: 5,
  },
];

function quote(value: string | number | null): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${value.replace(/'/g, "''")}'`;
}

function json(value: unknown): string {
  return quote(JSON.stringify(value));
}

function buildSeedSql(timestamp: string): string {
  const statements = [
    // Reset the catalog only. Orders, settings, coupons, and the blocklist are preserved.
    'DELETE FROM product_images;',
    'DELETE FROM variants;',
    'DELETE FROM product_fts;',
    'DELETE FROM products;',
    'DELETE FROM categories WHERE parent_id IS NOT NULL;',
    'DELETE FROM categories;',
  ];

  for (const category of categories) {
    statements.push(
      `INSERT INTO categories (id, slug, name, name_bn, parent_id, sort, active) VALUES (${category.id}, ${quote(category.slug)}, ${quote(category.name)}, ${quote(category.nameBn)}, ${quote(category.parentId)}, ${category.sort}, 1);`,
    );
  }

  for (const product of products) {
    statements.push(
      `INSERT INTO products (id, slug, title, title_bn, description, description_bn, category_id, price, compare_at_price, status, track_stock, attributes, featured, created_at, updated_at) VALUES (${product.id}, ${quote(product.slug)}, ${quote(product.title)}, ${quote(product.titleBn)}, ${quote(product.description)}, ${quote(product.descriptionBn)}, ${product.categoryId}, ${product.price}, ${quote(product.compareAtPrice)}, 'active', 1, ${json(product.attributes)}, ${product.featured}, ${quote(timestamp)}, ${quote(timestamp)});`,
    );
  }

  for (const variant of variants) {
    statements.push(
      `INSERT INTO variants (id, product_id, sku, title, options, price, stock, active) VALUES (${variant.id}, ${variant.productId}, ${quote(variant.sku)}, ${quote(variant.title)}, ${json(variant.options)}, ${quote(variant.price)}, ${variant.stock}, 1);`,
    );
  }

  for (const product of products) {
    const skus = variants
      .filter((variant) => variant.productId === product.id)
      .map((variant) => variant.sku)
      .join(' ');
    statements.push(
      `INSERT INTO product_fts (rowid, title, title_bn, description, description_bn, skus, slug) VALUES (${product.id}, ${quote(product.title)}, ${quote(product.titleBn)}, ${quote(product.description)}, ${quote(product.descriptionBn)}, ${quote(skus)}, ${quote(product.slug)});`,
    );
  }

  return `${statements.join('\n')}\n`;
}

const sql = buildSeedSql(new Date().toISOString());
const directory = mkdtempSync(join(tmpdir(), 'bdcommerce-seed-'));
const file = join(directory, 'seed.sql');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

try {
  writeFileSync(file, sql, 'utf8');
  console.log(
    `Seeding local D1 (DB) with ${categories.length} categories, ${products.length} products, and ${variants.length} variants.`,
  );
  console.log('Demo coverage: clothing (size/colour), food (weight), electronics (specs).');

  execFileSync(pnpm, ['exec', 'wrangler', 'd1', 'execute', 'DB', '--local', '--file', file], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  console.log(
    'Seed complete. Re-run pnpm db:seed to replace all local catalog rows with the demo catalog.',
  );
} catch {
  console.error('\nSeed failed. Make sure the local schema exists: pnpm db:migrate:local');
  process.exitCode = 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
