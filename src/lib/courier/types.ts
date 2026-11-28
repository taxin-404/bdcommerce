export interface CourierParcelInput {
  invoice: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  codAmount: number;
  note: string | null;
  itemDescription: string;
  totalLot: number;
}

export interface CourierParcel {
  consignmentId: string;
  trackingCode: string;
  status: string;
}

export interface CourierStatus {
  status: string;
}

export interface Courier {
  readonly id: string;
  createParcel(input: CourierParcelInput): Promise<CourierParcel>;
  getStatus(consignmentId: string): Promise<CourierStatus>;
}

export type CourierErrorCode =
  | 'timeout'
  | 'auth'
  | 'rejected'
  | 'rate_limited'
  | 'unavailable'
  | 'invalid_response'
  /** Steadfast already has a parcel for this invoice; never POST it twice. */
  | 'duplicate_invoice';

export class CourierError extends Error {
  constructor(readonly code: CourierErrorCode) {
    super(`Courier request failed: ${code}`);
    this.name = 'CourierError';
  }
}
