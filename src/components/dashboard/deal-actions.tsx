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
import { usdt } from "@/lib/trade/format"
import { SHIPMENT_STATUS } from "@/lib/trade/score"
import { actions, useTrade } from "@/lib/trade/store"
import type { Deal, Role } from "@/lib/trade/types"

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

const scenarios = [
  { value: "honest", label: "Honest: everything matches" },
  { value: "lag", label: "Tracking lag: Pending, then Verified" },
  { value: "short-weight", label: "Cheat: weighbridge reads 80% of the claim" },
  { value: "fake-docs", label: "Cheat: documents don't match" },
  { value: "over-weight", label: "Mismatch: more goods than claimed" },
  { value: "stuck", label: "Cheat: status never reached" },
]

const claimableStatuses = [3, 4, 5].map((value) => ({
  value: String(value),
  label: SHIPMENT_STATUS[value],
}))

function PickOne({
  label,
  items,
  value,
  onChange,
  hint,
}: {
  label: string
  items: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  hint?: string
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        value={value}
        items={items}
        onValueChange={(next) => next && onChange(next)}
      >
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  )
}

function ClaimsForm({ deal }: { deal: Deal }) {
  const [form, setForm] = useState({
    declaredKg: "10000",
    status: "3",
    documents: `Invoice, packing list and bill of lading for ${deal.invoiceRef}`,
    containerNo: `MSKU${1_000_000 + Number(deal.id)}`,
    blRef: `BL-${deal.id}`,
    scenario: "honest",
  })
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }))
  const kg = Number(form.declaredKg)
  const ready = kg > 0 && form.containerNo && form.blRef && form.documents

  return (
    <Panel
      title="Declare shipment claims"
      description="Once the carrier has the goods, commit your claims. The agent checks them straight away, and investors see the result."
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="declared-kg">Declared weight (kg)</FieldLabel>
          <Input
            id="declared-kg"
            type="number"
            min="1"
            value={form.declaredKg}
            onChange={(event) => set("declaredKg")(event.target.value)}
          />
          <FieldDescription>
            The weighbridge reading must land within 3% of this.
          </FieldDescription>
        </Field>
        <PickOne
          label="Shipment status"
          items={claimableStatuses}
          value={form.status}
          onChange={set("status")}
        />
        <Field>
          <FieldLabel htmlFor="documents">Document bundle</FieldLabel>
          <Input
            id="documents"
            value={form.documents}
            onChange={(event) => set("documents")(event.target.value)}
          />
          <FieldDescription>Only its hash goes onchain.</FieldDescription>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="container">Container number</FieldLabel>
            <Input
              id="container"
              value={form.containerNo}
              onChange={(event) => set("containerNo")(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="bl-ref">Bill of lading</FieldLabel>
            <Input
              id="bl-ref"
              value={form.blRef}
              onChange={(event) => set("blRef")(event.target.value)}
            />
          </Field>
        </div>
        <PickOne
          label="Demo: what the verifier will observe"
          items={scenarios}
          value={form.scenario}
          onChange={set("scenario")}
          hint="The shipment data is simulated, so this picks what the world reports."
        />
        <div>
          <ActionButton
            label="Submit claims"
            disabled={!ready}
            onAction={() =>
              actions.declare({
                dealId: deal.id,
                declaredKg: kg,
                status: Number(form.status),
                documents: form.documents,
                containerNo: form.containerNo,
                blRef: form.blRef,
                scenario: form.scenario,
              })
            }
          />
        </div>
      </FieldGroup>
    </Panel>
  )
}

function PayForm({ deal }: { deal: Deal }) {
  const outstanding = deal.amount - deal.paid
  const [value, setValue] = useState(String(outstanding))
  const parsed = Number(value)
  const invalid = parsed <= 0 || parsed > outstanding
  return (
    <Panel
      title="Pay this invoice"
      description={`${usdt(outstanding)} outstanding. The investor is paid first, and the exporter gets the rest.`}
    >
      <FieldGroup>
        <Field data-invalid={invalid || undefined}>
          <FieldLabel htmlFor="pay-amount">Amount (USDT)</FieldLabel>
          <Input
            id="pay-amount"
            type="number"
            min="0"
            max={outstanding}
            value={value}
            aria-invalid={invalid}
            onChange={(event) => setValue(event.target.value)}
          />
          <FieldDescription>
            Part payments follow the same order.
          </FieldDescription>
        </Field>
        <div>
          <ActionButton
            label="Pay"
            disabled={invalid}
            onAction={() => actions.pay(deal.id, parsed)}
          />
        </div>
      </FieldGroup>
    </Panel>
  )
}

/** Shows only what this role can do with the deal in its current state. */
export function DealActions({ deal, role }: { deal: Deal; role: Role }) {
  const state = useTrade()

  if (!state.network.serverSigning) {
    return (
      <Alert>
        <AlertTitle>Connect a wallet to act</AlertTitle>
        <AlertDescription>
          This network signs in your wallet, which arrives with the Whitechain
          deployment.
        </AlertDescription>
      </Alert>
    )
  }

  if (role === "exporter" && deal.state === "Approved") {
    return <ClaimsForm deal={deal} />
  }

  if (
    (deal.state === "Claimed" || deal.state === "Pending") &&
    role !== "investor"
  ) {
    return (
      <Alert>
        <AlertTitle>The agent is checking this shipment</AlertTitle>
        <AlertDescription>
          {deal.state === "Pending"
            ? "Tracking is behind the claim, so it will check again."
            : "This takes a few seconds, and the contract decides the result."}
        </AlertDescription>
      </Alert>
    )
  }

  if (role === "exporter" && deal.state === "Created") {
    return (
      <Panel
        title="Waiting on the importer"
        description="Nothing moves until they approve. You can still cancel."
      >
        <ActionButton
          label="Cancel deal"
          variant="outline"
          onAction={() => actions.cancel(deal.id)}
        />
      </Panel>
    )
  }

  if (role === "importer" && deal.state === "Created") {
    return (
      <Panel
        title="Approve this invoice"
        description="Approving accepts the debt, and agrees that payment goes to the TrustMeBro contract."
      >
        <ActionButton
          label="Approve invoice"
          onAction={() => actions.approve(deal.id)}
        />
      </Panel>
    )
  }

  if (role === "importer" && deal.state === "Funded") {
    return <PayForm deal={deal} />
  }

  if (role === "investor" && deal.state === "Verified" && deal.terms) {
    return (
      <Panel
        title="Fund this deal"
        description={`Pay ${usdt(deal.terms.advance)} and receive the receivable NFT. You get ${usdt(deal.terms.investorDue)} back on repayment.`}
      >
        <ActionButton
          label="Fund deal"
          onAction={() => actions.fund(deal.id)}
        />
      </Panel>
    )
  }

  if (role === "admin") {
    const pending = state.pending.some((item) => item.dealId === deal.id)
    if (pending) {
      return (
        <Alert>
          <AlertTitle>Waiting on a human</AlertTitle>
          <AlertDescription>
            The agent stopped at a spending limit. Decide on the Agent page.
          </AlertDescription>
        </Alert>
      )
    }
    if (deal.canDefault) {
      return (
        <Panel
          title="Mark as defaulted"
          description="The due date and grace period have passed. Only the importer's score drops."
        >
          <ActionButton
            label="Mark default"
            variant="destructive"
            onAction={() => actions.markDefault(deal.id)}
          />
        </Panel>
      )
    }
    if (deal.canExpire) {
      return (
        <Panel
          title="Expire this deal"
          description="Nobody funded it in time. No score changes."
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
