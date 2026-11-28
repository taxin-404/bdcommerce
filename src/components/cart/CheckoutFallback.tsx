import { useState } from 'preact/hooks';
import { t, type Locale } from '../../lib/i18n';

export interface FallbackLinks {
  message: string;
  messenger: string | null;
  whatsapp: string | null;
  phone: string | null;
}

interface Props {
  locale: Locale;
  fallback: FallbackLinks;
  heading?: string;
  text?: string;
}

export default function CheckoutFallback({ locale, fallback, heading, text }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fallback.message);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      class="card mt-5 border-2 p-4"
      style="border-color:var(--color-accent)"
      aria-live="polite"
    >
      <h2 class="text-lg font-semibold">
        {heading ?? t(locale, 'checkout.fallbackHeading')}
      </h2>
      <p class="text-muted mt-1 text-sm">
        {text ?? t(locale, 'checkout.unavailableText')}
      </p>

      <label class="sr-only" for="checkout-fallback-message">
        {heading ?? t(locale, 'checkout.fallbackHeading')}
      </label>
      <textarea
        id="checkout-fallback-message"
        readonly
        class="mt-3 h-40 w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2 font-mono text-xs"
        value={fallback.message}
        onFocus={(event) => (event.target as HTMLTextAreaElement).select()}
      />

      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" class="btn-primary px-4 py-2 text-sm" onClick={copy}>
          {copied ? t(locale, 'checkout.fallbackCopied') : t(locale, 'checkout.fallbackCopy')}
        </button>
        {fallback.messenger && (
          <a
            href={fallback.messenger}
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm"
          >
            {t(locale, 'checkout.fallbackMessenger')}
          </a>
        )}
        {fallback.whatsapp && (
          <a
            href={fallback.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm"
          >
            {t(locale, 'checkout.fallbackWhatsapp')}
          </a>
        )}
        {fallback.phone && (
          <a
            href={fallback.phone}
            class="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm"
          >
            {t(locale, 'checkout.fallbackCall')}
          </a>
        )}
      </div>
    </section>
  );
}
