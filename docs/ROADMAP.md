# Roadmap (work top to bottom; mark items done here when finished)

## Done
- [x] Monorepo scaffold, shared zod schemas, BD divisions/districts
- [x] Multi-tenant D1 schema + migration
- [x] API: catalog, guest COD checkout, tracking, admin products/orders/blocklist
- [x] Payment + courier adapter interfaces (COD implemented)
- [x] Local smoke test (totals, validation, stock, restock on cancel, admin auth)

## Next (in order)
1. **Fix stock oversell race** (see DECISIONS known issue 1) + add automated API tests (vitest + `@cloudflare/vitest-pool-workers` or miniflare).
2. **Admin API completion:** update/delete product, list/get customers, categories CRUD, product list for admin (incl. drafts),
   dashboard stats endpoint (orders/revenue by day, cached), order detail endpoint.
3. **Image upload:** `POST /api/admin/uploads` to R2 (size/type limits; resize on the client), serve via `GET /media/:key` with long cache headers.
4. **Real auth:** staff accounts + roles + sessions (D13). Replace the single token.
5. **Admin UI (React + Vite + Tailwind + shadcn/ui):** login, products (with variants), orders (status flow, courier/tracking), customers, store settings/theme.
6. **Storefront (Astro):** home, category, product, cart, checkout (COD), order tracking; Bangla/English; mobile-first; per-store theme from `/api/store`.
7. **bKash + SSLCommerz** payment adapters (sandbox first), webhook verification, reorder checkout flow (known issue 4).
8. **Courier integrations:** Steadfast and Pathao first (create parcel from admin, store tracking code, status webhooks/polling).
9. **SMS notifications** (order placed/confirmed/shipped) + email via Resend/Brevo.
10. **COD fraud protection v2:** auto-flag by return history, risky-order rules, rate limits.
11. **Upazila/area data** + courier zone mapping.
12. **Coupons/discounts, invoices (client-side PDF), returns/refunds, low-stock alerts.**
13. **Custom domains per store** (check Cloudflare for SaaS free limits first), staff roles, audit log.
14. **Marketing:** Facebook Pixel + Conversions API, WhatsApp/Messenger buttons, single-product landing page builder.
15. **Later:** abandoned cart recovery, reviews, reseller/affiliate, CSV import, basic accounting, FTS5 search, product translations, digital downloads (signed R2 access), service booking calendars.

## Definition of done for every task
- `npm run typecheck` passes
- New/changed endpoints exercised with curl or tests against `wrangler dev`
- Every new query filters by `store_id`
- Schema changes include a generated migration
- This roadmap and DECISIONS.md updated if a decision changed
