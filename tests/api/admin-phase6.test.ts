import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../../src/api/app';
import { ADMIN_COOKIE_NAME, createSessionCookie } from '../../src/lib/auth';
import { defaultConfig } from '../../src/lib/config';
import { createTestDb, countRows, type TestEnvironment } from '../helpers/d1-sqlite';

const PASSPHRASE = 'a-strong-test-passphrase-123';
let environment: TestEnvironment | null = null;

afterEach(() => {
  environment?.close();
  environment = null;
});

function env(): Env {
  if (!environment) throw new Error('test database is not ready');
  return { DB: environment.adapter, ADMIN_PASSPHRASE: PASSPHRASE } as unknown as Env;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!environment) throw new Error('test database is not ready');
  const cookie = await createSessionCookie(environment.db, PASSPHRASE, Date.now());
  return {
    'content-type': 'application/json',
    cookie: `${ADMIN_COOKIE_NAME}=${cookie}`,
  };
}

function setupBody() {
  return {
    name: { en: 'Wizard Shop', bn: 'উইজার্ড দোকান' },
    tagline: { en: 'Fresh start', bn: 'নতুন শুরু' },
    theme_preset: 'soft',
    contact: { phone: '01712345678', email: '', address: { en: 'Dhaka', bn: 'ঢাকা' } },
    shipping: defaultConfig.shipping,
    payments: defaultConfig.payments,
    first_category: { name: 'Panjabi', name_bn: 'পাঞ্জাবি' },
  };
}

describe('Phase 6 admin APIs', () => {
  it('completes setup and creates the first category', async () => {
    environment = createTestDb();
    const response = await app.request(
      '/api/admin/setup',
      {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(setupBody()),
      },
      env(),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { ok: boolean; data: { category_slug: string } };
    expect(payload.ok).toBe(true);
    expect(payload.data.category_slug).toBe('panjabi');
    expect(countRows(environment.sqlite, 'categories')).toBe(1);

    const setup = environment.sqlite
      .prepare("SELECT value FROM settings WHERE key = 'setup_completed'")
      .get() as unknown as { value: string };
    expect(JSON.parse(setup.value)).toBe(true);
  });

  it('saves settings overrides and returns the merged config', async () => {
    environment = createTestDb();
    const response = await app.request(
      '/api/admin/settings',
      {
        method: 'PUT',
        headers: await authHeaders(),
        body: JSON.stringify({
          name: { en: 'Edited Shop', bn: 'সম্পাদিত দোকান' },
          theme: { ...defaultConfig.theme, preset: 'dark' },
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      ok: boolean;
      data: { config: { name: { en: string }; theme: { preset: string; primary: string } } };
    };
    expect(payload.data.config.name.en).toBe('Edited Shop');
    expect(payload.data.config.theme.preset).toBe('dark');
    expect(payload.data.config.theme.primary).toBe(defaultConfig.theme.primary);
  });

  it('applies a preset through the admin action', async () => {
    environment = createTestDb();
    const response = await app.request(
      '/api/admin/presets/apply',
      {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ preset: 'clothing' }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      ok: boolean;
      data: { categories: number; products: number; variants: number };
    };
    expect(payload.data).toEqual({ preset: 'clothing', categories: 3, products: 2, variants: 5 });
  });

  it('creates, toggles and deletes a coupon', async () => {
    environment = createTestDb();
    const headers = await authHeaders();

    const created = await app.request(
      '/api/admin/coupons',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          code: 'save10',
          type: 'percent',
          value: 10,
          min_subtotal: 0,
          max_uses: 5,
          active: true,
        }),
      },
      env(),
    );
    expect(created.status).toBe(201);

    const list = await app.request('/api/admin/coupons', { headers }, env());
    const listPayload = (await list.json()) as {
      data: Array<{ code: string; active: boolean; used: number }>;
    };
    expect(listPayload.data[0]).toMatchObject({ code: 'SAVE10', active: true, used: 0 });

    const toggled = await app.request(
      '/api/admin/coupons/SAVE10',
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ active: false }),
      },
      env(),
    );
    expect(toggled.status).toBe(200);

    const removed = await app.request(
      '/api/admin/coupons/SAVE10',
      { method: 'DELETE', headers },
      env(),
    );
    expect(removed.status).toBe(200);
    expect(countRows(environment.sqlite, 'coupons')).toBe(0);
  });
});
