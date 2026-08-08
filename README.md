# BDCommerce

Production-ready e-commerce template for Bangladesh — lightweight and self-hostable.

The backend is a Hono API running on Cloudflare Workers, backed by Cloudflare D1
(SQLite at the edge) with Drizzle ORM. The repo also contains a shared domain
logic package, a React UI primitives package, and (planned) a Next.js 15
storefront + admin dashboard on Cloudflare Pages.

Everything runs on Cloudflare — no local database, server, or environment
required. The API deploys in minutes and the schema ships with it.

## Status

| Component | Workspace | Status |
| --- | --- | --- |
| API (Worker) | `apps/api` | Implemented, tested, deployable |
| Domain logic / schemas | `packages/core` | Implemented, unit-tested |
| DB schema + migrations | `packages/db` | Implemented, migrations generated |
| UI primitives | `packages/ui` | Implemented (React components) |
| Storefront (Next.js) | `@bd/storefront` | Planned — scripts scaffolded, app not created |
| Admin (Next.js) | `@bd/admin` | Planned — scripts scaffolded, app not created |

## Tech stack

- **Runtime**: Cloudflare Workers
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

## Quick start (Cloudflare)

No local database or secrets setup needed — the Worker owns everything.

1. **Clone and install**

   ```bash
   git clone git@github.com:taxin-404/bdcommerce.git
   cd bdcommerce
   npm install
   ```

2. **Provision Cloudflare resources**

   ```bash
   cd apps/api
   npx wrangler d1 create bdcommerce
   npx wrangler r2 bucket create bdcommerce-media
   npx wrangler kv namespace create bdcommerce-kv
   ```

   Paste the returned `database_id` and KV `id` into `apps/api/wrangler.toml`.

3. **Set the JWT secret**

   ```bash
   npx wrangler secret put JWT_SECRET
   ```

   (Local-only dev can put it in `apps/api/.dev.vars` instead.)

4. **Apply schema + seed migrations to remote D1**

   ```bash
   npm run db:apply:remote
   ```

   Migrations live in `packages/db/drizzle/` and ship with the repo — the schema
   and the demo data seed (`0001_seed.sql`) are applied together. Remove the seed
   migration before going live and seed your own data.

5. **Deploy**

   ```bash
   npm run deploy:api
   ```

   Verify: `curl https://<your-worker>.workers.dev/health`.

6. **Create an admin**

   Seed an initial `ADMIN` user in remote D1:

   ```bash
   npx wrangler d1 execute bdcommerce --remote \
     --command "INSERT INTO users (id, email, name, password_hash, role, is_active, created_at, updated_at) VALUES ('...', 'you@example.com', 'Admin', '...pbkdf2 hash...', 'ADMIN', 1, ...);"
   ```

   Generate a PBKDF2 hash with the project's `hashPassword` util
   (`packages/core`/`apps/api`), then log in at the storefront once it ships.

## Schema & migrations workflow

- Change a schema file under `packages/db/src/schema/`
- `npm run db:generate` — emit a new migration into `packages/db/drizzle/`
- Commit the migration; apply to remote with `npm run db:apply:remote`

## Scripts

| Command | Description |
| --- | --- |
| `npm run typecheck` | Typecheck all workspaces |
| `npm run test` | Run core unit tests (vitest) |
| `npm run lint` | Lint core |
| `npm run build:api` | Bundle the Worker (`wrangler deploy --dry-run`) |
| `npm run deploy:api` | Deploy the API Worker |
| `npm run db:generate` | Generate a D1 migration from the schema |
| `npm run db:apply:remote` | Apply migrations to remote D1 |
| `npm run db:studio` | Open drizzle-kit studio |
| `npm run dev:api` | Run the Worker locally for development (`wrangler dev`) |

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

## CI

The workflow (`.github/workflows/ci.yml`) typechecks, lints, runs tests, and
builds the API on every push/PR to `main`.

## License

Commercial license — see [LICENSE](LICENSE). Copyright (c) 2026 taxin-404.
