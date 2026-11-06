/**
 * What the verification service "observes" about a shipment.
 * Hackathon honesty: real carriers, weighbridges and customs don't sell data over
 * x402 yet, so observations come from named demo scenarios. The README says so.
 */
import type { Checks, Verification, Hex } from "@tmb/shared";

export const SCENARIOS = ["honest", "fake-weight", "fake-status", "fake-docs", "outage"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export function isScenario(x: unknown): x is Scenario {
  return typeof x === "string" && (SCENARIOS as readonly string[]).includes(x);
}

/** Default scenario plus optional per-deal overrides (set from the dashboard demo panel). */
export class ScenarioBook {
  private perDeal = new Map<string, Scenario>();
  constructor(private fallback: Scenario) {
    if (!isScenario(fallback)) throw new Error(`unknown scenario ${fallback}`);
  }
  set(scenario: Scenario, dealId?: string) {
    if (!isScenario(scenario)) throw new Error(`unknown scenario ${scenario}`);
    if (dealId) this.perDeal.set(dealId.toLowerCase(), scenario);
    else this.fallback = scenario;
  }
  for(dealId: string): Scenario {
    return this.perDeal.get(dealId.toLowerCase()) ?? this.fallback;
  }
  snapshot() {
    return { default: this.fallback, perDeal: Object.fromEntries(this.perDeal) };
  }
}

/** Observed facts for a scenario. `outage` is handled by the server (503, not charged). */
export function observe(s: Exclude<Scenario, "outage"> | Scenario): Checks {
  return {
    weight: s !== "fake-weight",
    statusCode: s !== "fake-status",
    documents: s !== "fake-docs",
  };
}

/** Strictly increasing nonces (ms clock × 1000 + counter), unique per verifier key. */
export class NonceSource {
  private last = 0n;
  constructor(private now: () => number = Date.now) {}
  next(): bigint {
    const candidate = BigInt(this.now()) * 1000n;
    this.last = candidate > this.last ? candidate : this.last + 1n;
    return this.last;
  }
}

export function buildVerification(
  dealId: Hex, observed: Checks, nonces: NonceSource, nowSec: number, ttlSec: number,
): Verification {
  return { dealId, ...observed, nonce: nonces.next(), expiry: BigInt(nowSec + ttlSec) };
}
