import { test } from "node:test";
import assert from "node:assert/strict";
import { E2E_CASES, judge } from "../src/e2e-cases.ts";
import type { BuyResult } from "../src/buy.ts";

// Partial BuyResult: judge() only reads status, settlement and the three observations.
const verified = (weight = true): BuyResult => ({
  status: "verified" as const,
  settlement: { success: true, txId: "0.0.7162784@1.2" },
  response: { verification: { weight, statusCode: true, documents: true } } as any,
});

test("the Hedera-only cases cover happy, cheat, overcharge and outage", () => {
  assert.deepEqual(Object.keys(E2E_CASES), ["happy", "cheat", "overcharge", "outage"]);
  assert.equal(E2E_CASES.overcharge.scenario, "overcharge");
  assert.equal(E2E_CASES.cheat.scenario, "fake-weight");
});

test("happy passes only when paid 0.30 and every observation is true", () => {
  assert.deepEqual(judge(E2E_CASES.happy, verified(), 300000n), { pass: true, why: "paid 0.30, verified, all checks true" });
  assert.equal(judge(E2E_CASES.happy, verified(false), 300000n).pass, false);
  assert.match(judge(E2E_CASES.happy, verified(), 0n).why, /charged 0, expected 300000/);
});

test("cheat passes when the paid verification reports the falsified weight", () => {
  assert.equal(judge(E2E_CASES.cheat, verified(false), 300000n).pass, true);
  assert.match(judge(E2E_CASES.cheat, verified(true), 300000n).why, /weight/);
});

test("overcharge and outage must move no money", () => {
  assert.equal(judge(E2E_CASES.overcharge, { status: "pending_human", reason: "price 5.00" }, 0n).pass, true);
  assert.match(judge(E2E_CASES.overcharge, { status: "pending_human", reason: "x" }, 5000000n).why, /charged 5000000, expected 0/);
  assert.equal(judge(E2E_CASES.outage, { status: "no_verdict", reason: "verifier 503" }, 0n).pass, true);
  assert.match(judge(E2E_CASES.outage, { status: "verified", settlement: {}, response: { verification: {} } } as any, 0n).why, /status verified, expected no_verdict/);
});
