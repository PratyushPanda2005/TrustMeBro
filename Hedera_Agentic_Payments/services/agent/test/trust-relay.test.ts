/** The mock TradeDeals must judge like lane C's contract (plan v5 §4, §5.2). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUS, demoDocHash, forgedDocHash, dealIdToBytes32, DEMO_SHIPMENT } from "@tmb/shared";
import { MockChainAdapter, type ClaimedEvent } from "../src/chain.ts";

const TRADE_DEALS = "0x" + "11".repeat(20);
const C = DEMO_SHIPMENT.containerNo;
let clock = 1_800_000_000;
const now = () => clock;

function claim(id: number, exporter: string, o: Partial<ClaimedEvent> = {}): ClaimedEvent {
  return {
    dealId: dealIdToBytes32(BigInt(id)), exporter, declaredKg: 10_000, claimedStatus: STATUS.LOADED, docHash: demoDocHash(C),
    containerNo: C, blRef: "BL-1", verifyDeadline: BigInt(clock + 600), ...o,
  };
}
function signed(dealId: string, o: { observedKg?: number; statusCode?: number; docHash?: string; observedAt?: number; nonce?: string; expiry?: string } = {}) {
  return {
    verification: {
      dealId, observedKg: o.observedKg ?? 9_850, statusCode: o.statusCode ?? STATUS.DEPARTED, docHash: o.docHash ?? demoDocHash(C),
      observedAt: String(o.observedAt ?? clock + 5), nonce: o.nonce ?? String(Math.random()).slice(2), expiry: o.expiry ?? String(clock + 600),
    },
    signature: "0x" + "cd".repeat(65), signer: "0x" + "99".repeat(20), sigHash: "0x" + "ee".repeat(32), domain: { name: "TrustMeBro", version: "1", chainId: 1874, verifyingContract: TRADE_DEALS },
  } as any;
}
const fresh = () => new MockChainAdapter(TRADE_DEALS, now);

test("honest → Verified; the exporter's score does NOT move at verification (credit comes at settlement)", async () => {
  const chain = fresh();
  const e = claim(1, "0x" + "22".repeat(20));
  chain.emit(e);
  const r = await chain.submitVerification(signed(e.dealId));
  assert.ok(r.ok);
  assert.equal(r.ok && r.outcome, "verified");
  assert.deepEqual(r.ok && r.trust, { exporter: e.exporter, outcome: "verified", beforeBps: 5000, afterBps: 5000, falsifiedMask: 0 });
  assert.deepEqual(chain.settle(e.dealId), { beforeBps: 5000, afterBps: 6667 }, "settlement is where the honest exporter rises");
});

test("short weight (8,020 of 10,000) → Rejected, only the exporter drops 50.00% → 26.32%", async () => {
  const chain = fresh();
  const e = claim(2, "0x" + "33".repeat(20));
  chain.emit(e);
  const r = await chain.submitVerification(signed(e.dealId, { observedKg: 8_020, statusCode: STATUS.LOADED }));
  assert.deepEqual(r.ok && r.trust, { exporter: e.exporter, outcome: "rejected", beforeBps: 5000, afterBps: 2632, falsifiedMask: 1 });
});

test("fake documents → Rejected, 50.00% → 27.03%", async () => {
  const chain = fresh();
  const e = claim(3, "0x" + "44".repeat(20));
  chain.emit(e);
  const r = await chain.submitVerification(signed(e.dealId, { observedKg: 10_000, statusCode: STATUS.LOADED, docHash: forgedDocHash(C) }));
  assert.equal(r.ok && r.trust?.afterBps, 2703);
});

test("tracking lag → Pending (no score change), the recheck then verifies; at most what the contract allows", async () => {
  const chain = fresh();
  const e = claim(4, "0x" + "55".repeat(20));
  chain.emit(e);
  const first = await chain.submitVerification(signed(e.dealId, { observedKg: 10_020, statusCode: STATUS.GATED_IN }));
  assert.equal(first.ok && first.outcome, "pending");
  assert.equal(first.ok && first.trust?.afterBps, 5000);
  assert.deepEqual((await chain.openClaims()).map((x) => [x.claim.dealId, x.checks]), [[e.dealId, 1]]);
  clock += 30;
  const second = await chain.submitVerification(signed(e.dealId, { observedKg: 10_020 }));
  assert.equal(second.ok && second.outcome, "verified");
  assert.deepEqual(await chain.openClaims(), []);
});

test("under-declared (9,000 claimed, 10,000 observed) → Mismatch, no penalty", async () => {
  const chain = fresh();
  const e = claim(5, "0x" + "66".repeat(20), { declaredKg: 9_000 });
  chain.emit(e);
  const r = await chain.submitVerification(signed(e.dealId, { observedKg: 10_000 }));
  assert.deepEqual(r.ok && [r.outcome, r.trust?.afterBps], ["mismatch", 5000]);
});

test("the contract's own checks: wrong state, reused nonce, stale or future observation, expired", async () => {
  const chain = fresh();
  const e = claim(6, "0x" + "77".repeat(20));
  assert.deepEqual(await chain.submitVerification(signed(e.dealId)), { ok: false, error: "UnknownDeal" });
  chain.emit(e);
  assert.deepEqual(await chain.submitVerification(signed(e.dealId, { observedAt: clock })), { ok: false, error: "StaleObservation" });
  assert.deepEqual(await chain.submitVerification(signed(e.dealId, { observedAt: clock + 301 + 5 })), { ok: false, error: "ObservationInFuture" });
  assert.deepEqual(await chain.submitVerification(signed(e.dealId, { expiry: String(clock - 1) })), { ok: false, error: "SignatureExpired" });
  assert.equal((await chain.submitVerification(signed(e.dealId, { nonce: "77" }))).ok, true);
  const again = claim(7, e.exporter);
  chain.emit(again);
  assert.deepEqual(await chain.submitVerification(signed(again.dealId, { nonce: "77" })), { ok: false, error: "NonceAlreadyUsed" });
  assert.deepEqual(await chain.submitVerification(signed(e.dealId)), { ok: false, error: "WrongState" }, "already Verified");
});
