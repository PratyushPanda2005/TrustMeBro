/**
 * Deterministic spending gate, plan v5 §9. Runs before the x402 client signs anything.
 * No LLM is involved in any money decision.
 */
import type { SpendLedger } from "./ledger.ts";

export interface Policy {
  network: string; // "hedera:testnet"
  asset: string; // USDC HTS token id
  allowlist: Set<string>; // payTo accounts we trust
  maxPerCall: bigint; // atomic units; above this a human must approve (1.00)
  maxPerDeal: bigint; // 1.00: three 0.30 checks fit
  maxPerDay: bigint; // 10.00
  maxChecksPerDeal: number; // 3: first check + rechecks while Pending
  maxChecksPerExporterPerDay: number; // 5: spam guard
}

export interface Quote {
  dealId: string;
  /** Which paid check of this deal this is: 1, then 2–3 for rechecks. */
  checkNo: number;
  exporter: string;
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
  if (ledger.alreadyPaid(q.dealId, q.checkNo)) return { decision: "deny", reason: `already paid for check ${q.checkNo} of this deal` };
  if (ledger.checksPaid(q.dealId) >= p.maxChecksPerDeal) return { decision: "deny", reason: `max ${p.maxChecksPerDeal} checks per deal reached` };

  if (q.amount > p.maxPerCall) {
    const approval = ledger.approvalFor(q.dealId, q.checkNo, q.payTo, q.amount);
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
  if (ledger.exporterChecksOnDay(q.exporter, nowMs) >= p.maxChecksPerExporterPerDay) {
    return { decision: "deny", reason: `max ${p.maxChecksPerExporterPerDay} checks per exporter per day reached` };
  }
  return { decision: "allow", reason: `ok: check ${q.checkNo}, ${fmt(q.amount)} USDC to ${q.payTo}` };
}
