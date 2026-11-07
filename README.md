# BD Commerce (base)

Multi-tenant ecommerce backend for Bangladesh, built to run on Cloudflare's free tier
(Workers + D1 + KV + R2). One deployment serves many stores.

## Run locally
```bash
npm install
npm run db:migrate:local
node scripts/seed.mjs demo      # prints the admin token for the demo store
npm run seed:local
npm run dev:api                 # http://localhost:8787
```
Call the API with `-H "x-store-slug: demo"` (in production the store is resolved from
`<slug>.ROOT_DOMAIN` or a custom domain).

## Deploy
```bash
cd apps/api
npx wrangler d1 create bdc                 # paste database_id into wrangler.toml
npx wrangler kv namespace create CACHE     # paste id into wrangler.toml
npx wrangler r2 bucket create bdc-media
cd ../.. && npm run db:migrate:remote
cd apps/api && npx wrangler deploy
```
Create a real store by adapting `scripts/seed.mjs` and running it with `--remote`.

For AI assistants: start with AGENTS.md, then docs/DECISIONS.md and docs/ROADMAP.md.

## Layout
- `packages/shared`   zod schemas, constants, BD divisions/districts
- `packages/db`       Drizzle schema + generated migrations (every tenant table has store_id)
- `packages/payments` payment adapters (COD works; bKash/SSLCommerz are stubs)
- `packages/couriers` courier adapters (Steadfast/Pathao are stubs)
- `apps/api`          Hono Worker

## API
Public: `GET /api/store`, `/api/products`, `/api/products/:slug`, `/api/categories`,
`POST /api/orders` (guest COD checkout), `GET /api/orders/:number?phone=`, `GET /api/meta/bd-address`
Admin (Bearer token): `POST /api/admin/products`, `GET /api/admin/orders`,
`PATCH /api/admin/orders/:id/status`, `POST /api/admin/blocked-phones`

## Conventions
Money is integer poisha (1 BDT = 100). Prices always come from the DB at checkout.
Every query filters by store_id. D1 free tier has daily row limits: keep queries indexed.

## Not built yet
bKash/SSLCommerz, courier booking, SMS, upazila data, image upload endpoint (R2),
real admin login (currently one bearer token per store), storefront (Astro), admin UI (React),
coupons, invoices, rate limiting on checkout.
