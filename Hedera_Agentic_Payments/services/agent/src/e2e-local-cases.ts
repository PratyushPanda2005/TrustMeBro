/**
 * Full-loop e2e cases on lane C's real contracts and verifier (local anvil, `npm run local`), plan v5
 * §3–6. Pure, so the PASS/FAIL rules are unit-tested; e2e-local.ts runs them live. Each case uses a
 * fresh exporter (onboarded at 50%) who declares 10,000 kg / LOADED; lane C's verifier scenario
 * decides what the world "saw". Guardrails that need a different verifier price or an outage
 * (overcharge, outage) stay in `pnpm e2e` against our verifier: lane C's has a fixed price.
 */
import { FALSIFIED } from "@tmb/shared";
import type { RelayOutcome } from "./chain.ts";

export interface LocalCase {
  /** lane C's verifier scenario (services/verifier/src/scenarios.ts) */
  scenario: "honest" | "lag" | "short-weight" | "fake-docs" | "over-weight" | "stuck";
  /** The contract's verdict per paid check, in order. */
  outcomes: RelayOutcome[];
  /** Final TradeDeals state name. */
  state: string;
  /** TradeDeals falsifiedMask after the run. */
  mask: number;
  /** atomic USDC the agent pays on Hedera */
  charge: bigint;
  /** exporter's TrustRegistry score (bps) after the verdict */
  scoreBps: number;
  /** honest only: fund + importer pays in full → Settled → score after (bps) */
  settledBps?: number;
  what: string;
}

export const LOCAL_CASES = {
  honest: {
    scenario: "honest", outcomes: ["verified"], state: "Verified", mask: 0, charge: 300000n, scoreBps: 5000, settledBps: 6667,
    what: "9,850 kg / DEPARTED / same docs → Verified; funded, importer pays, Settled → TrustRegistry 50.00% → 66.67%",
  },
  lag: {
    scenario: "lag", outcomes: ["pending", "verified"], state: "Verified", mask: 0, charge: 600000n, scoreBps: 5000,
    what: "GATED_IN → Pending, recheck DEPARTED → Verified; two paid checks, no penalty",
  },
  "short-weight": {
    scenario: "short-weight", outcomes: ["rejected"], state: "Rejected", mask: FALSIFIED.WEIGHT, charge: 300000n, scoreBps: 2632,
    what: "8,020 of 10,000 kg → Rejected (weight); only the exporter drops 50.00% → 26.32%",
  },
  "fake-docs": {
    scenario: "fake-docs", outcomes: ["rejected"], state: "Rejected", mask: FALSIFIED.DOCS, charge: 300000n, scoreBps: 2703,
    what: "different eBL bundle hash → Rejected (documents); 50.00% → 27.03%",
  },
  "over-weight": {
    scenario: "over-weight", outcomes: ["mismatch"], state: "Mismatch", mask: 0, charge: 300000n, scoreBps: 5000,
    what: "11,111 kg observed vs 10,000 declared → Mismatch; no penalty, re-create the deal",
  },
  stuck: {
    scenario: "stuck", outcomes: ["pending", "pending", "rejected"], state: "Rejected", mask: FALSIFIED.STATUS, charge: 900000n, scoreBps: 2857,
    what: "status never reached: Pending, Pending, last check kept for after verifyDeadline → Rejected (status); 50.00% → 28.57%",
  },
} satisfies Record<string, LocalCase>;

export type LocalCaseName = keyof typeof LOCAL_CASES;

export interface LocalRun {
  outcomes: RelayOutcome[];
  /** why the agent stopped early, if it did */
  stopped?: string;
  state: string;
  mask: number;
  charged: bigint;
  scoreBps: number;
  settledBps?: number;
}

export function judgeLocal(c: LocalCase, r: LocalRun): { pass: boolean; why: string } {
  if (r.stopped) return { pass: false, why: `agent stopped: ${r.stopped}` };
  if (r.outcomes.join(",") !== c.outcomes.join(",")) return { pass: false, why: `outcomes [${r.outcomes}], expected [${c.outcomes}]` };
  if (r.state !== c.state) return { pass: false, why: `TradeDeals state ${r.state}, expected ${c.state}` };
  if (r.mask !== c.mask) return { pass: false, why: `falsifiedMask ${r.mask}, expected ${c.mask}` };
  if (r.charged !== c.charge) return { pass: false, why: `agent charged ${r.charged} on Hedera, expected ${c.charge}` };
  if (r.scoreBps !== c.scoreBps) return { pass: false, why: `TrustRegistry score ${r.scoreBps}, expected ${c.scoreBps}` };
  if (c.settledBps !== undefined && r.settledBps !== c.settledBps) {
    return { pass: false, why: `score after settlement ${r.settledBps}, expected ${c.settledBps}` };
  }
  return { pass: true, why: c.what };
}
