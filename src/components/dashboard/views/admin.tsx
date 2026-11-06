"use client"

import { useState } from "react"
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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
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
import { scoreBps } from "@/lib/trade/score"
import { actions, useTrade } from "@/lib/trade/store"
import type { SpendLimits } from "@/lib/trade/types"

import { AuditTable } from "../audit-table"
import { MonthlyBars } from "../charts"
import { DealTable } from "../deal-table"
import { PageHeader, PartyScore, StatCard, StatGrid } from "../parts"

export function AdminOverview() {
  const state = useTrade()
  const profit = platformProfit(state)
  const disputed = state.deals.filter((deal) =>
    ["Disputed", "Defaulted"].includes(deal.state),
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
          label="Disputes and defaults"
          value={disputed.length}
          icon={ShieldAlert}
        />
        <StatCard
          label="Waiting on a human"
          value={state.pending.length}
          hint="Refused agent quotes"
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

export function AdminImporters() {
  const state = useTrade()
  const [name, setName] = useState("")
  const [code, setCode] = useState("80")
  const value = Number(code)
  const valid = name.trim() !== "" && value >= 1 && value <= 99
  const importers = state.parties.filter((party) => party.role === "importer")
  return (
    <>
      <PageHeader
        title="Importers"
        description="An importer's fixed Trust Code becomes their starting score."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Importer</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead className="text-right">Trust Code</TableHead>
                  <TableHead>Trust Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importers.map((party) => (
                  <TableRow key={party.id}>
                    <TableCell className="font-medium">{party.name}</TableCell>
                    <TableCell>
                      <code className="font-mono text-xs text-muted-foreground">
                        {shortHash(party.wallet)}
                      </code>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pct(party.trustCodeBps ?? 0, 0)}
                    </TableCell>
                    <TableCell>
                      <PartyScore party={party} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Onboard an importer</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="importer-name">Name</FieldLabel>
                <Input
                  id="importer-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="trust-code">Trust Code (%)</FieldLabel>
                <Input
                  id="trust-code"
                  type="number"
                  min="1"
                  max="99"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
                <FieldDescription>Fixed once onboarded.</FieldDescription>
              </Field>
              <div>
                <Button
                  disabled={!valid}
                  onClick={async () => {
                    const ok = await actions.onboardImporter(
                      name.trim(),
                      value * 100,
                    )
                    if (ok) setName("")
                  }}
                >
                  Onboard
                </Button>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

export function AdminInvestors() {
  const state = useTrade()
  const investors = state.parties.filter((party) => party.role === "investor")
  return (
    <>
      <PageHeader
        title="Investors"
        description="Only allowlisted wallets can buy or hold deal tokens."
      />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Investor</TableHead>
                <TableHead>Wallet</TableHead>
                <TableHead className="text-right">Allowlisted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {investors.map((party) => (
                <TableRow key={party.id}>
                  <TableCell className="font-medium">{party.name}</TableCell>
                  <TableCell>
                    <code className="font-mono text-xs text-muted-foreground">
                      {shortHash(party.wallet)}
                    </code>
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch
                      aria-label={`Allowlist ${party.name}`}
                      checked={party.allowlisted ?? false}
                      onCheckedChange={(checked) =>
                        actions.setAllowlisted(party.id, checked)
                      }
                    />
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

function LimitsForm({ limits }: { limits: SpendLimits }) {
  const [draft, setDraft] = useState(limits)
  const fields: { key: keyof SpendLimits; label: string }[] = [
    { key: "perCall", label: "Per call (USDC)" },
    { key: "perDeal", label: "Per deal (USDC)" },
    { key: "perDay", label: "Per day (USDC)" },
  ]
  return (
    <FieldGroup>
      {fields.map((field) => (
        <Field key={field.key}>
          <FieldLabel htmlFor={field.key}>{field.label}</FieldLabel>
          <Input
            id={field.key}
            type="number"
            min="0"
            step="0.1"
            value={draft[field.key]}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                [field.key]: Number(event.target.value),
              }))
            }
          />
        </Field>
      ))}
      <div>
        <Button variant="outline" onClick={() => actions.setLimits(draft)}>
          Save limits
        </Button>
      </div>
    </FieldGroup>
  )
}

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
        <StatCard label="Checks paid" value={profit.checks} />
        <StatCard
          label="Agent spend"
          value={`${profit.agentSpend.toFixed(2)} USDC`}
        />
        <StatCard label="Waiting on a human" value={state.pending.length} />
        <StatCard label="Log entries" value={state.audit.length} />
      </StatGrid>
      {state.pending.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Human approval queue</CardTitle>
            <CardDescription>Quotes the spending gate refused.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deal</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead className="text-right">Quote (USDC)</TableHead>
                  <TableHead className="text-right">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.pending.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.dealId}</TableCell>
                    <TableCell>{dateTime(item.at)}</TableCell>
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
            <CardTitle>Audit log</CardTitle>
            <CardDescription>
              Hash-chained, newest first. Writes to HCS at integration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AuditTable entries={state.audit} />
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Spending limits</CardTitle>
            <CardDescription>Checked before every payment.</CardDescription>
          </CardHeader>
          <CardContent>
            <LimitsForm limits={state.limits} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

export function AdminFees() {
  const state = useTrade()
  const profit = platformProfit(state)
  const net = profit.fees - profit.agentSpend
  return (
    <>
      <PageHeader
        title="Platform fees"
        description="What the platform earns, less what the agent spends on checks."
      />
      <StatGrid>
        <StatCard
          label="Fees earned"
          value={usdt(profit.fees)}
          hint="0.5% of settled invoices"
        />
        <StatCard
          label="Agent spend"
          value={`${profit.agentSpend.toFixed(2)} USDC`}
          hint={`${profit.checks} checks`}
        />
        <StatCard
          label="Net"
          value={`${net.toFixed(2)} USD`}
          hint="1 USDT = 1 USDC assumed"
        />
        <StatCard label="Settled invoices" value={profit.done.length} />
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
      <Card>
        <CardHeader>
          <CardTitle>Parties</CardTitle>
          <CardDescription>
            Scores as the contract would hold them
          </CardDescription>
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
                      {pct(scoreBps(party.rep))}
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
