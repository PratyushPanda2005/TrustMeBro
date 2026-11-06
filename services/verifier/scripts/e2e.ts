// Full flow on a local chain with the real contracts and the real verifier (payments off):
// honest deal (create -> approve -> claim -> verify -> fund -> pay), a weight cheat, and a tracking lag.
//
//   cd contracts && forge build
//   cd ../services/verifier && npm run e2e

import type { AddressInfo } from "node:net"

import { createPublicClient, createWalletClient, http, type Account, type Hex } from "viem"
import { foundry } from "viem/chains"

import { DEAL_STATE_NAMES, DealState, tradeDealsAbi, trustRegistryAbi, type Address } from "@trustmebro/shared"

import { createDealReader } from "../src/chain"
import { silentLogger } from "../src/log"
import { ScenarioBook, type Scenario } from "../src/scenarios"
import { createApp } from "../src/server"
import { createVerificationSigner } from "../src/signer"
import { ANVIL_KEYS, createClaimedDeal, deployLocal, mockUsdtAbi, startAnvil, wallets } from "./local-chain"

const USDT = 1_000_000n
const DEMO_TOKEN = "e2e-demo-token"

const anvil = await startAnvil(8545 + Math.floor(Math.random() * 1000))
let closeVerifier = () => {}
let failures = 0

try {
  const dep = await deployLocal(anvil.rpcUrl)
  const chain = createPublicClient({ chain: foundry, transport: http(dep.rpcUrl) })
  const walletFor = (account: Account) => createWalletClient({ account, chain: foundry, transport: http(dep.rpcUrl) })
  const registry = await chain.readContract({ address: dep.tradeDeals, abi: tradeDealsAbi, functionName: "registry" })

  const app = createApp({
    reader: createDealReader(dep.rpcUrl, dep.tradeDeals),
    signer: createVerificationSigner(ANVIL_KEYS.verifier),
    scenarios: new ScenarioBook("honest"),
    tradeDeals: dep.tradeDeals,
    chainId: dep.chainId,
    signatureTtlSeconds: 600,
    payments: { enabled: false },
    demoToken: DEMO_TOKEN,
    log: silentLogger,
  })
  const verifierUrl = await new Promise<string>((resolve) => {
    const server = app.listen(0, () => {
      closeVerifier = () => server.close()
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
    })
  })

  console.log(`anvil ${dep.rpcUrl} | TradeDeals ${dep.tradeDeals} | verifier ${verifierUrl}\n`)

  async function tx(account: Account, functionName: string, args: readonly unknown[]) {
    const { request } = await chain.simulateContract({
      account,
      address: dep.tradeDeals,
      abi: tradeDealsAbi,
      functionName: functionName as never,
      args: args as never,
    })
    const receipt = await chain.waitForTransactionReceipt({ hash: await walletFor(account).writeContract(request) })
    if (receipt.status !== "success") throw new Error(`${functionName} reverted`)
    return receipt
  }

  async function approveUsdt(account: Account, amount: bigint) {
    const hash = await walletFor(account).writeContract({
      address: dep.usdt,
      abi: mockUsdtAbi,
      functionName: "approve",
      args: [dep.tradeDeals, amount],
    })
    await chain.waitForTransactionReceipt({ hash })
  }

  const usdtOf = (who: Address) =>
    chain.readContract({ address: dep.usdt, abi: mockUsdtAbi, functionName: "balanceOf", args: [who] })
  const stateOf = async (id: bigint) =>
    (await chain.readContract({ address: dep.tradeDeals, abi: tradeDealsAbi, functionName: "getDeal", args: [id] })).state
  const trustOf = (who: Address) =>
    chain.readContract({ address: registry, abi: trustRegistryAbi, functionName: "trust", args: [who] })

  function check(label: string, ok: boolean, detail = "") {
    if (!ok) failures++
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
  }

  async function setScenario(containerNo: string, scenario: Scenario) {
    const res = await fetch(`${verifierUrl}/demo/scenarios/${containerNo}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-demo-token": DEMO_TOKEN },
      body: JSON.stringify({ scenario }),
    })
    if (!res.ok) throw new Error(`set scenario failed: ${res.status}`)
  }

  const claimedDeal = (containerNo: string) => createClaimedDeal(dep, { containerNo })

  /** What the agent does after paying: ask the verifier, then relay the signed answer. */
  async function verifyAndRelay(id: bigint, containerNo: string) {
    const res = await fetch(`${verifierUrl}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dealId: id.toString(), shipmentRef: { containerNo, blRef: "BL-001" } }),
    })
    if (!res.ok) throw new Error(`verify failed: ${res.status} ${await res.text()}`)
    const body = (await res.json()) as {
      verification: { dealId: Hex; observedKg: number; statusCode: number; docHash: Hex; observedAt: string; nonce: string; expiry: string }
      signature: Hex
      expected: { outcome: string }
    }
    const v = body.verification
    await tx(wallets.agent, "submitVerification", [
      {
        dealId: v.dealId,
        observedKg: v.observedKg,
        statusCode: v.statusCode,
        docHash: v.docHash,
        observedAt: BigInt(v.observedAt),
        nonce: BigInt(v.nonce),
        expiry: BigInt(v.expiry),
      },
      body.signature,
    ])
    return body.expected.outcome
  }

  console.log("1. Honest deal: 100 USDT invoice, new exporter (50%) and importer (4% risk)")
  {
    const id = await claimedDeal("MSKU1234567")
    const expected = await verifyAndRelay(id, "MSKU1234567")
    const state = await stateOf(id)
    check("verifier predicted Verified", expected === "Verified", expected)
    check("contract state is Verified", state === DealState.Verified, DEAL_STATE_NAMES[state])

    const q = await chain.readContract({ address: dep.tradeDeals, abi: tradeDealsAbi, functionName: "quote", args: [id] })
    check("quote: advance 50 USDT, yield 4.00%", q.advance === 50n * USDT && q.yieldBps === 400n, `${q.advance} / ${q.yieldBps}`)

    const exporter0 = await usdtOf(wallets.exporter.address)
    await approveUsdt(wallets.investor, q.advance)
    await tx(wallets.investor, "fund", [id, q.advance, q.yieldBps])
    check("funded; exporter got 48 USDT", (await usdtOf(wallets.exporter.address)) - exporter0 === 48n * USDT)
    check("agent wallet got 1.50 USDT (agent + gas)", (await usdtOf(wallets.agent.address)) === 1_500_000n)

    const investor0 = await usdtOf(wallets.investor.address)
    await approveUsdt(wallets.importer, 100n * USDT)
    await tx(wallets.importer, "pay", [id, 100n * USDT])
    check("settled", (await stateOf(id)) === DealState.Settled)
    check("investor got 52 USDT back first", (await usdtOf(wallets.investor.address)) - investor0 === 52n * USDT)
    check("exporter trust 50% -> 66.67%", (await trustOf(wallets.exporter.address)) === 6_667n)
  }

  console.log("\n2. Tracking lag: first check Pending, second check Verified")
  {
    await setScenario("MSKU0000777", "lag")
    const id = await claimedDeal("MSKU0000777")
    const first = await verifyAndRelay(id, "MSKU0000777")
    check("first check: Pending", first === "Pending" && (await stateOf(id)) === DealState.Pending)
    const second = await verifyAndRelay(id, "MSKU0000777")
    check("second check: Verified", second === "Verified" && (await stateOf(id)) === DealState.Verified)
  }

  console.log("\n3. Weight cheat: claims 10,000 kg, weighbridge reads 8,020 kg")
  {
    await setScenario("MSKU0000666", "short-weight")
    const trust0 = await trustOf(wallets.exporter.address)
    const id = await claimedDeal("MSKU0000666")
    const outcome = await verifyAndRelay(id, "MSKU0000666")
    const state = await stateOf(id)
    check("verifier predicted Falsified", outcome === "Falsified", outcome)
    check("contract state is Rejected", state === DealState.Rejected, DEAL_STATE_NAMES[state])
    const trust1 = await trustOf(wallets.exporter.address)
    check("only the exporter's trust drops", trust1 < trust0, `${trust0} -> ${trust1} bps`)

    const late = await fetch(`${verifierUrl}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dealId: id.toString(), shipmentRef: { containerNo: "MSKU0000666", blRef: "BL-001" } }),
    })
    check("verifier refuses to sell a check for a closed deal (409, not charged)", late.status === 409)
  }

  console.log(failures === 0 ? "\nAll end-to-end checks passed." : `\n${failures} end-to-end check(s) FAILED.`)
} finally {
  closeVerifier()
  anvil.stop()
}

process.exit(failures === 0 ? 0 : 1)
