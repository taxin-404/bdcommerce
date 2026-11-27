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

## Phase 4 — cart, checkout, COD orders
- Prices, line totals, shipping, and order totals are always recomputed from D1. The client supplies only product id, variant id, and quantity; price/total fields are stripped by Zod and ignored. An unsafe (non-safe-integer) line total marks the line unavailable, and admin prices are capped at 1,000,000,000 BDT.
- A line uses `variant.price` when it is not null, otherwise the product price. Out-of-stock, inactive, missing, and variant-required lines are marked unavailable and block order creation.
- Delivery zone is derived from the district: Dhaka district → `dhaka`, every other district → `outside`, with the first/last configured zone as a fallback. `freeShippingOver` is applied server-side. There is no client-supplied shipping fee.
- COD is the only accepted payment method in Phase 4; bKash/Nagad and coupons are deferred.
- Products with no variants, and products with `track_stock = 0`, are orderable without stock checks or decrements. Tracked variants require a variant id and use the selected variant's stock.
- One `db.batch` contains the stock update, guard, order, items, and event rows. The stock update is a single `UPDATE ... WHERE stock >= qty` fed by one JSON parameter (`json_each`), so a 50-line cart stays under D1's 100-bound-parameter limit. A one-row `checkout_guard` CHECK compares `changes()` with the expected tracked-line count, so D1 rolls back the whole order if any line was short. Measured on real local D1: 50 concurrent orders for stock 5 produced exactly 5 orders, stock 0, and 45 409s; a 30-line order succeeded.
- Every checkout requires `idempotency_key`. The route checks it before pricing; a repeat returns the same order (200) without pricing or writing. `orders.request_hash` stores a SHA-256 fingerprint of the customer, geo, items, and payment method: a repeated key with a different intent gets 409 instead of silently returning the old delivery details. A concurrent UNIQUE race re-reads the winner and returns it when the intent matches. The client keeps one key per cart signature and rotates it when the cart, phone, or address changes.
- `order_items` snapshots the localized product title and the variant title with its options. `variant_id` and `product_id` stay as references for admin views.
- Turnstile runs only when both keys are configured. An invalid/missing token fails the checkout; Siteverify 5xx/429/network errors and `internal-error` responses fail open with a warning, while 4xx configuration errors and `bad-request` fail closed and log loudly. `.dev.vars.example` lists Cloudflare's official test keys in comments; no test keys are hardcoded in application code.
- `src/data/bd-geo.json` comes from the MIT `nuhil/bangladesh-geocode` dataset (8 divisions, 64 districts, 495 upazilas). The checker validates the full hierarchy server-side; the generator is `scripts/generate-bd-geo.mjs`.
- `/order/[number]` and `/track` require order number + phone, are read-only, send `Cache-Control: no-store`, and are `noindex`. `/track` uses POST. The checkout island submits the confirmation as a one-time POST form, so the phone number never enters the URL or browser history.
- If D1 fails during order creation, the API returns a 503 with a prefilled fallback message and configured Messenger/WhatsApp/tel links; it never returns a raw error. Cart/checkout/order/track pages fall back to the default config when the settings read fails, and order/track show a friendly unavailable card instead of a raw 500.
- D1 errors are classified before the outage heuristic: constraint failures (`UNIQUE`, `CHECK`) are not treated as outages, so idempotent retries return the existing order and guard failures return out-of-stock. A rare `orders.number` UNIQUE collision retries up to 4 times with a fresh number inside the same service; the failed batch rolls back.
- Query counts (dev instrumentation, D1 round trips): checkout 4 for a new order and 2 for an idempotent retry; cart price 2; cart and checkout pages 1; order and track pages 3.
- Supersedes the Phase 3 "no JS framework on the storefront" ruling: the mini-cart, add-to-cart, cart page, and checkout use small Preact islands; catalog pages still ship only their small inline scripts.
- The client stores one idempotency key per cart signature. Retrying an unchanged cart reuses the key; changing the cart rotates it, so a lost response cannot make the client clear a new cart while returning an old order.
- Physical browser pass at 390 px: the header search moves to a full-width second row, and the confirmation page deduplicates locality names already present in the street address (for example "House 12, Road 5, Savar" + upazila Savar).

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
