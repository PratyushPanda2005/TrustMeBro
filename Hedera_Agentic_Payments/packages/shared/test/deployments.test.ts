import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HederaDeployment } from "../src/schemas.ts";
import { HEDERA_NETWORK, HEDERA_USDC_TESTNET } from "../src/constants.ts";

const file = new URL("../../../deployments/hedera-testnet.json", import.meta.url);

test("deployments/hedera-testnet.json (G0 handoff to lane A) is valid and public-only", () => {
  const raw = readFileSync(file, "utf8");
  const d = HederaDeployment.parse(JSON.parse(raw));
  assert.equal(d.network, HEDERA_NETWORK);
  assert.equal(d.usdc.tokenId, HEDERA_USDC_TESTNET);
  // Never a private key: no 32-byte hex anywhere in the file.
  assert.doesNotMatch(raw, /0x[0-9a-fA-F]{64}/);
  assert.doesNotMatch(raw, /private|secret|token"\s*:/i);
});
