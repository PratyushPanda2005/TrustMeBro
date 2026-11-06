"use client"

import { useSyncExternalStore } from "react"
import { toast } from "sonner"

import { sendTransaction } from "@/lib/api/contract"
import { payAndVerify, requestQuote } from "@/lib/api/verifier"

import {
  Revert,
  appendAudit,
  approve,
  buy,
  createInvoice,
  declareShipment,
  expire,
  gateCheck,
  getDeal,
  markDefault,
  onboardImporter,
  redeem,
  setAllowlisted,
  settle,
  submitVerification,
  type Ctx,
} from "./engine"
import { mockWallet, seedState } from "./seed"
import type { Claims, Scenario, SpendLimits, TradeState } from "./types"

/**
 * Client-side mock backend. All roles read this one state, so an action in one
 * dashboard shows up in the others. It persists in the browser, not a server,
 * so demo data survives reloads and works on any deployment.
 */
const KEY = "trustmebro:mock:v1"

let state = seedState
let hydrated = false
const listeners = new Set<() => void>()

const commit = (next: TradeState) => {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage can be unavailable; the demo still runs for this session.
  }
  listeners.forEach((listener) => listener())
}

export function hydrateStore() {
  if (hydrated) return
  hydrated = true
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) {
      state = JSON.parse(saved)
      listeners.forEach((listener) => listener())
    }
  } catch {
    // Corrupt or blocked storage: keep the seed.
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useTrade = () =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => seedState,
  )

const describe = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong"

/**
 * Simulates first, as `simulateContract` would, so a revert never reaches the
 * network. Then sends, and applies the change with the receipt.
 */
async function write(
  method: string,
  args: unknown,
  apply: (current: TradeState, ctx: Ctx) => TradeState,
) {
  apply(state, { now: Date.now() })
  const tx = await sendTransaction(method, args)
  commit(apply(state, { now: Date.now(), tx }))
}

/** Wraps a user action: success toast, or a readable error. */
async function run(success: string, action: () => Promise<void>) {
  try {
    await action()
    toast.success(success)
    return true
  } catch (error) {
    toast.error(describe(error))
    if (!(error instanceof Revert)) console.error(error)
    return false
  }
}

const audit = (entry: Parameters<typeof appendAudit>[1]) =>
  commit(appendAudit(state, entry, { now: Date.now() }))

async function settleVerification(dealId: string, price: number) {
  const deal = getDeal(state, dealId)
  const input = {
    dealId,
    claims: deal.claims as Claims,
    scenario: deal.scenario,
  }
  const { observed, tx } = await payAndVerify(input)
  audit({
    dealId,
    kind: "payment",
    message: `Paid ${price.toFixed(2)} USDC for POST /verify`,
    amount: price,
    tx,
  })
  await write("submitVerification", { dealId, observed }, (current, ctx) =>
    submitVerification(current, { dealId, observed }, ctx),
  )
  audit({
    dealId,
    kind: "relay",
    message: "Signed result relayed to Whitechain",
  })
}

/** The agent: quote, spending gate, pay, relay. It never judges the answer. */
async function runAgent(dealId: string) {
  const deal = getDeal(state, dealId)
  const { price } = await requestQuote({
    dealId,
    claims: deal.claims as Claims,
    scenario: deal.scenario,
  })
  audit({
    dealId,
    kind: "quote",
    message: `402 quote received: ${price.toFixed(2)} USDC`,
  })
  const refusal = gateCheck(state, dealId, price)
  if (refusal) {
    audit({ dealId, kind: "refusal", message: `Refused: ${refusal}` })
    commit({
      ...state,
      pending: [
        { id: `p-${Date.now()}`, dealId, price, at: Date.now() },
        ...state.pending,
      ],
    })
    return false
  }
  audit({ dealId, kind: "gate", message: "Spending gate passed" })
  await settleVerification(dealId, price)
  return true
}

export const actions = {
  createInvoice: (input: Omit<Parameters<typeof createInvoice>[1], "id">) => {
    const id = `D-${1001 + state.deals.length}`
    return run(`Invoice ${id} created`, () =>
      write("createInvoice", input, (current, ctx) =>
        createInvoice(current, { ...input, id }, ctx),
      ),
    )
  },

  approve: (dealId: string) =>
    run("Invoice approved and terms fixed", () =>
      write("approve", { dealId }, (current, ctx) =>
        approve(current, dealId, ctx),
      ),
    ),

  buy: (input: Parameters<typeof buy>[1]) =>
    run("Deal tokens bought", () =>
      write("buy", input, (current, ctx) => buy(current, input, ctx)),
    ),

  /** Declares the claims, then the agent runs by itself, as in step 6. */
  declare: async (dealId: string, claims: Claims, scenario: Scenario) => {
    const input = { dealId, claims, scenario }
    return run("Claims declared", async () => {
      await write("declareShipment", input, (current, ctx) =>
        declareShipment(current, input, ctx),
      )
      if (getDeal(state, dealId).state !== "Shipped") return
      const paid = await runAgent(dealId)
      if (!paid) toast.warning("Quote refused: waiting on an admin")
    })
  },

  settle: (dealId: string) =>
    run("Invoice paid and split by the waterfall", () =>
      write("settle", { dealId }, (current, ctx) =>
        settle(current, { dealId }, ctx),
      ),
    ),

  redeem: (input: Parameters<typeof redeem>[1]) =>
    run("USDT paid out", () =>
      write("redeem", input, (current, ctx) => redeem(current, input, ctx)),
    ),

  markDefault: (dealId: string) =>
    run("Deal marked as defaulted", () =>
      write("markDefault", { dealId }, (current, ctx) =>
        markDefault(current, dealId, ctx),
      ),
    ),

  expire: (dealId: string) =>
    run("Deal expired and investors can claim refunds", () =>
      write("expire", { dealId }, (current, ctx) =>
        expire(current, dealId, ctx),
      ),
    ),

  onboardImporter: (name: string, trustCodeBps: number) => {
    const id = `importer-${state.parties.length + 1}`
    const input = { id, name, wallet: mockWallet(id), trustCodeBps }
    return run(`${name} onboarded`, () =>
      write("onboardImporter", input, (current, ctx) =>
        onboardImporter(current, input, ctx),
      ),
    )
  },

  setAllowlisted: (investorId: string, allowed: boolean) => {
    const input = { investorId, allowed }
    return run(allowed ? "Investor allowlisted" : "Investor removed", () =>
      write("setAllowlisted", input, (current) =>
        setAllowlisted(current, input),
      ),
    )
  },

  setLimits: (limits: SpendLimits) => {
    commit({ ...state, limits })
    toast.success("Spending limits saved")
  },

  /** PENDING_HUMAN: an admin approves the quote the gate refused. */
  approvePayment: (id: string) => {
    const item = state.pending.find((entry) => entry.id === id)
    if (!item) return Promise.resolve(false)
    return run("Payment approved and check completed", async () => {
      await settleVerification(item.dealId, item.price)
      commit({
        ...state,
        pending: state.pending.filter((entry) => entry.id !== id),
      })
    })
  },

  rejectPayment: (id: string) => {
    commit({
      ...state,
      pending: state.pending.filter((entry) => entry.id !== id),
    })
    toast.success("Payment rejected. The deal can expire and refund")
  },

  reset: () => {
    try {
      localStorage.removeItem(KEY)
    } catch {
      // Nothing stored.
    }
    state = seedState
    listeners.forEach((listener) => listener())
    toast.success("Demo data reset")
  },
}
