import { formatOrderAddress } from './address';
import type { SiteConfig } from './config';
import { t, type Locale } from './i18n';
import { formatBdt, toBanglaDigits } from './money';
import { normalizePhone } from './phone';
import type { PricedCart } from './pricing';

export interface CheckoutFallback {
  message: string;
  messenger: string | null;
  whatsapp: string | null;
  phone: string | null;
}

function withText(url: string, text: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    parsed.searchParams.set('text', text);
    return parsed.href;
  } catch {
    return null;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function buildCheckoutFallback(input: {
  config: SiteConfig;
  locale: Locale;
  priced: PricedCart | null;
  customer: {
    name: string;
    phone: string;
    address: string;
    upazila: string;
    district: string;
    division: string;
  };
}): CheckoutFallback {
  const { config, locale, priced, customer } = input;
  const money = (amount: number) =>
    formatBdt(amount, {
      locale,
      symbol: config.currency.symbol,
      bnDigits: config.currency.bnDigits,
    });

  const lines = [
    t(locale, 'checkout.fallbackIntro'),
    ...(priced
      ? priced.lines
          .filter((line) => line.available)
          .map((line) =>
            t(locale, 'checkout.fallbackLine', {
              qty: config.currency.bnDigits ? toBanglaDigits(line.qty) : line.qty,
              title: (() => {
                const productTitle = locale === 'bn' && line.title_bn ? line.title_bn : line.title;
                return line.variant_title
                  ? `${productTitle} (${line.variant_title})`
                  : productTitle;
              })(),
              price: money(line.line_total),
            }),
          )
      : [t(locale, 'checkout.fallbackNoPrices')]),
  ];

  if (priced) {
    lines.push(
      '',
      t(locale, 'checkout.fallbackSubtotal', { amount: money(priced.subtotal) }),
    );
    if (priced.shipping_fee !== null) {
      lines.push(t(locale, 'checkout.fallbackDelivery', { amount: money(priced.shipping_fee) }));
    }
    lines.push(t(locale, 'checkout.fallbackTotal', { amount: money(priced.total) }));
  }

  const address = formatOrderAddress(customer);
  lines.push(
    '',
    t(locale, 'checkout.fallbackCustomer', {
      name: customer.name,
      phone: customer.phone,
      address,
    }),
  );

  const message = lines.join('\n');
  const messenger = isHttpUrl(config.social.messenger)
    ? withText(config.social.messenger, message)
    : null;

  let whatsapp = isHttpUrl(config.social.whatsapp)
    ? withText(config.social.whatsapp, message)
    : null;
  if (!whatsapp) {
    const normalized = normalizePhone(config.contact.phone);
    if (normalized) {
      whatsapp = `https://wa.me/88${normalized}?text=${encodeURIComponent(message)}`;
    }
  }

  const normalizedContact = normalizePhone(config.contact.phone);
  const phone = normalizedContact
    ? `tel:+88${normalizedContact}`
    : config.contact.phone
      ? `tel:${config.contact.phone.replace(/[^\d+]/g, '')}`
      : null;

  return { message, messenger, whatsapp, phone };
}
