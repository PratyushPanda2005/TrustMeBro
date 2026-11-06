/**
 * EIP-712 signing / recovery with viem. Used by the verifier (sign) and the
 * agent (pre-check before relaying to Whitechain).
 */
import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress, keccak256, encodeAbiParameters, type Hex } from "viem";
import { VERIFICATION_TYPES, verificationDomain, type Verification } from "./eip712.ts";
import { WHITECHAIN_CHAIN_ID } from "./constants.ts";
import type { VerifyResponse, VerificationJson } from "./schemas.ts";

export function toJson(v: Verification): VerificationJson {
  return { ...v, nonce: v.nonce.toString(), expiry: v.expiry.toString() };
}

export function fromJson(v: VerificationJson): Verification {
  return { ...v, dealId: v.dealId as Hex, nonce: BigInt(v.nonce), expiry: BigInt(v.expiry) };
}

export async function signVerification(privateKey: Hex, tradeDeals: Hex, v: Verification): Promise<VerifyResponse> {
  const account = privateKeyToAccount(privateKey);
  const signature = await account.signTypedData({
    domain: verificationDomain(tradeDeals),
    types: VERIFICATION_TYPES,
    primaryType: "Verification",
    message: v,
  });
  return {
    verification: toJson(v),
    signature,
    signer: account.address,
    chainId: WHITECHAIN_CHAIN_ID,
    verifyingContract: tradeDeals,
  };
}

export async function recoverVerificationSigner(r: VerifyResponse): Promise<Hex> {
  return recoverTypedDataAddress({
    domain: verificationDomain(r.verifyingContract as Hex),
    types: VERIFICATION_TYPES,
    primaryType: "Verification",
    message: fromJson(r.verification),
    signature: r.signature as Hex,
  });
}

/** Stable id for a verification (logged to HCS to link Hedera payment ↔ Whitechain relay). */
export function verificationHash(v: Verification): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bool" }, { type: "bool" }, { type: "bool" }, { type: "uint256" }, { type: "uint256" }],
      [v.dealId, v.weight, v.statusCode, v.documents, v.nonce, v.expiry],
    ),
  );
}
