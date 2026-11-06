// Local dev stack: anvil (chain 31337) + freshly deployed contracts + this verifier, all in one process.
// Lets the agent and frontend teams work before the Whitechain deploy and the Hedera accounts exist.
//
//   npm run local                 (payments off; PAYMENTS=on VERIFIER_PAYTO=0.0.x npm run local for x402)
//   npm run claim -- MSKU0000666 short-weight     (in another terminal: makes a Claimed deal)

import { writeFileSync } from "node:fs"

import { ANVIL_KEYS, deployLocal, startAnvil, wallets } from "./local-chain"

const anvil = await startAnvil(Number(process.env.ANVIL_PORT ?? 8545))
const dep = await deployLocal(anvil.rpcUrl)

writeFileSync(
  "local-deployment.json",
  `${JSON.stringify(
    {
      note: "Local anvil deployment from scripts/local.ts. Test keys only, never use them on a real network.",
      ...dep,
      wallets: Object.fromEntries(
        Object.entries(wallets).map(([name, account]) => [
          name,
          { address: account.address, privateKey: ANVIL_KEYS[name as keyof typeof ANVIL_KEYS] },
        ]),
      ),
    },
    null,
    2,
  )}\n`,
)

// Local values win over .env, so a testnet .env can stay in place.
process.env.RPC_URL = dep.rpcUrl
process.env.TRADEDEALS_ADDRESS = dep.tradeDeals
process.env.VERIFIER_SIGNER_PK = ANVIL_KEYS.verifier
process.env.PAYMENTS ??= "off"
process.env.DEMO_TOKEN ??= "local-demo-token"

console.log(`
Local chain ready (chain ${dep.chainId}, ${dep.rpcUrl})
  TradeDeals     ${dep.tradeDeals}
  TrustRegistry  ${dep.trustRegistry}
  MockUSDT       ${dep.usdt}
  exporter ${wallets.exporter.address} | importer ${wallets.importer.address} | investor ${wallets.investor.address}
  agent relayer  ${wallets.agent.address} (has ETH for gas)
  Keys and addresses: services/verifier/local-deployment.json
  DEMO_TOKEN     ${process.env.DEMO_TOKEN}
`)

process.on("SIGINT", () => {
  anvil.stop()
  process.exit(0)
})

await import("../src/index")
