import type { Claims, Party, Rep, Terms } from "./types"

/** TypeScript mirror of the Solidity in master plan §4.5. Integer basis points. */
export const BPS = 10_000
export const W_WEIGHT = 4_000
export const W_STATUS = 2_500
export const W_DOCS = 3_500

/** Assumption: the plan's 150 USDT fee on 30,000 USDT, as a rate. */
export const PLATFORM_FEE_BPS = 50

export const VERIFY_PRICE = 0.3

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value))

export const exporterPrior = (): Rep => ({ r: 0, s: 0, a: BPS, b: BPS })

export const importerPrior = (trustCodeBps: number): Rep => ({
  r: 0,
  s: 0,
  a: 2 * trustCodeBps,
  b: 2 * (BPS - trustCodeBps),
})

export function scoreBps({ r, s, a, b }: Rep) {
  return Math.floor(((r + a) * BPS) / (r + s + a + b))
}

export function dealTerms(exporterScore: number, importerScore: number): Terms {
  const e = clamp(exporterScore, 5_000, 9_000)
  const i = clamp(importerScore, 5_000, 9_000)
  return {
    advanceBps: 6_000 + Math.floor(((e - 5_000) * 3_000) / 4_000),
    yieldBps: 500 - Math.floor(((i - 5_000) * 300) / 4_000),
    exporterScoreBps: exporterScore,
    importerScoreBps: importerScore,
  }
}

const factor = (claim: boolean, seen: boolean, weight: number) => {
  if (claim === seen) return { pos: weight, neg: 0 }
  if (claim && !seen) return { pos: 0, neg: 2 * weight }
  return { pos: 0, neg: 0 }
}

/** Compares claims with the observed result, per master plan §4.1. */
export function compareClaims(claims: Claims, seen: Claims) {
  const parts = [
    factor(claims.weight, seen.weight, W_WEIGHT),
    factor(claims.statusCode, seen.statusCode, W_STATUS),
    factor(claims.documents, seen.documents, W_DOCS),
  ]
  const neg = parts.reduce((sum, part) => sum + part.neg, 0)
  const pos = parts.reduce((sum, part) => sum + part.pos, 0)
  return { falsified: neg > 0, pos, neg }
}

/**
 * Exporters see a Risk Score: the inverse of the contract's score, so lower is
 * safer. This is the one place that defines the conversion.
 */
export const riskBps = (trustBps: number) => BPS - trustBps

export type ScoreView = {
  label: "Risk Score" | "Trust Score"
  bps: number
  band: string
  tone: "good" | "neutral" | "bad"
}

const band = (trustBps: number) =>
  trustBps >= 7_500 ? "good" : trustBps > 5_000 ? "neutral" : "bad"

export function exporterScoreView(trustBps: number): ScoreView {
  const tone = band(trustBps)
  return {
    label: "Risk Score",
    bps: riskBps(trustBps),
    band: { good: "Low risk", neutral: "Medium risk", bad: "High risk" }[tone],
    tone,
  }
}

export function importerScoreView(trustBps: number): ScoreView {
  const tone = band(trustBps)
  return {
    label: "Trust Score",
    bps: trustBps,
    band: { good: "High", neutral: "Medium", bad: "Low" }[tone],
    tone,
  }
}

export const partyScoreView = (party: Party) =>
  party.role === "exporter"
    ? exporterScoreView(scoreBps(party.rep))
    : importerScoreView(scoreBps(party.rep))
