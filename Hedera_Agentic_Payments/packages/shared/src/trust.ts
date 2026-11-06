/**
 * TrustMeBro Trust Score: reference implementation.
 *
 * This is the source of truth that the Solidity TrustRegistry must match
 * (lane C tests against vectors/trust.json, generated from this file).
 * All maths is integer basis points (10_000 = 100%), exactly like Solidity.
 *
 * Per deal, a weighted average of the three checks:
 *   match (claim == observed)          -> earns the factor weight
 *   falsified (claimed true, was false) -> penalty 2 × weight
 *   understated (claimed false, was true) -> neutral
 * Over time, a smoothed weighted average (Beta reputation, Jøsang & Ismail 2002):
 *   score = (r + a) / (r + s + a + b)
 * Honest deals only add to r and lies only add to s, so honest parties never drop
 * and only the falsifier drops.
 */

export const BPS = 10_000n;
export const W_WEIGHT = 4_000n;
export const W_STATUS = 2_500n;
export const W_DOCS = 3_500n;
export const FRAUD_MULT = 2n;

/** Exporter prior: a = b = 1.0, so new exporters start at 50%. */
export const EXPORTER_PRIOR = { a: 10_000n, b: 10_000n } as const;
/** Importer prior strength (a + b = 2.0); the fixed Trust Code sets the split. */
export const IMPORTER_PRIOR_STRENGTH = 20_000n;

/** Importer evidence per outcome. */
export const IMPORTER_ON_TIME = { r: 10_000n, s: 0n } as const;
export const IMPORTER_LATE = { r: 5_000n, s: 2_500n } as const;
export const IMPORTER_DEFAULT = { r: 0n, s: 30_000n } as const;

/** Score → terms mapping (clamped to scores 50%..90%). */
export const SCORE_FLOOR = 5_000n;
export const SCORE_CAP = 9_000n;
export const ADVANCE_MIN = 6_000n; // 60%
export const ADVANCE_SPAN = 3_000n; // up to 90%
export const YIELD_MAX = 500n; // 5%
export const YIELD_SPAN = 300n; // down to 2%

export interface Checks {
  weight: boolean;
  statusCode: boolean;
  documents: boolean;
}

export interface Rep {
  r: bigint; // good evidence (bps)
  s: bigint; // bad evidence (bps)
  a: bigint; // prior good (bps)
  b: bigint; // prior bad (bps)
}

export type ImporterOutcome = "onTime" | "late" | "default";

export function newExporterRep(): Rep {
  return { r: 0n, s: 0n, ...EXPORTER_PRIOR };
}

/** @param trustCodeBps fixed Trust Code at onboarding, e.g. 8000n = 80% */
export function newImporterRep(trustCodeBps: bigint): Rep {
  if (trustCodeBps < 0n || trustCodeBps > BPS) throw new RangeError("trust code must be 0..10000 bps");
  const a = (IMPORTER_PRIOR_STRENGTH * trustCodeBps) / BPS;
  return { r: 0n, s: 0n, a, b: IMPORTER_PRIOR_STRENGTH - a };
}

export function score(rep: Rep): bigint {
  return ((rep.r + rep.a) * BPS) / (rep.r + rep.s + rep.a + rep.b);
}

export interface DealOutcome {
  falsified: boolean;
  positive: bigint; // Σ weights of matched factors
  negative: bigint; // BPS + Σ 2·w of falsified factors, or 0
  falsifiedFactors: (keyof Checks)[];
}

const FACTORS: [keyof Checks, bigint][] = [
  ["weight", W_WEIGHT],
  ["statusCode", W_STATUS],
  ["documents", W_DOCS],
];

export function dealOutcome(claims: Checks, observed: Checks): DealOutcome {
  let positive = 0n;
  let penalty = 0n;
  const falsifiedFactors: (keyof Checks)[] = [];
  for (const [key, w] of FACTORS) {
    if (claims[key] === observed[key]) positive += w;
    else if (claims[key] && !observed[key]) {
      penalty += FRAUD_MULT * w;
      falsifiedFactors.push(key);
    }
  }
  const falsified = falsifiedFactors.length > 0;
  return falsified
    ? { falsified, positive: 0n, negative: BPS + penalty, falsifiedFactors }
    : { falsified, positive, negative: 0n, falsifiedFactors };
}

export function applyExporterOutcome(rep: Rep, claims: Checks, observed: Checks): Rep {
  const o = dealOutcome(claims, observed);
  return { ...rep, r: rep.r + o.positive, s: rep.s + o.negative };
}

export function applyImporterOutcome(rep: Rep, outcome: ImporterOutcome): Rep {
  const e = outcome === "onTime" ? IMPORTER_ON_TIME : outcome === "late" ? IMPORTER_LATE : IMPORTER_DEFAULT;
  return { ...rep, r: rep.r + e.r, s: rep.s + e.s };
}

const clamp = (x: bigint, lo: bigint, hi: bigint) => (x < lo ? lo : x > hi ? hi : x);

/** Exporter score sets the advance; importer score sets investor yield. */
export function terms(exporterScore: bigint, importerScore: bigint): { advanceBps: bigint; yieldBps: bigint } {
  const range = SCORE_CAP - SCORE_FLOOR;
  const e = clamp(exporterScore, SCORE_FLOOR, SCORE_CAP) - SCORE_FLOOR;
  const i = clamp(importerScore, SCORE_FLOOR, SCORE_CAP) - SCORE_FLOOR;
  return {
    advanceBps: ADVANCE_MIN + (e * ADVANCE_SPAN) / range,
    yieldBps: YIELD_MAX - (i * YIELD_SPAN) / range,
  };
}

export interface Waterfall {
  advance: bigint; // paid to exporter at release
  investors: bigint; // principal + yield, paid first at settlement
  fee: bigint; // platform fee, paid second
  exporterRemainder: bigint; // rest to exporter
}

/** Settlement split when the importer pays the full invoice. Amounts in token atomic units. */
export function waterfall(p: { invoice: bigint; advanceBps: bigint; yieldBps: bigint; fee: bigint }): Waterfall {
  const advance = (p.invoice * p.advanceBps) / BPS;
  const investors = advance + (advance * p.yieldBps) / BPS;
  if (investors + p.fee > p.invoice) throw new RangeError("invoice does not cover investors + fee");
  return { advance, investors, fee: p.fee, exporterRemainder: p.invoice - investors - p.fee };
}
