"use client"

import { CalendarClock, ClipboardCheck, Gauge, Wallet } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { usdt } from "@/lib/trade/format"
import { importerPayments } from "@/lib/trade/profit"
import { trustScoreView } from "@/lib/trade/score"
import { getParty, useMe, useTrade } from "@/lib/trade/store"

import { MonthlyBars } from "../charts"
import { DealTable } from "../deal-table"
import { PageHeader, StatCard, StatGrid } from "../parts"

const useImporter = () => {
  const state = useTrade()
  const me = useMe()
  const data = importerPayments(state, me)
  return {
    state,
    me,
    data,
    approvals: data.deals.filter((deal) => deal.state === "Created"),
  }
}

export function ImporterOverview() {
  const { state, me, data, approvals } = useImporter()
  const view = trustScoreView(getParty(state, me).score)
  return (
    <>
      <PageHeader
        title="Importer overview"
        description="Approve invoices onchain and pay on the due date."
      />
      <StatGrid>
        <StatCard
          label="Trust Score"
          value={view.value}
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
            action="Review"
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
            action="Repay"
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
        description="Confirming accepts the debt. Nothing continues without it."
      />
      <Card>
        <CardContent>
          <DealTable
            role="importer"
            deals={approvals}
            action="Review"
            emptyText="You're all caught up."
          />
        </CardContent>
      </Card>
    </>
  )
}

export function ImporterPayments() {
  const { state, me, data } = useImporter()
  const importer = getParty(state, me)
  return (
    <>
      <PageHeader
        title="Payments"
        description="Your invoices, and how your record sets the advance."
      />
      <StatGrid>
        <StatCard label="Payments due" value={usdt(data.totalDue)} />
        <StatCard label="Paid so far" value={usdt(data.totalPaid)} />
        <StatCard label="Invoices paid" value={data.paid.length} />
        <StatCard
          label="Trust Score"
          value={importer.score}
          hint="Higher means a bigger advance"
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
