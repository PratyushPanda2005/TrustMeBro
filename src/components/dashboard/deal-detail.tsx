"use client"

import { useParams } from "next/navigation"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { date, dateTime, shortHash, usdt } from "@/lib/trade/format"
import { STAGES } from "@/lib/trade/score"
import { canView, getParty, useMe, useTrade } from "@/lib/trade/store"
import type { Deal, Role } from "@/lib/trade/types"

import { DealActions } from "./deal-actions"
import { PageHeader, StateBadge, TrustScore, TxHash } from "./parts"

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function Timeline({ deal }: { deal: Deal }) {
  return (
    <ol className="flex flex-col gap-4">
      {[...deal.events].reverse().map((event, index) => (
        <li key={`${event.at}-${index}`} className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">{event.label}</p>
          {event.detail ? (
            <p className="text-sm text-muted-foreground">{event.detail}</p>
          ) : null}
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {dateTime(event.at)}
            {event.tx ? <TxHash tx={event.tx} /> : null}
          </p>
        </li>
      ))}
    </ol>
  )
}

/** What the invoice committed to, and what the check recorded onchain. */
function EvidenceCard({ deal }: { deal: Deal }) {
  const { shipment, check } = deal
  const unit = shipment.unit ? ` ${shipment.unit}` : ""
  const rows = [
    {
      label: "Quantity",
      agreed: `${shipment.quantity.toLocaleString("en-US")}${unit}`,
      seen: check ? `${check.quantity.toLocaleString("en-US")}${unit}` : "-",
    },
    {
      label: "Stage",
      agreed: `At least ${STAGES[shipment.minimumStage]}`,
      seen: check ? STAGES[check.stage] : "-",
    },
    {
      label: "Documents",
      agreed: shortHash(shipment.documentHash),
      seen: check ? shortHash(check.documentHash) : "-",
    },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Evidence</CardTitle>
        <CardDescription>
          {check
            ? `Recorded by ${check.mode.replaceAll("_", " ").toLowerCase()}. Report ${shortHash(check.reportHash)}.`
            : "Not checked yet."}
          {deal.shipment.reference
            ? ` Shipment ${deal.shipment.reference}.`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Check</TableHead>
              <TableHead>Agreed</TableHead>
              <TableHead>Recorded</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableCell>{row.label}</TableCell>
                <TableCell>{row.agreed}</TableCell>
                <TableCell>{row.seen}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function DealDetail({ role }: { role: Role }) {
  const { id } = useParams<{ id: string }>()
  const state = useTrade()
  const me = useMe()
  const deal = state.deals.find((item) => item.id === id)

  if (!deal || !canView(deal, role, me)) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Deal not found</EmptyTitle>
          <EmptyDescription>
            Trade {id} isn&apos;t available to this wallet.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const exporter = getParty(state, deal.exporterId)
  const importer = getParty(state, deal.importerId)
  const terms = deal.terms

  return (
    <>
      <PageHeader
        title={`Trade ${deal.id}: ${deal.goods}`}
        description={`${exporter.name} to ${importer.name}`}
      >
        <StateBadge state={deal.state} />
      </PageHeader>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <DealActions deal={deal} role={role} />
          <Card>
            <CardHeader>
              <CardTitle>Deal terms</CardTitle>
              <CardDescription>
                {deal.fundedAt
                  ? "Frozen at funding."
                  : terms
                    ? "The contract's live quote. Frozen when an investor funds."
                    : "The contract quotes these once the shipment is verified."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-3">
                <Row label="Invoice" value={usdt(deal.amount)} />
                <Row label="Reference" value={deal.invoiceRef} />
                <Row label="Offer expires" value={date(deal.expiry)} />
                {deal.dueAt ? (
                  <Row label="Due date" value={date(deal.dueAt)} />
                ) : null}
                <Separator />
                <Row
                  label="Importer Trust Score"
                  value={<TrustScore party={importer} />}
                />
                {terms ? (
                  <>
                    <Separator />
                    <Row label="Trust Score used" value={terms.score} />
                    <Row label="Advance" value={usdt(terms.advance)} />
                    <Row label="Investor profit" value={usdt(terms.profit)} />
                    <Row
                      label="Investor gets back"
                      value={usdt(terms.investorDue)}
                    />
                    <Row label="Platform fee" value={usdt(terms.fee)} />
                    <Row
                      label="Exporter gets at settlement"
                      value={usdt(terms.exporterRemainder)}
                    />
                  </>
                ) : null}
              </dl>
            </CardContent>
          </Card>
          <EvidenceCard deal={deal} />
          {deal.investorId ? (
            <Card>
              <CardHeader>
                <CardTitle>Receivable</CardTitle>
                <CardDescription>
                  Whoever holds the note is paid first on repayment.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col gap-3">
                  <Row
                    label="Funded by"
                    value={getParty(state, deal.investorId).name}
                  />
                  {deal.holderId ? (
                    <Row
                      label="Repaid to"
                      value={getParty(state, deal.holderId).name}
                    />
                  ) : null}
                </dl>
              </CardContent>
            </Card>
          ) : null}
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <Timeline deal={deal} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
