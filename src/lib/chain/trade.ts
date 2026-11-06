import "server-only"

import {
  V2_FINANCE,
  financeV2Abi,
  validateMetadata,
  type Metadata,
} from "@trustmebro/shared/v2"
import { createPublicClient, http } from "viem"

import { decideApproval } from "./agent"
import { RPC_URL, saveTrade } from "./config"
import { refreshState } from "./read"

export type TradeAction =
  | {
      type: "saveTrade"
      id: string
      metadata: Metadata
      goods: string
      invoiceRef: string
    }
  | { type: "decideApproval"; id: string; decision: "approve" | "reject" }
  | { type: "refresh" }

const client = createPublicClient({ transport: http(RPC_URL) })

/** Transactions are signed in the wallet. The server never holds a key. */
export async function runAction(action: TradeAction) {
  if (action.type === "decideApproval") {
    return decideApproval(action.id, action.decision)
  }
  if (action.type === "saveTrade") {
    const deal = await client.readContract({
      address: V2_FINANCE,
      abi: financeV2Abi,
      functionName: "getDeal",
      args: [BigInt(action.id)],
    })
    // The commitments onchain decide what is true, so a mismatch is refused.
    validateMetadata(deal as never, action.metadata)
    saveTrade(action.id, action.metadata, {
      goods: action.goods,
      invoiceRef: action.invoiceRef,
    })
  }
  await refreshState()
}
