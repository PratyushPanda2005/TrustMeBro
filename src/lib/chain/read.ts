import "server-only"

import { USDT_ADDRESS } from "@trustmebro/shared"
import {
  ADMIN,
  ADMIN_ROLE,
  V2_CHAIN,
  V2_FINANCE,
  financeV2Abi,
} from "@trustmebro/shared/v2"
import {
  createPublicClient,
  erc20Abi,
  formatEther,
  formatUnits,
  http,
  parseAbi,
  type Address,
} from "viem"

import { STAGES } from "@/lib/trade/score"
import type {
  Check,
  Deal,
  DealEvent,
  DealState,
  Party,
  Terms,
  TradeState,
} from "@/lib/trade/types"

import { readApprovals } from "./agent"
import {
  EXPLORER,
  FROM_BLOCK,
  RPC_URL,
  agentBeating,
  readLabels,
  readPartyNames,
  readRelayPayloads,
  readTradeMetadata,
} from "./config"
import { readHederaAudit } from "./hedera"

const LOG_RANGE = 1_500n
/** Stays well inside the public RPC limit of 50 requests a second. */
const LOG_BATCH = 8
const CACHE_MS = 4_000

const client = createPublicClient({
  transport: http(RPC_URL, { timeout: 10_000, retryCount: 1 }),
})

const finance = { address: V2_FINANCE, abi: financeV2Abi } as const
const reputationAbi = parseAbi([
  "function score(address) view returns (uint256)",
])

const usdt = (value: bigint) => Number(formatUnits(value, 6))
const ms = (seconds: bigint) => Number(seconds) * 1000
const optionalMs = (seconds: bigint) => (seconds ? ms(seconds) : undefined)

type Log = {
  eventName: string
  args: Record<string, unknown>
  blockNumber: bigint
  transactionHash: `0x${string}`
}

// Logs are append-only, so each poll only scans blocks it hasn't seen.
const logs: Log[] = []
const blockTimes = new Map<bigint, number>()
let scanned = FROM_BLOCK - 1n

async function syncLogs() {
  const tip = await client.getBlockNumber({ cacheTime: 0 })
  while (scanned < tip) {
    const ranges: [bigint, bigint][] = []
    let from = scanned + 1n
    while (from <= tip && ranges.length < LOG_BATCH) {
      const to = from + LOG_RANGE - 1n < tip ? from + LOG_RANGE - 1n : tip
      ranges.push([from, to])
      from = to + 1n
    }
    // Parallel, but each batch lands whole and in order, so the cursor stays exact.
    const found = await Promise.all(
      ranges.map(([fromBlock, toBlock]) =>
        client.getContractEvents({ ...finance, fromBlock, toBlock }),
      ),
    )
    logs.push(...(found.flat() as unknown as Log[]))
    scanned = ranges[ranges.length - 1][1]
  }
}

async function timeOf(blockNumber: bigint) {
  if (!blockTimes.has(blockNumber)) {
    const block = await client.getBlock({ blockNumber })
    blockTimes.set(blockNumber, ms(block.timestamp))
  }
  return blockTimes.get(blockNumber) as number
}

const short = (address: unknown) =>
  `${String(address).slice(0, 6)}...${String(address).slice(-4)}`

const describe: Record<
  string,
  (args: Record<string, unknown>, exporter: string) => [string, string?]
> = {
  TradeCreated: (args) => [
    "Invoice created",
    `${usdt(args.face as bigint)} USDT`,
  ],
  // Creating a trade signs it for the exporter, so only the importer confirms.
  AgreementConfirmed: (args, exporter) => [
    args.signer === exporter ? "Exporter signed" : "Importer confirmed",
    `Signed by ${short(args.signer)}`,
  ],
  ShipmentChecked: (args) => [
    args.result === 1 ? "Shipment verified" : "Shipment check failed",
    `${String(args.mode).replaceAll("_", " ").toLowerCase()}, ${STAGES[args.stage as number]}`,
  ],
  Funded: (args) => [
    "Funded",
    `${usdt(args.advance as bigint)} USDT advanced to the exporter`,
  ],
  Settled: (args) => [
    "Settled",
    `${usdt(args.investor as bigint)} USDT to the holder, ${usdt(args.exporter as bigint)} USDT to the exporter, ${usdt(args.fee as bigint)} USDT fee`,
  ],
  DefaultRecorded: () => ["Defaulted"],
}

function stateOf(
  raw: { state: number; verification: number; importerApproved: boolean },
  defaulted: boolean,
): DealState {
  if (defaulted) return "Defaulted"
  if (raw.state === 4) return "Settled"
  if (raw.state === 2) return "Funded"
  if (raw.state !== 1) return "Closed"
  if (raw.verification === 3) return "Rejected"
  if (raw.verification === 1) return "Verified"
  return raw.importerApproved ? "Approved" : "Created"
}

const toTerms = (value: {
  score: bigint
  advance: bigint
  profit: bigint
  investor: bigint
  fee: bigint
  exporter: bigint
}): Terms => ({
  score: Number(value.score),
  advance: usdt(value.advance),
  profit: usdt(value.profit),
  investorDue: usdt(value.investor),
  fee: usdt(value.fee),
  exporterRemainder: usdt(value.exporter),
  raw: [
    value.score,
    value.advance,
    value.profit,
    value.investor,
    value.fee,
    value.exporter,
  ].map(String) as Terms["raw"],
})

async function readFresh(): Promise<TradeState> {
  const [nextId, reputation, treasury, approvals, hedera] = await Promise.all([
    client.readContract({ ...finance, functionName: "nextId" }),
    client.readContract({ ...finance, functionName: "reputation" }),
    client.readContract({ ...finance, functionName: "treasury" }),
    readApprovals(),
    readHederaAudit(),
  ])

  const rawDeals = await Promise.all(
    Array.from({ length: Number(nextId) - 1 }, (_, index) =>
      client.readContract({
        ...finance,
        functionName: "getDeal",
        args: [BigInt(index + 1)],
      }),
    ),
  )
  // After the deals, so the logs always cover every state just read.
  await syncLogs()

  const byDeal = new Map<string, Log[]>()
  for (const log of logs) {
    if (log.args.id === undefined) continue
    const id = String(log.args.id)
    byDeal.set(id, [...(byDeal.get(id) ?? []), log])
  }

  const labels = readLabels()
  const metadata = readTradeMetadata()
  const now = Date.now()

  const deals = await Promise.all(
    rawDeals.map(async (raw, index): Promise<Deal> => {
      const dealId = BigInt(index + 1)
      const id = dealId.toString()
      const own = byDeal.get(id) ?? []
      const funded = own.find((log) => log.eventName === "Funded")
      const settled = own.find((log) => log.eventName === "Settled")
      const checked = own.findLast((log) => log.eventName === "ShipmentChecked")
      const defaulted = own.some((log) => log.eventName === "DefaultRecorded")
      const state = stateOf(raw, defaulted)

      const events: DealEvent[] = await Promise.all(
        own
          .filter((log) => describe[log.eventName])
          .map(async (log) => {
            const [label, detail] = describe[log.eventName](
              log.args,
              raw.exporter,
            )
            return {
              at: await timeOf(log.blockNumber),
              label,
              detail,
              tx: { chain: "whitechain" as const, hash: log.transactionHash },
            }
          }),
      )

      let terms: Terms | undefined
      if (raw.fundedAt) terms = toTerms(raw.financial)
      else if (state === "Verified") {
        terms = await client
          .readContract({ ...finance, functionName: "quote", args: [dealId] })
          .then(toTerms, () => undefined)
      }

      let check: Check | undefined
      if (checked) {
        const args = checked.args
        check = {
          mode: String(args.mode),
          result: args.result as number,
          stage: args.stage as number,
          quantity: Number(args.quantity),
          documentHash: String(args.documentHash),
          reportHash: String(args.reportHash),
          verifier: String(args.verifier),
          at: await timeOf(checked.blockNumber),
          tx: { chain: "whitechain", hash: checked.transactionHash },
        }
      }

      const meta = metadata[id]
      return {
        id,
        goods:
          labels[id]?.goods ??
          meta?.commercial.goodsDescription ??
          `Trade ${id}`,
        invoiceRef:
          labels[id]?.invoiceRef ?? raw.terms.invoiceHash.slice(0, 10),
        exporterId: raw.exporter,
        importerId: raw.terms.importer,
        investorId: funded ? String(funded.args.investor) : undefined,
        holderId: settled ? String(settled.args.holder) : undefined,
        amount: usdt(raw.terms.face),
        createdAt: ms(raw.createdAt),
        expiry: ms(raw.terms.expiry),
        dueAt: optionalMs(raw.dueAt),
        fundedAt: optionalMs(raw.fundedAt),
        closedAt: settled ? await timeOf(settled.blockNumber) : undefined,
        state,
        terms,
        shipment: {
          quantity: Number(raw.terms.quantity),
          unit: meta?.unit,
          minimumStage: raw.terms.minimumStage,
          documentHash: raw.terms.documentHash,
          reference: meta?.shipmentReference,
        },
        check,
        canDefault: state === "Funded" && now > ms(raw.dueAt) + 7 * 86_400_000,
        events,
      }
    }),
  )

  const roleByHash = new Map<string, Party["role"]>()
  await Promise.all(
    (
      [
        ["EXPORTER_ROLE", "exporter"],
        ["IMPORTER_ROLE", "importer"],
        ["INVESTOR_ROLE", "investor"],
      ] as const
    ).map(async ([functionName, role]) => {
      roleByHash.set(
        await client.readContract({ ...finance, functionName }),
        role,
      )
    }),
  )

  const members = new Map<string, Party["role"]>()
  const removed = new Set<string>()
  const admins = new Set<string>()
  for (const log of logs) {
    if (log.eventName !== "RoleGranted" && log.eventName !== "RoleRevoked") {
      continue
    }
    const account = String(log.args.account)
    const granted = log.eventName === "RoleGranted"
    if (log.args.role === ADMIN_ROLE) {
      if (granted) admins.add(account)
      else admins.delete(account)
      continue
    }
    const role = roleByHash.get(String(log.args.role))
    if (!role) continue
    if (granted) {
      members.set(account, role)
      removed.delete(account)
    } else if (members.get(account) === role) {
      removed.add(account)
    }
  }

  const names = readPartyNames()
  const parties = await Promise.all(
    [...members].map(async ([id, role]): Promise<Party> => {
      const wallet = id as Address
      const [score, balance, gas] = await Promise.all([
        client.readContract({
          address: reputation,
          abi: reputationAbi,
          functionName: "score",
          args: [wallet],
        }),
        client.readContract({
          address: USDT_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [wallet],
        }),
        client.getBalance({ address: wallet }),
      ])
      return {
        id,
        name: names[id] ?? short(id),
        role,
        active: !removed.has(id),
        score: Number(score),
        usdt: usdt(balance),
        gas: Number(formatEther(gas)),
        history: deals
          .filter(
            (deal) =>
              deal.fundedAt && [deal.exporterId, deal.importerId].includes(id),
          )
          .map((deal) => ({
            at: deal.fundedAt as number,
            dealId: deal.id,
            score: deal.terms?.score ?? 0,
            reason: "Trust Score at funding",
          }))
          .sort((a, b) => a.at - b.at),
      }
    }),
  )

  return {
    network: {
      name: "Whitechain Sepolia",
      chainId: V2_CHAIN,
      finance: V2_FINANCE,
      usdt: USDT_ADDRESS,
      admin: ADMIN,
      treasury,
      explorer: EXPLORER,
    },
    admins: [...admins],
    parties,
    deals: deals.reverse(),
    hedera,
    pending: approvals.pending,
    relays: readRelayPayloads(),
    agentOnline: approvals.online || agentBeating(),
  }
}

let cached: { at: number; state: TradeState } | undefined
let inFlight: Promise<TradeState> | undefined

/** Shared by every open tab, which keeps the app inside the RPC's rate limit. */
export async function readState() {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.state
  inFlight ??= readFresh()
    .then((state) => {
      cached = { at: Date.now(), state }
      return state
    })
    .finally(() => {
      inFlight = undefined
    })
  return inFlight
}

export async function refreshState() {
  cached = undefined
}
