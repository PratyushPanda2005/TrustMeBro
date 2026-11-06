"use client"

import { CalendarClock, ClipboardCheck, Gauge, Wallet } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { pct, usdt } from "@/lib/trade/format"
import { importerPayments } from "@/lib/trade/profit"
import { importerScoreView } from "@/lib/trade/score"
import { getParty, useTrade } from "@/lib/trade/store"

import { MonthlyBars } from "../charts"
import { DealTable } from "../deal-table"
import { PageHeader, StatCard, StatGrid } from "../parts"

const useImporter = () => {
  const state = useTrade()
  const data = importerPayments(state, state.personas.importer)
  return {
    state,
    data,
    approvals: data.deals.filter((deal) => deal.state === "Created"),
  }
}

export function ImporterOverview() {
  const { state, data, approvals } = useImporter()
  const view = importerScoreView(
    getParty(state, state.personas.importer).riskBps,
  )
  return (
    <>
      <PageHeader
        title="Importer overview"
        description="Approve invoices onchain and pay on the due date."
      />
      <StatGrid>
        <StatCard
          label="Risk Score"
          value={pct(view.bps)}
          hint={view.band}
          icon={Gauge}
        />
        <StatCard
          label="Waiting on you"
          value={approvals.length}
          hint="Invoices to approve"
          icon={ClipboardCheck}
        />
        <StatCard
          label="Payments due"
          value={usdt(data.totalDue)}
          icon={CalendarClock}
        />
        <StatCard
          label="Paid so far"
          value={usdt(data.totalPaid)}
          icon={Wallet}
        />
      </StatGrid>
      <Card>
        <CardHeader>
          <CardTitle>Waiting on your approval</CardTitle>
        </CardHeader>
        <CardContent>
          <DealTable
            role="importer"
            deals={approvals}
            emptyText="You're all caught up."
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Payments due</CardTitle>
        </CardHeader>
        <CardContent>
          <DealTable
            role="importer"
            deals={data.due}
            emptyText="No payments are due."
          />
        </CardContent>
      </Card>
    </>
  )
}

export function ImporterApprovals() {
  const { approvals } = useImporter()
  return (
    <>
      <PageHeader
        title="Approvals"
        description="Approving accepts the debt. Nothing continues without it."
      />
      <Card>
        <CardContent>
          <DealTable
            role="importer"
            deals={approvals}
            emptyText="You're all caught up."
          />
        </CardContent>
      </Card>
    </>
  )
}

export function ImporterPayments() {
  const { state, data } = useImporter()
  const importer = getParty(state, state.personas.importer)
  return (
    <>
      <PageHeader
        title="Payments"
        description="Your invoices, and how your record sets the yield."
      />
      <StatGrid>
        <StatCard label="Payments due" value={usdt(data.totalDue)} />
        <StatCard label="Paid so far" value={usdt(data.totalPaid)} />
        <StatCard label="Invoices paid" value={data.paid.length} />
        <StatCard
          label="Risk Score"
          value={pct(importer.riskBps)}
          hint="Lower means cheaper trade"
        />
      </StatGrid>
      <Card>
        <CardHeader>
          <CardTitle>Paid by month</CardTitle>
          <CardDescription>USDT</CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyBars
            data={data.monthly}
            series={[{ key: "paid", label: "Paid" }]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>All invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <DealTable role="importer" deals={data.deals} />
        </CardContent>
      </Card>
    </>
  )
}
