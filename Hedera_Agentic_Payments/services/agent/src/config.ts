import "@tmb/shared/env";
import { HEDERA_NETWORK, HEDERA_USDC_TESTNET } from "@tmb/shared";
import type { Policy } from "./policy.ts";

export const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k} (see .env.example)`);
  return v;
};

/** EIP-712 verifyingContract before lane C deploys: any address works off-chain, but it must be one. */
export const PLACEHOLDER_TRADE_DEALS = "0x000000000000000000000000000000000000dEaD";

/** TRADE_DEALS_ADDRESS if it is a real address, else the placeholder (.env.example ships "0x..."). */
export const tradeDealsOrPlaceholder = () => {
  const v = process.env.TRADE_DEALS_ADDRESS;
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? v : PLACEHOLDER_TRADE_DEALS;
};

export function loadPolicy(): Policy {
  return {
    network: HEDERA_NETWORK,
    asset: process.env.HEDERA_USDC_TOKEN_ID ?? HEDERA_USDC_TESTNET,
    allowlist: new Set(need("VERIFIER_PAYTO").split(",").map((s) => s.trim())),
    maxPerCall: BigInt(process.env.POLICY_MAX_PER_CALL ?? 1_000_000),
    maxPerDeal: BigInt(process.env.POLICY_MAX_PER_DEAL ?? 2_000_000),
    maxPerDay: BigInt(process.env.POLICY_MAX_PER_DAY ?? 10_000_000),
  };
}

/** "$1.00" style string for the SDK spend control, from atomic USDC units. */
export const usd = (atomic: bigint) => `$${atomic / 1_000_000n}.${(atomic % 1_000_000n).toString().padStart(6, "0").slice(0, 2)}`;
