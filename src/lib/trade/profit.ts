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

const same = (a?: string, b?: string) => a?.toLowerCase() === b?.toLowerCase()
const isFunded = (deal: Deal) => deal.fundedAt !== undefined
const settled = (deal: Deal) => deal.state === "Settled"

export function investorProfit(state: TradeState, investorId: string) {
  const held = state.deals.filter((deal) => same(deal.investorId, investorId))
  const live = held.filter((deal) => deal.state === "Funded")
  const profitOf = (deal: Deal) => deal.terms?.profit ?? 0
  const done = held.filter(settled)
  return {
    held,
    deployed: sum(live.map((deal) => deal.terms?.advance ?? 0)),
    expected: sum(live.map(profitOf)),
    earned: sum(done.map(profitOf)),
    received: sum(done.map((deal) => deal.terms?.investorDue ?? 0)),
    monthly: byMonth(
      done.map((deal) => ({
        at: deal.closedAt ?? deal.createdAt,
        key: "yield" as const,
        value: profitOf(deal),
      })),
      ["yield"],
    ),
  }
}

export function exporterProfit(state: TradeState, exporterId: string) {
  const deals = state.deals.filter((deal) => same(deal.exporterId, exporterId))
  const funded = deals.filter(isFunded)
  const done = deals.filter(settled)
  const advances = sum(funded.map((deal) => deal.terms?.advance ?? 0))
  const atSettlement = sum(
    done.map((deal) => deal.terms?.exporterRemainder ?? 0),
  )
  return {
    deals,
    advances,
    atSettlement,
    received: sum([advances, atSettlement]),
    cost: sum(
      done.map((deal) => (deal.terms?.fee ?? 0) + (deal.terms?.profit ?? 0)),
    ),
    monthly: byMonth(
      [
        ...funded.map((deal) => ({
          at: deal.fundedAt as number,
          key: "advance" as const,
          value: deal.terms?.advance ?? 0,
        })),
        ...done.map((deal) => ({
          at: deal.closedAt ?? deal.createdAt,
          key: "settlement" as const,
          value: deal.terms?.exporterRemainder ?? 0,
        })),
      ],
      ["advance", "settlement"],
    ),
  }
}

export function importerPayments(state: TradeState, importerId: string) {
  const deals = state.deals.filter((deal) => same(deal.importerId, importerId))
  const paid = deals.filter(settled)
  const due = deals.filter((deal) => deal.state === "Funded")
  return {
    deals,
    paid,
    due,
    totalPaid: sum(paid.map((deal) => deal.amount)),
    totalDue: sum(due.map((deal) => deal.amount)),
    monthly: byMonth(
      paid.map((deal) => ({
        at: deal.closedAt ?? deal.createdAt,
        key: "paid" as const,
        value: deal.amount,
      })),
      ["paid"],
    ),
  }
}

export function platformProfit(state: TradeState) {
  const funded = state.deals.filter(isFunded)
  const done = state.deals.filter(settled)
  const checks = state.deals.filter((deal) => deal.check).length
  return {
    funded,
    done,
    fees: sum(done.map((deal) => deal.terms?.fee ?? 0)),
    volume: sum(funded.map((deal) => deal.terms?.advance ?? 0)),
    checks,
    checkCost: Math.round(checks * VERIFY_PRICE * 100) / 100,
    monthly: byMonth(
      done.map((deal) => ({
        at: deal.closedAt ?? deal.createdAt,
        key: "fees" as const,
        value: deal.terms?.fee ?? 0,
      })),
      ["fees"],
    ),
  }
}
