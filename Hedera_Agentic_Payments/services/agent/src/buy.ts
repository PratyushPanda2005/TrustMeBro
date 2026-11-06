/**
 * Buy one shipment check over x402 with guardrails (plan v5 §8–9):
 *   1. unpaid probe → read the 402 quote (discovery: price, asset, payTo, Bazaar schema)
 *   2. deterministic spending gate (policy.ts); pending/deny → stop, nothing signed
 *   3. paid request (x402 client re-sends the same POST body with PAYMENT-SIGNATURE)
 *   4. validate the response (lane C's format): schema, deal, chain, contract, sigHash, EIP-712 signer
 * Every step is written to the audit log (HCS).
 */
import { VerifyResponse, type VerifyRequest, HEDERA_USDC_TESTNET } from "@tmb/shared";
import { sigHash } from "@tmb/shared/sign";
import { evaluate, type Policy } from "./policy.ts";
import type { SpendLedger } from "./ledger.ts";
import { parsePaymentRequired, parseSettlement, type PinnedPayment, type Settlement } from "./x402.ts";

export interface AuditEvent {
  kind: "quote" | "paid" | "refused" | "pending_human" | "approved" | "relayed" | "recheck" | "skipped" | "error";
  dealId?: string;
  reason: string;
  payment?: { payTo: string; amount: string; asset: string; hederaTxId?: string; payer?: string };
  whitechainTx?: string;
  /** keccak256(signature): links this Hedera payment to VerificationSubmitted on Whitechain (plan v5 §8, Option A). */
  sigHash?: string;
  /** What the contract decided on relay and the exporter's score before/after (plan v5 §4, §5.2). */
  trust?: { exporter: string; outcome: "verified" | "pending" | "rejected" | "mismatch"; beforeBps: number; afterBps: number };
}

export interface BuyDeps {
  url: string;
  /** Our TradeDeals: the response must be signed for it (EIP-712 verifyingContract). */
  tradeDeals: string;
  /** The chain that TradeDeals lives on (EIP-712 domain chainId): 1874, or 31337 on lane C's local anvil. */
  chainId: number;
  policy: Policy;
  ledger: SpendLedger;
  now: () => number;
  expectedSigner: string;
  fetch: typeof fetch; // plain fetch (probe)
  /** x402-wrapped fetch that must sign exactly `pinned` (see payer.ts). */
  payFetch: (url: string, init: RequestInit, pinned: PinnedPayment) => Promise<Response>;
  recoverSigner: (r: VerifyResponse) => Promise<string>;
  audit: (e: AuditEvent) => Promise<void>;
}

export type BuyResult =
  | { status: "verified"; response: VerifyResponse; settlement: Settlement; payment: { payTo: string; amount: string; asset: string } }
  | { status: "refused" | "pending_human" | "no_verdict" | "untrusted"; reason: string; settlement?: Settlement; approvalId?: string };

/** Which paid check of the deal this is (1, then 2–3 while Pending) and whose deal it is (per-exporter cap). */
export interface CheckContext {
  checkNo: number;
  exporter: string;
}

export async function buyVerification(req: VerifyRequest, ctx: CheckContext, d: BuyDeps): Promise<BuyResult> {
  const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) };

  // 1. Probe for the price (unpaid; a 402 is free).
  const probe = await d.fetch(d.url, init);
  const header = probe.headers.get("PAYMENT-REQUIRED");
  if (probe.status !== 402 || !header) {
    await d.audit({ kind: "error", dealId: req.dealId, reason: `expected 402 quote, got ${probe.status}` });
    return { status: "no_verdict", reason: `no x402 quote (${probe.status})` };
  }
  const quote = parsePaymentRequired(header, d.policy.network);
  if (!quote) {
    await d.audit({ kind: "refused", dealId: req.dealId, reason: `no ${d.policy.network} payment option` });
    return { status: "refused", reason: "no Hedera payment option" };
  }
  const payment = { payTo: quote.payTo, amount: quote.amount.toString(), asset: quote.asset };
  await d.audit({ kind: "quote", dealId: req.dealId, reason: `quoted ${payment.amount} of ${quote.asset}${quote.hasBazaar ? " (bazaar)" : ""}`, payment });

  // 2. Spending gate.
  const decision = evaluate({ dealId: req.dealId, checkNo: ctx.checkNo, exporter: ctx.exporter, network: quote.network, asset: quote.asset, payTo: quote.payTo, amount: quote.amount }, d.policy, d.ledger, d.now());
  if (decision.decision === "pending_human") {
    const approvalId = d.ledger.requestApproval({ dealId: req.dealId, checkNo: ctx.checkNo, payTo: quote.payTo, amount: quote.amount, reason: decision.reason, at: d.now() });
    await d.audit({ kind: "pending_human", dealId: req.dealId, reason: decision.reason, payment });
    return { status: "pending_human", reason: decision.reason, approvalId };
  }
  if (decision.decision === "deny") {
    await d.audit({ kind: "refused", dealId: req.dealId, reason: decision.reason, payment });
    return { status: "refused", reason: decision.reason };
  }

  // 3. Paid request. Status >= 400 means x402 did not settle: not charged, no verdict.
  // The paid retry gets a fresh 402: pin the approved quote so a changed price/payTo is not signed.
  const pinned: PinnedPayment = { network: quote.network, asset: quote.asset, payTo: quote.payTo, amount: quote.amount };
  let paid: Response;
  try {
    paid = await d.payFetch(d.url, init, pinned);
  } catch (err) {
    const msg = (err as Error).message;
    // @x402/fetch throws this before any PAYMENT-SIGNATURE exists: nothing was signed or sent.
    if (msg.startsWith("Failed to create payment payload")) {
      const reason = `payment not signed: ${msg}`;
      await d.audit({ kind: "refused", dealId: req.dealId, reason, payment });
      return { status: "refused", reason };
    }
    // Transport failure: we can't tell whether a signed payment reached the facilitator.
    const reason = `paid request failed, settlement unknown (check HashScan before retrying): ${msg}`;
    await d.audit({ kind: "error", dealId: req.dealId, reason, payment });
    return { status: "no_verdict", reason };
  }
  if (paid.status !== 200) {
    await d.audit({ kind: "error", dealId: req.dealId, reason: `verifier returned ${paid.status}; not settled, no verdict`, payment });
    return { status: "no_verdict", reason: `verifier ${paid.status}` };
  }
  const settleHeader = paid.headers.get("PAYMENT-RESPONSE");
  const settlement: Settlement = settleHeader ? parseSettlement(settleHeader) : { success: false, error: "missing PAYMENT-RESPONSE" };
  d.ledger.recordPayment({ dealId: req.dealId, checkNo: ctx.checkNo, exporter: ctx.exporter, payTo: quote.payTo, amount: quote.amount, at: d.now(), hederaTxId: settlement.txId });
  await d.audit({ kind: "paid", dealId: req.dealId, reason: settlement.success ? "settled on Hedera" : `settlement unclear: ${settlement.error}`, payment: { ...payment, hederaTxId: settlement.txId, payer: settlement.payer } });

  // 4. Trust nothing: schema, binding to this deal / chain / contract, sigHash, signer.
  // The verifier's `expected` verdict is ignored: the contract decides.
  const parsed = VerifyResponse.safeParse(await paid.json());
  if (!parsed.success) {
    await d.audit({ kind: "error", dealId: req.dealId, reason: "malformed verifier response" });
    return { status: "untrusted", reason: "malformed response", settlement };
  }
  const r = parsed.data;
  const unbound =
    r.verification.dealId.toLowerCase() !== req.dealId.toLowerCase() ? "response bound to another deal"
    : r.domain.verifyingContract.toLowerCase() !== d.tradeDeals.toLowerCase() ? "response signed for another TradeDeals"
    : r.domain.chainId !== d.chainId ? `response signed for chain ${r.domain.chainId}, expected ${d.chainId}`
    : r.sigHash.toLowerCase() !== sigHash(r.signature as `0x${string}`).toLowerCase() ? "sigHash is not keccak256(signature)"
    : undefined;
  const signer = unbound ? "" : (await d.recoverSigner(r)).toLowerCase();
  if (unbound || signer !== d.expectedSigner.toLowerCase()) {
    const reason = unbound ?? `signed by ${signer}, expected verifier ${d.expectedSigner}`;
    await d.audit({ kind: "error", dealId: req.dealId, reason });
    return { status: "untrusted", reason, settlement };
  }
  return { status: "verified", response: r, settlement, payment };
}

export const DEFAULT_ASSET = HEDERA_USDC_TESTNET;
