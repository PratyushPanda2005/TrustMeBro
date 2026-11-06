"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CircleDollarSign,
  FilePlus2,
  Gauge,
  HandCoins,
  Receipt,
  Timer,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { getParty } from "@/lib/trade/engine"
import { pct, usdt } from "@/lib/trade/format"
import { exporterProfit } from "@/lib/trade/profit"
import { dealTerms, exporterScoreView, scoreBps } from "@/lib/trade/score"
import { personas } from "@/lib/trade/seed"
import { actions, useTrade } from "@/lib/trade/store"

import { MonthlyBars } from "../charts"
import { DealTable } from "../deal-table"
import { PageHeader, StatCard, StatGrid } from "../parts"

const useExporter = () => {
  const state = useTrade()
  return { state, profit: exporterProfit(state, personas.exporter) }
}

export function ExporterOverview() {
  const { state, profit } = useExporter()
  const trust = scoreBps(getParty(state, personas.exporter).rep)
  const risk = exporterScoreView(trust)
  const active = profit.deals.filter(
    (deal) =>
      !["Settled", "Cancelled", "Disputed", "Expired"].includes(deal.state),
  )
  return (
    <>
      <PageHeader
        title="Exporter overview"
        description="Get paid in minutes, not 60 days."
      >
        <Button
          nativeButton={false}
          render={<Link href="/dashboard/exporter/new" />}
        >
          <FilePlus2 data-icon="inline-start" />
          New invoice
        </Button>
      </PageHeader>
      <StatGrid>
        <StatCard
          label="Risk Score"
          value={pct(risk.bps)}
          hint={risk.band}
          icon={Gauge}
        />
        <StatCard
          label="Next advance"
          value={pct(dealTerms(trust, 5_000).advanceBps, 1)}
          hint="At your current score"
          icon={HandCoins}
        />
        <StatCard
          label="Total received"
          value={usdt(profit.received)}
          icon={CircleDollarSign}
        />
        <StatCard
          label="Active deals"
          value={active.length}
          hint={`${profit.deals.length} in total`}
          icon={Timer}
        />
      </StatGrid>
      <Card>
        <CardHeader>
          <CardTitle>Active deals</CardTitle>
          <CardDescription>Invoices in progress</CardDescription>
        </CardHeader>
        <CardContent>
          <DealTable role="exporter" deals={active} />
        </CardContent>
      </Card>
    </>
  )
}

export function ExporterDeals() {
  const { profit } = useExporter()
  return (
    <>
      <PageHeader
        title="My deals"
        description="Every invoice you've created."
      />
      <Card>
        <CardContent>
          <DealTable role="exporter" deals={profit.deals} />
        </CardContent>
      </Card>
    </>
  )
}

export function ExporterEarnings() {
  const { profit } = useExporter()
  return (
    <>
      <PageHeader
        title="Earnings"
        description="What your invoices have paid you so far."
      />
      <StatGrid>
        <StatCard label="Total received" value={usdt(profit.received)} />
        <StatCard
          label="Advances"
          value={usdt(profit.advances)}
          hint="Released on a matched check"
        />
        <StatCard
          label="At settlement"
          value={usdt(profit.atSettlement)}
          hint="What's left after the waterfall"
        />
        <StatCard
          label="Cost of finance"
          value={usdt(profit.cost)}
          hint="Investor yield + platform fee"
          icon={Receipt}
        />
      </StatGrid>
      <Card>
        <CardHeader>
          <CardTitle>Received by month</CardTitle>
          <CardDescription>USDT, advances and settlements</CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyBars
            data={profit.monthly}
            series={[
              { key: "advance", label: "Advance" },
              { key: "settlement", label: "Settlement" },
            ]}
          />
        </CardContent>
      </Card>
    </>
  )
}

export function ExporterNewInvoice() {
  const state = useTrade()
  const router = useRouter()
  const importers = state.parties
    .filter((party) => party.role === "importer")
    .map((party) => ({ value: party.id, label: party.name }))
  const [form, setForm] = useState({
    invoiceRef: "",
    goods: "",
    amount: "",
    dueAt: "",
    importerId: importers[0]?.value ?? "",
  })
  const [busy, setBusy] = useState(false)
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const trust = scoreBps(getParty(state, personas.exporter).rep)
  const importerTrust = form.importerId
    ? scoreBps(getParty(state, form.importerId).rep)
    : 5_000
  const terms = dealTerms(trust, importerTrust)
  const value = Number(form.amount) || 0
  const ready =
    form.invoiceRef && form.goods && value > 0 && form.dueAt && form.importerId

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const ok = await actions.createInvoice({
      invoiceRef: form.invoiceRef,
      goods: form.goods,
      amount: value,
      dueAt: Date.parse(`${form.dueAt}T09:00:00Z`),
      exporterId: personas.exporter,
      importerId: form.importerId,
    })
    setBusy(false)
    if (ok) router.push("/dashboard/exporter/deals")
  }

  return (
    <>
      <PageHeader
        title="New invoice"
        description="Nothing moves until the importer approves it onchain."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent>
            <form onSubmit={submit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="ref">Invoice reference</FieldLabel>
                  <Input
                    id="ref"
                    value={form.invoiceRef}
                    onChange={(event) => set("invoiceRef")(event.target.value)}
                  />
                  <FieldDescription>
                    Its hash is stored, so an invoice can&apos;t be financed
                    twice.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="goods">Goods</FieldLabel>
                  <Input
                    id="goods"
                    value={form.goods}
                    onChange={(event) => set("goods")(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="amount">Amount (USDT)</FieldLabel>
                  <Input
                    id="amount"
                    type="number"
                    min="1"
                    value={form.amount}
                    onChange={(event) => set("amount")(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="due">Due date</FieldLabel>
                  <Input
                    id="due"
                    type="date"
                    value={form.dueAt}
                    onChange={(event) => set("dueAt")(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Importer</FieldLabel>
                  <Select
                    value={form.importerId}
                    items={importers}
                    onValueChange={(next) => next && set("importerId")(next)}
                  >
                    <SelectTrigger aria-label="Importer" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {importers.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <div>
                  <Button type="submit" disabled={!ready || busy}>
                    {busy ? <Spinner data-icon="inline-start" /> : null}
                    Create invoice
                  </Button>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Estimated terms</CardTitle>
            <CardDescription>
              Fixed when the importer approves, from both scores.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="flex justify-between">
              <span className="text-muted-foreground">Advance</span>
              {pct(terms.advanceBps, 1)}
            </p>
            <p className="flex justify-between">
              <span className="text-muted-foreground">You receive first</span>
              {usdt((value * terms.advanceBps) / 10_000)}
            </p>
            <p className="flex justify-between">
              <span className="text-muted-foreground">Investor yield</span>
              {pct(terms.yieldBps)}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
