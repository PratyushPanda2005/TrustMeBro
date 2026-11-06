export type Role = "exporter" | "importer" | "investor" | "admin"

export type DealState =
  | "Created"
  | "Approved"
  | "Funding"
  | "Funded"
  | "Shipped"
  | "Released"
  | "Settled"
  | "Cancelled"
  | "Disputed"
  | "Expired"
  | "Defaulted"

/** Reputation counters, in basis points, as held by `TrustRegistry`. */
export type Rep = { r: number; s: number; a: number; b: number }

export type ScorePoint = {
  at: number
  dealId: string
  scoreBps: number
  reason: string
}

export type Party = {
  id: string
  name: string
  role: Exclude<Role, "admin">
  wallet: string
  rep: Rep
  history: ScorePoint[]
  /** Importers: the fixed Trust Code from onboarding. */
  trustCodeBps?: number
  /** Investors: allowed to buy and hold restricted deal tokens. */
  allowlisted?: boolean
}

export type Claims = {
  weight: boolean
  statusCode: boolean
  documents: boolean
}

/** What the mock verifier reports. Replaced by real data at integration. */
export type Scenario = "honest" | "fake-weight" | "fake-docs" | "overpriced"

export type Terms = {
  advanceBps: number
  yieldBps: number
  exporterScoreBps: number
  importerScoreBps: number
}

export type Position = {
  investorId: string
  amount: number
  /** Paid out on redeem or refund. */
  claimed?: number
}

export type TxRef = { chain: "whitechain" | "hedera"; hash: string }

export type DealEvent = {
  at: number
  label: string
  detail?: string
  tx?: TxRef
}

export type Waterfall = { investors: number; fee: number; exporter: number }

export type Deal = {
  id: string
  invoiceRef: string
  invoiceHash: string
  exporterId: string
  importerId: string
  goods: string
  amount: number
  createdAt: number
  dueAt: number
  state: DealState
  terms?: Terms
  /** USDT to raise: the advance. Set when terms are fixed. */
  target: number
  positions: Position[]
  claims?: Claims
  observed?: Claims
  scenario?: Scenario
  waterfall?: Waterfall
  releasedAt?: number
  settledAt?: number
  events: DealEvent[]
}

export type AuditKind = "quote" | "gate" | "payment" | "refusal" | "relay"

export type AuditEntry = {
  id: string
  at: number
  dealId: string
  kind: AuditKind
  message: string
  /** USDC moved, for payment entries. */
  amount?: number
  tx?: TxRef
  prevHash: string
  hash: string
}

/** A quote above the agent's limits, waiting on a human (PENDING_HUMAN). */
export type PendingApproval = {
  id: string
  dealId: string
  price: number
  at: number
}

export type SpendLimits = { perCall: number; perDeal: number; perDay: number }

export type TradeState = {
  parties: Party[]
  deals: Deal[]
  audit: AuditEntry[]
  pending: PendingApproval[]
  limits: SpendLimits
}
