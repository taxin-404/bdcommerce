# Roadmap

Current order of work after Phase 7. Where this file and doc/PLAN.md disagree about the order or scope of Phases 8-10, this file wins.
Read it together with doc/BACKLOG.md and doc/DECISIONS.md at the start of every session. Do one item per session.

## Done
Phases 0-7 are merged: scaffold, schema/seed/config, admin auth + products + R2 uploads, storefront catalog, cart/checkout/COD orders,
admin orders + dashboard + printing, manual bKash/Nagad + coupons + settings + setup wizard + presets, courier (Steadfast) + fraud controls.

## Owner decisions (do not change without asking)
- Manual bKash/Nagad stays the default, zero-fee payment flow. Cash on delivery stays.
- UddoktaPay is the first optional payment gateway (adapter, off by default). Other gateways come later.
- Optional customer accounts: Google sign-in first, then email magic links. No passwords. Guest checkout stays the default.
- No customer SMS/OTP login and no paid services in the default setup.
- Default fraud limits: 5 orders per phone and 50 per IP per 24 hours (the IP limit is higher because many mobile users share carrier IPs).
- Only ADMIN_PASSPHRASE is required. Optional keys are commented out in .dev.vars.example and documented in the README.
- Images: default is the Worker `/img/*` route. r2.dev is for testing only (rate-limited, no caching); production uses a custom domain.

## Order of work

### 0. Env cleanup (check `git log` first; skip if already merged)
Only ADMIN_PASSPHRASE uncommented in .dev.vars.example. Turnstile and Steadfast keys commented out. README "Optional settings" table.

### 8A. Launch-critical — DONE (branch `phase-8a`)
- Manual bKash/Nagad checkout UX: "Copy number" and "Copy amount" buttons, mobile dial link (verify USSD codes against current provider docs),
  optional owner-uploaded QR image (R2), Bangla/English steps for personal vs merchant wallets, clear "not confirmed until verified" notice.
- "Image address (R2 public URL)" field in Admin > Settings, stored in the settings table, takes priority over the R2_PUBLIC_URL variable.
  Hide the "images are served through the Worker" banner once it is set. Help text: custom domain for production, r2.dev for testing only.
- Editable district-to-zone mapping and add/remove delivery zones.
- Paid-only (cash collected) dashboard metric and configurable low-stock threshold.
- Explicit re-verify action for rejected wallet payments.
- Order note field next to the status transition buttons.
- Full coupon edit (value, date window, max uses).
- Decide how to handle stock restores for deleted products/variants.
- Turnstile script load failure: friendly retry/fallback.
- Deferred: Nagad dial link (no official USSD source found); QR orphan cleanup; verify the image-address Test against a real public R2 URL.

### 8B. Polish, SEO, reach
- Bangla server-side error messages, accessibility fixes, Bangla digits, free-shipping progress hint.
- SEO: canonical links, noindex for filtered shop URLs, meta descriptions, sitemap, robots, hreflang.
- Facebook Pixel (only when configured) and optional Conversions API via waitUntil, floating Messenger/WhatsApp button, editable static pages.
- "My orders" page: order numbers saved in the browser plus a phone check. No login.
- Order confirmation without the "resubmit form" warning.
- Wire preset attribute labels into the admin product editor.

### 8P. UddoktaPay adapter (optional, off by default)
- Read the official docs (uddoktapay.readme.io) and official libraries first. Test only against the sandbox. Never commit keys.
- `PaymentGateway` interface (createCharge, verifyPayment) with a thin fetch-based UddoktaPay client. Optional secret UDDOKTAPAY_API_KEY plus the shop's panel URL stored in settings (https only, no private addresses). Hidden when not configured.
- Order becomes paid only after server-side verification where amount and order number match our record. Idempotent, race-safe, one invoice/transaction can never mark two orders paid.
- Safe migration for the payment_method CHECK constraint on existing databases (with an upgrade test).
- Admin "Re-check payment" button, timeline events, mismatch banner. Refunds stay manual.
- Stock policy for abandoned gateway orders (simplest free mechanism, approved in the plan step).
- Unknown to confirm before launch: where the shop owner's UddoktaPay panel runs and what it costs (it may not be free), and current terms for business use of personal wallets.

### 8C. Optional customer accounts (off by default)
- Google sign-in first (owner supplies their own Google Cloud OAuth client; app must be "In production"), then email magic links via a free-tier email service.
- No passwords. Signed-cookie sessions, no D1 writes per request. Order history and saved addresses.
- Never link past orders by phone number alone: only orders placed while signed in, or claimed with order number + phone.
- Owner guide covers the Google Cloud setup in Bangla and English.

### 9. Caching and resilience
See the Phase 9 items in doc/BACKLOG.md (cache key must include the language cookie, snapshot fallback, degraded mode, purge hooks, query audit).

### 10. Load test, packaging, docs
k6 load tests against a staging deployment only, README, owner guide (Bangla and English), docs/CUSTOMIZE, sync-upstream script, Deploy button test on a fresh account.

## Before any real shop goes live (checklist)
- [ ] Steadfast verified with real merchant credentials (test parcel created and refreshed).
- [x] District-to-zone mapping is editable (verify it is correct for the shop's delivery areas).
- [x] Paid-only revenue metric exists so cash collected is not confused with placed orders.
- [ ] Turnstile decision made (enabled or deliberately off) and fraud limits reviewed.
- [ ] Strong ADMIN_PASSPHRASE set (16+ random characters).
- [ ] GUI test passed on the deployed shop: setup wizard, image upload, COD and bKash checkout, order lifecycle.
- [ ] Image serving decided: Worker route (default) or custom-domain R2 URL.
- [ ] Custom domain connected (needed for caching in Phase 9).
- [ ] Payment approach decided: manual only, or manual plus UddoktaPay.
- [ ] Backups: D1 export schedule and R2 copy.
