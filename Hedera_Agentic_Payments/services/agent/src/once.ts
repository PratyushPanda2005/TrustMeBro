/**
 * G1 proof: one autonomous paid request end to end, no human.
 *   pnpm verifier          (terminal 1)
 *   pnpm agent:once        (terminal 2) → prints the HashScan link of the settled USDC payment
 * Uses a throwaway dealId and the TRADE_DEALS_ADDRESS (or a placeholder) as verifyingContract.
 */
import { buyVerification } from "./buy.ts";
import { demoRequest, liveBuyDeps } from "./live.ts";

const result = await buyVerification(
  demoRequest(),
  "departure",
  liveBuyDeps(async (e) => console.log(`[audit] ${e.kind.padEnd(13)} ${e.reason}`)),
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
