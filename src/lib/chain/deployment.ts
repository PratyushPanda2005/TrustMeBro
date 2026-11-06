import "server-only"

import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { Address, Hex } from "viem"

import type { Role } from "@/lib/trade/types"

type Persona = Exclude<Role, "admin">

export type Deployment = {
  name: string
  rpcUrl: string
  chainId: number
  usdt: Address
  trustRegistry: Address
  tradeDeals: Address
  verifierUrl: string
  demoToken?: string
  parties: Record<string, { name: string; role: Persona }>
  personas: Record<Persona, Address>
  /** Only the local chain has keys here. Real networks sign in the wallet. */
  keys?: Record<Role, Hex>
}

const verifierDir = join(process.cwd(), "services", "verifier")

const json = <T>(path: string, fallback: T): T => {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T
  } catch {
    return fallback
  }
}

/**
 * The one switch between chains. With `CHAIN=whitechain`, addresses come from
 * the environment, so the Whitechain deploy needs no code change here.
 */
export function loadDeployment(): Deployment {
  if (process.env.CHAIN === "whitechain") {
    return {
      name: "Whitechain Sepolia",
      rpcUrl: process.env.WHITECHAIN_RPC ?? "https://rpc.testnet.whitechain.io",
      chainId: 1874,
      usdt: process.env.USDT_ADDRESS as Address,
      trustRegistry: process.env.REGISTRY_ADDRESS as Address,
      tradeDeals: process.env.TRADEDEALS_ADDRESS as Address,
      verifierUrl: process.env.VERIFIER_URL ?? "",
      parties: JSON.parse(process.env.PARTIES ?? "{}"),
      personas: JSON.parse(process.env.PERSONAS ?? "{}"),
    }
  }
  const local = json<Omit<Deployment, "name"> | null>(
    join(verifierDir, "local-deployment.json"),
    null,
  )
  if (!local) throw new Error("No local deployment. Run npm run stack.")
  return { ...local, name: "Local chain" }
}

export type DealMeta = Record<string, { goods: string; invoiceRef: string }>

export const metaPath = join(verifierDir, ".local", "deal-meta.json")

/** Goods names and invoice references stay off-chain: only their hash is onchain. */
export const readMeta = () => json<DealMeta>(metaPath, {})

type AgentLog = {
  entries: {
    id: string
    at: number
    dealId: string
    kind: string
    message: string
    tx?: string
    prevHash: string
    hash: string
  }[]
  evidence: Record<string, unknown>
}

export const readAgentLog = () =>
  json<AgentLog>(join(verifierDir, ".local", "agent-log.json"), {
    entries: [],
    evidence: {},
  })
