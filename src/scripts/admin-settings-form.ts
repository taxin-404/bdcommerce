  import { adminErrorMessage } from './admin-errors';
  import { uploadBrandLogo } from './brand-logo';

  const form = document.getElementById('settings-form') as HTMLFormElement | null;
  const status = document.getElementById('settings-status');
  const logoInput = document.getElementById('logo-value') as HTMLInputElement | null;
  const logoFile = document.getElementById('logo-file') as HTMLInputElement | null;
  const logoButton = document.getElementById('logo-upload') as HTMLButtonElement | null;
  const logoStatus = document.getElementById('logo-status');
  const themeJson = document.getElementById('theme-json')?.textContent ?? '{}';
  const zoneList = document.getElementById('zone-list');
  const zoneAdd = document.getElementById('zone-add') as HTMLButtonElement | null;
  const fallbackSelect = document.getElementById('fallback-zone') as HTMLSelectElement | null;
  const imageAddressTest = document.getElementById(
    'image-address-test',
  ) as HTMLButtonElement | null;
  const imageAddressStatus = document.getElementById('image-address-status');

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

  function zoneRows(): HTMLElement[] {
    return Array.from(zoneList?.querySelectorAll<HTMLElement>('[data-zone-id]') ?? []);
  }

  function zoneIdOf(row: HTMLElement): string {
    return row.dataset.zoneId ?? '';
  }

  function zoneLabelOf(row: HTMLElement): string {
    const locale = document.documentElement.lang === 'bn' ? 'bn' : 'en';
    return (
      row.querySelector<HTMLInputElement>(`.js-zone-label-${locale}`)?.value.trim() ||
      row.querySelector<HTMLInputElement>('.js-zone-label-en')?.value.trim() ||
      zoneIdOf(row)
    );
  }

  function refreshZoneButtons(): void {
    const rows = zoneRows();
    for (const row of rows) {
      const button = row.querySelector<HTMLButtonElement>('.js-zone-remove');
      if (button) button.disabled = rows.length <= 1;
    }
  }

  function rebuildZoneOptions(): void {
    const rows = zoneRows();
    const ids = rows.map(zoneIdOf);
    const fallback = fallbackSelect?.value;
    const nextFallback = fallback && ids.includes(fallback) ? fallback : ids[0] ?? '';

    if (fallbackSelect) {
      const previous = fallbackSelect.value;
      fallbackSelect.innerHTML = '';
      for (const row of rows) {
        const option = document.createElement('option');
        option.value = zoneIdOf(row);
        option.textContent = zoneLabelOf(row);
        fallbackSelect.appendChild(option);
      }
      fallbackSelect.value = nextFallback;
      if (previous && previous !== nextFallback) {
        for (const select of Array.from(form?.querySelectorAll<HTMLElement>('.js-district-zone') ?? []) as unknown as HTMLSelectElement[]) {
          if (select.value === previous) select.value = nextFallback;
        }
      }
    }

    for (const select of Array.from(form?.querySelectorAll<HTMLElement>('.js-district-zone') ?? []) as unknown as HTMLSelectElement[]) {
      const current = select.value;
      select.innerHTML = '';
      for (const row of rows) {
        const option = document.createElement('option');
        option.value = zoneIdOf(row);
        option.textContent = zoneLabelOf(row);
        select.appendChild(option);
      }
      select.value = ids.includes(current) ? current : nextFallback;
    }
    refreshZoneButtons();
  }

  zoneAdd?.addEventListener('click', () => {
    if (!zoneList) return;
    const used = new Set(zoneRows().map(zoneIdOf));
    let suffix = zoneRows().length + 1;
    let id = `zone-${suffix}`;
    while (used.has(id)) {
      suffix += 1;
      id = `zone-${suffix}`;
    }

    const row = document.createElement('div');
    row.className = 'grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-4';
    row.dataset.zoneId = id;
    row.innerHTML =
      '<label class="text-sm"><span class="mb-1 block font-medium"></span><input class="w-full rounded border border-slate-300 px-3 py-2 text-sm js-zone-label-en" /></label>' +
      '<label class="text-sm"><span class="mb-1 block font-medium"></span><input class="w-full rounded border border-slate-300 px-3 py-2 text-sm js-zone-label-bn" /></label>' +
      '<label class="text-sm"><span class="mb-1 block font-medium"></span><input class="w-full rounded border border-slate-300 px-3 py-2 text-sm js-zone-fee" type="number" min="0" value="0" /></label>' +
      '<div class="flex items-end"><button type="button" class="js-zone-remove rounded border border-rose-300 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"></button></div>';

    const labels = row.querySelectorAll('span');
    if (labels[0]) labels[0].textContent = form?.dataset.zoneLabelEn ?? '';
    if (labels[1]) labels[1].textContent = form?.dataset.zoneLabelBn ?? '';
    if (labels[2]) labels[2].textContent = form?.dataset.zoneFee ?? '';
    const remove = row.querySelector<HTMLButtonElement>('.js-zone-remove');
    if (remove) remove.textContent = form?.dataset.removeZone ?? '';
    zoneList.appendChild(row);
    rebuildZoneOptions();
  });

  zoneList?.addEventListener('input', (event) => {
    const target = event.target as HTMLElement;
    if (
      target.classList.contains('js-zone-label-en') ||
      target.classList.contains('js-zone-label-bn')
    ) {
      rebuildZoneOptions();
    }
  });

  zoneList?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (!target.classList.contains('js-zone-remove')) return;
    if (zoneRows().length <= 1) return;
    target.closest('[data-zone-id]')?.remove();
    rebuildZoneOptions();
  });

  fallbackSelect?.addEventListener('change', () => {
    const next = fallbackSelect.value;
    for (const select of Array.from(form?.querySelectorAll<HTMLElement>('.js-district-zone') ?? []) as unknown as HTMLSelectElement[]) {
      if (!select.value) select.value = next;
    }
  });

  rebuildZoneOptions();

  imageAddressTest?.addEventListener('click', () => {
    if (!imageAddressStatus) return;
    const key = imageAddressTest.dataset.testKey ?? '';
    if (!key) {
      imageAddressStatus.textContent = imageAddressTest.dataset.noImage ?? '';
      imageAddressStatus.className = 'mt-2 text-sm text-amber-700';
      imageAddressStatus.classList.remove('hidden');
      return;
    }
    const address = value('image_address');
    if (!address) {
      imageAddressStatus.textContent = imageAddressTest.dataset.empty ?? '';
      imageAddressStatus.className = 'mt-2 text-sm text-amber-700';
      imageAddressStatus.classList.remove('hidden');
      return;
    }

    imageAddressTest.disabled = true;
    imageAddressStatus.textContent = imageAddressTest.dataset.testing ?? '';
    imageAddressStatus.className = 'mt-2 text-sm text-slate-600';
    imageAddressStatus.classList.remove('hidden');

    const probe = new Image();
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      imageAddressStatus.textContent = ok
        ? (imageAddressTest.dataset.ok ?? '')
        : (imageAddressTest.dataset.failed ?? '');
      imageAddressStatus.className = ok
        ? 'mt-2 text-sm text-emerald-700'
        : 'mt-2 text-sm text-rose-700';
      imageAddressTest.disabled = false;
    };
    // A blocked/hanging host must never leave the button disabled forever.
    const timer = setTimeout(() => finish(false), 8000);
    probe.onload = () => finish(true);
    probe.onerror = () => finish(false);
    probe.src = `${address}/${key}`;
  });

  for (const button of form?.querySelectorAll<HTMLButtonElement>('.js-wallet-qr-upload') ?? []) {
    button.addEventListener('click', async () => {
      const container = button.closest<HTMLElement>('[data-wallet]');
      const wallet = container?.dataset.wallet ?? '';
      const file = container?.querySelector<HTMLInputElement>('.js-wallet-qr-file')?.files?.[0];
      const status = container?.querySelector<HTMLElement>('.js-wallet-qr-status');
      if (!file || !status) return;

      button.disabled = true;
      status.textContent = button.dataset.uploading ?? '';
      status.className = 'js-wallet-qr-status mt-1 text-xs text-slate-600';

      try {
        const data = new FormData();
        data.set('wallet', wallet);
        data.set('qr', file);
        const response = await fetch('/api/admin/settings/qr', {
          method: 'POST',
          credentials: 'same-origin',
          body: data,
        });
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          data?: { url: string };
          error?: { code?: string };
        } | null;
        if (!response.ok || !payload?.ok || !payload.data) {
          throw new Error(payload?.error?.code ?? 'upload_failed');
        }
        const input = container?.querySelector<HTMLInputElement>('.js-wallet-qr-value');
        if (input) input.value = payload.data.url;
        const testKey = payload.data.url.match(
          /payment-qr\/[A-Za-z0-9_-]+\.(?:png|jpg|jpeg|webp)/,
        )?.[0];
        if (testKey && imageAddressTest) {
          imageAddressTest.dataset.testKey = testKey;
          imageAddressTest.disabled = false;
        }
        status.textContent = payload.data.url;
        status.className = 'js-wallet-qr-status mt-1 text-xs text-emerald-700';
      } catch {
        status.textContent = button.dataset.failed ?? '';
        status.className = 'js-wallet-qr-status mt-1 text-xs text-rose-700';
      } finally {
        button.disabled = false;
      }
    });
  }

  const list = document.getElementById('section-list');
  const addSelect = document.getElementById('section-add') as HTMLSelectElement | null;
  const addButton = document.getElementById('section-add-button') as HTMLButtonElement | null;

  function refreshSectionButtons() {
    if (!list) return;
    const items = Array.from(list.querySelectorAll('li'));
    items.forEach((item, index) => {
      const up = item.querySelector<HTMLButtonElement>('.js-section-up');
      const down = item.querySelector<HTMLButtonElement>('.js-section-down');
      if (up) up.disabled = index === 0;
      if (down) down.disabled = index === items.length - 1;
    });
  }

  list?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const item = target.closest('li');
    if (!item) return;
    if (target.classList.contains('js-section-up') && item.previousElementSibling) {
      list.insertBefore(item, item.previousElementSibling);
      refreshSectionButtons();
    }
    if (target.classList.contains('js-section-down') && item.nextElementSibling) {
      list.insertBefore(item.nextElementSibling, item);
      refreshSectionButtons();
    }
    if (target.classList.contains('js-section-remove')) {
      item.remove();
      refreshSectionButtons();
    }
  });

  addButton?.addEventListener('click', () => {
    if (!list || !addSelect || !addSelect.value) return;
    const item = document.createElement('li');
    item.className =
      'flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2';
    item.dataset.section = JSON.stringify({ type: addSelect.value });
    item.innerHTML =
      '<span class="text-sm font-medium"></span><span class="flex gap-1"><button type="button" class="js-section-up rounded border px-2 py-1 text-xs">↑</button><button type="button" class="js-section-down rounded border px-2 py-1 text-xs">↓</button><button type="button" class="js-section-remove rounded border border-rose-300 px-2 py-1 text-xs text-rose-700"></button></span>';
    const label = item.querySelector('span');
    if (label) label.textContent = addSelect.selectedOptions[0]?.textContent ?? addSelect.value;
    const remove = item.querySelector('.js-section-remove');
    if (remove) remove.textContent = form?.dataset.remove ?? '×';
    list.appendChild(item);
    addSelect.value = '';
    refreshSectionButtons();
  });

  function value(name: string): string {
    return (form?.elements.namedItem(name) as HTMLInputElement | null)?.value.trim() ?? '';
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form) return;

    const theme = JSON.parse(themeJson) as Record<string, unknown>;
    const preset = (document.getElementById('theme-preset') as HTMLSelectElement | null)?.value;
    if (preset) theme.preset = preset;

    const zones = zoneRows().map((zone) => ({
      id: zoneIdOf(zone),
      label: {
        en: zone.querySelector<HTMLInputElement>('.js-zone-label-en')?.value.trim() ?? '',
        bn: zone.querySelector<HTMLInputElement>('.js-zone-label-bn')?.value.trim() ?? '',
      },
      fee: Number(zone.querySelector<HTMLInputElement>('.js-zone-fee')?.value ?? 0),
    }));

    const districtZones: Record<string, string> = {};
    for (const select of Array.from(form.querySelectorAll<HTMLElement>('.js-district-zone')) as unknown as HTMLSelectElement[]) {
      const district = select.dataset.district;
      if (district) districtZones[district] = select.value;
    }

    const freeShipping = value('free_shipping_over');
    const wallet = (name: 'bkash' | 'nagad') => {
      const container = form.querySelector<HTMLElement>(`[data-wallet="${name}"]`);
      return {
        enabled: container?.querySelector<HTMLInputElement>('.js-wallet-enabled')?.checked ?? false,
        number: container?.querySelector<HTMLInputElement>('.js-wallet-number')?.value.trim() ?? '',
        type: (container?.querySelector('.js-wallet-type') as HTMLSelectElement | null)?.value ?? 'personal',
        qr: container?.querySelector<HTMLInputElement>('.js-wallet-qr-value')?.value.trim() ?? '',
      };
    };

    const sections = Array.from(list?.querySelectorAll('li') ?? [])
      .map((item) => {
        try {
          return JSON.parse(item.dataset.section ?? '') as unknown;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (!sections.length) {
      showStatus(form.dataset.sectionsRequired ?? '', true);
      return;
    }

    const payload = {
      name: { en: value('name_en'), bn: value('name_bn') },
      tagline: { en: value('tagline_en'), bn: value('tagline_bn') },
      logo: logoInput?.value ?? '',
      theme,
      shipping: {
        zones,
        districtZones,
        fallbackZone: fallbackSelect?.value ?? zones[0]?.id ?? '',
        freeShippingOver: freeShipping ? Number(freeShipping) : null,
      },
      images: { address: value('image_address') },
      inventory: {
        lowStockThreshold: Number(value('low_stock_threshold')) || 5,
      },
      payments: {
        cod: {
          enabled:
            (document.getElementById('cod-enabled') as HTMLInputElement | null)?.checked ?? true,
        },
        bkash: wallet('bkash'),
        nagad: wallet('nagad'),
      },
      fraud: {
        enabled:
          (document.getElementById('fraud-enabled') as HTMLInputElement | null)?.checked ?? true,
        orderLimitPerPhone24h: Number(value('fraud-phone-limit')) || 5,
        orderLimitPerIp24h: Number(value('fraud-ip-limit')) || 50,
        advancePaymentForFlaggedPhones:
          (document.getElementById('fraud-advance') as HTMLInputElement | null)?.checked ?? true,
      },
      contact: {
        phone: value('contact_phone'),
        email: value('contact_email'),
        address: { en: value('address_en'), bn: value('address_bn') },
      },
      social: {
        facebook: value('social_facebook'),
        messenger: value('social_messenger'),
        whatsapp: value('social_whatsapp'),
        instagram: value('social_instagram'),
      },
      home_sections: sections,
    };

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: { code?: string };
      } | null;

      if (!response.ok || !result?.ok) {
        showStatus(adminErrorMessage(result?.error?.code, form.dataset.failed ?? ''), true);
        return;
      }
      showStatus(form.dataset.saved ?? '');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      showStatus(form.dataset.failed ?? '', true);
    }
  });
