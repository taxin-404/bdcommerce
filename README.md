# BD Commerce

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/taxin-404/bdcommerce)

A free-tier, config-driven e-commerce template for small Bangladeshi businesses.
Built with Astro SSR, Hono, D1, and R2 on Cloudflare Workers.

**Status:** Phase 0 — scaffold and infrastructure.

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
pnpm dev
```

Open <http://localhost:4321>. Astro runs on Cloudflare's `workerd` runtime locally;
D1 and R2 are emulated. The home page runs `SELECT 1` against the local D1 binding.

Copy `.dev.vars.example` to `.dev.vars` when you need local secrets. Never commit
`.dev.vars`.

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

Only `ADMIN_PASSPHRASE` is required for the current phase. Set it in production
with Wrangler, and copy `.dev.vars.example` to `.dev.vars` for local use:

```bash
pnpm exec wrangler secret put ADMIN_PASSPHRASE
```

The admin session signing key will be derived from the passphrase later, so there
is no separate `SESSION_SECRET`.

## Free-tier notes

The default setup targets Cloudflare's free plan: 100,000 Worker requests/day and
about 10 ms CPU per request, plus D1's daily row read/write limits. R2 storage has a
free allowance but Cloudflare may require a payment method on the account. A custom
domain is recommended before enabling edge caching (Phase 9), because the Cache API
may not store responses on `*.workers.dev`.
