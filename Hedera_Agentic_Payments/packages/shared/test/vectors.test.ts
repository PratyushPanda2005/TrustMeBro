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

test("vectors contain the plan's headline numbers", () => {
  const v = JSON.parse(readFileSync(join(root, "vectors", "trust.json"), "utf8"));
  const five = v.exporter.find((e: any) => e.name === "five honest deals");
  assert.deepEqual(five.steps.map((x: any) => x.score), ["6666", "7500", "8000", "8333", "8571"]);
  assert.equal(v.exporter.find((e: any) => e.name === "fake weight from new").steps[0].score, "2631");
  const pdf = v.waterfall.find((w: any) => w.name === "veteran pair (PDF example)");
  assert.equal(pdf.investors, "27540000000");
});
