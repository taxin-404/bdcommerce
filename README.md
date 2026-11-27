# BD Commerce

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/taxin-404/bdcommerce)

A free-tier, config-driven e-commerce template for small Bangladeshi businesses.
Built with Astro SSR, Hono, D1, and R2 on Cloudflare Workers.

**Status:** Phase 4 — cart, checkout, COD orders, confirmation, and tracking.

> **Do not launch a real shop until Phase 7.** Checkout has no per-phone or
> per-IP order limits yet, the blocklist is not enforced, and Turnstile is off by
> default. Fake COD orders can drain tracked stock. Phase 7 adds those fraud
> controls; until then, use this on a staging store only.

## One-click deploy

Click the button above. Cloudflare reads `wrangler.jsonc`, provisions the D1
database and R2 bucket automatically, runs `pnpm run build`, and then runs
`pnpm run deploy`. The template intentionally contains **no resource IDs**, so
the generated IDs belong only to the deploying account and are never committed
to this repository.

When the deploy prompts for `ADMIN_PASSPHRASE`, use a random passphrase of at
least 16 characters (for example, `openssl rand -base64 24`). Admin login stays
disabled for missing, short, or placeholder/known-weak values, including the old
example text. The repository pins Node.js with `.node-version` (22.23.4) so the
button build does not depend on the build image's current default.

## Requirements

- Node.js >= 22.23.4
- pnpm
- A Cloudflare account for deployment (not needed for local development)
- R2 may require a payment method on file, even within the free allowance

## Local development

```bash
pnpm install
pnpm db:migrate:local
pnpm db:seed
pnpm dev
```

Open <http://localhost:4321>. Astro runs on Cloudflare's `workerd` runtime locally;
D1 and R2 are emulated. The storefront renders from the seeded catalog, and demo
products use `/placeholder.svg` until real images are uploaded in the admin.

`pnpm db:seed` loads a demo catalog for three business types: clothing with
size/colour variants, food with weight options, and electronics with spec
attributes. It only targets local D1. It deletes all local catalog rows
(products, variants, images, and categories) and reloads the demo data; orders,
settings, coupons, and the blocklist are left untouched.

Copy `.dev.vars.example` to `.dev.vars` when you need local secrets. Never commit
`.dev.vars`.

## Admin

Open <http://localhost:4321/admin/login> and sign in with `ADMIN_PASSPHRASE`.
The first login creates a random `session_salt` row in the D1 `settings` table;
the httpOnly `SameSite=Lax` session cookie is HMAC-signed with a key derived
from the passphrase via HKDF-SHA256 and lasts 7 days. Five failed attempts per
15 minutes from one IP are rejected. The admin UI is available in Bangla and
English and is designed for phones as well as desktops.

From the admin you can create categories, create and edit products with
variants, and upload images. Uploads are resized in the browser to 400, 800, and
1600 px WebP (quality 0.8); the Worker validates the WebP header and a 1 MB
per-file limit, then stores three objects under
`products/{productId}/{uuid}-{thumb|md|full}.webp`.

### Serving images

Images load from `R2_PUBLIC_URL` when it is set (a public R2 bucket or custom
domain). When it is empty, the `/img/*` Worker route streams the same objects
with `Cache-Control: public, max-age=31536000, immutable` and the admin shows a
banner recommending public R2 access. Serving straight from R2 keeps image
traffic off the Worker request budget.

## Storefront

- `/` — section-based home page from `settings.home_sections`
- `/shop` — category filter, newest/price sort, keyset pagination, and FTS5 search
- `/p/[slug]` — image gallery, variant selector, stock state, and JSON-LD Product data
- `/404` — friendly not-found page

Search uses the `product_fts` FTS5 table. Admin product create, update, and delete
rebuild the row for that product, and draft/archived products are removed from the
index. `pnpm db:seed` also repopulates the index. Category filters include the
selected category plus its direct children. Listing pagination is keyset-based
(cursor), never `OFFSET`.

## Cart and checkout

The cart lives in `localStorage` (`bd_cart_v1`) and is shown by a small Preact
mini-cart in the header. Stored prices and titles are display-only: `POST
/api/cart/price` and `POST /api/checkout` always re-read products and variants
from D1, use `variant.price` when set (otherwise the product price), derive the
delivery zone from the district, and recompute subtotal, shipping, and total.
Client-supplied prices, discounts, and shipping fees are ignored.

Checkout is cash on delivery only in this phase. Every submission must include
a client-generated `idempotency_key`; retries and double taps return the same
order instead of creating another. The key is tied to the cart and delivery
details, and the server stores a request fingerprint, so changing the order
intent cannot silently return an older order. Tracked variants are decremented in the same
`db.batch` as the order, items, and event rows. The batch uses a one-row
`checkout_guard` CHECK: if any `UPDATE ... WHERE stock >= qty` did not match,
`changes()` is smaller than expected and D1 rolls the whole order back. Products
with `track_stock = 0`, and products with no variants, are orderable without a
stock check or decrement.

`/order/[number]` and `/track` require the order number plus the phone number
used at checkout. Both lookups are POST forms, so the phone never appears in
the URL. Both pages are read-only, `no-store`, and `noindex`.

If D1 is unavailable while creating an order, the API returns a structured 503
with a prefilled Messenger/WhatsApp/tel fallback built from `site.config.ts` and
the `settings` table, so the customer can still send the order manually. Set
`social.messenger`/`social.whatsapp` (or `contact.phone`) in the config so the
fallback has a one-tap link; the copyable message always appears.

### Bangladesh geo data

`src/data/bd-geo.json` contains 8 divisions, 64 districts, and 495 upazilas,
generated by `node scripts/generate-bd-geo.mjs` from the MIT-licensed
[`nuhil/bangladesh-geocode`](https://github.com/nuhil/bangladesh-geocode)
dataset (BBS geo-codes, pinned upstream commit; license text in
`src/data/bd-geo.LICENSE`). The server validates the full division → district →
upazila hierarchy; unknown or mismatched names are rejected. Delivery is inside
Dhaka for Dhaka district and outside Dhaka for every other district.

### Turnstile

Turnstile is optional and is enforced only when both `TURNSTILE_SITE_KEY` and
`TURNSTILE_SECRET_KEY` are set. Without them checkout works normally. The
official always-pass test keys are listed in `.dev.vars.example` comments; copy
them into a git-ignored `.dev.vars` only for local testing, and replace them
with real keys in production. An invalid token fails the checkout, while a
Siteverify 5xx/429/network outage fails open so a Cloudflare incident cannot
take checkout down. A 4xx Siteverify configuration error or `bad-request` fails closed.

In development, `pnpm exec astro dev logs` also shows the new query counts:
`[queries] cart: 1`, `checkout-page: 1`, `order: 3`, `track: 3`,
`cart-price: 2`, and `checkout: 4` for a new order (`2` for an idempotent retry).

### Themes

Set `theme.preset` in `site.config.ts` to `clean`, `bold`, `soft`, or `dark`. The
presets live as CSS-variable sets in `src/themes/`; `theme.primary`, `theme.accent`,
`theme.radius`, and `theme.font` still come from config and are validated before
they reach an inline style. A `theme` row in the `settings` table can override
individual fields, including the preset.

### Home sections

`settings.home_sections` holds an ordered JSON array. Supported types are
`announcement`, `hero`, `categories`, `featured`, `new`, `banner`, `trust`,
`testimonials`, and `faq`. Missing or invalid JSON falls back to the defaults in
`src/lib/sections.ts`. Links are restricted to site-relative paths or `http(s)` URLs.

In development, `pnpm exec astro dev logs` shows the query count per page
(`[queries] home: 4`, `[queries] shop: 3`, `[queries] product: 4`).

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the local dev server |
| `pnpm build` | Build for Cloudflare Workers |
| `pnpm preview` | Preview the built Worker locally |
| `pnpm typecheck` | Generate binding types and run `astro check` |
| `pnpm test` | Run Vitest |
| `pnpm types` | Regenerate `worker-configuration.d.ts` |
| `pnpm db:generate` | Generate a D1 migration with Drizzle Kit |
| `pnpm db:migrate:local` | Apply migrations to local D1 |
| `pnpm db:migrate:remote` | Apply migrations to remote D1 |
| `pnpm db:seed` | Load the local demo catalog (clothing, food, electronics) |
| `node scripts/generate-bd-geo.mjs` | Regenerate `src/data/bd-geo.json` from the upstream dataset |
| `pnpm run deploy` | Apply remote migrations, then deploy with Wrangler |

## CLI deployment

The Deploy to Cloudflare button is the recommended path. For a manual CLI deploy:

```bash
pnpm install
pnpm exec wrangler login
pnpm run build
pnpm exec wrangler deploy        # auto-provisions D1 and R2
pnpm run db:migrate:remote
```

After the first deploy, `pnpm run deploy` applies remote migrations and deploys
the Worker. If Wrangler writes provisioned resource IDs into `wrangler.jsonc`
during a CLI deploy, do not commit them; the template is designed to work with
ID-free bindings and Wrangler will find the resources by name on later deploys.

## Secrets

`ADMIN_PASSPHRASE` is required. Set it in production with Wrangler, and copy
`.dev.vars.example` to `.dev.vars` for local use:

```bash
pnpm exec wrangler secret put ADMIN_PASSPHRASE
```

From Phase 2, admin session cookies are signed with a key derived from
`ADMIN_PASSPHRASE` via HKDF-SHA256 plus a random per-install salt stored in the
D1 `settings` table. There is no separate `SESSION_SECRET`, so a one-click
deploy still needs only one secret.

`TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are optional. Leave them unset
to disable Turnstile, or set real keys to enforce it at checkout. The official
always-pass test keys are listed in `.dev.vars.example` comments; copy them into
a git-ignored `.dev.vars` for local testing only.

## Configuration

Edit `site.config.ts` for the shop name, theme, delivery zones, payment numbers,
social links, and feature flags. Runtime overrides live in the D1 `settings`
table (JSON values keyed by config section) and are merged over these defaults by
`loadConfig()`; the admin screens that write them arrive in later phases. Only
known config section keys are merged. Unknown rows are ignored, and invalid rows
are skipped with a warning, so one bad setting cannot take the site down.

## Free-tier notes

The default setup targets Cloudflare's free plan: 100,000 Worker requests/day and
about 10 ms CPU per request, plus D1's daily row read/write limits. R2 storage has a
free allowance but Cloudflare may require a payment method on the account. A custom
domain is recommended before enabling edge caching (Phase 9), because the Cache API
may not store responses on `*.workers.dev`.
