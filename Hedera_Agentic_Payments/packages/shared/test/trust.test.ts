/** Plan v5 tables (docs/plans/TMB-00-master-plan.md §4–6), checked against the TS mirror of lane C's contracts. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATUS, newExporterRep, newImporterRep, trust, advanceBps, riskBps, judge, applyFalsified, applySettledExporter,
  applyImporterPayment, quote, waterfall, creditLimit, feeConfig, type Rep, type Claim, type Observation,
} from "../src/trust.ts";

const pct = (bps: bigint) => (Number(bps) / 100).toFixed(2);
const honestDeals = (n: number, rep: Rep = newExporterRep()) => {
  for (let i = 0; i < n; i++) rep = applySettledExporter(rep);
  return rep;
};

test("§5.2 exporter table: 50 → 66.67 / 75 / 80 / 83.33 / 85.71, 90 after 8 honest settled deals", () => {
  assert.equal(pct(trust(newExporterRep())), "50.00");
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => pct(trust(honestDeals(n)))), ["66.67", "75.00", "80.00", "83.33", "85.71"]);
  assert.equal(pct(trust(honestDeals(8))), "90.00");
});

test("§5.2 falsified from new: weight 26.32, docs 27.03, status 28.57, all three 20.00; 5 honest then weight 68.18", () => {
  const F = { weight: 1, docs: 2, status: 4 } as const;
  assert.equal(pct(trust(applyFalsified(newExporterRep(), F.weight))), "26.32");
  assert.equal(pct(trust(applyFalsified(newExporterRep(), F.docs))), "27.03");
  assert.equal(pct(trust(applyFalsified(newExporterRep(), F.status))), "28.57");
  assert.equal(pct(trust(applyFalsified(newExporterRep(), F.weight | F.docs | F.status))), "20.00");
  assert.equal(pct(trust(applyFalsified(honestDeals(5), F.weight))), "68.18");
});

test("§5.3 advance = score capped at 90%, blocked (0) below 40%", () => {
  assert.equal(advanceBps(newExporterRep()), 5000n);
  assert.equal(advanceBps(honestDeals(1)), 6667n);
  assert.equal(advanceBps(honestDeals(12)), 9000n);
  assert.equal(advanceBps(applyFalsified(newExporterRep(), 1)), 0n);
});

test("§5.4 credit limit = 200 + 2 × settled volume (USDT units)", () => {
  const unit = 1_000_000n;
  assert.equal(creditLimit(0n, unit), 200n * unit);
  assert.equal(creditLimit(100n * unit, unit), 400n * unit);
  assert.equal(creditLimit(50_000n * unit, unit), 100_200n * unit);
});

test("§5.5 importer table (start 66.67%): trust and risk = investor yield", () => {
  const start = newImporterRep();
  const row = (r: Rep) => [pct(trust(r)), pct(riskBps(r))];
  assert.deepEqual(row(start), ["66.67", "4.00"]);
  assert.deepEqual(row(applyImporterPayment(start, "onTime")), ["77.78", "3.33"]);
  let three = start;
  for (let i = 0; i < 3; i++) three = applyImporterPayment(three, "onTime");
  assert.deepEqual(row(three), ["86.67", "2.80"]);
  assert.deepEqual(row(applyImporterPayment(start, "late", { lateBy: 30n, grace: 30n })), ["61.11", "4.33"]);
  assert.deepEqual(row(applyImporterPayment(start, "default")), ["26.67", "6.40"]);
});

test("§6.3 worked example: 100,000 at 70% / 4% → fee 700 split 1 / 0.5 / 139.70 / 558.80, exporter 69,300, investor 72,800", () => {
  const unit = 1_000_000n, U = (x: number) => BigInt(Math.round(x * 1e6));
  const q = quote(100_000n * unit, 7000n, 400n, feeConfig(unit));
  assert.deepEqual(
    [q.advance, q.fee, q.agentFee, q.gasFee, q.reserveFee, q.platformFee, q.exporterNet, q.investorDue],
    [U(70_000), U(700), U(1), U(0.5), U(139.7), U(558.8), U(69_300), U(72_800)],
  );
  assert.deepEqual(waterfall(U(100_000), q.investorDue), { toInvestor: U(72_800), toExporter: U(27_200) });
  assert.deepEqual(waterfall(U(60_000), q.investorDue), { toInvestor: U(60_000), toExporter: 0n }, "partial: investor first");
});

test("§6.5 demo size: 100 USDT at 50% / 4% → min fee 2 (1 / 0.5 / 0.10 / 0.40), exporter 48, investor 52", () => {
  const unit = 1_000_000n, U = (x: number) => BigInt(Math.round(x * 1e6));
  const q = quote(100n * unit, 5000n, 400n, feeConfig(unit));
  assert.deepEqual([q.advance, q.fee, q.agentFee, q.gasFee, q.reserveFee, q.platformFee, q.exporterNet, q.investorDue],
    [U(50), U(2), U(1), U(0.5), U(0.1), U(0.4), U(48), U(52)]);
});

const CLAIM: Claim = { declaredKg: 10_000, claimedStatus: STATUS.LOADED, docHash: "0x" + "aa".repeat(32), verifyDeadline: 1_000n };
const obs = (o: Partial<Observation>): Observation => ({ observedKg: 10_000, statusCode: STATUS.LOADED, docHash: CLAIM.docHash, observedAt: 500n, ...o });

test("§4 example checks: honest, lag, short weight, fake docs, under-declared", () => {
  assert.deepEqual(judge(CLAIM, obs({ observedKg: 9_850, statusCode: STATUS.DEPARTED })), { outcome: "Verified", mask: 0, penalty: 0n });
  assert.deepEqual(judge(CLAIM, obs({ observedKg: 10_020, statusCode: STATUS.GATED_IN })), { outcome: "Pending", mask: 0, penalty: 0n });
  assert.deepEqual(judge(CLAIM, obs({ observedKg: 8_020 })), { outcome: "Falsified", mask: 1, penalty: 18_000n });
  assert.deepEqual(judge(CLAIM, obs({ docHash: "0x" + "bb".repeat(32) })), { outcome: "Falsified", mask: 2, penalty: 17_000n });
  assert.deepEqual(judge({ ...CLAIM, declaredKg: 9_000 }, obs({ observedKg: 10_000 })), { outcome: "Mismatch", mask: 0, penalty: 0n });
});

test("±3% edges, and status still behind after the deadline (judged on observedAt) is falsified", () => {
  assert.equal(judge(CLAIM, obs({ observedKg: 9_700 })).outcome, "Verified"); // exactly −3%
  assert.equal(judge(CLAIM, obs({ observedKg: 9_699 })).outcome, "Falsified");
  assert.equal(judge(CLAIM, obs({ observedKg: 10_300 })).outcome, "Verified"); // exactly +3%
  assert.equal(judge(CLAIM, obs({ observedKg: 10_301 })).outcome, "Mismatch");
  assert.deepEqual(judge(CLAIM, obs({ statusCode: STATUS.GATED_IN, observedAt: 1_001n })), { outcome: "Falsified", mask: 4, penalty: 15_000n });
  assert.equal(judge(CLAIM, obs({ statusCode: STATUS.GATED_IN, observedAt: 1_000n })).outcome, "Pending");
});

test("score rule: verification never raises the exporter; only settlement does, only lies lower", () => {
  const before = newExporterRep();
  assert.equal(judge(CLAIM, obs({})).penalty, 0n);
  assert.ok(trust(applySettledExporter(before)) > trust(before));
  assert.ok(trust(applyFalsified(before, 1)) < trust(before));
});
