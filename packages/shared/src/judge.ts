// TypeScript mirror of TradeDeals._judge. The contract is the judge; this only predicts its answer so the
// agent can pre-check and the dashboard can explain the result. Keep in sync with TradeDeals.sol.

import { Falsified, Outcome } from "./constants"
import type { Hex } from "./eip712"

export const WEIGHT_TOLERANCE_BPS = 300 // ±3%

export type ClaimFacts = {
  declaredKg: number
  claimedStatus: number
  docHash: Hex
  verifyDeadline: bigint
}

export type ObservedFacts = {
  observedKg: number
  statusCode: number
  docHash: Hex
  observedAt: bigint
}

export type Judgement = {
  outcome: Outcome
  falsifiedMask: number // Falsified.Weight | Falsified.Documents | Falsified.Status
}

/** Accepted weight range, inclusive, with the contract's rounding. */
export function weightWindow(declaredKg: number): { lo: number; hi: number } {
  return {
    lo: Math.floor((declaredKg * (10_000 - WEIGHT_TOLERANCE_BPS)) / 10_000),
    hi: Math.floor((declaredKg * (10_000 + WEIGHT_TOLERANCE_BPS)) / 10_000),
  }
}

export function judge(claim: ClaimFacts, observed: ObservedFacts): Judgement {
  const { lo, hi } = weightWindow(claim.declaredKg)
  const statusBehind = observed.statusCode < claim.claimedStatus

  let mask = 0
  if (observed.observedKg < lo) mask |= Falsified.Weight
  if (observed.docHash.toLowerCase() !== claim.docHash.toLowerCase()) mask |= Falsified.Documents
  if (statusBehind && observed.observedAt > claim.verifyDeadline) mask |= Falsified.Status

  if (mask !== 0) return { outcome: Outcome.Falsified, falsifiedMask: mask }
  if (statusBehind) return { outcome: Outcome.Pending, falsifiedMask: 0 }
  if (observed.observedKg > hi) return { outcome: Outcome.Mismatch, falsifiedMask: 0 }
  return { outcome: Outcome.Verified, falsifiedMask: 0 }
}

export const OUTCOME_NAMES = ["Verified", "Pending", "Falsified", "Mismatch"] as const

export const SHIPMENT_STATUS_NAMES = ["NONE", "BOOKED", "GATED_IN", "LOADED", "DEPARTED", "ARRIVED"] as const
