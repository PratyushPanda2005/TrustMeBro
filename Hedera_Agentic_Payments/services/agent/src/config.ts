import "@tmb/shared/env";
import { HEDERA_NETWORK, HEDERA_USDC_TESTNET } from "@tmb/shared";
import type { Policy } from "./policy.ts";

export { PLACEHOLDER_TRADE_DEALS, tradeDealsOrPlaceholder } from "@tmb/shared";

export const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k} (see .env.example)`);
  return v;
};

/** Spending gate, plan v5 §9: ≤ 1.00/call, ≤ 1.00/deal (3 checks), ≤ 10.00/day, ≤ 5 checks per exporter per day. */
export function loadPolicy(): Policy {
  return {
    network: HEDERA_NETWORK,
    asset: process.env.HEDERA_USDC_TOKEN_ID ?? HEDERA_USDC_TESTNET,
    allowlist: new Set(need("VERIFIER_PAYTO").split(",").map((s) => s.trim())),
    maxPerCall: BigInt(process.env.POLICY_MAX_PER_CALL ?? 1_000_000),
    maxPerDeal: BigInt(process.env.POLICY_MAX_PER_DEAL ?? 1_000_000),
    maxPerDay: BigInt(process.env.POLICY_MAX_PER_DAY ?? 10_000_000),
    maxChecksPerDeal: Number(process.env.POLICY_MAX_CHECKS_PER_DEAL ?? 3),
    maxChecksPerExporterPerDay: Number(process.env.POLICY_MAX_CHECKS_PER_EXPORTER_PER_DAY ?? 5),
  };
}

/** "$1.00" style string for the SDK spend control, from atomic USDC units. */
export const usd = (atomic: bigint) => `$${atomic / 1_000_000n}.${(atomic % 1_000_000n).toString().padStart(6, "0").slice(0, 2)}`;
