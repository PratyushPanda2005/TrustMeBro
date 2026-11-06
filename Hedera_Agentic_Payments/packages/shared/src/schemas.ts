/** Wire schemas shared by verifier, agent and dashboard. Frozen at gate G0. */
import { z } from "zod";
import type { Checks } from "./trust.ts";
import { WHITECHAIN_CHAIN_ID } from "./constants.ts";

export const Hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected 32-byte hex");
export const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected 20-byte address");
export const HexSig = z.string().regex(/^0x[0-9a-fA-F]{130}$/, "expected 65-byte signature");
export const UintString = z.string().regex(/^\d+$/, "uint256 as decimal string");
export const HederaAccount = z.string().regex(/^0\.0\.\d+$/, "expected 0.0.x account");

/** Exporter claims, using the names the business side uses. */
export const Claims = z.object({
  weight: z.boolean(),
  status_code: z.boolean(),
  document_verification: z.boolean(),
}).strict();
export type Claims = z.infer<typeof Claims>;

/** The only place JSON claim names are mapped to EIP-712 / Solidity names. */
export function claimsToChecks(c: Claims): Checks {
  return { weight: c.weight, statusCode: c.status_code, documents: c.document_verification };
}
export function checksToClaims(c: Checks): Claims {
  return { weight: c.weight, status_code: c.statusCode, document_verification: c.documents };
}

export const Shipment = z.object({
  containerNo: z.string().min(1).max(32),
  blRef: z.string().max(64).optional(),
  docHash: Hex32.optional(),
});

/** Body of POST /verify (x402-protected). */
export const VerifyRequest = z.object({
  dealId: Hex32,
  tradeDeals: Address, // EIP-712 verifyingContract
  claims: Claims,
  shipment: Shipment,
});
export type VerifyRequest = z.infer<typeof VerifyRequest>;

export const VerificationJson = z.object({
  dealId: Hex32,
  weight: z.boolean(),
  statusCode: z.boolean(),
  documents: z.boolean(),
  nonce: UintString,
  expiry: UintString,
});
export type VerificationJson = z.infer<typeof VerificationJson>;

/** 200 body of POST /verify. */
export const VerifyResponse = z.object({
  verification: VerificationJson,
  signature: HexSig,
  signer: Address,
  chainId: z.literal(WHITECHAIN_CHAIN_ID),
  verifyingContract: Address,
});
export type VerifyResponse = z.infer<typeof VerifyResponse>;

/** One entry in the HCS audit topic. `hash` = sha256 of the canonical message without `hash`. */
export const HcsMessage = z.object({
  v: z.literal(1),
  seq: z.number().int().nonnegative(),
  prevHash: z.string().regex(/^[0-9a-f]{64}$/),
  ts: z.string(),
  kind: z.enum(["quote", "paid", "refused", "pending_human", "approved", "relayed", "skipped", "error"]),
  dealId: Hex32.optional(),
  reason: z.string().max(200),
  payment: z.object({
    payTo: z.string(),
    amount: UintString,
    asset: z.string(),
    hederaTxId: z.string().optional(),
  }).optional(),
  whitechainTx: Hex32.optional(),
  verificationHash: Hex32.optional(),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
});
export type HcsMessage = z.infer<typeof HcsMessage>;

/** What the agent log page renders (HcsMessage + mirror-node metadata). */
export const AgentLogEntry = HcsMessage.extend({
  topicSequence: z.number().int(),
  consensusTimestamp: z.string(),
});
export type AgentLogEntry = z.infer<typeof AgentLogEntry>;

/** Pending human approvals exposed by the agent API. */
export const Approval = z.object({
  id: z.string(),
  dealId: Hex32,
  payTo: z.string(),
  amount: UintString,
  reason: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  createdAt: z.string(),
});
export type Approval = z.infer<typeof Approval>;

/** deployments/hedera-testnet.json: public Hedera side of the demo (G0 handoff to lane A). No keys. */
export const HederaDeployment = z.object({
  network: z.string(),
  mirrorNode: z.string().url(),
  hashscan: z.string().url(),
  facilitator: z.object({ url: z.string().url(), feePayer: HederaAccount }),
  usdc: z.object({ tokenId: HederaAccount, decimals: z.literal(6) }),
  accounts: z.object({ agent: HederaAccount, verifierPayTo: HederaAccount, auditOperator: HederaAccount }),
  verifier: z.object({ url: z.string().url(), price: z.string(), signer: Address }),
  auditTopicId: HederaAccount,
});
export type HederaDeployment = z.infer<typeof HederaDeployment>;
