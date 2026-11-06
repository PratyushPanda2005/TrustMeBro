import "server-only"

import { tradeDealsAbi, trustRegistryAbi } from "@trustmebro/shared"
import { formatUnits, hexToString, zeroAddress, type Address } from "viem"

import type {
  AuditEntry,
  Deal,
  DealEvent,
  DealState,
  Party,
  Terms,
  TradeState,
} from "@/lib/trade/types"

import { readApprovals } from "./agent"
import { publicClient } from "./client"
import { loadDeployment, readAgentLog, readMeta } from "./deployment"
import { readHederaAudit } from "./hedera"

const STATES: DealState[] = [
  "Created",
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
]

const usdt = (value: bigint) => Number(formatUnits(value, 6))
const ms = (seconds: bigint) => Number(seconds) * 1000
const optionalMs = (seconds: bigint) => (seconds ? ms(seconds) : undefined)

/** Tags are short strings like PAID_ON_TIME, packed into bytes32. */
const tagText = (tag: string) => {
  try {
    const text = hexToString(tag as `0x${string}`, { size: 32 })
    const words = text.replace(/_/g, " ").toLowerCase()
    return words.charAt(0).toUpperCase() + words.slice(1)
  } catch {
    return "Score updated"
  }
}

const eventLabels: Record<string, string> = {
  DealCreated: "Invoice created",
  Approved: "Approved by the importer",
  Claimed: "Shipment claims declared",
  Verified: "Verified",
  Pending: "Tracking behind, recheck pending",
  Rejected: "Rejected: a claim was false",
  Mismatch: "Mismatch: more goods than claimed",
  Funded: "Funded",
  Paid: "Importer paid",
  Settled: "Settled",
  Defaulted: "Defaulted",
  Expired: "Expired",
  Cancelled: "Cancelled",
}

type Log = {
  eventName: string
  args: Record<string, unknown>
  blockNumber: bigint
  transactionHash: `0x${string}`
}

function describe({ eventName, args }: Log) {
  if (eventName === "Funded") {
    return `${usdt(args.exporterNet as bigint)} USDT to the exporter, ${usdt(args.fee as bigint)} USDT fee`
  }
  if (eventName === "Paid") {
    return `${usdt(args.toInvestor as bigint)} USDT to the investor, ${usdt(args.toExporter as bigint)} USDT to the exporter`
  }
  if (eventName === "Claimed") {
    return `${(args.declaredKg as number).toLocaleString("en-US")} kg, container ${args.containerNo}`
  }
  return undefined
}

const blockTimes = new Map<bigint, number>()
let blockTip = 0n

export async function readState(): Promise<TradeState> {
  const deployment = loadDeployment()
  const client = publicClient(deployment)
  const deals = { address: deployment.tradeDeals, abi: tradeDealsAbi } as const
  const registry = {
    address: deployment.trustRegistry,
    abi: trustRegistryAbi,
  } as const

  const fromBlock = BigInt(process.env.FROM_BLOCK ?? 0)

  const [count, tradeLogs, registryLogs, approvals, hedera] = await Promise.all(
    [
      client.readContract({ ...deals, functionName: "dealCount" }),
      client.getContractEvents({ ...deals, fromBlock }),
      client.getContractEvents({ ...registry, fromBlock }),
      readApprovals(),
      readHederaAudit(),
    ],
  )

  // Block times never change, so each is fetched once. A restarted local chain
  // reuses block numbers, which shows up as logs ending before the known tip.
  const tip = tradeLogs.at(-1)?.blockNumber ?? 0n
  if (tip < blockTip) blockTimes.clear()
  blockTip = tip
  const timeOf = async (blockNumber: bigint) => {
    if (!blockTimes.has(blockNumber)) {
      const block = await client.getBlock({ blockNumber })
      blockTimes.set(blockNumber, ms(block.timestamp))
    }
    return blockTimes.get(blockNumber) as number
  }

  const logs = tradeLogs as unknown as Log[]
  const eventsByDeal = new Map<string, DealEvent[]>()
  const fundedBy = new Map<string, Log>()
  const splitBy = new Map<string, Log>()
  for (const log of logs) {
    const id = String(log.args.dealId)
    if (log.eventName === "Funded") fundedBy.set(id, log)
    if (log.eventName === "FeeSplit") splitBy.set(id, log)
    const label = eventLabels[log.eventName]
    if (!label) continue
    const list = eventsByDeal.get(id) ?? []
    list.push({
      at: await timeOf(log.blockNumber),
      label,
      detail: describe(log),
      tx: { chain: "whitechain", hash: log.transactionHash },
    })
    eventsByDeal.set(id, list)
  }

  const meta = readMeta()
  const agentLog = readAgentLog()

  const dealRows = await Promise.all(
    Array.from({ length: Number(count) }, async (_, index): Promise<Deal> => {
      const dealId = BigInt(index + 1)
      const id = dealId.toString()
      const [deal, shipment, times, quote] = await Promise.all([
        client.readContract({
          ...deals,
          functionName: "getDeal",
          args: [dealId],
        }),
        client.readContract({
          ...deals,
          functionName: "getShipment",
          args: [dealId],
        }),
        client.readContract({
          ...deals,
          functionName: "deadlines",
          args: [dealId],
        }),
        client.readContract({
          ...deals,
          functionName: "quote",
          args: [dealId],
        }),
      ])

      const funded = fundedBy.get(id)
      const split = splitBy.get(id)
      const live = {
        advanceBps: Number(quote.advanceBps),
        advance: usdt(quote.advance),
        fee: usdt(quote.fee),
        agentFee: usdt(quote.agentFee),
        gasFee: usdt(quote.gasFee),
        reserveFee: usdt(quote.reserveFee),
        platformFee: usdt(quote.platformFee),
        exporterNet: usdt(quote.exporterNet),
        yieldBps: Number(quote.yieldBps),
        yieldAmount: usdt(quote.yieldAmount),
        investorDue: usdt(quote.investorDue),
      }
      const frozen: Terms | undefined =
        funded && split
          ? {
              advanceBps: deal.advanceBps,
              advance: usdt(deal.advance),
              fee: usdt(deal.fee),
              agentFee: usdt(split.args.agentFee as bigint),
              gasFee: usdt(split.args.gasFee as bigint),
              reserveFee: usdt(split.args.reserveFee as bigint),
              platformFee: usdt(split.args.platformFee as bigint),
              exporterNet: usdt(funded.args.exporterNet as bigint),
              yieldBps: deal.yieldBps,
              yieldAmount: usdt(deal.investorDue - deal.advance),
              investorDue: usdt(deal.investorDue),
            }
          : undefined

      return {
        id,
        goods: meta[id]?.goods ?? `Invoice ${id}`,
        invoiceRef: meta[id]?.invoiceRef ?? deal.invoiceHash.slice(0, 10),
        exporterId: deal.exporter,
        importerId: deal.importer,
        investorId: deal.investor === zeroAddress ? undefined : deal.investor,
        amount: usdt(deal.amount),
        paid: usdt(deal.paid),
        paidToInvestor: usdt(deal.paidToInvestor),
        createdAt: ms(deal.createdAt),
        dueAt: ms(deal.dueDate),
        fundedAt: optionalMs(deal.fundedAt),
        closedAt: optionalMs(deal.closedAt),
        listingDeadline: optionalMs(times[1]),
        graceEnd: optionalMs(times[3]),
        state: STATES[deal.state],
        terms: frozen ?? live,
        claims: deal.claimTime
          ? {
              declaredKg: deal.declaredKg,
              status: deal.claimedStatus,
              docHash: deal.docHash,
              containerNo: shipment.containerNo,
              blRef: shipment.blRef,
              at: ms(deal.claimTime),
              verifyDeadline: ms(deal.verifyDeadline),
            }
          : undefined,
        observed: deal.observedAt
          ? {
              kg: deal.observedKg,
              status: deal.observedStatus,
              docHash: deal.observedDocHash,
              at: ms(deal.observedAt),
            }
          : undefined,
        evidence: agentLog.evidence[id] as Deal["evidence"],
        falsifiedMask: deal.falsifiedMask,
        checks: deal.checks,
        canExpire:
          STATES[deal.state] === "Verified" && Date.now() > ms(times[1]),
        canDefault:
          STATES[deal.state] === "Funded" && Date.now() > ms(times[3]),
        events: eventsByDeal.get(id) ?? [],
      }
    }),
  )

  const feedback = (registryLogs as unknown as Log[]).filter(
    (log) => log.eventName === "Feedback",
  )

  const parties = await Promise.all(
    Object.entries(deployment.parties).map(
      async ([address, info]): Promise<Party> => {
        const wallet = address as Address
        const [profile, limit, available] = await Promise.all([
          client.readContract({
            ...registry,
            functionName: "profile",
            args: [wallet],
          }),
          client.readContract({
            ...deals,
            functionName: "creditLimit",
            args: [wallet],
          }),
          client.readContract({
            ...deals,
            functionName: "availableCredit",
            args: [wallet],
          }),
        ])
        const history = await Promise.all(
          feedback
            .filter(
              (log) =>
                String(log.args.subject).toLowerCase() === wallet.toLowerCase(),
            )
            .map(async (log) => ({
              at: await timeOf(log.blockNumber),
              dealId: String(log.args.dealId),
              scoreBps: Number(log.args.scoreBps),
              reason: tagText(log.args.tag as string),
            })),
        )
        return {
          id: wallet,
          name: info.name,
          role: info.role,
          rep: {
            r: Number(profile.r),
            s: Number(profile.s),
            a: Number(profile.a),
            b: Number(profile.b),
          },
          trustBps: Number(profile.trustBps),
          riskBps: Number(profile.riskBps),
          advanceBps: Number(profile.advanceBps),
          creditLimit: usdt(limit),
          availableCredit: usdt(available),
          history,
        }
      },
    ),
  )

  const audit: AuditEntry[] = agentLog.entries.map((entry) => ({
    ...entry,
    tx: entry.tx ? { chain: "whitechain", hash: entry.tx } : undefined,
  }))

  return {
    network: {
      name: deployment.name,
      chainId: deployment.chainId,
      tradeDeals: deployment.tradeDeals,
      serverSigning: Boolean(deployment.keys),
    },
    personas: deployment.personas,
    parties,
    deals: dealRows.reverse(),
    audit,
    hedera,
    pending: approvals.pending,
    agentOnline: approvals.online,
  }
}
