"use client"

import { Bot, Coins, Files, ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
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
import { amount, dateTime, pct, shortHash, usdt } from "@/lib/trade/format"
import { platformProfit } from "@/lib/trade/profit"
import { actions, useTrade } from "@/lib/trade/store"

import { AuditTable } from "../audit-table"
import { MonthlyBars } from "../charts"
import { DealTable } from "../deal-table"
import { PageHeader, PartyScore, StatCard, StatGrid } from "../parts"

export function AdminOverview() {
  const state = useTrade()
  const profit = platformProfit(state)
  const disputed = state.deals.filter((deal) =>
    ["Rejected", "Defaulted"].includes(deal.state),
  )
  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Every deal, party and agent action."
      />
      <StatGrid>
        <StatCard
          label="Deals"
          value={state.deals.length}
          hint={`${profit.done.length} settled`}
          icon={Files}
        />
        <StatCard
          label="USDT funded"
          value={usdt(profit.volume)}
          icon={Coins}
        />
        <StatCard
          label="Rejected and defaulted"
          value={disputed.length}
          icon={ShieldAlert}
        />
        <StatCard
          label="Waiting on a human"
          value={state.pending.length}
          hint="Payments over a limit"
          icon={Bot}
        />
      </StatGrid>
      <Card>
        <CardHeader>
          <CardTitle>Latest deals</CardTitle>
        </CardHeader>
        <CardContent>
          <DealTable role="admin" deals={state.deals.slice(0, 6)} />
        </CardContent>
      </Card>
    </>
  )
}

export function AdminDeals() {
  const state = useTrade()
  return (
    <>
      <PageHeader title="All deals" description="Across every party." />
      <Card>
        <CardContent>
          <DealTable role="admin" deals={state.deals} />
        </CardContent>
      </Card>
    </>
  )
}

export function AdminParties() {
  const state = useTrade()
  return (
    <>
      <PageHeader
        title="Parties"
        description="KYC allowlist: one address, one role. Scores change only through the formula."
      />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Party</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Wallet</TableHead>
                <TableHead>Score</TableHead>
                <TableHead className="text-right">Credit left (USDT)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.parties.map((party) => (
                <TableRow key={party.id}>
                  <TableCell className="font-medium">{party.name}</TableCell>
                  <TableCell className="capitalize">{party.role}</TableCell>
                  <TableCell>
                    <code className="font-mono text-xs text-muted-foreground">
                      {shortHash(party.id)}
                    </code>
                  </TableCell>
                  <TableCell>
                    {party.role === "investor" ? (
                      "-"
                    ) : (
                      <PartyScore party={party} />
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {party.role === "exporter"
                      ? amount(party.availableCredit)
                      : "-"}
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

const SPENDING_LIMITS = [
  { label: "Per call", value: "1.00 USDC" },
  { label: "Per deal", value: "1.00 USDC, 3 checks" },
  { label: "Per day", value: "10.00 USDC" },
  { label: "Per exporter", value: "5 checks a day" },
]

export function AdminAgent() {
  const state = useTrade()
  const profit = platformProfit(state)
  return (
    <>
      <PageHeader
        title="Agent"
        description="The agent pays for checks and delivers them. The contract judges."
      />
      <StatGrid>
        <StatCard label="Checks relayed" value={profit.checks} />
        <StatCard
          label="Cost of those checks"
          value={`${profit.checkCost.toFixed(2)} USDC`}
          hint="At 0.30 USDC each"
        />
        <StatCard label="Waiting on a human" value={state.pending.length} />
        <StatCard
          label="Hedera agent"
          value={state.agentOnline ? "Online" : "Offline"}
          hint={
            state.agentOnline
              ? "Paying over x402"
              : "Local stand-in is relaying checks"
          }
        />
      </StatGrid>
      {state.pending.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Human approval queue</CardTitle>
            <CardDescription>
              Prices over the limits. Nothing is paid until you approve.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deal</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Price (USDC)</TableHead>
                  <TableHead className="text-right">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.pending.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.dealId}</TableCell>
                    <TableCell>{dateTime(item.at)}</TableCell>
                    <TableCell className="whitespace-normal">
                      {item.reason}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {amount(item.price)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => actions.approvePayment(item.id)}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => actions.rejectPayment(item.id)}
                        >
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Agent activity</CardTitle>
            <CardDescription>
              This chain&apos;s checks, hash-chained, newest first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AuditTable entries={state.audit.slice(0, 20)} />
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Spending limits</CardTitle>
            <CardDescription>
              Set in the agent&apos;s configuration, and checked before every
              payment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3 text-sm">
              {SPENDING_LIMITS.map((limit) => (
                <div key={limit.label} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{limit.label}</dt>
                  <dd>{limit.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Hedera audit topic</CardTitle>
          <CardDescription>
            Real payments from topic {state.hedera.topicId}, read live from the
            mirror node. Their deal numbers come from past test runs, not this
            chain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state.hedera.entries.length > 0 ? (
            <AuditTable entries={state.hedera.entries} />
          ) : (
            <p className="text-sm text-muted-foreground">
              The mirror node didn&apos;t answer.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  )
}

export function AdminFees() {
  const state = useTrade()
  const profit = platformProfit(state)
  return (
    <>
      <PageHeader
        title="Platform fees"
        description="1% of each advance, split by the contract at funding."
      />
      <StatGrid>
        <StatCard
          label="Fees taken"
          value={usdt(profit.fees)}
          hint={`${profit.funded.length} funded deals`}
        />
        <StatCard
          label="Platform profit"
          value={usdt(profit.platform)}
          hint="What's left after the split"
        />
        <StatCard
          label="Reserve fund"
          value={usdt(profit.reserve)}
          hint="20% after agent and gas"
        />
        <StatCard
          label="Agent and gas"
          value={usdt(profit.agentFees)}
          hint="1.50 USDT per deal"
        />
      </StatGrid>
      <Card>
        <CardHeader>
          <CardTitle>Platform profit by month</CardTitle>
          <CardDescription>USDT, by funding date</CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyBars
            data={profit.monthly}
            series={[{ key: "fees", label: "Profit" }]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Parties</CardTitle>
          <CardDescription>Trust as the contract holds it</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Party</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Raw score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.parties
                .filter((party) => party.role !== "investor")
                .map((party) => (
                  <TableRow key={party.id}>
                    <TableCell className="font-medium">{party.name}</TableCell>
                    <TableCell className="capitalize">{party.role}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pct(party.trustBps)}
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
