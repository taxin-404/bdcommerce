# Decisions log

Format: decision, why, rejected alternatives, and when to revisit.

## D1. Scope: multi-tenant platform, one deployment, many stores
- **Decision:** one codebase + one D1 database, `store_id` on every tenant table. Stores resolve by
  `x-store-slug` header, `<slug>.ROOT_DOMAIN`, or custom domain (in that order).
- **Why:** "works for any business" + free tier = one Cloudflare account serving many stores. A per-client template
  would mean redeploying and maintaining N copies.
- **Rejected:** per-business installs (maintenance cost); separate D1 DB per store (migration pain, DB count limits).
- **Revisit when:** a single store needs isolation guarantees or exceeds D1's size (5 GB free).

## D2. Hosting: Cloudflare free tier only
- **Decision:** Workers (API), Pages/Workers assets (frontends), D1 (SQLite), R2 (images), KV (cache/sessions).
- **Free limits seen (verify before relying; they change):** Workers 100k requests/day; CPU 10 ms (one source) or 30 ms (another)
  per request; D1 5M rows read/day, 100k rows written/day, 5 GB, and since 2026-09-01 queries FAIL when daily limits are
  exceeded; R2 10 GB free, no egress fees; Pages 20k files/site, 500 builds/month, 25 MB/file; ToS forbids serving
  streaming video / large non-HTML files from the CDN.
- **Consequences:** cache aggressively, keep Workers light, index everything, make heavy work (PDFs, image resize)
  happen client-side or at upload time outside Workers.
- **Upgrade path:** Workers Paid is $5/month and needs no architecture change. Do this when order volume or
  stores grow (D1 writes add up: one order = ~5-10 row writes).

## D3. Backend: Hono + TypeScript on Workers; Drizzle ORM on D1
- **Why:** Hono is tiny and built for Workers (low CPU). Drizzle is type-safe, light, has migrations for D1.
- **Rejected:** Next.js on Workers (heavy, adapter friction, SSR burns the CPU/request budget); Medusa.js / Saleor
  (need a long-running Node server + Postgres, incompatible with free Cloudflare); Express/Nest (not Workers-native).

## D4. Storefront: Astro (planned)
- **Why:** mostly static HTML = fast on slow mobile networks, great SEO (Google + Facebook shares matter for BD sellers),
  few Worker requests. Interactive bits (cart, checkout) are small islands calling the API.
- **Rejected:** Angular storefront (large JS bundle, SEO needs SSR/prerender, more free-tier cost). Next.js (see D3).

## D5. Admin UI: React + Vite + Tailwind + shadcn/ui + TanStack Table (planned)
- **Why:** biggest ecosystem for admin tables/forms; fastest to build; static SPA, so zero Worker CPU.
- **Alternative accepted if the owner knows it better:** Angular for the admin only (never the storefront). The API is
  framework-agnostic, so this swap costs nothing on the backend.

## D6. Money in integer poisha; currency BDT
- **Why:** avoids float errors. `stores.currency` exists for future flexibility but only BDT is supported/tested.
- Display formatting (৳, Bangla numerals) is a frontend concern.

## D7. Product model: flexible, covers any business
- `products.type` in {physical, digital, service}; `product_variants` hold sku/price/stock/options JSON;
  `products.attributes` is free-form JSON for business-specific fields; `stock = NULL` means not tracked
  (services, digital). Shipping fee applies only if the order has a physical item.
- **Why:** one schema fits t-shirts, downloads, and bookings without per-industry tables.
- **Not yet supported:** real booking/availability calendars for services, digital file delivery (needs R2 signed
  access), subscriptions.

## D8. Checkout: guest checkout, COD first
- **Decision:** no customer accounts required. Customer is identified by (store, phone). Checkout needs name,
  phone, division/district, address line. COD is the default payment method.
- **Why:** BD buyers are phone-first and COD is dominant; signup friction kills conversion.
- Prices and stock are re-read server-side. Order numbers are per-store, from an atomic counter on `stores`.
- Order tracking requires order number AND the phone used, so it works without login.

## D9. Payments: adapter pattern; COD + manual wallet payment now, bKash gateway ready but dormant (owner decision)
- **Owner constraint:** the owner CANNOT get a bKash merchant account (bKash's online-business application asks for an NID,
  valid trade license, bank account and website; aggregators like ShurjoPay also ask for trade license/TIN/business bank account).
  So the live launch methods are **COD** and **manual wallet payment**. Do not build other gateways until asked.
- **Manual wallet payment (`paymentMethod: "manual"`)**: the store saves its own bKash/Nagad/Rocket number(s) (personal or agent
  accounts work; no API, no merchant account) via `PUT /api/admin/payment-settings/manual`. Checkout shows the numbers
  (`GET /api/store` -> `manualPayment`), the customer sends money, then submits wallet + sender number + TrxID.
  Order is created `pending/unpaid` with stock reserved and `awaitingVerification: true`. The admin opens the order
  (`GET /api/admin/orders/:id` shows TrxID, wallet, sender), checks the wallet app for a matching TrxID AND amount, then calls
  `POST /api/admin/orders/:id/confirm-payment` (marks paid, order -> confirmed) or `.../reject-payment` (cancels, releases stock).
  Filter the queue with `GET /api/admin/orders?paymentStatus=unpaid`.
- **Manual payment anti-abuse rules (do not weaken):** TrxIDs are normalized to uppercase and are UNIQUE per store (DB unique index
  `payments_ref` + app check), so one real TrxID cannot pay for two orders; the wallet must be one the store configured;
  nothing is ever marked paid automatically; confirm/reject are admin-only and idempotent; rejected/cancelled orders release stock.
- **Manual payment risks:** it is human-verified, so it only scales to modest order volume; fake TrxIDs are possible (admin must
  actually check the wallet); unpaid manual orders hold stock until confirmed/rejected (needs an expiry cron, see roadmap);
  partial/incorrect amounts must be caught by the admin; **check bKash/Nagad/Rocket's current rules on using personal accounts for
  business payments** (accounts used heavily for commerce can be restricted). Moving to a merchant account or aggregator later is the fix.
- **Launch methods per store:** `GET /api/store` returns `paymentMethods`: `cod` always, `manual` if the store saved wallet numbers,
  `bkash` only if the store saved gateway credentials. The storefront must render only those. Other gateways (SSLCommerz, Nagad API) return 501.
- **Why COD + manual:** COD is dominant in BD ecommerce and is how most small shops without merchant accounts also take wallet money.
  Stripe is intentionally not used (generally unavailable for BD businesses).
- **bKash gateway integration (DORMANT until the owner has a merchant account; code kept so it is a credentials-only switch)** (`packages/payments/src/bkash.ts`): Tokenized Checkout one-shot flow:
  grant token (cached in KV ~1h) -> create payment -> redirect customer to `bkashURL` -> bKash redirects the browser to
  `GET /api/payments/bkash/callback` -> server executes the payment -> if execute is not `Completed` it queries payment status.
- **Money safety rules (do not weaken):**
  1. The callback query string is untrusted. Paid is decided only by a server-to-server execute/status call that returns
     `statusCode 0000` + `transactionStatus Completed` AND an amount equal to OUR order total AND a `trxID`.
  2. Execute errors/timeouts never mean "failed": always follow with a status query (a timed-out execute may have taken the money).
  3. The callback is idempotent (bKash may call twice); a paid payment is never executed again.
  4. If the customer cancels/fails, the order is cancelled and its reserved stock is released (`failOnlineOrder`).
  5. If the result is unclear the order stays `pending/unpaid` and stock stays reserved; an admin (or a future cron) calls
     `POST /api/admin/orders/:id/verify-payment` to re-check with bKash.
- **Checkout order of operations (fixes old known issue 4):** insert order + unpaid payment row FIRST (stock reserved),
  THEN call the gateway. If gateway init fails the order is cancelled and stock released, and the API returns 502.
- **Credentials:** per store, AES-GCM encrypted in `store_payment_credentials` using the `CREDENTIALS_KEY` Worker secret
  (base64 32 bytes), bound to `<storeId>:<provider>` as AAD. Never returned by any endpoint, never logged.
  Set via `PUT /api/admin/payment-settings/bkash`. The bKash base URL is NOT user-configurable (SSRF/credential-exfiltration risk);
  only the operator env var `BKASH_BASE_URL_OVERRIDE` (local mock testing) can change it. **Never set it in production.**
- **Storefront redirect after payment:** `stores.settings.storefrontUrl` + `/order/<number>?payment=paid|failed|cancelled|pending`.
  Without it the callback returns JSON.
- **!! API version caveat:** implemented against bKash's widely documented `v1.2.0-beta` tokenized endpoints
  (`/checkout/token/grant|create|execute|payment/status`, headers `authorization: <id_token>` + `x-app-key`, grant uses
  `username`/`password` headers). bKash also has a newer "v2" API (`/v2/tokenized-checkout/...`). It has been tested ONLY against
  `scripts/mock-bkash.mjs`, never real bKash. Before going live: run the bKash sandbox flow with the merchant's sandbox credentials,
  compare with developer.bka.sh for the merchant's assigned API version, and have bKash approve the callback domain. Only
  `bkash.ts` should need to change if the version differs.
- **Not built:** refunds, agreements/one-click payments, bKash webhook/IPN, automatic reconciliation cron for stuck pending orders.

## D10. Couriers: adapter pattern
- Pathao, Steadfast, RedX, Paperfly are the common BD couriers. Interface lives in `packages/couriers`.
  Per-store credentials will be stored per store (encrypted; see roadmap) and passed to the adapter.
- COD amount sent to courier = order total if payment is COD, else 0.

## D11. Address model
- Division -> District (validated against a static list of 8 divisions / 64 districts) -> optional upazila/area (free text
  for now) + address line. Dropdown-based addresses reduce failed deliveries.
- **Next:** load upazila/thana + area data (static JSON in `packages/shared` or a D1 table) and have the courier
  adapters map to the courier's own zone IDs (Pathao uses city/zone/area IDs).

## D12. Fraud protection (COD)
- `blocked_phones` table, checked at checkout. This is the start; planned: auto-flag customers with repeated
  returned/cancelled orders, optional advance payment for risky orders, rate limits per phone/IP.

## D13. Auth
- **Current (temporary):** one random admin token per store; only its SHA-256 hash is stored in `stores.admin_token_hash`.
  Token printed once by `scripts/seed.mjs`.
- **Planned:** real staff accounts with email/phone + password (hashed with a Workers-friendly KDF; mind the CPU limit,
  consider PBKDF2 via WebCrypto with moderate iterations, or Cloudflare Access) and roles (owner, staff). Sessions in KV.
- Public endpoints trust `x-store-slug` to pick the store: acceptable because they only expose public data.

## D14. Caching
- Store lookup cached in KV for 300 s (so store setting changes take up to 5 min to apply; delete the KV key to force).
  Public catalog GETs send `Cache-Control: public, max-age=60`. KV free tier has a small daily write limit, so
  do NOT write to KV per request.

## D15. Localization
- Bangla + English. `stores.locale` sets default. API returns raw data; translation of UI strings is a frontend job.
  Product text is single-language per field for now (planned: translations table or `name_bn` fields).
- Fonts: Hind Siliguri or Noto Sans Bengali.

## D16. Communication & marketing (planned)
- SMS order confirmation/OTP via a local provider (e.g. BulkSMSBD), WhatsApp/Messenger deep links, Facebook Pixel +
  Conversions API (Facebook is the main sales channel for BD sellers). `stores.settings` already has fields for contact info and pixel ID.

## D17. Repo conventions
- npm workspaces monorepo: `apps/*`, `packages/*`; packages are consumed as TypeScript source (`main: src/index.ts`),
  bundled by wrangler/esbuild. No build step for packages.
- UUID primary keys generated in app code (`crypto.randomUUID()`); timestamps are unix seconds.

## Known issues / risks in the current base (be aware, fix in roadmap)
1. **Stock race condition:** checkout checks stock, then decrements in a later batch. Two simultaneous orders for the
   last unit can oversell. Fix: make the decrement conditional (`WHERE stock >= qty`) and abort/roll back if 0 rows changed
   (D1 batch is atomic, use a check statement), or reserve stock via a Durable Object.
2. **Order number gaps:** the counter increments before the order insert, and orders whose online payment fails are cancelled but keep their number. Harmless but visible.
   Also: abandoned bKash checkouts (customer closes the tab) stay `pending` and hold stock until verified/cancelled; a cleanup cron is needed.
3. **No rate limiting** on `POST /api/orders` (spam/fake COD orders). Add Cloudflare WAF rate-limit rule and per-phone limits.
4. ~~Provider init ran before the order insert~~ FIXED: order is inserted first, gateway init second (see D9).
5. **Only BDT, one language per field, no discounts/coupons, no taxes/VAT, no refunds flow.**
6. Admin has no audit log and no pagination totals.
7. `LIKE '%q%'` search is a full scan of the store's products; fine for small catalogs, replace with FTS5 when catalogs grow (D1 row-read limit).
8. Smoke-tested locally only. Never deployed to real Cloudflare, so verify D1/KV/R2 bindings after first deploy.
