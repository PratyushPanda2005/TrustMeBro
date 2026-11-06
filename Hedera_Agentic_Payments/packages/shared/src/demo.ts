/**
 * Demo shipment shared by the exporter side (e2e, mock chain, dashboard seed) and the verifier's
 * simulated data source, so "hash A" means the same bytes on both sides. Plan v5 §4 examples:
 * Ravi declares 10,000 kg, LOADED, docHash A for container MSKU1234567.
 */
import { keccak256, stringToHex, type Hex } from "viem";
import { STATUS } from "./trust.ts";

/** keccak256 of the (simulated) eBL bundle: invoice + packing list + bill of lading for a container. */
export function demoDocHash(containerNo: string): Hex {
  return keccak256(stringToHex(`TrustMeBro demo eBL bundle: invoice + packing list + bill of lading for ${containerNo}`));
}

/** A different bundle for the same container: what a forged document set hashes to. */
export function forgedDocHash(containerNo: string): Hex {
  return keccak256(stringToHex(`TrustMeBro FORGED bundle for ${containerNo}`));
}

export const DEMO_SHIPMENT = {
  containerNo: "MSKU1234567",
  blRef: "BL-DEMO-001",
  declaredKg: 10_000,
  claimedStatus: STATUS.LOADED,
} as const;

export const PLACEHOLDER_TRADE_DEALS = "0x000000000000000000000000000000000000dEaD";

/** TRADE_DEALS_ADDRESS if it is a real address, else a placeholder (.env.example ships "0x..."). */
export function tradeDealsOrPlaceholder(value: string | undefined = process.env.TRADE_DEALS_ADDRESS): `0x${string}` {
  return (value && /^0x[0-9a-fA-F]{40}$/.test(value) ? value : PLACEHOLDER_TRADE_DEALS) as `0x${string}`;
}
