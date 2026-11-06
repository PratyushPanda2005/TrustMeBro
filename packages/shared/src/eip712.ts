// The only definition of the verifier's EIP-712 message. Must match TradeDeals.VERIFICATION_TYPEHASH
// exactly, or signatures fail with InvalidSigner. chainId is Whitechain's 1874, not Hedera's 296.

import { WHITECHAIN_TESTNET_ID } from "./chain"

export type Hex = `0x${string}`
export type Address = `0x${string}`

export const EIP712_NAME = "TrustMeBro"
export const EIP712_VERSION = "1"

export const VERIFICATION_TYPE =
  "Verification(bytes32 dealId,uint32 observedKg,uint8 statusCode,bytes32 docHash,uint64 observedAt,uint256 nonce,uint256 expiry)"

export const verificationTypes = {
  Verification: [
    { name: "dealId", type: "bytes32" },
    { name: "observedKg", type: "uint32" },
    { name: "statusCode", type: "uint8" },
    { name: "docHash", type: "bytes32" },
    { name: "observedAt", type: "uint64" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
} as const

export function verificationDomain(verifyingContract: Address, chainId: number = WHITECHAIN_TESTNET_ID) {
  return { name: EIP712_NAME, version: EIP712_VERSION, chainId, verifyingContract } as const
}

/** Also the tuple submitVerification(v, sig) takes. */
export type VerificationMessage = {
  dealId: Hex // use dealIdToBytes32
  observedKg: number
  statusCode: number
  docHash: Hex
  observedAt: bigint // must be > the deal's claimTime
  nonce: bigint
  expiry: bigint
}

// No 1n-style literals here: the Next.js app compiles this with target ES2017.
const UINT256_LIMIT = BigInt(2) ** BigInt(256)

export function dealIdToBytes32(dealId: bigint | number): Hex {
  const id = BigInt(dealId)
  if (id < BigInt(0) || id >= UINT256_LIMIT) throw new RangeError(`dealId out of range: ${dealId}`)
  return `0x${id.toString(16).padStart(64, "0")}`
}

export function bytes32ToDealId(value: Hex): bigint {
  return BigInt(value)
}
