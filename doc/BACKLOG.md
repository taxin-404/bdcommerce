# Backlog

Items deferred from earlier phases. Each one is tagged with the phase that should handle it.
At the end of every phase, the agent appends its deferred items here. When an item is done, delete it.

## Must do in Phase 4 (checkout and orders)
- Products with `track_stock = 0`, and products with no variants, must be orderable with no stock check or decrement.
- Server-side re-pricing uses the selected variant's price, falling back to the product price. Never trust client prices.
- Only tracked variants decrement stock, atomically (`UPDATE ... WHERE stock >= qty` inside one `db.batch`).
- Store title and variant snapshots in `order_items`.
- Variantless products are currently treated as in stock because there is no product-level stock column. Confirm this is the intended behaviour at checkout.

## Phase 6 (settings and admin)
- Section config: some fields (image, icon, trust title) are accepted but unused; one invalid section currently resets the whole home layout. Validate per section and keep the valid ones.

## Phase 8 (i18n, SEO, accessibility)
- Some ARIA labels are English-only. The shop search input has no label of its own. The "↳" character is read aloud by screen readers. Category chips lack `aria-current`.
- No canonical link or `noindex` for filtered shop URLs. Meta descriptions are not truncated.
- Locale toggle shows even when only one locale is configured. The locale cookie lacks `Secure`.
- Contrast is not validated. Dark-theme stock colours are hard-coded. No `color-scheme: dark`.
- Unknown category links fall back to all products. The Featured "View all" link points to newest instead.
- Shop count shows the page size, not a total.

## Phase 9 (caching, resilience)
- The language cookie MUST be part of the cache key, otherwise a Bangla page can be served to an English visitor.
- Home page queries sections that are not configured and re-parses `home_sections` on every request. Cache it.
- FTS sync is a separate write sequence from the product batch. The admin "reindex search" action repairs drift. Consider including the FTS write in the batch.
- FTS ranking and concurrent sync need a look during the query audit.
- Parent-category price sorts use the `(status, price)` index instead of the category index because of the `IN (parent, children)` list. Re-check with a large catalog.
- Categories with an inactive parent need a decision.

## Phase 10 (packaging)
- The seed has no demo images. Add demo images or document the admin upload step in the owner guide.
