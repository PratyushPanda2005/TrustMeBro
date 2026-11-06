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
import { amount, usdt } from "@/lib/trade/format"
import { investorProfit } from "@/lib/trade/profit"
import { useTrade } from "@/lib/trade/store"

import { MonthlyBars } from "../charts"
import { DealTable } from "../deal-table"
import { PageHeader, StatCard, StatGrid, StateBadge } from "../parts"

const useInvestor = () => {
  const state = useTrade()
  return {
    state,
    profit: investorProfit(state, state.personas.investor),
    open: state.deals.filter((deal) => deal.state === "Verified"),
  }
}

export function InvestorOverview() {
  const { profit, open } = useInvestor()
  return (
    <>
      <PageHeader
        title="Investor overview"
        description="You replace the bank, on Whitechain testnet."
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
          label="Received"
          value={usdt(profit.received)}
          hint="Paid straight to your wallet"
          icon={Wallet}
        />
      </StatGrid>
      <Card>
        <CardHeader>
          <CardTitle>Open deals</CardTitle>
          <CardDescription>
            Shipments the contract has verified, looking for one investor
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
        description="Check the evidence, both scores and the terms before you fund."
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
      <PageHeader title="Portfolio" description="The receivables you funded." />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deal</TableHead>
                <TableHead>Goods</TableHead>
                <TableHead className="text-right">Principal (USDT)</TableHead>
                <TableHead className="text-right">Profit (USDT)</TableHead>
                <TableHead className="text-right">Paid back (USDT)</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profit.held.map((deal) => (
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
                    {amount(deal.terms?.advance ?? 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {amount(deal.terms?.profit ?? 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {deal.state === "Settled"
                      ? amount(deal.terms?.investorDue ?? 0)
                      : "-"}
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
        description="Yield earned on settled deals."
      />
      <StatGrid>
        <StatCard label="Yield earned" value={usdt(profit.earned)} />
        <StatCard label="Expected yield" value={usdt(profit.expected)} />
        <StatCard label="Deployed" value={usdt(profit.deployed)} />
        <StatCard label="Received" value={usdt(profit.received)} />
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
