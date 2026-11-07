import type { PAYMENT_METHODS } from "@bdc/shared";
import { createBkashPayment, type BkashCredentials, type TokenCache } from "./bkash";
export * from "./bkash";

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface PaymentInitInput {
  orderId: string; orderNumber: number; invoiceNumber: string;
  amount: number; // poisha
  customerPhone: string;
  callbackUrl: string;
  credentials?: BkashCredentials; tokenCache?: TokenCache;
}
export interface PaymentInitResult { status: "unpaid" | "paid"; redirectUrl?: string; providerRef?: string }

/** Every payment gateway implements this. Add a file per provider and register it below. */
export interface PaymentProvider {
  id: PaymentMethod;
  enabled: boolean;      // implemented in code; a store must also have credentials to offer online methods
  online: boolean;       // needs gateway credentials + redirect
  init(input: PaymentInitInput): Promise<PaymentInitResult>;
}

const cod: PaymentProvider = {
  id: "cod", enabled: true, online: false,
  async init() { return { status: "unpaid" }; }, // cash is collected on delivery
};

// Customer pays to the store's own wallet and submits the TrxID; an admin verifies it in the wallet app.
const manual: PaymentProvider = {
  id: "manual", enabled: true, online: false,
  async init() { return { status: "unpaid" }; },
};

const bkash: PaymentProvider = {
  id: "bkash", enabled: true, online: true,
  async init(i) {
    if (!i.credentials || !i.tokenCache) throw new Error("bKash credentials missing");
    const r = await createBkashPayment(i.credentials, i.tokenCache, {
      amount: i.amount, invoiceNumber: i.invoiceNumber, callbackUrl: i.callbackUrl, payerReference: i.customerPhone,
    });
    return { status: "unpaid", redirectUrl: r.redirectUrl, providerRef: r.paymentId };
  },
};

const notImplemented = (id: PaymentMethod): PaymentProvider => ({
  id, enabled: false, online: true,
  async init() { throw new Error(`${id} payment is not implemented yet`); },
});

const providers: Record<PaymentMethod, PaymentProvider> = {
  cod, manual, bkash, sslcommerz: notImplemented("sslcommerz"),
};

export const getPaymentProvider = (m: PaymentMethod) => providers[m];
