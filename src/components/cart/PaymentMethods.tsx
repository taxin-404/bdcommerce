import { useState } from 'preact/hooks';
import { t, type Locale } from '../../lib/i18n';
import type { SiteConfig } from '../../lib/config';
import { formatBdt } from '../../lib/money';

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
  amount: number;
  currencySymbol: string;
  bnDigits: boolean;
}

const inputClass =
  'w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]';

const USSD_LINKS: Partial<Record<PaymentMethod, string>> = {
  // Official source: https://www.bkash.com/en/products-services/payment (*247#)
  bkash: 'tel:*247%23',
};

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Older browsers and non-secure contexts have no Clipboard API.
    try {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      return copied;
    } catch {
      return false;
    }
  }
}

export default function PaymentMethods({
  locale,
  payments,
  selected,
  onSelect,
  sender,
  trxId,
  onSender,
  onTrxId,
  amount,
  currencySymbol,
  bnDigits,
}: Props) {
  const [copied, setCopied] = useState<'number' | 'amount' | null>(null);

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
  const methodLabel =
    selected === 'cod'
      ? t(locale, 'checkout.cod')
      : t(locale, selected === 'bkash' ? 'checkout.bkash' : 'checkout.nagad');
  const amountLabel = formatBdt(amount, {
    locale,
    symbol: currencySymbol,
    bnDigits,
  });
  const dialLink = selected === 'cod' ? undefined : USSD_LINKS[selected];

  const copy = async (kind: 'number' | 'amount', value: string) => {
    const ok = await copyText(value);
    setCopied(ok ? kind : null);
  };

  const steps =
    wallet?.type === 'merchant'
      ? [
          t(locale, 'checkout.walletSteps.merchant1', { method: methodLabel }),
          t(locale, 'checkout.walletSteps.merchant2'),
          t(locale, 'checkout.walletSteps.merchant3', {
            number: wallet.number || '—',
            amount: amountLabel,
          }),
          t(locale, 'checkout.walletSteps.merchant4'),
        ]
      : [
          t(locale, 'checkout.walletSteps.personal1', { method: methodLabel }),
          t(locale, 'checkout.walletSteps.personal2'),
          t(locale, 'checkout.walletSteps.personal3', {
            number: wallet?.number || '—',
            amount: amountLabel,
          }),
          t(locale, 'checkout.walletSteps.personal4'),
        ];

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
          <div class="flex flex-wrap items-start gap-4">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">
                {t(locale, 'checkout.walletInstruction', {
                  method: methodLabel,
                  number: wallet.number || '—',
                })}
              </p>
              <p class="text-muted mt-1 text-xs">
                {wallet.type === 'merchant'
                  ? t(locale, 'checkout.walletMerchant')
                  : t(locale, 'checkout.walletPersonal')}
              </p>

              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="rounded-[var(--radius)] border border-[var(--color-border)] px-3 py-2 text-xs font-medium"
                  onClick={() => copy('number', wallet.number)}
                >
                  {copied === 'number'
                    ? t(locale, 'checkout.copied')
                    : t(locale, 'checkout.copyNumber')}
                </button>
                <button
                  type="button"
                  class="rounded-[var(--radius)] border border-[var(--color-border)] px-3 py-2 text-xs font-medium"
                  onClick={() => copy('amount', String(amount))}
                >
                  {copied === 'amount'
                    ? t(locale, 'checkout.copied')
                    : t(locale, 'checkout.copyAmount')}
                </button>
                {dialLink && (
                  <a
                    href={dialLink}
                    class="rounded-[var(--radius)] bg-[var(--color-primary)] px-3 py-2 text-xs font-medium text-white sm:hidden"
                  >
                    {t(locale, 'checkout.openWallet', { method: methodLabel })}
                  </a>
                )}
              </div>
              <p class="sr-only" aria-live="polite">
                {copied ? t(locale, 'checkout.copied') : ''}
              </p>
            </div>

            {wallet.qr && (
              <figure class="shrink-0 text-center">
                <img
                  src={wallet.qr}
                  alt={t(locale, 'checkout.walletQrAlt', { method: methodLabel })}
                  class="h-28 w-28 rounded border border-[var(--color-border)] bg-white object-contain p-1"
                />
                <figcaption class="text-muted mt-1 text-xs">
                  {t(locale, 'checkout.walletQrCaption')}
                </figcaption>
              </figure>
            )}
          </div>

          <ol class="mt-3 list-decimal space-y-1 pl-5 text-xs">
            {steps.map((step) => (
              <li>{step}</li>
            ))}
          </ol>

          <p
            class="mt-3 rounded-[var(--radius)] border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
            role="note"
          >
            {t(locale, 'checkout.walletNotConfirmed')}
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