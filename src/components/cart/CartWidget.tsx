import { useEffect, useRef, useState } from 'preact/hooks';
import { cartCount, cartSubtotal } from '../../lib/cart';
import { readCart, subscribeCart } from '../../lib/cart-store';
import { t, type Locale } from '../../lib/i18n';
import { formatBdt, toBanglaDigits } from '../../lib/money';
import type { StoredCartLine } from '../../lib/cart';

interface Props {
  locale: Locale;
  symbol: string;
  bnDigits: boolean;
}

export default function CartWidget({ locale, symbol, bnDigits }: Props) {
  const [lines, setLines] = useState<StoredCartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLines(readCart());
    setReady(true);
    const unsubscribe = subscribeCart(setLines);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const count = cartCount(lines);
  const money = (amount: number) =>
    formatBdt(amount, { locale, symbol, bnDigits });
  const countLabel =
    locale === 'bn' && bnDigits ? toBanglaDigits(count) : String(count);

  return (
    <div ref={container} class="relative">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-sm"
        aria-expanded={open}
        aria-controls="mini-cart"
        onClick={() => setOpen((value) => !value)}
      >
        <span>{t(locale, 'cart.title')}</span>
        {ready && (
          <span
            class="badge-accent inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold"
            aria-live="polite"
          >
            {countLabel}
          </span>
        )}
      </button>

      {open && (
        <div
          id="mini-cart"
          class="card absolute right-0 z-30 mt-2 w-80 p-3 text-sm shadow-lg"
        >
          {lines.length === 0 ? (
            <p class="text-muted py-2">{t(locale, 'cart.emptyText')}</p>
          ) : (
            <>
              <ul class="max-h-64 space-y-2 overflow-auto">
                {lines.slice(0, 5).map((line) => (
                  <li key={line.key} class="flex justify-between gap-3">
                    <span class="min-w-0">
                      <span class="block truncate font-medium">{line.title}</span>
                      {line.variant_title && (
                        <span class="text-muted block text-xs">{line.variant_title}</span>
                      )}
                      <span class="text-muted text-xs">
                        {line.qty} × {money(line.unit_price)}
                      </span>
                    </span>
                    <span class="shrink-0 font-medium">{money(line.unit_price * line.qty)}</span>
                  </li>
                ))}
              </ul>
              <p class="mt-3 flex items-center justify-between border-t border-[var(--color-border)] pt-2">
                <span class="text-muted">{t(locale, 'cart.subtotal')}</span>
                <span class="font-semibold">{money(cartSubtotal(lines))}</span>
              </p>
              <div class="mt-3 flex gap-2">
                <a
                  href="/cart"
                  class="flex-1 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-center"
                >
                  {t(locale, 'cart.viewCart')}
                </a>
                <a href="/checkout" class="btn-primary flex-1 px-3 py-1.5 text-center">
                  {t(locale, 'cart.checkout')}
                </a>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
