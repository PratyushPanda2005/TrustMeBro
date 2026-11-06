import { test } from "node:test";
import assert from "node:assert/strict";

// viem is a real dependency; this file skips only where it isn't installed.
const viem = await import("viem").catch(() => null);
const skip = viem ? false : "viem not installed in this environment";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const; // test-only key
const DEALS = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;

test("signature recovers to the verifier address", { skip }, async () => {
  const { signVerification, recoverVerificationSigner } = await import("../src/sign.ts");
  const res = await signVerification(KEY, DEALS, {
    dealId: ("0x" + "ab".repeat(32)) as `0x${string}`, weight: true, statusCode: true, documents: true, nonce: 1n, expiry: 2_000_000_000n,
  });
  assert.equal((await recoverVerificationSigner(res)).toLowerCase(), res.signer.toLowerCase());
});

test("tampering with any field changes the recovered signer", { skip }, async () => {
  const { signVerification, recoverVerificationSigner } = await import("../src/sign.ts");
  const res = await signVerification(KEY, DEALS, {
    dealId: ("0x" + "ab".repeat(32)) as `0x${string}`, weight: false, statusCode: true, documents: true, nonce: 7n, expiry: 2_000_000_000n,
  });
  const forged = { ...res, verification: { ...res.verification, weight: true } };
  assert.notEqual((await recoverVerificationSigner(forged)).toLowerCase(), res.signer.toLowerCase());
});
