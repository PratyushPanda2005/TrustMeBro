/**
 * What the verification service "observes" about a shipment (plan v5 §4): the terminal
 * weighbridge reading, the carrier's tracking status and the hash of the carrier-issued eBL
 * bundle. Hackathon honesty: real weighbridges, carriers and eBL platforms don't sell data over
 * x402 yet, so this is a simulated source driven by named demo scenarios. The README says so.
 *
 * The verifier never sees the exporter's claims. It reports facts; the contract judges.
 */
import { STATUS, demoDocHash, forgedDocHash, type Hex, type Verification } from "@tmb/shared";

export const SCENARIOS = ["honest", "lag", "short-weight", "fake-docs", "outage", "overcharge"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export function isScenario(x: unknown): x is Scenario {
  return typeof x === "string" && (SCENARIOS as readonly string[]).includes(x);
}

/** Default scenario, per-deal overrides (dashboard demo panel), and a per-deal check counter. */
export class ScenarioBook {
  private perDeal = new Map<string, Scenario>();
  private checks = new Map<string, number>();
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
  /** 1 for the first paid check of a deal, 2 for the recheck, … (drives the `lag` scenario). */
  nextCheck(dealId: string): number {
    const n = (this.checks.get(dealId.toLowerCase()) ?? 0) + 1;
    this.checks.set(dealId.toLowerCase(), n);
    return n;
  }
  snapshot() {
    return { default: this.fallback, perDeal: Object.fromEntries(this.perDeal) };
  }
}

export interface Observed {
  observedKg: number;
  statusCode: number;
  docHash: Hex;
}

/**
 * The simulated weighbridge / carrier / eBL reading for a container on its n-th check.
 * Values are plan v5 §4's example table. `outage` is handled by the handler (503, not charged).
 */
export function observe(s: Scenario, containerNo: string, checkNo: number): Observed {
  const docA = demoDocHash(containerNo);
  switch (s) {
    case "lag":
      return checkNo <= 1
        ? { observedKg: 10_020, statusCode: STATUS.GATED_IN, docHash: docA } // tracking lag
        : { observedKg: 10_020, statusCode: STATUS.DEPARTED, docHash: docA };
    case "short-weight":
      return { observedKg: 8_020, statusCode: STATUS.LOADED, docHash: docA }; // overclaimed goods
    case "fake-docs":
      return { observedKg: 10_000, statusCode: STATUS.LOADED, docHash: forgedDocHash(containerNo) };
    default: // honest, overcharge (greedy merchant, honest data), outage (never reached)
      return { observedKg: 9_850, statusCode: STATUS.DEPARTED, docHash: docA };
  }
}

/**
 * x402 price for a request. `overcharge` is a greedy merchant: honest data, 5.00 instead of
 * 0.30, so the agent's spending gate must stop it (pending_human). Same scenario on the probe
 * and the paid retry, so the quote the agent approves is the one it is asked to sign.
 */
export function priceFor(s: Scenario, normal: string, overcharge: string): string {
  return s === "overcharge" ? overcharge : normal;
}

/** dealId from a parsed JSON body, or "" (default scenario) for anything malformed. */
export function dealIdOf(body: unknown): string {
  const id = (body as { dealId?: unknown } | null | undefined)?.dealId;
  return typeof id === "string" ? id : "";
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

/** Signed message: observedAt = the verifier's clock now (the contract requires > claimTime). */
export function buildVerification(dealId: Hex, o: Observed, nonces: NonceSource, nowSec: number, ttlSec: number): Verification {
  return { dealId, ...o, observedAt: BigInt(nowSec), nonce: nonces.next(), expiry: BigInt(nowSec + ttlSec) };
}
