import "server-only"

import type { AuditEntry } from "@/lib/trade/types"

const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1"
const TOPIC = process.env.AUDIT_TOPIC_ID ?? "0.0.11336190"
const CACHE_MS = 30_000

type Message = { consensus_timestamp: string; message: string }

let cache: { at: number; entries: AuditEntry[] } = { at: 0, entries: [] }

const toEntry = ({ consensus_timestamp, message }: Message): AuditEntry => {
  const body = JSON.parse(Buffer.from(message, "base64").toString("utf8"))
  const hederaTx = body.payment?.hederaTxId
  return {
    id: body.hash,
    at: Date.parse(body.ts) || Number(consensus_timestamp) * 1000,
    dealId: body.dealId ? BigInt(body.dealId).toString() : "-",
    kind: body.kind,
    message: body.reason,
    tx: hederaTx ? { chain: "hedera", hash: hederaTx } : undefined,
    prevHash: body.prevHash,
    hash: body.hash,
  }
}

/** Real entries from the team's audit topic. The dashboard works without them. */
export async function readHederaAudit() {
  if (Date.now() - cache.at > CACHE_MS) {
    try {
      const response = await fetch(
        `${MIRROR}/topics/${TOPIC}/messages?limit=20&order=desc`,
        { signal: AbortSignal.timeout(3_000) },
      )
      const { messages } = (await response.json()) as { messages: Message[] }
      cache = { at: Date.now(), entries: messages.map(toEntry) }
    } catch {
      cache = { ...cache, at: Date.now() }
    }
  }
  return { topicId: TOPIC, entries: cache.entries }
}
