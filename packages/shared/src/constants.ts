// Mirrors contracts/src/interfaces/ITradeDeals.sol. Keep in sync.

// Not the bridged USDT.e (0xaa79...8f46) shown in the Whitechain docs token list.
export const USDT_ADDRESS = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7" as const
export const USDT_DECIMALS = 6

export const Role = { None: 0, Exporter: 1, Importer: 2, Investor: 3 } as const
export type Role = (typeof Role)[keyof typeof Role]

export const DealState = {
  None: 0,
  Created: 1,
  Approved: 2,
  Claimed: 3,
  Pending: 4,
  Verified: 5,
  Funded: 6,
  Settled: 7,
  Rejected: 8,
  Mismatch: 9,
  Defaulted: 10,
  Expired: 11,
  Cancelled: 12,
} as const
export type DealState = (typeof DealState)[keyof typeof DealState]

export const DEAL_STATE_NAMES = [
  "None",
  "Created",
  "Approved",
  "Claimed",
  "Pending",
  "Verified",
  "Funded",
  "Settled",
  "Rejected",
  "Mismatch",
  "Defaulted",
  "Expired",
  "Cancelled",
] as const

export const Outcome = { Verified: 0, Pending: 1, Falsified: 2, Mismatch: 3 } as const
export type Outcome = (typeof Outcome)[keyof typeof Outcome]

/** A claim must be at least LOADED. */
export const ShipmentStatus = {
  NONE: 0,
  BOOKED: 1,
  GATED_IN: 2,
  LOADED: 3,
  DEPARTED: 4,
  ARRIVED: 5,
} as const
export type ShipmentStatus = (typeof ShipmentStatus)[keyof typeof ShipmentStatus]

/** Bits of Deal.falsifiedMask. */
export const Falsified = { Weight: 1, Documents: 2, Status: 4 } as const

export const BPS = 10_000 // 100%
export const MAX_ADVANCE_BPS = 9_000
export const MIN_SCORE_BPS = 4_000
export const TOLERANCE_BPS = 300

/** 6667 → "66.67%" */
export const formatBps = (bps: bigint | number) => `${(Number(bps) / 100).toFixed(2)}%`
