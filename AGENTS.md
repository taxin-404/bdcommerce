# AGENTS.md - read this first

You are continuing a project: a **multi-tenant ecommerce platform for Bangladesh that must run
entirely on Cloudflare's free tier**. One codebase must work for any type of business
(physical goods, digital goods, services/bookings).

## Where to look
- `docs/DECISIONS.md` - every architecture/product decision and why. **Do not reverse these without asking the owner.**
- `docs/ROADMAP.md`   - what is done, what is next, in priority order. Work top to bottom.
- `README.md`         - how to run and deploy.

## Current state
Backend base is built and smoke-tested locally (wrangler dev + local D1):
- `packages/shared`   zod schemas, constants, BD divisions/districts, helpers
- `packages/db`       Drizzle schema + generated migration (`migrations/`)
- `packages/payments` payment adapters. **Live methods: COD and manual wallet payment (bKash/Nagad/Rocket send-money + TrxID, admin verifies). The owner has NO bKash merchant account.** The bKash gateway code is dormant and only tested against `scripts/mock-bkash.mjs`. Do not add other gateways until asked (see DECISIONS D9)
- `packages/couriers` courier adapters (Steadfast, Pathao are stubs)
- `apps/api`          Hono Worker: catalog, guest checkout, order tracking, admin routes
NOT built: storefront (Astro), admin UI (React), courier booking, SMS, image upload, real admin login, cron jobs (stale unpaid orders), bKash gateway refunds.

## Commands
```
npm install
npm run db:generate        # after editing packages/db/src/schema.ts (NEVER hand-edit generated migrations)
npm run db:migrate:local
node scripts/seed.mjs demo # prints admin token; then: npm run seed:local
npm run dev:api            # http://localhost:8787, send  -H "x-store-slug: demo"
npm run typecheck          # must pass before you finish any task
node scripts/mock-bkash.mjs   # local fake bKash on :9999; copy apps/api/.dev.vars.example to .dev.vars and set BKASH_BASE_URL_OVERRIDE
```

## Hard rules (violating these breaks the product)
1. **Every tenant table has `store_id` and EVERY query filters by it.** A missing filter is a cross-store data leak.
2. **Money is integer poisha** (1 BDT = 100). Never floats. Use `taka()` from shared for BDT->poisha.
3. **Never trust client prices.** Checkout re-reads prices/stock from D1.
4. **Free-tier budget.** Workers CPU per request is tiny (10-30 ms, sources disagree). No image processing, PDF generation,
   heavy crypto loops or big JSON transforms inside Workers. D1 free tier enforces daily row read/write limits:
   index every filter column, avoid full scans, cache public reads (KV / Cache-Control).
5. **Use adapters for providers.** New payment gateway = new `PaymentProvider` in `packages/payments`; new courier = new
   `CourierProvider` in `packages/couriers`. Do not hardcode providers in routes.
6. **Validate all input with zod from `packages/shared`.** Share schemas between API and frontends.
7. **Schema changes go through `drizzle-kit generate`**, then apply with wrangler. Keep migrations forward-only.
8. **No secrets in the repo.** Use `wrangler secret put` and `.dev.vars` (gitignored). Gateway credentials are stored only AES-GCM encrypted (D9); never log or return them.
   Never mark a manual payment paid without an admin action; TrxIDs must stay unique per store.
   Never trust payment callback query params; mark paid only after server-to-server verification with an exact amount match (D9).
9. Keep it TypeScript, keep dependencies minimal (bundle size and CPU matter).
10. Verify your work: run `npm run typecheck`, and for API changes, run `wrangler dev` and curl the endpoints.

## Working style expected by the owner
- Build one roadmap step at a time, test it, then report what works and what does not. Be honest about untested parts.
- Owner is Bangladesh-based; target users are mostly on phones with slow connections, buy via Facebook, and prefer COD.
