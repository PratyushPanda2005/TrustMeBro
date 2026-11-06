/** Spending gate, plan v5 §9. Every rule, the human queue, and "never pays twice for the same check". */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluate, type Policy, type Quote } from "../src/policy.ts";
import { SpendLedger } from "../src/ledger.ts";

const NOW = Date.parse("2026-11-06T10:00:00Z");
const policy: Policy = {
  network: "hedera:testnet", asset: "0.0.429274", allowlist: new Set(["0.0.5005"]),
  maxPerCall: 1_000_000n, maxPerDeal: 1_000_000n, maxPerDay: 10_000_000n, maxChecksPerDeal: 3, maxChecksPerExporterPerDay: 5,
};
const EXPORTER = "0x" + "22".repeat(20);
const q = (o: Partial<Quote> = {}): Quote => ({
  dealId: "0x" + "aa".repeat(32), checkNo: 1, exporter: EXPORTER, network: "hedera:testnet", asset: "0.0.429274", payTo: "0.0.5005", amount: 300_000n, ...o,
});
const paid = (l: SpendLedger, o: Partial<Quote> & { at?: number } = {}) => {
  const x = q(o);
  l.recordPayment({ dealId: x.dealId, checkNo: x.checkNo, exporter: x.exporter, payTo: x.payTo, amount: x.amount, at: o.at ?? NOW });
};

test("a 0.30 USDC quote from the allowlisted verifier is allowed", () => {
  assert.equal(evaluate(q(), policy, new SpendLedger(), NOW).decision, "allow");
});

test("wrong network, wrong asset or a merchant off the allowlist is denied", () => {
  const l = new SpendLedger();
  assert.match(evaluate(q({ network: "eip155:1" }), policy, l, NOW).reason, /network/);
  assert.match(evaluate(q({ asset: "0.0.1" }), policy, l, NOW).reason, /asset/);
  assert.match(evaluate(q({ payTo: "0.0.666" }), policy, l, NOW).reason, /allowlist/);
});

test("never pays twice for the same check of a deal, but a recheck (next check number) is allowed", () => {
  const l = new SpendLedger();
  paid(l);
  assert.match(evaluate(q(), policy, l, NOW).reason, /already paid for check 1/);
  assert.equal(evaluate(q({ checkNo: 2 }), policy, l, NOW).decision, "allow");
});

test("at most 3 checks per deal (plan v5 §3 step 6)", () => {
  const l = new SpendLedger();
  [1, 2, 3].forEach((n) => paid(l, { checkNo: n, amount: 100_000n }));
  assert.match(evaluate(q({ checkNo: 4, amount: 100_000n }), policy, l, NOW).reason, /3 checks per deal/);
});

test("≤ 1.00 per deal: a fourth 0.30 would cross it even if a check slot were free", () => {
  const l = new SpendLedger();
  paid(l, { checkNo: 1 });
  paid(l, { checkNo: 2 });
  paid(l, { checkNo: 3 });
  const roomy = { ...policy, maxChecksPerDeal: 10 };
  assert.match(evaluate(q({ checkNo: 4 }), roomy, l, NOW).reason, /per-deal budget 1\.00/);
});

test("≤ 5 checks per exporter per day (spam guard), across deals; resets the next UTC day", () => {
  const l = new SpendLedger();
  for (let i = 0; i < 5; i++) paid(l, { dealId: "0x" + String(i).repeat(64), amount: 100_000n });
  assert.match(evaluate(q({ dealId: "0x" + "9".repeat(64) }), policy, l, NOW).reason, /5 checks per exporter/);
  assert.equal(evaluate(q({ dealId: "0x" + "9".repeat(64), exporter: "0x" + "33".repeat(20) }), policy, l, NOW).decision, "allow");
  assert.equal(evaluate(q({ dealId: "0x" + "9".repeat(64) }), policy, l, NOW + 86_400_000).decision, "allow");
});

test("≤ 10.00 per day across all deals", () => {
  const l = new SpendLedger();
  for (let i = 0; i < 10; i++) paid(l, { dealId: "0x" + String(i % 10).repeat(64), exporter: "0x" + String(i).padStart(40, "0"), amount: 990_000n });
  assert.match(evaluate(q({ dealId: "0x" + "f".repeat(64) }), policy, l, NOW).reason, /daily budget/);
});

test("a 5.00 quote waits for a human; that exact approval lets it through, a rejection denies it", () => {
  const l = new SpendLedger();
  const big = q({ amount: 5_000_000n });
  assert.equal(evaluate(big, policy, l, NOW).decision, "pending_human");
  const id = l.requestApproval({ dealId: big.dealId, checkNo: 1, payTo: big.payTo, amount: big.amount, reason: "x", at: NOW });
  l.decide(id, "approved");
  const roomy = { ...policy, maxPerDeal: 10_000_000n };
  assert.equal(evaluate(big, roomy, l, NOW).decision, "allow");
  assert.equal(evaluate(q({ amount: 4_000_000n }), roomy, l, NOW).decision, "pending_human", "approval is for that exact amount");
  const id2 = l.requestApproval({ dealId: big.dealId, checkNo: 2, payTo: big.payTo, amount: big.amount, reason: "x", at: NOW });
  l.decide(id2, "rejected");
  assert.match(evaluate(q({ checkNo: 2, amount: 5_000_000n }), roomy, l, NOW).reason, /human rejected/);
});

test("the ledger persists, and v4 records (stage, no checkNo) load as check 1", () => {
  const dir = mkdtempSync(join(tmpdir(), "tmb-ledger-"));
  try {
    const file = join(dir, "ledger.json");
    writeFileSync(file, JSON.stringify({
      payments: [{ dealId: "0x" + "aa".repeat(32), stage: "departure", payTo: "0.0.5005", amount: "300000", at: NOW }],
      approvals: [],
    }));
    const l = new SpendLedger(file);
    assert.equal(l.alreadyPaid("0x" + "aa".repeat(32), 1), true);
    paid(l, { checkNo: 2 });
    assert.equal(new SpendLedger(file).checksPaid("0x" + "aa".repeat(32)), 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
