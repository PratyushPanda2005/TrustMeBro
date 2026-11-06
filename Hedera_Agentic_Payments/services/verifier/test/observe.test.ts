import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUS, demoDocHash, forgedDocHash, judge, DEMO_SHIPMENT } from "@tmb/shared";
import { ScenarioBook, observe, buildVerification, NonceSource, isScenario, priceFor, dealIdOf, SCENARIOS } from "../src/observe.ts";

const DEAL_A = ("0x" + "aa".repeat(32)) as `0x${string}`;
const DEAL_B = ("0x" + "bb".repeat(32)) as `0x${string}`;
const C = DEMO_SHIPMENT.containerNo;

test("scenarios are plan v5's demo set plus the guardrail demos", () => {
  assert.deepEqual([...SCENARIOS], ["honest", "lag", "short-weight", "fake-docs", "outage", "overcharge"]);
});

test("§4 observations: honest 9,850 kg DEPARTED hash A; short weight 8,020; fake docs hash B", () => {
  assert.deepEqual(observe("honest", C, 1), { observedKg: 9_850, statusCode: STATUS.DEPARTED, docHash: demoDocHash(C) });
  assert.deepEqual(observe("short-weight", C, 1), { observedKg: 8_020, statusCode: STATUS.LOADED, docHash: demoDocHash(C) });
  assert.deepEqual(observe("fake-docs", C, 1), { observedKg: 10_000, statusCode: STATUS.LOADED, docHash: forgedDocHash(C) });
  assert.deepEqual(observe("overcharge", C, 1), observe("honest", C, 1), "greedy merchant, honest data");
});

test("lag: GATED_IN on the first check, DEPARTED on the recheck (§4 tracking lag)", () => {
  assert.deepEqual(observe("lag", C, 1), { observedKg: 10_020, statusCode: STATUS.GATED_IN, docHash: demoDocHash(C) });
  assert.equal(observe("lag", C, 2).statusCode, STATUS.DEPARTED);
});

test("against the demo claim, each scenario lands on the outcome the plan names", () => {
  const claim = { declaredKg: DEMO_SHIPMENT.declaredKg, claimedStatus: DEMO_SHIPMENT.claimedStatus, docHash: demoDocHash(C), verifyDeadline: 1_000n };
  const at = (s: Parameters<typeof observe>[0], n = 1) => judge(claim, { ...observe(s, C, n), observedAt: 500n }).outcome;
  assert.equal(at("honest"), "Verified");
  assert.equal(at("lag", 1), "Pending");
  assert.equal(at("lag", 2), "Verified");
  assert.equal(at("short-weight"), "Falsified");
  assert.equal(at("fake-docs"), "Falsified");
  assert.equal(judge({ ...claim, declaredKg: 9_000 }, { ...observe("honest", C, 1), observedKg: 10_000, observedAt: 500n }).outcome, "Mismatch");
});

test("the source is keyed by container: another container gets its own document hash", () => {
  assert.notEqual(observe("honest", "TGHU7654321", 1).docHash, observe("honest", C, 1).docHash);
});

test("a per-deal scenario overrides the default for that deal only, and counts checks per deal", () => {
  const book = new ScenarioBook("honest");
  book.set("short-weight", DEAL_A);
  assert.equal(book.for(DEAL_A), "short-weight");
  assert.equal(book.for(DEAL_B), "honest");
  assert.equal(book.nextCheck(DEAL_A), 1);
  assert.equal(book.nextCheck(DEAL_A), 2);
  assert.equal(book.nextCheck(DEAL_B), 1);
});

test("unknown scenario names are rejected (including the v4 names)", () => {
  assert.equal(isScenario("fake-weight"), false);
  assert.throws(() => new ScenarioBook("nope" as any));
});

test("verification is bound to the deal, stamped observedAt = now, fresh nonce and short expiry", () => {
  const nonces = new NonceSource(() => 5);
  const v = buildVerification(DEAL_A, observe("honest", C, 1), nonces, 1_800_000_000, 600);
  assert.equal(v.dealId, DEAL_A);
  assert.equal(v.observedAt, 1_800_000_000n);
  assert.equal(v.expiry, 1_800_000_600n);
  assert.ok(buildVerification(DEAL_A, observe("honest", C, 1), nonces, 1_800_000_000, 600).nonce > v.nonce);
});

test("overcharge changes only the price", () => {
  assert.equal(priceFor("overcharge", "$0.30", "$5.00"), "$5.00");
  for (const s of SCENARIOS.filter((x) => x !== "overcharge")) assert.equal(priceFor(s, "$0.30", "$5.00"), "$0.30");
});

test("dealIdOf reads the dealId from the request body for per-deal pricing, tolerating junk", () => {
  assert.equal(dealIdOf({ dealId: "0xAB" }), "0xAB");
  for (const junk of [undefined, null, "x", {}, { dealId: 7 }]) assert.equal(dealIdOf(junk), "");
});
