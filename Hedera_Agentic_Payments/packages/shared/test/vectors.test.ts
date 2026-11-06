import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("committed vectors match a fresh generation (no drift from the reference maths)", () => {
  const file = join(root, "vectors", "trust.json");
  const committed = readFileSync(file, "utf8");
  // node --import tsx is portable; spawning the `tsx` bin fails on Windows (tsx.cmd, ENOENT).
  execFileSync(process.execPath, ["--import", "tsx", join(root, "scripts", "gen-vectors.ts")], { cwd: root });
  assert.equal(readFileSync(file, "utf8"), committed);
});

test("vectors contain plan v5's headline numbers", () => {
  const v = JSON.parse(readFileSync(join(root, "vectors", "trust.json"), "utf8"));
  assert.equal(v.version, 5);
  const five = v.exporter.find((e: any) => e.name === "five honest settled deals");
  assert.deepEqual(five.steps.map((x: any) => x.trust), ["6667", "7500", "8000", "8333", "8571"]);
  assert.equal(v.exporter.find((e: any) => e.name === "fake weight from new").steps[0].trust, "2632");
  assert.equal(v.importer.find((e: any) => e.name === "new importer").start.riskBps, "400");
  const q = v.quotes.find((x: any) => x.name.startsWith("§6.3"));
  assert.deepEqual([q.quote.exporterNet, q.toInvestor, q.toExporter], ["69300000000", "72800000000", "27200000000"]);
  assert.deepEqual(v.checks.map((c: any) => c.outcome), ["Verified", "Pending", "Falsified", "Falsified", "Mismatch", "Falsified"]);
});
