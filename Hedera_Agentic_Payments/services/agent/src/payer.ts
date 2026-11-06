/**
 * x402 v2 client for Hedera testnet (@x402/* 2.30.0).
 * Import Hedera SDK primitives ONLY from @x402/hedera (a second SDK copy crashes
 * with "t.startsWith is not a function").
 */
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";
import { pinMismatch, type PinnedPayment } from "./x402.ts";

/** Paid fetch that signs only the pinned payment (the one the spending gate approved). */
export type PayFetch = (url: string, init: RequestInit, pinned: PinnedPayment) => Promise<Response>;

export function makePayFetch(opts: { accountId: string; privateKey: string }): PayFetch {
  const signer = createClientHederaSigner(opts.accountId, PrivateKey.fromStringECDSA(opts.privateKey), { network: "hedera:testnet" });
  // A fresh client per call keeps the pin per request, so concurrent deals can't share one.
  return (url, init, pinned) => {
    const client = new x402Client().register("hedera:*", new ExactHederaScheme(signer));
    // SDK-level cap: exactly the approved amount (USDC has 6 decimals).
    client.setSpendControls({ maxAmountPerPayment: `$${Number(pinned.amount) / 1e6}` });
    client.onBeforePaymentCreation(async ({ selectedRequirements }) => {
      const reason = pinMismatch(selectedRequirements, pinned);
      return reason ? { abort: true, reason } : undefined;
    });
    return wrapFetchWithPayment(fetch, client)(url, init);
  };
}
