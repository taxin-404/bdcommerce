import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/api/app';
import { ADMIN_COOKIE_NAME, createSessionCookie } from '../../src/lib/auth';
import { createTestDb, type TestEnvironment } from '../helpers/d1-sqlite';
import { insertOrder, insertOrderItem } from '../helpers/order-fixtures';

const PASSPHRASE = 'a-strong-test-passphrase-123';
let environment: TestEnvironment | null = null;

afterEach(() => {
  environment?.close();
  environment = null;
  vi.unstubAllGlobals();
});

function env(extra: Record<string, string> = {}): Env {
  if (!environment) throw new Error('test database is not ready');
  return { DB: environment.adapter, ADMIN_PASSPHRASE: PASSPHRASE, ...extra } as unknown as Env;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!environment) throw new Error('test database is not ready');
  const cookie = await createSessionCookie(environment.db, PASSPHRASE, Date.now());
  return {
    'content-type': 'application/json',
    cookie: `${ADMIN_COOKIE_NAME}=${cookie}`,
  };
}

const courierKeys = {
  STEADFAST_API_KEY: 'api-key',
  STEADFAST_SECRET_KEY: 'secret-key',
};

function courierFetcher(
  handler: (url: string) => unknown,
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const body = handler(String(input));
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

describe('admin courier API', () => {
  it('sends a confirmed order and then refreshes its status', async () => {
    environment = createTestDb();
    const orderId = insertOrder(environment.sqlite, { number: 'BDADMIN1', status: 'confirmed' });
    insertOrderItem(environment.sqlite, orderId, { title: 'Panjabi', qty: 1 });

    vi.stubGlobal(
      'fetch',
      courierFetcher((url) =>
        url.includes('/status_by_cid/')
          ? { status: 200, delivery_status: 'delivered' }
          : {
              status: 200,
              consignment: {
                consignment_id: 'CID9',
                tracking_code: 'TRK9',
                status: 'in_review',
              },
            },
      ),
    );
    const headers = await authHeaders();

    const send = await app.request(
      `/api/admin/orders/${orderId}/courier`,
      { method: 'POST', headers, body: JSON.stringify({ action: 'send' }) },
      env(courierKeys),
    );
    expect(send.status).toBe(200);
    const sent = (await send.json()) as {
      ok: boolean;
      data: { consignment_id: string; tracking_code: string };
    };
    expect(sent.data).toMatchObject({ consignment_id: 'CID9', tracking_code: 'TRK9' });

    const refresh = await app.request(
      `/api/admin/orders/${orderId}/courier`,
      { method: 'POST', headers, body: JSON.stringify({ action: 'refresh' }) },
      env(courierKeys),
    );
    expect(refresh.status).toBe(200);
    const refreshed = (await refresh.json()) as { data: { courier_status: string } };
    expect(refreshed.data.courier_status).toBe('delivered');

    const row = environment.sqlite
      .prepare('SELECT consignment_id, courier_status FROM orders WHERE id = ?')
      .get(orderId) as unknown as { consignment_id: string; courier_status: string };
    expect(row).toEqual({ consignment_id: 'CID9', courier_status: 'delivered' });
  });

  it('hides and refuses courier actions when the secrets are absent', async () => {
    environment = createTestDb();
    const orderId = insertOrder(environment.sqlite, { number: 'BDADMIN2', status: 'confirmed' });

    const response = await app.request(
      `/api/admin/orders/${orderId}/courier`,
      {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ action: 'send' }),
      },
      env(),
    );
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('courier_not_configured');
  });

  it('refuses to send an order that is not confirmed', async () => {
    environment = createTestDb();
    const orderId = insertOrder(environment.sqlite, { number: 'BDADMIN3', status: 'pending' });
    vi.stubGlobal('fetch', courierFetcher(() => ({ status: 200 })));

    const response = await app.request(
      `/api/admin/orders/${orderId}/courier`,
      {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ action: 'send' }),
      },
      env(courierKeys),
    );
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('order_not_confirmed');
  });

  it('maps a courier rejection to a 422', async () => {
    environment = createTestDb();
    const orderId = insertOrder(environment.sqlite, { number: 'BDADMIN4', status: 'confirmed' });
    vi.stubGlobal(
      'fetch',
      (async () =>
        new Response(JSON.stringify({ status: 422 }), {
          status: 422,
          headers: { 'content-type': 'application/json' },
        })) as typeof fetch,
    );

    const response = await app.request(
      `/api/admin/orders/${orderId}/courier`,
      {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ action: 'send' }),
      },
      env(courierKeys),
    );
    expect(response.status).toBe(422);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('courier_rejected');
  });
});

describe('admin phone flag and blocklist APIs', () => {
  it('flags and clears a phone, and lists it', async () => {
    environment = createTestDb();
    const orderId = insertOrder(environment.sqlite, { number: 'BDFLAG1' });
    const headers = await authHeaders();

    const flag = await app.request(
      `/api/admin/orders/${orderId}/phone-flag`,
      { method: 'POST', headers, body: JSON.stringify({ flagged: true, reason: 'watch' }) },
      env(),
    );
    expect(flag.status).toBe(200);

    const list = await app.request('/api/admin/blocklist', { headers }, env());
    const listPayload = (await list.json()) as {
      data: { flagged: Array<{ phone: string; reason: string }> };
    };
    expect(listPayload.data.flagged).toEqual([
      expect.objectContaining({ phone: '01712345678', reason: 'watch' }),
    ]);

    const clear = await app.request(
      '/api/admin/blocklist/flags/01712345678',
      { method: 'DELETE', headers },
      env(),
    );
    expect(clear.status).toBe(200);

    const missing = await app.request(
      '/api/admin/blocklist/flags/01712345678',
      { method: 'DELETE', headers },
      env(),
    );
    expect(missing.status).toBe(404);
  });

  it('blocks and unblocks a phone through the API', async () => {
    environment = createTestDb();
    const headers = await authHeaders();

    const blocked = await app.request(
      '/api/admin/blocklist',
      { method: 'POST', headers, body: JSON.stringify({ phone: '01712345678' }) },
      env(),
    );
    expect(blocked.status).toBe(201);

    const removed = await app.request(
      '/api/admin/blocklist/01712345678',
      { method: 'DELETE', headers },
      env(),
    );
    expect(removed.status).toBe(200);

    const again = await app.request(
      '/api/admin/blocklist/01712345678',
      { method: 'DELETE', headers },
      env(),
    );
    expect(again.status).toBe(404);
  });
});
