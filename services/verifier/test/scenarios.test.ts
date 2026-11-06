import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { DealState, Falsified, Outcome, ShipmentStatus, judge, weightWindow } from "@trustmebro/shared"

import type { DealSnapshot } from "../src/chain"
import { SCENARIOS, ScenarioBook, observe, type Scenario } from "../src/scenarios"

const DOC_A = "0x1111111111111111111111111111111111111111111111111111111111111111" as const

function claimedDeal(overrides: Partial<DealSnapshot> = {}): DealSnapshot {
  return {
    dealId: 1n,
    state: DealState.Claimed,
    declaredKg: 10_000,
    claimedStatus: ShipmentStatus.LOADED,
    docHash: DOC_A,
    claimTime: 1_000n,
    verifyDeadline: 1_600n,
    observedAt: 0n,
    checks: 0,
    containerNo: "MSKU1234567",
    blRef: "BL-001",
    ...overrides,
  }
}

function outcomeOf(deal: DealSnapshot, scenario: Scenario, observedAt = 1_100n) {
  return judge(deal, { ...observe(deal, scenario), observedAt })
}

describe("judge mirrors TradeDeals._judge", () => {
  it("uses the contract's ±3% window with floor rounding", () => {
    assert.deepEqual(weightWindow(10_000), { lo: 9_700, hi: 10_300 })
    assert.deepEqual(weightWindow(333), { lo: 323, hi: 342 })
  })

  it("matches the contract's boundary cases", () => {
    const claim = claimedDeal()
    const at = (kg: number) => judge(claim, { observedKg: kg, statusCode: 3, docHash: DOC_A, observedAt: 1_100n })
    assert.equal(at(9_700).outcome, Outcome.Verified)
    assert.equal(at(10_300).outcome, Outcome.Verified)
    assert.equal(at(10_301).outcome, Outcome.Mismatch)
    assert.equal(at(9_699).outcome, Outcome.Falsified)
  })

  it("only penalises a lagging status after the deadline", () => {
    const claim = claimedDeal()
    const obs = { observedKg: 10_000, statusCode: ShipmentStatus.GATED_IN, docHash: DOC_A }
    assert.equal(judge(claim, { ...obs, observedAt: 1_600n }).outcome, Outcome.Pending)
    assert.deepEqual(judge(claim, { ...obs, observedAt: 1_601n }), {
      outcome: Outcome.Falsified,
      falsifiedMask: Falsified.Status,
    })
  })

  it("compares document hashes case-insensitively", () => {
    const claim = claimedDeal()
    const upper = DOC_A.toUpperCase().replace("0X", "0x") as `0x${string}`
    assert.equal(judge(claim, { observedKg: 10_000, statusCode: 3, docHash: upper, observedAt: 1_100n }).outcome, 0)
  })
})

describe("demo scenarios produce the documented outcome", () => {
  it("honest -> Verified", () => {
    assert.equal(outcomeOf(claimedDeal(), "honest").outcome, Outcome.Verified)
  })

  it("lag -> Pending on the first check, Verified on the next", () => {
    assert.equal(outcomeOf(claimedDeal(), "lag").outcome, Outcome.Pending)
    const pending = claimedDeal({ state: DealState.Pending, checks: 1, observedAt: 1_100n })
    assert.equal(outcomeOf(pending, "lag", 1_200n).outcome, Outcome.Verified)
  })

  it("short-weight -> Falsified (weight)", () => {
    assert.deepEqual(outcomeOf(claimedDeal(), "short-weight"), {
      outcome: Outcome.Falsified,
      falsifiedMask: Falsified.Weight,
    })
    assert.equal(observe(claimedDeal(), "short-weight").observedKg, 8_020)
  })

  it("fake-docs -> Falsified (documents)", () => {
    assert.deepEqual(outcomeOf(claimedDeal(), "fake-docs"), {
      outcome: Outcome.Falsified,
      falsifiedMask: Falsified.Documents,
    })
  })

  it("over-weight -> Mismatch (9,000 declared, 10,000 observed)", () => {
    const deal = claimedDeal({ declaredKg: 9_000 })
    assert.equal(observe(deal, "over-weight").observedKg, 10_000)
    assert.equal(outcomeOf(deal, "over-weight").outcome, Outcome.Mismatch)
  })

  it("stuck -> Pending before the deadline, Falsified (status) after it", () => {
    assert.equal(outcomeOf(claimedDeal(), "stuck").outcome, Outcome.Pending)
    assert.deepEqual(outcomeOf(claimedDeal(), "stuck", 1_601n), {
      outcome: Outcome.Falsified,
      falsifiedMask: Falsified.Status,
    })
  })

  it("never reports a status above ARRIVED or a zero weight", () => {
    for (const scenario of SCENARIOS) {
      for (const claimedStatus of [3, 4, 5]) {
        const o = observe(claimedDeal({ declaredKg: 1, claimedStatus }), scenario)
        assert.ok(o.statusCode <= ShipmentStatus.ARRIVED, scenario)
        assert.ok(o.observedKg >= 1, scenario)
      }
    }
  })
})

describe("ScenarioBook", () => {
  it("is keyed by container number, case-insensitively, with a default", () => {
    const book = new ScenarioBook("honest")
    book.set("msku7654321", "short-weight")
    assert.equal(book.get("MSKU7654321"), "short-weight")
    assert.equal(book.get("OTHER"), "honest")
    book.setDefault("lag")
    assert.equal(book.get("OTHER"), "lag")
    assert.equal(book.remove("MSKU7654321"), true)
    assert.equal(book.get("MSKU7654321"), "lag")
  })
})
