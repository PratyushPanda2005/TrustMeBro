/**
 * The autonomous TrustMeBro agent, plan v5 §3 steps 5–6 and §9 (no human in the payment path).
 *   1. catch up on deals still Claimed/Pending, then watch `Claimed` on Whitechain
 *   2. per claim: spending gate → x402 payment on Hedera → signed facts → relay to TradeDeals
 *   3. the contract decides: Verified / Rejected / Mismatch, or Pending → the agent rechecks
 *      later as the next check (max 3 per deal; the last one after verifyDeadline). Before each paid
 *      check it reads getDeal (still Claimed/Pending?) and verifier() (the key it pays for?).
 *   4. every step goes to the HCS audit topic (Agent Kit), incl. {hederaTxId, payer, sigHash, whitechainTx}
 *   5. over-cap prices wait for a human via the approvals API (dashboard button)
 * Run: pnpm agent   CHAIN_ADAPTER=mock (no chain) | local (lane C's anvil, `npm run local`) | whitechain
 */
import { join } from "node:path";
import { hashscanTopic } from "@tmb/shared";
import { AuditLog, auditTailFile, makeAuditSink } from "@tmb/audit";
import { buyVerification } from "./buy.ts";
import { nextCheckInSec, processClaim } from "./agent.ts";
import { MockChainAdapter, type ChainAdapter, type ClaimedEvent } from "./chain.ts";
import { tradeDealsAdapter, type TradeDealsAdapter } from "./whitechain.ts";
import { startApi } from "./api.ts";
import { tradeDealsOrPlaceholder } from "./config.ts";
import { demoClaim, liveBuyDeps } from "./live.ts";
import { chainTarget, deploymentScope } from "./target.ts";

const STATE = join(process.cwd(), ".state");
const topic = process.env.AUDIT_TOPIC_ID;
// HCS writer: Hedera Agent Kit consensus tools by default, AUDIT_SINK=sdk for plain @hiero-ledger/sdk.
const { sink, kind: auditSink } = makeAuditSink();
const audit = new AuditLog(sink, auditTailFile(STATE, topic));
const auditWrite = async (e: any) => { await audit.write(e); console.log(`[agent] ${e.kind.padEnd(13)} ${e.reason}`); };

const adapterKind = process.env.CHAIN_ADAPTER ?? "mock";
const target = chainTarget();
const real: TradeDealsAdapter | undefined = adapterKind === "local" || adapterKind === "whitechain"
  ? tradeDealsAdapter(target, BigInt(process.env.WHITECHAIN_FROM_BLOCK ?? 0))
  : undefined;
const chain: ChainAdapter = real ?? new MockChainAdapter(tradeDealsOrPlaceholder());

// Signs only the exact quote the spending gate approved (including human-approved over-cap prices).
// The ledger knows deals per deployment (anvil redeploys at the same address on every restart).
const buyDeps = liveBuyDeps(auditWrite, target, real ? await deploymentScope(target) : undefined);
const maxChecks = buyDeps.policy.maxChecksPerDeal;
const recheckDelaySec = Number(process.env.RECHECK_DELAY_SEC ?? 20);
const deps = { chain, audit: auditWrite, expectedSigner: buyDeps.expectedSigner, buy: (req: any, ctx: any) => buyVerification(req, ctx, buyDeps) };

// One check at a time per deal (no double processing from catch-up + live events + rechecks).
const inflight = new Set<string>();
const known = new Map<string, ClaimedEvent>();
async function handle(e: ClaimedEvent, checkNo: number) {
  const id = e.dealId.toLowerCase();
  known.set(id, e);
  if (inflight.has(id)) return;
  inflight.add(id);
  try {
    const r = await processClaim(e, checkNo, deps);
    const deal = real ? BigInt(e.dealId).toString() : `${e.dealId.slice(0, 10)}…`;
    console.log(`[agent] deal ${deal} check ${checkNo} → ${r.outcome}`);
    if ("txHash" in r && real) {
      console.log(`        ${target.kind} tx ${real.txLink(r.txHash)}${r.events?.length ? `  events: ${r.events.join(", ")}` : ""}`);
      if (r.trust) console.log(`        exporter ${r.trust.exporter} trust ${(r.trust.beforeBps / 100).toFixed(2)}% → ${(r.trust.afterBps / 100).toFixed(2)}% (TrustRegistry)`);
    }
    const wait = nextCheckInSec(r.outcome, checkNo, maxChecks, Math.floor(Date.now() / 1000), e.verifyDeadline, recheckDelaySec);
    if (wait !== null) {
      const last = checkNo + 1 === maxChecks && wait > recheckDelaySec ? " (last check, kept for after verifyDeadline)" : "";
      await auditWrite({ kind: "recheck", dealId: e.dealId, reason: `status behind: check ${checkNo + 1} of ${maxChecks} in ${wait}s${last}` });
      setTimeout(() => void handle(e, checkNo + 1), wait * 1000);
    }
  } catch (err) {
    await auditWrite({ kind: "error", dealId: e.dealId, reason: `unexpected: ${(err as Error).message}` });
  } finally {
    inflight.delete(id);
  }
}

await startApi({
  port: Number(process.env.AGENT_API_PORT ?? 4002),
  ledger: buyDeps.ledger,
  token: process.env.AGENT_API_TOKEN,
  onApproved: async (a) => {
    await auditWrite({ kind: "approved", dealId: a.dealId, reason: `human approved ${a.amount} to ${a.payTo} for check ${a.checkNo}` });
    // Retry that check: the gate now sees the approval, and payFetch pins the approved amount.
    const e = known.get(a.dealId.toLowerCase());
    if (e) await handle(e, a.checkNo);
    else console.log(`[agent] approval ${a.id}: deal ${a.dealId.slice(0, 10)}… not seen since start; it is retried when the claim is seen again`);
  },
});

if (real) {
  const trusted = await real.verifier();
  console.log(`TradeDeals ${target.tradeDeals} on chain ${target.chainId} (${target.kind}); verifier() ${trusted}${trusted.toLowerCase() === target.expectedSigner.toLowerCase() ? " ✓" : ` ≠ configured ${target.expectedSigner}: checks will be refused`}; relayer ${real.relayer}`);
}
console.log(`TrustMeBro agent: adapter=${adapterKind} verifier=${buyDeps.url} tradeDeals=${chain.tradeDeals} audit=${auditSink === "console" ? "console" : `${hashscanTopic(topic!)} via ${auditSink}`}`);
for (const { claim, checks } of await chain.openClaims()) await handle(claim, checks + 1);
chain.watchClaims((e) => void handle(e, 1));

// Mock mode: the demo exporter declares plan v5 §4's shipment, so the Hedera leg runs before contracts exist.
if (chain instanceof MockChainAdapter && process.env.MOCK_DEMO_SHIPMENT !== "0") chain.emit(demoClaim());
