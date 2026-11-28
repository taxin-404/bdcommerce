# Backlog

Items deferred from earlier phases. Each one is tagged with the phase that should handle it.
At the end of every phase, the agent appends its deferred items here. When an item is done, delete it.

## Before real launch
- BEFORE REAL LAUNCH: verify the Steadfast integration with real merchant credentials (create a test parcel, refresh its status). Replace the community-doc assumptions in DECISIONS.md with the official docs from the Steadfast merchant dashboard. Decide whether to send delivery_type.

## Phase 8 (i18n, SEO, accessibility, Phase 7 follow-ups)
- Manual bKash/Nagad payment UX at checkout: "Copy number" and "Copy amount" buttons; on mobile a "Open bKash/Nagad" dial link (tel: USSD code, verify the codes against current provider docs); optional QR image uploaded by the owner in Settings (stored in R2) and shown next to the number; short Bangla/English step-by-step instructions that differ for personal vs merchant wallets; a clear "order not confirmed until verified" notice.
- Delivery-zone mapping is hardcoded to the `dhaka`/`outside` zone ids and Dhaka district. Make the district-to-zone mapping editable in admin settings, and allow adding/removing zones once mapping is editable.
- The coupon admin page supports create, active toggle, and delete only. Add full edit for percent/fixed value, date window, and max uses.
- A rejected wallet payment can only be re-verified after a manual rollback; add an explicit re-verify action if owners need it.
- Inventory: stock restores skip lines whose product or variant was deleted after the order. Decide whether to keep a full variant/product snapshot or accept the loss.
- Dashboard revenue is placed-order gross value. Add a separate cash-collected/paid-only metric and make the low-stock threshold configurable (currently fixed at 5).
- The order status API accepts a note, but the admin UI does not collect one. Add an optional note field with the transition buttons.
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
- If the Turnstile widget script cannot load, the submit button stays blocked. Add a friendly retry/fallback path.
- The mini-cart and track result lack a dedicated live region; review with the accessibility pass.
- Mini-cart titles are stored at add time, so switching language leaves old-language titles until the cart page re-prices.
- Order confirmation loads via POST, so refreshing shows a 'resubmit form' warning. Find a way to keep the phone number out of the URL without the warning (for example a short-lived signed token).

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

## Phase 10 (packaging)
- The seed has no demo images. Add demo images or document the admin upload step in the owner guide.
- Document the geo dataset refresh step and keep its source/license notice visible to forks.
