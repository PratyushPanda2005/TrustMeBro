/**
 * Writes signed sample responses (plan v5 §4 examples) for lane C's Foundry tests and the
 * dashboard: viem signs, Solidity verifies. Fixed TEST-ONLY keys.
 * Run: pnpm --filter @tmb/shared fixtures
 * The verifyingContract defaults to the address lane C's own EIP-712 fixture uses; override with
 * FIXTURE_DEALS=0x... The claim these observations answer: 10,000 kg, LOADED, docHash A.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import { signVerification } from "../src/sign.ts";
import { dealIdToBytes32, type Hex, type Verification } from "../src/eip712.ts";
import { STATUS } from "../src/trust.ts";

const VERIFIER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex; // anvil #1, test only
const IMPOSTOR_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex; // anvil #2, test only
const DEALS = (process.env.FIXTURE_DEALS ?? "0x1874000000000000000000000000000000001874") as Hex;
const DOC_A = ("0x" + "aa".repeat(32)) as Hex;
const DOC_B = ("0x" + "bb".repeat(32)) as Hex;
const OBSERVED_AT = 1_800_000_000n;
const FAR = 4_102_444_800n; // 2100-01-01

const base: Verification = {
  dealId: dealIdToBytes32(1n), observedKg: 9_850, statusCode: STATUS.DEPARTED, docHash: DOC_A, observedAt: OBSERVED_AT, nonce: 1n, expiry: FAR,
};

const cases = {
  honest: await signVerification(VERIFIER_KEY, DEALS, base),
  lag: await signVerification(VERIFIER_KEY, DEALS, { ...base, observedKg: 10_020, statusCode: STATUS.GATED_IN, nonce: 2n }),
  short_weight: await signVerification(VERIFIER_KEY, DEALS, { ...base, observedKg: 8_020, statusCode: STATUS.LOADED, nonce: 3n }),
  fake_docs: await signVerification(VERIFIER_KEY, DEALS, { ...base, observedKg: 10_000, statusCode: STATUS.LOADED, docHash: DOC_B, nonce: 4n }),
  expired: await signVerification(VERIFIER_KEY, DEALS, { ...base, nonce: 5n, expiry: 1n }),
  wrong_signer: await signVerification(IMPOSTOR_KEY, DEALS, { ...base, nonce: 6n }),
  wrong_contract: await signVerification(VERIFIER_KEY, "0x000000000000000000000000000000000000dEaD", { ...base, nonce: 7n }),
  stale_observation: await signVerification(VERIFIER_KEY, DEALS, { ...base, observedAt: 1n, nonce: 8n }),
};

const out = {
  verifier: privateKeyToAccount(VERIFIER_KEY).address,
  impostor: privateKeyToAccount(IMPOSTOR_KEY).address,
  verifyingContract: DEALS,
  chainId: 1874,
  claim: { declaredKg: 10_000, claimedStatus: STATUS.LOADED, docHash: DOC_A },
  note: "Plan v5 §4 examples. Foundry: vm.chainId(1874), TradeDeals at verifyingContract (or regenerate with FIXTURE_DEALS), claimTime < observedAt. 'reused' = submit `honest` twice. Outcomes: honest Verified, lag Pending, short_weight / fake_docs Rejected.",
  cases,
};

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "verifications.json");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${file}`);
