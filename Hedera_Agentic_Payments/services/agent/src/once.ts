/**
 * G1 proof: one autonomous paid check end to end, no human (plan v5 §8).
 *   pnpm verifier && pnpm agent:once          → plan v5 §4's demo shipment on a throwaway deal id
 *   CHAIN_ADAPTER=local pnpm agent:once <id>  → a real Claimed deal on lane C's local stack, checked by
 *                                               lane C's verifier (`npm run local`, PAYMENTS=on)
 * The body is {dealId, shipmentRef} only; prints the HashScan link of the settled USDC payment.
 * Buys and checks the evidence only: relaying it to TradeDeals is the runtime's job (pnpm agent).
 */
import { buyVerification } from "./buy.ts";
import { demoClaim, liveBuyDeps } from "./live.ts";
import { chainTarget, readClaim } from "./target.ts";

const target = chainTarget();
const arg = process.argv[2];
const onChain = arg ? await readClaim(target, BigInt(arg)) : undefined;
const claim = onChain ?? demoClaim();
console.log(`TradeDeals ${target.tradeDeals} on chain ${target.chainId} (${target.kind}); verifier signer ${target.expectedSigner}`);
console.log(`deal ${arg ?? claim.dealId.slice(0, 10) + "… (throwaway)"}: claim ${claim.declaredKg} kg, status ${claim.claimedStatus}, container ${claim.containerNo} / ${claim.blRef || "-"}`);

const result = await buyVerification(
  { dealId: claim.dealId, shipmentRef: { containerNo: claim.containerNo, blRef: claim.blRef } },
  { checkNo: (onChain?.checks ?? 0) + 1, exporter: claim.exporter },
  liveBuyDeps(async (e) => console.log(`[audit] ${e.kind.padEnd(13)} ${e.reason}`), target),
);

if (result.status === "verified") {
  const r = result.response;
  const v = r.verification;
  console.log("\n✅ paid, and the response is signed by the approved verifier for this deal, chain and contract");
  console.log("   Hedera tx :", result.settlement.txId);
  console.log("   HashScan  :", result.settlement.hashscan);
  console.log(`   observed  : ${v.observedKg} kg, status ${v.statusCode}, docHash ${v.docHash.slice(0, 10)}…, observedAt ${v.observedAt}`);
  console.log(`   signed    : ${r.signer} on chain ${r.domain.chainId} for ${r.domain.verifyingContract}, sigHash ${r.sigHash.slice(0, 10)}…`);
  if (r.expected) console.log(`   verifier's forecast (ignored, the contract decides): ${r.expected.outcome}`);
} else {
  console.log(`\n⛔ ${result.status}: ${result.reason}`);
  process.exitCode = 1;
}
