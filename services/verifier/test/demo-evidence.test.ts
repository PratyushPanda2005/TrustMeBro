import assert from "node:assert/strict";
import { test } from "node:test";

import { evidenceFailures } from "@trustmebro/shared/v2";

import { demoEvidence } from "../src/demo-evidence.js";
import { fixture, now } from "./v2-fixture.js";

test("demo evidence passes the verifier's own checks and stays labelled", () => {
  const { deal, metadata } = fixture();
  const evidence = demoEvidence(deal, metadata, now);
  assert.deepEqual(evidenceFailures(deal, metadata, evidence, now, "demo"), []);
  assert.equal(evidence.mode, "demo");
  assert.deepEqual(
    evidenceFailures(deal, metadata, evidence, now, "real").includes("mode"),
    true,
  );
});

test("demo evidence goes stale after five minutes", () => {
  const { deal, metadata } = fixture();
  const evidence = demoEvidence(deal, metadata, now);
  assert.deepEqual(evidenceFailures(deal, metadata, evidence, now + 301n, "demo"), [
    "observationFresh",
  ]);
});
