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

  const editForm = document.getElementById('coupon-edit-form') as HTMLFormElement | null;
  const editStatus = document.getElementById('coupon-edit-status');
  const editCancel = document.getElementById('coupon-edit-cancel') as HTMLButtonElement | null;

  function editField(name: string): HTMLInputElement | HTMLSelectElement | null {
    return editForm?.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
  }

  function showEditStatus(message: string, error = false): void {
    if (!editStatus) return;
    editStatus.textContent = message;
    editStatus.className = error ? 'mt-2 text-sm text-rose-700' : 'mt-2 text-sm text-emerald-700';
    editStatus.classList.remove('hidden');
  }

  document.querySelectorAll<HTMLButtonElement>('.js-coupon-edit').forEach((button) => {
    button.addEventListener('click', () => {
      if (!editForm) return;
      let coupon: {
        code: string;
        type: string;
        value: number;
        min_subtotal: number;
        max_uses: number | null;
        used: number;
        starts_at: string;
        ends_at: string;
        active: boolean;
      };
      try {
        coupon = JSON.parse(button.dataset.coupon ?? '') as typeof coupon;
      } catch {
        return;
      }

      editField('code')!.value = coupon.code;
      editField('type')!.value = coupon.type;
      editField('value')!.value = String(coupon.value);
      editField('min_subtotal')!.value = String(coupon.min_subtotal);
      editField('max_uses')!.value =
        coupon.max_uses === null ? '' : String(coupon.max_uses);
      editField('starts_at')!.value = coupon.starts_at;
      editField('ends_at')!.value = coupon.ends_at;
      (editField('active') as HTMLInputElement).checked = coupon.active;
      if (editStatus) editStatus.classList.add('hidden');
      editForm.classList.remove('hidden');
      editForm.dataset.used = String(coupon.used);
      editForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  editCancel?.addEventListener('click', () => {
    editForm?.classList.add('hidden');
  });

  editForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(editForm);
    const code = String(data.get('code') ?? '');
    const maxUses = String(data.get('max_uses') ?? '').trim();
    const number = (name: string) => Number(data.get(name) ?? 0);
    const used = Number(editForm.dataset.used ?? 0);

    if (maxUses && number('max_uses') < used) {
      showEditStatus(editForm.dataset.usedHint ?? '', true);
      return;
    }

    try {
      const response = await fetch(`/api/admin/coupons/${encodeURIComponent(code)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
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
        error?: { code?: string; message?: string };
      } | null;

      if (!response.ok || !payload?.ok) {
        showEditStatus(
          adminErrorMessage(payload?.error?.code, editForm.dataset.failed ?? ''),
          true,
        );
        return;
      }
      window.location.reload();
    } catch {
      showEditStatus(editForm.dataset.failed ?? '', true);
    }
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
