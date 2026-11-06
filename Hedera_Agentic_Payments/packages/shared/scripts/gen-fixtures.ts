/**
 * Writes signed sample responses for lane C's Foundry tests (cross-language
 * round trip: viem signs, Solidity verifies). Uses fixed TEST-ONLY keys.
 * Run: pnpm --filter @tmb/shared fixtures
 * Lane C reads fixtures/verifications.json via vm.readFile + vm.parseJson.
 * The verifyingContract is the address Foundry assigns to the first contract
 * deployed by the default test sender; override with FIXTURE_DEALS=0x...
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import { signVerification } from "../src/sign.ts";
import type { Hex } from "../src/eip712.ts";

const VERIFIER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex; // anvil #1, test only
const IMPOSTOR_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex; // anvil #2, test only
const DEALS = (process.env.FIXTURE_DEALS ?? "0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f") as Hex;
const DEAL_ID = ("0x" + "ab".repeat(32)) as Hex;
const FAR = 4_102_444_800n; // 2100-01-01

const base = { dealId: DEAL_ID, weight: true, statusCode: true, documents: true, nonce: 1n, expiry: FAR };

const cases = {
  valid_all_true: await signVerification(VERIFIER_KEY, DEALS, base),
  valid_weight_false: await signVerification(VERIFIER_KEY, DEALS, { ...base, weight: false, nonce: 2n }),
  valid_docs_false: await signVerification(VERIFIER_KEY, DEALS, { ...base, documents: false, nonce: 3n }),
  expired: await signVerification(VERIFIER_KEY, DEALS, { ...base, nonce: 4n, expiry: 1n }),
  wrong_signer: await signVerification(IMPOSTOR_KEY, DEALS, { ...base, nonce: 5n }),
  wrong_contract: await signVerification(VERIFIER_KEY, "0x000000000000000000000000000000000000dEaD", { ...base, nonce: 6n }),
};

const out = {
  verifier: privateKeyToAccount(VERIFIER_KEY).address,
  impostor: privateKeyToAccount(IMPOSTOR_KEY).address,
  verifyingContract: DEALS,
  chainId: 1874,
  note: "Foundry: vm.chainId(1874) and deploy TradeDeals at verifyingContract (or regenerate with FIXTURE_DEALS). 'reused' = submit valid_all_true twice.",
  cases,
};

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "verifications.json");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${file}`);
