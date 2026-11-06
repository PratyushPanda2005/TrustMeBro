// The whole backend for the dashboards, in one command: anvil, the real contracts, the real verifier, a local
// agent and seeded deals. Run it from the repo root with `npm run stack`. Test keys only.

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToHex,
  type Account,
  type Address,
  type Hex,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { foundry } from "viem/chains"

import { DealState, Role, erc20Abi, tradeDealsAbi } from "@trustmebro/shared"

import { startLocalAgent } from "./local-agent"
import { ANVIL_KEYS, deployLocal, startAnvil, wallets } from "./local-chain"

const PORT = Number(process.env.PORT ?? 4021)
const DEMO_TOKEN = (process.env.DEMO_TOKEN ??= "local-demo-token")
const verifierUrl = `http://127.0.0.1:${PORT}`
const dataDir = join(process.cwd(), ".local")
const USDT = 1_000_000n
const TERMS = keccak256(stringToHex("TrustMeBro T&C v1: pay to the TradeDeals contract"))
const DURATIONS = { verifyWindow: 90, listingWindow: 86_400, graceWindow: 86_400 }

// A second exporter, so a cheat in the seed doesn't lower the demo exporter's score.
const secondExporterKey: Hex = "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356"
const secondExporter = privateKeyToAccount(secondExporterKey)

const anvil = await startAnvil(Number(process.env.ANVIL_PORT ?? 8545))
const dep = await deployLocal(anvil.rpcUrl)
const chain = createPublicClient({ chain: foundry, transport: http(dep.rpcUrl) })

const send = async (account: Account, functionName: string, args: readonly unknown[], address: Address = dep.tradeDeals) => {
  const abi = address === dep.usdt ? erc20Abi : tradeDealsAbi
  const { request } = await chain.simulateContract({
    account,
    address,
    abi,
    functionName: functionName as never,
    args: args as never,
  } as never)
  const wallet = createWalletClient({ account, chain: foundry, transport: http(dep.rpcUrl) })
  const hash = await wallet.writeContract(request as never)
  await chain.waitForTransactionReceipt({ hash })
}

const getDeal = (dealId: bigint) =>
  chain.readContract({ address: dep.tradeDeals, abi: tradeDealsAbi, functionName: "getDeal", args: [dealId] })

await send(wallets.admin, "setKyc", [secondExporter.address, Role.Exporter])

const parties = {
  [wallets.exporter.address]: { name: "Ravi Exports", role: "exporter" },
  [secondExporter.address]: { name: "Meera Textiles", role: "exporter" },
  [wallets.importer.address]: { name: "Ahmed Imports", role: "importer" },
  [wallets.investor.address]: { name: "Priya Capital", role: "investor" },
}

writeFileSync(
  "local-deployment.json",
  `${JSON.stringify(
    {
      note: "Local anvil deployment from scripts/stack.ts. Test keys only, never use them on a real network.",
      ...dep,
      verifierUrl,
      demoToken: DEMO_TOKEN,
      parties,
      personas: {
        exporter: wallets.exporter.address,
        importer: wallets.importer.address,
        investor: wallets.investor.address,
      },
      keys: {
        admin: ANVIL_KEYS.admin,
        exporter: ANVIL_KEYS.exporter,
        importer: ANVIL_KEYS.importer,
        investor: ANVIL_KEYS.investor,
      },
    },
    null,
    2,
  )}\n`,
)

process.env.RPC_URL = dep.rpcUrl
process.env.TRADEDEALS_ADDRESS = dep.tradeDeals
process.env.VERIFIER_SIGNER_PK = ANVIL_KEYS.verifier
process.env.PAYMENTS ??= "off"
process.env.PORT = String(PORT)
await import("../src/index")

for (let i = 0; i < 100; i++) {
  const ok = await fetch(`${verifierUrl}/health`).then((r) => r.ok, () => false)
  if (ok) break
  await new Promise((resolve) => setTimeout(resolve, 100))
}

mkdirSync(dataDir, { recursive: true })
// LOCAL_AGENT=off hands the relaying to the real Hedera agent (CHAIN_ADAPTER=local pnpm agent).
const agent = process.env.LOCAL_AGENT === "off" ? undefined : startLocalAgent(dep, verifierUrl, join(dataDir, "agent-log.json"))

const meta: Record<string, { goods: string; invoiceRef: string }> = {}
const saveMeta = () => writeFileSync(join(dataDir, "deal-meta.json"), JSON.stringify(meta, null, 2))

type Seed = { goods: string; amount: bigint; exporter?: Account; scenario?: string; kg?: number }

const created = async ({ goods, amount, exporter = wallets.exporter }: Seed) => {
  const invoiceRef = `INV-${1000 + Object.keys(meta).length + 1}`
  const now = (await chain.getBlock()).timestamp
  await send(exporter, "createDeal", [
    amount * USDT,
    now + 30n * 86_400n,
    wallets.importer.address,
    keccak256(stringToHex(`${invoiceRef} ${goods}`)),
    TERMS,
    DURATIONS,
  ])
  const id = await chain.readContract({ address: dep.tradeDeals, abi: tradeDealsAbi, functionName: "dealCount" })
  meta[id.toString()] = { goods, invoiceRef }
  saveMeta()
  return id
}

const approved = async (seed: Seed) => {
  const id = await created(seed)
  await send(wallets.importer, "approveDeal", [id, TERMS])
  return id
}

const decided = async (seed: Seed) => {
  const id = await approved(seed)
  const containerNo = `MSKU${String(1_000_000n + id)}`
  if (seed.scenario) {
    await fetch(`${verifierUrl}/demo/scenarios/${containerNo}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-demo-token": DEMO_TOKEN },
      body: JSON.stringify({ scenario: seed.scenario }),
    })
  }
  await send(seed.exporter ?? wallets.exporter, "declareClaims", [
    id,
    seed.kg ?? 10_000,
    3,
    keccak256(stringToHex(`invoice + packing list + BL for ${containerNo}`)),
    containerNo,
    `BL-${id}`,
  ])
  for (let i = 0; i < 100; i++) {
    const { state } = await getDeal(id)
    if (state !== DealState.Claimed) return id
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Deal ${id} was never checked`)
}

const funded = async (seed: Seed) => {
  const id = await decided(seed)
  const quote = await chain.readContract({ address: dep.tradeDeals, abi: tradeDealsAbi, functionName: "quote", args: [id] })
  await send(wallets.investor, "approve", [dep.tradeDeals, quote.advance], dep.usdt)
  await send(wallets.investor, "fund", [id, quote.advance, quote.yieldBps])
  return id
}

const settled = async (seed: Seed) => {
  const id = await funded(seed)
  await send(wallets.importer, "approve", [dep.tradeDeals, seed.amount * USDT], dep.usdt)
  await send(wallets.importer, "pay", [id, seed.amount * USDT])
  return id
}

// Plan v5 I7: three settled deals take the exporter to 80% and the importer to 2.80%.
await settled({ goods: "Cotton yarn", amount: 100n, kg: 4_200 })
await settled({ goods: "Basmati rice", amount: 100n, kg: 6_000 })
await settled({ goods: "Brass hardware", amount: 100n, kg: 1_800 })
await decided({ goods: "Ceramic tiles", amount: 100n, kg: 10_000, exporter: secondExporter, scenario: "short-weight" })
await funded({ goods: "Leather goods", amount: 150n, kg: 2_400 })
await decided({ goods: "Jute bags", amount: 120n, kg: 3_500 })
await approved({ goods: "Stainless cookware", amount: 90n })
await created({ goods: "Handloom rugs", amount: 110n })

console.log(`
TrustMeBro backend ready
  Chain      ${dep.rpcUrl} (${dep.chainId})
  TradeDeals ${dep.tradeDeals}
  Verifier   ${verifierUrl}
  Agent      ${agent ? "local stand-in, no Hedera payments" : "off, run the Hedera agent"}
  Deals      ${Object.keys(meta).length} seeded. Press Ctrl+C to stop; restarting wipes the chain.
`)

const stop = () => {
  agent?.stop()
  anvil.stop()
  process.exit(0)
}
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
