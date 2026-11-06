import { test } from "node:test";
import assert from "node:assert/strict";
import { VerifyRequest, VerifyResponse, claimsToChecks, HcsMessage } from "../src/schemas.ts";
import { VERIFICATION_TYPE_STRING, verificationDomain, encodeType, WHITECHAIN_CHAIN_ID } from "../src/eip712.ts";

const DEAL = "0x" + "ab".repeat(32);
const ADDR = "0x" + "11".repeat(20);

test("VerifyRequest accepts the claims payload with the user-facing names", () => {
  const r = VerifyRequest.parse({
    dealId: DEAL,
    tradeDeals: ADDR,
    claims: { weight: true, status_code: true, document_verification: true },
    shipment: { containerNo: "MSKU1234567", blRef: "BL-001" },
  });
  assert.equal(r.claims.status_code, true);
});

test("VerifyRequest rejects a non-boolean claim and a short dealId", () => {
  const bad = VerifyRequest.safeParse({
    dealId: "0x1234",
    tradeDeals: ADDR,
    claims: { weight: "true", status_code: true, document_verification: true },
    shipment: { containerNo: "X" },
  });
  assert.equal(bad.success, false);
});

test("claim JSON names map to the EIP-712 struct names in one place", () => {
  assert.deepEqual(claimsToChecks({ weight: true, status_code: false, document_verification: true }), {
    weight: true, statusCode: false, documents: true,
  });
});

test("VerifyResponse requires chainId 1874 (Whitechain), not Hedera 296", () => {
  const base = {
    verification: { dealId: DEAL, weight: true, statusCode: true, documents: true, nonce: "1", expiry: "1762430000" },
    signature: "0x" + "cd".repeat(65),
    signer: ADDR,
    verifyingContract: ADDR,
  };
  assert.equal(VerifyResponse.safeParse({ ...base, chainId: 1874 }).success, true);
  assert.equal(VerifyResponse.safeParse({ ...base, chainId: 296 }).success, false);
});

test("EIP-712 type string is exactly what Solidity must hash", () => {
  assert.equal(
    VERIFICATION_TYPE_STRING,
    "Verification(bytes32 dealId,bool weight,bool statusCode,bool documents,uint256 nonce,uint256 expiry)",
  );
  assert.equal(encodeType(), VERIFICATION_TYPE_STRING);
});

test("domain binds name, version, Whitechain chain id and the deals contract", () => {
  assert.deepEqual(verificationDomain(ADDR as `0x${string}`), {
    name: "TrustMeBro", version: "1", chainId: WHITECHAIN_CHAIN_ID, verifyingContract: ADDR,
  });
  assert.equal(WHITECHAIN_CHAIN_ID, 1874);
});

test("HcsMessage carries the hash chain fields", () => {
  const m = HcsMessage.parse({
    v: 1, seq: 0, prevHash: "0".repeat(64), ts: "2026-11-06T05:00:00.000Z",
    kind: "paid", dealId: DEAL, reason: "ok", hash: "f".repeat(64),
    payment: { payTo: "0.0.123", amount: "300000", asset: "0.0.429274", hederaTxId: "0.0.7162784@1762400000.000000001" },
  });
  assert.equal(m.kind, "paid");
});
