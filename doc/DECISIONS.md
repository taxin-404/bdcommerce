# Decisions

Choices made during the build. Later sessions must not change these without asking.
At the end of every phase, the agent appends its rulings here under a new heading.

## Phase 3 — storefront catalog
- FTS rows use `rowid = product.id`: one row per product, with active SKUs aggregated.
- Admin search uses FTS5 over all statuses and the slug; the storefront search adds `status = 'active'`. No `LIKE '%q%'` anywhere.
- Category filtering covers the selected category plus its direct children only.
- Keyset cursors are base64url JSON (`{id}` or `{price,id}`). No OFFSET.
- Product cards show "From" the cheapest active variant. The detail page defaults to that variant, and JSON-LD uses its price and SKU.
- Stock labels, stock state, and JSON-LD availability honour `product.track_stock` and `config.features.stockTracking`.
- Locale order: `?lang=`, then the locale cookie, then config.
- `theme.preset` is config-driven. Radius and font values are validated to block CSS injection.
- Section, social, and logo URLs reject `javascript:`, protocol-relative, and `/\` paths.
- Homes without a hero get a hidden H1. Only the first hero renders an H1.
- No external fonts or JS framework on the storefront: SSR plus small inline scripts.
- Query budgets: home 4, shop 3, product 4.
- Server-side re-pricing is Phase 4's job. The product page only shows the selected variant's price.

## Phase 1–2

### Phase 1 — schema, config, seed
- Astro SSR plus a Hono API on one Worker; Tailwind CSS and Preact islands; D1 with Drizzle ORM; R2 for images. These are the stack decisions implemented by Phase 1.
- The D1 schema is maintained as a Drizzle schema plus SQL migrations with indexes.
- Configuration defaults live in `site.config.ts`; JSON rows in the D1 `settings` table are merged over them. Unknown keys are ignored and invalid rows are skipped with a warning, so one bad setting cannot take the site down.
- Money is stored as integer BDT and formatted only at the UI layer. Phone numbers are validated and normalized before storage. User-facing strings live in the `bn`/`en` i18n JSON files.
- The demo seed is local-only and covers three business types: clothing with size/colour variants, food with weight options, and electronics with spec attributes. Re-seeding replaces catalog rows but preserves orders, settings, coupons, and the blocklist.

### Phase 2 — admin auth, catalog management, R2 images
- Admin login uses `ADMIN_PASSPHRASE` with a constant-time compare and an httpOnly `SameSite=Lax` session cookie valid for 7 days.
- The session signing key is HKDF-SHA256 over `ADMIN_PASSPHRASE` plus a random per-install salt stored in the D1 `settings` table. There is no separate `SESSION_SECRET`.
- Failed logins are limited to 5 attempts per 15 minutes per IP, tracked in D1.
- The admin UI supports Bangla and English and is usable on phones.
- Images are resized in the browser to 400, 800, and 1600 px WebP at quality 0.8. The Worker validates the WebP header and a 1 MB per-file limit, then stores three objects under `products/{productId}/{uuid}-{thumb|md|full}.webp`.
- Images load from `R2_PUBLIC_URL` when set. When it is empty, the `/img/*` Worker route streams the same objects with `Cache-Control: public, max-age=31536000, immutable`.
- The admin can create categories, create and edit products with variants, and upload images.
