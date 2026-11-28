import { createSteadfastCourier } from './steadfast';
import type { Courier } from './types';

export type { Courier, CourierErrorCode, CourierParcel, CourierStatus } from './types';
export { CourierError } from './types';

/** Returns null when the optional courier secrets are absent. */
export function getCourier(env: Env): Courier | null {
  return createSteadfastCourier(env);
}

export function isCourierConfigured(env: Env): boolean {
  return Boolean(env.STEADFAST_API_KEY?.trim() && env.STEADFAST_SECRET_KEY?.trim());
}
