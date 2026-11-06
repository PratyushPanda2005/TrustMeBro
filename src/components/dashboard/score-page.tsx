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
import { partyScoreView } from "@/lib/trade/score"
import { getParty, useTrade } from "@/lib/trade/store"

import { ScoreLine } from "./charts"
import { PageHeader, ScoreBadge, StatCard, StatGrid } from "./parts"

/** Score detail for exporters (Trust Score) and importers (Risk Score). */
export function ScorePage({ role }: { role: "exporter" | "importer" }) {
  const state = useTrade()
  const party = getParty(state, state.personas[role])
  const view = partyScoreView(party)
  const exporter = role === "exporter"

  return (
    <>
      <PageHeader
        title={view.label}
        description={
          exporter
            ? "Higher is better. It comes from your Reputation record onchain."
            : "Lower is better. On-time repayment reduces it and lifts the deal score, which raises the advance."
        }
      />
      <StatGrid>
        <StatCard label={view.label} value={view.value} hint={view.band} />
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
          <CardTitle>Deal score over time</CardTitle>
          <CardDescription>The score each deal was funded at</CardDescription>
        </CardHeader>
        <CardContent>
          <ScoreLine history={party.history} label="Deal score" />
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
                <TableHead className="text-right">Deal score</TableHead>
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
