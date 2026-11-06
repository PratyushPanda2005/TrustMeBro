import { test } from "node:test";
import assert from "node:assert/strict";
import { buyVerification, type BuyDeps } from "../src/buy.ts";
import { SpendLedger } from "../src/ledger.ts";
import type { Policy } from "../src/policy.ts";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");
const DEAL = "0x" + "aa".repeat(32);
const VERIFIER = "0x" + "99".repeat(20);
const NOW = Date.parse("2026-11-06T10:00:00Z");
const policy: Policy = {
  network: "hedera:testnet", asset: "0.0.429274", allowlist: new Set(["0.0.5005"]),
  maxPerCall: 1_000_000n, maxPerDeal: 1_000_000n, maxPerDay: 10_000_000n, maxChecksPerDeal: 3, maxChecksPerExporterPerDay: 5,
};
const TRADE_DEALS = "0x" + "11".repeat(20);
const CHECK1 = { checkNo: 1, exporter: "0x" + "22".repeat(20) };
// Plan v5 §8: the agent sends only {dealId, shipmentRef}; claims stay on chain.
const request = { dealId: DEAL, shipmentRef: { containerNo: "MSKU1234567", blRef: "BL-DEMO-001" } };
const okBody = {
  verification: { dealId: DEAL, observedKg: 9850, statusCode: 4, docHash: "0x" + "aa".repeat(32), observedAt: "1800000000", nonce: "1", expiry: "9999999999" },
  signature: "0x" + "cd".repeat(65), signer: VERIFIER, chainId: 1874, verifyingContract: TRADE_DEALS,
};

function harness(opts: { price?: string; paidStatus?: number; signer?: string; payThrows?: string; body?: unknown } = {}) {
  const calls = { probe: 0, paid: 0, pinned: [] as any[] };
  const audit: any[] = [];
  const ledger = new SpendLedger();
  const quote = (amount: string) => new Response(null, {
    status: 402,
    headers: { "PAYMENT-REQUIRED": b64({ x402Version: 2, accepts: [{ scheme: "exact", network: "hedera:testnet", amount, asset: "0.0.429274", payTo: "0.0.5005" }], extensions: { bazaar: {} } }) },
  });
  const deps: BuyDeps = {
    url: "http://verifier/verify",
    tradeDeals: TRADE_DEALS,
    policy, ledger, now: () => NOW,
    expectedSigner: VERIFIER,
    fetch: async () => { calls.probe++; return quote(opts.price ?? "300000"); },
    payFetch: async (_url, _init, pinned) => {
      calls.pinned.push(pinned);
      if (opts.payThrows) throw new Error(opts.payThrows);
      calls.paid++;
      const status = opts.paidStatus ?? 200;
      if (status !== 200) return new Response(JSON.stringify({ error: "x" }), { status });
      return new Response(JSON.stringify(opts.body ?? okBody), {
        status: 200,
        headers: { "PAYMENT-RESPONSE": b64({ success: true, transaction: "0.0.7162784@1762400000.000000001", payer: "0.0.9001" }) },
      });
    },
    recoverSigner: async () => opts.signer ?? VERIFIER,
    audit: async (e) => { audit.push(e); },
  };
  return { deps, calls, audit, ledger };
}

test("happy path: probe → gate allows → pay → settled tx recorded and audited", async () => {
  const h = harness();
  const r = await buyVerification(request, CHECK1, h.deps);
  assert.equal(r.status, "verified");
  assert.equal(r.settlement?.txId, "0.0.7162784@1762400000.000000001");
  assert.equal(h.calls.paid, 1);
  assert.equal(h.ledger.alreadyPaid(DEAL, 1), true);
  assert.deepEqual(h.audit.map((e) => e.kind), ["quote", "paid"]);
});

test("overcharging merchant (5.00): never paid, queued for a human, audited", async () => {
  const h = harness({ price: "5000000" });
  const r = await buyVerification(request, CHECK1, h.deps);
  assert.equal(r.status, "pending_human");
  assert.equal(h.calls.paid, 0);
  assert.equal(h.ledger.listApprovals().length, 1);
  assert.deepEqual(h.audit.map((e) => e.kind), ["quote", "pending_human"]);
});

test("second run for the same deal is refused (never pays twice)", async () => {
  const h = harness();
  await buyVerification(request, CHECK1, h.deps);
  const r = await buyVerification(request, CHECK1, h.deps);
  assert.equal(r.status, "refused");
  assert.equal(h.calls.paid, 1);
});

test("verifier outage (503 after paywall) → not charged, not recorded, no verdict", async () => {
  const h = harness({ paidStatus: 503 });
  const r = await buyVerification(request, CHECK1, h.deps);
  assert.equal(r.status, "no_verdict");
  assert.equal(h.ledger.alreadyPaid(DEAL, 1), false);
  assert.equal(h.audit.at(-1).kind, "error");
});

test("response signed by the wrong key is paid for but never relayed", async () => {
  const h = harness({ signer: "0x" + "66".repeat(20) });
  const r = await buyVerification(request, CHECK1, h.deps);
  assert.equal(r.status, "untrusted");
  assert.equal(h.ledger.alreadyPaid(DEAL, 1), true);
  assert.equal(h.audit.at(-1).kind, "error");
});

test("the paid request is pinned to exactly the quote the gate approved", async () => {
  const h = harness();
  await buyVerification(request, CHECK1, h.deps);
  assert.deepEqual(h.calls.pinned, [{ network: "hedera:testnet", asset: "0.0.429274", payTo: "0.0.5005", amount: 300000n }]);
});

test("bait and switch (retry quotes a new price/payTo): client aborts, refused, nothing recorded", async () => {
  const h = harness({ payThrows: "Failed to create payment payload: Payment creation aborted: payTo changed after approval: 0.0.666 ≠ 0.0.5005" });
  const r = await buyVerification(request, CHECK1, h.deps);
  assert.equal(r.status, "refused");
  assert.equal(h.ledger.alreadyPaid(DEAL, 1), false);
  assert.deepEqual(h.audit.map((e) => e.kind), ["quote", "refused"]);
});

test("transport failure on the paid request: no verdict, flagged as settlement unknown", async () => {
  const h = harness({ payThrows: "fetch failed" });
  const r = await buyVerification(request, CHECK1, h.deps);
  assert.equal(r.status, "no_verdict");
  assert.match(h.audit.at(-1).reason, /settlement unknown/);
});

test("plan v5 §8: the request carries no claims, only dealId + shipmentRef", async () => {
  const h = harness();
  let sent: any;
  const probe = h.deps.fetch;
  h.deps.fetch = async (url, init) => { sent = JSON.parse(String(init?.body)); return probe(url, init); };
  await buyVerification(request, CHECK1, h.deps);
  assert.deepEqual(Object.keys(sent).sort(), ["dealId", "shipmentRef"]);
});

test("a recheck is check 2: allowed after check 1, and check 2 is never paid twice either", async () => {
  const h = harness();
  await buyVerification(request, CHECK1, h.deps);
  assert.equal((await buyVerification(request, { ...CHECK1, checkNo: 2 }, h.deps)).status, "verified");
  assert.equal((await buyVerification(request, { ...CHECK1, checkNo: 2 }, h.deps)).status, "refused");
  assert.equal(h.calls.paid, 2);
});

test("a response signed for another TradeDeals is untrusted (it could never verify on our contract)", async () => {
  const h = harness({ body: { ...okBody, verifyingContract: "0x" + "33".repeat(20) } });
  const r = await buyVerification(request, CHECK1, h.deps);
  assert.equal(r.status, "untrusted");
  assert.match(h.audit.at(-1).reason, /another deal\/contract/);
});
