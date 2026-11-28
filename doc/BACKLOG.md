# Backlog

Items deferred from earlier phases. Each one is tagged with the phase that should handle it.
At the end of every phase, the agent appends its deferred items here. When an item is done, delete it.
The current order of work is in doc/ROADMAP.md (Phase 8 is split into 8A launch-critical, 8B polish, 8P UddoktaPay, 8C accounts).

## Before real launch
- BEFORE REAL LAUNCH: verify the Steadfast integration with real merchant credentials (create a test parcel, refresh its status). Replace the community-doc assumptions in DECISIONS.md with the official docs from the Steadfast merchant dashboard. Decide whether to send delivery_type.
- BEFORE REAL LAUNCH: set the image address (custom-domain R2 URL for production; r2.dev only for testing) and run the Settings “Test” against a real stored image.
- BEFORE REAL LAUNCH: decide whether Turnstile is enabled, review the fraud limits, and set a strong ADMIN_PASSPHRASE (16+ random characters).
- BEFORE REAL LAUNCH: run the GUI test on the deployed shop (setup wizard, image upload, COD and bKash checkout, order lifecycle).

## Phase 8A (launch-critical, deferred follow-ups)
- Nagad mobile dial link is deliberately omitted because no official nagad.com.bd page documents the USSD code. Add it only after an official source is found and record the URL in DECISIONS.md.
- Wallet QR replacement leaves the previous R2 object orphaned. Add best-effort cleanup after the settings row commits (Phase 9 cache/purge work is a good place).
- Logo and wallet QR URLs are frozen at upload time. Store the R2 key (or `/img/...`) and resolve the base at render, or rewrite both URLs when the image address changes.
- The image-address “Test” success path cannot be exercised locally because the setting rejects localhost; verify it once with a real public R2 URL before launch.

## Phase 8B (polish, SEO, reach)
- Add a "My orders" page: order numbers saved in the browser plus a phone check. No login.
- Order confirmation loads via POST, so refreshing shows a 'resubmit form' warning. Find a way to keep the phone number out of the URL without the warning (for example a short-lived signed token).
- Preset attribute labels are defined in `src/presets/`, but the product form does not render per-category attribute fields yet. Wire them into the admin product editor.
- The cart does not show free-shipping progress; add a hint when `freeShippingOver` is configured.
- Coupon percent/used counts in the admin table are not localized to Bangla digits.
- Some ARIA labels are English-only. The shop search input has no label of its own. The "↳" character is read aloud by screen readers. Category chips lack `aria-current`.
- No canonical link or `noindex` for filtered shop URLs. Meta descriptions are not truncated.
- Locale toggle shows even when only one locale is configured. The locale cookie lacks `Secure`.
- Contrast is not validated. Dark-theme stock colours are hard-coded. No `color-scheme: dark`.
- Unknown category links fall back to all products. The Featured "View all" link points to newest instead.
- Shop count shows the page size, not a total.
- Server-side Zod issue messages and a few API error strings are English. Map them to i18n keys or stop showing them in the UI.
- The mini-cart and track result lack a dedicated live region; review with the accessibility pass.
- Mini-cart titles are stored at add time, so switching language leaves old-language titles until the cart page re-prices.

## Phase 8P (UddoktaPay adapter) and 8C (optional accounts)
- See doc/ROADMAP.md for the full requirements of both. They are optional features, off by default.

## Phase 9 (caching, resilience)
- The language cookie MUST be part of the cache key, otherwise a Bangla page can be served to an English visitor.
- Home page queries sections that are not configured and re-parses `home_sections` on every request. Cache it.
- FTS sync is a separate write sequence from the product batch. The admin "reindex search" action repairs drift. Consider including the FTS write in the batch.
- FTS ranking and concurrent sync need a look during the query audit.
- Parent-category price sorts use the `(status, price)` index instead of the category index because of the `IN (parent, children)` list. Re-check with a large catalog.
- Categories with an inactive parent need a decision.
- Consolidate the settings read with the cart/checkout first query; both pages currently make one settings round trip before the client re-prices.
- The no-GET-writes test is file-level. Add a handler-level check so a future GET route cannot hide a write behind a shared helper.
- When D1 fails before pricing, the fallback message lists only "the items in my cart" without names/prices. Show a cached/last-known summary if one is available.
- The admin order list puts the phone filter in the GET URL (browser history, Referer, edge logs). Move filter state to POST/session or an opaque token if edge logs must be PII-free.
- The legacy `idx_orders_status` / `idx_orders_phone` indexes are redundant after the Phase 5 composite keyset indexes. Remove them after confirming production plans.
- The low-stock count reads every tracked variant at or below 5 before filtering the product state. Re-measure on a large catalog or maintain a counter.
- Settings/coupon/preset admin writes do not purge a cached storefront yet because caching is not implemented. Add purge hooks when Phase 9 cache is added.
- The admin Worker-image banner reads the `images` setting on every admin page when `R2_PUBLIC_URL` is unset (one extra row read). Consolidate it with the auth/settings read or cache the resolved image base.

## Phase 10 (packaging)
- The seed has no demo images. Add demo images or document the admin upload step in the owner guide.
- Document the geo dataset refresh step and keep its source/license notice visible to forks.
