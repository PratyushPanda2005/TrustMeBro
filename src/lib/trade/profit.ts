import { claimable, raised } from "./engine"
import { BPS, VERIFY_PRICE } from "./score"
import { month } from "./format"
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

const settled = (deal: Deal) => deal.state === "Settled"

export function investorProfit(state: TradeState, investorId: string) {
  const held = state.deals.flatMap((deal) =>
    deal.positions
      .filter((position) => position.investorId === investorId)
      .map((position) => ({ deal, position })),
  )
  const live = held.filter(({ deal }) =>
    ["Funding", "Funded", "Shipped", "Released"].includes(deal.state),
  )
  const yieldOf = ({ deal, position }: (typeof held)[number]) =>
    Math.round(position.amount * (deal.terms?.yieldBps ?? 0)) / BPS
  const realised = held.filter(({ deal }) => settled(deal))
  return {
    held,
    deployed: sum(live.map(({ position }) => position.amount)),
    expected: sum(live.map(yieldOf)),
    earned: sum(realised.map(yieldOf)),
    claimable: sum(held.map(({ deal }) => claimable(deal, investorId))),
    monthly: byMonth(
      realised.map((item) => ({
        at: item.deal.settledAt as number,
        key: "yield" as const,
        value: yieldOf(item),
      })),
      ["yield"],
    ),
  }
}

export function exporterProfit(state: TradeState, exporterId: string) {
  const deals = state.deals.filter((deal) => deal.exporterId === exporterId)
  const released = deals.filter((deal) => deal.releasedAt)
  const done = deals.filter(settled)
  const advances = sum(released.map((deal) => deal.target))
  const atSettlement = sum(done.map((deal) => deal.waterfall?.exporter ?? 0))
  return {
    deals,
    advances,
    atSettlement,
    received: sum([advances, atSettlement]),
    cost: sum(
      done.map(
        (deal) => deal.amount - deal.target - (deal.waterfall?.exporter ?? 0),
      ),
    ),
    monthly: byMonth(
      [
        ...released.map((deal) => ({
          at: deal.releasedAt as number,
          key: "advance" as const,
          value: deal.target,
        })),
        ...done.map((deal) => ({
          at: deal.settledAt as number,
          key: "settlement" as const,
          value: deal.waterfall?.exporter ?? 0,
        })),
      ],
      ["advance", "settlement"],
    ),
  }
}

export function importerPayments(state: TradeState, importerId: string) {
  const deals = state.deals.filter((deal) => deal.importerId === importerId)
  const paid = deals.filter(settled)
  const due = deals.filter((deal) => deal.state === "Released")
  return {
    deals,
    paid,
    due,
    totalPaid: sum(paid.map((deal) => deal.amount)),
    totalDue: sum(due.map((deal) => deal.amount)),
    monthly: byMonth(
      paid.map((deal) => ({
        at: deal.settledAt as number,
        key: "paid" as const,
        value: deal.amount,
      })),
      ["paid"],
    ),
  }
}

export function platformProfit(state: TradeState) {
  const done = state.deals.filter(settled)
  const payments = state.audit.filter((entry) => entry.kind === "payment")
  const agentSpend = sum(payments.map((entry) => entry.amount ?? VERIFY_PRICE))
  return {
    done,
    fees: sum(done.map((deal) => deal.waterfall?.fee ?? 0)),
    volume: sum(state.deals.map(raised)),
    agentSpend,
    checks: payments.length,
    monthly: byMonth(
      done.map((deal) => ({
        at: deal.settledAt as number,
        key: "fees" as const,
        value: deal.waterfall?.fee ?? 0,
      })),
      ["fees"],
    ),
  }
}
