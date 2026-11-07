"use client"

import { useState } from "react"
import { Bot, Coins, Files, ShieldAlert, UserPlus } from "lucide-react"
import { isAddress } from "viem"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
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
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { amount, dateTime, shortHash, usdt } from "@/lib/trade/format"
import { platformProfit } from "@/lib/trade/profit"
import { actions, roleOf, useMe, useTrade } from "@/lib/trade/store"
import type { Party } from "@/lib/trade/types"

import { AuditTable } from "../audit-table"
import { MonthlyBars } from "../charts"
import { DealTable } from "../deal-table"
import { PageHeader, StatCard, StatGrid, TrustScore } from "../parts"

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
          <DealTable
            role="admin"
            deals={state.deals.slice(0, 6)}
            action="Open"
          />
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
          <DealTable role="admin" deals={state.deals} action="Open" />
        </CardContent>
      </Card>
    </>
  )
}

const PARTY_ROLES: { value: Party["role"]; label: string }[] = [
  { value: "investor", label: "Investor" },
  { value: "exporter", label: "Exporter" },
  { value: "importer", label: "Importer" },
]

function AddParty() {
  const state = useTrade()
  const me = useMe()
  const [name, setName] = useState("")
  const [wallet, setWallet] = useState("")
  const [role, setRole] = useState<Party["role"]>("investor")
  const [busy, setBusy] = useState(false)

  const address = wallet.trim()
  const valid = isAddress(address, { strict: false })
  const held = valid ? roleOf(state, address) : undefined
  const ready = name.trim() && valid && !held

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const ok = await actions.addParty(me, {
      name: name.trim(),
      wallet: address,
      role,
    })
    setBusy(false)
    if (ok) {
      setName("")
      setWallet("")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a party</CardTitle>
        <CardDescription>
          After KYC, this grants the wallet its role onchain. One wallet holds
          one role, and it opens that role&apos;s dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <div className="grid gap-6 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="party-name">Company</FieldLabel>
                <Input
                  id="party-name"
                  maxLength={60}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field data-invalid={Boolean(held)}>
                <FieldLabel htmlFor="party-wallet">Wallet address</FieldLabel>
                <Input
                  id="party-wallet"
                  placeholder="0x"
                  aria-invalid={Boolean(held)}
                  value={wallet}
                  onChange={(event) => setWallet(event.target.value)}
                />
                {held ? (
                  <FieldDescription>
                    This wallet is already an {held}.
                  </FieldDescription>
                ) : null}
              </Field>
            </div>
            <Field>
              <FieldLabel>Role</FieldLabel>
              <ToggleGroup
                variant="outline"
                value={[role]}
                onValueChange={(next) =>
                  next[0] && setRole(next[0] as Party["role"])
                }
              >
                {PARTY_ROLES.map((item) => (
                  <ToggleGroupItem key={item.value} value={item.value}>
                    {item.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <Field orientation="horizontal">
              <Button type="submit" disabled={!ready || busy}>
                {busy ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <UserPlus data-icon="inline-start" />
                )}
                Add party
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function RemoveParty({ party }: { party: Party }) {
  const me = useMe()
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button size="sm" variant="outline">
            Remove
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {party.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This revokes the wallet&apos;s {party.role} role onchain, so it
            loses its dashboard. You can add it again later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => actions.removeParty(me, party)}>
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function AdminParties() {
  const state = useTrade()
  return (
    <>
      <PageHeader
        title="Parties"
        description="Wallets with a role on Finance V2. New parties need WBT for gas and USDT to trade."
      />
      <AddParty />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Party</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Wallet</TableHead>
                <TableHead>Trust Score</TableHead>
                <TableHead className="text-right">USDT</TableHead>
                <TableHead className="text-right">WBT</TableHead>
                <TableHead className="text-right">Access</TableHead>
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
                    {party.role === "importer" ? (
                      <TrustScore party={party} />
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {amount(party.usdt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {party.gas.toFixed(3)}
                  </TableCell>
                  <TableCell className="text-right">
                    {party.active ? (
                      <RemoveParty party={party} />
                    ) : (
                      <Badge variant="secondary">Removed</Badge>
                    )}
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
  const me = useMe()
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
                          onClick={() => actions.approvePayment(item.id, me)}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => actions.rejectPayment(item.id, me)}
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
