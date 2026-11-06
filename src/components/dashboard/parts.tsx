import Link from "next/link"
import type { LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { partyScoreView, type ScoreView } from "@/lib/trade/score"
import { shortHash } from "@/lib/trade/format"
import type { DealState, Party, TxRef } from "@/lib/trade/types"

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-[2.75rem] leading-12 type-display">{title}</h1>
        {description ? (
          <p className="text-lg leading-6.5 font-light text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  )
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid overflow-hidden rounded-xl border bg-card/80 backdrop-blur-sm sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: React.ReactNode
  hint?: string
  icon?: LucideIcon
}) {
  return (
    <div className="-mr-px -mb-px flex flex-col gap-3 border-r border-b border-dashed p-5">
      <p className="flex items-center justify-between gap-2 type-label text-[0.6875rem] text-muted-foreground">
        {label}
        {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
      </p>
      <p className="text-[1.75rem] leading-9 type-display tabular-nums">
        {value}
      </p>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

const stateVariant: Record<
  DealState,
  "default" | "secondary" | "destructive" | "outline"
> = {
  Created: "outline",
  Approved: "secondary",
  Verified: "default",
  Funded: "default",
  Settled: "default",
  Closed: "outline",
  Rejected: "destructive",
  Defaulted: "destructive",
}

export function StateBadge({ state }: { state: DealState }) {
  return <Badge variant={stateVariant[state]}>{state}</Badge>
}

const toneVariant = {
  good: "default",
  neutral: "secondary",
  bad: "destructive",
} as const

export function ScoreBadge({ view }: { view: ScoreView }) {
  return <Badge variant={toneVariant[view.tone]}>{view.band}</Badge>
}

/** "60 Medium" for an exporter, Risk Score for an importer. */
export function PartyScore({ party }: { party: Party }) {
  const view = partyScoreView(party)
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className="tabular-nums">{view.value}</span>
      <ScoreBadge view={view} />
    </span>
  )
}

const explorers = {
  whitechain: "https://explorer.testnet.whitechain.io/tx/",
  hedera: "https://hashscan.io/testnet/transaction/",
}

export function TxHash({ tx }: { tx: TxRef }) {
  const text = (
    <code className="font-mono text-xs text-muted-foreground">
      {shortHash(tx.hash)}
    </code>
  )
  return (
    <Link href={`${explorers[tx.chain]}${tx.hash}`} target="_blank">
      {text}
    </Link>
  )
}
