import { VerifyRequest, type Verification, type VerifyResponse, type Hex } from "@tmb/shared";
import { observe, buildVerification, type ScenarioBook, type NonceSource } from "./observe.ts";

export interface VerifyDeps {
  book: ScenarioBook;
  nonces: NonceSource;
  nowSec: () => number;
  ttlSec: number;
  sign: (tradeDeals: Hex, v: Verification) => Promise<VerifyResponse>;
}

export type HandlerResult = { status: number; json: unknown };

/**
 * POST /verify business logic. Runs behind the x402 paywall.
 * Any status >= 400 means x402 does not settle, so the agent is never charged
 * for a bad request or an outage.
 */
export async function handleVerify(body: unknown, d: VerifyDeps): Promise<HandlerResult> {
  const parsed = VerifyRequest.safeParse(body);
  if (!parsed.success) return { status: 400, json: { error: "bad_request", issues: parsed.error.issues.map((i) => i.message) } };

  const req = parsed.data;
  const scenario = d.book.for(req.dealId);
  if (scenario === "outage") return { status: 503, json: { error: "data_source_unavailable" } };

  // Observations come from the data source (demo scenario), never from the claims.
  const v = buildVerification(req.dealId as Hex, observe(scenario), d.nonces, d.nowSec(), d.ttlSec);
  return { status: 200, json: await d.sign(req.tradeDeals as Hex, v) };
}
