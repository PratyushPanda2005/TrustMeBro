"use client"

import { useState } from "react"
import { CircleCheck, Minus, Plus } from "lucide-react"

import { CodeView } from "./code-view"

const panelClass = "rounded-[3px] border border-border bg-ink"

function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs tracking-[0.06em] uppercase">
      <span className="text-muted-foreground">{"//"}</span> {children}
    </span>
  )
}

function CollapsiblePanel({
  title,
  code,
  defaultOpen = false,
}: {
  title: string
  code: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const Icon = open ? Minus : Plus
  return (
    <div className={panelClass}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full cursor-pointer items-center justify-between px-3 py-3"
      >
        <PanelHeading>{title}</PanelHeading>
        <Icon className="size-3 text-muted-foreground" aria-hidden="true" />
      </button>
      {open ? <CodeView className="px-3 pt-1 pb-4" code={code} /> : null}
    </div>
  )
}

export function CodePanel({
  title,
  fieldLabel,
  fieldValue,
  request,
  response,
}: {
  title: string
  fieldLabel: string
  fieldValue: string
  request: string
  response: string
}) {
  return (
    <div className="flex w-full max-w-110 flex-col gap-2">
      <div className={panelClass}>
        <div className="mx-3 border-b border-dashed border-border py-3">
          <PanelHeading>{title}</PanelHeading>
        </div>
        <div className="px-3 py-4">
          <p className="text-xs text-muted-foreground">{fieldLabel}</p>
          <p className="mt-1 flex items-center gap-3 text-[2rem] leading-10">
            {fieldValue}
            <CircleCheck
              className="size-6 fill-success text-background"
              strokeWidth={2}
              aria-hidden="true"
            />
          </p>
        </div>
      </div>
      <CollapsiblePanel title="Request" code={request} defaultOpen />
      <CollapsiblePanel title="Response" code={response} />
    </div>
  )
}
