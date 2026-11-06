// Stand-in for the Hedera agent on a local chain, for when its keys aren't available. It does what the real
// agent does minus the x402 payment: watches for Claimed deals, buys nothing, asks the verifier, relays the
// signed answer and rechecks Pending deals. The contract still decides. Never used on a real network.

import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

import { createPublicClient, createWalletClient, http, type Hex } from "viem"
import { foundry } from "viem/chains"

import { DealState, tradeDealsAbi } from "@trustmebro/shared"

import { wallets, type LocalDeployment } from "./local-chain"

const MAX_CHECKS = 3
const RECHECK_MS = 8_000
const POLL_MS = 1_500

type Entry = {
  id: string
  at: number
  dealId: string
  kind: "gate" | "check" | "relay" | "error"
  message: string
  tx?: Hex
  prevHash: string
  hash: string
}

type Log = { entries: Entry[]; evidence: Record<string, unknown> }

const STATUS = ["None", "Booked", "Gated in", "Loaded", "Departed", "Arrived"]

export function startLocalAgent(dep: LocalDeployment, verifierUrl: string, logFile: string) {
  const chain = createPublicClient({ chain: foundry, transport: http(dep.rpcUrl) })
  const wallet = createWalletClient({ account: wallets.agent, chain: foundry, transport: http(dep.rpcUrl) })
  const log: Log = { entries: [], evidence: {} }
  const lastCheck = new Map<string, number>()
  const busy = new Set<string>()

  mkdirSync(dirname(logFile), { recursive: true })
  const save = () => writeFileSync(logFile, JSON.stringify(log, null, 2))
  save()

  const write = (dealId: bigint, kind: Entry["kind"], message: string, tx?: Hex) => {
    const prevHash = log.entries[0]?.hash ?? "0".repeat(64)
    const at = Date.now()
    const body = JSON.stringify({ at, dealId: dealId.toString(), kind, message, tx, prevHash })
    const hash = createHash("sha256").update(body).digest("hex")
    log.entries.unshift({ id: hash.slice(0, 12), at, dealId: dealId.toString(), kind, message, tx, prevHash, hash })
    save()
  }

  const read = <T>(functionName: string, args: unknown[] = []) =>
    chain.readContract({
      address: dep.tradeDeals,
      abi: tradeDealsAbi,
      functionName: functionName as never,
      args: args as never,
    }) as Promise<T>

  async function check(dealId: bigint) {
    const shipment = await read<{ containerNo: string; blRef: string }>("getShipment", [dealId])
    write(dealId, "gate", "Local mode: spending gate skipped and no USDC spent")

    const response = await fetch(`${verifierUrl}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dealId: dealId.toString(), shipmentRef: shipment }),
    })
    const answer = await response.json()
    if (!response.ok) throw new Error(`verifier ${response.status}: ${answer.message ?? answer.error}`)

    const v = answer.verification
    write(dealId, "check", `Signed answer: ${v.observedKg.toLocaleString("en-US")} kg, ${STATUS[v.statusCode]}`)
    log.evidence[dealId.toString()] = answer.evidence

    const { request } = await chain.simulateContract({
      account: wallets.agent,
      address: dep.tradeDeals,
      abi: tradeDealsAbi,
      functionName: "submitVerification",
      args: [
        {
          dealId: v.dealId as Hex,
          observedKg: v.observedKg,
          statusCode: v.statusCode,
          docHash: v.docHash as Hex,
          observedAt: BigInt(v.observedAt),
          nonce: BigInt(v.nonce),
          expiry: BigInt(v.expiry),
        },
        answer.signature as Hex,
      ],
    })
    const hash = await wallet.writeContract(request)
    await chain.waitForTransactionReceipt({ hash })
    const deal = await read<{ state: number }>("getDeal", [dealId])
    const state = Object.entries(DealState).find(([, value]) => value === deal.state)?.[0]
    write(dealId, "relay", `Relayed to the contract, which decided: ${state}`, hash)
  }

  const due = (id: string, deal: { state: number; checks: number; verifyDeadline: bigint }) => {
    if (deal.state === DealState.Claimed) return true
    if (deal.state !== DealState.Pending || deal.checks >= MAX_CHECKS) return false
    // Keep the last check for after the deadline: it's the only way a fake status gets punished.
    if (deal.checks === MAX_CHECKS - 1) return Date.now() / 1000 > Number(deal.verifyDeadline) + 2
    return Date.now() - (lastCheck.get(id) ?? 0) > RECHECK_MS
  }

  const timer = setInterval(async () => {
    try {
      const count = await read<bigint>("dealCount")
      for (let dealId = 1n; dealId <= count; dealId++) {
        const id = dealId.toString()
        if (busy.has(id)) continue
        const deal = await read<{ state: number; checks: number; verifyDeadline: bigint }>("getDeal", [dealId])
        if (!due(id, deal)) continue
        busy.add(id)
        lastCheck.set(id, Date.now())
        check(dealId)
          .catch((error: Error) => write(dealId, "error", error.message.slice(0, 180)))
          .finally(() => busy.delete(id))
      }
    } catch {
      // The chain is restarting or busy. The next tick tries again.
    }
  }, POLL_MS)

  return { stop: () => clearInterval(timer) }
}

