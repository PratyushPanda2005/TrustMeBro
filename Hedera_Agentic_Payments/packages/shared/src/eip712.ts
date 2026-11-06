/**
 * EIP-712 contract between the verifier (signs), the agent (pre-checks) and TradeDeals on
 * Whitechain (verifies). Plan v5 §8; must equal lane C's TradeDeals.VERIFICATION_TYPEHASH
 * exactly (test/sign.test.ts reproduces lane C's own signed fixture byte for byte).
 *
 *   Domain: { name: "TrustMeBro", version: "1", chainId: 1874, verifyingContract: TradeDeals }
 *   Verification(bytes32 dealId,uint32 observedKg,uint8 statusCode,bytes32 docHash,uint64 observedAt,uint256 nonce,uint256 expiry)
 *
 * chainId is Whitechain's 1874, never Hedera's 296. dealId is the contract's uint256 id as bytes32.
 */
import { WHITECHAIN_CHAIN_ID } from "./constants.ts";

export { WHITECHAIN_CHAIN_ID };

export const DOMAIN_NAME = "TrustMeBro";
export const DOMAIN_VERSION = "1";

export const VERIFICATION_TYPES = {
  Verification: [
    { name: "dealId", type: "bytes32" },
    { name: "observedKg", type: "uint32" },
    { name: "statusCode", type: "uint8" },
    { name: "docHash", type: "bytes32" },
    { name: "observedAt", type: "uint64" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
} as const;

export const VERIFICATION_TYPE_STRING =
  "Verification(bytes32 dealId,uint32 observedKg,uint8 statusCode,bytes32 docHash,uint64 observedAt,uint256 nonce,uint256 expiry)";

/** Builds the EIP-712 encodeType string from VERIFICATION_TYPES (guards against drift). */
export function encodeType(): string {
  const fields = VERIFICATION_TYPES.Verification.map((f) => `${f.type} ${f.name}`).join(",");
  return `Verification(${fields})`;
}

export type Hex = `0x${string}`;

/** What the verifier observed, signed for TradeDeals.submitVerification(v, sig). */
export interface Verification {
  dealId: Hex;
  observedKg: number; // terminal weighbridge, kg (uint32)
  statusCode: number; // carrier status 0..5 (uint8)
  docHash: Hex; // hash of the carrier-issued eBL bundle
  observedAt: bigint; // unix seconds; contract requires > claimTime
  nonce: bigint;
  expiry: bigint;
}

export function verificationDomain(tradeDeals: Hex) {
  return {
    name: DOMAIN_NAME,
    version: DOMAIN_VERSION,
    chainId: WHITECHAIN_CHAIN_ID,
    verifyingContract: tradeDeals,
  } as const;
}

const UINT256_LIMIT = 2n ** 256n;

/** The contract's uint256 deal id as the bytes32 the Verification carries. */
export function dealIdToBytes32(dealId: bigint | number): Hex {
  const id = BigInt(dealId);
  if (id < 0n || id >= UINT256_LIMIT) throw new RangeError(`dealId out of range: ${dealId}`);
  return `0x${id.toString(16).padStart(64, "0")}`;
}

export function bytes32ToDealId(value: Hex): bigint {
  return BigInt(value);
}
