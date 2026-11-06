/** Pure helpers for x402 v2 headers (no SDK imports, unit-testable). */
import { hashscanTx } from "@tmb/shared";

export interface HederaQuote {
  network: string;
  amount: bigint;
  asset: string;
  payTo: string;
  feePayer?: string;
  hasBazaar: boolean;
  raw: unknown;
}

const decode = (b64: string) => JSON.parse(Buffer.from(b64, "base64").toString("utf8"));

/** Parses the PAYMENT-REQUIRED header of a 402 and picks the option for `network`. */
export function parsePaymentRequired(headerB64: string, network: string): HederaQuote | null {
  const body = decode(headerB64);
  const opt = (body.accepts ?? []).find((a: any) => a.network === network);
  if (!opt) return null;
  const amount = opt.amount ?? opt.maxAmountRequired; // v2 | v1
  return {
    network,
    amount: BigInt(amount),
    asset: String(opt.asset),
    payTo: String(opt.payTo),
    feePayer: opt.extra?.feePayer,
    hasBazaar: Boolean(body.extensions?.bazaar),
    raw: body,
  };
}

/** The exact payment the spending gate approved. The x402 client may sign this and nothing else. */
export interface PinnedPayment {
  network: string;
  asset: string;
  payTo: string;
  amount: bigint;
}

/**
 * Compares what the x402 client is about to sign with what the gate approved.
 * The probe and the paid retry are two separate 402s, so a merchant can change the
 * price or payTo in between (bait and switch). Returns the reason to abort, or null.
 */
export function pinMismatch(
  r: { network: string; asset: string; payTo: string; amount: string },
  p: PinnedPayment,
): string | null {
  if (r.network !== p.network) return `network changed after approval: ${r.network} ≠ ${p.network}`;
  if (r.asset !== p.asset) return `asset changed after approval: ${r.asset} ≠ ${p.asset}`;
  if (r.payTo !== p.payTo) return `payTo changed after approval: ${r.payTo} ≠ ${p.payTo}`;
  let amount: bigint;
  try {
    amount = BigInt(r.amount);
  } catch {
    return `unreadable amount ${r.amount}`;
  }
  if (amount !== p.amount) return `amount changed after approval: ${amount} ≠ ${p.amount}`;
  return null;
}

export interface Settlement {
  success: boolean;
  txId?: string;
  hashscan?: string;
  payer?: string;
  error?: string;
}

/** Parses PAYMENT-RESPONSE. The tx id field is `transaction` in the reference code, `transactionId` in the spec example. */
export function parseSettlement(headerB64: string): Settlement {
  const s = decode(headerB64);
  const txId = s.transaction ?? s.transactionId;
  return {
    success: Boolean(s.success),
    txId,
    hashscan: txId ? hashscanTx(txId) : undefined,
    payer: s.payer,
    error: s.errorReason ?? s.error,
  };
}
