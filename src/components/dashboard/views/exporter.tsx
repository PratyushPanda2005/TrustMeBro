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
import { usdt } from "@/lib/trade/format"
import { exporterProfit } from "@/lib/trade/profit"
import { estimateTerms } from "@/lib/trade/score"
import { actions, getParty, useMe, useTrade } from "@/lib/trade/store"

import { MonthlyBars } from "../charts"
import { DealTable } from "../deal-table"
import { PageHeader, StatCard, StatGrid } from "../parts"

const useExporter = () => {
  const state = useTrade()
  const me = useMe()
  return { state, me, profit: exporterProfit(state, me) }
}

export function ExporterOverview() {
  const { profit } = useExporter()
  const last = profit.deals.find((deal) => deal.terms)
  const active = profit.deals.filter(
    (deal) =>
      !["Settled", "Closed", "Rejected", "Defaulted"].includes(deal.state),
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
          label="Importer Trust Score"
          value={last?.terms?.score ?? "-"}
          hint="On your latest deal. It sets the advance"
          icon={Gauge}
        />
        <StatCard
          label="Advances"
          value={usdt(profit.advances)}
          hint="Paid when an investor funds"
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
          hint="Paid when an investor funds"
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

const emptyInvoice = {
  invoiceNumber: "",
  goods: "",
  amount: "",
  quantity: "",
  unit: "kg",
  shipmentReference: "",
  issuer: "",
  recordId: "",
}

const fields: {
  key: keyof typeof emptyInvoice
  label: string
  hint?: string
  type?: string
}[] = [
  {
    key: "invoiceNumber",
    label: "Invoice number",
    hint: "Its hash is stored, so an invoice can't be financed twice.",
  },
  { key: "goods", label: "Goods" },
  { key: "amount", label: "Amount (USDT)", type: "number" },
  { key: "quantity", label: "Quantity", type: "number" },
  { key: "unit", label: "Unit" },
  { key: "shipmentReference", label: "Shipment reference" },
  {
    key: "issuer",
    label: "Record issuer",
    hint: "Who issued the shipping record.",
  },
  { key: "recordId", label: "Record ID" },
]

export function ExporterNewInvoice() {
  const state = useTrade()
  const router = useRouter()
  const exporter = getParty(state, useMe())
  const importers = state.parties
    .filter((party) => party.role === "importer" && party.active)
    .map((party) => ({ value: party.id, label: party.name }))
  const [form, setForm] = useState(emptyInvoice)
  const [importerId, setImporterId] = useState(importers[0]?.value ?? "")
  const [busy, setBusy] = useState(false)
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const importer = importerId ? getParty(state, importerId) : undefined
  const value = Number(form.amount) || 0
  const dealScore = importer?.score ?? 60
  const terms = estimateTerms(value, dealScore)
  const tooBig = importer ? value > importer.usdt : false
  const ready =
    Object.values(form).every((item) => item.trim()) &&
    value > 0 &&
    Number(form.quantity) > 0 &&
    importerId

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const ok = await actions.createInvoice({
      ...form,
      exporter: exporter.id,
      importer: importerId,
    })
    setBusy(false)
    if (ok) router.push("/dashboard/exporter/deals")
  }

  return (
    <>
      <PageHeader
        title="New invoice"
        description="You sign this in your wallet. Nothing moves until the importer confirms it onchain."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent>
            <form onSubmit={submit}>
              <FieldGroup>
                {fields.map((field) => (
                  <Field key={field.key}>
                    <FieldLabel htmlFor={field.key}>{field.label}</FieldLabel>
                    <Input
                      id={field.key}
                      type={field.type}
                      min={field.type ? "0" : undefined}
                      step={field.key === "amount" ? "0.01" : undefined}
                      value={form[field.key]}
                      onChange={(event) => set(field.key)(event.target.value)}
                    />
                    {field.hint ? (
                      <FieldDescription>{field.hint}</FieldDescription>
                    ) : null}
                  </Field>
                ))}
                <Field>
                  <FieldLabel>Importer</FieldLabel>
                  <Select
                    value={importerId}
                    items={importers}
                    onValueChange={(next) => next && setImporterId(next)}
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
                  {tooBig && importer ? (
                    <FieldDescription>
                      This importer holds {usdt(importer.usdt)}, so they
                      couldn&apos;t repay this invoice.
                    </FieldDescription>
                  ) : null}
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
              At the importer&apos;s Trust Score of {dealScore}. The contract
              sets the real quote after verification.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="flex justify-between">
              <span className="text-muted-foreground">Advance</span>
              {usdt(terms.advance)}
            </p>
            <p className="flex justify-between">
              <span className="text-muted-foreground">Investor profit</span>
              {usdt(terms.profit)}
            </p>
            <p className="flex justify-between">
              <span className="text-muted-foreground">Platform fee</span>
              {usdt(terms.fee)}
            </p>
            <p className="flex justify-between">
              <span className="text-muted-foreground">At settlement</span>
              {usdt(terms.exporterRemainder)}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
