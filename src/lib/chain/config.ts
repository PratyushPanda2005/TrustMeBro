import "server-only"

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"

import type { Metadata } from "@trustmebro/shared/v2"

import type { Role } from "@/lib/trade/types"

type Persona = Exclude<Role, "admin">

export const RPC_URL =
  process.env.WHITECHAIN_RPC ?? "https://rpc.testnet.whitechain.io"

/** Finance V2's deployment block. Logs before it don't exist. */
const DEPLOYED_AT = 12_365_020n
const configuredBlock = BigInt(process.env.WHITECHAIN_FROM_BLOCK ?? 0)
export const FROM_BLOCK =
  configuredBlock > DEPLOYED_AT ? configuredBlock : DEPLOYED_AT

export const EXPLORER = "https://explorer.testnet.whitechain.io"

/** Onchain, parties are only addresses, so the dashboard names them here. */
const defaultNames: Record<string, string> = {
  "0x4DCdA2a3b4b8c8aC71d3e9224e5a80FBF9a4219C": "Ravi Exports",
  "0xEd450f58f5287d37Ca9200930F14EbcaFa44CFF4": "Ahmed Imports",
  "0x0dfd32c23580B576bCfEFcd418861162F4053873": "Priya Capital",
  "0x905cA6bb7410A3683e02A7EA0657abcfF3eBb4D7": "Second investor",
}

export const partyNames: Record<string, string> = process.env.PARTY_NAMES
  ? JSON.parse(process.env.PARTY_NAMES)
  : defaultNames

export const personas: Record<Persona, string> = process.env.PERSONAS
  ? JSON.parse(process.env.PERSONAS)
  : {
      exporter: "0x4DCdA2a3b4b8c8aC71d3e9224e5a80FBF9a4219C",
      importer: "0xEd450f58f5287d37Ca9200930F14EbcaFa44CFF4",
      investor: "0x0dfd32c23580B576bCfEFcd418861162F4053873",
    }

const json = <T>(path: string, fallback: T): T => {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T
  } catch {
    return fallback
  }
}

const write = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2))
}

const agentState = resolve(
  process.cwd(),
  process.env.V2_STATE_DIR ??
    "Hedera_Agentic_Payments/services/agent/.state/v2",
)
const metadataFile = process.env.V2_METADATA_FILE
  ? resolve(process.cwd(), process.env.V2_METADATA_FILE)
  : join(agentState, "trade-metadata.json")
const labelsFile = join(agentState, "deal-labels.json")

export type DealLabels = Record<string, { goods: string; invoiceRef: string }>

/** Goods names and invoice numbers stay off-chain. Only their hashes are onchain. */
export const readLabels = () => json<DealLabels>(labelsFile, {})

export const readTradeMetadata = () =>
  json<Record<string, Metadata>>(metadataFile, {})

/** The agent reads this file, so a new trade can be checked without a manual step. */
export function saveTrade(
  id: string,
  metadata: Metadata,
  label: DealLabels[string],
) {
  write(metadataFile, { ...readTradeMetadata(), [id]: metadata })
  write(labelsFile, { ...readLabels(), [id]: label })
}

type Payload = {
  tradeId: string
  evidenceLabel: string
  hederaPaymentTransactionId: string
  attestation?: { expiry?: string | number }
  transaction: { to: string; data: string }
}

/** Paid, signed answers the agent saved for a wallet to relay. */
export function readRelayPayloads() {
  const dirs = [
    join(agentState, "metamask"),
    join(agentState, "recovery", "metamask"),
  ]
  return dirs
    .filter(existsSync)
    .flatMap((dir) =>
      readdirSync(dir)
        .filter((file) => file.endsWith(".json"))
        .map((file) => json<Payload | null>(join(dir, file), null)),
    )
    .filter((item): item is Payload => Boolean(item?.transaction?.data))
    .map((item) => ({
      dealId: item.tradeId,
      to: item.transaction.to,
      data: item.transaction.data,
      label: item.evidenceLabel,
      hederaTx: item.hederaPaymentTransactionId,
      expiry: Number(item.attestation?.expiry ?? 0) * 1000,
    }))
}
