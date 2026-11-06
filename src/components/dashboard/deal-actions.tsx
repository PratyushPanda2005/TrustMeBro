"use client"

import { useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { claimable, getParty, raised } from "@/lib/trade/engine"
import { amount, usdt } from "@/lib/trade/format"
import { personas } from "@/lib/trade/seed"
import { actions, useTrade } from "@/lib/trade/store"
import type { Claims, Deal, Role, Scenario } from "@/lib/trade/types"

function ActionButton({
  label,
  onAction,
  variant,
  disabled,
}: {
  label: string
  onAction: () => Promise<unknown>
  variant?: "default" | "outline" | "destructive"
  disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant={variant}
      disabled={busy || disabled}
      onClick={async () => {
        setBusy(true)
        await onAction()
        setBusy(false)
      }}
    >
      {busy ? <Spinner data-icon="inline-start" /> : null}
      {label}
    </Button>
  )
}

function Panel({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

const scenarios: { value: Scenario; label: string }[] = [
  { value: "honest", label: "Honest: everything matches" },
  { value: "fake-weight", label: "Cheat: weight comes back false" },
  { value: "fake-docs", label: "Cheat: documents come back false" },
  { value: "overpriced", label: "Overpriced: verifier quotes 5.00 USDC" },
]

const claimFields: { key: keyof Claims; label: string; hint: string }[] = [
  { key: "weight", label: "Weight", hint: "Matches the declared weight" },
  { key: "statusCode", label: "Status", hint: "Shipment status is correct" },
  {
    key: "documents",
    label: "Documents",
    hint: "Shipping documents check out",
  },
]

function ClaimsForm({ deal }: { deal: Deal }) {
  const [claims, setClaims] = useState<Claims>({
    weight: true,
    statusCode: true,
    documents: true,
  })
  const [scenario, setScenario] = useState<Scenario>("honest")
  const anyFalse = Object.values(claims).some((claim) => !claim)

  return (
    <Panel
      title="Declare shipment claims"
      description="Once you've shipped, commit your claims. The agent then pays for the check by itself."
    >
      <FieldGroup>
        {claimFields.map((field) => (
          <Field key={field.key} orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={field.key}>{field.label}</FieldLabel>
              <FieldDescription>{field.hint}</FieldDescription>
            </FieldContent>
            <Switch
              id={field.key}
              checked={claims[field.key]}
              onCheckedChange={(checked) =>
                setClaims((value) => ({ ...value, [field.key]: checked }))
              }
            />
          </Field>
        ))}
        <Field>
          <FieldLabel>Demo: what the verifier will observe</FieldLabel>
          <Select
            value={scenario}
            items={scenarios}
            onValueChange={(value) => value && setScenario(value)}
          >
            <SelectTrigger aria-label="Verifier scenario" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {scenarios.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            Placeholder control, removed once the real verifier is connected.
          </FieldDescription>
        </Field>
        {anyFalse ? (
          <Alert>
            <AlertTitle>This cancels the deal</AlertTitle>
            <AlertDescription>
              Investors are refunded, and there is no penalty because you told
              the truth.
            </AlertDescription>
          </Alert>
        ) : null}
        <div>
          <ActionButton
            label="Submit claims"
            onAction={() => actions.declare(deal.id, claims, scenario)}
          />
        </div>
      </FieldGroup>
    </Panel>
  )
}

function BuyForm({ deal }: { deal: Deal }) {
  const state = useTrade()
  const investor = getParty(state, personas.investor)
  const remaining = deal.target - raised(deal)
  const [value, setValue] = useState("")
  const parsed = Number(value)
  const invalid = value !== "" && (parsed <= 0 || parsed > remaining)

  if (!investor.allowlisted) {
    return (
      <Alert>
        <AlertTitle>Not allowlisted</AlertTitle>
        <AlertDescription>
          An admin has to allowlist you before you can buy deal tokens.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Panel
      title="Buy deal tokens"
      description={`${usdt(remaining)} left to raise. Your USDT stays locked until the check matches.`}
    >
      <FieldGroup>
        <Field data-invalid={invalid || undefined}>
          <FieldLabel htmlFor="buy-amount">Amount (USDT)</FieldLabel>
          <Input
            id="buy-amount"
            type="number"
            min="1"
            max={remaining}
            value={value}
            aria-invalid={invalid}
            onChange={(event) => setValue(event.target.value)}
          />
          <FieldDescription>
            {invalid
              ? `Enter up to ${amount(remaining)} USDT.`
              : "Fractional: buy any part of the deal."}
          </FieldDescription>
        </Field>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label="Buy tokens"
            disabled={!value || invalid}
            onAction={async () => {
              const ok = await actions.buy({
                dealId: deal.id,
                investorId: investor.id,
                amount: parsed,
              })
              if (ok) setValue("")
            }}
          />
          <Button variant="outline" onClick={() => setValue(String(remaining))}>
            Fill the rest
          </Button>
        </div>
      </FieldGroup>
    </Panel>
  )
}

/** Shows only what this role can do with the deal in its current state. */
export function DealActions({ deal, role }: { deal: Deal; role: Role }) {
  const state = useTrade()

  if (role === "exporter" && deal.state === "Funded") {
    return <ClaimsForm deal={deal} />
  }

  if (role === "importer" && deal.state === "Created") {
    return (
      <Panel
        title="Approve this invoice"
        description="Approving accepts the debt onchain and fixes the deal terms."
      >
        <ActionButton
          label="Approve invoice"
          onAction={() => actions.approve(deal.id)}
        />
      </Panel>
    )
  }

  if (role === "importer" && deal.state === "Released") {
    return (
      <Panel
        title="Pay this invoice"
        description={`Pay ${usdt(deal.amount)}. The contract splits it between investors, the platform and the exporter.`}
      >
        <ActionButton
          label="Pay invoice"
          onAction={() => actions.settle(deal.id)}
        />
      </Panel>
    )
  }

  if (role === "investor") {
    if (deal.state === "Approved" || deal.state === "Funding") {
      return <BuyForm deal={deal} />
    }
    const owed = claimable(deal, personas.investor)
    if (owed > 0) {
      return (
        <Panel
          title={deal.state === "Settled" ? "Redeem" : "Claim refund"}
          description={`${usdt(owed)} is ready to claim.`}
        >
          <ActionButton
            label={deal.state === "Settled" ? "Redeem" : "Claim refund"}
            onAction={() =>
              actions.redeem({
                dealId: deal.id,
                investorId: personas.investor,
              })
            }
          />
        </Panel>
      )
    }
  }

  if (role === "admin") {
    const pending = state.pending.some((item) => item.dealId === deal.id)
    if (pending) {
      return (
        <Alert>
          <AlertTitle>Waiting on a human</AlertTitle>
          <AlertDescription>
            The agent refused this quote. Decide on the Agent page.
          </AlertDescription>
        </Alert>
      )
    }
    if (deal.state === "Released") {
      return (
        <Panel
          title="Mark as defaulted"
          description="Use once the due date and grace period have passed. Only the importer's score drops."
        >
          <ActionButton
            label="Mark default"
            variant="destructive"
            onAction={() => actions.markDefault(deal.id)}
          />
        </Panel>
      )
    }
    if (deal.state === "Funded" || deal.state === "Shipped") {
      return (
        <Panel
          title="Expire this deal"
          description="Use when no verification arrived by the deadline. Investors are refunded and no score changes."
        >
          <ActionButton
            label="Expire deal"
            variant="outline"
            onAction={() => actions.expire(deal.id)}
          />
        </Panel>
      )
    }
  }

  return null
}
