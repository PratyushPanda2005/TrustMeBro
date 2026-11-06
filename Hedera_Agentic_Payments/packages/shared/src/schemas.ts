/** Wire schemas shared by verifier, agent and dashboard. Plan v5 (docs/plans/TMB-00-master-plan.md §8, §9). */
import { z } from "zod";
import { LOCAL_ANVIL_CHAIN_ID, WHITECHAIN_CHAIN_ID } from "./constants.ts";

export const Hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected 32-byte hex");
export const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected 20-byte address");
export const HexSig = z.string().regex(/^0x[0-9a-fA-F]{130}$/, "expected 65-byte signature");
export const UintString = z.string().regex(/^\d+$/, "uint256 as decimal string");
export const HederaAccount = z.string().regex(/^0\.0\.\d+$/, "expected 0.0.x account");

/** Carrier references from the deal's Claimed event (same limits as TradeDeals.declareClaims). */
export const ShipmentRef = z.object({
  containerNo: z.string().min(1).max(32),
  blRef: z.string().max(64).optional(),
}).strict();
export type ShipmentRef = z.infer<typeof ShipmentRef>;

/**
 * Body of POST /verify (x402-protected), plan v5 §8. Claims are already on chain, so the agent
 * never sends them and can't launder a lie. The verifier signs for its configured TradeDeals.
 */
export const VerifyRequest = z.object({
  dealId: Hex32,
  shipmentRef: ShipmentRef,
}).strict();
export type VerifyRequest = z.infer<typeof VerifyRequest>;

/** The signed Verification as JSON (uint64/uint256 as decimal strings). */
export const VerificationJson = z.object({
  dealId: Hex32,
  observedKg: z.number().int().min(0).max(0xffffffff),
  statusCode: z.number().int().min(0).max(5),
  docHash: Hex32,
  observedAt: UintString,
  nonce: UintString,
  expiry: UintString,
});
export type VerificationJson = z.infer<typeof VerificationJson>;

/** The EIP-712 domain the verification is signed under: Whitechain 1874, or lane C's local anvil. */
export const VerificationDomainJson = z.object({
  name: z.literal("TrustMeBro"),
  version: z.literal("1"),
  chainId: z.union([z.literal(WHITECHAIN_CHAIN_ID), z.literal(LOCAL_ANVIL_CHAIN_ID)]),
  verifyingContract: Address,
});

/**
 * 200 body of POST /verify, lane C's format (services/verifier/src/server.ts at the repo root).
 * `expected` is the verifier's own forecast of the contract's verdict: informational only, the
 * agent never acts on it; the contract decides. Evidence stays off HCS (plan v5, Option A).
 */
export const VerifyResponse = z.object({
  verification: VerificationJson,
  signature: HexSig,
  signer: Address,
  sigHash: Hex32,
  domain: VerificationDomainJson,
  dealId: z.string().optional(),
  check: z.number().int().positive().optional(),
  expected: z.object({ outcome: z.string(), falsifiedMask: z.number().int() }).optional(),
});
export type VerifyResponse = z.infer<typeof VerifyResponse>;

/** One entry in the HCS audit topic. `hash` = sha256 of the canonical message without `hash`. */
export const HcsMessage = z.object({
  v: z.literal(1),
  seq: z.number().int().nonnegative(),
  prevHash: z.string().regex(/^[0-9a-f]{64}$/),
  ts: z.string(),
  kind: z.enum(["quote", "paid", "refused", "pending_human", "approved", "relayed", "recheck", "skipped", "error"]),
  dealId: Hex32.optional(),
  reason: z.string().max(200),
  payment: z.object({
    payTo: z.string(),
    amount: UintString,
    asset: z.string(),
    hederaTxId: z.string().optional(),
    payer: z.string().optional(), // the agent account in PAYMENT-RESPONSE (the tx id names the facilitator)
  }).optional(),
  whitechainTx: Hex32.optional(),
  /** keccak256(signature): links the Hedera payment to VerificationSubmitted on Whitechain (plan v5 §8, Option A). */
  sigHash: Hex32.optional(),
  /** What the contract decided on relay and the exporter's score in bps before and after (plan v5 §4, §5.2). */
  trust: z.object({
    exporter: Address,
    outcome: z.enum(["verified", "pending", "rejected", "mismatch"]),
    beforeBps: z.number().int().min(0).max(10_000),
    afterBps: z.number().int().min(0).max(10_000),
  }).optional(),
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
