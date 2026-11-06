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
import { date, pct } from "@/lib/trade/format"
import { partyScoreView, riskFromTrust } from "@/lib/trade/score"
import { getParty, useTrade } from "@/lib/trade/store"

import { ScoreLine } from "./charts"
import { PageHeader, ScoreBadge, StatCard, StatGrid } from "./parts"

/** Score detail for exporters (Trust Score) and importers (Risk Score). */
export function ScorePage({ role }: { role: "exporter" | "importer" }) {
  const state = useTrade()
  const party = getParty(state, state.personas[role])
  const view = partyScoreView(party)
  const exporter = role === "exporter"
  const shown = (bps: number) => (exporter ? bps : riskFromTrust(bps))

  return (
    <>
      <PageHeader
        title={view.label}
        description={
          exporter
            ? "Higher is better. It sets your advance, and a falsified claim drops it for good."
            : "Lower is better. It's the yield investors earn on your deals, and on-time payments reduce it."
        }
      />
      <StatGrid>
        <StatCard label={view.label} value={pct(view.bps)} hint={view.band} />
        {exporter ? (
          <StatCard
            label="Advance you qualify for"
            value={pct(party.advanceBps)}
            hint="Your score, capped at 90%"
          />
        ) : (
          <StatCard
            label="Yield investors earn"
            value={pct(party.riskBps)}
            hint="Always between 2% and 8%"
          />
        )}
        <StatCard label="Band" value={<ScoreBadge view={view} />} />
        <StatCard
          label="Recorded events"
          value={party.history.length}
          hint="Recorded onchain"
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
