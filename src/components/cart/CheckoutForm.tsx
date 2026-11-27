import { useEffect, useState } from 'preact/hooks';
import {
  cartSignature,
  type CartLineInput,
  type StoredCartLine,
} from '../../lib/cart';
import {
  cartItemInputs,
  clearCart,
  readCart,
  subscribeCart,
} from '../../lib/cart-store';
import {
  checkoutIntentSignature,
  clearCheckoutKey,
  idempotencyKeyForIntent,
} from '../../lib/checkout-key';
import type { GeoDivision } from '../../lib/geo';
import { t, type Locale } from '../../lib/i18n';
import { isValidPhone, normalizePhone } from '../../lib/phone';
import type { PricedCart } from '../../lib/pricing';
import CheckoutFallback, { type FallbackLinks } from './CheckoutFallback';
import CheckoutFields, { type CheckoutFormValues } from './CheckoutFields';
import OrderSummary from './OrderSummary';
import { useTurnstile } from './use-turnstile';

interface Props {
  locale: Locale;
  symbol: string;
  bnDigits: boolean;
  geo: GeoDivision[];
  turnstileSiteKey: string;
  codEnabled: boolean;
}

interface CheckoutSuccess {
  number: string;
  status: string;
  total: number;
  created_at: string;
  existing: boolean;
}

interface ApiError {
  code: string;
  message: string;
  issues?: Array<{ path: string; message: string }>;
  fallback?: FallbackLinks;
}

interface CheckoutResponse {
  ok: boolean;
  data?: CheckoutSuccess | PricedCart;
  error?: ApiError;
}

export default function CheckoutForm({
  locale,
  symbol,
  bnDigits,
  geo,
  turnstileSiteKey,
  codEnabled,
}: Props) {
  const [lines, setLines] = useState<StoredCartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [priced, setPriced] = useState<PricedCart | null>(null);
  const [loading, setLoading] = useState(true);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceTick, setPriceTick] = useState(0);
  const [form, setForm] = useState<CheckoutFormValues>({
    name: '',
    phone: '',
    email: '',
    address: '',
    note: '',
  });
  const [divisionName, setDivisionName] = useState('');
  const [districtName, setDistrictName] = useState('');
  const [upazilaName, setUpazilaName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<FallbackLinks | null>(null);
  const formVisible = ready && codEnabled && lines.length > 0;
  const { token, containerRef, reset: resetTurnstile } = useTurnstile(
    turnstileSiteKey,
    formVisible,
  );

  useEffect(() => {
    setLines(readCart());
    setReady(true);
    const unsubscribe = subscribeCart(setLines);
    return unsubscribe;
  }, []);

  const signature = cartSignature(cartItemInputs(lines));

  useEffect(() => {
    if (!lines.length) {
      setPriced(null);
      setLoading(false);
      setPriceError(null);
      return;
    }

    const controller = new AbortController();
    setPriced(null);
    setLoading(true);
    setPriceError(null);

    fetch('/api/cart/price', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: cartItemInputs(lines),
        ...(districtName ? { district: districtName } : {}),
      }),
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
        setPriceError(t(locale, 'cart.priceError'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, districtName, priceTick]);

  const selectedDivision = geo.find((division) => division.name === divisionName);
  const selectedDistrict = selectedDivision?.districts.find(
    (district) => district.name === districtName,
  );
  const hasUnavailable = Boolean(priced && !priced.all_available);

  const updateField = (key: keyof CheckoutFormValues, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const submit = async (event: Event) => {
    event.preventDefault();
    setError(null);
    setFallback(null);

    if (form.name.trim().length < 2) {
      setError(t(locale, 'checkout.validation'));
      return;
    }
    if (!isValidPhone(form.phone)) {
      setError(t(locale, 'checkout.phoneInvalid'));
      return;
    }
    if (!selectedDivision || !selectedDistrict || !upazilaName) {
      setError(t(locale, 'checkout.geoInvalid'));
      return;
    }
    if (form.address.trim().length < 5) {
      setError(t(locale, 'checkout.validation'));
      return;
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError(t(locale, 'checkout.validation'));
      return;
    }
    if (turnstileSiteKey && !token) {
      setError(t(locale, 'checkout.turnstileFailed'));
      return;
    }
    if (!lines.length) {
      setError(t(locale, 'checkout.cartEmpty'));
      return;
    }

    const items: CartLineInput[] = cartItemInputs(lines);
    const phone = normalizePhone(form.phone) ?? form.phone;
    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      storage = null;
    }
    const intentSignature = checkoutIntentSignature({
      items,
      name: form.name.trim(),
      phone,
      email: form.email.trim(),
      division: selectedDivision.name,
      district: selectedDistrict.name,
      upazila: upazilaName,
      address: form.address.trim(),
      note: form.note.trim(),
    });
    const idempotencyKey = idempotencyKeyForIntent(intentSignature, storage);

    setSubmitting(true);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: idempotencyKey,
          locale,
          customer: {
            name: form.name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            division: selectedDivision.name,
            district: selectedDistrict.name,
            upazila: upazilaName,
            address: form.address.trim(),
            note: form.note.trim() || null,
          },
          items,
          payment_method: 'cod',
          ...(token ? { turnstile_token: token } : {}),
        }),
      });

      const payload = (await response.json()) as CheckoutResponse;
      if (response.ok && payload.ok && payload.data && 'number' in payload.data) {
        clearCart();
        try {
          clearCheckoutKey(window.sessionStorage);
        } catch {
          // Ignore storage failures; the confirmation form is what matters.
        }
        const confirmation = document.createElement('form');
        confirmation.method = 'post';
        confirmation.action = `/order/${encodeURIComponent(payload.data.number)}`;
        const phoneInput = document.createElement('input');
        phoneInput.type = 'hidden';
        phoneInput.name = 'phone';
        phoneInput.value = phone;
        confirmation.appendChild(phoneInput);
        confirmation.style.display = 'none';
        document.body.appendChild(confirmation);
        confirmation.submit();
        return;
      }

      const code = payload.error?.code ?? 'unknown';
      if (code === 'cart_unavailable') {
        if (payload.data && 'lines' in payload.data) setPriced(payload.data);
        setError(
          `${t(locale, 'checkout.outOfStockTitle')} ${t(locale, 'checkout.outOfStockText')}`,
        );
        setPriceTick((value) => value + 1);
      } else if (code === 'out_of_stock') {
        setError(
          `${t(locale, 'checkout.outOfStockTitle')} ${t(locale, 'checkout.outOfStockText')}`,
        );
        setPriceTick((value) => value + 1);
      } else if (code === 'db_unavailable') {
        if (payload.error?.fallback) setFallback(payload.error.fallback);
        setError(t(locale, 'checkout.unavailableText'));
      } else if (code === 'turnstile_failed') {
        setError(t(locale, 'checkout.turnstileFailed'));
      } else if (code === 'invalid_phone') {
        setError(t(locale, 'checkout.phoneInvalid'));
      } else if (code === 'invalid_geo') {
        setError(t(locale, 'checkout.geoInvalid'));
      } else if (code === 'payment_unavailable') {
        setError(t(locale, 'checkout.codUnavailable'));
      } else if (code === 'validation_error' || code === 'invalid_request') {
        setError(t(locale, 'checkout.validation'));
      } else if (code === 'idempotency_conflict') {
        setError(t(locale, 'checkout.validation'));
        try {
          clearCheckoutKey(window.sessionStorage);
        } catch {
          // Storage can be disabled; the retry will use an in-memory key.
        }
        setPriceTick((value) => value + 1);
      } else {
        setError(t(locale, 'errors.generic'));
      }
    } catch {
      setError(t(locale, 'errors.network'));
    } finally {
      setSubmitting(false);
      // Tokens are single-use; any server response means a retry needs a fresh one.
      if (turnstileSiteKey) resetTurnstile();
    }
  };

  if (!ready) {
    return <p class="text-muted text-sm">{t(locale, 'common.loading')}</p>;
  }

  if (!codEnabled) {
    return (
      <div class="card px-6 py-12 text-center">
        <h1 class="text-xl font-semibold">{t(locale, 'checkout.codUnavailable')}</h1>
        <a href="/cart" class="btn-primary mt-5 inline-block px-5 py-2 text-sm">
          {t(locale, 'checkout.backToCart')}
        </a>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div class="card px-6 py-12 text-center">
        <h1 class="text-xl font-semibold">{t(locale, 'checkout.cartEmpty')}</h1>
        <a href="/cart" class="btn-primary mt-5 inline-block px-5 py-2 text-sm">
          {t(locale, 'checkout.backToCart')}
        </a>
      </div>
    );
  }

  return (
    <div>
      <h1 class="mb-4 text-2xl font-semibold">{t(locale, 'checkout.title')}</h1>

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form class="space-y-5" onSubmit={submit} noValidate>
          <CheckoutFields
            locale={locale}
            form={form}
            onField={updateField}
            geo={geo}
            divisionName={divisionName}
            districtName={districtName}
            upazilaName={upazilaName}
            onDivision={(value) => {
              setDivisionName(value);
              setDistrictName('');
              setUpazilaName('');
            }}
            onDistrict={(value) => {
              setDistrictName(value);
              setUpazilaName('');
            }}
            onUpazila={setUpazilaName}
          >
            {turnstileSiteKey && <div ref={containerRef} class="mt-3" />}
          </CheckoutFields>

          {priceError && (
            <p class="text-sm" role="alert" style="color:#be123c">
              {priceError}
            </p>
          )}
          {error && (
            <p class="text-sm" role="alert" style="color:#be123c">
              {error}
            </p>
          )}

          <button
            type="submit"
            class="btn-primary w-full px-5 py-3 font-semibold disabled:opacity-60"
            disabled={submitting || loading || hasUnavailable}
            aria-busy={submitting}
          >
            {submitting ? t(locale, 'checkout.placingOrder') : t(locale, 'checkout.placeOrder')}
          </button>
        </form>

        <aside>
          <OrderSummary
            locale={locale}
            symbol={symbol}
            bnDigits={bnDigits}
            priced={priced}
            loading={loading}
          />
        </aside>
      </div>

      {fallback && <CheckoutFallback locale={locale} fallback={fallback} />}
    </div>
  );
}
