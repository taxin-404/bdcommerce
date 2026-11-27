import { describe, expect, it, vi } from 'vitest';
import { readTurnstileConfig, verifyTurnstile } from '../../src/lib/turnstile';

describe('Turnstile configuration', () => {
  it('is enabled only when both keys are configured', () => {
    expect(
      readTurnstileConfig({
        TURNSTILE_SITE_KEY: 'site',
        TURNSTILE_SECRET_KEY: 'secret',
      }).enabled,
    ).toBe(true);

    expect(readTurnstileConfig({ TURNSTILE_SITE_KEY: 'site' }).enabled).toBe(false);
    expect(readTurnstileConfig({ TURNSTILE_SECRET_KEY: 'secret' }).enabled).toBe(false);
    expect(readTurnstileConfig({}).enabled).toBe(false);
    expect(
      readTurnstileConfig({ TURNSTILE_SITE_KEY: '  ', TURNSTILE_SECRET_KEY: 'secret' }).enabled,
    ).toBe(false);
  });
});

describe('Turnstile siteverify', () => {
  it('fails closed when the widget token is missing', async () => {
    const fetcher = vi.fn();
    const result = await verifyTurnstile({ secretKey: 'secret', token: '', fetcher });
    expect(result).toEqual({ ok: false, codes: ['missing-input-response'] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('passes a valid token', async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, 'error-codes': [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await verifyTurnstile({ secretKey: 'secret', token: 'token', fetcher });
    expect(result).toEqual({ ok: true, degraded: false });
  });

  it('rejects an explicitly invalid token', async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await verifyTurnstile({ secretKey: 'secret', token: 'bad', fetcher });
    expect(result).toEqual({ ok: false, codes: ['invalid-input-response'] });
  });

  it('fails open for Siteverify 5xx/429 and internal-error responses', async () => {
    const serverError = vi.fn(async () => new Response('down', { status: 503 }));
    expect(await verifyTurnstile({ secretKey: 'secret', token: 't', fetcher: serverError })).toEqual(
      { ok: true, degraded: true },
    );

    const rateLimited = vi.fn(async () => new Response('slow down', { status: 429 }));
    expect(await verifyTurnstile({ secretKey: 'secret', token: 't', fetcher: rateLimited })).toEqual(
      { ok: true, degraded: true },
    );

    const internalError = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, 'error-codes': ['internal-error'] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(
      await verifyTurnstile({ secretKey: 'secret', token: 't', fetcher: internalError }),
    ).toEqual({ ok: true, degraded: true });
  });

  it('fails closed on 4xx configuration errors and bad-request', async () => {
    const fetcher = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    expect(await verifyTurnstile({ secretKey: 'wrong', token: 't', fetcher })).toEqual({
      ok: false,
      codes: ['http-401'],
    });

    const badRequest = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, 'error-codes': ['bad-request'] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(await verifyTurnstile({ secretKey: 'secret', token: 't', fetcher: badRequest })).toEqual({
      ok: false,
      codes: ['bad-request'],
    });
  });

  it('fails open on a network error', async () => {
    const networkError = vi.fn(async () => {
      throw new Error('network');
    });
    expect(
      await verifyTurnstile({ secretKey: 'secret', token: 't', fetcher: networkError }),
    ).toEqual({ ok: true, degraded: true });
  });
});
