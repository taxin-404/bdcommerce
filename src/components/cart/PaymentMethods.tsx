import { t, type Locale } from '../../lib/i18n';
import type { SiteConfig } from '../../lib/config';

export type PaymentMethod = 'cod' | 'bkash' | 'nagad';

interface Props {
  locale: Locale;
  payments: SiteConfig['payments'];
  selected: PaymentMethod;
  onSelect: (method: PaymentMethod) => void;
  sender: string;
  trxId: string;
  onSender: (value: string) => void;
  onTrxId: (value: string) => void;
}

const inputClass =
  'w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]';

export default function PaymentMethods({
  locale,
  payments,
  selected,
  onSelect,
  sender,
  trxId,
  onSender,
  onTrxId,
}: Props) {
  const options: Array<{ id: PaymentMethod; label: string; hint: string }> = [];
  if (payments.cod.enabled) {
    options.push({
      id: 'cod',
      label: t(locale, 'checkout.cod'),
      hint: t(locale, 'checkout.codHint'),
    });
  }
  if (payments.bkash.enabled) {
    options.push({
      id: 'bkash',
      label: t(locale, 'checkout.bkash'),
      hint: t(locale, 'checkout.walletHint'),
    });
  }
  if (payments.nagad.enabled) {
    options.push({
      id: 'nagad',
      label: t(locale, 'checkout.nagad'),
      hint: t(locale, 'checkout.walletHint'),
    });
  }

  const wallet = selected === 'cod' ? null : payments[selected];

  return (
    <>
      <div class="mt-3 space-y-2">
        {options.map((option) => (
          <label class="flex items-start gap-2 text-sm" key={option.id}>
            <input
              type="radio"
              name="payment_method"
              class="mt-1"
              checked={selected === option.id}
              onChange={() => onSelect(option.id)}
            />
            <span>
              <span class="block font-medium">{option.label}</span>
              <span class="text-muted block">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {wallet && (
        <div class="mt-4 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
          <p class="text-sm font-medium">
            {t(locale, 'checkout.walletInstruction', {
              method: t(locale, selected === 'bkash' ? 'checkout.bkash' : 'checkout.nagad'),
              number: wallet.number || '—',
            })}
          </p>
          <p class="text-muted mt-1 text-xs">
            {wallet.type === 'merchant'
              ? t(locale, 'checkout.walletMerchant')
              : t(locale, 'checkout.walletPersonal')}
          </p>

          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <label class="text-sm">
              <span class="mb-1 block font-medium">{t(locale, 'checkout.senderPhone')}</span>
              <input
                class={inputClass}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder={t(locale, 'checkout.phoneHint')}
                value={sender}
                onInput={(event) => onSender((event.target as HTMLInputElement).value)}
              />
            </label>
            <label class="text-sm">
              <span class="mb-1 block font-medium">{t(locale, 'checkout.trxId')}</span>
              <input
                class={inputClass}
                autoComplete="off"
                maxLength={32}
                placeholder={t(locale, 'checkout.trxHint')}
                value={trxId}
                onInput={(event) => onTrxId((event.target as HTMLInputElement).value)}
              />
            </label>
          </div>
        </div>
      )}

      {options.length === 0 && (
        <p class="mt-3 text-sm" role="alert" style="color:#be123c">
          {t(locale, 'checkout.paymentUnavailable')}
        </p>
      )}
    </>
  );
}
