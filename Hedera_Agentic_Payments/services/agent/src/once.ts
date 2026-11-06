/**
 * G1 proof: one autonomous paid check end to end, no human (plan v5 §8).
 *   pnpm verifier          (terminal 1)
 *   pnpm agent:once        (terminal 2) → prints the HashScan link of the settled USDC payment
 * Uses plan v5 §4's demo shipment on a throwaway deal id; the body is {dealId, shipmentRef} only.
 */
import { buyVerification } from "./buy.ts";
import { demoClaim, liveBuyDeps } from "./live.ts";

const claim = demoClaim();
const result = await buyVerification(
  { dealId: claim.dealId, shipmentRef: { containerNo: claim.containerNo, blRef: claim.blRef } },
  { checkNo: 1, exporter: claim.exporter },
  liveBuyDeps(async (e) => console.log(`[audit] ${e.kind.padEnd(13)} ${e.reason}`)),
);

if (result.status === "verified") {
  const v = result.response.verification;
  console.log("\n✅ paid and verified");
  console.log("   Hedera tx :", result.settlement.txId);
  console.log("   HashScan  :", result.settlement.hashscan);
  console.log(`   observed  : ${v.observedKg} kg, status ${v.statusCode}, docHash ${v.docHash.slice(0, 10)}…, observedAt ${v.observedAt}`);
  console.log("\n→ paste the tx id into README 'Payment flow' and docs/PROOFS.md");
} else {
  console.log(`\n⛔ ${result.status}: ${result.reason}`);
  process.exitCode = 1;
}
