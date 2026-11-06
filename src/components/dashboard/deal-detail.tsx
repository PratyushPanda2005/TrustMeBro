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
import { getParty, raised } from "@/lib/trade/engine"
import { date, dateTime, pct, usdt } from "@/lib/trade/format"
import { exporterScoreView, importerScoreView } from "@/lib/trade/score"
import { useTrade } from "@/lib/trade/store"
import type { Claims, Deal, Role } from "@/lib/trade/types"

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

const claimRows: { key: keyof Claims; label: string }[] = [
  { key: "weight", label: "Weight" },
  { key: "statusCode", label: "Status" },
  { key: "documents", label: "Documents" },
]

function Verdict({ value }: { value?: boolean }) {
  if (value === undefined)
    return <span className="text-muted-foreground">-</span>
  return (
    <Badge variant={value ? "secondary" : "destructive"}>
      {value ? (
        <Check data-icon="inline-start" />
      ) : (
        <X data-icon="inline-start" />
      )}
      {value ? "True" : "False"}
    </Badge>
  )
}

function ClaimsCard({ deal }: { deal: Deal }) {
  if (!deal.claims) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Claims check</CardTitle>
        <CardDescription>
          The contract compares what was claimed with what the verifier signed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-y-3 text-sm">
          <span className="text-muted-foreground">Check</span>
          <span className="text-muted-foreground">Claimed</span>
          <span className="text-muted-foreground">Observed</span>
          {claimRows.map((row) => (
            <div key={row.key} className="contents">
              <span>{row.label}</span>
              <span>
                <Verdict value={deal.claims?.[row.key]} />
              </span>
              <span>
                <Verdict value={deal.observed?.[row.key]} />
              </span>
            </div>
          ))}
        </div>
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
            {id} doesn&apos;t exist in this browser&apos;s demo data.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const exporter = getParty(state, deal.exporterId)
  const importer = getParty(state, deal.importerId)
  const percent = deal.target ? (raised(deal) / deal.target) * 100 : 0

  return (
    <>
      <PageHeader
        title={`${deal.id}: ${deal.goods}`}
        description={`${exporter.name} to ${importer.name}`}
      >
        <StateBadge state={deal.state} />
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <DealActions deal={deal} role={role} />
          <Card>
            <CardHeader>
              <CardTitle>Deal terms</CardTitle>
              <CardDescription>
                {deal.terms
                  ? "Fixed at approval. Later score changes never reprice this deal."
                  : "Set when the importer approves."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-3">
                <Row label="Invoice" value={usdt(deal.amount)} />
                <Row label="Reference" value={deal.invoiceRef} />
                <Row label="Due date" value={date(deal.dueAt)} />
                {deal.terms ? (
                  <>
                    <Separator />
                    <Row
                      label="Advance"
                      value={`${pct(deal.terms.advanceBps, 1)} (${usdt(deal.target)})`}
                    />
                    <Row
                      label="Investor yield"
                      value={pct(deal.terms.yieldBps)}
                    />
                    <Row
                      label="Exporter Risk Score at approval"
                      value={
                        <span className="flex items-center gap-2">
                          {pct(
                            exporterScoreView(deal.terms.exporterScoreBps).bps,
                          )}
                          <ScoreBadge
                            view={exporterScoreView(
                              deal.terms.exporterScoreBps,
                            )}
                          />
                        </span>
                      }
                    />
                    <Row
                      label="Importer Trust Score at approval"
                      value={
                        <span className="flex items-center gap-2">
                          {pct(deal.terms.importerScoreBps)}
                          <ScoreBadge
                            view={importerScoreView(
                              deal.terms.importerScoreBps,
                            )}
                          />
                        </span>
                      }
                    />
                  </>
                ) : null}
              </dl>
            </CardContent>
          </Card>
          {deal.target ? (
            <Card>
              <CardHeader>
                <CardTitle>Funding</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Progress value={percent}>
                  <ProgressLabel>Raised</ProgressLabel>
                  <ProgressValue />
                </Progress>
                <dl className="flex flex-col gap-3">
                  {deal.positions.map((position) => (
                    <Row
                      key={position.investorId}
                      label={getParty(state, position.investorId).name}
                      value={usdt(position.amount)}
                    />
                  ))}
                  <Row label="Target" value={usdt(deal.target)} />
                </dl>
              </CardContent>
            </Card>
          ) : null}
          <ClaimsCard deal={deal} />
          {deal.waterfall ? (
            <Card>
              <CardHeader>
                <CardTitle>Settlement waterfall</CardTitle>
                <CardDescription>
                  Paid in this order, in one transaction.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col gap-3">
                  <Row
                    label="Investors (principal + yield)"
                    value={usdt(deal.waterfall.investors)}
                  />
                  <Row label="Platform fee" value={usdt(deal.waterfall.fee)} />
                  <Row
                    label="Exporter (the rest)"
                    value={usdt(deal.waterfall.exporter)}
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
