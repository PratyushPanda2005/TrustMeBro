// Local Whitechain stand-in for development: starts anvil, deploys MockUSDT + TrustRegistry + TradeDeals from
// contracts/out (run `forge build` first), KYCs the demo wallets and gives them test USDT.

import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  createPublicClient,
  createWalletClient,
  getContractAddress,
  http,
  keccak256,
  parseAbi,
  stringToHex,
  type Abi,
  type Account,
  type Address,
  type Hex,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { foundry } from "viem/chains"

import { Role, tradeDealsAbi } from "@trustmebro/shared"

// anvil's public test keys (mnemonic "test test ... junk"). Never use them on a real network.
export const ANVIL_KEYS = {
  admin: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  exporter: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  importer: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  investor: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  agent: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  reserve: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  treasury: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
  verifier: "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
} as const satisfies Record<string, Hex>

export type Wallets = { [K in keyof typeof ANVIL_KEYS]: Account }

export const wallets: Wallets = Object.fromEntries(
  Object.entries(ANVIL_KEYS).map(([name, key]) => [name, privateKeyToAccount(key)]),
) as Wallets

const contractsOut = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "contracts", "out")

export const mockUsdtAbi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
])

function artifact(file: string, name: string): { abi: Abi; bytecode: Hex } {
  const path = join(contractsOut, `${file}.sol`, `${name}.json`)
  if (!existsSync(path)) throw new Error(`Missing ${path}. Run "forge build" in contracts/ first.`)
  const json = JSON.parse(readFileSync(path, "utf8")) as { abi: Abi; bytecode: { object: Hex } }
  return { abi: json.abi, bytecode: json.bytecode.object }
}

function anvilBinary(): string {
  if (process.env.ANVIL_BIN) return process.env.ANVIL_BIN
  const local = join(homedir(), ".foundry", "bin", process.platform === "win32" ? "anvil.exe" : "anvil")
  return existsSync(local) ? local : "anvil"
}

export async function startAnvil(port: number): Promise<{ rpcUrl: string; stop: () => void }> {
  const child: ChildProcess = spawn(anvilBinary(), ["--port", String(port), "--silent"], { stdio: "ignore" })
  const rpcUrl = `http://127.0.0.1:${port}`
  const client = createPublicClient({ transport: http(rpcUrl, { retryCount: 0 }) })
  let failed: Error | undefined
  child.once("error", (err) => (failed = err))

  for (let i = 0; i < 100; i++) {
    if (failed) throw new Error(`Could not start anvil: ${failed.message}`)
    try {
      await client.getChainId()
      return { rpcUrl, stop: () => child.kill() }
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  child.kill()
  throw new Error(`anvil did not answer on ${rpcUrl}`)
}

export type LocalDeployment = {
  rpcUrl: string
  chainId: number
  usdt: Address
  trustRegistry: Address
  tradeDeals: Address
}

export async function deployLocal(rpcUrl: string): Promise<LocalDeployment> {
  const publicClient = createPublicClient({ chain: foundry, transport: http(rpcUrl) })
  const admin = createWalletClient({ account: wallets.admin, chain: foundry, transport: http(rpcUrl) })

  const deploy = async (file: string, name: string, args: unknown[]) => {
    const { abi, bytecode } = artifact(file, name)
    const hash = await admin.deployContract({ abi, bytecode, args })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (!receipt.contractAddress) throw new Error(`${name} deploy failed`)
    return receipt.contractAddress
  }

  const usdt = await deploy("MockUSDT", "MockUSDT", [])
  const nonce = await publicClient.getTransactionCount({ address: wallets.admin.address })
  const predictedDeals = getContractAddress({ from: wallets.admin.address, nonce: BigInt(nonce + 1) })
  const trustRegistry = await deploy("TrustRegistry", "TrustRegistry", [predictedDeals])
  const tradeDeals = await deploy("TradeDeals", "TradeDeals", [
    wallets.admin.address,
    usdt,
    trustRegistry,
    wallets.verifier.address,
    {
      agentWallet: wallets.agent.address,
      gasRelayer: wallets.agent.address,
      reserveFund: wallets.reserve.address,
      platformTreasury: wallets.treasury.address,
    },
  ])
  if (tradeDeals.toLowerCase() !== predictedDeals.toLowerCase()) throw new Error("TradeDeals address prediction failed")

  const send = async (hash: Promise<Hex>) => publicClient.waitForTransactionReceipt({ hash: await hash })
  for (const [who, role] of [
    [wallets.exporter, Role.Exporter],
    [wallets.importer, Role.Importer],
    [wallets.investor, Role.Investor],
  ] as const) {
    await send(admin.writeContract({ address: tradeDeals, abi: tradeDealsAbi, functionName: "setKyc", args: [who.address, role] }))
  }
  for (const who of [wallets.importer, wallets.investor]) {
    await send(admin.writeContract({ address: usdt, abi: mockUsdtAbi, functionName: "mint", args: [who.address, 10_000_000_000n] }))
  }

  return { rpcUrl, chainId: foundry.id, usdt, trustRegistry, tradeDeals }
}

export type ClaimOptions = {
  containerNo: string
  blRef?: string
  amountUsdt?: bigint
  declaredKg?: number
  claimedStatus?: number
}

/** Exporter creates an invoice, importer approves it, exporter claims the shipment. Emits Claimed. */
export async function createClaimedDeal(dep: LocalDeployment, opts: ClaimOptions): Promise<bigint> {
  const chain = createPublicClient({ chain: foundry, transport: http(dep.rpcUrl) })
  const send = async (account: Account, functionName: string, args: readonly unknown[]) => {
    const { request } = await chain.simulateContract({
      account,
      address: dep.tradeDeals,
      abi: tradeDealsAbi,
      functionName: functionName as never,
      args: args as never,
    })
    const wallet = createWalletClient({ account, chain: foundry, transport: http(dep.rpcUrl) })
    await chain.waitForTransactionReceipt({ hash: await wallet.writeContract(request) })
  }

  const now = (await chain.getBlock()).timestamp
  const salt = `${opts.containerNo} ${now} ${Math.random()}`
  const termsHash = keccak256(stringToHex("TrustMeBro T&C v1: pay to the TradeDeals contract"))
  await send(wallets.exporter, "createDeal", [
    (opts.amountUsdt ?? 100n) * 1_000_000n,
    now + 3_600n,
    wallets.importer.address,
    keccak256(stringToHex(`invoice ${salt}`)),
    termsHash,
    { verifyWindow: 300, listingWindow: 900, graceWindow: 300 },
  ])
  const id = await chain.readContract({ address: dep.tradeDeals, abi: tradeDealsAbi, functionName: "dealCount" })
  await send(wallets.importer, "approveDeal", [id, termsHash])
  await send(wallets.exporter, "declareClaims", [
    id,
    opts.declaredKg ?? 10_000,
    opts.claimedStatus ?? 3,
    keccak256(stringToHex(`invoice + packing list + BL for ${opts.containerNo}`)),
    opts.containerNo,
    opts.blRef ?? "BL-001",
  ])
  return id
}
