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
import { Spinner } from "@/components/ui/spinner"
import { usdt } from "@/lib/trade/format"
import { STAGES } from "@/lib/trade/score"
import { actions, getParty, useMe, useTrade } from "@/lib/trade/store"
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
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">{children}</div>
      </CardContent>
    </Card>
  )
}

/** Shows only what this role can do with the deal in its current state. */
export function DealActions({ deal, role }: { deal: Deal; role: Role }) {
  const state = useTrade()
  const me = useMe()
  const relay = state.relays.find(
    (item) => item.dealId === deal.id && item.expiry > deal.createdAt,
  )

  if (role === "exporter" && deal.state === "Created") {
    return (
      <Alert>
        <AlertTitle>Waiting for the importer</AlertTitle>
        <AlertDescription>
          The importer confirms this invoice from their own wallet, under
          Approvals on the importer dashboard.
        </AlertDescription>
      </Alert>
    )
  }

  if (role === "importer" && deal.state === "Created") {
    return (
      <Panel
        title="Confirm this invoice"
        description="Confirming accepts the debt, and agrees that payment goes to the TrustMeBro contract."
      >
        <ActionButton
          label="Confirm agreement"
          onAction={() => actions.confirm(deal)}
        />
        <ActionButton
          label="Reject"
          variant="outline"
          onAction={() => actions.reject(deal)}
        />
      </Panel>
    )
  }

  if (role === "importer" && deal.state === "Funded") {
    const importer = getParty(state, deal.importerId)
    const short = importer.usdt < deal.amount
    return (
      <Panel
        title="Repay this invoice"
        description={`Pay ${usdt(deal.amount)}. The holder is paid first, then the fee, and the exporter gets the rest.`}
      >
        <ActionButton
          label="Repay"
          disabled={short}
          onAction={() => actions.pay(deal)}
        />
        {short ? (
          <p className="text-sm text-destructive">
            This wallet holds only {usdt(importer.usdt)}.
          </p>
        ) : null}
      </Panel>
    )
  }

  if (role === "investor" && deal.state === "Verified" && deal.terms) {
    const terms = deal.terms
    return (
      <Panel
        title="Fund this deal"
        description={`Pay ${usdt(terms.advance)} and hold the receivable. You get ${usdt(terms.investorDue)} back on repayment.`}
      >
        <ActionButton
          label="Fund deal"
          onAction={() => actions.fund(deal, me, state.network.treasury)}
        />
      </Panel>
    )
  }

  if (role === "admin" && deal.state === "Approved") {
    return (
      <div className="flex flex-col gap-4">
        {relay ? (
          <Panel
            title="Relay the paid answer"
            description={`The agent paid on Hedera in ${relay.hederaTx}. Sending this puts the signed answer onchain. ${relay.label === "DEMO_SIMULATION" ? "The evidence is simulated." : ""}`}
          >
            <ActionButton
              label="Relay signed answer"
              onAction={() => actions.relay(me, relay)}
            />
          </Panel>
        ) : (
          <Alert>
            <AlertTitle>Waiting for the agent</AlertTitle>
            <AlertDescription>
              {state.agentOnline
                ? "The agent is running, and its paid answer will appear here."
                : "The Hedera agent isn't running, so no paid answer is ready."}
            </AlertDescription>
          </Alert>
        )}
        <Panel
          title="Verify manually"
          description={`Admin override: records a check at ${STAGES[deal.shipment.minimumStage]} with no x402 payment. Use it only when the agent can't run.`}
        >
          <ActionButton
            label="Record manual verification"
            variant="outline"
            onAction={() =>
              actions.verifyManual(deal, me, deal.shipment.minimumStage)
            }
          />
        </Panel>
      </div>
    )
  }

  if (deal.state === "Approved" && role !== "investor") {
    return (
      <Alert>
        <AlertTitle>Waiting for the shipment check</AlertTitle>
        <AlertDescription>
          The agent buys an independent check, and the contract records the
          result. Investors can fund after that.
        </AlertDescription>
      </Alert>
    )
  }

  if (role === "admin" && deal.canDefault) {
    return (
      <Panel
        title="Mark as defaulted"
        description="The due date and grace period have passed."
      >
        <ActionButton
          label="Mark default"
          variant="destructive"
          onAction={() => actions.markDefault(deal, me)}
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
  }

  return null
}
