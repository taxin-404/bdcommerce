import type { ComponentChildren } from 'preact';
import type { GeoDivision } from '../../lib/geo';
import { t, type Locale } from '../../lib/i18n';

export interface CheckoutFormValues {
  name: string;
  phone: string;
  email: string;
  address: string;
  note: string;
}

interface Props {
  locale: Locale;
  form: CheckoutFormValues;
  onField: (key: keyof CheckoutFormValues, value: string) => void;
  geo: GeoDivision[];
  divisionName: string;
  districtName: string;
  upazilaName: string;
  onDivision: (value: string) => void;
  onDistrict: (value: string) => void;
  onUpazila: (value: string) => void;
  children?: ComponentChildren;
}

const inputClass =
  'w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]';

function geoName(entry: { name: string; nameBn: string }, locale: Locale): string {
  return locale === 'bn' && entry.nameBn ? entry.nameBn : entry.name;
}

export default function CheckoutFields({
  locale,
  form,
  onField,
  geo,
  divisionName,
  districtName,
  upazilaName,
  onDivision,
  onDistrict,
  onUpazila,
  children,
}: Props) {
  const selectedDivision = geo.find((division) => division.name === divisionName);
  const selectedDistrict = selectedDivision?.districts.find(
    (district) => district.name === districtName,
  );

  return (
    <>
      <section class="card p-4">
        <h2 class="text-lg font-semibold">{t(locale, 'checkout.contact')}</h2>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="text-sm" for="checkout-name">
            <span class="mb-1 block font-medium">{t(locale, 'checkout.name')}</span>
            <input
              id="checkout-name"
              class={inputClass}
              autoComplete="name"
              required
              value={form.name}
              onInput={(event) => onField('name', (event.target as HTMLInputElement).value)}
            />
          </label>

          <label class="text-sm" for="checkout-phone">
            <span class="mb-1 block font-medium">{t(locale, 'checkout.phone')}</span>
            <input
              id="checkout-phone"
              class={inputClass}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder={t(locale, 'checkout.phoneHint')}
              required
              value={form.phone}
              onInput={(event) => onField('phone', (event.target as HTMLInputElement).value)}
            />
          </label>

          <label class="text-sm sm:col-span-2" for="checkout-email">
            <span class="mb-1 block font-medium">{t(locale, 'checkout.email')}</span>
            <input
              id="checkout-email"
              class={inputClass}
              type="email"
              autoComplete="email"
              value={form.email}
              onInput={(event) => onField('email', (event.target as HTMLInputElement).value)}
            />
          </label>
        </div>
      </section>

      <section class="card p-4">
        <h2 class="text-lg font-semibold">{t(locale, 'checkout.addressTitle')}</h2>
        <div class="mt-3 grid gap-3 sm:grid-cols-3">
          <label class="text-sm" for="checkout-division">
            <span class="mb-1 block font-medium">{t(locale, 'checkout.division')}</span>
            <select
              id="checkout-division"
              class={inputClass}
              required
              value={divisionName}
              onChange={(event) => onDivision((event.target as HTMLSelectElement).value)}
            >
              <option value="">{t(locale, 'checkout.choose')}</option>
              {geo.map((division) => (
                <option key={division.id} value={division.name}>
                  {geoName(division, locale)}
                </option>
              ))}
            </select>
          </label>

          <label class="text-sm" for="checkout-district">
            <span class="mb-1 block font-medium">{t(locale, 'checkout.district')}</span>
            <select
              id="checkout-district"
              class={inputClass}
              required
              disabled={!selectedDivision}
              value={districtName}
              onChange={(event) => onDistrict((event.target as HTMLSelectElement).value)}
            >
              <option value="">{t(locale, 'checkout.choose')}</option>
              {(selectedDivision?.districts ?? []).map((district) => (
                <option key={district.id} value={district.name}>
                  {geoName(district, locale)}
                </option>
              ))}
            </select>
          </label>

          <label class="text-sm" for="checkout-upazila">
            <span class="mb-1 block font-medium">{t(locale, 'checkout.upazila')}</span>
            <select
              id="checkout-upazila"
              class={inputClass}
              required
              disabled={!selectedDistrict}
              value={upazilaName}
              onChange={(event) => onUpazila((event.target as HTMLSelectElement).value)}
            >
              <option value="">{t(locale, 'checkout.choose')}</option>
              {(selectedDistrict?.upazilas ?? []).map((upazila) => (
                <option key={upazila.id} value={upazila.name}>
                  {geoName(upazila, locale)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label class="mt-3 block text-sm" for="checkout-address">
          <span class="mb-1 block font-medium">{t(locale, 'checkout.address')}</span>
          <textarea
            id="checkout-address"
            class={inputClass}
            rows={3}
            autoComplete="street-address"
            placeholder={t(locale, 'checkout.addressHint')}
            required
            value={form.address}
            onInput={(event) => onField('address', (event.target as HTMLTextAreaElement).value)}
          />
        </label>

        <label class="mt-3 block text-sm" for="checkout-note">
          <span class="mb-1 block font-medium">{t(locale, 'checkout.note')}</span>
          <textarea
            id="checkout-note"
            class={inputClass}
            rows={2}
            value={form.note}
            onInput={(event) => onField('note', (event.target as HTMLTextAreaElement).value)}
          />
        </label>
      </section>

      <section class="card p-4">
        <h2 class="text-lg font-semibold">{t(locale, 'checkout.payment')}</h2>
        {children}
      </section>
    </>
  );
}
