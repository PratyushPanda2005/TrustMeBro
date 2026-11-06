"use client"

import Link from "next/link"
import { FileSearch } from "lucide-react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { amount, date } from "@/lib/trade/format"
import { getParty, useTrade } from "@/lib/trade/store"
import type { Deal, Role } from "@/lib/trade/types"

import { PartyScore, StateBadge } from "./parts"

type Column = {
  head: string
  right?: boolean
  cell: (deal: Deal) => React.ReactNode
}

export function DealTable({
  role,
  deals,
  variant = "standard",
  emptyText = "Nothing here yet.",
}: {
  role: Role
  deals: Deal[]
  variant?: "standard" | "market"
  emptyText?: string
}) {
  const state = useTrade()
  const name = (id: string) => getParty(state, id).name

  const columns: Column[] =
    variant === "market"
      ? [
          { head: "Goods", cell: (deal) => deal.goods },
          {
            head: "Exporter Trust Score",
            cell: (deal) => (
              <PartyScore party={getParty(state, deal.exporterId)} />
            ),
          },
          {
            head: "Importer Risk Score",
            cell: (deal) => (
              <PartyScore party={getParty(state, deal.importerId)} />
            ),
          },
          {
            head: "Profit (USDT)",
            right: true,
            cell: (deal) => amount(deal.terms?.profit ?? 0),
          },
          {
            head: "Advance (USDT)",
            right: true,
            cell: (deal) => amount(deal.terms?.advance ?? 0),
          },
        ]
      : [
          { head: "Goods", cell: (deal) => deal.goods },
          { head: "Exporter", cell: (deal) => name(deal.exporterId) },
          { head: "Importer", cell: (deal) => name(deal.importerId) },
          {
            head: "Invoice (USDT)",
            right: true,
            cell: (deal) => amount(deal.amount),
          },
          {
            head: "Due",
            cell: (deal) => (deal.dueAt ? date(deal.dueAt) : "-"),
          },
          { head: "State", cell: (deal) => <StateBadge state={deal.state} /> },
        ]

  if (deals.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileSearch />
          </EmptyMedia>
          <EmptyTitle>No deals</EmptyTitle>
          <EmptyDescription>{emptyText}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Deal</TableHead>
          {columns.map((column) => (
            <TableHead
              key={column.head}
              className={column.right ? "text-right" : undefined}
            >
              {column.head}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {deals.map((deal) => (
          <TableRow key={deal.id}>
            <TableCell>
              <Link
                href={`/dashboard/${role}/deals/${deal.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {deal.id}
              </Link>
            </TableCell>
            {columns.map((column) => (
              <TableCell
                key={column.head}
                className={column.right ? "text-right tabular-nums" : undefined}
              >
                {column.cell(deal)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
