import type { Party } from "./types"

/**
 * Finance V2's source isn't in this repository, so these mirror what its live
 * trades show. `quote()` on the contract is always the source of truth.
 */
export const STAGES = ["None", "Dispatched", "In transit", "Delivered"]
const HAIRCUT = 0.97
const YIELD = 0.03
const FEE = 0.01

export const VERIFY_PRICE = 0.3

export type ScoreView = {
  label: "Trust Score" | "Risk Score"
  value: number
  band: string
  tone: "good" | "neutral" | "bad"
}

/** Exporters: higher is better. */
export function exporterScoreView(score: number): ScoreView {
  const tone = score >= 75 ? "good" : score >= 40 ? "neutral" : "bad"
  return {
    label: "Trust Score",
    value: score,
    band: { good: "High", neutral: "Medium", bad: "Low" }[tone],
    tone,
  }
}

/** Importers: lower is better, as the inverse of the contract's score. */
export function importerScoreView(score: number): ScoreView {
  const value = 100 - score
  const tone = value <= 25 ? "good" : value <= 50 ? "neutral" : "bad"
  return {
    label: "Risk Score",
    value,
    band: { good: "Low risk", neutral: "Medium risk", bad: "High risk" }[tone],
    tone,
  }
}

export const partyScoreView = (party: Party) =>
  party.role === "exporter"
    ? exporterScoreView(party.score)
    : importerScoreView(party.score)

/** A preview at a given deal score. The contract's own quote replaces it. */
export function estimateTerms(amount: number, score: number) {
  const advance = amount * (score / 100) * HAIRCUT
  const profit = advance * YIELD
  const fee = amount * FEE
  const investorDue = advance + profit
  return {
    advance,
    profit,
    fee,
    investorDue,
    exporterRemainder: Math.max(amount - investorDue - fee, 0),
  }
}
