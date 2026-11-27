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
- Not recorded here. The agent may add them from the git history and README if useful.
