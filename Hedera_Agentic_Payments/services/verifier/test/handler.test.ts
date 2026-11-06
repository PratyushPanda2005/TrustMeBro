import { test } from "node:test";
import assert from "node:assert/strict";
import { handleVerify } from "../src/handler.ts";
import { ScenarioBook, NonceSource } from "../src/observe.ts";

const body = {
  dealId: "0x" + "aa".repeat(32),
  tradeDeals: "0x" + "11".repeat(20),
  claims: { weight: true, status_code: true, document_verification: true },
  shipment: { containerNo: "MSKU1234567" },
};

function deps(scenario: any = "honest") {
  const signed: any[] = [];
  return {
    signed,
    d: {
      book: new ScenarioBook(scenario),
      nonces: new NonceSource(() => 1_000),
      nowSec: () => 1_762_400_000,
      ttlSec: 600,
      sign: async (tradeDeals: string, v: any) => {
        signed.push({ tradeDeals, v });
        return { verification: { ...v, nonce: String(v.nonce), expiry: String(v.expiry) }, signature: "0xsig", signer: "0xverifier", chainId: 1874, verifyingContract: tradeDeals };
      },
    },
  };
}

test("bad body → 400 (x402 does not settle, so the agent is not charged)", async () => {
  const { d } = deps();
  const r = await handleVerify({ ...body, dealId: "nope" }, d as any);
  assert.equal(r.status, 400);
});

test("outage scenario → 503 and nothing is signed", async () => {
  const { d, signed } = deps("outage");
  const r = await handleVerify(body, d as any);
  assert.equal(r.status, 503);
  assert.equal(signed.length, 0);
});

test("honest → 200 with a signed verification for the requested deal and contract", async () => {
  const { d, signed } = deps();
  const r = await handleVerify(body, d as any);
  assert.equal(r.status, 200);
  assert.equal(signed[0].tradeDeals, body.tradeDeals);
  assert.equal(signed[0].v.dealId, body.dealId);
  assert.equal(signed[0].v.expiry, 1_762_400_600n);
});

test("observed values come from the scenario, never from the exporter's claims", async () => {
  const { d, signed } = deps("fake-weight");
  await handleVerify(body, d as any); // claims say weight: true
  assert.equal(signed[0].v.weight, false);
});
