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
import { Redis } from "@upstash/redis"

export const RPC_URL =
  process.env.WHITECHAIN_RPC ?? "https://rpc.testnet.whitechain.io"

/** Finance V2's deployment block. Logs before it don't exist. */
const DEPLOYED_AT = 12_365_020n
const configuredBlock = BigInt(process.env.WHITECHAIN_FROM_BLOCK ?? 0)
export const FROM_BLOCK =
  configuredBlock > DEPLOYED_AT ? configuredBlock : DEPLOYED_AT

/** Three of the agent's 15-second polls. */
const AGENT_SILENCE_MS = 45_000

export const EXPLORER = "https://explorer.testnet.whitechain.io"

/** Onchain, parties are only addresses, so the dashboard names them here. */
const defaultNames: Record<string, string> = {
  "0x4DCdA2a3b4b8c8aC71d3e9224e5a80FBF9a4219C": "Exporter",
  "0xEd450f58f5287d37Ca9200930F14EbcaFa44CFF4": "Importer",
  "0x0dfd32c23580B576bCfEFcd418861162F4053873": "Investor",
  "0x905cA6bb7410A3683e02A7EA0657abcfF3eBb4D7": "Investor 2",
}

const configuredNames: Record<string, string> = process.env.PARTY_NAMES
  ? JSON.parse(process.env.PARTY_NAMES)
  : defaultNames

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
const namesFile = join(agentState, "party-names.json")
const heartbeatFile = join(agentState, "agent-heartbeat.json")

/** Hosting has no writable disk, so a deployment keeps these in Redis instead. */
const redis =
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
    ? new Redis({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      })
    : undefined

const readAll = async <T>(name: string, file: string) =>
  redis
    ? ((await redis.hgetall<Record<string, T>>(`tmb:${name}`)) ?? {})
    : json<Record<string, T>>(file, {})

const saveOne = async <T>(
  name: string,
  file: string,
  key: string,
  value: T,
) => {
  if (redis) await redis.hset(`tmb:${name}`, { [key]: value })
  else write(file, { ...json<Record<string, T>>(file, {}), [key]: value })
}

export type DealLabel = { goods: string; invoiceRef: string }

/** Goods names and invoice numbers stay off-chain. Only their hashes are onchain. */
export const readLabels = () => readAll<DealLabel>("labels", labelsFile)

export const readTradeMetadata = () =>
  readAll<Metadata>("metadata", metadataFile)

/** The agent reads these, so a new trade can be checked without a manual step. */
export async function saveTrade(
  id: string,
  metadata: Metadata,
  label: DealLabel,
) {
  await saveOne("metadata", metadataFile, id, metadata)
  await saveOne("labels", labelsFile, id, label)
}

/** The V2 agent has no API, so it records each poll here. */
export async function agentBeating() {
  const beat = redis
    ? await redis.get<{ at: number }>("tmb:heartbeat")
    : json(heartbeatFile, { at: 0 })
  return Date.now() - (beat?.at ?? 0) < AGENT_SILENCE_MS
}

export async function saveHeartbeat() {
  await redis?.set("tmb:heartbeat", { at: Date.now() })
}

type SavedName = { name: string; tx: string }

const savedNames = () => readAll<SavedName>("names", namesFile)

/** Names the admin gave parties, over the configured ones. */
export const readPartyNames = async () => ({
  ...configuredNames,
  ...Object.fromEntries(
    Object.entries(await savedNames()).map(([wallet, saved]) => [
      wallet,
      saved.name,
    ]),
  ),
})

export async function savePartyName(wallet: string, name: string, tx: string) {
  const names = await savedNames()
  // One grant names one party, so its transaction can't be replayed to rename.
  if (Object.values(names).some((saved) => saved.tx === tx)) {
    throw new Error("This transaction already named a party.")
  }
  await saveOne("names", namesFile, wallet, { name, tx })
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
