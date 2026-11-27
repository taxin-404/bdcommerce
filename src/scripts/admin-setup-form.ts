  import { uploadBrandLogo } from './brand-logo';

  const form = document.getElementById('setup-form') as HTMLFormElement | null;
  const status = document.getElementById('setup-status');
  const logoInput = document.getElementById('logo-value') as HTMLInputElement | null;
  const logoFile = document.getElementById('logo-file') as HTMLInputElement | null;
  const logoButton = document.getElementById('logo-upload') as HTMLButtonElement | null;
  const logoStatus = document.getElementById('logo-status');

  function showStatus(message: string, error = false) {
    if (!status) return;
    status.textContent = message;
    status.className = error ? 'text-sm text-rose-700' : 'text-sm text-emerald-700';
    status.classList.remove('hidden');
  }

  logoButton?.addEventListener('click', async () => {
    const file = logoFile?.files?.[0];
    if (!file) return;
    logoButton.disabled = true;
    if (logoStatus) {
      logoStatus.textContent = logoButton.dataset.uploading ?? '';
      logoStatus.className = 'text-sm text-slate-600';
      logoStatus.classList.remove('hidden');
    }
    try {
      const url = await uploadBrandLogo(file);
      if (logoInput) logoInput.value = url;
      const preview = document.getElementById('logo-preview') as HTMLImageElement | null;
      if (preview) preview.src = url;
      if (logoStatus) {
        logoStatus.textContent = url;
        logoStatus.className = 'text-sm text-emerald-700';
      }
    } catch {
      if (logoStatus) {
        logoStatus.textContent = logoButton.dataset.failed ?? '';
        logoStatus.className = 'text-sm text-rose-700';
      }
    } finally {
      logoButton.disabled = false;
    }
  });

  function value(name: string): string {
    return (form?.elements.namedItem(name) as HTMLInputElement | null)?.value.trim() ?? '';
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form) return;

    const zones = Array.from(form.querySelectorAll<HTMLElement>('[data-zone-id]')).map((zone) => ({
      id: zone.dataset.zoneId ?? '',
      label: {
        en: zone.querySelector<HTMLInputElement>('.js-zone-label-en')?.value.trim() ?? '',
        bn: zone.querySelector<HTMLInputElement>('.js-zone-label-bn')?.value.trim() ?? '',
      },
      fee: Number(zone.querySelector<HTMLInputElement>('.js-zone-fee')?.value ?? 0),
    }));

    const freeShipping = value('free_shipping_over');
    const wallet = (name: 'bkash' | 'nagad') => {
      const container = form.querySelector<HTMLElement>(`[data-wallet="${name}"]`);
      return {
        enabled: container?.querySelector<HTMLInputElement>('.js-wallet-enabled')?.checked ?? false,
        number: container?.querySelector<HTMLInputElement>('.js-wallet-number')?.value.trim() ?? '',
        type: (container?.querySelector('.js-wallet-type') as HTMLSelectElement | null)?.value ?? 'personal',
      };
    };

    const payload = {
      name: { en: value('name_en'), bn: value('name_bn') },
      tagline: { en: value('tagline_en'), bn: value('tagline_bn') },
      logo: logoInput?.value ?? '',
      theme_preset:
        (document.getElementById('theme-preset') as HTMLSelectElement | null)?.value ?? 'clean',
      contact: {
        phone: value('contact_phone'),
        email: value('contact_email'),
        address: { en: value('address_en'), bn: value('address_bn') },
      },
      shipping: {
        zones,
        freeShippingOver: freeShipping ? Number(freeShipping) : null,
      },
      payments: {
        cod: {
          enabled:
            (document.getElementById('cod-enabled') as HTMLInputElement | null)?.checked ?? true,
        },
        bkash: wallet('bkash'),
        nagad: wallet('nagad'),
      },
      first_category: {
        name: value('category_en'),
        name_bn: value('category_bn') || null,
      },
    };

    try {
      const response = await fetch('/api/admin/setup', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: { code?: string };
      } | null;

      if (!response.ok || !result?.ok) {
        showStatus(form.dataset.failed ?? '', true);
        return;
      }
      window.location.assign('/admin');
    } catch {
      showStatus(form.dataset.failed ?? '', true);
    }
  });
