# Ideas

Ideas that are not part of the current phase go here. Scheduled work lives in doc/ROADMAP.md.

- Optional customer accounts (off by default): Google sign-in first, then email magic links via a free-tier email service. Guest checkout stays the default. No passwords. Sessions are signed cookies (no D1 writes per request). Order history and saved addresses. Never link past orders by phone number alone; only orders placed while signed in, or claimed with order number + phone. Owner guide must explain the Google Cloud setup and the "In production" step. (Scheduled as 8C in doc/ROADMAP.md.)
- Optional SMS auto-verification for personal bKash/Nagad (off by default): webhook endpoint secured by an optional secret (SMS_WEBHOOK_SECRET), accepts only bKash/Nagad sender messages from an Android SMS-forwarder app, parses TrxID + amount + sender, stores only those fields (unique by TrxID, idempotent), and auto-marks a matching pending order paid. When no SMS matches, the order stays pending_verification for manual review (never auto-paid). Document the risks: SMS format changes, the phone must stay online, provider terms for personal wallets.
- Shop-wide "advance delivery charge on COD" option: the customer pays only the delivery fee up front via manual bKash/Nagad, which makes fake orders cost something.
- More payment gateway adapters after UddoktaPay (for example aamarPay, ShurjoPay, SSLCommerz) using the same `PaymentGateway` interface. These need a merchant account from the provider. Develop against each provider's sandbox first.
- Facebook login for customers: more reach than Google in Bangladesh, but it needs app review and business verification, so it is skipped for now.
