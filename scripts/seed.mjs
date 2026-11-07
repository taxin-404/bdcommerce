// Generates seed.sql with a demo store, category and products, and prints the admin token.
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const slug = process.argv[2] ?? "demo";
const token = randomBytes(24).toString("hex");
const hash = createHash("sha256").update(token).digest("hex");
const q = (v) => (v === null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const storeId = randomUUID(), catId = randomUUID();
const sql = [];

sql.push(`INSERT INTO stores (id, slug, name, admin_token_hash, settings) VALUES (${q(storeId)}, ${q(slug)}, 'Demo Store', ${q(hash)}, ${q(JSON.stringify({ shipping: { insideDhaka: 6000, outsideDhaka: 12000 } }))});`);
sql.push(`INSERT INTO categories (id, store_id, name, slug) VALUES (${q(catId)}, ${q(storeId)}, 'Clothing', 'clothing');`);

const products = [
  { name: "Cotton T-Shirt", type: "physical", price: 45000, variants: [["TSHIRT-M", "M", 45000, 20, { size: "M" }], ["TSHIRT-L", "L", 45000, 15, { size: "L" }]] },
  { name: "Haircut Appointment", type: "service", price: 30000, variants: [["HAIRCUT", "Default", 30000, null, {}]] },
];
for (const p of products) {
  const pid = randomUUID(), ps = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  sql.push(`INSERT INTO products (id, store_id, category_id, type, status, name, slug, base_price) VALUES (${q(pid)}, ${q(storeId)}, ${q(catId)}, ${q(p.type)}, 'active', ${q(p.name)}, ${q(ps)}, ${p.price});`);
  for (const [sku, title, price, stock, opts] of p.variants)
    sql.push(`INSERT INTO product_variants (id, store_id, product_id, sku, title, price, stock, options) VALUES (${q(randomUUID())}, ${q(storeId)}, ${q(pid)}, ${q(sku)}, ${q(title)}, ${price}, ${stock === null ? "NULL" : stock}, ${q(JSON.stringify(opts))});`);
}
writeFileSync("seed.sql", sql.join("\n") + "\n");
console.log(`seed.sql written. Store slug: ${slug}\nADMIN TOKEN (save it, it is not stored): ${token}`);
