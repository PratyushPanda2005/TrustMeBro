/**
 * EIP-712 signing / recovery with viem. Used by the verifier (sign) and the
 * agent (pre-check before relaying to Whitechain).
 */
import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress, hashTypedData, keccak256, type Hex } from "viem";
import { VERIFICATION_TYPES, verificationDomain, type Verification } from "./eip712.ts";
import { WHITECHAIN_CHAIN_ID } from "./constants.ts";
import type { VerifyResponse, VerificationJson } from "./schemas.ts";

export function toJson(v: Verification): VerificationJson {
  return { ...v, observedAt: v.observedAt.toString(), nonce: v.nonce.toString(), expiry: v.expiry.toString() };
}

export function fromJson(v: VerificationJson): Verification {
  return {
    dealId: v.dealId as Hex,
    observedKg: v.observedKg,
    statusCode: v.statusCode,
    docHash: v.docHash as Hex,
    observedAt: BigInt(v.observedAt),
    nonce: BigInt(v.nonce),
    expiry: BigInt(v.expiry),
  };
}

const typed = (tradeDeals: Hex, v: Verification) =>
  ({ domain: verificationDomain(tradeDeals), types: VERIFICATION_TYPES, primaryType: "Verification", message: v }) as const;

/** The EIP-712 digest TradeDeals.hashVerification returns for this message. */
export function verificationDigest(tradeDeals: Hex, v: Verification): Hex {
  return hashTypedData(typed(tradeDeals, v));
}

export async function signVerification(privateKey: Hex, tradeDeals: Hex, v: Verification): Promise<VerifyResponse> {
  const account = privateKeyToAccount(privateKey);
  const signature = await account.signTypedData(typed(tradeDeals, v));
  return {
    verification: toJson(v),
    signature,
    signer: account.address,
    chainId: WHITECHAIN_CHAIN_ID,
    verifyingContract: tradeDeals,
  };
}

export async function recoverVerificationSigner(r: VerifyResponse): Promise<Hex> {
  return recoverTypedDataAddress({ ...typed(r.verifyingContract as Hex, fromJson(r.verification)), signature: r.signature as Hex });
}

/**
 * sigHash for the HCS audit record (plan v5 §8, Option A): keccak256(signature). The contract
 * emits the same value in VerificationSubmitted, which links the Hedera payment to the relay.
 */
export function sigHash(signature: Hex): Hex {
  return keccak256(signature);
}
