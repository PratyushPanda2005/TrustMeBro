"use client"

import { useSyncExternalStore } from "react"
import { prepareTrade } from "@trustmebro/shared/v2"
import { toast } from "sonner"
import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  keccak256,
  parseUnits,
  stringToHex,
  type Address,
  type Hex,
} from "viem"

import type { TradeAction } from "@/lib/chain/trade"

import type { Deal, Party, RelayPayload, TradeState } from "./types"
import { chainActions } from "./wallet"

const POLL_MS = 5_000

export type Connection =
  | { status: "loading" }
  | { status: "offline"; message: string }
  | { status: "ready"; state: TradeState }

let connection: Connection = { status: "loading" }
let lastBody = ""
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()

const publish = (next: Connection) => {
  connection = next
  listeners.forEach((listener) => listener())
}

async function refresh() {
  try {
    const response = await fetch("/api/trade", { cache: "no-store" })
    const body = await response.text()
    if (!response.ok) {
      const message = JSON.parse(body).error as string
      if (connection.status !== "offline")
        publish({ status: "offline", message })
      lastBody = ""
      return
    }
    // Polling only re-renders when the chain actually changed.
    if (body !== lastBody) {
      lastBody = body
      publish({ status: "ready", state: JSON.parse(body) })
    }
  } catch {
    if (connection.status !== "offline") {
      publish({
        status: "offline",
        message: "The dashboard API isn't responding.",
      })
    }
    lastBody = ""
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    void refresh()
    timer = setInterval(refresh, POLL_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

const serverConnection: Connection = { status: "loading" }

export const useConnection = () =>
  useSyncExternalStore(
    subscribe,
    () => connection,
    () => serverConnection,
  )

/** Views render inside `DashboardShell`, which waits for the first state. */
export function useTrade() {
  const current = useConnection()
  if (current.status !== "ready") {
    throw new Error("useTrade needs a connected dashboard")
  }
  return current.state
}

export const getParty = (state: TradeState, id: string): Party => {
  const party = state.parties.find(
    (item) => item.id.toLowerCase() === id.toLowerCase(),
  )
  if (!party) throw new Error(`Unknown party ${id}`)
  return party
}

const post = async (action: TradeAction) => {
  const response = await fetch("/api/trade", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action),
  })
  if (!response.ok) {
    const { error } = (await response.json()) as { error: string }
    throw new Error(error)
  }
  await refresh()
}

/** A revert or a rejected signature becomes one plain sentence. */
function explain(error: unknown) {
  if (error instanceof BaseError) {
    if (error.walk((cause) => cause instanceof UserRejectedRequestError)) {
      return "Cancelled in your wallet."
    }
    const revert = error.walk(
      (cause) => cause instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError | undefined
    return revert?.reason ?? revert?.data?.errorName ?? error.shortMessage
  }
  return error instanceof Error ? error.message : "Something went wrong"
}

const run = async (work: () => Promise<unknown>, success: string) => {
  try {
    await work()
    await post({ type: "refresh" })
    toast.success(success)
    return true
  } catch (error) {
    toast.error(explain(error))
    return false
  }
}

const face = (deal: Deal) => parseUnits(deal.amount.toString(), 6)

type NewInvoice = {
  exporter: string
  importer: string
  invoiceNumber: string
  amount: string
  goods: string
  shipmentReference: string
  quantity: string
  unit: string
  issuer: string
  recordId: string
}

export const actions = {
  createInvoice: (input: NewInvoice) =>
    run(async () => {
      const prepared = prepareTrade(
        {
          exporter: input.exporter as Address,
          importer: input.importer as Address,
          invoiceAmount: input.amount,
          goodsDescription: input.goods,
          shipmentReference: input.shipmentReference,
          quantity: input.quantity,
          unit: input.unit,
          invoiceNumber: input.invoiceNumber,
          record: {
            issuer: input.issuer,
            recordId: input.recordId,
            shipmentReference: input.shipmentReference,
            quantity: input.quantity,
            unit: input.unit,
            goodsDescription: input.goods,
          },
        },
        BigInt(Math.floor(Date.now() / 1000)),
      )
      if (!prepared.ok) throw new Error(prepared.missing.join(". "))
      const id = await chainActions.createTrade(input.exporter, prepared.terms)
      await post({
        type: "saveTrade",
        id,
        metadata: prepared.metadata,
        goods: input.goods,
        invoiceRef: input.invoiceNumber,
      })
    }, "Invoice created on Whitechain"),
  confirm: (deal: Deal) =>
    run(
      () => chainActions.confirm(deal.importerId, deal.id),
      "Agreement confirmed",
    ),
  reject: (deal: Deal) =>
    run(() => chainActions.reject(deal.importerId, deal.id), "Trade rejected"),
  verifyManual: (deal: Deal, admin: string, stage: number) =>
    run(
      () =>
        chainActions.verifyManual(
          admin,
          deal.id,
          deal.shipment.documentHash as Hex,
          BigInt(deal.shipment.quantity),
          stage,
          keccak256(stringToHex(`manual review of trade ${deal.id}`)),
        ),
      "Verified. Investors can fund it now",
    ),
  relay: (from: string, relay: RelayPayload) =>
    run(
      () => chainActions.relay(from, relay.to as Address, relay.data as Hex),
      "Signed answer relayed. The contract has decided",
    ),
  fund: (deal: Deal, investor: string, treasury: string) =>
    run(async () => {
      if (!deal.terms) throw new Error("This deal has no quote yet.")
      await chainActions.fund(investor, deal.id, deal.terms.raw, treasury)
    }, "Funded. The exporter has been paid"),
  pay: (deal: Deal) =>
    run(
      () => chainActions.repay(deal.importerId, deal.id, face(deal)),
      "Repaid and settled",
    ),
  markDefault: (deal: Deal, caller: string) =>
    run(
      () => chainActions.markDefault(caller, deal.id),
      "Deal marked as defaulted",
    ),
  approvePayment: (id: string) =>
    run(
      () => post({ type: "decideApproval", id, decision: "approve" }),
      "Payment approved",
    ),
  rejectPayment: (id: string) =>
    run(
      () => post({ type: "decideApproval", id, decision: "reject" }),
      "Payment rejected",
    ),
}
