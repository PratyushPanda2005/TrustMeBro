/**
 * The agent's job for one Claimed deal (plan v5 §3 steps 5–6). It pays for evidence and
 * delivers it; it never judges. The TradeDeals contract compares claims vs observed:
 * Verified / Pending (recheck) / Rejected / Mismatch.
 */
import type { VerifyRequest, Hex } from "@tmb/shared";
import { FALSIFIED } from "@tmb/shared";
import { sigHash } from "@tmb/shared/sign";
import type { AuditEvent, BuyResult, CheckContext } from "./buy.ts";
import type { ChainAdapter, ClaimedEvent, RelayOutcome, TrustUpdate } from "./chain.ts";

export interface AgentDeps {
  chain: ChainAdapter;
  buy: (req: VerifyRequest, ctx: CheckContext) => Promise<BuyResult>;
  audit: (e: AuditEvent) => Promise<void>;
}

export type ProcessOutcome =
  | { outcome: RelayOutcome; checkNo: number; txHash: string; hederaTxId?: string; trust?: TrustUpdate }
  | { outcome: "relay_failed" | Exclude<BuyResult["status"], "verified">; checkNo: number; reason: string };

/** Pending is tracking lag: recheck until the contract decides, at most `maxChecks` paid checks per deal. */
export function shouldRecheck(outcome: ProcessOutcome["outcome"], checksDone: number, maxChecks: number): boolean {
  return outcome === "pending" && checksDone < maxChecks;
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
