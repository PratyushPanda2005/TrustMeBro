/**
 * Generates vectors/trust.json from the TS mirror (src/trust.ts) of plan v5 §4–6.
 * Lane C's Foundry tests and the dashboard can check every value against it.
 * Run: pnpm --filter @tmb/shared vectors
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STATUS, newExporterRep, newImporterRep, trust, advanceBps, riskBps, judge, applyFalsified, applySettledExporter,
  applyImporterPayment, quote, waterfall, creditLimit, feeConfig, type Rep, type ImporterPayment,
} from "../src/trust.ts";

const s = (x: bigint) => x.toString();
const repJson = (r: Rep) => ({ r: s(r.r), s: s(r.s), a: s(r.a), b: s(r.b) });
const UNIT = 1_000_000n; // 6-decimal USDT

type ExporterEvent = "settled" | { falsified: number };
const exporterSequences: Record<string, ExporterEvent[]> = {
  "five honest settled deals": Array(5).fill("settled"),
  "eight honest settled deals (cap)": Array(8).fill("settled"),
  "fake weight from new": [{ falsified: 1 }],
  "fake docs from new": [{ falsified: 2 }],
  "fake status from new": [{ falsified: 4 }],
  "fake all three from new": [{ falsified: 7 }],
  "five honest then fake weight": [...Array(5).fill("settled"), { falsified: 1 }],
};

const exporter = Object.entries(exporterSequences).map(([name, events]) => {
  let rep = newExporterRep();
  const steps = events.map((e) => {
    rep = e === "settled" ? applySettledExporter(rep) : applyFalsified(rep, e.falsified);
    return { event: e, rep: repJson(rep), trust: s(trust(rep)), advanceBps: s(advanceBps(rep)) };
  });
  return { name, start: { rep: repJson(newExporterRep()), trust: s(trust(newExporterRep())) }, steps };
});

const importerSequences: Record<string, { startTrustBps: bigint; events: [ImporterPayment, { lateBy: bigint; grace: bigint }?][] }> = {
  "new importer": { startTrustBps: 6_667n, events: [] },
  "one on-time payment": { startTrustBps: 6_667n, events: [["onTime"]] },
  "three on-time payments": { startTrustBps: 6_667n, events: [["onTime"], ["onTime"], ["onTime"]] },
  "30 days late, grace 30": { startTrustBps: 6_667n, events: [["late", { lateBy: 30n, grace: 30n }]] },
  "15 days late, grace 30": { startTrustBps: 6_667n, events: [["late", { lateBy: 15n, grace: 30n }]] },
  "default from the start": { startTrustBps: 6_667n, events: [["default"]] },
};

const importer = Object.entries(importerSequences).map(([name, seq]) => {
  let rep = newImporterRep(seq.startTrustBps);
  const start = { rep: repJson(rep), trust: s(trust(rep)), riskBps: s(riskBps(rep)) };
  const steps = seq.events.map(([how, late]) => {
    rep = applyImporterPayment(rep, how, late);
    return { event: how, late: late && { lateBy: s(late.lateBy), grace: s(late.grace) }, rep: repJson(rep), trust: s(trust(rep)), riskBps: s(riskBps(rep)) };
  });
  return { name, startTrustBps: s(seq.startTrustBps), start, steps };
});

const DOC_A = "0x" + "aa".repeat(32);
const DOC_B = "0x" + "bb".repeat(32);
const claim = { declaredKg: 10_000, claimedStatus: STATUS.LOADED, docHash: DOC_A, verifyDeadline: 1_000n };
const checks = [
  { name: "honest", claim, observed: { observedKg: 9_850, statusCode: STATUS.DEPARTED, docHash: DOC_A, observedAt: 500n } },
  { name: "tracking lag", claim, observed: { observedKg: 10_020, statusCode: STATUS.GATED_IN, docHash: DOC_A, observedAt: 500n } },
  { name: "short shipment", claim, observed: { observedKg: 8_020, statusCode: STATUS.LOADED, docHash: DOC_A, observedAt: 500n } },
  { name: "fake documents", claim, observed: { observedKg: 10_000, statusCode: STATUS.LOADED, docHash: DOC_B, observedAt: 500n } },
  { name: "under-declared", claim: { ...claim, declaredKg: 9_000 }, observed: { observedKg: 10_000, statusCode: STATUS.LOADED, docHash: DOC_A, observedAt: 500n } },
  { name: "status still behind after deadline", claim, observed: { observedKg: 10_000, statusCode: STATUS.GATED_IN, docHash: DOC_A, observedAt: 1_001n } },
].map(({ name, claim, observed }) => {
  const r = judge(claim, observed);
  return {
    name,
    claim: { ...claim, verifyDeadline: s(claim.verifyDeadline) },
    observed: { ...observed, observedAt: s(observed.observedAt) },
    outcome: r.outcome, falsifiedMask: r.mask, penalty: s(r.penalty),
  };
});

const quotes = [
  { name: "§6.3 100,000 at 70% / 4%", amount: 100_000n * UNIT, advBps: 7_000n, yieldBps: 400n, pay: 100_000n * UNIT },
  { name: "§6.4 new pair 50% / 4%", amount: 100_000n * UNIT, advBps: 5_000n, yieldBps: 400n, pay: 100_000n * UNIT },
  { name: "§6.4 veteran 90% / 2.80%", amount: 100_000n * UNIT, advBps: 9_000n, yieldBps: 280n, pay: 100_000n * UNIT },
  { name: "§6.4 partial 60,000", amount: 100_000n * UNIT, advBps: 7_000n, yieldBps: 400n, pay: 60_000n * UNIT },
  { name: "§6.5 demo 100 at 50% / 4%", amount: 100n * UNIT, advBps: 5_000n, yieldBps: 400n, pay: 100n * UNIT },
  { name: "§6.5 demo 100 at 80% / 2.80%", amount: 100n * UNIT, advBps: 8_000n, yieldBps: 280n, pay: 100n * UNIT },
].map((c) => {
  const q = quote(c.amount, c.advBps, c.yieldBps, feeConfig(UNIT));
  const w = waterfall(c.pay, q.investorDue);
  return {
    name: c.name, amount: s(c.amount), advanceBps: s(c.advBps), yieldBps: s(c.yieldBps),
    quote: Object.fromEntries(Object.entries(q).map(([k, v]) => [k, s(v)])),
    payment: s(c.pay), toInvestor: s(w.toInvestor), toExporter: s(w.toExporter),
  };
});

const out = {
  version: 5,
  note: "Generated by packages/shared/scripts/gen-vectors.ts from plan v5 §4–6 (mirrors lane C's TrustRegistry, TradeDeals._judge and DealMath). Do not edit by hand.",
  units: { bps: "10000 = 100%", token: "6 decimals (1 USDT = 1000000)" },
  exporter,
  importer,
  checks,
  quotes,
  creditLimit: [0n, 100n * UNIT, 50_000n * UNIT].map((v) => ({ settledVolume: s(v), limit: s(creditLimit(v, UNIT)) })),
};

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "vectors", "trust.json");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${file}`);
