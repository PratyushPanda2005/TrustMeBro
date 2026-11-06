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
import { DEAL_STATE } from "@tmb/shared";
import { stateName } from "./chain.ts";
import { chainTarget, deploymentScope, readClaim, readVerifier } from "./target.ts";

const target = chainTarget();
const arg = process.argv[2];
const onChain = arg ? await readClaim(target, BigInt(arg)) : undefined;
const claim = onChain ?? demoClaim();
console.log(`TradeDeals ${target.tradeDeals} on chain ${target.chainId} (${target.kind}); verifier signer ${target.expectedSigner}`);
console.log(`deal ${arg ?? claim.dealId.slice(0, 10) + "… (throwaway)"}: claim ${claim.declaredKg} kg, status ${claim.claimedStatus}, container ${claim.containerNo} / ${claim.blRef || "-"}`);

// Same pre-payment checks as the runtime (agent.ts): still something to verify, and the key the contract trusts.
async function preChecks(): Promise<string | undefined> {
  if (!onChain) return undefined;
  if (onChain.state !== DEAL_STATE.Claimed && onChain.state !== DEAL_STATE.Pending) {
    return `⏭  deal ${arg} is ${stateName(onChain.state)}, not Claimed or Pending: nothing to verify, nothing paid`;
  }
  const trusted = await readVerifier(target);
  if (trusted.toLowerCase() !== target.expectedSigner.toLowerCase()) {
    process.exitCode = 1;
    return `⛔ refused: TradeDeals trusts verifier ${trusted}, not the configured ${target.expectedSigner}; its answers would revert InvalidSigner. Nothing paid.`;
  }
  console.log(`pre-checks: deal is ${stateName(onChain.state)} with ${onChain.checks} check(s); verifier() = ${trusted} ✓`);
  return undefined;
}

// process.exit() while viem's sockets close trips a libuv assertion on Windows: set exitCode and fall through.
const stop = await preChecks();
if (stop) console.log(`\n${stop}`);
else await buyOnce();

async function buyOnce() {
  const result = await buyVerification(
    { dealId: claim.dealId, shipmentRef: { containerNo: claim.containerNo, blRef: claim.blRef } },
    { checkNo: (onChain?.checks ?? 0) + 1, exporter: claim.exporter },
    liveBuyDeps(async (e) => console.log(`[audit] ${e.kind.padEnd(13)} ${e.reason}`), target, await deploymentScope(target)),
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
}
