/**
 * Cross-lane parity (plan v5 is binding; lane C's code at the repo root is the reference):
 *   - our judge() == lane C's judge() on the plan's examples, the ±3% edges and 5,000 random cases
 *   - the EIP-712 type string and the signed fixture are identical
 *   - every ABI entry the agent uses equals lane C's current generated ABI
 * Fails as soon as either lane drifts. Skips if lane C's files aren't checked out next to this workspace.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { STATUS, judge } from "../src/trust.ts";
import { VERIFICATION_TYPE_STRING } from "../src/eip712.ts";
import { tradeDealsAgentAbi, DEAL_STATE, OUTCOME } from "../src/abi.ts";

const ROOT = new URL("../../../../", import.meta.url); // repo root (lane C's packages/ and contracts/)
const laneC = (p: string) => new URL(p, ROOT);
const present = existsSync(laneC("packages/shared/src/judge.ts"));
const skip = present ? false : "lane C's packages/shared is not checked out";

const OUTCOME_NAME = ["Verified", "Pending", "Falsified", "Mismatch"] as const;
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as const;

test("our judge() agrees with lane C's judge() everywhere", { skip }, async () => {
  const theirs = await import(laneC("packages/shared/src/judge.ts").href);
  const compare = (claim: any, observed: any) => {
    const a = judge(claim, observed);
    const b = theirs.judge(claim, observed);
    assert.equal(a.outcome, OUTCOME_NAME[b.outcome], JSON.stringify({ claim, observed }, (_k, v) => (typeof v === "bigint" ? `${v}` : v)));
    assert.equal(a.mask, b.falsifiedMask);
  };
  const claim = { declaredKg: 10_000, claimedStatus: STATUS.LOADED, docHash: hash(0xa), verifyDeadline: 1_000n };
  // plan v5 §4 examples and the edges
  for (const [kg, status, doc, at] of [
    [9_850, 4, 0xa, 500], [10_020, 2, 0xa, 500], [8_020, 3, 0xa, 500], [10_000, 3, 0xb, 500], [10_000, 2, 0xa, 1_001],
    [9_700, 3, 0xa, 500], [9_699, 3, 0xa, 500], [10_300, 3, 0xa, 500], [10_301, 3, 0xa, 500], [10_000, 2, 0xa, 1_000],
  ] as const) compare(claim, { observedKg: kg, statusCode: status, docHash: hash(doc), observedAt: BigInt(at) });
  compare({ ...claim, declaredKg: 9_000 }, { observedKg: 10_000, statusCode: 3, docHash: hash(0xa), observedAt: 500n });
  // deterministic random cases
  let seed = 1874;
  const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) % n);
  for (let i = 0; i < 5_000; i++) {
    const declaredKg = 1 + rnd(50_000);
    compare(
      { declaredKg, claimedStatus: 3 + rnd(3), docHash: hash(rnd(3)), verifyDeadline: BigInt(rnd(2_000)) },
      { observedKg: Math.max(0, declaredKg - 2_000 + rnd(4_000)), statusCode: rnd(6), docHash: hash(rnd(3)), observedAt: BigInt(rnd(2_000)) },
    );
  }
});

test("EIP-712 type string and signed fixture are identical to lane C's", { skip }, async () => {
  const theirs = await import(laneC("packages/shared/src/eip712.ts").href);
  assert.equal(VERIFICATION_TYPE_STRING, theirs.VERIFICATION_TYPE);
  const fixture = JSON.parse(readFileSync(laneC("contracts/test/fixtures/eip712.json"), "utf8"));
  const ours = JSON.parse(readFileSync(new URL("../vectors/eip712-lane-c.json", import.meta.url), "utf8"));
  assert.deepEqual(ours, fixture, "vectors/eip712-lane-c.json is out of date: copy contracts/test/fixtures/eip712.json");
});

test("every ABI entry the agent uses equals lane C's current generated ABI", { skip }, async () => {
  const { tradeDealsAbi } = await import(laneC("packages/shared/src/abi/tradeDeals.ts").href);
  for (const entry of tradeDealsAgentAbi as readonly any[]) {
    const match = (tradeDealsAbi as any[]).find((e) => e.type === entry.type && e.name === entry.name);
    assert.ok(match, `${entry.type} ${entry.name} missing from lane C's ABI`);
    assert.deepEqual(entry, match, `${entry.type} ${entry.name} differs: re-extract packages/shared/src/abi.ts`);
  }
  const constants = await import(laneC("packages/shared/src/constants.ts").href);
  assert.deepEqual({ ...DEAL_STATE }, { ...constants.DealState });
  assert.deepEqual({ ...OUTCOME }, { ...constants.Outcome });
});
