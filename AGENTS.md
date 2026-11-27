# AGENTS.md — BD Commerce Template

Read this file first in every session. Then read `PLAN.md` and work on **one phase at a time**.

## What this project is

A reusable, config-driven e-commerce template for small Bangladeshi businesses (any business type:
clothing, food, electronics, baby items, digital goods...). Each business forks the repo and deploys
to its own Cloudflare account on the **free tier**. No monthly cost is a hard requirement.

## Hard constraints (never violate)

1. **Cloudflare free tier only.** No paid products, no external paid services in the default setup.
   Allowed bindings: Workers (+ static assets), D1, R2, KV (sparingly), Turnstile.
2. **Workers Free = ~10 ms CPU per request and 100k requests/day.**
   - No heavy CPU work in request handlers: no bcrypt/argon2, no big JSON transforms, no image processing in the Worker.
   - Prefer serving images straight from R2 via `R2_PUBLIC_URL` (public bucket or custom domain) so they don't use Worker requests.
   - One-click default: when `R2_PUBLIC_URL` is unset, serve images through a Worker route `/img/*` with `Cache-Control: public, max-age=31536000, immutable`, and show an admin banner recommending R2 public access.
   - Always upload three sizes (thumb 400 px, md 800 px, full 1600 px) so listing pages load tiny images.
3. **D1 free plan enforces daily limits: 5 million rows read and 100,000 rows written per day** (queries fail when exceeded; resets 00:00 UTC = 06:00 Bangladesh time). Index writes count as rows written.
   - Every WHERE/ORDER BY column used on a hot path must be indexed.
   - No full table scans, no `LIKE '%x%'` on big tables (use FTS5), no N+1 queries, no `COUNT(*)` on every request.
   - Use keyset pagination (`WHERE id < ? ORDER BY id DESC LIMIT ?`), not OFFSET.
   - A product page should cost ≤ ~6 queries; a listing page ≤ ~4.
   - Use `db.batch([...])` for multi-statement writes (it is transactional).
4. **Worker bundle size is small on the free plan.** Prefer light dependencies. Check bundle size after adding a package.
5. **Never trust the client.** Cart lives in localStorage, but prices, stock, shipping fee and coupons are
   recalculated on the server at checkout.
6. **Secrets** go in `wrangler secret` / `.dev.vars` (git-ignored). Never commit secrets. Never log PII (phone numbers, addresses) beyond what is needed.

## Resilience rules (target: 500-1,000 visitors, shop stays up)

No free host can promise zero downtime, so the goal is graceful degradation. The realistic failure modes are: daily
quota exhausted, a traffic spike hammering D1, or one failing request. Design for all three.

1. **Cache-first reads.** Anonymous GET pages/API responses are cached (Cache API on custom domains; short in-isolate
   memory cache as fallback on `*.workers.dev`) with stale-while-revalidate, and purged on admin writes.
2. **Zero D1 writes on GET.** No view counters, no analytics rows, no sessions in the DB (sessions are signed cookies,
   carts are localStorage). Writes are reserved for orders, admin changes, and failed-login tracking.
3. **Catalog snapshot in R2.** Every admin save rewrites `snapshot/catalog.json` (via `waitUntil`). If D1 errors
   (quota or outage), the Worker serves the catalog from the snapshot in read-only mode and shows a banner.
4. **Degraded checkout.** If order creation fails because D1 is unavailable, show an "Order via Messenger/WhatsApp"
   fallback with the cart summary prefilled, so no sale is lost.
5. **Idempotent checkout.** The client sends a unique `idempotency_key`; retries and double taps on slow networks never
   create duplicate orders.
6. **Fail-soft integrations.** Pixel, Conversions API, courier, and Turnstile-verification outages must never block
   browsing; use `waitUntil` for non-critical work and timeouts on every external call.
7. **Cheap health endpoint.** `/api/health` makes no D1 write and is safe for an external uptime monitor.
8. **Friendly errors.** Every failure shows a clear Bangla/English message with retry, never a raw error page.

## One-click deploy rules (Deploy to Cloudflare button)

The primary install path is the **Deploy to Cloudflare** button, used by non-developers with no terminal:
`https://deploy.workers.cloudflare.com/?url=https://github.com/taxin-404/bdcommerce`

1. The repo stays **public** and the app stays a **Workers** app (the button does not support Pages).
2. `wrangler.jsonc` declares the D1 binding `DB` and R2 binding `IMAGES` **without resource IDs**, so the button auto-provisions them.
   **Never commit real database IDs or bucket IDs.** Check the current Wrangler and deploy-button docs for the exact config shape.
3. `package.json` has `build` and `deploy` scripts. `deploy` applies remote D1 migrations (`wrangler d1 migrations apply DB --remote`) and then runs `wrangler deploy`.
   Migrations must be idempotent, forward-only, and safe to run on every deploy. No destructive statements without an explicit new migration.
4. `.dev.vars.example` lists every secret with a comment; the button prompts for them. **`ADMIN_PASSPHRASE` is the only required secret.**
   Everything else (Turnstile, courier keys, Conversions API token) is optional and the app must start and work without it.
   The session HMAC key is derived from `ADMIN_PASSPHRASE` (HKDF) plus a random per-install salt stored in `settings`.
5. After deploy, **no CLI step may be required.** Business info, theme, payment numbers, delivery fees, and business presets (demo data)
   are all done in the browser through the first-run setup wizard in `/admin`.
6. Keep business-specific changes in `site.config.ts` and the `settings` table so a deployed fork can pull template updates (`scripts/sync-upstream.sh`) with minimal merge conflicts.

## Stack (decided — do not swap without asking)

- Astro (SSR) with `@astrojs/cloudflare` adapter, TypeScript strict
- Tailwind CSS, Preact islands for interactive parts (cart, checkout, admin tables)
- API: Hono app (routes in `src/api/`) mounted in Astro at `src/pages/api/[...route].ts`; `@hono/zod-validator` for input validation; admin auth is middleware on `/api/admin/*`
- D1 (SQLite) + Drizzle ORM + SQL migrations in `/migrations`
- R2 for product images
- Zod for validation
- Vitest for unit tests (pricing, validation, phone/address helpers)
- `wrangler.jsonc` for config; `pnpm` as package manager

**Before using any Cloudflare / Astro / Drizzle API, check the current official docs** (web search or docs tool).
Do not rely on memory for adapter options, binding syntax, or wrangler config — they change often.

## Conventions

- Money: integer BDT taka everywhere. Format only at the UI layer. Round with `Math.round`.
- All user-facing strings go through the i18n helper (`bn` and `en`). Never hardcode UI text in components.
- All business-specific values (name, logo, colors, currency, delivery fees, payment methods, social links)
  come from `site.config.ts` and the `settings` table. Never hardcode a business name or color.
- Phone numbers: validate with `^(?:\+?88)?01[3-9]\d{8}$`, normalize to `01XXXXXXXXX` before storing.
- Dates stored as ISO strings in UTC (`TEXT`), displayed in `Asia/Dhaka`.
- File names kebab-case, components PascalCase, DB columns snake_case.
- Small focused files. No file over ~300 lines without a reason.
- Every API endpoint: validate input with Zod, return `{ ok: true, data }` or `{ ok: false, error }`, correct HTTP status.
- Admin auth is one Hono middleware on `/api/admin/*`; admin pages reuse the same session check. Never check auth ad hoc inside a handler.

## Commands

```bash
pnpm install
pnpm dev                 # local dev with local D1/R2 emulation
pnpm typecheck           # must pass before every commit
pnpm test                # vitest
pnpm build
pnpm db:generate         # drizzle-kit generate migration
pnpm db:migrate:local    # wrangler d1 migrations apply --local
pnpm db:migrate:remote   # wrangler d1 migrations apply --remote
pnpm run deploy          # remote D1 migrations + wrangler deploy (use `run`: plain `pnpm deploy` is a different built-in command)
```

(If a script does not exist yet, create it in Phase 0.)

## Workflow rules for the agent

- Work on **one phase** of `PLAN.md` per session. Do not start the next phase unless asked.
- Start by stating a short plan, then implement. Prefer small, reviewable diffs.
- After each phase: run `pnpm typecheck && pnpm test && pnpm build`, fix errors, then summarize what changed and
  what to manually test. Do not claim something works without running it.
- Do not add features that are not in the current phase. Put ideas in `docs/IDEAS.md` instead.
- Do not add paid services, analytics SDKs, or heavy UI libraries.
- When unsure about a requirement, ask one concise question instead of guessing.
- Commit message style: `phase-N: short description`.
