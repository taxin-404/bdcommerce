import {
  CourierError,
  type Courier,
  type CourierParcel,
  type CourierParcelInput,
  type CourierStatus,
} from './types';

const BASE_URL = 'https://portal.packzy.com/api/v1';
const DEFAULT_TIMEOUT_MS = 8_000;

interface SteadfastOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function statusError(status: number): CourierError {
  if (status === 401) return new CourierError('auth');
  if (status === 422) return new CourierError('rejected');
  if (status === 429) return new CourierError('rate_limited');
  if (status >= 500) return new CourierError('unavailable');
  return new CourierError('rejected');
}

/**
 * Steadfast keys parcels by the unique `invoice`. A 422 that names the invoice
 * as duplicate/already existing means a parcel already exists for this order,
 * so a retry must never POST again.
 */
function duplicateInvoiceError(status: number, body: JsonObject | null): CourierError | null {
  if (status !== 422 || !body) return null;
  // Scope the match to the message/errors fields so an unrelated 422 that
  // happens to echo the invoice field is not misread as a duplicate.
  const message = typeof body.message === 'string' ? body.message : '';
  const errors =
    typeof body.errors === 'string' ? body.errors : body.errors ? JSON.stringify(body.errors) : '';
  const text = `${message} ${errors}`.toLowerCase();
  if (text.includes('invoice') && /duplicate|already|exist/.test(text)) {
    return new CourierError('duplicate_invoice');
  }
  return null;
}

async function readJson(response: Response): Promise<JsonObject | null> {
  try {
    return asObject(await response.json());
  } catch {
    return null;
  }
}

export function createSteadfastCourier(
  env: Pick<Env, 'STEADFAST_API_KEY' | 'STEADFAST_SECRET_KEY'>,
  options: SteadfastOptions = {},
): Courier | null {
  const apiKey = env.STEADFAST_API_KEY?.trim() ?? '';
  const secretKey = env.STEADFAST_SECRET_KEY?.trim() ?? '';
  if (!apiKey || !secretKey) return null;

  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request(
    path: string,
    init: RequestInit,
    detect?: (status: number, body: JsonObject | null) => CourierError | null,
  ): Promise<JsonObject> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetcher(`${BASE_URL}${path}`, {
        ...init,
        headers: {
          'Api-Key': apiKey,
          'Secret-Key': secretKey,
          'Content-Type': 'application/json',
          ...init.headers,
        },
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) throw new CourierError('timeout');
      throw new CourierError('unavailable');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const object = await readJson(response);
      throw detect?.(response.status, object) ?? statusError(response.status);
    }

    const object = await readJson(response);
    if (!object) throw new CourierError('invalid_response');

    const status = typeof object.status === 'number' ? object.status : null;
    if (status !== null && status !== 200) throw detect?.(status, object) ?? statusError(status);

    return object;
  }

  return {
    id: 'steadfast',

    async createParcel(input: CourierParcelInput): Promise<CourierParcel> {
      const body = await request(
        '/create_order',
        {
          method: 'POST',
          body: JSON.stringify({
            invoice: input.invoice,
            recipient_name: input.recipientName,
            recipient_phone: input.recipientPhone,
            recipient_address: input.recipientAddress,
            cod_amount: input.codAmount,
            note: input.note ?? undefined,
            item_description: input.itemDescription,
            total_lot: input.totalLot,
          }),
        },
        duplicateInvoiceError,
      );

      const consignment = asObject(body.consignment);
      const consignmentId = consignment?.consignment_id;
      const trackingCode = consignment?.tracking_code;
      if (typeof consignmentId !== 'string' || !consignmentId) {
        throw new CourierError('invalid_response');
      }
      if (typeof trackingCode !== 'string' || !trackingCode) {
        throw new CourierError('invalid_response');
      }

      return {
        consignmentId,
        trackingCode,
        status: typeof consignment?.status === 'string' ? consignment.status : '',
      };
    },

    async getStatus(consignmentId: string): Promise<CourierStatus> {
      const body = await request(`/status_by_cid/${encodeURIComponent(consignmentId)}`, {
        method: 'GET',
      });
      if (typeof body.delivery_status !== 'string' || !body.delivery_status) {
        throw new CourierError('invalid_response');
      }
      return { status: body.delivery_status };
    },
  };
}
