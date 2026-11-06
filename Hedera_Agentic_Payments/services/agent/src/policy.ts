/**
 * Deterministic spending gate. Runs before the x402 client signs anything.
 * No LLM is involved in any money decision.
 */
import type { SpendLedger, Stage } from "./ledger.ts";

export interface Policy {
  network: string; // "hedera:testnet"
  asset: string; // USDC HTS token id
  allowlist: Set<string>; // payTo accounts we trust
  maxPerCall: bigint; // atomic units; above this a human must approve
  maxPerDeal: bigint;
  maxPerDay: bigint;
}

export interface Quote {
  dealId: string;
  stage: Stage;
  network: string;
  asset: string;
  payTo: string;
  amount: bigint;
}

export type Decision = { decision: "allow" | "deny" | "pending_human"; reason: string };

const fmt = (x: bigint) => `${x / 1_000_000n}.${(x % 1_000_000n).toString().padStart(6, "0").slice(0, 2)}`;

export function evaluate(q: Quote, p: Policy, ledger: SpendLedger, nowMs: number): Decision {
  if (q.network !== p.network) return { decision: "deny", reason: `wrong network ${q.network}` };
  if (q.asset !== p.asset) return { decision: "deny", reason: `wrong asset ${q.asset}` };
  if (!p.allowlist.has(q.payTo)) return { decision: "deny", reason: `merchant ${q.payTo} not on allowlist` };
  if (ledger.alreadyPaid(q.dealId, q.stage)) return { decision: "deny", reason: `already paid for ${q.stage} of this deal` };

  if (q.amount > p.maxPerCall) {
    const approval = ledger.approvalFor(q.dealId, q.stage, q.payTo, q.amount);
    if (approval === "rejected") return { decision: "deny", reason: `human rejected ${fmt(q.amount)} USDC` };
    if (approval !== "approved") {
      return { decision: "pending_human", reason: `price ${fmt(q.amount)} USDC above per-call cap ${fmt(p.maxPerCall)}` };
    }
  }
  if (ledger.spentOnDeal(q.dealId) + q.amount > p.maxPerDeal) {
    return { decision: "deny", reason: `per-deal budget ${fmt(p.maxPerDeal)} USDC exceeded` };
  }
  if (ledger.spentOnDay(nowMs) + q.amount > p.maxPerDay) {
    return { decision: "deny", reason: `daily budget ${fmt(p.maxPerDay)} USDC exceeded` };
  }
  return { decision: "allow", reason: `ok: ${fmt(q.amount)} USDC to ${q.payTo}` };
}
