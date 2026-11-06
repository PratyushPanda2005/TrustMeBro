/** The agent's job per Claimed deal, plan v5 §3 steps 5–6: pay for the check, relay, never judge. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUS, demoDocHash, dealIdToBytes32, DEMO_SHIPMENT } from "@tmb/shared";
import { processClaim, shouldRecheck } from "../src/agent.ts";
import { MockChainAdapter, type ClaimedEvent } from "../src/chain.ts";

const TRADE_DEALS = "0x" + "11".repeat(20);
const C = DEMO_SHIPMENT.containerNo;
let clock = 1_800_000_000;
const claim = (o: Partial<ClaimedEvent> = {}): ClaimedEvent => ({
  dealId: dealIdToBytes32(9n), exporter: "0x" + "22".repeat(20), declaredKg: 10_000, claimedStatus: STATUS.LOADED,
  docHash: demoDocHash(C), containerNo: C, blRef: "BL-1", verifyDeadline: BigInt(clock + 600), ...o,
});

function verified(observed: { observedKg?: number; statusCode?: number } = {}) {
  return async (req: any) => ({
    status: "verified" as const,
    settlement: { success: true, txId: "0.0.7162784@1.2", hashscan: "x", payer: "0.0.11331527" },
    payment: { payTo: "0.0.11331478", amount: "300000", asset: "0.0.429274" },
    response: {
      verification: {
        dealId: req.dealId, observedKg: observed.observedKg ?? 9_850, statusCode: observed.statusCode ?? STATUS.DEPARTED,
        docHash: demoDocHash(C), observedAt: String(++clock), nonce: String(clock), expiry: String(clock + 600),
      },
      signature: "0x" + "cd".repeat(65), signer: "0x" + "99".repeat(20), chainId: 1874 as const, verifyingContract: TRADE_DEALS,
    },
  });
}

function harness(buy: any) {
  const chain = new MockChainAdapter(TRADE_DEALS, () => clock);
  const audit: any[] = [];
  const bought: any[] = [];
  const deps = {
    chain,
    buy: async (req: any, ctx: any) => { bought.push({ req, ctx }); return buy(req, ctx); },
    audit: async (e: any) => { audit.push(e); },
  };
  return { chain, audit, bought, deps };
}

test("a Claimed deal → buys check 1 with {dealId, shipmentRef} only → relays → Verified, Option A record on HCS", async () => {
  const h = harness(verified());
  const e = claim();
  h.chain.emit(e);
  const r = await processClaim(e, 1, h.deps as any);
  assert.equal(r.outcome, "verified");
  assert.deepEqual(h.bought[0].req, { dealId: e.dealId, shipmentRef: { containerNo: C, blRef: "BL-1" } });
  assert.deepEqual(h.bought[0].ctx, { checkNo: 1, exporter: e.exporter });
  const last = h.audit.at(-1);
  assert.equal(last.kind, "relayed");
  assert.match(last.sigHash, /^0x[0-9a-f]{64}$/);
  assert.match(last.whitechainTx, /^0x[0-9a-f]{64}$/);
  assert.deepEqual(last.payment, { payTo: "0.0.11331478", amount: "300000", asset: "0.0.429274", hederaTxId: "0.0.7162784@1.2", payer: "0.0.11331527" });
  assert.deepEqual(last.trust, { exporter: e.exporter, outcome: "verified", beforeBps: 5000, afterBps: 5000 });
  assert.match(last.reason, /check 1 → verified; score unchanged 50\.00% \(credit at settlement\)/);
});

test("a short weight is relayed and the contract rejects it: the log shows only the exporter dropping to 26.32%", async () => {
  const h = harness(verified({ observedKg: 8_020, statusCode: STATUS.LOADED }));
  const e = claim();
  h.chain.emit(e);
  const r = await processClaim(e, 1, h.deps as any);
  assert.equal(r.outcome, "rejected");
  assert.match(h.audit.at(-1).reason, /rejected \(weight falsified\); exporter score 50\.00% → 26\.32%/);
});

test("tracking lag → pending; the agent rechecks as check 2 until the contract decides (max 3)", async () => {
  const lag = harness(verified({ observedKg: 10_020, statusCode: STATUS.GATED_IN }));
  const e = claim();
  lag.chain.emit(e);
  assert.equal((await processClaim(e, 1, lag.deps as any)).outcome, "pending");
  assert.equal(shouldRecheck("pending", 1, 3), true);
  assert.equal(shouldRecheck("pending", 3, 3), false);
  assert.equal(shouldRecheck("verified", 1, 3), false);
  lag.deps.buy = verified() as any;
  assert.equal((await processClaim(e, 2, lag.deps as any)).outcome, "verified");
});

test("the agent never judges: a purchase that isn't verified stops before the chain", async () => {
  const h = harness(async () => ({ status: "pending_human", reason: "price 5.00 USDC above per-call cap 1.00" }));
  const e = claim();
  h.chain.emit(e);
  const r = await processClaim(e, 1, h.deps as any);
  assert.equal(r.outcome, "pending_human");
  assert.equal(h.chain.submitted.length, 0);
});

test("a relay the contract would revert is not sent and is audited as error", async () => {
  const h = harness(verified());
  const e = claim();
  h.chain.emit(e);
  h.chain.failNextWith("StaleObservation");
  const r = await processClaim(e, 1, h.deps as any);
  assert.equal(r.outcome, "relay_failed");
  assert.equal(h.audit.at(-1).kind, "error");
});
