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

## Manual wallet payments (no merchant account needed)
1. Save the store's wallet numbers: `PUT /api/admin/payment-settings/manual` with
   `{"bkash":"01XXXXXXXXX","nagad":"01XXXXXXXXX","instructions":"Send Money, then paste the TrxID"}` (Bearer admin token).
2. Checkout with `"paymentMethod":"manual"` and `"manualPayment":{"wallet":"bkash","senderNumber":"01...","trxId":"8N7A6D5EE7"}`.
3. Admin: `GET /api/admin/orders?paymentStatus=unpaid`, check the TrxID and amount in the wallet app, then
   `POST /api/admin/orders/:id/confirm-payment` or `.../reject-payment`.

## bKash gateway setup (only with a bKash merchant account; dormant otherwise)
1. `openssl rand -base64 32` -> `wrangler secret put CREDENTIALS_KEY` (locally: `apps/api/.dev.vars`, see `.dev.vars.example`).
2. Save the store's bKash credentials (sandbox first):
   `PUT /api/admin/payment-settings/bkash` with `{"appKey","appSecret","username","password","sandbox":true}` and the admin Bearer token.
3. Set `storefrontUrl` in the store's `settings` so customers return to your shop after paying.
4. Ask bKash to allow your callback domain. The callback is `https://<api-host>/api/payments/bkash/callback`.
5. Local testing without bKash: `node scripts/mock-bkash.mjs` plus `BKASH_BASE_URL_OVERRIDE` in `.dev.vars`.
   **bKash is verified against this mock only. Run the real sandbox before going live (docs/DECISIONS.md D9).**

## Layout
- `packages/shared`   zod schemas, constants, BD divisions/districts
- `packages/db`       Drizzle schema + generated migrations (every tenant table has store_id)
- `packages/payments` payment adapters (COD works; bKash/SSLCommerz are stubs)
- `packages/couriers` courier adapters (Steadfast/Pathao are stubs)
- `apps/api`          Hono Worker

## API
Public: `GET /api/payments/bkash/callback` (called by bKash redirect), `GET /api/store`, `/api/products`, `/api/products/:slug`, `/api/categories`,
`POST /api/orders` (guest COD checkout), `GET /api/orders/:number?phone=`, `GET /api/meta/bd-address`
Admin (Bearer token): `POST /api/admin/products`, `GET /api/admin/orders`,
`PATCH /api/admin/orders/:id/status`, `POST /api/admin/orders/:id/verify-payment` (bKash gateway), `GET /api/admin/orders/:id`,
`POST /api/admin/orders/:id/confirm-payment|reject-payment` (manual), `PUT|DELETE /api/admin/payment-settings/manual`,
`PUT|GET|DELETE /api/admin/payment-settings[/bkash]`, `POST /api/admin/blocked-phones`

## Conventions
Money is integer poisha (1 BDT = 100). Prices always come from the DB at checkout.
Every query filters by store_id. D1 free tier has daily row limits: keep queries indexed.

## Not built yet
bKash refunds + stale-order cron, SSLCommerz, courier booking, SMS, upazila data, image upload endpoint (R2),
real admin login (currently one bearer token per store), storefront (Astro), admin UI (React),
coupons, invoices, rate limiting on checkout.
