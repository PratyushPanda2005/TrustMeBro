import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { signVerification, recoverVerificationSigner, verificationDigest } from "../src/sign.ts";
import { VERIFICATION_TYPE_STRING, encodeType, dealIdToBytes32, type Verification } from "../src/eip712.ts";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const; // anvil #1, test only
// Lane C's own fixture (contracts/test/fixtures/eip712.json on their branch): their forge test verifies this signature.
const laneC = JSON.parse(readFileSync(new URL("../vectors/eip712-lane-c.json", import.meta.url), "utf8"));
const laneCMessage: Verification = {
  dealId: laneC.message.dealId,
  observedKg: Number(laneC.message.observedKg),
  statusCode: Number(laneC.message.statusCode),
  docHash: laneC.message.docHash,
  observedAt: BigInt(laneC.message.observedAt),
  nonce: BigInt(laneC.message.nonce),
  expiry: BigInt(laneC.message.expiry),
};

test("type string is exactly lane C's VERIFICATION_TYPEHASH input (plan v5 §8)", () => {
  assert.equal(
    VERIFICATION_TYPE_STRING,
    "Verification(bytes32 dealId,uint32 observedKg,uint8 statusCode,bytes32 docHash,uint64 observedAt,uint256 nonce,uint256 expiry)",
  );
  assert.equal(encodeType(), VERIFICATION_TYPE_STRING);
});

test("cross-lane round trip: our signer reproduces lane C's digest and signature byte for byte", async () => {
  const res = await signVerification(KEY, laneC.domain.verifyingContract, laneCMessage);
  assert.equal(verificationDigest(laneC.domain.verifyingContract, laneCMessage), laneC.digest);
  assert.equal(res.signature, laneC.signature);
  assert.equal(res.signer, laneC.signer);
  assert.equal(await recoverVerificationSigner(res), laneC.signer);
});

test("tampering with any observed value changes the recovered signer", async () => {
  const res = await signVerification(KEY, laneC.domain.verifyingContract, laneCMessage);
  for (const forged of [
    { ...res.verification, observedKg: 10_000 },
    { ...res.verification, statusCode: 5 },
    { ...res.verification, docHash: "0x" + "bb".repeat(32) },
    { ...res.verification, observedAt: "1800000001" },
  ]) {
    assert.notEqual(await recoverVerificationSigner({ ...res, verification: forged }), res.signer);
  }
});

test("dealIdToBytes32 encodes the contract's uint256 deal id like lane C", () => {
  assert.equal(dealIdToBytes32(1n), laneC.message.dealId);
  assert.throws(() => dealIdToBytes32(-1n), RangeError);
});
