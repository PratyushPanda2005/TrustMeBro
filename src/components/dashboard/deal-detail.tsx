"use client"

import { useParams } from "next/navigation"
import { Check, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { date, dateTime, pct, shortHash, usdt } from "@/lib/trade/format"
import {
  SHIPMENT_STATUS,
  exporterScoreView,
  importerScoreView,
} from "@/lib/trade/score"
import { getParty, useTrade } from "@/lib/trade/store"
import type { Deal, Role } from "@/lib/trade/types"

import { DealActions } from "./deal-actions"
import { PageHeader, ScoreBadge, StateBadge, TxHash } from "./parts"

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

function Verdict({ ok }: { ok: boolean }) {
  return (
    <Badge variant={ok ? "secondary" : "destructive"}>
      {ok ? <Check data-icon="inline-start" /> : <X data-icon="inline-start" />}
      {ok ? "Match" : "False"}
    </Badge>
  )
}

const FALSIFIED = { weight: 1, documents: 2, status: 4 }

/** What was claimed, what the world saw, and what the contract decided. */
function EvidenceCard({ deal }: { deal: Deal }) {
  const { claims, observed, evidence } = deal
  if (!claims) return null
  const rows = [
    {
      label: "Weight",
      claimed: `${claims.declaredKg.toLocaleString("en-US")} kg`,
      seen: observed ? `${observed.kg.toLocaleString("en-US")} kg` : "-",
      source: evidence?.weighbridge.source,
      bit: FALSIFIED.weight,
    },
    {
      label: "Status",
      claimed: SHIPMENT_STATUS[claims.status],
      seen: observed ? SHIPMENT_STATUS[observed.status] : "-",
      source: evidence?.tracking.source,
      bit: FALSIFIED.status,
    },
    {
      label: "Documents",
      claimed: shortHash(claims.docHash),
      seen: observed ? shortHash(observed.docHash) : "-",
      source: evidence?.documents.source,
      bit: FALSIFIED.documents,
    },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Evidence</CardTitle>
        <CardDescription>
          The agent bought this check. {deal.checks}{" "}
          {deal.checks === 1 ? "check" : "checks"} so far, container{" "}
          {claims.containerNo}. The contract compares it with the claims.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Check</TableHead>
              <TableHead>Claimed</TableHead>
              <TableHead>Observed</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableCell>
                  {row.label}
                  {row.source ? (
                    <span className="block text-xs text-muted-foreground">
                      {row.source}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>{row.claimed}</TableCell>
                <TableCell>{row.seen}</TableCell>
                <TableCell>
                  {observed ? (
                    <Verdict ok={(deal.falsifiedMask & row.bit) === 0} />
                  ) : (
                    "-"
                  )}
                </TableCell>
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
  const deal = state.deals.find((item) => item.id === id)

  if (!deal) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Deal not found</EmptyTitle>
          <EmptyDescription>
            Deal {id} isn&apos;t on this chain.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const exporter = getParty(state, deal.exporterId)
  const importer = getParty(state, deal.importerId)
  const percent = (deal.paid / deal.amount) * 100
  const terms = deal.terms

  return (
    <>
      <PageHeader
        title={`Deal ${deal.id}: ${deal.goods}`}
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
                  ? "Frozen at funding. Later score changes never reprice this deal."
                  : "Live from both scores. Frozen when an investor funds."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-3">
                <Row label="Invoice" value={usdt(deal.amount)} />
                <Row label="Reference" value={deal.invoiceRef} />
                <Row label="Due date" value={date(deal.dueAt)} />
                <Separator />
                <Row
                  label="Exporter Trust Score"
                  value={
                    <span className="flex items-center gap-2">
                      {pct(exporter.trustBps)}
                      <ScoreBadge view={exporterScoreView(exporter.trustBps)} />
                    </span>
                  }
                />
                <Row
                  label="Importer Risk Score"
                  value={
                    <span className="flex items-center gap-2">
                      {pct(importer.riskBps)}
                      <ScoreBadge view={importerScoreView(importer.riskBps)} />
                    </span>
                  }
                />
                {terms ? (
                  <>
                    <Separator />
                    <Row
                      label="Advance"
                      value={`${pct(terms.advanceBps)} (${usdt(terms.advance)})`}
                    />
                    <Row label="Platform fee" value={usdt(terms.fee)} />
                    <Row
                      label="Exporter receives now"
                      value={usdt(terms.exporterNet)}
                    />
                    <Row
                      label="Investor yield, per deal"
                      value={`${pct(terms.yieldBps)} (${usdt(terms.yieldAmount)})`}
                    />
                    <Row
                      label="Investor gets back"
                      value={usdt(terms.investorDue)}
                    />
                  </>
                ) : null}
              </dl>
            </CardContent>
          </Card>
          <EvidenceCard deal={deal} />
          {deal.fundedAt ? (
            <Card>
              <CardHeader>
                <CardTitle>Repayment</CardTitle>
                <CardDescription>
                  The investor is paid first, and the exporter gets the rest.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Progress value={percent}>
                  <ProgressLabel>Paid by the importer</ProgressLabel>
                  <ProgressValue />
                </Progress>
                <dl className="flex flex-col gap-3">
                  {deal.investorId ? (
                    <Row
                      label="Investor"
                      value={getParty(state, deal.investorId).name}
                    />
                  ) : null}
                  <Row
                    label="Paid to the investor"
                    value={usdt(deal.paidToInvestor)}
                  />
                  <Row
                    label="Paid to the exporter"
                    value={usdt(deal.paid - deal.paidToInvestor)}
                  />
                </dl>
              </CardContent>
            </Card>
          ) : null}
          {terms && deal.fundedAt ? (
            <Card>
              <CardHeader>
                <CardTitle>Fee split</CardTitle>
                <CardDescription>
                  Taken at funding, in one transaction.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col gap-3">
                  <Row label="AI agent wallet" value={usdt(terms.agentFee)} />
                  <Row label="Gas" value={usdt(terms.gasFee)} />
                  <Row label="Reserve fund" value={usdt(terms.reserveFee)} />
                  <Row
                    label="Platform profit"
                    value={usdt(terms.platformFee)}
                  />
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
