import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../../src/api/app';
import { ADMIN_COOKIE_NAME, createSessionCookie } from '../../src/lib/auth';
import { createTestDb, type TestEnvironment } from '../helpers/d1-sqlite';

const PASSPHRASE = 'a-strong-test-passphrase-123';
let environment: TestEnvironment | null = null;
let putKey: string | null = null;
let putType: string | undefined;

afterEach(() => {
  environment?.close();
  environment = null;
  putKey = null;
  putType = undefined;
});

function env(): Env {
  if (!environment) throw new Error('test database is not ready');
  return {
    DB: environment.adapter,
    ADMIN_PASSPHRASE: PASSPHRASE,
    IMAGES: {
      put: async (key: string, _bytes: Uint8Array, options?: R2PutOptions) => {
        putKey = key;
        putType = (options?.httpMetadata as R2HTTPMetadata | undefined)?.contentType;
      },
    },
  } as unknown as Env;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!environment) throw new Error('test database is not ready');
  const cookie = await createSessionCookie(environment.db, PASSPHRASE, Date.now());
  return { cookie: `${ADMIN_COOKIE_NAME}=${cookie}` };
}

function pngBytes(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
}

async function upload(wallet: string, bytes: Uint8Array, name = 'qr.png'): Promise<Response> {
  const form = new FormData();
  form.set('wallet', wallet);
  form.set('qr', new File([bytes as unknown as BlobPart], name, { type: 'image/png' }));
  return app.request(
    '/api/admin/settings/qr',
    { method: 'POST', headers: await authHeaders(), body: form },
    env(),
  );
}

describe('Phase 8A payment QR upload', () => {
  it('stores a PNG under payment-qr and returns the Worker image URL', async () => {
    environment = createTestDb();
    const response = await upload('bkash', pngBytes());

    expect(response.status).toBe(201);
    const payload = (await response.json()) as { data: { url: string } };
    expect(payload.data.url).toMatch(/^\/img\/payment-qr\/bkash-[A-Za-z0-9_-]+\.png$/);
    expect(putKey).toMatch(/^payment-qr\/bkash-[A-Za-z0-9_-]+\.png$/);
    expect(putType).toBe('image/png');
  });

  it('rejects unsupported image types, oversized files, and invalid wallets', async () => {
    environment = createTestDb();

    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect((await upload('bkash', gif, 'qr.gif')).status).toBe(400);

    const huge = new Uint8Array(1024 * 1024 + 1);
    huge.set(pngBytes());
    expect((await upload('bkash', huge)).status).toBe(413);

    expect((await upload('wrong', pngBytes())).status).toBe(400);
  });
});