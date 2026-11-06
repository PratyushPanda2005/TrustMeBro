import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  StartupError,
  loadV2Environment,
  missingVariables,
  requireVariables,
  startupStep,
  printStartupError,
  inspectJobs,
  requireDedicatedSigner,
} from "@trustmebro/shared/v2-startup";
import { verifierConfig } from "../src/v2-config.js";

test("missing merchant configuration reports names only", () => {
  assert.throws(
    () => verifierConfig({}),
    (error) =>
      error instanceof StartupError &&
      error.code === "CONFIG_MISSING" &&
      error.message.includes("SERVICE_SIGNER_PRIVATE_KEY") &&
      error.message.includes("VERIFIER_PAYTO"),
  );
  assert.deepEqual(
    missingVariables({ VERIFIER_ADDRESS: " " }, ["VERIFIER_ADDRESS"]),
    ["VERIFIER_ADDRESS"],
  );
});

test("V2 configuration ignores obsolete contract fields and never echoes an invalid secret value", () => {
  assert.throws(
    () =>
      verifierConfig({
        SERVICE_SIGNER_PRIVATE_KEY: "SENTINEL_NOT_A_KEY",
        VERIFIER_PAYTO: "0.0.5005",
        TRADEDEALS_ADDRESS: "obsolete",
        DEFAULT_SCENARIO: "obsolete",
      }),
    (error) =>
      error instanceof StartupError &&
      error.code === "CONFIG_INVALID" &&
      error.message.includes("SERVICE_SIGNER_PRIVATE_KEY") &&
      !error.message.includes("SENTINEL") &&
      !error.message.includes("TRADEDEALS_ADDRESS"),
  );
});
test("package env wins over workspace fallback; shell wins; file paths resolve relative to defining file", () => {
  const dir = mkdtempSync(join(tmpdir(), "tmb-startup-"));
  try {
    const pkg = join(dir, "package");
    mkdirSync(pkg);
    writeFileSync(
      join(dir, ".env"),
      "VERIFIER_ADDRESS=workspace\nV2_METADATA_FILE=records.json\nPOLICY_MAX_PER_CALL=1000000\nV2_STATE_DIR=.state/v2\n",
    );
    writeFileSync(
      join(pkg, ".env"),
      "VERIFIER_ADDRESS=package\nV2_METADATA_FILE=local.json\n",
    );
    const env: NodeJS.ProcessEnv = { VERIFIER_ADDRESS: "shell" };
    assert.equal(loadV2Environment(pkg, dir, env).length, 2);
    assert.equal(env.VERIFIER_ADDRESS, "shell");
    assert.equal(env.V2_METADATA_FILE, join(pkg, "local.json"));
    assert.equal(env.POLICY_MAX_PER_CALL, "1000000");
    assert.equal(env.V2_STATE_DIR, ".state/v2"); // Preserve prior package-relative job location.
    const explicit = join(dir, "custom.env");
    writeFileSync(explicit, "V2_METADATA_FILE=custom.json\n");
    const override: NodeJS.ProcessEnv = { V2_ENV_FILE: explicit };
    loadV2Environment(pkg, dir, override);
    assert.equal(override.V2_METADATA_FILE, join(dir, "custom.json"));
    assert.equal(override.VERIFIER_ADDRESS, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("raw initialization errors and secret-bearing cause text never reach diagnostics", async () => {
  const secret = "SENTINEL_DO_NOT_PRINT";
  let caught: unknown;
  try {
    await startupStep("RPC_UNREACHABLE", "Check network access.", () => {
      throw Error("https://user:" + secret + "@rpc.invalid/?token=" + secret);
    });
  } catch (error) {
    caught = error;
  }
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args) => {
    lines.push(args.join(" "));
  };
  try {
    printStartupError(caught);
    printStartupError(new Error(secret));
  } finally {
    console.error = original;
  }
  assert.ok(lines.join("\n").includes("RPC_UNREACHABLE"));
  assert.ok(!lines.join("\n").includes(secret));
});
test("job diagnostics report blocked/uncertain states without changing files or acquiring locks", () => {
  const dir = mkdtempSync(join(tmpdir(), "tmb-job-inspect-"));
  try {
    mkdirSync(join(dir, "jobs"));
    mkdirSync(join(dir, "runtime"));
    const a = join(dir, "jobs", "0x" + "11".repeat(32) + ".json"),
      b = join(dir, "jobs", "0x" + "22".repeat(32) + ".json");
    writeFileSync(
      a,
      JSON.stringify({ state: "blocked", reason: "SENTINEL_SECRET" }),
    );
    writeFileSync(b, JSON.stringify({ state: "payment_unknown" }));
    writeFileSync(join(dir, "runtime", "worker.lock"), "existing-lock");
    const before = [
      readFileSync(a, "utf8"),
      readFileSync(b, "utf8"),
      readFileSync(join(dir, "runtime", "worker.lock"), "utf8"),
    ];
    const summary = inspectJobs(dir);
    assert.equal(summary.count, 2);
    assert.equal(summary.states.blocked, 1);
    assert.equal(summary.states.payment_unknown, 1);
    assert.equal(summary.locks.length, 1);
    assert.ok(!JSON.stringify(summary).includes("SENTINEL_SECRET"));
    assert.deepEqual(before, [
      readFileSync(a, "utf8"),
      readFileSync(b, "utf8"),
      readFileSync(join(dir, "runtime", "worker.lock"), "utf8"),
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("role diagnosis distinguishes missing authorization from forbidden Admin signer", () => {
  const base = {
    chainId: 1874,
    finance: "0x71e3c6aE367A0D8517A0DA7cC480cBa9e954DfC7" as const,
    domain: { name: "TrustMeBro Trade Finance", version: "2" },
    paymentToken: "token",
    reputation: "rep",
    note: "note",
    adminHasVerifierRole: true,
  };
  assert.throws(
    () =>
      requireDedicatedSigner({
        ...base,
        signer: {
          address: "0x2222222222222222222222222222222222222222",
          verifierRole: false,
          adminRole: false,
        },
      }),
    (error) =>
      error instanceof StartupError && error.code === "VERIFIER_ROLE_MISSING",
  );
  assert.throws(
    () =>
      requireDedicatedSigner({
        ...base,
        signer: {
          address: "0x2222222222222222222222222222222222222222",
          verifierRole: true,
          adminRole: true,
        },
      }),
    (error) =>
      error instanceof StartupError && error.code === "ADMIN_SIGNER_FORBIDDEN",
  );
});
