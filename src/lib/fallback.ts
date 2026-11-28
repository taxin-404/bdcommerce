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

export function buildManualFallback(input: {
  locale: Locale;
  symbol: string;
  bnDigits: boolean;
  social: SiteConfig['social'];
  contact: SiteConfig['contact'];
  priced: PricedCart | null;
  /** A coupon applied in the checkout UI but not yet included in priced.total. */
  extraDiscount?: number;
  customer: {
    name: string;
    phone: string;
    address: string;
    upazila: string;
    district: string;
    division: string;
  };
}): CheckoutFallback {
  const { locale, symbol, bnDigits, social, contact, priced, customer } = input;
  const extraDiscount = input.extraDiscount ?? 0;
  const money = (amount: number) =>
    formatBdt(amount, {
      locale,
      symbol,
      bnDigits,
    });

  const lines = [
    t(locale, 'checkout.fallbackIntro'),
    ...(priced
      ? priced.lines
          .filter((line) => line.available)
          .map((line) =>
            t(locale, 'checkout.fallbackLine', {
              qty: bnDigits ? toBanglaDigits(line.qty) : line.qty,
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
    if (priced.discount + extraDiscount > 0) {
      lines.push(
        t(locale, 'checkout.fallbackDiscount', {
          amount: money(priced.discount + extraDiscount),
        }),
      );
    }
    if (priced.shipping_fee !== null) {
      lines.push(t(locale, 'checkout.fallbackDelivery', { amount: money(priced.shipping_fee) }));
    }
    lines.push(
      t(locale, 'checkout.fallbackTotal', {
        amount: money(Math.max(0, priced.total - extraDiscount)),
      }),
    );
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
  const messenger = isHttpUrl(social.messenger)
    ? withText(social.messenger, message)
    : null;

  let whatsapp = isHttpUrl(social.whatsapp)
    ? withText(social.whatsapp, message)
    : null;
  if (!whatsapp) {
    const normalized = normalizePhone(contact.phone);
    if (normalized) {
      whatsapp = `https://wa.me/88${normalized}?text=${encodeURIComponent(message)}`;
    }
  }

  const normalizedContact = normalizePhone(contact.phone);
  const phone = normalizedContact
    ? `tel:+88${normalizedContact}`
    : contact.phone
      ? `tel:${contact.phone.replace(/[^\d+]/g, '')}`
      : null;

  return { message, messenger, whatsapp, phone };
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
  return buildManualFallback({
    locale: input.locale,
    symbol: input.config.currency.symbol,
    bnDigits: input.config.currency.bnDigits,
    social: input.config.social,
    contact: input.config.contact,
    priced: input.priced,
    customer: input.customer,
  });
}
