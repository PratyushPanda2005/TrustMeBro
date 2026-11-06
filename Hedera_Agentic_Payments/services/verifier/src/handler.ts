import { VerifyRequest, type Verification, type VerifyResponse, type Hex } from "@tmb/shared";
import { observe, buildVerification, type ScenarioBook, type NonceSource } from "./observe.ts";

export interface VerifyDeps {
  book: ScenarioBook;
  nonces: NonceSource;
  nowSec: () => number;
  ttlSec: number;
  /** EIP-712 verifyingContract: the TradeDeals this verifier's key is registered in. */
  tradeDeals: Hex;
  sign: (tradeDeals: Hex, v: Verification) => Promise<VerifyResponse>;
}

export type HandlerResult = { status: number; json: unknown };

/**
 * POST /verify business logic (plan v5 §8). Runs behind the x402 paywall.
 * Any status >= 400 means x402 does not settle, so the agent is never charged
 * for a bad request or an outage.
 */
export async function handleVerify(body: unknown, d: VerifyDeps): Promise<HandlerResult> {
  const parsed = VerifyRequest.safeParse(body);
  if (!parsed.success) return { status: 400, json: { error: "bad_request", issues: parsed.error.issues.map((i) => i.message) } };

  const req = parsed.data;
  const scenario = d.book.for(req.dealId);
  if (scenario === "outage") return { status: 503, json: { error: "data_source_unavailable" } };

  // Observations come from the (simulated) weighbridge / carrier / eBL source, never from claims.
  const observed = observe(scenario, req.shipmentRef.containerNo, d.book.nextCheck(req.dealId));
  const v = buildVerification(req.dealId as Hex, observed, d.nonces, d.nowSec(), d.ttlSec);
  return { status: 200, json: await d.sign(d.tradeDeals, v) };
}
