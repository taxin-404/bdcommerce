import { useState } from 'preact/hooks';
import { MAX_LINE_QTY, MAX_CART_LINES } from '../../lib/cart';
import { addCartLine, readCart } from '../../lib/cart-store';
import { t, type Locale } from '../../lib/i18n';

interface VariantOption {
  id: number;
  title: string;
  price: number;
  stock: number;
  sku: string | null;
}

interface Props {
  locale: Locale;
  product: {
    id: number;
    slug: string;
    title: string;
    price: number;
    image: string | null;
  };
  variants: VariantOption[];
  trackStock: boolean;
}

export default function AddToCart({ locale, product, variants, trackStock }: Props) {
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedVariant = (): VariantOption | null => {
    if (variants.length === 0) return null;
    const input = document.getElementById('selected-variant') as HTMLInputElement | null;
    const id = Number(input?.value ?? 0);
    return variants.find((variant) => variant.id === id) ?? variants[0] ?? null;
  };

  const add = () => {
    setMessage(null);
    setError(null);

    const variant = selectedVariant();
    if (variants.length > 0 && !variant) {
      setError(t(locale, 'cart.variantRequired'));
      return;
    }

    const quantity = Math.min(Math.max(Math.trunc(qty) || 1, 1), MAX_LINE_QTY);
    const cart = readCart();
    const existing = cart.find(
      (line) =>
        line.product_id === product.id && line.variant_id === (variant?.id ?? null),
    );

    if (
      trackStock &&
      variants.length > 0 &&
      variant &&
      variant.stock < (existing?.qty ?? 0) + quantity
    ) {
      setError(t(locale, 'cart.outOfStock'));
      return;
    }

    if (!existing && cart.length >= MAX_CART_LINES) {
      setError(t(locale, 'cart.maxLines', { count: MAX_CART_LINES }));
      return;
    }

    const result = addCartLine({
      productId: product.id,
      variantId: variant?.id ?? null,
      qty: quantity,
      slug: product.slug,
      title: product.title,
      variantTitle: variant?.title ?? null,
      unitPrice: variant?.price ?? product.price,
      image: product.image,
    });

    if (!result.added) {
      setError(t(locale, 'cart.addFailed'));
      return;
    }
    setMessage(t(locale, 'cart.added'));
  };

  return (
    <div class="mt-6">
      <div class="flex flex-wrap items-end gap-3">
        <label class="text-sm">
          <span class="text-muted mb-1 block">{t(locale, 'cart.quantity')}</span>
          <input
            type="number"
            min="1"
            max={MAX_LINE_QTY}
            value={qty}
            onChange={(event) => {
              const next = Number((event.target as HTMLInputElement).value);
              setQty(Number.isFinite(next) ? next : 1);
            }}
            class="w-20 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
          />
        </label>

        <button type="button" class="btn-primary px-5 py-2.5 font-medium" onClick={add}>
          {t(locale, 'cart.addToCart')}
        </button>
      </div>

      {message && (
        <p class="mt-3 text-sm" role="status" style="color:#047857">
          {message}{' '}
          <a href="/cart" class="underline">
            {t(locale, 'cart.viewCart')}
          </a>
        </p>
      )}
      {error && (
        <p class="mt-3 text-sm" role="alert" style="color:#be123c">
          {error}
        </p>
      )}
    </div>
  );
}
