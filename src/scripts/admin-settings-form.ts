  import { adminErrorMessage } from './admin-errors';
  import { uploadBrandLogo } from './brand-logo';

  const form = document.getElementById('settings-form') as HTMLFormElement | null;
  const status = document.getElementById('settings-status');
  const logoInput = document.getElementById('logo-value') as HTMLInputElement | null;
  const logoFile = document.getElementById('logo-file') as HTMLInputElement | null;
  const logoButton = document.getElementById('logo-upload') as HTMLButtonElement | null;
  const logoStatus = document.getElementById('logo-status');
  const themeJson = document.getElementById('theme-json')?.textContent ?? '{}';

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
