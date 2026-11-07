"use client"

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
import { date } from "@/lib/trade/format"
import {
  MAX_SCORE,
  START_SCORE,
  estimateTerms,
  trustScoreView,
} from "@/lib/trade/score"
import { getParty, useMe, useTrade } from "@/lib/trade/store"

import { ScoreLine } from "./charts"
import { PageHeader, ScoreBadge, StatCard, StatGrid } from "./parts"

const EXAMPLE_INVOICE = 100
const EXAMPLE_SCORES = [
  { score: START_SCORE, label: "new" },
  { score: 80 },
  { score: MAX_SCORE, label: "maximum" },
]

const FORMULAS = [
  "Base = Invoice × 97%",
  "Advance = Base × Trust Score ÷ 100",
  "Investor profit = Advance × 3%",
  "Platform fee = Invoice × 1%",
  "Exporter final = Invoice − Advance − Investor profit − Platform fee",
]

const exact = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: 4 })

/** The importer's Trust Score, and how it turns into each party's payout. */
export function ScorePage() {
  const state = useTrade()
  const party = getParty(state, useMe())
  const view = trustScoreView(party.score)

  return (
    <>
      <PageHeader
        title="Trust Score"
        description={`Higher is better. New importers start at ${START_SCORE}, and the score is capped at ${MAX_SCORE}.`}
      />
      <StatGrid>
        <StatCard label="Trust Score" value={view.value} hint={view.band} />
        <StatCard
          label="Wallet balance"
          value={`${party.usdt.toFixed(2)} USDT`}
          hint={`${party.gas.toFixed(3)} WBT for gas`}
        />
        <StatCard label="Band" value={<ScoreBadge view={view} />} />
        <StatCard
          label="Funded deals"
          value={party.history.length}
          hint="Recorded onchain"
        />
      </StatGrid>
      <Card>
        <CardHeader>
          <CardTitle>How your score sets the payout</CardTitle>
          <CardDescription>
            Repaying builds your reputation, and default evidence can reduce it.
            A higher score gets the exporter more cash upfront.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {FORMULAS.map((formula) => (
              <li key={formula}>{formula}</li>
            ))}
          </ul>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>On a 100 USDT invoice</TableHead>
                <TableHead className="text-right">Exporter upfront</TableHead>
                <TableHead className="text-right">Investor profit</TableHead>
                <TableHead className="text-right">
                  Exporter after repayment
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {EXAMPLE_SCORES.map(({ score, label }) => {
                const terms = estimateTerms(EXAMPLE_INVOICE, score)
                return (
                  <TableRow key={score}>
                    <TableCell>
                      {score}
                      {label ? ` (${label})` : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {exact(terms.advance)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {exact(terms.profit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {exact(terms.exporterRemainder)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Trust Score over time</CardTitle>
          <CardDescription>The score each deal was funded at</CardDescription>
        </CardHeader>
        <CardContent>
          <ScoreLine history={party.history} label="Trust Score" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Deal</TableHead>
                <TableHead>Event</TableHead>
                <TableHead className="text-right">Trust Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...party.history].reverse().map((point) => (
                <TableRow key={`${point.at}-${point.reason}`}>
                  <TableCell>{date(point.at)}</TableCell>
                  <TableCell>{point.dealId || "-"}</TableCell>
                  <TableCell>{point.reason}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {point.score}
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
