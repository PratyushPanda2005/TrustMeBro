import { test } from "node:test";
import assert from "node:assert/strict";
import { E2E_CASES, judge, type E2ERun } from "../src/e2e-cases.ts";

const run = (o: Partial<E2ERun>): E2ERun => ({ outcomes: [], charged: 0n, scoreBps: 5000, ...o });

test("cases follow plan v5 §4's example table plus the guardrail demos", () => {
  assert.deepEqual(Object.keys(E2E_CASES), ["honest", "lag", "short-weight", "fake-docs", "under-declared", "overcharge", "outage"]);
  assert.equal(E2E_CASES["under-declared"].declaredKg, 9_000);
  assert.equal(E2E_CASES["under-declared"].scenario, "honest", "the verifier is honest; the exporter's claim is low");
});

test("honest: one paid check, Verified, score unchanged at verification, 66.67% after settlement", () => {
  const c = E2E_CASES.honest;
  assert.equal(judge(c, run({ outcomes: ["verified"], charged: 300000n, settledBps: 6667 })).pass, true);
  assert.match(judge(c, run({ outcomes: ["verified"], charged: 300000n, scoreBps: 6667, settledBps: 6667 })).why, /score/);
  assert.match(judge(c, run({ outcomes: ["verified"], charged: 300000n, settledBps: 5000 })).why, /settlement/);
});

test("lag: Pending then the recheck verifies, two paid checks (0.60)", () => {
  const c = E2E_CASES.lag;
  assert.equal(judge(c, run({ outcomes: ["pending", "verified"], charged: 600000n })).pass, true);
  assert.match(judge(c, run({ outcomes: ["pending"], charged: 300000n })).why, /outcomes/);
});

test("short weight and fake docs: Rejected, only the exporter drops (26.32% / 27.03%)", () => {
  assert.equal(judge(E2E_CASES["short-weight"], run({ outcomes: ["rejected"], charged: 300000n, scoreBps: 2632 })).pass, true);
  assert.equal(judge(E2E_CASES["fake-docs"], run({ outcomes: ["rejected"], charged: 300000n, scoreBps: 2703 })).pass, true);
  assert.match(judge(E2E_CASES["fake-docs"], run({ outcomes: ["rejected"], charged: 300000n, scoreBps: 2632 })).why, /score 2632, expected 2703/);
});

test("under-declared: Mismatch, no penalty", () => {
  assert.equal(judge(E2E_CASES["under-declared"], run({ outcomes: ["mismatch"], charged: 300000n })).pass, true);
});

test("overcharge and outage move no money and never reach the chain", () => {
  assert.equal(judge(E2E_CASES.overcharge, run({ stopped: "pending_human" })).pass, true);
  assert.equal(judge(E2E_CASES.outage, run({ stopped: "no_verdict" })).pass, true);
  assert.match(judge(E2E_CASES.outage, run({ stopped: "no_verdict", charged: 300000n })).why, /charged 300000, expected 0/);
  assert.match(judge(E2E_CASES.overcharge, run({ stopped: "refused" })).why, /stopped at refused, expected pending_human/);
});
