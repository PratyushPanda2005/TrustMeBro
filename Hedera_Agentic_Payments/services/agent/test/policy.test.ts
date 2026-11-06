import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, type Policy, type Quote } from "../src/policy.ts";
import { SpendLedger } from "../src/ledger.ts";

const DEAL = "0x" + "aa".repeat(32);
const DEAL2 = "0x" + "bb".repeat(32);
const NOW = Date.parse("2026-11-06T10:00:00Z");

const policy: Policy = {
  network: "hedera:testnet",
  asset: "0.0.429274",
  allowlist: new Set(["0.0.5005"]),
  maxPerCall: 1_000_000n,
  maxPerDeal: 2_000_000n,
  maxPerDay: 10_000_000n,
};
const q = (over: Partial<Quote> = {}): Quote => ({
  dealId: DEAL, stage: "departure", network: "hedera:testnet", asset: "0.0.429274", payTo: "0.0.5005", amount: 300_000n, ...over,
});

test("a normal 0.30 USDC quote from the allowlisted verifier is allowed", () => {
  assert.equal(evaluate(q(), policy, new SpendLedger(), NOW).decision, "allow");
});

test("wrong network or wrong asset is denied", () => {
  const l = new SpendLedger();
  assert.equal(evaluate(q({ network: "hedera:mainnet" }), policy, l, NOW).decision, "deny");
  assert.equal(evaluate(q({ asset: "0.0.6001" }), policy, l, NOW).decision, "deny");
});

test("a merchant that is not on the allowlist is denied", () => {
  const r = evaluate(q({ payTo: "0.0.666" }), policy, new SpendLedger(), NOW);
  assert.equal(r.decision, "deny");
  assert.match(r.reason, /allowlist/);
});

test("never pays twice for the same deal and stage", () => {
  const l = new SpendLedger();
  l.recordPayment({ dealId: DEAL, stage: "departure", payTo: "0.0.5005", amount: 300_000n, at: NOW });
  const r = evaluate(q(), policy, l, NOW);
  assert.equal(r.decision, "deny");
  assert.match(r.reason, /already paid/);
});

test("a 5.00 quote is above the per-call cap → waits for a human", () => {
  const r = evaluate(q({ amount: 5_000_000n }), policy, new SpendLedger(), NOW);
  assert.equal(r.decision, "pending_human");
});

test("a human approval lets that exact over-cap payment through; a rejection denies it", () => {
  const l = new SpendLedger();
  const id = l.requestApproval({ dealId: DEAL, stage: "departure", payTo: "0.0.5005", amount: 1_500_000n, reason: "over cap", at: NOW });
  l.decide(id, "approved");
  assert.equal(evaluate(q({ amount: 1_500_000n }), policy, l, NOW).decision, "allow");
  const l2 = new SpendLedger();
  const id2 = l2.requestApproval({ dealId: DEAL, stage: "departure", payTo: "0.0.5005", amount: 1_500_000n, reason: "over cap", at: NOW });
  l2.decide(id2, "rejected");
  assert.equal(evaluate(q({ amount: 1_500_000n }), policy, l2, NOW).decision, "deny");
});

test("an approval for a different amount does not count", () => {
  const l = new SpendLedger();
  const id = l.requestApproval({ dealId: DEAL, stage: "departure", payTo: "0.0.5005", amount: 1_500_000n, reason: "", at: NOW });
  l.decide(id, "approved");
  assert.equal(evaluate(q({ amount: 5_000_000n }), policy, l, NOW).decision, "pending_human");
});

test("per-deal cap: arrival check denied once the deal has used its budget", () => {
  const l = new SpendLedger();
  l.recordPayment({ dealId: DEAL, stage: "departure", payTo: "0.0.5005", amount: 1_900_000n, at: NOW });
  assert.equal(evaluate(q({ stage: "arrival", amount: 300_000n }), policy, l, NOW).decision, "deny");
});

test("daily budget: denied when today's spend would exceed 10.00; resets next UTC day", () => {
  const l = new SpendLedger();
  for (let i = 0; i < 10; i++) l.recordPayment({ dealId: "0x" + i.toString(16).padStart(64, "0"), stage: "departure", payTo: "0.0.5005", amount: 980_000n, at: NOW });
  assert.equal(evaluate(q({ dealId: DEAL2 }), policy, l, NOW).decision, "deny");
  assert.equal(evaluate(q({ dealId: DEAL2 }), policy, l, NOW + 24 * 3600_000).decision, "allow");
});

test("ledger persists to disk and reloads", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const file = join(mkdtempSync(join(tmpdir(), "tmb-")), "ledger.json");
  const l = new SpendLedger(file);
  l.recordPayment({ dealId: DEAL, stage: "departure", payTo: "0.0.5005", amount: 300_000n, at: NOW, hederaTxId: "0.0.1@1.1" });
  const again = new SpendLedger(file);
  assert.equal(again.alreadyPaid(DEAL, "departure"), true);
  assert.equal(again.spentOnDeal(DEAL), 300_000n);
});
