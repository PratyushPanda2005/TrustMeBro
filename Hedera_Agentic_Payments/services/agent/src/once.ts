/**
 * G1 proof: one autonomous paid request end to end, no human.
 *   pnpm verifier          (terminal 1)
 *   pnpm agent:once        (terminal 2) → prints the HashScan link of the settled USDC payment
 * Uses a throwaway dealId and the TRADE_DEALS_ADDRESS (or a placeholder) as verifyingContract.
 */
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { recoverVerificationSigner } from "@tmb/shared/sign";
import { buyVerification } from "./buy.ts";
import { SpendLedger } from "./ledger.ts";
import { makePayFetch } from "./payer.ts";
import { loadPolicy, need, tradeDealsOrPlaceholder } from "./config.ts";

const policy = loadPolicy();
const verifierUrl = (process.env.VERIFIER_URL ?? "http://localhost:4021") + "/verify";
const expectedSigner = privateKeyToAccount(need("VERIFIER_EVM_PRIVATE_KEY") as `0x${string}`).address;

const result = await buyVerification(
  {
    dealId: `0x${randomBytes(32).toString("hex")}`,
    tradeDeals: tradeDealsOrPlaceholder(),
    claims: { weight: true, status_code: true, document_verification: true },
    shipment: { containerNo: "MSKU1234567", blRef: "BL-DEMO-001" },
  },
  "departure",
  {
    url: verifierUrl,
    policy,
    ledger: new SpendLedger(join(process.cwd(), ".state", "ledger.json")),
    now: Date.now,
    expectedSigner,
    fetch,
    payFetch: makePayFetch({ accountId: need("AGENT_HEDERA_ACCOUNT_ID"), privateKey: need("AGENT_HEDERA_PRIVATE_KEY") }),
    recoverSigner: recoverVerificationSigner,
    audit: async (e) => console.log(`[audit] ${e.kind.padEnd(13)} ${e.reason}`),
  },
);

if (result.status === "verified") {
  console.log("\n✅ paid and verified");
  console.log("   Hedera tx :", result.settlement.txId);
  console.log("   HashScan  :", result.settlement.hashscan);
  console.log("   observed  :", result.response.verification);
  console.log("\n→ paste the tx id into README 'Payment flow' and docs/PROOFS.md");
} else {
  console.log(`\n⛔ ${result.status}: ${result.reason}`);
  process.exitCode = 1;
}
