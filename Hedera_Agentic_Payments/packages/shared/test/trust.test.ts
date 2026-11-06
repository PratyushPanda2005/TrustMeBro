import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newExporterRep, newImporterRep, score, applyExporterOutcome, applyImporterOutcome,
  dealOutcome, terms, waterfall,
} from "../src/trust.ts";

const ALL_TRUE = { weight: true, statusCode: true, documents: true };

test("a new exporter starts at 50.00%", () => {
  assert.equal(score(newExporterRep()), 5000n);
});

test("importer starts from its fixed Trust Code", () => {
  assert.equal(score(newImporterRep(8000n)), 8000n);
  assert.equal(score(newImporterRep(6000n)), 6000n);
});

test("honest exporter climbs 66.66 → 75 → 80 → 83.33 → 85.71", () => {
  let rep = newExporterRep();
  const seen: bigint[] = [];
  for (let i = 0; i < 5; i++) {
    rep = applyExporterOutcome(rep, ALL_TRUE, ALL_TRUE);
    seen.push(score(rep));
  }
  assert.deepEqual(seen, [6666n, 7500n, 8000n, 8333n, 8571n]);
});

test("faking the weight claim from new drops the exporter to 26.31%", () => {
  const rep = applyExporterOutcome(newExporterRep(), ALL_TRUE, { ...ALL_TRUE, weight: false });
  assert.equal(score(rep), 2631n);
});

test("faking only the status claim drops to 28.57%", () => {
  const rep = applyExporterOutcome(newExporterRep(), ALL_TRUE, { ...ALL_TRUE, statusCode: false });
  assert.equal(score(rep), 2857n);
});

test("a veteran (5 honest deals) who fakes weight falls 85.71 → 68.18", () => {
  let rep = newExporterRep();
  for (let i = 0; i < 5; i++) rep = applyExporterOutcome(rep, ALL_TRUE, ALL_TRUE);
  rep = applyExporterOutcome(rep, ALL_TRUE, { ...ALL_TRUE, weight: false });
  assert.equal(score(rep), 6818n);
});

test("understating a claim (said false, was true) is neutral", () => {
  const o = dealOutcome({ ...ALL_TRUE, documents: false }, ALL_TRUE);
  assert.equal(o.falsified, false);
  assert.equal(o.positive, 6500n); // weight 4000 + status 2500, docs earns nothing
  assert.equal(o.negative, 0n);
});

test("a falsified deal adds 1.0 + 2·w per faked factor to bad evidence only", () => {
  const o = dealOutcome(ALL_TRUE, { weight: false, statusCode: true, documents: false });
  assert.equal(o.falsified, true);
  assert.equal(o.positive, 0n);
  assert.equal(o.negative, 10000n + 8000n + 7000n);
});

test("rule: an honest deal never lowers a score; a lie never raises it", () => {
  const imperfectHonest = { weight: true, statusCode: false, documents: true }; // understated status
  let rep = newExporterRep();
  for (let i = 0; i < 3; i++) rep = applyExporterOutcome(rep, ALL_TRUE, ALL_TRUE);
  const before = score(rep);
  const afterHonest = score(applyExporterOutcome(rep, imperfectHonest, ALL_TRUE));
  assert.ok(afterHonest >= before, `honest ${afterHonest} < ${before}`);
  const liar = applyExporterOutcome(newExporterRep(), ALL_TRUE, { ...ALL_TRUE, documents: false });
  const afterLie = score(applyExporterOutcome(liar, ALL_TRUE, { ...ALL_TRUE, weight: false }));
  assert.ok(afterLie < score(liar));
});

test("importer: on time rises, late is mixed, default drops hard", () => {
  const base = newImporterRep(8000n);
  assert.ok(score(applyImporterOutcome(base, "onTime")) > 8000n);
  assert.equal(score(applyImporterOutcome(base, "default")), 3200n); // 16000/50000
  const late = applyImporterOutcome(base, "late");
  assert.equal(late.r, 5000n);
  assert.equal(late.s, 2500n);
});

test("terms: linear between scores 50% and 90%, clamped", () => {
  assert.deepEqual(terms(5000n, 5000n), { advanceBps: 6000n, yieldBps: 500n });
  assert.deepEqual(terms(1000n, 1000n), { advanceBps: 6000n, yieldBps: 500n });
  assert.deepEqual(terms(9500n, 9500n), { advanceBps: 9000n, yieldBps: 200n });
  assert.deepEqual(terms(8000n, 8000n), { advanceBps: 8250n, yieldBps: 275n });
  assert.deepEqual(terms(6666n, 5000n).advanceBps, 7249n);
});

test("waterfall: new exporter + importer at 80% on a 30,000 invoice", () => {
  const usdt = (n: number) => BigInt(n) * 1_000_000n; // 6 decimals
  const t = terms(5000n, 8000n);
  const w = waterfall({ invoice: usdt(30000), advanceBps: t.advanceBps, yieldBps: t.yieldBps, fee: usdt(150) });
  assert.equal(w.advance, usdt(18000));
  assert.equal(w.investors, usdt(18495));
  assert.equal(w.fee, usdt(150));
  assert.equal(w.exporterRemainder, usdt(11355));
  assert.equal(w.investors + w.fee + w.exporterRemainder, usdt(30000));
});

test("waterfall: veteran pair matches the TrustMeBro PDF example", () => {
  const usdt = (n: number) => BigInt(n) * 1_000_000n;
  const w = waterfall({ invoice: usdt(30000), advanceBps: 9000n, yieldBps: 200n, fee: usdt(150) });
  assert.equal(w.advance, usdt(27000));
  assert.equal(w.investors, usdt(27540));
  assert.equal(w.exporterRemainder, usdt(2310));
});
