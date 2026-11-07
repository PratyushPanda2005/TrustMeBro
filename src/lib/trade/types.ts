export type Role = "exporter" | "importer" | "investor" | "admin"

/** Read from Finance V2: `state`, `importerApproved`, `verification` and events. */
export type DealState =
  | "Created"
  | "Approved"
  | "Verified"
  | "Funded"
  | "Settled"
  | "Rejected"
  | "Defaulted"
  | "Closed"

export type ScorePoint = {
  at: number
  dealId: string
  /** The deal score, out of 100. */
  score: number
  reason: string
}

export type Party = {
  /** The wallet address. */
  id: string
  name: string
  role: Exclude<Role, "admin">
  /** False once the admin removes the role. Past deals still name the party. */
  active: boolean
  /** `Reputation.score`, out of 100. */
  score: number
  usdt: number
  gas: number
  history: ScorePoint[]
}

export type TxRef = { chain: "whitechain" | "hedera"; hash: string }

export type DealEvent = {
  at: number
  label: string
  detail?: string
  tx?: TxRef
}

/** From `quote()` once a trade can be funded, then frozen in `getDeal().financial`. */
export type Terms = {
  score: number
  advance: number
  profit: number
  investorDue: number
  fee: number
  exporterRemainder: number
  /** The exact values `fund()` must commit to. */
  raw: [string, string, string, string, string, string]
}

export type Shipment = {
  quantity: number
  unit?: string
  minimumStage: number
  documentHash: string
  reference?: string
}

export type Check = {
  mode: string
  /** 1 means Valid. */
  result: number
  stage: number
  quantity: number
  documentHash: string
  reportHash: string
  verifier: string
  at: number
  tx: TxRef
}

export type Deal = {
  id: string
  invoiceRef: string
  goods: string
  exporterId: string
  importerId: string
  investorId?: string
  holderId?: string
  amount: number
  createdAt: number
  expiry: number
  dueAt?: number
  fundedAt?: number
  closedAt?: number
  state: DealState
  terms?: Terms
  shipment: Shipment
  check?: Check
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

/** A paid, signed answer from the agent, ready for a wallet to relay. */
export type RelayPayload = {
  dealId: string
  to: string
  data: string
  label: string
  hederaTx: string
  expiry: number
}

export type Network = {
  name: string
  chainId: number
  finance: string
  usdt: string
  admin: string
  treasury: string
  explorer: string
}

export type TradeState = {
  network: Network
  /** Wallets holding Finance V2's admin role. */
  admins: string[]
  parties: Party[]
  deals: Deal[]
  hedera: { topicId: string; entries: AuditEntry[] }
  pending: PendingApproval[]
  relays: RelayPayload[]
  /** The Hedera agent's API answered. */
  agentOnline: boolean
}
