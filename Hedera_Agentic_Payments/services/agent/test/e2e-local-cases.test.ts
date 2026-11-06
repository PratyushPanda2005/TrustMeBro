import { test } from "node:test";
import assert from "node:assert/strict";
import { FALSIFIED, applyFalsified, applySettledExporter, newExporterRep, trust } from "@tmb/shared";
import { LOCAL_CASES, judgeLocal, type LocalCase } from "../src/e2e-local-cases.ts";

test("local cases cover every lane C verifier scenario", () => {
  assert.deepEqual(Object.values(LOCAL_CASES).map((c) => c.scenario).sort(), ["fake-docs", "honest", "lag", "over-weight", "short-weight", "stuck"]);
});

test("expected scores are the shared TrustRegistry mirror's, not hand-typed", () => {
  const fresh = newExporterRep();
  assert.equal(Number(trust(fresh)), LOCAL_CASES.honest.scoreBps);
  assert.equal(Number(trust(applySettledExporter(fresh))), LOCAL_CASES.honest.settledBps);
  for (const c of Object.values(LOCAL_CASES) as LocalCase[]) {
    const expected = c.mask ? Number(trust(applyFalsified(fresh, c.mask))) : 5000;
    assert.equal(c.scoreBps, expected, c.scenario);
  }
  assert.equal(LOCAL_CASES.stuck.mask, FALSIFIED.STATUS);
});

test("charges are 0.30 per paid check, and the stuck case uses all 3 checks", () => {
  for (const c of Object.values(LOCAL_CASES) as LocalCase[]) assert.equal(c.charge, 300000n * BigInt(c.outcomes.length), c.scenario);
  assert.equal(LOCAL_CASES.stuck.outcomes.length, 3);
});

test("judgeLocal fails on any difference and passes on the expected run", () => {
  const c = LOCAL_CASES["short-weight"];
  const ok = { outcomes: c.outcomes, state: c.state, mask: c.mask, charged: c.charge, scoreBps: c.scoreBps };
  assert.equal(judgeLocal(c, ok).pass, true);
  assert.equal(judgeLocal(c, { ...ok, outcomes: ["verified"] }).pass, false);
  assert.equal(judgeLocal(c, { ...ok, state: "Verified" }).pass, false);
  assert.equal(judgeLocal(c, { ...ok, mask: 0 }).pass, false);
  assert.equal(judgeLocal(c, { ...ok, charged: 600000n }).pass, false);
  assert.equal(judgeLocal(c, { ...ok, scoreBps: 5000 }).pass, false);
  assert.equal(judgeLocal(c, { ...ok, stopped: "refused: daily budget" }).pass, false);
  const h = LOCAL_CASES.honest;
  assert.equal(judgeLocal(h, { outcomes: h.outcomes, state: h.state, mask: 0, charged: h.charge, scoreBps: 5000, settledBps: 5000 }).pass, false);
});
