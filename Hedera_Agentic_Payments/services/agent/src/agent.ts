/**
 * The agent's job for one Claimed deal (plan v5 §3 steps 5–6). It pays for evidence and
 * delivers it; it never judges. The TradeDeals contract compares claims vs observed:
 * Verified / Pending (recheck) / Rejected / Mismatch.
 */
import type { VerifyRequest, Hex } from "@tmb/shared";
import { DEAL_STATE, FALSIFIED } from "@tmb/shared";
import { sigHash } from "@tmb/shared/sign";
import type { AuditEvent, BuyResult, CheckContext } from "./buy.ts";
import { stateName, type ChainAdapter, type ClaimedEvent, type RelayOutcome, type TrustUpdate } from "./chain.ts";

export interface AgentDeps {
  chain: ChainAdapter;
  buy: (req: VerifyRequest, ctx: CheckContext) => Promise<BuyResult>;
  audit: (e: AuditEvent) => Promise<void>;
  /** The verifier key the agent is configured to pay for; must equal TradeDeals.verifier(). */
  expectedSigner: string;
}

export type ProcessOutcome =
  | { outcome: RelayOutcome; checkNo: number; txHash: string; hederaTxId?: string; trust?: TrustUpdate }
  | { outcome: "relay_failed" | "skipped" | Exclude<BuyResult["status"], "verified">; checkNo: number; reason: string };

/** Seconds after verifyDeadline for the last check, so its observedAt is clearly past the deadline. */
export const DEADLINE_MARGIN_SEC = 5;

/**
 * When to buy the next check, in seconds from now, or null for no more checks (plan v5 §3 step 6).
 * Only Pending (status behind: tracking lag) is rechecked, up to `maxChecks` paid checks per deal.
 * The last check is kept for after verifyDeadline: a status still behind then is falsified by the
 * contract, so a stuck shipment gets a verdict instead of hanging in Pending. The agent never judges.
 */
export function nextCheckInSec(
  outcome: ProcessOutcome["outcome"], checksDone: number, maxChecks: number,
  nowSec: number, verifyDeadline: bigint, delaySec: number,
): number | null {
  if (outcome !== "pending" || checksDone >= maxChecks) return null;
  const isLast = checksDone + 1 === maxChecks;
  const afterDeadline = Number(verifyDeadline) + DEADLINE_MARGIN_SEC - nowSec;
  return isLast && afterDeadline > delaySec ? afterDeadline : delaySec;
}

const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;
const falsifiedNames = (mask: number) =>
  [mask & FALSIFIED.WEIGHT && "weight", mask & FALSIFIED.DOCS && "documents", mask & FALSIFIED.STATUS && "status"].filter(Boolean).join(", ");

function describe(t: TrustUpdate | undefined, outcome: RelayOutcome): string {
  const what = outcome === "rejected" && t ? `rejected (${falsifiedNames(t.falsifiedMask)} falsified)` : outcome;
  if (!t) return what;
  if (t.afterBps !== t.beforeBps) return `${what}; exporter score ${pct(t.beforeBps)} → ${pct(t.afterBps)}`;
  return `${what}; score unchanged ${pct(t.afterBps)}${outcome === "verified" ? " (credit at settlement)" : ""}`;
}

export async function processClaim(e: ClaimedEvent, checkNo: number, d: AgentDeps): Promise<ProcessOutcome> {
  // Before paying: is there still something to verify, and does the contract trust the verifier we'd pay?
  const status = await d.chain.dealStatus(e.dealId);
  if (!status || (status.state !== DEAL_STATE.Claimed && status.state !== DEAL_STATE.Pending)) {
    const reason = status ? `deal is ${stateName(status.state)}, not Claimed or Pending: nothing to verify, nothing paid` : "deal not found on TradeDeals; nothing paid";
    await d.audit({ kind: "skipped", dealId: e.dealId, reason });
    return { outcome: "skipped", checkNo, reason };
  }
  const trusted = await d.chain.verifier();
  if (trusted && trusted.toLowerCase() !== d.expectedSigner.toLowerCase()) {
    const reason = `TradeDeals trusts verifier ${trusted}, not the configured ${d.expectedSigner}: its answers would revert InvalidSigner; nothing paid`;
    await d.audit({ kind: "refused", dealId: e.dealId, reason });
    return { outcome: "refused", checkNo, reason };
  }

  // Plan v5 §8: only the deal id and carrier refs. The claims are on chain; the agent can't launder a lie.
  const req: VerifyRequest = { dealId: e.dealId, shipmentRef: { containerNo: e.containerNo, blRef: e.blRef || undefined } };
  const bought = await d.buy(req, { checkNo, exporter: e.exporter });
  if (bought.status !== "verified") return { outcome: bought.status, checkNo, reason: bought.reason };

  const relay = await d.chain.submitVerification(bought.response);
  const sig = sigHash(bought.response.signature as Hex);
  const payment = { ...bought.payment, hederaTxId: bought.settlement.txId, payer: bought.settlement.payer };
  if (!relay.ok) {
    await d.audit({ kind: "error", dealId: e.dealId, reason: `relay not sent: ${relay.error}`, sigHash: sig });
    return { outcome: "relay_failed", checkNo, reason: relay.error };
  }
  const t = relay.trust;
  await d.audit({
    kind: "relayed",
    dealId: e.dealId,
    reason: `check ${checkNo} → ${describe(t, relay.outcome)}; paid in Hedera tx ${bought.settlement.txId ?? "?"}`,
    // Option A record (plan v5 §8): {dealId, hederaTxId, payer, sigHash, whitechainTx}
    payment,
    sigHash: sig,
    whitechainTx: relay.txHash,
    trust: t && { exporter: t.exporter, outcome: t.outcome, beforeBps: t.beforeBps, afterBps: t.afterBps },
  });
  return { outcome: relay.outcome, checkNo, txHash: relay.txHash, hederaTxId: bought.settlement.txId, trust: t };
}
