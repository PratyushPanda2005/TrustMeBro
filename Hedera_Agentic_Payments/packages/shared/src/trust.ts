/**
 * TrustMeBro scores and money maths, plan v5 (docs/plans/TMB-00-master-plan.md §4–6).
 *
 * A line-for-line TypeScript mirror of lane C's contracts, which are the reference
 * implementation: TrustRegistry (trust, advanceBps, riskBps), TradeDeals (_judge,
 * _scoreSettlement, onboarding priors, creditLimit) and libraries/DealMath (quote,
 * waterfall, latePenalty). Integer basis points (10_000 = 100%) and integer token units,
 * with the same rounding as Solidity, so the dashboard and the agent show exactly what
 * the chain will do.
 *
 * Score = (r + A) / (r + s + A + B), rounded to the nearest bps (Beta reputation).
 * Honest events only add to r, lies and defaults only to s: the v5 score rule holds by maths.
 */

export const BPS = 10_000n;

// Checks and their weights (§4)
export const W_WEIGHT = 4_000n;
export const W_DOCS = 3_500n;
export const W_STATUS = 2_500n;
export const TOLERANCE_BPS = 300n; // ±3% weight tolerance

/** Carrier status codes, ordinal (§4). A claim must be ≥ LOADED. */
export const STATUS = { NONE: 0, BOOKED: 1, GATED_IN: 2, LOADED: 3, DEPARTED: 4, ARRIVED: 5 } as const;
export type StatusCode = (typeof STATUS)[keyof typeof STATUS];

/** Bits of Deal.falsifiedMask. */
export const FALSIFIED = { WEIGHT: 1, DOCS: 2, STATUS: 4 } as const;

// Evidence (§5.2, §5.5)
export const EVIDENCE_UNIT = 10_000n; // one deal of evidence
export const LATE_GOOD = 5_000n;
export const LATE_BAD_MAX = 5_000n;
export const DEFAULT_BAD = 30_000n;
export const EXPORTER_PRIOR = 10_000n; // A = B → 50%
export const IMPORTER_PRIOR_STRENGTH = 20_000n; // A + B
export const DEFAULT_IMPORTER_TRUST_BPS = 6_667n; // → 4.00% risk

// Terms (§5.3, §5.5)
export const MAX_ADVANCE_BPS = 9_000n;
export const MIN_SCORE_BPS = 4_000n; // below: exporter blocked
export const RISK_MIN_BPS = 200n; // risk = 2% + 6% × (1 − trust)
export const RISK_SPAN_BPS = 600n;

// Fees (§6)
export const FEE_BPS = 100n; // 1% of the advance
export const RESERVE_BPS = 2_000n; // 20% of the fee left after agent + gas

export interface Rep {
  r: bigint; // good evidence
  s: bigint; // bad evidence
  a: bigint; // prior good
  b: bigint; // prior bad
}

const divRound = (x: bigint, y: bigint) => (x + y / 2n) / y;

export function newExporterRep(): Rep {
  return { r: 0n, s: 0n, a: EXPORTER_PRIOR, b: EXPORTER_PRIOR };
}

/** Importer onboarding with a starting trust (default 66.67%), as TradeDeals._setKyc does it. */
export function newImporterRep(startTrustBps: bigint = DEFAULT_IMPORTER_TRUST_BPS): Rep {
  if (startTrustBps <= 0n || startTrustBps >= BPS) throw new RangeError(`start trust ${startTrustBps} bps out of range`);
  const a = (IMPORTER_PRIOR_STRENGTH * startTrustBps) / BPS;
  return { r: 0n, s: 0n, a, b: IMPORTER_PRIOR_STRENGTH - a };
}

/** TrustRegistry.trust: score in bps, rounded to nearest. */
export function trust(rep: Rep): bigint {
  const total = rep.r + rep.s + rep.a + rep.b;
  if (total === 0n) return 0n;
  return divRound((rep.r + rep.a) * BPS, total);
}

/** TrustRegistry.advanceBps: the exporter's score capped at 90%; 0 = blocked (below 40%). */
export function advanceBps(exporter: Rep): bigint {
  const t = trust(exporter);
  if (t < MIN_SCORE_BPS) return 0n;
  return t > MAX_ADVANCE_BPS ? MAX_ADVANCE_BPS : t;
}

/** TrustRegistry.riskBps: investor yield for the deal, 2%..8%. */
export function riskBps(importer: Rep): bigint {
  const total = importer.r + importer.s + importer.a + importer.b;
  if (total === 0n) return RISK_MIN_BPS + RISK_SPAN_BPS;
  return RISK_MIN_BPS + divRound(RISK_SPAN_BPS * (importer.s + importer.b), total);
}

/** What the exporter declared on chain (declareClaims) plus the deal's verification deadline. */
export interface Claim {
  declaredKg: number;
  claimedStatus: number;
  docHash: string;
  verifyDeadline: bigint; // unix seconds
}

/** What the verifier observed (the signed Verification, minus dealId / nonce / expiry). */
export interface Observation {
  observedKg: number;
  statusCode: number;
  docHash: string;
  observedAt: bigint; // unix seconds
}

export type Outcome = "Verified" | "Pending" | "Falsified" | "Mismatch";

/** TradeDeals._judge: compares claims with observed facts. Falsified carries the exporter's penalty. */
export function judge(c: Claim, o: Observation): { outcome: Outcome; mask: number; penalty: bigint } {
  const declared = BigInt(c.declaredKg);
  const lo = (declared * (BPS - TOLERANCE_BPS)) / BPS;
  const hi = (declared * (BPS + TOLERANCE_BPS)) / BPS;
  const kg = BigInt(o.observedKg);

  let mask = 0;
  let extra = 0n;
  if (kg < lo) {
    mask |= FALSIFIED.WEIGHT; // fewer goods than claimed
    extra += 2n * W_WEIGHT;
  }
  if (o.docHash.toLowerCase() !== c.docHash.toLowerCase()) {
    mask |= FALSIFIED.DOCS;
    extra += 2n * W_DOCS;
  }
  const statusBehind = o.statusCode < c.claimedStatus;
  if (statusBehind && o.observedAt > c.verifyDeadline) {
    mask |= FALSIFIED.STATUS; // still not reached after the deadline
    extra += 2n * W_STATUS;
  }
  if (mask !== 0) return { outcome: "Falsified", mask, penalty: EVIDENCE_UNIT + extra };
  if (statusBehind) return { outcome: "Pending", mask: 0, penalty: 0n }; // tracking lag: recheck
  if (kg > hi) return { outcome: "Mismatch", mask: 0, penalty: 0n }; // under-declared: no penalty
  return { outcome: "Verified", mask: 0, penalty: 0n }; // credit comes at settlement
}

/** Penalty for a falsifiedMask: 10,000 + 2 × the weights of the falsified checks. */
export function falsifiedPenalty(mask: number): bigint {
  let extra = 0n;
  if (mask & FALSIFIED.WEIGHT) extra += 2n * W_WEIGHT;
  if (mask & FALSIFIED.DOCS) extra += 2n * W_DOCS;
  if (mask & FALSIFIED.STATUS) extra += 2n * W_STATUS;
  return EVIDENCE_UNIT + extra;
}

export function applyFalsified(exporter: Rep, mask: number): Rep {
  return { ...exporter, s: exporter.s + falsifiedPenalty(mask) };
}

/** Honest deal completed (Settled): the exporter's only positive credit. */
export function applySettledExporter(exporter: Rep): Rep {
  return { ...exporter, r: exporter.r + EVIDENCE_UNIT };
}

/** DealMath.latePenalty */
export function latePenalty(lateBy: bigint, grace: bigint, maxPenalty: bigint = LATE_BAD_MAX): bigint {
  if (lateBy >= grace) return maxPenalty;
  return (maxPenalty * lateBy) / grace;
}

export type ImporterPayment = "onTime" | "late" | "default";

/** TradeDeals._scoreSettlement (importer side) and markDefault. `late` needs lateBy and grace in the same unit. */
export function applyImporterPayment(importer: Rep, how: ImporterPayment, late?: { lateBy: bigint; grace: bigint }): Rep {
  if (how === "onTime") return { ...importer, r: importer.r + EVIDENCE_UNIT };
  if (how === "default") return { ...importer, s: importer.s + DEFAULT_BAD };
  if (!late) throw new Error("late payment needs lateBy and grace");
  return { ...importer, r: importer.r + LATE_GOOD, s: importer.s + latePenalty(late.lateBy, late.grace) };
}

/** TradeDeals.creditLimit: max invoice = 200 USDT + 2 × settled volume (§5.4). */
export function creditLimit(settledVolume: bigint, unit: bigint): bigint {
  return 200n * unit + 2n * settledVolume;
}

export interface FeeConfig {
  minFee: bigint;
  agentFee: bigint;
  gasFee: bigint;
}

/** TradeDeals constructor fee defaults for a token with `unit` = 10^decimals: min 2, agent 1, gas 0.50. */
export function feeConfig(unit: bigint): FeeConfig {
  return { minFee: 2n * unit, agentFee: unit, gasFee: unit / 2n };
}

export interface Quote {
  advanceBps: bigint;
  advance: bigint; // investor pays
  fee: bigint;
  agentFee: bigint;
  gasFee: bigint;
  reserveFee: bigint;
  platformFee: bigint;
  exporterNet: bigint; // advance − fee
  yieldBps: bigint;
  yieldAmount: bigint;
  investorDue: bigint; // advance + yield
}

/** DealMath.quote: terms frozen at funding (§6.1). */
export function quote(amount: bigint, advBps: bigint, yieldBps: bigint, cfg: FeeConfig): Quote {
  const advance = (amount * advBps) / BPS;
  let fee = (advance * FEE_BPS) / BPS;
  if (fee < cfg.minFee) fee = cfg.minFee;
  const rest = fee - cfg.agentFee - cfg.gasFee;
  const reserveFee = (rest * RESERVE_BPS) / BPS;
  const yieldAmount = (advance * yieldBps) / BPS;
  return {
    advanceBps: advBps,
    advance,
    fee,
    agentFee: cfg.agentFee,
    gasFee: cfg.gasFee,
    reserveFee,
    platformFee: rest - reserveFee,
    exporterNet: advance > fee ? advance - fee : 0n,
    yieldBps,
    yieldAmount,
    investorDue: advance + yieldAmount,
  };
}

/** DealMath.waterfall: investor first, exporter gets the rest (§6.2). Partial payments follow the same order. */
export function waterfall(payment: bigint, investorOwed: bigint): { toInvestor: bigint; toExporter: bigint } {
  const toInvestor = payment < investorOwed ? payment : investorOwed;
  return { toInvestor, toExporter: payment - toInvestor };
}
