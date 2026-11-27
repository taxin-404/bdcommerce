# BD Commerce

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/taxin-404/bdcommerce)

A free-tier, config-driven e-commerce template for small Bangladeshi businesses.
Built with Astro SSR, Hono, D1, and R2 on Cloudflare Workers.

**Status:** Phase 3 — storefront catalog, search, themes, and home sections.

## One-click deploy

Click the button above. Cloudflare reads `wrangler.jsonc`, provisions the D1
database and R2 bucket automatically, runs `pnpm run build`, and then runs
`pnpm run deploy`. The template intentionally contains **no resource IDs**, so
the generated IDs belong only to the deploying account and are never committed
to this repository.

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
