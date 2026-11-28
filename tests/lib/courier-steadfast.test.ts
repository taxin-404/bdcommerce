import { describe, expect, it, vi } from 'vitest';
import { createSteadfastCourier } from '../../src/lib/courier/steadfast';
import { CourierError } from '../../src/lib/courier/types';

type EnvKeys = Pick<Env, 'STEADFAST_API_KEY' | 'STEADFAST_SECRET_KEY'>;

function env(apiKey = 'api-key', secretKey = 'secret-key'): EnvKeys {
  return { STEADFAST_API_KEY: apiKey, STEADFAST_SECRET_KEY: secretKey };
}

function jsonFetcher(
  body: unknown,
  status = 200,
): { fetcher: typeof fetch; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetcher, calls };
}

const parcelInput = {
  invoice: 'BDTEST1',
  recipientName: 'Test Customer',
  recipientPhone: '01712345678',
  recipientAddress: 'House 1, Savar, Dhaka',
  codAmount: 1060,
  note: null,
  itemDescription: '2x Panjabi',
  totalLot: 2,
};

describe('Steadfast courier adapter', () => {
  it('returns null when either secret is missing', () => {
    expect(createSteadfastCourier({} as EnvKeys)).toBeNull();
    expect(
      createSteadfastCourier({ STEADFAST_API_KEY: 'only-api' } as EnvKeys),
    ).toBeNull();
    expect(
      createSteadfastCourier({ STEADFAST_SECRET_KEY: 'only-secret' } as EnvKeys),
    ).toBeNull();
  });

  it('creates a parcel with the documented headers and body', async () => {
    const { fetcher, calls } = jsonFetcher({
      status: 200,
      consignment: { consignment_id: 'CID123', tracking_code: 'TRK123', status: 'in_review' },
    });
    const courier = createSteadfastCourier(env(), { fetcher });
    expect(courier).not.toBeNull();

    const parcel = await courier?.createParcel(parcelInput);
    expect(parcel).toEqual({
      consignmentId: 'CID123',
      trackingCode: 'TRK123',
      status: 'in_review',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://portal.packzy.com/api/v1/create_order');
    expect(calls[0]?.init?.method).toBe('POST');
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers['Api-Key']).toBe('api-key');
    expect(headers['Secret-Key']).toBe('secret-key');
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(body.invoice).toBe('BDTEST1');
    expect(body.cod_amount).toBe(1060);
    expect(body.total_lot).toBe(2);
    expect(body).not.toHaveProperty('delivery_type');
  });

  it('reads the delivery status by consignment id', async () => {
    const { fetcher, calls } = jsonFetcher({ status: 200, delivery_status: 'delivered' });
    const courier = createSteadfastCourier(env(), { fetcher });

    const status = await courier?.getStatus('CID 1/2');
    expect(status).toEqual({ status: 'delivered' });
    expect(calls[0]?.url).toBe('https://portal.packzy.com/api/v1/status_by_cid/CID%201%2F2');
    expect(calls[0]?.init?.method).toBe('GET');
  });

  it('maps HTTP failures to courier error codes', async () => {
    const cases: Array<[number, string]> = [
      [401, 'auth'],
      [422, 'rejected'],
      [429, 'rate_limited'],
      [500, 'unavailable'],
    ];

    for (const [status, code] of cases) {
      const { fetcher } = jsonFetcher({ message: 'nope' }, status);
      const courier = createSteadfastCourier(env(), { fetcher });
      await expect(courier?.createParcel(parcelInput)).rejects.toMatchObject({ code });
    }
  });

  it('rejects a non-200 embedded status and malformed bodies', async () => {
    const failed = jsonFetcher({ status: 422, message: 'invalid recipient phone' });
    const failedCourier = createSteadfastCourier(env(), { fetcher: failed.fetcher });
    await expect(failedCourier?.createParcel(parcelInput)).rejects.toMatchObject({
      code: 'rejected',
    });

    const malformed = jsonFetcher({ status: 200, consignment: { consignment_id: 'CID' } });
    const malformedCourier = createSteadfastCourier(env(), { fetcher: malformed.fetcher });
    await expect(malformedCourier?.createParcel(parcelInput)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('treats a duplicate-invoice 422 as a distinct, non-retryable error', async () => {
    const http = jsonFetcher({ message: 'Invoice already exists' }, 422);
    const httpCourier = createSteadfastCourier(env(), { fetcher: http.fetcher });
    await expect(httpCourier?.createParcel(parcelInput)).rejects.toMatchObject({
      code: 'duplicate_invoice',
    });

    const embedded = jsonFetcher({ status: 422, message: 'duplicate invoice' });
    const embeddedCourier = createSteadfastCourier(env(), { fetcher: embedded.fetcher });
    await expect(embeddedCourier?.createParcel(parcelInput)).rejects.toMatchObject({
      code: 'duplicate_invoice',
    });
  });

  it('aborts a slow courier call with a timeout error', async () => {
    const fetcher = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      })) as typeof fetch;

    const courier = createSteadfastCourier(env(), { fetcher, timeoutMs: 5 });
    await expect(courier?.createParcel(parcelInput)).rejects.toBeInstanceOf(CourierError);
    await expect(courier?.createParcel(parcelInput)).rejects.toMatchObject({ code: 'timeout' });
  });

  it('reports a network failure as unavailable', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const courier = createSteadfastCourier(env(), { fetcher });
    await expect(courier?.createParcel(parcelInput)).rejects.toMatchObject({
      code: 'unavailable',
    });
  });
});
