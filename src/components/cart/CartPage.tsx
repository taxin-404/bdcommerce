import { useEffect, useState } from 'preact/hooks';
import {
  MAX_LINE_QTY,
  cartCount,
  cartSignature,
  cartSubtotal,
  type StoredCartLine,
} from '../../lib/cart';
import {
  cartItemInputs,
  clearCart,
  deleteCartLine,
  readCart,
  setCartQty,
  subscribeCart,
} from '../../lib/cart-store';
import { t, type Locale } from '../../lib/i18n';
import { pickLocalized } from '../../lib/locale';
import { formatBdt, toBanglaDigits } from '../../lib/money';
import type { PricedCart, PricedLine } from '../../lib/pricing';

interface Props {
  locale: Locale;
  symbol: string;
  bnDigits: boolean;
}

function reasonLabel(line: PricedLine, locale: Locale): string {
  switch (line.reason) {
    case 'out_of_stock':
      return t(locale, 'cart.outOfStock');
    case 'variant_required':
      return t(locale, 'cart.variantRequired');
    case 'variant_invalid':
      return t(locale, 'cart.variantInvalid');
    case 'invalid_price':
      return t(locale, 'cart.invalidPrice');
    default:
      return t(locale, 'cart.notFound');
  }
}

export default function CartPage({ locale, symbol, bnDigits }: Props) {
  const [lines, setLines] = useState<StoredCartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [priced, setPriced] = useState<PricedCart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const money = (amount: number) => formatBdt(amount, { locale, symbol, bnDigits });
  const number = (value: number) =>
    locale === 'bn' && bnDigits ? toBanglaDigits(value) : String(value);

  useEffect(() => {
    setLines(readCart());
    setReady(true);
    return subscribeCart(setLines);
  }, []);

  const signature = cartSignature(cartItemInputs(lines));

  useEffect(() => {
    if (lines.length === 0) {
      setPriced(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setPriced(null);
    setLoading(true);
    setError(null);

    fetch('/api/cart/price', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: cartItemInputs(lines) }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          ok: boolean;
          data?: PricedCart;
          error?: { message?: string };
        };
        if (!response.ok || !payload.ok || !payload.data) {
          throw new Error(payload.error?.message ?? 'price_failed');
        }
        setPriced(payload.data);
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name === 'AbortError') return;
        setError(t(locale, 'cart.priceError'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  if (!ready) {
    return <p class="text-muted text-sm">{t(locale, 'common.loading')}</p>;
  }

  if (lines.length === 0) {
    return (
      <div class="card px-6 py-12 text-center">
        <h1 class="text-xl font-semibold">{t(locale, 'cart.empty')}</h1>
        <p class="text-muted mt-2 text-sm">{t(locale, 'cart.emptyText')}</p>
        <a href="/shop" class="btn-primary mt-5 inline-block px-5 py-2 text-sm">
          {t(locale, 'cart.continueShopping')}
        </a>
      </div>
    );
  }

  const pricedByKey = new Map<string, PricedLine>();
  if (priced) {
    priced.lines.forEach((line, index) => {
      const stored = lines[index];
      if (stored) pricedByKey.set(stored.key, line);
    });
  }

  const hasUnavailable = Boolean(priced && !priced.all_available);
  const subtotal = priced ? priced.subtotal : cartSubtotal(lines);

  return (
    <div>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold">{t(locale, 'cart.title')}</h1>
          <p class="text-muted mt-1 text-sm">
            {t(locale, 'cart.items', { count: number(cartCount(lines)) })}
          </p>
        </div>
        <button
          type="button"
          class="text-muted text-sm underline"
          onClick={() => {
            clearCart();
            setPriced(null);
          }}
        >
          {t(locale, 'cart.clear')}
        </button>
      </div>

      {loading && <p class="text-muted mb-3 text-sm">{t(locale, 'cart.updating')}</p>}
      {error && (
        <p class="mb-3 text-sm" role="alert" style="color:#be123c">
          {error}
        </p>
      )}

      <ul class="card divide-y divide-[var(--color-border)]">
        {lines.map((stored) => {
          const serverLine = pricedByKey.get(stored.key);
          const title = serverLine?.title
            ? pickLocalized(serverLine.title, serverLine.title_bn, locale)
            : stored.title;
          const available = serverLine ? serverLine.available : true;
          const variantTitle = serverLine?.variant_title ?? stored.variant_title;
          const unitPrice = serverLine?.unit_price ?? stored.unit_price;
          const lineTotal = serverLine?.line_total ?? stored.unit_price * stored.qty;

          return (
            <li key={stored.key} class="flex flex-wrap items-center gap-4 p-4">
              {stored.image && (
                <img
                  src={stored.image}
                  alt=""
                  width="80"
                  height="80"
                  loading="lazy"
                  class="h-20 w-20 rounded-[var(--radius)] object-cover"
                />
              )}

              <div class="min-w-0 flex-1">
                <a href={`/p/${stored.slug}`} class="font-medium hover:underline">
                  {title}
                </a>
                {variantTitle && <p class="text-muted text-sm">{variantTitle}</p>}
                {!available && (
                  <p class="text-sm" style="color:#be123c" role="status">
                    {serverLine ? reasonLabel(serverLine, locale) : t(locale, 'cart.unavailable')}
                  </p>
                )}
                <p class="text-muted mt-1 text-sm">
                  {money(unitPrice)} × {stored.qty}
                </p>
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="h-8 w-8 rounded-full border border-[var(--color-border)]"
                  aria-label={t(locale, 'cart.decrease')}
                  onClick={() => setCartQty(stored.key, stored.qty - 1)}
                  disabled={stored.qty <= 1}
                >
                  −
                </button>
                <span class="w-8 text-center tabular-nums">{number(stored.qty)}</span>
                <button
                  type="button"
                  class="h-8 w-8 rounded-full border border-[var(--color-border)]"
                  aria-label={t(locale, 'cart.increase')}
                  onClick={() => setCartQty(stored.key, Math.min(stored.qty + 1, MAX_LINE_QTY))}
                  disabled={stored.qty >= MAX_LINE_QTY}
                >
                  +
                </button>
              </div>

              <p class="w-24 text-right font-semibold">{money(lineTotal)}</p>

              <button
                type="button"
                class="text-muted text-sm underline"
                onClick={() => deleteCartLine(stored.key)}
              >
                {t(locale, 'cart.remove')}
              </button>
            </li>
          );
        })}
      </ul>

      <div class="card mt-4 p-4">
        <p class="flex items-center justify-between">
          <span class="text-muted">{t(locale, 'cart.subtotal')}</span>
          <span class="text-lg font-semibold">{money(subtotal)}</span>
        </p>
        <p class="text-muted mt-1 text-sm">{t(locale, 'cart.shippingAtCheckout')}</p>

        {hasUnavailable && (
          <p class="mt-2 text-sm" role="alert" style="color:#be123c">
            {t(locale, 'cart.unavailable')}
          </p>
        )}

        <div class="mt-4 flex flex-wrap gap-2">
          <a href="/shop" class="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm">
            {t(locale, 'cart.continueShopping')}
          </a>
          {hasUnavailable ? (
            <span class="cursor-not-allowed rounded-[var(--radius)] bg-[var(--color-muted)] px-5 py-2 text-sm text-white opacity-60">
              {t(locale, 'cart.checkout')}
            </span>
          ) : (
            <a href="/checkout" class="btn-primary px-5 py-2 text-sm">
              {t(locale, 'cart.checkout')}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
