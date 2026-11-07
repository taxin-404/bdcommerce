export interface ParcelInput {
  orderNumber: number; recipientName: string; recipientPhone: string;
  address: string; district: string; codAmount: number; // poisha, 0 if prepaid
  note?: string;
}
export interface ParcelResult { trackingCode: string }

/** Implement one per courier (Pathao, Steadfast, RedX, Paperfly...). */
export interface CourierProvider {
  id: string;
  createParcel(input: ParcelInput, credentials: Record<string, string>): Promise<ParcelResult>;
  track?(trackingCode: string, credentials: Record<string, string>): Promise<{ status: string }>;
}

const stub = (id: string): CourierProvider => ({
  id,
  async createParcel() { throw new Error(`${id} integration not implemented yet`); },
});

export const couriers: Record<string, CourierProvider> = {
  steadfast: stub("steadfast"),
  pathao: stub("pathao"),
};
