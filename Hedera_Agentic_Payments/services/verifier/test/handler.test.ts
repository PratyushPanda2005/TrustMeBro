import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUS, demoDocHash } from "@tmb/shared";
import { handleVerify } from "../src/handler.ts";
import { ScenarioBook, NonceSource } from "../src/observe.ts";

const TRADE_DEALS = "0x" + "11".repeat(20);
const body = { dealId: "0x" + "00".repeat(31) + "07", shipmentRef: { containerNo: "MSKU1234567", blRef: "BL-DEMO-001" } };

function deps(scenario: any = "honest") {
  const signed: any[] = [];
  return {
    signed,
    d: {
      book: new ScenarioBook(scenario),
      nonces: new NonceSource(() => 1_000),
      nowSec: () => 1_800_000_000,
      ttlSec: 600,
      tradeDeals: TRADE_DEALS,
      sign: async (tradeDeals: string, v: any) => {
        signed.push({ tradeDeals, v });
        return { verification: v, signature: "0xsig", signer: "0xverifier", chainId: 1874, verifyingContract: tradeDeals };
      },
    },
  };
}

test("bad body → 400 (x402 does not settle, so the agent is not charged)", async () => {
  const { d } = deps();
  assert.equal((await handleVerify({ ...body, dealId: "nope" }, d as any)).status, 400);
});

test("a body carrying claims is refused: the agent can't launder a lie (plan v5 §8)", async () => {
  const { d, signed } = deps();
  const r = await handleVerify({ ...body, declaredKg: 10_000 }, d as any);
  assert.equal(r.status, 400);
  assert.equal(signed.length, 0);
});

test("outage scenario → 503 and nothing is signed", async () => {
  const { d, signed } = deps("outage");
  assert.equal((await handleVerify(body, d as any)).status, 503);
  assert.equal(signed.length, 0);
});

test("honest → 200, signed for the configured TradeDeals with observed values and observedAt", async () => {
  const { d, signed } = deps();
  const r = await handleVerify(body, d as any);
  assert.equal(r.status, 200);
  assert.equal(signed[0].tradeDeals, TRADE_DEALS);
  assert.deepEqual(
    { dealId: signed[0].v.dealId, kg: signed[0].v.observedKg, status: signed[0].v.statusCode, doc: signed[0].v.docHash, at: signed[0].v.observedAt, expiry: signed[0].v.expiry },
    { dealId: body.dealId, kg: 9_850, status: STATUS.DEPARTED, doc: demoDocHash("MSKU1234567"), at: 1_800_000_000n, expiry: 1_800_000_600n },
  );
});

test("lag: the first paid check sees GATED_IN, the recheck for the same deal sees DEPARTED", async () => {
  const { d, signed } = deps("lag");
  await handleVerify(body, d as any);
  await handleVerify(body, d as any);
  assert.deepEqual(signed.map((s) => s.v.statusCode), [STATUS.GATED_IN, STATUS.DEPARTED]);
});

test("a rejected (400) request does not advance the deal's check counter", async () => {
  const { d, signed } = deps("lag");
  await handleVerify({ ...body, shipmentRef: {} }, d as any);
  await handleVerify(body, d as any);
  assert.equal(signed[0].v.statusCode, STATUS.GATED_IN);
});
