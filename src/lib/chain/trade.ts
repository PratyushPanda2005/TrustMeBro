import "server-only"

import {
  V2_FINANCE,
  financeV2Abi,
  validateMetadata,
  type Metadata,
} from "@trustmebro/shared/v2"
import {
  createPublicClient,
  getAddress,
  http,
  isAddressEqual,
  parseEventLogs,
  verifyMessage,
  type Address,
  type Hash,
  type Hex,
} from "viem"

import { approvalMessage } from "@/lib/trade/format"

import { decideApproval } from "./agent"
import { RPC_URL, savePartyName, saveTrade } from "./config"
import { readState, refreshState } from "./read"

export type TradeAction =
  | {
      type: "saveTrade"
      id: string
      metadata: Metadata
      goods: string
      invoiceRef: string
    }
  | {
      type: "decideApproval"
      id: string
      decision: "approve" | "reject"
      admin: string
      signature: string
    }
  | { type: "saveParty"; wallet: string; name: string; tx: string }
  | { type: "refresh" }

const client = createPublicClient({ transport: http(RPC_URL) })

const NAME_LIMIT = 60

const isAdmin = async (wallet: Address) => {
  const { admins } = await readState()
  return admins.some((admin) => isAddressEqual(admin as Address, wallet))
}

/** The grant is the proof: only an admin's transaction can name a party. */
async function saveParty(wallet: string, name: string, tx: Hash) {
  const receipt = await client.getTransactionReceipt({ hash: tx })
  const account = getAddress(wallet)
  const granted = parseEventLogs({
    abi: financeV2Abi,
    eventName: "RoleGranted",
    logs: receipt.logs,
  }).some(
    (log) =>
      isAddressEqual(log.address, V2_FINANCE) &&
      isAddressEqual(log.args.account, account),
  )
  if (receipt.status !== "success" || !granted) {
    throw new Error("That transaction didn't grant this wallet a role.")
  }
  if (!(await isAdmin(receipt.from))) {
    throw new Error("Only an admin can name a party.")
  }
  savePartyName(account, name.trim().slice(0, NAME_LIMIT), tx)
}

/** Transactions are signed in the wallet. The server never holds a key. */
export async function runAction(action: TradeAction) {
  if (action.type === "decideApproval") {
    const admin = getAddress(action.admin)
    const signed = await verifyMessage({
      address: admin,
      message: approvalMessage(action.id, action.decision),
      signature: action.signature as Hex,
    })
    if (!signed || !(await isAdmin(admin))) {
      throw new Error("Only an admin can decide this payment.")
    }
    return decideApproval(action.id, action.decision)
  }
  if (action.type === "saveParty") {
    await saveParty(action.wallet, action.name, action.tx as Hash)
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
