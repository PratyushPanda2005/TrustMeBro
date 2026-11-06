import { test } from "node:test";
import assert from "node:assert/strict";
import { type Hex } from "viem";
import { StartupError, printStartupError } from "@trustmebro/shared/v2-startup";
import {
  selectEvmCredential,
  validateHederaSetup,
} from "../src/v2-setup-config.js";
import { account } from "./v2-fixture.js";

// Same fixed public test fixture used by the existing local tests, not a real credential.
const fixtureKey = `0x${"11".repeat(32)}` as Hex;
test("optional relayer placeholder is missing, not a key-derivation failure", () => {
  const notices: string[] = [];
  assert.equal(
    selectEvmCredential(
      [{ name: "RELAYER_PRIVATE_KEY", value: "0x..." }],
      notices,
    ),
    undefined,
  );
  assert.equal(notices.length, 1);
  assert.match(
    notices[0],
    /OPTIONAL_CREDENTIAL_PLACEHOLDER.*RELAYER_PRIVATE_KEY/,
  );
  assert.ok(!notices[0].includes("0x..."));
});
test("legacy verifier key alias derives the existing fixture public address", () => {
  const selected = selectEvmCredential(
    [
      { name: "SERVICE_SIGNER_PRIVATE_KEY", value: undefined },
      { name: "VERIFIER_EVM_PRIVATE_KEY", value: fixtureKey },
    ],
    [],
  );
  assert.equal(selected?.address, account.address);
  assert.equal(selected?.sourceName, "VERIFIER_EVM_PRIVATE_KEY");
});
test("placeholder source does not replace an existing valid relayer", () => {
  const selected = selectEvmCredential(
    [
      { name: "RELAYER_PRIVATE_KEY", value: "0x..." },
      { name: "RELAYER_PRIVATE_KEY (existing agent)", value: fixtureKey },
    ],
    [],
  );
  assert.equal(selected?.address, account.address);
  assert.equal(selected?.sourceName, "RELAYER_PRIVATE_KEY (existing agent)");
});
test("genuinely malformed EVM credentials produce a variable-name-only diagnostic", () => {
  let failure: unknown;
  const sentinel = "SENTINEL_SECRET_DO_NOT_PRINT";
  try {
    selectEvmCredential([{ name: "RELAYER_PRIVATE_KEY", value: sentinel }], []);
  } catch (e) {
    failure = e;
  }
  assert.ok(failure instanceof StartupError);
  assert.equal(failure.code, "EVM_KEY_FORMAT_INVALID");
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args) => {
    lines.push(args.join(" "));
  };
  try {
    printStartupError(failure);
  } finally {
    console.error = original;
  }
  assert.match(lines.join("\n"), /RELAYER_PRIVATE_KEY/);
  assert.ok(!lines.join("\n").includes(sentinel));
});
test("out-of-range secp256k1 scalar has a separate safe error code", () => {
  assert.throws(
    () =>
      selectEvmCredential(
        [{ name: "SERVICE_SIGNER_PRIVATE_KEY", value: `0x${"00".repeat(32)}` }],
        [],
      ),
    (e) => e instanceof StartupError && e.code === "EVM_KEY_SCALAR_INVALID",
  );
});
test("invalid Hedera settings identify names without echoing values", () => {
  assert.throws(
    () =>
      validateHederaSetup(
        "invalid-secret-network",
        "invalid-secret-token",
        "invalid-secret-payer",
        "invalid-secret-merchant",
        "0.0.429274",
      ),
    (e) =>
      e instanceof StartupError &&
      e.code === "HEDERA_CONFIG_INVALID" &&
      e.message.includes("HEDERA_NETWORK") &&
      !e.message.includes("invalid-secret"),
  );
  validateHederaSetup(
    "hedera:testnet",
    "0.0.429274",
    "0.0.11331527",
    "0.0.11331478",
    "0.0.429274",
  );
});
