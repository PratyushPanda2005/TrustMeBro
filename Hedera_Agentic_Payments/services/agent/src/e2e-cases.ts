/**
 * Hedera e2e cases, plan v5 §4 example table plus the guardrail demos (§9): what each scenario
 * must do to the agent's money, the contract's verdict, and the exporter's Trust Score. Pure, so
 * the PASS/FAIL rules are unit-tested; e2e.ts runs them live. Each case uses a fresh exporter (50%)
 * and the demo claim 10,000 kg / LOADED / docHash A (under-declared claims 9,000 kg).
 * Whitechain is the mock TradeDeals until lane C deploys; the maths is the shared mirror of theirs.
 */
import type { BuyResult } from "./buy.ts";
import type { RelayOutcome } from "./chain.ts";

export interface E2ECase {
  scenario: "honest" | "lag" | "short-weight" | "fake-docs" | "outage" | "overcharge";
  /** What the exporter declares (default 10,000 kg). */
  declaredKg?: number;
  /** The contract's verdict per paid check, in order. Empty = the agent must stop before the chain. */
  outcomes: RelayOutcome[];
  /** Where the agent must stop when nothing is relayed. */
  stopped?: Exclude<BuyResult["status"], "verified">;
  /** atomic USDC the agent must lose */
  charge: bigint;
  /** exporter score (bps) right after the run */
  scoreBps: number;
  /** exporter score after the (mock) importer pays and the deal settles; only for verified deals */
  settledBps?: number;
  what: string;
}

export const E2E_CASES = {
  honest: {
    scenario: "honest", outcomes: ["verified"], charge: 300000n, scoreBps: 5000, settledBps: 6667,
    what: "9,850 kg / DEPARTED / hash A → Verified; score stays 50.00% until settlement, then 66.67%",
  },
  lag: {
    scenario: "lag", outcomes: ["pending", "verified"], charge: 600000n, scoreBps: 5000,
    what: "GATED_IN → Pending, recheck DEPARTED → Verified; two checks (0.60), no penalty",
  },
  "short-weight": {
    scenario: "short-weight", outcomes: ["rejected"], charge: 300000n, scoreBps: 2632,
    what: "8,020 of 10,000 kg → Rejected; only the exporter drops 50.00% → 26.32%",
  },
  "fake-docs": {
    scenario: "fake-docs", outcomes: ["rejected"], charge: 300000n, scoreBps: 2703,
    what: "doc hash B ≠ A → Rejected; only the exporter drops 50.00% → 27.03%",
  },
  "under-declared": {
    scenario: "honest", declaredKg: 9_000, outcomes: ["mismatch"], charge: 300000n, scoreBps: 5000,
    what: "9,000 claimed, 9,850 observed → Mismatch; no penalty, re-create correctly",
  },
  overcharge: {
    scenario: "overcharge", outcomes: [], stopped: "pending_human", charge: 0n, scoreBps: 5000,
    what: "5.00 quote held for a human; nothing paid, nothing relayed",
  },
  outage: {
    scenario: "outage", outcomes: [], stopped: "no_verdict", charge: 0n, scoreBps: 5000,
    what: "data source down: 503, nothing paid, no penalty",
  },
} satisfies Record<string, E2ECase>;

export type E2EName = keyof typeof E2E_CASES;

/** What actually happened in a live run. */
export interface E2ERun {
  outcomes: RelayOutcome[];
  /** buy status of the attempt that stopped the agent, if it stopped before the chain */
  stopped?: string;
  charged: bigint;
  scoreBps: number;
  settledBps?: number;
}

export function judge(c: E2ECase, r: E2ERun): { pass: boolean; why: string } {
  if (c.stopped && r.stopped !== c.stopped) return { pass: false, why: `stopped at ${r.stopped ?? "nothing"}, expected ${c.stopped}` };
  if (r.outcomes.join(",") !== c.outcomes.join(",")) return { pass: false, why: `outcomes [${r.outcomes}], expected [${c.outcomes}]` };
  if (r.charged !== c.charge) return { pass: false, why: `agent charged ${r.charged}, expected ${c.charge}` };
  if (r.scoreBps !== c.scoreBps) return { pass: false, why: `exporter score ${r.scoreBps}, expected ${c.scoreBps}` };
  if (c.settledBps !== undefined && r.settledBps !== c.settledBps) {
    return { pass: false, why: `score after settlement ${r.settledBps}, expected ${c.settledBps}` };
  }
  return { pass: true, why: c.what };
}
