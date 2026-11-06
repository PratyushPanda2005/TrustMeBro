import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { dateTime } from "@/lib/trade/format"
import type { AuditEntry } from "@/lib/trade/types"

import { TxHash } from "./parts"

export function AuditTable({ entries }: { entries: AuditEntry[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Deal</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Message</TableHead>
          <TableHead>Hash chain</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="whitespace-nowrap">
              {dateTime(entry.at)}
            </TableCell>
            <TableCell>{entry.dealId}</TableCell>
            <TableCell>
              <Badge
                variant={
                  ["refused", "error"].includes(entry.kind)
                    ? "destructive"
                    : "secondary"
                }
              >
                {entry.kind}
              </Badge>
            </TableCell>
            <TableCell className="min-w-56 whitespace-normal">
              {entry.message}
              {entry.tx ? (
                <div>
                  <TxHash tx={entry.tx} />
                </div>
              ) : null}
            </TableCell>
            <TableCell>
              <code className="font-mono text-xs text-muted-foreground">
                {entry.prevHash.slice(0, 6)} → {entry.hash.slice(0, 6)}
              </code>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
