/** Live wiring shared by the CLI scripts (agent:once, e2e) and the runtime: real x402 payer, real ledger, env config. */
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { DEMO_SHIPMENT, demoDocHash, dealIdToBytes32 } from "@tmb/shared";
import { recoverVerificationSigner } from "@tmb/shared/sign";
import type { AuditEvent, BuyDeps } from "./buy.ts";
import type { ClaimedEvent } from "./chain.ts";
import { SpendLedger } from "./ledger.ts";
import { makePayFetch } from "./payer.ts";
import { loadPolicy, need } from "./config.ts";
import { chainTarget, type ChainTarget } from "./target.ts";

export const verifierBase = () => process.env.VERIFIER_URL ?? "http://localhost:4021";

export function liveBuyDeps(audit: (e: AuditEvent) => Promise<void>, target: ChainTarget = chainTarget(), scope?: string): BuyDeps {
  return {
    url: verifierBase() + "/verify",
    tradeDeals: target.tradeDeals,
    chainId: target.chainId,
    scope,
    policy: loadPolicy(),
    ledger: new SpendLedger(join(process.cwd(), ".state", "ledger.json")),
    now: Date.now,
    expectedSigner: target.expectedSigner,
    fetch,
    payFetch: makePayFetch({ accountId: need("AGENT_HEDERA_ACCOUNT_ID"), privateKey: need("AGENT_HEDERA_PRIVATE_KEY") }),
    recoverSigner: recoverVerificationSigner,
    audit,
  };
}

const randomDealId = () => dealIdToBytes32(BigInt(`0x${randomBytes(8).toString("hex")}`));
const randomAddress = () => `0x${randomBytes(20).toString("hex")}`;

/**
 * Plan v5 §4's demo shipment as a Claimed event: Ravi declares 10,000 kg, LOADED, docHash A
 * for MSKU1234567. Fresh deal id and exporter unless given; verifyDeadline = now + window.
 */
export function demoClaim(o: Partial<ClaimedEvent> & { verifyWindowSec?: number } = {}): ClaimedEvent {
  const { verifyWindowSec = 600, ...rest } = o;
  return {
    dealId: randomDealId(),
    exporter: randomAddress(),
    declaredKg: DEMO_SHIPMENT.declaredKg,
    claimedStatus: DEMO_SHIPMENT.claimedStatus,
    docHash: demoDocHash(DEMO_SHIPMENT.containerNo),
    containerNo: DEMO_SHIPMENT.containerNo,
    blRef: DEMO_SHIPMENT.blRef,
    verifyDeadline: BigInt(Math.floor(Date.now() / 1000) + verifyWindowSec),
    ...rest,
  };
}
