import type { PAYMENT_METHODS } from "@bdc/shared";

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface PaymentInitInput { orderId: string; orderNumber: number; amount: number; customerPhone: string }
export interface PaymentInitResult { status: "unpaid" | "paid"; redirectUrl?: string; providerRef?: string }

/** Every payment gateway implements this. Add a file per provider and register it below. */
export interface PaymentProvider {
  id: PaymentMethod;
  enabled: boolean;
  init(input: PaymentInitInput): Promise<PaymentInitResult>;
  // verify(callbackPayload): Promise<{ orderId: string; status: "paid" | "failed" }>;
}

const cod: PaymentProvider = {
  id: "cod", enabled: true,
  async init() { return { status: "unpaid" }; }, // cash is collected on delivery
};

// TODO: implement with the gateways' merchant credentials (sandbox first).
const notImplemented = (id: PaymentMethod): PaymentProvider => ({
  id, enabled: false,
  async init() { throw new Error(`${id} payment is not implemented yet`); },
});

const providers: Record<PaymentMethod, PaymentProvider> = {
  cod,
  bkash: notImplemented("bkash"),
  sslcommerz: notImplemented("sslcommerz"),
};

export const getPaymentProvider = (m: PaymentMethod) => providers[m];
