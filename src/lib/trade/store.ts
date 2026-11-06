"use client"

import { useSyncExternalStore } from "react"
import { toast } from "sonner"

import type { TradeAction } from "@/lib/chain/write"

import type { Party, TradeState } from "./types"

const POLL_MS = 2_000

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

const send = async (action: TradeAction, success: string) => {
  const response = await fetch("/api/trade", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action),
  })
  if (!response.ok) {
    const { error } = (await response.json()) as { error: string }
    toast.error(error)
    return false
  }
  toast.success(success)
  await refresh()
  return true
}

type Create = Extract<TradeAction, { type: "createDeal" }>
type Declare = Extract<TradeAction, { type: "declareClaims" }>

export const actions = {
  createInvoice: (input: Omit<Create, "type">) =>
    send({ type: "createDeal", ...input }, "Invoice created onchain"),
  approve: (dealId: string) =>
    send({ type: "approveDeal", dealId }, "Invoice approved"),
  declare: (input: Omit<Declare, "type">) =>
    send(
      { type: "declareClaims", ...input },
      "Claims declared. The agent is checking them",
    ),
  fund: (dealId: string) =>
    send({ type: "fund", dealId }, "Funded. The exporter has been paid"),
  pay: (dealId: string, amount: number) =>
    send({ type: "pay", dealId, amount }, "Payment sent"),
  cancel: (dealId: string) =>
    send({ type: "cancel", dealId }, "Deal cancelled"),
  markDefault: (dealId: string) =>
    send({ type: "markDefault", dealId }, "Deal marked as defaulted"),
  expire: (dealId: string) => send({ type: "expire", dealId }, "Deal expired"),
  approvePayment: (id: string) =>
    send(
      { type: "decideApproval", id, decision: "approve" },
      "Payment approved",
    ),
  rejectPayment: (id: string) =>
    send(
      { type: "decideApproval", id, decision: "reject" },
      "Payment rejected",
    ),
}
