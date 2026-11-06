import { test } from "node:test";
import assert from "node:assert/strict";
import { VerifyRequest, VerifyResponse, HcsMessage } from "../src/schemas.ts";
import { verificationDomain, WHITECHAIN_CHAIN_ID } from "../src/eip712.ts";

const DEAL = "0x" + "00".repeat(31) + "07";
const ADDR = "0x" + "11".repeat(20);
const HASH = "0x" + "aa".repeat(32);

test("POST /verify body is {dealId, shipmentRef} only (plan v5 §8)", () => {
  const r = VerifyRequest.parse({ dealId: DEAL, shipmentRef: { containerNo: "MSKU1234567", blRef: "BL-001" } });
  assert.equal(r.shipmentRef.containerNo, "MSKU1234567");
});

test("the agent can't send claims: any extra field is rejected", () => {
  const withClaims = { dealId: DEAL, shipmentRef: { containerNo: "MSKU1234567" }, declaredKg: 10_000 };
  assert.equal(VerifyRequest.safeParse(withClaims).success, false);
  assert.equal(VerifyRequest.safeParse({ dealId: "0x1234", shipmentRef: { containerNo: "X" } }).success, false);
  assert.equal(VerifyRequest.safeParse({ dealId: DEAL, shipmentRef: { containerNo: "X".repeat(33) } }).success, false);
});

const verification = { dealId: DEAL, observedKg: 9_850, statusCode: 4, docHash: HASH, observedAt: "1800000000", nonce: "1", expiry: "1800000600" };

test("VerifyResponse carries observed values and requires chainId 1874 (Whitechain), not Hedera 296", () => {
  const base = { verification, signature: "0x" + "cd".repeat(65), signer: ADDR, verifyingContract: ADDR };
  assert.equal(VerifyResponse.safeParse({ ...base, chainId: 1874 }).success, true);
  assert.equal(VerifyResponse.safeParse({ ...base, chainId: 296 }).success, false);
  assert.equal(VerifyResponse.safeParse({ ...base, chainId: 1874, verification: { ...verification, statusCode: 6 } }).success, false);
  assert.equal(VerifyResponse.safeParse({ ...base, chainId: 1874, verification: { ...verification, observedKg: -1 } }).success, false);
});

test("domain binds name, version, Whitechain chain id and the deals contract", () => {
  assert.deepEqual(verificationDomain(ADDR as `0x${string}`), {
    name: "TrustMeBro", version: "1", chainId: WHITECHAIN_CHAIN_ID, verifyingContract: ADDR,
  });
  assert.equal(WHITECHAIN_CHAIN_ID, 1874);
});

test("HcsMessage carries the Option A record: payment, sigHash, whitechainTx and the judged outcome", () => {
  const m = HcsMessage.parse({
    v: 1, seq: 3, prevHash: "0".repeat(64), ts: "2026-11-06T05:00:00.000Z",
    kind: "relayed", dealId: DEAL, reason: "ok", hash: "f".repeat(64),
    payment: { payTo: "0.0.123", amount: "300000", asset: "0.0.429274", hederaTxId: "0.0.7162784@1762400000.000000001" },
    sigHash: HASH, whitechainTx: HASH,
    trust: { exporter: ADDR, outcome: "rejected", beforeBps: 5000, afterBps: 2632 },
  });
  assert.equal(m.trust?.outcome, "rejected");
  assert.equal(HcsMessage.safeParse({ ...m, trust: { ...m.trust, outcome: "disputed" } }).success, false);
});
