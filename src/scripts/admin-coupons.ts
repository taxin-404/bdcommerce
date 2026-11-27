  import { adminErrorMessage } from './admin-errors';

  const form = document.getElementById('coupon-form') as HTMLFormElement | null;
  const status = document.getElementById('coupon-status');

  function showStatus(message: string, error = false) {
    if (!status) return;
    status.textContent = message;
    status.className = error ? 'mt-2 text-sm text-rose-700' : 'mt-2 text-sm text-emerald-700';
    status.classList.remove('hidden');
  }

  function dhakaIso(value: string, endOfDay: boolean): string | null {
    if (!value) return null;
    const time = endOfDay ? '23:59:59.999' : '00:00:00.000';
    return new Date(`${value}T${time}+06:00`).toISOString();
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const maxUses = String(data.get('max_uses') ?? '').trim();
    const number = (name: string) => Number(data.get(name) ?? 0);

    try {
      const response = await fetch('/api/admin/coupons', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: String(data.get('code') ?? ''),
          type: String(data.get('type') ?? 'percent'),
          value: number('value'),
          min_subtotal: number('min_subtotal'),
          max_uses: maxUses ? number('max_uses') : null,
          starts_at: dhakaIso(String(data.get('starts_at') ?? ''), false),
          ends_at: dhakaIso(String(data.get('ends_at') ?? ''), true),
          active: data.get('active') === 'on',
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: { code?: string };
      } | null;

      if (!response.ok || !payload?.ok) {
        showStatus(adminErrorMessage(payload?.error?.code, form.dataset.failed ?? ''), true);
        return;
      }
      window.location.reload();
    } catch {
      showStatus(form.dataset.failed ?? '', true);
    }
  });

  document.querySelectorAll<HTMLButtonElement>('.js-coupon-toggle').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const response = await fetch(
          `/api/admin/coupons/${encodeURIComponent(button.dataset.code ?? '')}`,
          {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ active: button.dataset.active !== '1' }),
          },
        );
        if (!response.ok) {
          window.alert(button.dataset.failed ?? '');
          button.disabled = false;
          return;
        }
        window.location.reload();
      } catch {
        window.alert(button.dataset.failed ?? '');
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.js-coupon-delete').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm(button.dataset.confirm ?? '')) return;
      button.disabled = true;
      try {
        const response = await fetch(
          `/api/admin/coupons/${encodeURIComponent(button.dataset.code ?? '')}`,
          { method: 'DELETE', credentials: 'same-origin' },
        );
        if (!response.ok) {
          window.alert(button.dataset.failed ?? '');
          button.disabled = false;
          return;
        }
        window.location.reload();
      } catch {
        window.alert(button.dataset.failed ?? '');
        button.disabled = false;
      }
    });
  });
