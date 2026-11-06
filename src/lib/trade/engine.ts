import { usdt } from "./format"
import {
  BPS,
  PLATFORM_FEE_BPS,
  compareClaims,
  dealTerms,
  exporterPrior,
  importerPrior,
  scoreBps,
} from "./score"
import type {
  AuditEntry,
  Claims,
  Deal,
  Party,
  Scenario,
  TradeState,
  TxRef,
} from "./types"

/**
 * Pure mock of `TradeDeals` and `TrustRegistry`: each call either returns the
 * next state or throws, as a contract call would succeed or revert. The real
 * contracts replace this at integration.
 */
export class Revert extends Error {}

export type Ctx = { now: number; tx?: TxRef }

const money = (value: number) => Math.round(value * 100) / 100

export function hashText(text: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

export const getDeal = (state: TradeState, id: string) => {
  const deal = state.deals.find((item) => item.id === id)
  if (!deal) throw new Revert(`Unknown deal ${id}`)
  return deal
}

export const getParty = (state: TradeState, id: string) => {
  const party = state.parties.find((item) => item.id === id)
  if (!party) throw new Revert(`Unknown party ${id}`)
  return party
}

export const raised = (deal: Deal) =>
  money(deal.positions.reduce((sum, item) => sum + item.amount, 0))

const edit = (state: TradeState, change: (draft: TradeState) => void) => {
  const draft = structuredClone(state)
  change(draft)
  return draft
}

const log = (deal: Deal, ctx: Ctx, label: string, detail?: string) => {
  deal.events.push({ at: ctx.now, label, detail, tx: ctx.tx })
}

const record = (
  party: Party,
  ctx: Ctx,
  dealId: string,
  reason: string,
  evidence: { r?: number; s?: number },
) => {
  party.rep.r += evidence.r ?? 0
  party.rep.s += evidence.s ?? 0
  party.history.push({
    at: ctx.now,
    dealId,
    scoreBps: scoreBps(party.rep),
    reason,
  })
}

export function createInvoice(
  state: TradeState,
  input: {
    id: string
    invoiceRef: string
    exporterId: string
    importerId: string
    goods: string
    amount: number
    dueAt: number
  },
  ctx: Ctx,
) {
  const invoiceHash = hashText(
    `${input.exporterId}:${input.invoiceRef}:${input.amount}`,
  )
  if (state.deals.some((deal) => deal.invoiceHash === invoiceHash)) {
    throw new Revert("This invoice has already been financed")
  }
  if (input.amount <= 0) throw new Revert("Amount must be above zero")
  return edit(state, (draft) => {
    const deal: Deal = {
      ...input,
      invoiceHash,
      createdAt: ctx.now,
      state: "Created",
      target: 0,
      positions: [],
      events: [],
    }
    log(deal, ctx, "Invoice created", `Hash ${invoiceHash}`)
    draft.deals.unshift(deal)
  })
}

export function approve(state: TradeState, dealId: string, ctx: Ctx) {
  if (getDeal(state, dealId).state !== "Created") {
    throw new Revert("Only a new invoice can be approved")
  }
  return edit(state, (draft) => {
    const deal = getDeal(draft, dealId)
    deal.terms = dealTerms(
      scoreBps(getParty(draft, deal.exporterId).rep),
      scoreBps(getParty(draft, deal.importerId).rep),
    )
    deal.target = money((deal.amount * deal.terms.advanceBps) / BPS)
    deal.state = "Approved"
    log(deal, ctx, "Approved by importer", "Terms fixed")
  })
}

export function buy(
  state: TradeState,
  input: { dealId: string; investorId: string; amount: number },
  ctx: Ctx,
) {
  const current = getDeal(state, input.dealId)
  if (current.state !== "Approved" && current.state !== "Funding") {
    throw new Revert("This deal is not open for funding")
  }
  if (!getParty(state, input.investorId).allowlisted) {
    throw new Revert("Investor is not allowlisted")
  }
  const remaining = money(current.target - raised(current))
  if (input.amount <= 0 || input.amount > remaining) {
    throw new Revert(`Enter an amount up to ${remaining} USDT`)
  }
  return edit(state, (draft) => {
    const deal = getDeal(draft, input.dealId)
    const position = deal.positions.find(
      (item) => item.investorId === input.investorId,
    )
    if (position) position.amount = money(position.amount + input.amount)
    else {
      deal.positions.push({
        investorId: input.investorId,
        amount: input.amount,
      })
    }
    deal.state = raised(deal) >= deal.target ? "Funded" : "Funding"
    log(deal, ctx, "Tokens bought", `${usdt(input.amount)} locked`)
  })
}

export function declareShipment(
  state: TradeState,
  input: { dealId: string; claims: Claims; scenario: Scenario },
  ctx: Ctx,
) {
  if (getDeal(state, input.dealId).state !== "Funded") {
    throw new Revert("Claims can be declared once the deal is funded")
  }
  return edit(state, (draft) => {
    const deal = getDeal(draft, input.dealId)
    deal.claims = input.claims
    deal.scenario = input.scenario
    if (Object.values(input.claims).some((claim) => !claim)) {
      deal.state = "Cancelled"
      log(deal, ctx, "Cancelled by exporter", "No penalty: claim stated false")
      return
    }
    deal.state = "Shipped"
    log(deal, ctx, "Shipment claims declared", "All three claimed true")
  })
}

export function submitVerification(
  state: TradeState,
  input: { dealId: string; observed: Claims },
  ctx: Ctx,
) {
  const current = getDeal(state, input.dealId)
  if (current.state !== "Shipped" || !current.claims) {
    throw new Revert("This deal is not waiting on a verification")
  }
  return edit(state, (draft) => {
    const deal = getDeal(draft, input.dealId)
    const exporter = getParty(draft, deal.exporterId)
    const result = compareClaims(deal.claims as Claims, input.observed)
    deal.observed = input.observed
    if (result.falsified) {
      deal.state = "Disputed"
      record(exporter, ctx, deal.id, "Falsified claim", {
        s: BPS + result.neg,
      })
      log(
        deal,
        ctx,
        "Disputed",
        "A claim did not match. Investors can claim a full refund",
      )
      return
    }
    deal.state = "Released"
    deal.releasedAt = ctx.now
    record(exporter, ctx, deal.id, "Honest deal", { r: result.pos })
    log(deal, ctx, "Advance released", `${usdt(deal.target)} to exporter`)
  })
}

export function settle(
  state: TradeState,
  input: { dealId: string; late?: boolean },
  ctx: Ctx,
) {
  if (getDeal(state, input.dealId).state !== "Released") {
    throw new Revert("Only a released deal can be settled")
  }
  return edit(state, (draft) => {
    const deal = getDeal(draft, input.dealId)
    const importer = getParty(draft, deal.importerId)
    const yieldBps = deal.terms?.yieldBps ?? 0
    const investors = money(deal.target + (deal.target * yieldBps) / BPS)
    const fee = money((deal.amount * PLATFORM_FEE_BPS) / BPS)
    deal.waterfall = {
      investors,
      fee,
      exporter: money(deal.amount - investors - fee),
    }
    deal.state = "Settled"
    deal.settledAt = ctx.now
    record(
      importer,
      ctx,
      deal.id,
      input.late ? "Paid late, within grace" : "Paid on time",
      input.late ? { r: 5_000, s: 2_500 } : { r: BPS },
    )
    log(deal, ctx, "Settled", `${usdt(deal.amount)} split by the waterfall`)
  })
}

export function markDefault(state: TradeState, dealId: string, ctx: Ctx) {
  if (getDeal(state, dealId).state !== "Released") {
    throw new Revert("Only a released deal can default")
  }
  return edit(state, (draft) => {
    const deal = getDeal(draft, dealId)
    deal.state = "Defaulted"
    record(getParty(draft, deal.importerId), ctx, deal.id, "Defaulted", {
      s: 30_000,
    })
    log(deal, ctx, "Defaulted", "Importer missed the due date and grace")
  })
}

export function expire(state: TradeState, dealId: string, ctx: Ctx) {
  const { state: dealState } = getDeal(state, dealId)
  if (dealState !== "Funded" && dealState !== "Shipped") {
    throw new Revert("Only a funded or shipped deal can expire")
  }
  return edit(state, (draft) => {
    const deal = getDeal(draft, dealId)
    deal.state = "Expired"
    log(deal, ctx, "Expired", "No verification by the deadline. No penalty")
  })
}

const REFUNDABLE = ["Cancelled", "Disputed", "Expired"]

/** What a position can claim right now. */
export function claimable(deal: Deal, investorId: string) {
  const position = deal.positions.find((item) => item.investorId === investorId)
  if (!position || position.claimed !== undefined) return 0
  if (REFUNDABLE.includes(deal.state)) return position.amount
  if (deal.state === "Settled" && deal.waterfall) {
    return money((deal.waterfall.investors * position.amount) / deal.target)
  }
  return 0
}

export function redeem(
  state: TradeState,
  input: { dealId: string; investorId: string },
  ctx: Ctx,
) {
  const amount = claimable(getDeal(state, input.dealId), input.investorId)
  if (amount <= 0) throw new Revert("Nothing to claim on this deal")
  return edit(state, (draft) => {
    const deal = getDeal(draft, input.dealId)
    const position = deal.positions.find(
      (item) => item.investorId === input.investorId,
    ) as Deal["positions"][number]
    position.claimed = amount
    log(deal, ctx, "Investor paid out", `${usdt(amount)} claimed`)
  })
}

export function onboardImporter(
  state: TradeState,
  input: { id: string; name: string; wallet: string; trustCodeBps: number },
  ctx: Ctx,
) {
  return edit(state, (draft) => {
    const rep = importerPrior(input.trustCodeBps)
    draft.parties.push({
      id: input.id,
      name: input.name,
      wallet: input.wallet,
      role: "importer",
      rep,
      trustCodeBps: input.trustCodeBps,
      history: [
        {
          at: ctx.now,
          dealId: "",
          scoreBps: scoreBps(rep),
          reason: "Onboarded with Trust Code",
        },
      ],
    })
  })
}

export function setAllowlisted(
  state: TradeState,
  input: { investorId: string; allowed: boolean },
) {
  return edit(state, (draft) => {
    getParty(draft, input.investorId).allowlisted = input.allowed
  })
}

export function newExporter(input: {
  id: string
  name: string
  wallet: string
  at: number
}): Party {
  const rep = exporterPrior()
  return {
    id: input.id,
    name: input.name,
    wallet: input.wallet,
    role: "exporter",
    rep,
    history: [
      { at: input.at, dealId: "", scoreBps: scoreBps(rep), reason: "New" },
    ],
  }
}

/** Appends to the hash-chained log, mirroring the plan's HCS audit topic. */
export function appendAudit(
  state: TradeState,
  entry: Pick<AuditEntry, "dealId" | "kind" | "message" | "amount" | "tx">,
  ctx: Ctx,
) {
  return edit(state, (draft) => {
    const prevHash = draft.audit[0]?.hash ?? "00000000"
    draft.audit.unshift({
      ...entry,
      id: `a-${draft.audit.length + 1}`,
      at: ctx.now,
      prevHash,
      hash: hashText(`${prevHash}:${entry.dealId}:${entry.message}`),
    })
    if (entry.tx) {
      log(
        getDeal(draft, entry.dealId),
        { now: ctx.now, tx: entry.tx },
        "Agent paid for the check",
        entry.message,
      )
    }
  })
}

/** Why the agent may not pay this quote, or null when the gate passes. */
export function gateCheck(state: TradeState, dealId: string, price: number) {
  const { perCall, perDeal, perDay } = state.limits
  const paid = state.audit.filter((entry) => entry.kind === "payment")
  const spentOnDeal = paid
    .filter((entry) => entry.dealId === dealId)
    .reduce((sum, entry) => sum + (entry.amount ?? 0), 0)
  const dayStart = (state.audit[0]?.at ?? 0) - 86_400_000
  const spentToday = paid
    .filter((entry) => entry.at > dayStart)
    .reduce((sum, entry) => sum + (entry.amount ?? 0), 0)
  if (spentOnDeal > 0) return "Already paid for this deal"
  if (price > perCall) return `Quote is above the ${perCall} USDC call limit`
  if (spentOnDeal + price > perDeal) return "Above the per-deal limit"
  if (spentToday + price > perDay) return "Above the daily limit"
  return null
}
