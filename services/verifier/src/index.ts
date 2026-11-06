import { existsSync } from "node:fs"

import { createPublicClient, getAddress, http, type Address } from "viem"

import { deployments } from "@trustmebro/shared"

import { createDealReader } from "./chain"
import { loadConfig, type Config } from "./config"
import { consoleLogger as log } from "./log"
import { ScenarioBook } from "./scenarios"
import { createApp } from "./server"
import { createVerificationSigner } from "./signer"
import { usdcUnits } from "./price"
import { createPaymentMiddleware } from "./x402"

if (existsSync(".env")) process.loadEnvFile(".env")

async function main() {
  const cfg = loadConfig()
  const chainId = await createPublicClient({ transport: http(cfg.RPC_URL) }).getChainId()
  const tradeDeals = resolveTradeDeals(cfg, chainId)
  const reader = createDealReader(cfg.RPC_URL, tradeDeals)
  const signer = createVerificationSigner(cfg.VERIFIER_SIGNER_PK as `0x${string}`)

  // A wrong key would sell signatures the contract rejects with InvalidSigner, so refuse to start.
  const onChainVerifier = await reader.verifierAddress()
  if (onChainVerifier.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(
      `VERIFIER_SIGNER_PK is for ${signer.address}, but TradeDeals ${tradeDeals} trusts ${onChainVerifier}. ` +
        "Use the key whose address was VERIFIER_ADDRESS at deploy.",
    )
  }

  const paymentsOn = cfg.PAYMENTS === "on"
  const payments = paymentsOn
    ? {
        enabled: true,
        price: cfg.PRICE,
        amount: usdcUnits(cfg.PRICE),
        asset: cfg.HEDERA_USDC,
        network: cfg.HEDERA_NETWORK,
        payTo: cfg.VERIFIER_PAYTO,
        facilitator: cfg.FACILITATOR_URL,
      }
    : { enabled: false, note: "PAYMENTS=off: /verify is free (local development only)" }

  const app = createApp({
    reader,
    signer,
    scenarios: new ScenarioBook(cfg.DEFAULT_SCENARIO),
    tradeDeals,
    chainId,
    signatureTtlSeconds: cfg.SIGNATURE_TTL_SECONDS,
    payment: paymentsOn ? createPaymentMiddleware(cfg, log) : undefined,
    payments,
    demoToken: cfg.DEMO_TOKEN,
    corsOrigin: cfg.CORS_ORIGIN,
    log,
  })

  app.listen(cfg.PORT, () => {
    log.info("verifier listening", { url: `http://localhost:${cfg.PORT}`, chainId, tradeDeals, signer: signer.address })
    if (!paymentsOn) log.warn("PAYMENTS=off: POST /verify is free. Turn payments on for the Hedera demo.")
    if (!cfg.DEMO_TOKEN) log.warn("DEMO_TOKEN is not set: anyone can change demo scenarios.")
  })
}

function resolveTradeDeals(cfg: Config, chainId: number): Address {
  if (cfg.TRADEDEALS_ADDRESS) return getAddress(cfg.TRADEDEALS_ADDRESS)
  const deployment = (deployments as Record<string, { tradeDeals?: string } | undefined>)[String(chainId)]
  if (deployment?.tradeDeals) return getAddress(deployment.tradeDeals)
  throw new Error(`No TradeDeals address for chain ${chainId}: set TRADEDEALS_ADDRESS or run contracts/script/export.mjs`)
}

main().catch((err: unknown) => {
  log.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
