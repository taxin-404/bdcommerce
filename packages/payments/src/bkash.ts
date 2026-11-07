// bKash Tokenized Checkout, one-shot payment flow (grant token -> create -> customer pays -> execute -> query).
//
// !! Written against bKash "v1.2.0-beta" tokenized endpoints (per public integration guides) and tested ONLY
// !! against scripts/mock-bkash.mjs, never against real bKash. Verify against your merchant sandbox and
// !! developer.bka.sh before going live. If bKash moved you to their newer "v2" API, only this file changes.

export interface BkashCredentials {
  appKey: string; appSecret: string; username: string; password: string;
  sandbox: boolean;
  baseUrl?: string; // operator-only override (local mock); never user-supplied
}
export interface TokenCache {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSeconds: number): Promise<void>;
}
export type ConfirmResult =
  | { status: "paid"; transactionId: string; raw: unknown }
  | { status: "failed"; reason: string; raw: unknown }
  | { status: "pending"; reason: string; raw: unknown };

const SANDBOX = "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized";
const LIVE = "https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized";
const base = (c: BkashCredentials) => (c.baseUrl ?? (c.sandbox ? SANDBOX : LIVE)).replace(/\/+$/, "");

export class BkashError extends Error {}

interface BkashResponse {
  statusCode?: string; statusMessage?: string;
  id_token?: string; expires_in?: number;
  paymentID?: string; bkashURL?: string; trxID?: string;
  transactionStatus?: string; amount?: string; merchantInvoiceNumber?: string;
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<BkashResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  const text = await res.text();
  let json: BkashResponse;
  try { json = JSON.parse(text); } catch { throw new BkashError(`bKash returned a non-JSON response (HTTP ${res.status})`); }
  if (!res.ok && !json.statusCode) throw new BkashError(`bKash HTTP ${res.status}`);
  return json;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function getToken(c: BkashCredentials, cache: TokenCache): Promise<string> {
  const key = "bkash:token:" + hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${base(c)}|${c.appKey}|${c.username}`)));
  const cached = await cache.get(key);
  if (cached) return cached;
  const r = await post(`${base(c)}/checkout/token/grant`, { username: c.username, password: c.password },
    { app_key: c.appKey, app_secret: c.appSecret });
  if (r.statusCode !== "0000" || !r.id_token) throw new BkashError(`bKash token grant failed: ${r.statusCode} ${r.statusMessage ?? ""}`);
  await cache.put(key, r.id_token, Math.max(60, (r.expires_in ?? 3600) - 120));
  return r.id_token;
}

const authHeaders = (c: BkashCredentials, token: string) => ({ authorization: token, "x-app-key": c.appKey });
const taka = (poisha: number) => (poisha / 100).toFixed(2); // bKash wants "450.00"
const isCompleted = (r: BkashResponse | null) => !!r && r.statusCode === "0000" && r.transactionStatus === "Completed";
const amountMatches = (reported: string | undefined, poisha: number) =>
  reported !== undefined && Math.round(parseFloat(reported) * 100) === poisha;

export async function createBkashPayment(
  c: BkashCredentials, cache: TokenCache,
  p: { amount: number; invoiceNumber: string; callbackUrl: string; payerReference?: string },
): Promise<{ paymentId: string; redirectUrl: string }> {
  const token = await getToken(c, cache);
  const r = await post(`${base(c)}/checkout/create`, authHeaders(c, token), {
    mode: "0011",
    payerReference: p.payerReference ?? p.invoiceNumber,
    callbackURL: p.callbackUrl,
    amount: taka(p.amount),
    currency: "BDT",
    intent: "sale",
    merchantInvoiceNumber: p.invoiceNumber,
  });
  if (r.statusCode !== "0000" || !r.paymentID || !r.bkashURL)
    throw new BkashError(`bKash create payment failed: ${r.statusCode} ${r.statusMessage ?? ""}`);
  return { paymentId: r.paymentID, redirectUrl: r.bkashURL };
}

/**
 * Called from the callback (and from admin "verify payment"). Executes the payment, and if execute does not
 * report Completed (error, timeout, already executed) asks bKash for the real status. A timed-out execute
 * may still have taken the money, so we never mark failed/paid without checking.
 */
export async function confirmBkashPayment(
  c: BkashCredentials, cache: TokenCache, paymentId: string, expectedPoisha: number,
): Promise<ConfirmResult> {
  let token: string;
  try { token = await getToken(c, cache); }
  catch (e) { return { status: "pending", reason: "token_unavailable", raw: String(e) }; }

  let r: BkashResponse | null = null;
  try { r = await post(`${base(c)}/checkout/execute`, authHeaders(c, token), { paymentID: paymentId }); } catch { r = null; }

  if (!isCompleted(r)) {
    try { r = await post(`${base(c)}/checkout/payment/status`, authHeaders(c, token), { paymentID: paymentId }); }
    catch (e) { return { status: "pending", reason: "status_unavailable", raw: String(e) }; }
  }

  if (isCompleted(r)) {
    if (!amountMatches(r!.amount, expectedPoisha) || !r!.trxID)
      return { status: "pending", reason: "amount_or_trx_mismatch_needs_review", raw: r };
    return { status: "paid", transactionId: r!.trxID, raw: r };
  }
  if (r && ["Failed", "Cancelled", "Expired"].includes(r.transactionStatus ?? ""))
    return { status: "failed", reason: r.transactionStatus!, raw: r };
  return { status: "pending", reason: r?.transactionStatus ?? "unknown", raw: r };
}
