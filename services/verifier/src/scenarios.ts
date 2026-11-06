// Simulated real-world data sources (terminal weighbridge, carrier tracking, eBL registry).
// Real feeds don't accept x402 today, so each demo scenario derives "what the world saw" from the claim.

import { keccak256, stringToHex, type Hex } from "viem"

import { ShipmentStatus } from "@trustmebro/shared"

import type { DealSnapshot } from "./chain"

export const SCENARIOS = ["honest", "lag", "short-weight", "fake-docs", "over-weight", "stuck"] as const
export type Scenario = (typeof SCENARIOS)[number]

export const SCENARIO_INFO: Record<Scenario, string> = {
  honest: "Everything matches: weight within 3%, same documents, status reached -> Verified",
  lag: "Carrier tracking is behind on the first check (GATED_IN), caught up on the next -> Pending, then Verified",
  "short-weight": "Weighbridge reads 80.2% of the declared weight -> Rejected (weight falsified)",
  "fake-docs": "eBL bundle hash differs from the exporter's documents -> Rejected (documents falsified)",
  "over-weight": "Weighbridge reads 11% more than declared -> Mismatch (no penalty, re-create the deal)",
  stuck: "Status never reaches the claim -> Pending; a check after the verify deadline -> Rejected (status falsified)",
}

export type Observation = {
  observedKg: number
  statusCode: number
  docHash: Hex
}

export type Evidence = {
  weighbridge: { source: string; ticket: string; kg: number }
  tracking: { source: string; containerNo: string; status: number }
  documents: { source: string; blRef: string; bundleHash: Hex }
}

const UINT32_MAX = 4_294_967_295

function scaleKg(kg: number, bps: number): number {
  return Math.min(UINT32_MAX, Math.max(1, Math.round((kg * bps) / 10_000)))
}

/** What the simulated sources report for this deal, given the scenario and the checks already made. */
export function observe(deal: DealSnapshot, scenario: Scenario): Observation {
  const reached = Math.max(deal.claimedStatus, ShipmentStatus.DEPARTED)
  const behind = ShipmentStatus.GATED_IN // always below a valid claim (claims are >= LOADED)
  const same = deal.docHash

  switch (scenario) {
    case "honest":
      return { observedKg: scaleKg(deal.declaredKg, 9_850), statusCode: reached, docHash: same }
    case "lag":
      // Uses the on-chain check count, so a failed relay doesn't skip the "behind" step.
      return deal.checks === 0
        ? { observedKg: scaleKg(deal.declaredKg, 10_020), statusCode: behind, docHash: same }
        : { observedKg: scaleKg(deal.declaredKg, 10_020), statusCode: reached, docHash: same }
    case "short-weight":
      return { observedKg: scaleKg(deal.declaredKg, 8_020), statusCode: deal.claimedStatus, docHash: same }
    case "fake-docs":
      return {
        observedKg: deal.declaredKg,
        statusCode: deal.claimedStatus,
        docHash: keccak256(stringToHex(`carrier eBL bundle for deal ${deal.dealId} (differs from exporter docs)`)),
      }
    case "over-weight":
      return { observedKg: scaleKg(deal.declaredKg, 11_111), statusCode: deal.claimedStatus, docHash: same }
    case "stuck":
      return { observedKg: deal.declaredKg, statusCode: behind, docHash: same }
  }
}

export function evidenceFor(deal: DealSnapshot, o: Observation): Evidence {
  return {
    weighbridge: {
      source: "Terminal weighbridge (simulated)",
      ticket: `WB-${deal.containerNo}-${deal.checks + 1}`,
      kg: o.observedKg,
    },
    tracking: { source: "Carrier track & trace (simulated)", containerNo: deal.containerNo, status: o.statusCode },
    documents: { source: "eBL registry (simulated)", blRef: deal.blRef, bundleHash: o.docHash },
  }
}

/**
 * Which scenario applies to a container. Set before the exporter claims (the agent checks right after the
 * claim), so the demo is keyed by container number, like a real carrier database.
 */
export class ScenarioBook {
  private readonly byContainer = new Map<string, Scenario>()

  constructor(private defaultScenario: Scenario) {}

  get(containerNo: string): Scenario {
    return this.byContainer.get(normalise(containerNo)) ?? this.defaultScenario
  }

  set(containerNo: string, scenario: Scenario): void {
    this.byContainer.set(normalise(containerNo), scenario)
  }

  remove(containerNo: string): boolean {
    return this.byContainer.delete(normalise(containerNo))
  }

  setDefault(scenario: Scenario): void {
    this.defaultScenario = scenario
  }

  list(): { default: Scenario; containers: Record<string, Scenario> } {
    return { default: this.defaultScenario, containers: Object.fromEntries(this.byContainer) }
  }
}

function normalise(containerNo: string): string {
  return containerNo.trim().toUpperCase()
}
