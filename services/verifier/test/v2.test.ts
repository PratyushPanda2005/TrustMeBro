import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyTypedData } from "viem";
import {
  decodeAttestation,
  prepareTrade,
  typedAttestation,
  validateMetadata,
  evidenceFailures,
  type Report,
} from "@trustmebro/shared/v2";
import { configuredProvider } from "../src/v2.js";
import { fixture, merchant, now } from "./v2-fixture.js";

test("business helper identifies missing invoice identity and source record", () => {
  const f = fixture(),
    r = prepareTrade(
      { ...f.input, invoiceNumber: undefined, record: undefined },
      now,
    );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.missing.length, 2);
  validateMetadata(f.deal, f.metadata);
  assert.throws(() => validateMetadata(f.deal, { ...f.metadata, unit: "g" }));
});
test("real provider is fail-closed until an authenticated adapter is configured", async () => {
  const p = await configuredProvider("real");
  assert.equal(await p.observe(fixture().request), undefined);
});
test("running demo provider observes refreshed file without restart and never silently restamps stale evidence", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tmb-demo-refresh-")),
    file = join(dir, "fixture.json"),
    f = fixture();
  try {
    writeFileSync(
      file,
      JSON.stringify({ ...f.evidence, observedAt: (now - 681n).toString() }),
    );
    const provider = await configuredProvider("demo", undefined, file);
    const old = await provider.observe(f.request);
    assert.deepEqual(evidenceFailures(f.deal, f.metadata, old!, now, "demo"), [
      "observationFresh",
    ]);
    writeFileSync(file, JSON.stringify(f.evidence));
    const refreshed = await provider.observe(f.request);
    assert.equal(refreshed!.observedAt, now.toString());
    assert.equal(old!.observedAt, (now - 681n).toString());
    assert.deepEqual(
      evidenceFailures(f.deal, f.metadata, refreshed!, now, "demo"),
      [],
    );
    writeFileSync(file, JSON.stringify({ ...f.evidence, mode: "real" }));
    await assert.rejects(provider.observe(f.request));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("canonical merchant signs exact V2 data, checks digest parity and caches signature", async () => {
  const m = await merchant();
  try {
    const get = () =>
      fetch(m.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(m.request),
      });
    const res = await get();
    assert.equal(res.status, 200);
    const report = (await res.json()) as Report;
    assert.equal(report.result, "passing");
    assert.equal(
      await verifyTypedData({
        ...typedAttestation(decodeAttestation(report.attestation!)),
        address: report.signer!,
        signature: report.signature!,
      }),
      true,
    );
    assert.deepEqual(await (await get()).json(), report);
  } finally {
    await m.close();
  }
});
for (const [label, options, status] of [
  ["missing evidence", { evidence: null }, 200],
  ["unauthorized signer", { authorized: false }, 503],
  ["wrong digest", { badDigest: true }, 422],
] as const)
  test(label, async () => {
    const m = await merchant(options);
    try {
      const res = await fetch(m.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(m.request),
      });
      assert.equal(res.status, status);
      const r = (await res.json()) as Report;
      assert.equal(r.signature, undefined);
      if (status === 200) assert.equal(r.result, "insufficient_evidence");
    } finally {
      await m.close();
    }
  });
test("merchant rejects altered commitment before observing/signing", async () => {
  const m = await merchant();
  try {
    const request = structuredClone(m.request);
    request.metadata.record.recordId = "forged";
    const res = await fetch(m.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    assert.equal(res.status, 422);
  } finally {
    await m.close();
  }
});
