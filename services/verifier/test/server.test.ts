import assert from "node:assert/strict"
import type { AddressInfo } from "node:net"
import { after, before, describe, it } from "node:test"

import { recoverTypedDataAddress, type Address, type Hex } from "viem"

import { DealState, ShipmentStatus, dealIdToBytes32, verificationDomain, verificationTypes } from "@trustmebro/shared"

import type { DealReader, DealSnapshot } from "../src/chain"
import { silentLogger } from "../src/log"
import { ScenarioBook } from "../src/scenarios"
import { createApp } from "../src/server"
import { usdcUnits } from "../src/price"
import { createVerificationSigner, randomNonce } from "../src/signer"

// anvil's public test key #9. Never fund it.
const SIGNER_PK = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6" as const
const TRADE_DEALS: Address = "0x1874000000000000000000000000000000001874"
const DOC_A: Hex = "0x1111111111111111111111111111111111111111111111111111111111111111"
const NOW = 1_762_400_000n

const signer = createVerificationSigner(SIGNER_PK)
const deals = new Map<bigint, DealSnapshot>()
let chainDown = false
let onChainVerifier: Address | undefined

const reader: DealReader = {
  chainId: async () => 1874,
  verifierAddress: async () => onChainVerifier ?? signer.address,
  deal: async (id) => {
    if (chainDown) throw new Error("rpc down")
    return deals.get(id)
  },
  chainTime: async () => NOW,
}

function putDeal(id: bigint, overrides: Partial<DealSnapshot> = {}) {
  deals.set(id, {
    dealId: id,
    state: DealState.Claimed,
    declaredKg: 10_000,
    claimedStatus: ShipmentStatus.LOADED,
    docHash: DOC_A,
    claimTime: NOW - 30n,
    verifyDeadline: NOW + 600n,
    observedAt: 0n,
    checks: 0,
    containerNo: "MSKU1234567",
    blRef: "BL-001",
    ...overrides,
  })
}

let base = ""
let close: () => void = () => {}
const scenarios = new ScenarioBook("honest")

before(async () => {
  const app = createApp({
    reader,
    signer,
    scenarios,
    tradeDeals: TRADE_DEALS,
    chainId: 1874,
    signatureTtlSeconds: 600,
    payments: { enabled: false },
    demoToken: "demo-token-123",
    log: silentLogger,
    now: () => NOW,
  })
  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      close = () => server.close()
      resolve()
    })
  })
})

after(() => close())

async function verify(body: unknown) {
  const res = await fetch(`${base}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: (await res.json()) as Record<string, any> }
}

const ref = { containerNo: "MSKU1234567", blRef: "BL-001" }

describe("POST /verify", () => {
  it("signs an honest observation the contract will accept", async () => {
    putDeal(1n)
    const { status, json } = await verify({ dealId: dealIdToBytes32(1n), shipmentRef: ref })
    assert.equal(status, 200)
    assert.equal(json.expected.outcome, "Verified")
    assert.equal(json.signer, signer.address)

    const v = json.verification
    const message = {
      dealId: v.dealId,
      observedKg: v.observedKg,
      statusCode: v.statusCode,
      docHash: v.docHash,
      observedAt: BigInt(v.observedAt),
      nonce: BigInt(v.nonce),
      expiry: BigInt(v.expiry),
    }
    assert.equal(message.dealId, dealIdToBytes32(1n))
    assert.equal(message.docHash, DOC_A)
    assert.ok(message.observedAt > NOW - 30n, "observedAt is after the claim")
    assert.equal(message.expiry, NOW + 600n)

    const recovered = await recoverTypedDataAddress({
      domain: verificationDomain(TRADE_DEALS, 1874),
      types: verificationTypes,
      primaryType: "Verification",
      message,
      signature: json.signature,
    })
    assert.equal(recovered, signer.address)
  })

  it("accepts a decimal deal id and uses a fresh nonce each time", async () => {
    putDeal(2n)
    const a = await verify({ dealId: "2", shipmentRef: ref })
    const b = await verify({ dealId: 2, shipmentRef: ref })
    assert.equal(a.status, 200)
    assert.notEqual(a.json.verification.nonce, b.json.verification.nonce)
  })

  it("moves observedAt past the claim and the previous check", async () => {
    putDeal(3n, { claimTime: NOW + 5n })
    assert.equal((await verify({ dealId: "3", shipmentRef: ref })).json.verification.observedAt, String(NOW + 6n))
    putDeal(4n, { state: DealState.Pending, checks: 1, observedAt: NOW + 10n })
    assert.equal((await verify({ dealId: "4", shipmentRef: ref })).json.verification.observedAt, String(NOW + 11n))
  })

  it("uses the scenario set for the container", async () => {
    scenarios.set("MSKU0000666", "short-weight")
    putDeal(5n, { containerNo: "MSKU0000666" })
    const { json } = await verify({ dealId: "5", shipmentRef: { containerNo: "msku0000666", blRef: "BL-001" } })
    assert.equal(json.verification.observedKg, 8_020)
    assert.equal(json.expected.outcome, "Falsified")
    assert.equal(json.demo.scenario, "short-weight")
  })

  it("rejects a bad body with 400", async () => {
    assert.equal((await verify({ dealId: "xyz" })).status, 400)
    const res = await fetch(`${base}/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" })
    assert.equal(res.status, 400)
  })

  it("returns 404 for an unknown deal", async () => {
    assert.equal((await verify({ dealId: "999", shipmentRef: ref })).status, 404)
  })

  it("returns 409 when the deal is not Claimed or Pending", async () => {
    putDeal(6n, { state: DealState.Verified })
    const { status, json } = await verify({ dealId: "6", shipmentRef: ref })
    assert.equal(status, 409)
    assert.equal(json.error, "wrong_state")
  })

  it("returns 400 when the shipment reference differs from the on-chain claim", async () => {
    putDeal(7n)
    const { status, json } = await verify({ dealId: "7", shipmentRef: { containerNo: "OTHER", blRef: "BL-001" } })
    assert.equal(status, 400)
    assert.equal(json.error, "shipment_ref_mismatch")
  })

  it("returns 502 when the chain can't be read", async () => {
    putDeal(8n)
    chainDown = true
    try {
      assert.equal((await verify({ dealId: "8", shipmentRef: ref })).status, 502)
    } finally {
      chainDown = false
    }
  })
})

describe("demo and health routes", () => {
  it("needs the demo token to change scenarios", async () => {
    const put = (token?: string) =>
      fetch(`${base}/demo/scenarios/MSKU1111111`, {
        method: "PUT",
        headers: { "content-type": "application/json", ...(token ? { "x-demo-token": token } : {}) },
        body: JSON.stringify({ scenario: "fake-docs" }),
      })
    assert.equal((await put()).status, 401)
    assert.equal((await put("wrong-token")).status, 401)
    const ok = await put("demo-token-123")
    assert.equal(ok.status, 200)
    assert.equal(((await ok.json()) as any).containers.MSKU1111111, "fake-docs")
  })

  it("rejects unknown scenarios", async () => {
    const res = await fetch(`${base}/demo/scenarios/default`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-demo-token": "demo-token-123" },
      body: JSON.stringify({ scenario: "steal-money" }),
    })
    assert.equal(res.status, 400)
  })

  it("reports health and answers CORS preflight", async () => {
    const health = await fetch(`${base}/health`)
    assert.equal(health.status, 200)
    assert.equal(((await health.json()) as any).ok, true)
    const preflight = await fetch(`${base}/verify`, { method: "OPTIONS" })
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get("access-control-allow-origin"), "*")
  })

  it("health is 503 when TradeDeals trusts a different signer", async () => {
    onChainVerifier = "0x000000000000000000000000000000000000dEaD"
    try {
      const res = await fetch(`${base}/health`)
      assert.equal(res.status, 503)
      assert.equal(((await res.json()) as any).ok, false)
    } finally {
      onChainVerifier = undefined
    }
  })

  it("GET / describes the service", async () => {
    const json = (await (await fetch(`${base}/`)).json()) as any
    assert.equal(json.signer, signer.address)
    assert.equal(json.chainId, 1874)
    assert.equal(json.domain.verifyingContract, TRADE_DEALS)
  })

  it("lists scenarios, sets the default and removes a container", async () => {
    const headers = { "content-type": "application/json", "x-demo-token": "demo-token-123" }
    const list = (await (await fetch(`${base}/demo/scenarios`)).json()) as any
    assert.ok(list.available.honest && list.available["short-weight"])

    const setDefault = await fetch(`${base}/demo/scenarios/default`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ scenario: "lag" }),
    })
    assert.equal(((await setDefault.json()) as any).default, "lag")

    await fetch(`${base}/demo/scenarios/MSKU2222222`, { method: "PUT", headers, body: JSON.stringify({ scenario: "stuck" }) })
    const removed = await fetch(`${base}/demo/scenarios/MSKU2222222`, { method: "DELETE", headers })
    assert.equal(removed.status, 200)
    assert.equal(((await removed.json()) as any).containers.MSKU2222222, undefined)
    assert.equal((await fetch(`${base}/demo/scenarios/MSKU2222222`, { method: "DELETE" })).status, 401)

    await fetch(`${base}/demo/scenarios/default`, { method: "PUT", headers, body: JSON.stringify({ scenario: "honest" }) })
  })

  it("answers unknown routes with 404 JSON", async () => {
    const res = await fetch(`${base}/nope`)
    assert.equal(res.status, 404)
    assert.equal(((await res.json()) as any).error, "not_found")
  })
})

describe("helpers", () => {
  it("nonces are 256-bit and distinct", () => {
    const a = randomNonce()
    assert.ok(a < 2n ** 256n)
    assert.notEqual(a, randomNonce())
  })

  it("converts the price to USDC units", () => {
    assert.equal(usdcUnits("$0.30"), "300000")
    assert.equal(usdcUnits("1"), "1000000")
    assert.equal(usdcUnits("$0.000001"), "1")
    assert.throws(() => usdcUnits("thirty cents"))
  })
})
