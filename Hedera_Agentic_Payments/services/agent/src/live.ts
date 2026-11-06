/** Live wiring shared by the CLI scripts (agent:once, e2e): real x402 payer, real ledger, env config. */
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import type { VerifyRequest } from "@tmb/shared";
import { recoverVerificationSigner } from "@tmb/shared/sign";
import type { AuditEvent, BuyDeps } from "./buy.ts";
import { SpendLedger } from "./ledger.ts";
import { makePayFetch } from "./payer.ts";
import { loadPolicy, need, tradeDealsOrPlaceholder } from "./config.ts";

export const verifierBase = () => process.env.VERIFIER_URL ?? "http://localhost:4021";

export function liveBuyDeps(audit: (e: AuditEvent) => Promise<void>): BuyDeps {
  return {
    url: verifierBase() + "/verify",
    policy: loadPolicy(),
    ledger: new SpendLedger(join(process.cwd(), ".state", "ledger.json")),
    now: Date.now,
    expectedSigner: privateKeyToAccount(need("VERIFIER_EVM_PRIVATE_KEY") as `0x${string}`).address,
    fetch,
    payFetch: makePayFetch({ accountId: need("AGENT_HEDERA_ACCOUNT_ID"), privateKey: need("AGENT_HEDERA_PRIVATE_KEY") }),
    recoverSigner: recoverVerificationSigner,
    audit,
  };
}

/** An all-true demo shipment on a fresh random dealId. */
export function demoRequest(dealId = `0x${randomBytes(32).toString("hex")}`): VerifyRequest {
  return {
    dealId,
    tradeDeals: tradeDealsOrPlaceholder(),
    claims: { weight: true, status_code: true, document_verification: true },
    shipment: { containerNo: "MSKU1234567", blRef: "BL-DEMO-001" },
  };
}
