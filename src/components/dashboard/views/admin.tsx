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
import { amount, dateTime, shortHash, usdt } from "@/lib/trade/format"
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
        description="Wallets with a role on Finance V2, read from its RoleGranted events."
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
                <TableHead className="text-right">USDT</TableHead>
                <TableHead className="text-right">WBT</TableHead>
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
                    {amount(party.usdt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {party.gas.toFixed(3)}
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
        <StatCard label="Trades checked" value={profit.checks} />
        <StatCard
          label="Answers ready to relay"
          value={state.relays.length}
          hint="Paid and signed by the verifier"
        />
        <StatCard label="Waiting on a human" value={state.pending.length} />
        <StatCard
          label="Hedera agent"
          value={state.agentOnline ? "Online" : "Offline"}
          hint={
            state.agentOnline
              ? "Paying over x402"
              : "Run it to buy checks over x402"
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
        <Card className="h-fit lg:col-span-3">
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
            mirror node. Some entries come from earlier test runs.
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
        description="1% of each invoice, paid to the treasury when a deal settles."
      />
      <StatGrid>
        <StatCard
          label="Fees earned"
          value={usdt(profit.fees)}
          hint={`${profit.done.length} settled deals`}
        />
        <StatCard label="Advanced by investors" value={usdt(profit.volume)} />
        <StatCard label="Funded deals" value={profit.funded.length} />
        <StatCard label="Settled deals" value={profit.done.length} />
      </StatGrid>
      <Card>
        <CardHeader>
          <CardTitle>Fees by month</CardTitle>
          <CardDescription>USDT, by settlement date</CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyBars
            data={profit.monthly}
            series={[{ key: "fees", label: "Fees" }]}
          />
        </CardContent>
      </Card>
    </>
  )
}
