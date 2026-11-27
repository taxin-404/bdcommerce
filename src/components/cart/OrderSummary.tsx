import { t, type Locale } from '../../lib/i18n';
import { pickLocalized } from '../../lib/locale';
import { formatBdt, toBanglaDigits } from '../../lib/money';
import type { PricedCart } from '../../lib/pricing';

interface Props {
  locale: Locale;
  symbol: string;
  bnDigits: boolean;
  priced: PricedCart | null;
  loading: boolean;
}

export default function OrderSummary({ locale, symbol, bnDigits, priced, loading }: Props) {
  const money = (amount: number) => formatBdt(amount, { locale, symbol, bnDigits });
  const number = (value: number) =>
    locale === 'bn' && bnDigits ? toBanglaDigits(value) : String(value);

  return (
    <div class="card p-4">
      <h2 class="text-lg font-semibold">{t(locale, 'checkout.summary')}</h2>

      {loading && <p class="text-muted mt-2 text-sm">{t(locale, 'cart.updating')}</p>}

      {priced && (
        <>
          <ul class="mt-3 space-y-3">
            {priced.lines.map((line) => (
              <li key={`${line.product_id}:${line.variant_id ?? 0}`} class="flex gap-3">
                <span class="text-muted shrink-0 text-sm">{number(line.qty)}×</span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-medium">
                    {pickLocalized(line.title, line.title_bn, locale) || '—'}
                  </span>
                  {line.variant_title && (
                    <span class="text-muted block text-xs">{line.variant_title}</span>
                  )}
                  {!line.available && (
                    <span class="block text-xs" style="color:#be123c">
                      {t(locale, 'cart.unavailable')}
                    </span>
                  )}
                </span>
                <span class="shrink-0 text-sm font-medium">{money(line.line_total)}</span>
              </li>
            ))}
          </ul>

          <dl class="mt-4 space-y-1 border-t border-[var(--color-border)] pt-3 text-sm">
            <div class="flex justify-between">
              <dt class="text-muted">{t(locale, 'cart.subtotal')}</dt>
              <dd>{money(priced.subtotal)}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">{t(locale, 'checkout.delivery')}</dt>
              <dd>
                {priced.shipping_fee === null
                  ? '—'
                  : priced.free_shipping
                    ? t(locale, 'checkout.free')
                    : money(priced.shipping_fee)}
              </dd>
            </div>
            <div class="flex justify-between border-t border-[var(--color-border)] pt-2 text-base font-semibold">
              <dt>{t(locale, 'order.total')}</dt>
              <dd>{money(priced.total)}</dd>
            </div>
          </dl>
        </>
      )}
    </div>
  );
}
