# BD Commerce Template — Full Build Plan

A free-to-host, config-driven e-commerce template for Bangladesh, built on Cloudflare (Workers + D1 + R2).
Rules and constraints live in `AGENTS.md`. This file is the roadmap: build **one phase per opencode session**.

---

## 1. Goals and non-goals

**Goals**
- Any business can fork, edit `site.config.ts`, add products, and go live in under an hour.
- Costs nothing to host on the Cloudflare free tier.
- Works the way BD buyers actually shop: guest checkout with phone number, cash on delivery, bKash/Nagad, Facebook/Messenger-driven traffic, Bangla UI.
- Fast on cheap phones and slow mobile networks.
- Comfortably handles 500–1,000 visitors a day (and 1,000 at once during a Facebook-ad or live-sale spike), and degrades gracefully instead of going down.
- Customizable by a non-developer: setup wizard, admin settings, theme presets, business presets.
- **One-click deployable:** a Deploy to Cloudflare button creates the D1 database and R2 bucket, asks for one secret, deploys, and lands the owner in a browser-based setup wizard. No terminal needed.

**Non-goals (v1)**
- Multi-tenant SaaS (one deploy per business instead).
- Customer accounts and passwords (guest checkout + order tracking by order number + phone).
- Paid SMS/OTP, subscriptions, marketplace/multi-vendor.

---

## 2. Decisions

| Area | Decision | Why |
|---|---|---|
| Framework | Astro SSR (pages) + Hono (API) on one Worker | Light bundle, great SEO, middleware for auth/validation, API reusable by any frontend |
| UI | Tailwind + Preact islands | Small JS for slow networks |
| DB | D1 + Drizzle | Free, SQL, transactional `batch` |
| Images | R2, public bucket/custom domain | Free egress, keeps the Worker out of image traffic |
| Admin auth | One long secret passphrase, constant-time compare, HMAC-signed httpOnly cookie | No password hashing CPU cost; Cloudflare Access is an optional upgrade |
| Bot protection | Cloudflare Turnstile on checkout | Free |
| Payments v1 | COD + manual bKash/Nagad (customer enters TrxID, admin verifies) | Zero fees, matches how most BD shops operate |
| Payments later | Gateway adapter (SSLCommerz / aamarPay / bKash API) | Optional plugin |
| Courier | Adapter interface; Steadfast first | Common among BD sellers |
| Deployment | One fork + one Cloudflare account per business, via the Deploy to Cloudflare button | Each shop gets its own free quota; no terminal needed |
| Image serving | `R2_PUBLIC_URL` when set; Worker route `/img/*` with immutable caching as the zero-config default | Works out of the box after one click; owner can switch to direct R2 later |

---

## 3. Free-tier survival rules (the real engineering challenge)

1. **D1 row reads/writes are capped daily on free.** Index everything, keyset-paginate, cache catalog reads.
2. **10 ms CPU per request.** SSR pages must be cheap: few queries, no heavy templating, no crypto loops.
3. **100k Worker requests/day.** Serve images and static assets outside the Worker (R2 public URL, static assets).
4. **Caching:** cache anonymous catalog/product HTML for 60–300 s and purge on admin changes. Note that the
   Cache API may not store anything on `*.workers.dev` — verify in docs, and recommend a custom domain in the README.
5. **Image pipeline:** compress in the browser to WebP (max 1600 px long edge, quality ~0.8) before upload. Never process images in the Worker.
6. **R2 may require a payment method on the account even for free usage** — document this in the README so shop owners aren't surprised.

---

## 3b. Capacity plan and resilience (500–1,000 visitors)

**Honest framing:** nobody can promise "never down" on a free plan (there is no SLA). What we can do is make sure the
realistic failure modes — daily quota exhausted, a traffic spike hammering D1, one failing request — degrade gracefully
instead of taking the shop offline.

**Budget math** (free limits: Workers 100k requests/day and 10 ms CPU; D1 5M rows read/day and 100k rows written/day;
KV 1k writes/day). These are estimates; Phase 10 measures the real numbers.

| Resource | Free limit | Rough cost of 1,000 visitor-sessions (~10 page views each) |
|---|---|---|
| Worker requests | 100,000 / day | ~10,000 (HTML + a few API calls; static assets and R2 images don't use Worker requests) → ~10% |
| D1 rows read | 5,000,000 / day | cached pages ≈ 0; uncached ≈ 100–300 rows/page → up to ~2M, **only if every query is indexed** |
| D1 rows written | 100,000 / day | GET requests write 0; one order ≈ 25–30 rows incl. index writes → roughly 3,000 orders/day |

**A 1,000-people-at-once spike** is about 10–20k requests within minutes: inside the daily budget. The danger is a burst of
identical uncached D1 queries, which the edge cache removes (everyone gets the same cached page, so D1 sees roughly one
hit per page per minute).

**Where it would actually break:** about 8–10k sessions/day on the free plan, or one unindexed query scanning a big table.
When the shop outgrows free, the fix is one switch: Workers Paid (about $5/month) removes these daily caps. Document this in the README.

**Resilience layers** (details and rules are in `AGENTS.md`):
1. Cache-first reads with stale-while-revalidate, purged on admin writes
2. No D1 writes on GET requests
3. Catalog snapshot in R2 → read-only browsing if D1 fails or hits quota
4. Degraded checkout → "order via Messenger/WhatsApp" with prefilled cart
5. Idempotent checkout (unique `idempotency_key`)
6. Fail-soft integrations (Pixel, courier, Turnstile) with timeouts
7. `/api/health` plus a free external uptime monitor
8. Daily limits reset at 00:00 UTC = 06:00 Bangladesh time; the owner guide says what to do if the quota is hit

**Load-testing warning:** load tests burn the same daily quota. Run k6 against a separate staging deployment, never the live shop.

---

## 3c. One-click Cloudflare deploy

**Button:** `https://deploy.workers.cloudflare.com/?url=https://github.com/taxin-404/bdcommerce` (repo must stay public; Workers apps only, not Pages).

**What the button does for us:** forks the repo into the owner's GitHub, auto-provisions the D1 database and R2 bucket from the
Wrangler config, prompts for the secrets listed in `.dev.vars.example`, runs our `build` and `deploy` scripts (remote migrations, then `wrangler deploy`), and gives a `*.workers.dev` URL.

**Owner flow (no terminal):**
1. Click the button, sign in to Cloudflare and GitHub.
2. Accept or rename the database and bucket names, enter `ADMIN_PASSPHRASE` (a long random passphrase).
3. Wait for the build; open the URL.
4. Go to `/admin`, log in, finish the **setup wizard** (name, logo, theme, contact, payment numbers, delivery fees), optionally apply a business preset to get demo data.

**Design consequences:**
- Only one required secret (`ADMIN_PASSPHRASE`); the session key is derived from it plus a per-install salt in `settings`.
- Image uploads work immediately because images fall back to the Worker route `/img/*`. The admin banner explains how to enable R2 public access (or a custom domain) to remove image traffic from the Worker.
- Presets and demo data are applied from the admin UI, not a CLI script.
- Migrations run on every deploy, so updates apply automatically and must be safe and forward-only.
- No real resource IDs are ever committed to the template repo.

**Still manual (documented in the owner guide):** custom domain (needed for the Cache API), R2 public access, optional keys (Turnstile, courier, Conversions API), and adding a payment method if Cloudflare asks for one for R2.

**Updates:** each deployed shop is an independent fork. `scripts/sync-upstream.sh` merges the template's `main` into the fork and keeps the fork's own resource IDs and config.

---

## 4. Repo layout

```
/
├─ AGENTS.md
├─ PLAN.md
├─ README.md
├─ site.config.ts            # all business-specific values
├─ wrangler.jsonc
├─ .dev.vars.example         # secrets with comments (ADMIN_PASSPHRASE required, the rest optional)
├─ astro.config.mjs
├─ migrations/               # SQL migrations (D1)
├─ scripts/
│  ├─ setup.sh               # optional CLI path (uses Wrangler auto-provisioning; no IDs committed)
│  ├─ sync-upstream.sh       # merge template updates into a deployed fork, keeping its resource IDs
│  └─ seed.ts                # demo data for 3 business types
├─ src/
│  ├─ db/                    # drizzle schema + query helpers (one file per table group)
│  ├─ api/                   # Hono app: public.ts, checkout.ts, admin.ts, upload.ts, middleware/
│  ├─ themes/                # theme presets (clean, bold, soft, dark) as CSS-variable sets
│  ├─ presets/               # business presets (clothing, food, electronics, baby-gifts...)
│  ├─ lib/                   # money, phone, i18n, auth, cache, courier/, payments/
│  ├─ data/bd-geo.json       # divisions → districts → upazilas
│  ├─ i18n/{bn,en}.json
│  ├─ components/            # Astro + Preact components
│  ├─ layouts/
│  └─ pages/
│     ├─ index.astro, shop/, p/[slug].astro, cart.astro, checkout.astro
│     ├─ order/[number].astro, track.astro, page/[slug].astro
│     ├─ admin/              # login, dashboard, products, categories, orders, coupons, settings
│     └─ api/[...route].ts   # mounts the Hono app from src/api/
└─ tests/
```

---

## 5. Config system (`site.config.ts`)

```ts
export default {
  name: { en: "My Shop", bn: "আমার দোকান" },
  tagline: { en: "", bn: "" },
  logo: "/logo.svg",
  theme: { primary: "#0f766e", accent: "#f59e0b", radius: "0.75rem", font: "Hind Siliguri" },
  locale: { default: "bn", available: ["bn", "en"] },
  currency: { code: "BDT", symbol: "৳", bnDigits: true },
  features: {
    stockTracking: true,
    variants: true,
    coupons: true,
    guestCheckout: true,
    reviews: false,
  },
  shipping: {
    zones: [
      { id: "dhaka", label: { en: "Inside Dhaka", bn: "ঢাকার ভিতরে" }, fee: 60 },
      { id: "outside", label: { en: "Outside Dhaka", bn: "ঢাকার বাইরে" }, fee: 120 },
    ],
    freeShippingOver: null,
  },
  payments: {
    cod: { enabled: true },
    bkash: { enabled: true, number: "01XXXXXXXXX", type: "personal" },
    nagad: { enabled: false, number: "", type: "personal" },
  },
  social: { facebook: "", messenger: "", whatsapp: "", instagram: "" },
  tracking: { fbPixelId: "", capi: false },
  contact: { phone: "", email: "", address: { en: "", bn: "" } },
}
```

The `settings` table (JSON values) overrides these at runtime so the owner can edit from the admin without redeploying.
Fee amounts above are placeholders — each business sets its own.

### Customization levels

1. **Owner, no code:** a first-run **setup wizard** in `/admin` (business name, logo upload, color/theme preset, phone and
   Messenger/WhatsApp, bKash/Nagad numbers, delivery fees, first category) plus admin settings that write to the `settings` table:
   announcement bar, homepage sections (enable/disable/reorder), policy pages, social links, Pixel ID.
2. **Light developer:** edit `site.config.ts` and pick a theme preset (`clean`, `bold`, `soft`, `dark`) from `src/themes/`.
3. **Developer:** homepage is built from a section registry (`announcement`, `hero`, `categories`, `featured`, `new`, `banner`,
   `trust`, `testimonials`, `faq`). Adding a section = one component file + one registry line.
4. **Business presets** in `src/presets/` (`clothing`, `food`, `electronics`, `baby-gifts`) define sample categories, attribute fields
   (e.g. Size/Color, Weight/Unit, Specs table), labels, and demo products, so a new shop starts from something close to its own business.

---

## 6. Data model (D1)

```sql
CREATE TABLE categories (
  id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, name_bn TEXT,
  parent_id INTEGER REFERENCES categories(id), image_key TEXT,
  sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL, title_bn TEXT,
  description TEXT, description_bn TEXT,            -- markdown
  category_id INTEGER REFERENCES categories(id),
  price INTEGER NOT NULL, compare_at_price INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  track_stock INTEGER NOT NULL DEFAULT 1,
  attributes TEXT,                                  -- JSON: free-form specs per business type
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE product_images (
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL, alt TEXT, sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE variants (
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT UNIQUE, title TEXT NOT NULL,             -- e.g. "L / Red"
  options TEXT,                                     -- JSON {"size":"L","color":"Red"}
  price INTEGER,                                    -- NULL = use product price
  stock INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY, number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','shipped','delivered','cancelled','returned')),
  customer_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT,
  division TEXT, district TEXT, upazila TEXT, address TEXT NOT NULL, note TEXT,
  subtotal INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0,
  shipping_fee INTEGER NOT NULL, total INTEGER NOT NULL, coupon_code TEXT,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cod','bkash','nagad')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','pending_verification','paid','refunded')),
  payment_trx_id TEXT, payment_sender TEXT,
  courier TEXT, consignment_id TEXT, tracking_code TEXT,
  ip_hash TEXT, idempotency_key TEXT UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER, variant_id INTEGER,
  title_snapshot TEXT NOT NULL, variant_snapshot TEXT,
  unit_price INTEGER NOT NULL, qty INTEGER NOT NULL, line_total INTEGER NOT NULL
);

CREATE TABLE order_events (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL, message TEXT, created_at TEXT NOT NULL
);

CREATE TABLE coupons (
  code TEXT PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('percent','fixed')),
  value INTEGER NOT NULL, min_subtotal INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER, used INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT, ends_at TEXT, active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- JSON
CREATE TABLE blocklist (phone TEXT PRIMARY KEY, reason TEXT, created_at TEXT NOT NULL);

-- indexes (required)
CREATE INDEX idx_products_status_cat ON products(status, category_id, id);
CREATE INDEX idx_products_featured ON products(status, featured, id);
CREATE INDEX idx_images_product ON product_images(product_id, sort);
CREATE INDEX idx_variants_product ON variants(product_id);
CREATE INDEX idx_orders_phone ON orders(phone, created_at);
CREATE INDEX idx_orders_status ON orders(status, created_at);
CREATE INDEX idx_items_order ON order_items(order_id);
CREATE INDEX idx_events_order ON order_events(order_id);
CREATE INDEX idx_cat_parent ON categories(parent_id, sort);

-- search (Phase 3): FTS5 virtual table over product title/title_bn, kept in sync from admin writes
```

**Atomic stock decrement at checkout** (inside one `db.batch`):
`UPDATE variants SET stock = stock - ?1 WHERE id = ?2 AND stock >= ?1` and verify `changes = 1`; otherwise abort the order with an "out of stock" error.

**Order number:** `BD` + base36 timestamp + 3 random chars (short, unguessable enough for tracking when combined with phone).

---

## 7. Pages and API

**Public pages:** `/`, `/shop` (category, sort, search, keyset pagination), `/p/[slug]`, `/cart`, `/checkout`,
`/order/[number]` (confirmation), `/track` (order number + phone), `/page/[slug]` (about, delivery & return policy; content from config/settings).

**Public API:** `GET /api/products`, `GET /api/products/[slug]`, `POST /api/cart/price` (re-price a cart),
`POST /api/coupon/check`, `POST /api/checkout`, `POST /api/track`.

**Admin pages:** login, dashboard (today's orders, pending, revenue), products, categories, orders (list + detail + status flow),
coupons, settings, blocklist.

**Admin API:** CRUD for the above, `POST /api/admin/upload` (image → R2), `POST /api/admin/orders/[id]/status`,
`POST /api/admin/orders/[id]/courier`, `POST /api/admin/orders/[id]/verify-payment`.

---

## 8. Bangladesh-specific specs

- **Phone:** `^(?:\+?88)?01[3-9]\d{8}$` → normalize to `01XXXXXXXXX`.
- **Address:** division → district → upazila cascading selects from `src/data/bd-geo.json`
  (8 divisions, 64 districts, ~490 upazilas). Generate it from a reliable open dataset and **spot-check it**; don't let the agent invent names.
  Delivery zone is derived from district (Dhaka vs outside), overridable by config.
- **COD abuse protection:** Turnstile on checkout; max N pending orders per phone/IP-hash per 24 h (query D1 with the phone/created_at index, not KV — KV writes are tightly limited on free);
  admin blocklist; optional "advance payment required" flag for high-value or flagged orders.
- **bKash/Nagad manual flow:** checkout shows the shop's number and amount; customer enters sender number + TrxID;
  order is `pending_verification`; admin checks the wallet app and marks it paid. Show a clear warning that the order is not confirmed until verified.
- **Courier adapter:** `interface Courier { createParcel(order): Promise<{consignmentId, trackingCode}>; getStatus(id): Promise<Status> }`.
  Implement Steadfast first. The agent must read the courier's current API docs and must not guess endpoints or headers.
- **Facebook:** Pixel events (`ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase`); Conversions API from the Worker is optional and must not block checkout.
  Floating Messenger/WhatsApp button from config.
- **Bangla:** Bangla default, language toggle, Bangla digits option, `Asia/Dhaka` dates, Bangla web font (Hind Siliguri or Noto Sans Bengali), self-hosted.

---

## 9. Phases (one opencode session each)

Each phase: paste the prompt, review the diff, run the acceptance checks, commit, then start a fresh session for the next phase.

### Phase 0 — Scaffold and infrastructure

**Prompt:**
> Read AGENTS.md and PLAN.md. Do Phase 0 only. Scaffold an Astro SSR project with the Cloudflare adapter, Tailwind, Preact, TypeScript strict, Drizzle, Zod, Hono (+ `@hono/zod-validator`), Vitest, pnpm. Mount the Hono app at `src/pages/api/[...route].ts` with routes in `src/api/` and a `/api/health` route. Check current official docs for the adapter and wrangler config. Create `wrangler.jsonc` with D1 binding `DB`, R2 binding `IMAGES`, and static assets. Add the scripts listed in AGENTS.md. Create `.dev.vars.example`, `.gitignore`, a minimal README, and an optional `scripts/setup.sh` for CLI users that relies on Wrangler's automatic provisioning (never commit real resource IDs). Home page can be a placeholder that reads one row from D1 to prove the binding works locally. One-click deploy requirements: declare D1 binding `DB` and R2 binding `IMAGES` in `wrangler.jsonc` without resource IDs so the Deploy to Cloudflare button can auto-provision them (check the current Wrangler and deploy-button docs); add `package.json` scripts `build` and `deploy` where `deploy` applies remote D1 migrations (`wrangler d1 migrations apply DB --remote`) and then runs `wrangler deploy`; make `.dev.vars.example` list every secret with a comment, with only `ADMIN_PASSPHRASE` required; and add this button to the README: `[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/taxin-404/bdcommerce)`.

**Done when:** `pnpm dev` runs, the placeholder page reads from local D1, `pnpm typecheck && pnpm build` pass.

### Phase 1 — Schema, config, seed

**Prompt:**
> Do Phase 1. Implement the full D1 schema from PLAN.md section 6 as Drizzle schema plus a SQL migration including all indexes. Create `site.config.ts` per section 5, a typed config loader that merges the `settings` table overrides, `lib/money.ts` (BDT formatting incl. Bangla digits), `lib/phone.ts` (validate + normalize), and `lib/i18n.ts` with `bn.json`/`en.json`. Write Vitest tests for money and phone. Create `scripts/seed.ts` producing demo data for three business types (clothing with size/color variants, a food shop with weight options, an electronics item with spec attributes).

**Done when:** migration applies locally, seed runs, tests pass.

### Phase 2 — Admin auth, categories, products, R2 uploads

**Prompt:**
> Do Phase 2. Admin login at `/admin/login` using the `ADMIN_PASSPHRASE` secret: constant-time compare, HMAC-signed httpOnly SameSite=Lax cookie (key derived from `ADMIN_PASSPHRASE` via HKDF with a random per-install salt stored in `settings`, so there is no separate SESSION_SECRET), rate-limited failed attempts (use D1, not KV). Implement the session check as Hono middleware on `/api/admin/*`, reused by the admin pages. Build admin CRUD for categories and products (with variants and image management). Image upload: client-side compress to WebP (max 1600 px, quality ~0.8), POST to `/api/admin/upload`, Worker validates type/size and `put`s to R2 under `products/{productId}/{uuid}-{thumb|md|full}.webp` (three sizes: 400, 800, 1600 px). Serve images via `R2_PUBLIC_URL` when it is set; when it is unset, fall back to a Worker route `/img/*` that streams from R2 with `Cache-Control: public, max-age=31536000, immutable`, and show an admin banner explaining how to enable R2 public access. Admin UI must be mobile-friendly and in Bangla/English.

**Done when:** I can log in, create a category and a product with two images and variants, and see the images load from R2 (local emulation is fine).

### Phase 3 — Storefront catalog

**Prompt:**
> Do Phase 3. Build the home page (featured products, categories), `/shop` with category filter, sort, keyset pagination, and search using an FTS5 virtual table kept in sync on admin product writes, and `/p/[slug]` with image gallery, variant selector, stock state, and JSON-LD Product schema. Theming comes from `site.config.ts` via CSS variables. Mobile-first, minimal JS. Respect the D1 query budgets in AGENTS.md and log the query count per page in dev mode. Build the home page from an ordered list of sections stored in `settings` using a section registry (announcement, hero, categories, featured, new, banner, trust, testimonials, faq), and add four theme presets (clean, bold, soft, dark) as CSS-variable sets in `src/themes/`.

**Done when:** a listing page uses ≤ 4 queries, a product page ≤ 6, Lighthouse mobile performance is high on seeded data.

### Phase 4 — Cart, checkout, COD orders

**Prompt:**
> Do Phase 4. Cart in localStorage (Preact island, mini-cart in header). `POST /api/cart/price` re-prices server-side. Checkout page: name, phone (validated), division/district/upazila cascading selects from `src/data/bd-geo.json` (generate from a reliable open dataset and tell me the source so I can spot-check), address, note, Turnstile, payment method (COD only for now). `POST /api/checkout` validates with Zod, re-computes prices, shipping fee by zone, checks stock, and creates order + items + event + atomic stock decrement in one `db.batch`. Require a client-generated `idempotency_key` (unique column on `orders`) so double taps and retries on slow networks never create duplicate orders. Redirect to `/order/[number]` confirmation. Add `/track` (order number + phone).

**Done when:** an order can be placed end to end, stock decrements, overselling is impossible (test it), tampered client prices are ignored (test it).

### Phase 5 — Admin order management and dashboard

**Prompt:**
> Do Phase 5. Admin orders list (filter by status/date/phone, keyset pagination), order detail with timeline from `order_events`, status transitions (pending → confirmed → shipped → delivered, plus cancel/return that restores stock), printable invoice and packing slip (print CSS), and a dashboard with today/this-week counts and revenue using indexed queries only. Add "block this phone" action.

**Done when:** I can process an order through its whole lifecycle and print an invoice.

### Phase 6 — bKash/Nagad manual payments, coupons, delivery settings

**Prompt:**
> Do Phase 6. Add manual bKash and Nagad payment options driven by config (number, personal/merchant). Checkout collects sender number + TrxID, order becomes `pending_verification`, admin can verify or reject. Add coupons (percent/fixed, min subtotal, usage limit, date range) with server-side validation and atomic usage counting. Admin settings page to edit shipping zones/fees, free-shipping threshold, payment toggles, contact and social links, homepage section order, and theme preset (stored in `settings`). Add the first-run setup wizard (business name, logo upload to R2, theme, contact, payment numbers, delivery fees, first category) and the business presets in `src/presets/` (clothing, food, electronics, baby-gifts) that seed categories, attribute fields, and demo products. The wizard and presets must work entirely in the browser: applying a preset is an admin action (`POST /api/admin/presets/apply`), not a CLI script, because one-click deployers have no terminal.

**Done when:** each payment method works end to end, an invalid or exhausted coupon is rejected, settings edits take effect without redeploy.

### Phase 7 — Courier integration and fraud controls

**Prompt:**
> Do Phase 7. Create the `Courier` adapter interface and implement Steadfast (read the current official API docs first; do not guess endpoints). Admin can send an order to the courier, store `consignment_id`/`tracking_code`, and see status. Credentials come from wrangler secrets. Add order-rate limits per phone and IP-hash (24 h window, D1-based), blocklist enforcement at checkout, and an optional "advance payment required" rule for flagged phones. Everything must degrade gracefully when courier credentials are absent.

**Done when:** with test credentials a parcel can be created; without credentials the UI hides the courier action.

### Phase 8 — i18n, SEO, Facebook, contact

**Prompt:**
> Do Phase 8. Finish bn/en coverage (no hardcoded strings), language toggle persisted in a cookie, `hreflang`, sitemap.xml and robots.txt generated from D1 (cached), Open Graph tags per product, Facebook Pixel with standard events (only loaded if a Pixel ID is configured), optional Conversions API call from the Worker using `waitUntil` so checkout is never blocked, floating Messenger/WhatsApp button, and static pages (about, delivery, returns) editable from admin settings.

**Done when:** switching language covers every screen, Pixel fires only when configured, sitemap lists active products.

### Phase 9 — Caching, degraded mode, resilience

**Prompt:**
> Do Phase 9. Implement the resilience rules in AGENTS.md. (1) `lib/cache.ts`: Cache API for anonymous GET HTML/API on custom domains, a short in-isolate memory cache fallback when the Cache API isn't available (e.g. `*.workers.dev`), stale-while-revalidate, and purge on every admin write. (2) Catalog snapshot: on every admin product/category/settings write, write `snapshot/catalog.json` to R2 via `waitUntil`; when a D1 query throws, serve browsing pages from the snapshot in read-only mode with a banner. (3) Degraded checkout: if order creation fails because D1 is unavailable, show an "Order via Messenger/WhatsApp" fallback with the cart summary prefilled from config. (4) Make Pixel, Conversions API, courier, and Turnstile-verification failures non-blocking with timeouts. (5) Run `EXPLAIN QUERY PLAN` on every hot query and fix scans; add a dev-only test that fails if a listing page exceeds 4 queries or a product page exceeds 6. (6) Add a test or grep check that no GET handler writes to D1.

**Done when:** with a flag that simulates D1 failure, the catalog is still browsable and checkout shows the fallback; edits made in admin show up on the storefront within seconds; no GET path writes to D1.

### Phase 10 — Load test, packaging, docs

**Prompt:**
> Do Phase 10. Add k6 scripts in `/loadtest`: (a) browse flow (home → shop → product), (b) spike of 1,000 virtual users over 60 seconds, (c) 50 concurrent checkouts against products with limited stock (verify no overselling and no duplicate orders). Run them against a separate staging deployment only, never the live shop, and report p95 latency, error rate, and the extrapolated daily D1 rows read/written and Worker requests. Then write a complete README: what it is, free-tier limits (including that R2 may need a payment method on file) and what to do if the daily quota is hit or the shop outgrows free (Workers Paid), the "Deploy to Cloudflare" button as the primary install path (with a step-by-step for non-developers in Bangla and English), `scripts/setup.sh` as an optional CLI path, `scripts/sync-upstream.sh` for merging template updates into a deployed fork without losing its resource IDs, custom domain setup (needed for the Cache API), backups (D1 export, Time Travel, rclone for R2), and a smoke-test checklist. Write `docs/CUSTOMIZE.md` and an owner's guide in Bangla and English covering the setup wizard, settings, themes, presets, adding products, and handling orders.

**Done when:** targets are met (p95 under ~800 ms, error rate under 1%, projected daily usage under about 50% of free limits at 1,000 sessions/day), and a brand-new Cloudflare account can deploy through the button, log in, and finish the setup wizard with no terminal, following the docs only. Test the button flow on a fresh account (the repo must be public).

---

## 10. Tips for vibe-coding this with opencode

- Put `AGENTS.md` and `PLAN.md` in the repo root before the first session. opencode reads `AGENTS.md` automatically.
- Use the plan agent first on each phase ("outline what you will change"), then switch to build once the plan looks right.
- One phase per session; commit after each. If a session gets long and sloppy, start a new one and point it at the files.
- Always make it run `pnpm typecheck && pnpm test && pnpm build` and show output.
- Review every new D1 query by hand. The most common agent mistake here is an unindexed filter or an N+1 loop, and on the free tier that becomes an outage, not just slowness.
- Tell it to check current docs for Astro, the Cloudflare adapter, Drizzle, and wrangler. Config syntax changes often and models remember old versions.
- Never paste real secrets into prompts. Use `.dev.vars` and `wrangler secret put`.

---

## 11. Later (v2 ideas)

Reviews and ratings, wishlist, CSV bulk import/export, abandoned-cart recovery via Messenger link, digital products with expiring R2 links,
more couriers (Pathao, RedX), payment gateway adapters (SSLCommerz, aamarPay, bKash API), per-product SEO fields, multi-image variants, PWA/offline cart, light/dark theme.
