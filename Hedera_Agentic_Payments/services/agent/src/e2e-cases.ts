/**
 * Hedera-only e2e cases (no Whitechain needed): what each demo scenario must do to the
 * agent's money and verdict. Pure, so the PASS/FAIL rules are unit-tested; e2e.ts runs them live.
 * The contract-side cases (cheat → only the exporter drops, both-honest) wait for lane C.
 */
import type { BuyResult } from "./buy.ts";

export interface E2ECase {
  scenario: "honest" | "fake-weight" | "overcharge" | "outage";
  expect: BuyResult["status"];
  /** atomic USDC the agent must lose */
  charge: bigint;
  /** extra check on the signed observation, for paid cases */
  observed?: { weight: boolean; statusCode: boolean; documents: boolean };
  what: string;
}

export const E2E_CASES = {
  happy: { scenario: "honest", expect: "verified", charge: 300000n, observed: { weight: true, statusCode: true, documents: true }, what: "paid 0.30, verified, all checks true" },
  cheat: { scenario: "fake-weight", expect: "verified", charge: 300000n, observed: { weight: false, statusCode: true, documents: true }, what: "paid 0.30, verifier reports the falsified weight" },
  overcharge: { scenario: "overcharge", expect: "pending_human", charge: 0n, what: "5.00 quote held for a human, nothing paid" },
  outage: { scenario: "outage", expect: "no_verdict", charge: 0n, what: "data source down: 503, not settled, nothing paid" },
} satisfies Record<string, E2ECase>;

export type E2EName = keyof typeof E2E_CASES;

export function judge(c: E2ECase, r: BuyResult, charged: bigint): { pass: boolean; why: string } {
  if (r.status !== c.expect) return { pass: false, why: `status ${r.status}, expected ${c.expect}${"reason" in r ? ` (${r.reason})` : ""}` };
  if (charged !== c.charge) return { pass: false, why: `agent charged ${charged}, expected ${c.charge}` };
  if (c.observed && r.status === "verified") {
    const v = r.response.verification;
    for (const k of ["weight", "statusCode", "documents"] as const) {
      if (v[k] !== c.observed[k]) return { pass: false, why: `observed ${k}=${v[k]}, expected ${c.observed[k]}` };
    }
  }
  return { pass: true, why: c.what };
}
