import { bytesToBigInt, keccak256, type Address, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

import { verificationDomain, verificationTypes, type VerificationMessage } from "@trustmebro/shared"

export type VerificationSigner = {
  address: Address
  sign(message: VerificationMessage, tradeDeals: Address, chainId: number): Promise<Hex>
}

export function createVerificationSigner(privateKey: Hex): VerificationSigner {
  const account = privateKeyToAccount(privateKey)
  return {
    address: account.address,
    sign(message, tradeDeals, chainId) {
      return account.signTypedData({
        domain: verificationDomain(tradeDeals, chainId),
        types: verificationTypes,
        primaryType: "Verification",
        message,
      })
    },
  }
}

/** 256 random bits. The contract keeps one global set of used nonces, so they must never repeat. */
export function randomNonce(): bigint {
  return bytesToBigInt(crypto.getRandomValues(new Uint8Array(32)))
}

export function sigHash(signature: Hex): Hex {
  return keccak256(signature)
}

/** JSON-safe form: bigints become decimal strings. The agent turns them back with BigInt(). */
export function toWire(m: VerificationMessage) {
  return {
    dealId: m.dealId,
    observedKg: m.observedKg,
    statusCode: m.statusCode,
    docHash: m.docHash,
    observedAt: m.observedAt.toString(),
    nonce: m.nonce.toString(),
    expiry: m.expiry.toString(),
  }
}
