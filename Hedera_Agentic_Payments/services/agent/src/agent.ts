/**
 * The agent's job for one shipment. It pays for evidence and delivers it; it never
 * judges. The TradeDeals contract compares claims vs observed and moves the money.
 */
import { checksToClaims, dealOutcome, type VerifyRequest, type VerifyResponse } from "@tmb/shared";
import type { AuditEvent, BuyResult } from "./buy.ts";
import type { ChainAdapter, ShipmentDeclared } from "./chain.ts";
import type { Stage } from "./ledger.ts";

export interface AgentDeps {
  chain: ChainAdapter;
  buy: (req: VerifyRequest, stage: Stage) => Promise<BuyResult>;
  audit: (e: AuditEvent) => Promise<void>;
  /** keccak id of the verification, logged to link Hedera payment ↔ Whitechain relay. */
  verificationHash?: (r: VerifyResponse) => string;
}

export type ProcessOutcome =
  | { outcome: "relayed"; txHash: string; hederaTxId?: string }
  | { outcome: "skipped" | "relay_failed" | BuyResult["status"]; reason: string };

export async function processShipment(e: ShipmentDeclared, d: AgentDeps): Promise<ProcessOutcome> {
  const { claims } = e;
  // Only an all-true shipment triggers the paid check. An admitted false claim
  // cancels the deal on-chain with no penalty, so there's nothing to buy.
  if (!(claims.weight && claims.statusCode && claims.documents)) {
    const reason = "exporter declared a false claim: contract cancels, no 402 triggered";
    await d.audit({ kind: "skipped", dealId: e.dealId, reason });
    return { outcome: "skipped", reason };
  }

  const req: VerifyRequest = {
    dealId: e.dealId,
    tradeDeals: d.chain.tradeDeals,
    claims: checksToClaims(claims),
    shipment: { containerNo: e.containerNo, blRef: e.blRef || undefined },
  };
  const bought = await d.buy(req, "departure");
  if (bought.status !== "verified") return { outcome: bought.status, reason: bought.reason };

  const v = bought.response.verification;
  const o = dealOutcome(claims, { weight: v.weight, statusCode: v.statusCode, documents: v.documents });
  const expectation = o.falsified ? `mismatch (${o.falsifiedFactors.join(", ")} falsified) → dispute + refund` : "match → release";

  const relay = await d.chain.submitVerification(bought.response);
  const verificationHash = d.verificationHash?.(bought.response);
  if (!relay.ok) {
    await d.audit({ kind: "error", dealId: e.dealId, reason: `relay not sent: ${relay.error}`, verificationHash });
    return { outcome: "relay_failed", reason: relay.error };
  }
  await d.audit({
    kind: "relayed",
    dealId: e.dealId,
    reason: `relayed to Whitechain: ${expectation}; paid in Hedera tx ${bought.settlement.txId ?? "?"}`,
    whitechainTx: relay.txHash,
    verificationHash,
  });
  return { outcome: "relayed", txHash: relay.txHash, hederaTxId: bought.settlement.txId };
}
