import { month } from "./format"
import { VERIFY_PRICE } from "./score"
import type { Deal, TradeState } from "./types"

type Row = Record<string, number | string>

/** Totals per month, in calendar order, for the months that have data. */
function byMonth<T extends string>(
  entries: { at: number; key: T; value: number }[],
  keys: readonly T[],
): Row[] {
  const sorted = [...entries].sort((a, b) => a.at - b.at)
  const rows = new Map<string, Row>()
  for (const entry of sorted) {
    const label = month(entry.at)
    const row =
      rows.get(label) ??
      ({
        month: label,
        ...Object.fromEntries(keys.map((key) => [key, 0])),
      } as Row)
    row[entry.key] =
      Math.round(((row[entry.key] as number) + entry.value) * 100) / 100
    rows.set(label, row)
  }
  return [...rows.values()]
}

const sum = (values: number[]) =>
  Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100

const isFunded = (deal: Deal) => deal.fundedAt !== undefined
const settled = (deal: Deal) => deal.state === "Settled"

export function investorProfit(state: TradeState, investorId: string) {
  const held = state.deals.filter((deal) => deal.investorId === investorId)
  const live = held.filter((deal) => deal.state === "Funded")
  const yieldOf = (deal: Deal) => deal.terms?.yieldAmount ?? 0
  const done = held.filter(settled)
  return {
    held,
    deployed: sum(live.map((deal) => deal.terms?.advance ?? 0)),
    expected: sum(live.map(yieldOf)),
    earned: sum(done.map(yieldOf)),
    received: sum(held.map((deal) => deal.paidToInvestor)),
    monthly: byMonth(
      done.map((deal) => ({
        at: deal.closedAt ?? deal.dueAt,
        key: "yield" as const,
        value: yieldOf(deal),
      })),
      ["yield"],
    ),
  }
}

export function exporterProfit(state: TradeState, exporterId: string) {
  const deals = state.deals.filter((deal) => deal.exporterId === exporterId)
  const funded = deals.filter(isFunded)
  const rest = (deal: Deal) => deal.paid - deal.paidToInvestor
  const advances = sum(funded.map((deal) => deal.terms?.exporterNet ?? 0))
  const atSettlement = sum(funded.map(rest))
  return {
    deals,
    advances,
    atSettlement,
    received: sum([advances, atSettlement]),
    cost: sum(
      deals
        .filter(settled)
        .map((deal) => (deal.terms?.fee ?? 0) + (deal.terms?.yieldAmount ?? 0)),
    ),
    monthly: byMonth(
      [
        ...funded.map((deal) => ({
          at: deal.fundedAt as number,
          key: "advance" as const,
          value: deal.terms?.exporterNet ?? 0,
        })),
        ...funded
          .filter((deal) => rest(deal) > 0)
          .map((deal) => ({
            at: deal.closedAt ?? (deal.fundedAt as number),
            key: "settlement" as const,
            value: rest(deal),
          })),
      ],
      ["advance", "settlement"],
    ),
  }
}

export function importerPayments(state: TradeState, importerId: string) {
  const deals = state.deals.filter((deal) => deal.importerId === importerId)
  const paid = deals.filter(settled)
  const due = deals.filter(
    (deal) => deal.state === "Funded" || deal.state === "Defaulted",
  )
  return {
    deals,
    paid,
    due,
    totalPaid: sum(deals.map((deal) => deal.paid)),
    totalDue: sum(due.map((deal) => deal.amount - deal.paid)),
    monthly: byMonth(
      paid.map((deal) => ({
        at: deal.closedAt ?? deal.dueAt,
        key: "paid" as const,
        value: deal.amount,
      })),
      ["paid"],
    ),
  }
}

export function platformProfit(state: TradeState) {
  const funded = state.deals.filter(isFunded)
  const checks = state.deals.reduce((total, deal) => total + deal.checks, 0)
  const terms = (pick: (deal: Deal) => number) => sum(funded.map(pick))
  return {
    funded,
    done: state.deals.filter(settled),
    fees: terms((deal) => deal.terms?.fee ?? 0),
    platform: terms((deal) => deal.terms?.platformFee ?? 0),
    reserve: terms((deal) => deal.terms?.reserveFee ?? 0),
    agentFees: terms(
      (deal) => (deal.terms?.agentFee ?? 0) + (deal.terms?.gasFee ?? 0),
    ),
    volume: terms((deal) => deal.terms?.advance ?? 0),
    checks,
    checkCost: Math.round(checks * VERIFY_PRICE * 100) / 100,
    monthly: byMonth(
      funded.map((deal) => ({
        at: deal.fundedAt as number,
        key: "fees" as const,
        value: deal.terms?.platformFee ?? 0,
      })),
      ["fees"],
    ),
  }
}
