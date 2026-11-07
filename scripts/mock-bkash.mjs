// LOCAL TEST DOUBLE for bKash tokenized checkout (v1.2.0-beta shape). NOT the real bKash.
// Usage: node scripts/mock-bkash.mjs   (port 9999)
// Test controls:  POST /test/approve/:paymentID        customer "pays"
//                 POST /test/approve-flaky/:paymentID  customer pays but the execute call 500s (timeout simulation)
import http from "node:http";
const pays = new Map(); let n = 0;
const send = (res, code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d ? JSON.parse(d) : {})); });
const P = "/v1.2.0-beta/tokenized";

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"); const body = await readBody(req);
  const authed = req.headers.authorization === "mock-id-token" && req.headers["x-app-key"] === "app-key-1";
  console.log(req.method, url.pathname);
  if (url.pathname === `${P}/checkout/token/grant`) {
    if (req.headers.username !== "u1" || req.headers.password !== "p1" || body.app_key !== "app-key-1" || body.app_secret !== "app-secret-1")
      return send(res, 200, { statusCode: "2079", statusMessage: "Invalid App Key or Secret" });
    return send(res, 200, { statusCode: "0000", statusMessage: "Successful", id_token: "mock-id-token", refresh_token: "r", expires_in: 3600 });
  }
  if (url.pathname === `${P}/checkout/create`) {
    if (!authed) return send(res, 401, { message: "Unauthorized" });
    const id = `TR${String(++n).padStart(6, "0")}`;
    pays.set(id, { amount: body.amount, invoice: body.merchantInvoiceNumber, status: "Initiated", flaky: false, cb: body.callbackURL });
    return send(res, 200, { statusCode: "0000", statusMessage: "Successful", paymentID: id, bkashURL: `http://localhost:9999/pay/${id}`, amount: body.amount, merchantInvoiceNumber: body.merchantInvoiceNumber });
  }
  if (url.pathname === `${P}/checkout/execute`) {
    if (!authed) return send(res, 401, { message: "Unauthorized" });
    const p = pays.get(body.paymentID);
    if (!p) return send(res, 200, { statusCode: "2062", statusMessage: "Invalid payment ID" });
    if (p.flaky && p.status === "Paid-Pending") { p.status = "Completed"; p.trx = `TRX${n}${Date.now() % 1000}`; return send(res, 500, { message: "gateway timeout" }); }
    if (p.status === "Completed") return send(res, 200, { statusCode: "2062", statusMessage: "The payment has already been completed" });
    if (p.status !== "Paid-Pending") return send(res, 200, { statusCode: "2056", statusMessage: "Payment not authorized by customer" });
    p.status = "Completed"; p.trx = `TRX${n}${Date.now() % 1000}`;
    return send(res, 200, { statusCode: "0000", statusMessage: "Successful", paymentID: body.paymentID, trxID: p.trx, transactionStatus: "Completed", amount: p.amount, currency: "BDT", merchantInvoiceNumber: p.invoice });
  }
  if (url.pathname === `${P}/checkout/payment/status`) {
    if (!authed) return send(res, 401, { message: "Unauthorized" });
    const p = pays.get(body.paymentID);
    if (!p) return send(res, 200, { statusCode: "2062", statusMessage: "Invalid payment ID" });
    const done = p.status === "Completed";
    return send(res, 200, { statusCode: "0000", statusMessage: "Successful", paymentID: body.paymentID, trxID: p.trx, transactionStatus: done ? "Completed" : "Initiated", amount: p.amount, merchantInvoiceNumber: p.invoice });
  }
  const m = url.pathname.match(/^\/test\/(approve|approve-flaky)\/(.+)$/);
  if (m && pays.has(m[2])) { const p = pays.get(m[2]); p.status = "Paid-Pending"; p.flaky = m[1] === "approve-flaky"; return send(res, 200, { ok: true, callback: p.cb }); }
  send(res, 404, { error: "not found" });
}).listen(9999, () => console.log("mock bKash on :9999"));
