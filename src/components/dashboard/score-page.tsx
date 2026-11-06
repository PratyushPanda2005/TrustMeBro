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
import { getParty } from "@/lib/trade/engine"
import { date, pct } from "@/lib/trade/format"
import { dealTerms, partyScoreView, riskBps, scoreBps } from "@/lib/trade/score"
import { personas } from "@/lib/trade/seed"
import { useTrade } from "@/lib/trade/store"

import { ScoreLine } from "./charts"
import { PageHeader, ScoreBadge, StatCard, StatGrid } from "./parts"

/** Score detail for exporters (Risk Score) and importers (Trust Score). */
export function ScorePage({ role }: { role: "exporter" | "importer" }) {
  const state = useTrade()
  const party = getParty(state, personas[role])
  const view = partyScoreView(party)
  const trust = scoreBps(party.rep)
  const exporter = role === "exporter"
  const terms = exporter ? dealTerms(trust, 5_000) : dealTerms(5_000, trust)
  const shown = (bps: number) => (exporter ? riskBps(bps) : bps)

  return (
    <>
      <PageHeader
        title={view.label}
        description={
          exporter
            ? "Lower is safer. Honest deals bring it down, and a falsified claim sends it up."
            : "Higher is better. On-time payments lift it and lower the yield investors need."
        }
      />
      <StatGrid>
        <StatCard label={view.label} value={pct(view.bps)} hint={view.band} />
        {exporter ? (
          <StatCard
            label="Advance you qualify for"
            value={pct(terms.advanceBps, 1)}
            hint="From 60% up to 90%"
          />
        ) : (
          <StatCard
            label="Yield your score sets"
            value={pct(terms.yieldBps)}
            hint="From 5% down to 2%"
          />
        )}
        <StatCard label="Band" value={<ScoreBadge view={view} />} />
        <StatCard
          label="Recorded events"
          value={party.history.length}
          hint="Stored onchain at integration"
        />
      </StatGrid>
      <Card>
        <CardHeader>
          <CardTitle>{view.label} over time</CardTitle>
          <CardDescription>After each recorded event</CardDescription>
        </CardHeader>
        <CardContent>
          <ScoreLine
            history={party.history}
            label={view.label}
            transform={shown}
          />
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
                <TableHead className="text-right">{view.label}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...party.history].reverse().map((point) => (
                <TableRow key={`${point.at}-${point.reason}`}>
                  <TableCell>{date(point.at)}</TableCell>
                  <TableCell>{point.dealId || "-"}</TableCell>
                  <TableCell>{point.reason}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(shown(point.scoreBps))}
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
