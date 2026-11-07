import assert from "node:assert/strict";
import { test } from "node:test";

import { mkdtempSync, rmSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { JobStore } from "@trustmebro/shared/job-store";
import {
  attestationHash,
  evidenceFailures,
  typedAttestation,
  type Report,
} from "@trustmebro/shared/v2";

import { demoEvidence } from "../src/demo-evidence.js";
import {
  configuredProvider,
  createV2App,
  type V2Reader,
} from "../src/v2.js";
import { account, fixture, now } from "./v2-fixture.js";

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

test("the auto provider simulates a fresh, labelled observation for each trade", async () => {
  const { deal, metadata, request } = fixture();
  const reader = {
    deal: async () => deal,
    time: async () => now,
  } as unknown as V2Reader;
  const provider = await configuredProvider("demo", undefined, undefined, reader);
  const evidence = await provider.observe(request);
  assert.equal(evidence?.mode, "demo");
  assert.equal(evidence?.observedAt, now.toString());
  assert.equal(evidence?.statusSource, "SIMULATED TEST TERMINAL");
  assert.deepEqual(evidenceFailures(deal, metadata, evidence!, now, "demo"), []);
  assert.equal(provider.mode, "demo");
});

test("the auto provider passes the real route even when a new block lands mid-request", async () => {
  const { deal, request } = fixture();
  const dir = mkdtempSync(join(tmpdir(), "tmb-auto-evidence-"));
  let tick = 0n;
  const reader: V2Reader = {
    deal: async () => deal,
    // Each read lands in a later block, as it does on the live chain.
    time: async () => now + tick++ * 2n,
    authorized: async () => true,
    digest: async (a) => attestationHash(a),
  };
  const app = createV2App({
    reader,
    provider: await configuredProvider("demo", undefined, undefined, reader),
    store: new JobStore<Report & { jobId: string }>(dir),
    signer: {
      address: account.address,
      sign: (a) => account.signTypedData(typedAttestation(a)),
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No listener");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    const report = (await response.json()) as Report;
    assert.equal(report.reason, undefined);
    assert.equal(report.result, "passing");
  } finally {
    await new Promise((done) => server.close(done));
    rmSync(dir, { recursive: true, force: true });
  }
});
