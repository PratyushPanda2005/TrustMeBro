import type { Party } from "./types"

/** Mirrors `TrustRegistry` and `DealMath`. The contract is always the source of truth. */
export const BPS = 10_000
export const MAX_ADVANCE_BPS = 9_000
export const MIN_SCORE_BPS = 4_000
export const VERIFY_PRICE = 0.3

const MIN_FEE = 2
const FEE_BPS = 100
const RISK_MIN_BPS = 200
const RISK_SPAN_BPS = 600

export const SHIPMENT_STATUS = [
  "None",
  "Booked",
  "Gated in",
  "Loaded",
  "Departed",
  "Arrived",
]

export type ScoreView = {
  label: "Trust Score" | "Risk Score"
  bps: number
  band: string
  tone: "good" | "neutral" | "bad"
}

/** Exporters: higher is better, and it sets the advance. */
export function exporterScoreView(trustBps: number): ScoreView {
  const tone =
    trustBps >= 7_500 ? "good" : trustBps >= MIN_SCORE_BPS ? "neutral" : "bad"
  return {
    label: "Trust Score",
    bps: trustBps,
    band: { good: "High", neutral: "Medium", bad: "Blocked" }[tone],
    tone,
  }
}

/** Importers: lower is better, and it's the investor's yield on the deal. */
export function importerScoreView(riskBps: number): ScoreView {
  const tone = riskBps <= 300 ? "good" : riskBps <= 500 ? "neutral" : "bad"
  return {
    label: "Risk Score",
    bps: riskBps,
    band: { good: "Low risk", neutral: "Medium risk", bad: "High risk" }[tone],
    tone,
  }
}

export const partyScoreView = (party: Party) =>
  party.role === "exporter"
    ? exporterScoreView(party.trustBps)
    : importerScoreView(party.riskBps)

/** For score history, which the contract records as trust. */
export const riskFromTrust = (trustBps: number) =>
  RISK_MIN_BPS + Math.round((RISK_SPAN_BPS * (BPS - trustBps)) / BPS)

export const advanceFor = (trustBps: number) =>
  trustBps < MIN_SCORE_BPS ? 0 : Math.min(trustBps, MAX_ADVANCE_BPS)

/** A preview of `quote()` for an invoice that doesn't exist yet. */
export function estimateTerms(
  amount: number,
  trustBps: number,
  riskBps: number,
) {
  const advanceBps = advanceFor(trustBps)
  const advance = (amount * advanceBps) / BPS
  const fee = Math.max((advance * FEE_BPS) / BPS, MIN_FEE)
  return {
    advanceBps,
    advance,
    fee,
    exporterNet: Math.max(advance - fee, 0),
    yieldBps: riskBps,
    investorDue: advance + (advance * riskBps) / BPS,
  }
}
