"use client"

import Link from "next/link"
import { Coins, Landmark, TrendingUp, Wallet } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { amount, pct, usdt } from "@/lib/trade/format"
import { investorProfit } from "@/lib/trade/profit"
import { personas } from "@/lib/trade/seed"
import { useTrade } from "@/lib/trade/store"

import { MonthlyBars } from "../charts"
import { DealTable } from "../deal-table"
import { PageHeader, StatCard, StatGrid, StateBadge } from "../parts"

const useInvestor = () => {
  const state = useTrade()
  return {
    state,
    profit: investorProfit(state, personas.investor),
    open: state.deals.filter(
      (deal) => deal.state === "Approved" || deal.state === "Funding",
    ),
  }
}

export function InvestorOverview() {
  const { profit, open } = useInvestor()
  return (
    <>
      <PageHeader
        title="Investor overview"
        description="You replace the bank, and honesty sets the price."
      />
      <StatGrid>
        <StatCard
          label="Deployed"
          value={usdt(profit.deployed)}
          hint="In live deals"
          icon={Landmark}
        />
        <StatCard
          label="Yield earned"
          value={usdt(profit.earned)}
          icon={TrendingUp}
        />
        <StatCard
          label="Expected yield"
          value={usdt(profit.expected)}
          hint="From live deals"
          icon={Coins}
        />
        <StatCard
          label="Ready to claim"
          value={usdt(profit.claimable)}
          icon={Wallet}
        />
      </StatGrid>
      <Card>
        <CardHeader>
          <CardTitle>Open deals</CardTitle>
          <CardDescription>
            Approved invoices looking for funding
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DealTable
            role="investor"
            deals={open}
            variant="market"
            emptyText="No deals are open right now."
          />
        </CardContent>
      </Card>
    </>
  )
}

export function InvestorDeals() {
  const { open } = useInvestor()
  return (
    <>
      <PageHeader
        title="Open deals"
        description="Check both scores and the terms before you fund."
      />
      <Card>
        <CardContent>
          <DealTable
            role="investor"
            deals={open}
            variant="market"
            emptyText="No deals are open right now."
          />
        </CardContent>
      </Card>
    </>
  )
}

export function InvestorPortfolio() {
  const { profit } = useInvestor()
  return (
    <>
      <PageHeader
        title="Portfolio"
        description="Your fractional deal tokens."
      />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deal</TableHead>
                <TableHead>Goods</TableHead>
                <TableHead className="text-right">Principal (USDT)</TableHead>
                <TableHead className="text-right">Yield</TableHead>
                <TableHead className="text-right">Claimed (USDT)</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profit.held.map(({ deal, position }) => (
                <TableRow key={deal.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/investor/deals/${deal.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {deal.id}
                    </Link>
                  </TableCell>
                  <TableCell>{deal.goods}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {amount(position.amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(deal.terms?.yieldBps ?? 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {position.claimed === undefined
                      ? "-"
                      : amount(position.claimed)}
                  </TableCell>
                  <TableCell>
                    <StateBadge state={deal.state} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}

export function InvestorReturns() {
  const { profit } = useInvestor()
  return (
    <>
      <PageHeader
        title="Returns"
        description="Yield earned on settled deals. Refunds aren't profit, so they aren't counted."
      />
      <StatGrid>
        <StatCard label="Yield earned" value={usdt(profit.earned)} />
        <StatCard label="Expected yield" value={usdt(profit.expected)} />
        <StatCard label="Deployed" value={usdt(profit.deployed)} />
        <StatCard label="Ready to claim" value={usdt(profit.claimable)} />
      </StatGrid>
      <Card>
        <CardHeader>
          <CardTitle>Yield by month</CardTitle>
          <CardDescription>USDT, by settlement date</CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyBars
            data={profit.monthly}
            series={[{ key: "yield", label: "Yield" }]}
          />
        </CardContent>
      </Card>
    </>
  )
}
