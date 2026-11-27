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
import type { SiteConfig } from '../../lib/config';
import type { GeoDivision } from '../../lib/geo';
import { t, type Locale } from '../../lib/i18n';
import { formatBdt } from '../../lib/money';
import { isValidPhone, normalizePhone } from '../../lib/phone';
import type { PricedCart } from '../../lib/pricing';
import CheckoutFallback, { type FallbackLinks } from './CheckoutFallback';
import CheckoutFields, { type CheckoutFormValues } from './CheckoutFields';
import OrderSummary from './OrderSummary';
import PaymentMethods, { type PaymentMethod } from './PaymentMethods';
import { useTurnstile } from './use-turnstile';

interface Props {
  locale: Locale;
  symbol: string;
  bnDigits: boolean;
  geo: GeoDivision[];
  turnstileSiteKey: string;
  payments: SiteConfig['payments'];
  couponsEnabled: boolean;
}

interface AppliedCoupon {
  code: string;
  discount: number;
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
  payments,
  couponsEnabled,
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
  const initialPaymentMethod: PaymentMethod = payments.cod.enabled
    ? 'cod'
    : payments.bkash.enabled
      ? 'bkash'
      : payments.nagad.enabled
        ? 'nagad'
        : 'cod';
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initialPaymentMethod);
  const [paymentSender, setPaymentSender] = useState('');
  const [paymentTrxId, setPaymentTrxId] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const anyPaymentEnabled =
    payments.cod.enabled ||
    payments.bkash.enabled ||
    payments.nagad.enabled;
  const formVisible = ready && anyPaymentEnabled && lines.length > 0;
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
    if (payments.cod.enabled) {
      setPaymentMethod('cod');
    } else if (payments.bkash.enabled) {
      setPaymentMethod('bkash');
    } else if (payments.nagad.enabled) {
      setPaymentMethod('nagad');
    }
  }, [payments.cod.enabled, payments.bkash.enabled, payments.nagad.enabled]);

  useEffect(() => {
    setAppliedCoupon(null);
    setCouponError(null);
  }, [signature, districtName]);

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

  const money = (amount: number) => formatBdt(amount, { locale, symbol, bnDigits });

  const updateField = (key: keyof CheckoutFormValues, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const couponMessage = (code: string) => {
    const key = `checkout.couponErrors.${code}`;
    const message = t(locale, key);
    return message === key ? t(locale, 'checkout.couponInvalid') : message;
  };

  const applyCoupon = async () => {
    const code = couponCode.trim();
    if (!code) return;
    setCouponLoading(true);
    setCouponError(null);
    setAppliedCoupon(null);

    try {
      const response = await fetch('/api/coupons/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: cartItemInputs(lines),
          ...(districtName ? { district: districtName } : {}),
          coupon_code: code,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        data?: PricedCart;
        error?: { code?: string; message?: string };
      } | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setCouponError(
          payload?.error?.code
            ? couponMessage(payload.error.code)
            : t(locale, 'checkout.couponInvalid'),
        );
        return;
      }

      if (payload.data.coupon_error) {
        setCouponError(couponMessage(payload.data.coupon_error));
        return;
      }

      if (payload.data.coupon) {
        setAppliedCoupon({
          code: payload.data.coupon.code,
          discount: payload.data.discount,
        });
        setCouponCode(payload.data.coupon.code);
      }
    } catch {
      setCouponError(t(locale, 'errors.network'));
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponError(null);
    setCouponCode('');
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
    if (paymentMethod !== 'cod') {
      if (!isValidPhone(paymentSender)) {
        setError(t(locale, 'checkout.senderPhoneInvalid'));
        return;
      }
      if (!/^[A-Za-z0-9]{6,32}$/.test(paymentTrxId.trim())) {
        setError(t(locale, 'checkout.trxInvalid'));
        return;
      }
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
      paymentMethod,
      paymentSender: paymentMethod === 'cod' ? '' : (normalizePhone(paymentSender) ?? paymentSender),
      paymentTrxId: paymentMethod === 'cod' ? '' : paymentTrxId.trim().toUpperCase(),
      couponCode: appliedCoupon?.code ?? '',
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
          payment_method: paymentMethod,
          ...(paymentMethod === 'cod'
            ? {}
            : {
                payment_sender: normalizePhone(paymentSender) ?? paymentSender,
                payment_trx_id: paymentTrxId.trim().toUpperCase(),
              }),
          ...(appliedCoupon ? { coupon_code: appliedCoupon.code } : {}),
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
        setError(t(locale, 'checkout.paymentUnavailable'));
      } else if (code === 'invalid_payment_sender') {
        setError(t(locale, 'checkout.senderPhoneInvalid'));
      } else if (code.startsWith('coupon_')) {
        setError(couponMessage(code));
        setAppliedCoupon(null);
        setCouponError(couponMessage(code));
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

  if (!anyPaymentEnabled) {
    return (
      <div class="card px-6 py-12 text-center">
        <h1 class="text-xl font-semibold">{t(locale, 'checkout.paymentUnavailable')}</h1>
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
            <PaymentMethods
              locale={locale}
              payments={payments}
              selected={paymentMethod}
              onSelect={setPaymentMethod}
              sender={paymentSender}
              trxId={paymentTrxId}
              onSender={setPaymentSender}
              onTrxId={setPaymentTrxId}
            />
            {turnstileSiteKey && <div ref={containerRef} class="mt-3" />}
          </CheckoutFields>

          {couponsEnabled && (
          <section class="card p-4">
            <h2 class="text-lg font-semibold">{t(locale, 'checkout.coupon')}</h2>
            <p class="text-muted mt-1 text-sm">{t(locale, 'checkout.couponHint')}</p>
            {appliedCoupon ? (
              <div class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm">
                <span class="font-medium">
                  {appliedCoupon.code} · −{money(appliedCoupon.discount)}
                </span>
                <button type="button" class="text-sm underline" onClick={removeCoupon}>
                  {t(locale, 'checkout.removeCoupon')}
                </button>
              </div>
            ) : (
              <div class="mt-3 flex gap-2">
                <input
                  class="min-w-0 flex-1 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm uppercase outline-none focus:border-[var(--color-primary)]"
                  value={couponCode}
                  maxLength={32}
                  autoComplete="off"
                  placeholder={t(locale, 'checkout.couponPlaceholder')}
                  onInput={(event) => setCouponCode((event.target as HTMLInputElement).value)}
                />
                <button
                  type="button"
                  class="rounded-[var(--radius)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
                  disabled={couponLoading}
                  onClick={applyCoupon}
                >
                  {couponLoading ? t(locale, 'common.loading') : t(locale, 'checkout.applyCoupon')}
                </button>
              </div>
            )}
            {couponError && (
              <p class="mt-2 text-sm" role="alert" style="color:#be123c">
                {couponError}
              </p>
            )}
          </section>
          )}

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
            discount={appliedCoupon?.discount ?? 0}
            couponCode={appliedCoupon?.code ?? null}
          />
        </aside>
      </div>

      {fallback && <CheckoutFallback locale={locale} fallback={fallback} />}
    </div>
  );
}
