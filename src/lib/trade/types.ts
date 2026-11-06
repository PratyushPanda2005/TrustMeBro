export type Role = "exporter" | "importer" | "investor" | "admin"

/** Mirrors `ITradeDeals.State`. */
export type DealState =
  | "Created"
  | "Approved"
  | "Claimed"
  | "Pending"
  | "Verified"
  | "Funded"
  | "Settled"
  | "Rejected"
  | "Mismatch"
  | "Defaulted"
  | "Expired"
  | "Cancelled"

/** Reputation counters, in basis points, as held by `TrustRegistry`. */
export type Rep = { r: number; s: number; a: number; b: number }

export type ScorePoint = {
  at: number
  dealId: string
  scoreBps: number
  reason: string
}

export type Party = {
  /** The wallet address. */
  id: string
  name: string
  role: Exclude<Role, "admin">
  rep: Rep
  trustBps: number
  /** Importers: the investor's yield on a new deal. */
  riskBps: number
  /** Exporters: 0 means blocked for scoring below 40%. */
  advanceBps: number
  creditLimit: number
  availableCredit: number
  history: ScorePoint[]
}

export type TxRef = { chain: "whitechain" | "hedera"; hash: string }

export type DealEvent = {
  at: number
  label: string
  detail?: string
  tx?: TxRef
}

/** From `quote()` until funding, then frozen from the `Funded` event. */
export type Terms = {
  advanceBps: number
  advance: number
  fee: number
  agentFee: number
  gasFee: number
  reserveFee: number
  platformFee: number
  exporterNet: number
  yieldBps: number
  yieldAmount: number
  investorDue: number
}

export type Claims = {
  declaredKg: number
  status: number
  docHash: string
  containerNo: string
  blRef: string
  at: number
  verifyDeadline: number
}

export type Observed = {
  kg: number
  status: number
  docHash: string
  at: number
}

/** The verifier's sources for a check. Simulated data, per the plan. */
export type Evidence = {
  weighbridge: { source: string; ticket: string; kg: number }
  tracking: { source: string; containerNo: string; status: number }
  documents: { source: string; blRef: string; bundleHash: string }
}

export type Deal = {
  id: string
  invoiceRef: string
  goods: string
  exporterId: string
  importerId: string
  investorId?: string
  amount: number
  paid: number
  paidToInvestor: number
  createdAt: number
  dueAt: number
  fundedAt?: number
  closedAt?: number
  listingDeadline?: number
  graceEnd?: number
  state: DealState
  terms?: Terms
  claims?: Claims
  observed?: Observed
  evidence?: Evidence
  /** Bit 0 weight, bit 1 documents, bit 2 status. */
  falsifiedMask: number
  checks: number
  /** The listing window closed with no investor. */
  canExpire: boolean
  /** Unpaid past the due date and grace period. */
  canDefault: boolean
  events: DealEvent[]
}

export type AuditEntry = {
  id: string
  at: number
  dealId: string
  kind: string
  message: string
  tx?: TxRef
  prevHash: string
  hash: string
}

/** A price over the agent's limits, waiting on a human, from the agent's API. */
export type PendingApproval = {
  id: string
  dealId: string
  checkNo: number
  payTo: string
  price: number
  reason: string
  at: number
}

export type Network = {
  name: string
  chainId: number
  tradeDeals: string
  /** Transactions are signed on the server with test keys. Local chain only. */
  serverSigning: boolean
}

export type TradeState = {
  network: Network
  personas: Record<Exclude<Role, "admin">, string>
  parties: Party[]
  deals: Deal[]
  /** From the agent running against this chain. */
  audit: AuditEntry[]
  /** Live entries from the Hedera audit topic. */
  hedera: { topicId: string; entries: AuditEntry[] }
  pending: PendingApproval[]
  /** The Hedera agent's API answered. */
  agentOnline: boolean
}
