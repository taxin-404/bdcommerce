# BDCommerce

Production-ready e-commerce template for Bangladesh — lightweight and self-hostable.

The backend is a Hono API running on Cloudflare Workers, backed by Cloudflare D1
(SQLite at the edge) with Drizzle ORM. The repo also contains a shared domain
logic package, a React UI primitives package, and (planned) a Next.js 15
storefront + admin dashboard on Cloudflare Pages.

## Status

| Component | Workspace | Status |
| --- | --- | --- |
| API (Worker) | `apps/api` | Implemented, tested, runs locally |
| Domain logic / schemas | `packages/core` | Implemented, unit-tested |
| DB schema + migrations | `packages/db` | Implemented, migrations generated |
| UI primitives | `packages/ui` | Implemented (React components) |
| Storefront (Next.js) | `@bd/storefront` | Planned — scripts scaffolded, app not created |
| Admin (Next.js) | `@bd/admin` | Planned — scripts scaffolded, app not created |

## Tech stack

- **Runtime**: Cloudflare Workers (workerd), Node ≥ 20
- **Framework**: [Hono](https://hono.dev), `@hono/zod-validator`, zod
- **Data**: Cloudflare D1 + [Drizzle ORM](https://orm.drizzle.team), drizzle-kit
- **Storage**: Cloudflare R2 (media), Cloudflare KV (short cache / rate-limit fallback)
- **Auth**: HttpOnly cookie JWT access + rotating refresh tokens (PBKDF2-SHA256 passwords)
- **Language**: TypeScript 5.9 (strict), npm workspaces, vitest

## Repo layout

```
apps/
  api/            Hono Worker: routes, middleware, lib, wrangler.toml
packages/
  core/           Shared schemas, cart/coupon/pricing logic, utils, tests
  db/             Drizzle schema, migrations, drizzle-kit config
  ui/             React component primitives
```

## Getting started

```bash
npm install
```

Create `apps/api/.dev.vars` with your secrets (see `.env.example`):

```bash
JWT_SECRET=<generate one: openssl rand -base64 48>
```

Set up the local D1 database:

```bash
npm run db:generate   # (re)generate a migration from the schema
npm run db:apply      # apply migrations to the local D1 database
npm run db:seed       # echo; demo seed lives in packages/db/drizzle/0001_seed.sql
```

> Migrations (including the demo seed `0001_seed.sql`) are applied automatically
> by `npm run db:apply`.

Start the API locally:

```bash
# option 1 — quick (wrangler dev on :8787)
npm run dev:api

# option 2 — managed dev server on :8799 with start/stop/restart/log helper
./apps/api/dev-server.sh start
./apps/api/dev-server.sh log
./apps/api/dev-server.sh stop
```

Verify it's up:

```bash
curl http://localhost:8799/health
# {"ok":true,"data":{"status":"ok","database":"ok",...}}
```

### Demo seed credentials

After applying `0001_seed.sql` you can log in as admin:

- **email**: `admin@bdcommerce.com`
- **password**: `admin123`

The seed also adds two products (with variants), shipping zones (inside/outside
Dhaka), payment methods (COD, bKash, Nagad, Rocket), a `WELCOME10` coupon, and a
basic menu. Replace or delete the seed before any real deployment.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev:api` | Run the API Worker locally (`wrangler dev`, :8787) |
| `npm run typecheck` | Typecheck all workspaces |
| `npm run test` | Run core unit tests (vitest) |
| `npm run lint` | Lint core |
| `npm run build:api` | Bundle the Worker (`wrangler deploy --dry-run`) |
| `npm run db:generate` | Generate a D1 migration from the schema |
| `npm run db:apply` | Apply migrations to the local D1 database |
| `npm run db:apply:remote` | Apply migrations to remote D1 |
| `npm run db:studio` | Open drizzle-kit studio |
| `npm run db:seed` | Seed helper (demo data ships as a migration) |

## API overview

Base path: `/api/v1` (customer + public), `/api/admin` (admin), `/media` (R2).

- **Auth** — `POST /api/v1/login`, `/register`, `/refresh`, `/logout`, `/forgot-password`, `/reset-password`, `GET /api/v1/me`. Access/refresh tokens are HttpOnly cookies.
- **Catalog** — `GET /api/v1/products` (pagination, filters, search), `/products/:slug`, `/products/flash-sale`.
- **Cart** — `GET|POST|PATCH|DELETE /api/v1/cart(/items)`; guest carts via `x-cart-token` header, registered carts via session.
- **Checkout** — `GET /api/v1/checkout/zones`, `POST /estimate`, `/coupon/validate`, `POST /api/v1/checkout` (place order).
- **Orders** — `GET /api/v1/orders`, `GET /orders/:orderNumber` (owner or `x-order-email`), `POST /orders/track` (public), `POST /:orderNumber/cancel`, `/payment`.
- **Social** — `POST /api/v1/reviews`, `/reviews/:id/helpful`; wishlist CRUD under `/api/v1/wishlist`.
- **Content** — menu, pages, banners, testimonials, blog under `/api/v1/content`.
- **Misc** — `GET /api/v1/site`, `/payment-methods`, newsletter/contact POST.
- **Admin** (all require admin cookie) — catalog/products/categories/brands, orders + status transitions, content, customers/staff/notifications/settings, dashboard stats, media upload to R2.

Conventions: responses use `{ ok, data, meta? }` (`ok:false` for errors); money is in **paisa** (1 BDT = 100 paisa); order numbers are `BD-YYYYMMDD-XXXX`; review creation requires a verified purchase.

## Deployment

1. Create the D1 database, KV namespace, and R2 bucket, then fill in the ids in `apps/api/wrangler.toml`.
2. Set secrets: `wrangler secret put JWT_SECRET` (or `apps/api/.dev.vars` locally).
3. Apply migrations remotely: `npm run db:apply:remote`.
4. Deploy: `npm run deploy:api`.

The CI workflow (`.github/workflows/ci.yml`) typechecks, lints, runs tests, and
builds the API on push/PR.

## License

Commercial license — see [LICENSE](LICENSE). Copyright (c) 2026 taxin-404.
