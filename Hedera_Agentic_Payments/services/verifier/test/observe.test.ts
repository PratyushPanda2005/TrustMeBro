import { test } from "node:test";
import assert from "node:assert/strict";
import { ScenarioBook, observe, buildVerification, NonceSource, isScenario, priceFor, dealIdOf } from "../src/observe.ts";

const DEAL_A = ("0x" + "aa".repeat(32)) as `0x${string}`;
const DEAL_B = ("0x" + "bb".repeat(32)) as `0x${string}`;

test("honest scenario observes the shipment as claimed (all true)", () => {
  const book = new ScenarioBook("honest");
  assert.deepEqual(observe(book.for(DEAL_A)), { weight: true, statusCode: true, documents: true });
});

test("fake-weight scenario observes a weight mismatch only", () => {
  assert.deepEqual(observe("fake-weight"), { weight: false, statusCode: true, documents: true });
  assert.deepEqual(observe("fake-docs"), { weight: true, statusCode: true, documents: false });
  assert.deepEqual(observe("fake-status"), { weight: true, statusCode: false, documents: true });
});

test("a per-deal scenario overrides the default for that deal only", () => {
  const book = new ScenarioBook("honest");
  book.set("fake-weight", DEAL_B);
  assert.equal(book.for(DEAL_A), "honest");
  assert.equal(book.for(DEAL_B), "fake-weight");
});

test("unknown scenario names are rejected", () => {
  const book = new ScenarioBook("honest");
  assert.throws(() => book.set("lol" as any));
});

test("verification is bound to the deal, carries a fresh nonce and a short expiry", () => {
  const nonces = new NonceSource(() => 1_762_400_000_000);
  const v1 = buildVerification(DEAL_A, observe("honest"), nonces, 1_762_400_000, 600);
  const v2 = buildVerification(DEAL_A, observe("honest"), nonces, 1_762_400_000, 600);
  assert.equal(v1.dealId, DEAL_A);
  assert.equal(v1.expiry, 1_762_400_600n);
  assert.notEqual(v1.nonce, v2.nonce);
  assert.ok(v2.nonce > v1.nonce);
});

test("overcharge is a scenario the demo panel can switch to; its data is honest, only the price changes", () => {
  assert.ok(isScenario("overcharge"));
  assert.deepEqual(observe("overcharge"), { weight: true, statusCode: true, documents: true });
  assert.equal(priceFor("overcharge", "$0.30", "$5.00"), "$5.00");
  for (const s of ["honest", "fake-weight", "fake-status", "fake-docs", "outage"] as const) assert.equal(priceFor(s, "$0.30", "$5.00"), "$0.30");
});

test("dealIdOf reads the dealId from the request body for per-deal pricing, tolerating junk", () => {
  assert.equal(dealIdOf({ dealId: "0xAB" }), "0xAB");
  for (const junk of [undefined, null, "x", {}, { dealId: 7 }]) assert.equal(dealIdOf(junk), "");
});
