import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePaymentRequired, parseSettlement, pinMismatch } from "../src/x402.ts";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");

test("reads the Hedera quote from PAYMENT-REQUIRED (x402 v2 'amount')", () => {
  const header = b64({
    x402Version: 2,
    accepts: [
      { scheme: "exact", network: "eip155:84532", amount: "1", asset: "0xabc", payTo: "0xdef" },
      { scheme: "exact", network: "hedera:testnet", amount: "300000", asset: "0.0.429274", payTo: "0.0.5005", extra: { feePayer: "0.0.7162784" } },
    ],
    extensions: { bazaar: { info: { input: { type: "http", method: "POST" } } } },
  });
  const q = parsePaymentRequired(header, "hedera:testnet");
  assert.deepEqual(q && { amount: q.amount, asset: q.asset, payTo: q.payTo, feePayer: q.feePayer }, {
    amount: 300_000n, asset: "0.0.429274", payTo: "0.0.5005", feePayer: "0.0.7162784",
  });
  assert.equal(q?.hasBazaar, true);
});

test("accepts the v1 'maxAmountRequired' field too", () => {
  const q = parsePaymentRequired(b64({ accepts: [{ scheme: "exact", network: "hedera:testnet", maxAmountRequired: "5000000", asset: "0.0.429274", payTo: "0.0.5005" }] }), "hedera:testnet");
  assert.equal(q?.amount, 5_000_000n);
});

test("no Hedera option → null", () => {
  assert.equal(parsePaymentRequired(b64({ accepts: [{ network: "eip155:1", amount: "1" }] }), "hedera:testnet"), null);
});

test("settlement: tx id from 'transaction' or 'transactionId', plus HashScan link", () => {
  const a = parseSettlement(b64({ success: true, transaction: "0.0.7162784@1762400000.000000001", network: "hedera:testnet", payer: "0.0.9001" }));
  assert.equal(a.txId, "0.0.7162784@1762400000.000000001");
  assert.equal(a.hashscan, "https://hashscan.io/testnet/transaction/0.0.7162784@1762400000.000000001");
  const b = parseSettlement(b64({ success: true, transactionId: "0.0.1@2.3" }));
  assert.equal(b.txId, "0.0.1@2.3");
});

test("settlement failure is reported, not hidden", () => {
  const r = parseSettlement(b64({ success: false, errorReason: "insufficient_funds" }));
  assert.equal(r.success, false);
  assert.equal(r.error, "insufficient_funds");
});

test("pinMismatch: only the exact approved payment passes", () => {
  const pin = { network: "hedera:testnet", asset: "0.0.429274", payTo: "0.0.5005", amount: 300000n };
  const req = { network: "hedera:testnet", asset: "0.0.429274", payTo: "0.0.5005", amount: "300000" };
  assert.equal(pinMismatch(req, pin), null);
  assert.match(pinMismatch({ ...req, amount: "900000" }, pin)!, /amount changed/);
  assert.match(pinMismatch({ ...req, payTo: "0.0.1234567" }, pin)!, /payTo changed/);
  assert.match(pinMismatch({ ...req, asset: "0.0.1" }, pin)!, /asset changed/);
  assert.match(pinMismatch({ ...req, network: "hedera:mainnet" }, pin)!, /network changed/);
  assert.match(pinMismatch({ ...req, amount: "0.3" }, pin)!, /unreadable amount/);
});
