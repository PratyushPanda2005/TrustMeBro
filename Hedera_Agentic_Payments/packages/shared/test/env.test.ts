import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, ROOT_ENV } from "../src/env.ts";

test("ROOT_ENV is the .env at the workspace root (two levels above packages/shared)", () => {
  const repo = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  assert.equal(ROOT_ENV, join(repo, ".env"));
  assert.ok(existsSync(join(repo, ".env.example")), "repo root holds .env.example");
});

test("loadEnv reads the file but never overrides variables already set (runbook: VAR=x pnpm …)", () => {
  const dir = mkdtempSync(join(tmpdir(), "tmb-env-"));
  const file = join(dir, ".env");
  writeFileSync(file, "TMB_ENV_TEST_A=from-file\nTMB_ENV_TEST_B=from-file\n");
  process.env.TMB_ENV_TEST_B = "from-shell";
  loadEnv(file);
  assert.equal(process.env.TMB_ENV_TEST_A, "from-file");
  assert.equal(process.env.TMB_ENV_TEST_B, "from-shell");
});

test("loadEnv tolerates a missing file", () => {
  assert.doesNotThrow(() => loadEnv(join(tmpdir(), "definitely-missing-tmb.env")));
});
