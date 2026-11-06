/**
 * EIP-712 contract between the verifier (signs), the agent (pre-checks) and
 * TradeDeals on Whitechain (verifies). Frozen at gate G0. Changing anything here
 * requires the matching change in contracts/ (lane C).
 *
 * Solidity side:
 *   bytes32 constant VERIFICATION_TYPEHASH = keccak256(
 *     "Verification(bytes32 dealId,bool weight,bool statusCode,bool documents,uint256 nonce,uint256 expiry)");
 *   EIP712("TrustMeBro", "1")  // chainId + verifyingContract come from the deployed contract
 *   structHash = keccak256(abi.encode(VERIFICATION_TYPEHASH, dealId, weight, statusCode, documents, nonce, expiry));
 */
import { WHITECHAIN_CHAIN_ID } from "./constants.ts";

export { WHITECHAIN_CHAIN_ID };

export const DOMAIN_NAME = "TrustMeBro";
export const DOMAIN_VERSION = "1";

export const VERIFICATION_TYPES = {
  Verification: [
    { name: "dealId", type: "bytes32" },
    { name: "weight", type: "bool" },
    { name: "statusCode", type: "bool" },
    { name: "documents", type: "bool" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
} as const;

export const VERIFICATION_TYPE_STRING =
  "Verification(bytes32 dealId,bool weight,bool statusCode,bool documents,uint256 nonce,uint256 expiry)";

/** Builds the EIP-712 encodeType string from VERIFICATION_TYPES (guards against drift). */
export function encodeType(): string {
  const fields = VERIFICATION_TYPES.Verification.map((f) => `${f.type} ${f.name}`).join(",");
  return `Verification(${fields})`;
}

export type Hex = `0x${string}`;

export interface Verification {
  dealId: Hex;
  weight: boolean;
  statusCode: boolean;
  documents: boolean;
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
