/**
 * Finance V2's source isn't in this repository, so these mirror what its live
 * trades show. `quote()` on the contract is always the source of truth.
 */
export const STAGES = ["None", "Dispatched", "In transit", "Delivered"]
export const VERIFY_PRICE = 0.3

/** The importer reputation every new importer starts at, and its ceiling. */
export const START_SCORE = 60
export const MAX_SCORE = 93

export type ScoreView = {
  value: number
  band: string
  tone: "good" | "neutral" | "bad"
}

/** The importer's Trust Score. Higher is better, and it sets the advance. */
export function trustScoreView(score: number): ScoreView {
  const tone = score >= 75 ? "good" : score >= 50 ? "neutral" : "bad"
  return {
    value: score,
    band: { good: "High", neutral: "Medium", bad: "Low" }[tone],
    tone,
  }
}

const UNIT = 1_000_000

/**
 * A preview at a given Trust Score. It rounds down in token units as the
 * contract does, and the contract's own quote replaces it.
 */
export function estimateTerms(amount: number, score: number) {
  const invoice = Math.round(amount * UNIT)
  const base = Math.floor((invoice * 97) / 100)
  const advance = Math.floor((base * score) / 100)
  const profit = Math.floor((advance * 3) / 100)
  const fee = Math.floor(invoice / 100)
  const investorDue = advance + profit
  return {
    advance: advance / UNIT,
    profit: profit / UNIT,
    fee: fee / UNIT,
    investorDue: investorDue / UNIT,
    exporterRemainder: Math.max(invoice - investorDue - fee, 0) / UNIT,
  }
}
