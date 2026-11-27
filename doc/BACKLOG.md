# Backlog

Items deferred from earlier phases. Each one is tagged with the phase that should handle it.
At the end of every phase, the agent appends its deferred items here. When an item is done, delete it.

## Phase 5 (admin order management)
- The localized `title_snapshot` is what the customer saw; admin order views should link back to `product_id` when the product still exists.

## Phase 6 (settings and admin)
- Section config: some fields (image, icon, trust title) are accepted but unused; one invalid section currently resets the whole home layout. Validate per section and keep the valid ones.
- Coupons are not implemented yet: checkout always stores `discount = 0` and `coupon_code = NULL`. Add coupon validation and atomic usage counting.
- bKash/Nagad manual payment is deferred; only COD is accepted.
- Delivery-zone mapping is hardcoded to the `dhaka`/`outside` zone ids and Dhaka district. Make the district-to-zone mapping editable in admin settings.
- The cart does not show free-shipping progress; add a hint when `freeShippingOver` is configured.

## Phase 7 (courier and fraud controls)
- Order rate limits per phone/IP and blocklist enforcement are not wired into checkout yet (`ip_hash` stays NULL).
- `/track` has no rate limit. Add one so order-number guesses are throttled.
- Turnstile verification currently trusts `cf-connecting-ip` when present; review the proxy/IP handling during the fraud-control pass.

## Phase 8 (i18n, SEO, accessibility)
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

## Phase 9 (caching, resilience)
- The language cookie MUST be part of the cache key, otherwise a Bangla page can be served to an English visitor.
- Home page queries sections that are not configured and re-parses `home_sections` on every request. Cache it.
- FTS sync is a separate write sequence from the product batch. The admin "reindex search" action repairs drift. Consider including the FTS write in the batch.
- FTS ranking and concurrent sync need a look during the query audit.
- Parent-category price sorts use the `(status, price)` index instead of the category index because of the `IN (parent, children)` list. Re-check with a large catalog.
- Categories with an inactive parent need a decision.
- Confirmation is a one-time POST form; refreshing may prompt a resubmission. Consider a short-lived signed view cookie/token in Phase 9.
- Consolidate the settings read with the cart/checkout first query; both pages currently make one settings round trip before the client re-prices.
- The no-GET-writes test is file-level. Add a handler-level check so a future GET route cannot hide a write behind a shared helper.
- When D1 fails before pricing, the fallback message lists only "the items in my cart" without names/prices. Show a cached/last-known summary if one is available.

## Phase 10 (packaging)
- The seed has no demo images. Add demo images or document the admin upload step in the owner guide.
- Document the geo dataset refresh step and keep its source/license notice visible to forks.
