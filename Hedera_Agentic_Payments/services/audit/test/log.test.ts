import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HcsMessage } from "@tmb/shared";
import { AuditLog } from "../src/log.ts";
import { verifyChain } from "../src/chain.ts";
import type { AuditSink } from "../src/hcs.ts";

/** Records what reached "HCS"; fails the first `failures` submits like a network blip. */
function flakySink(failures = 0, delayMs: (m: HcsMessage) => number = () => 0) {
  const sent: HcsMessage[] = [];
  let left = failures;
  const sink: AuditSink = {
    async submit(m) {
      const d = delayMs(m);
      if (d) await new Promise((r) => setTimeout(r, d));
      if (left > 0) {
        left--;
        throw new Error("UNAVAILABLE: network blip");
      }
      sent.push(m);
      return { topicSequence: sent.length };
    },
  };
  return { sink, sent };
}

const quiet = () => {
  const orig = console.error;
  console.error = () => {};
  return () => (console.error = orig);
};

test("a failed HCS submit is resent before the next message, so the topic chain has no gap", async () => {
  const restore = quiet();
  try {
    const { sink, sent } = flakySink(1);
    const log = new AuditLog(sink);
    await log.write({ kind: "quote", reason: "a" }); // fails
    assert.equal(sent.length, 0);
    await log.write({ kind: "paid", reason: "b" });
    assert.deepEqual(sent.map((m) => m.seq), [0, 1]);
    assert.deepEqual(verifyChain(sent), { ok: true, duplicates: 0 });
    assert.equal(log.pending(), 0);
  } finally {
    restore();
  }
});

test("unsent messages survive a restart and go out first", async () => {
  const restore = quiet();
  const dir = mkdtempSync(join(tmpdir(), "tmb-audit-"));
  try {
    const tail = join(dir, "audit-tail.json");
    await new AuditLog(flakySink(99).sink, tail).write({ kind: "quote", reason: "before crash" });

    const { sink, sent } = flakySink(0);
    const restarted = new AuditLog(sink, tail);
    assert.equal(restarted.pending(), 1);
    await restarted.write({ kind: "paid", reason: "after restart" });
    assert.deepEqual(sent.map((m) => [m.seq, m.reason]), [[0, "before crash"], [1, "after restart"]]);
    assert.deepEqual(verifyChain(sent), { ok: true, duplicates: 0 });
  } finally {
    restore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("concurrent writes reach HCS in seq order", async () => {
  // Earlier messages take longer, so unserialised submits would land out of order.
  const { sink, sent } = flakySink(0, (m) => 20 - m.seq * 5);
  const log = new AuditLog(sink);
  await Promise.all([1, 2, 3, 4].map((i) => log.write({ kind: "quote", reason: `deal ${i}` })));
  assert.deepEqual(sent.map((m) => m.seq), [0, 1, 2, 3]);
  assert.deepEqual(verifyChain(sent), { ok: true, duplicates: 0 });
});

test("each topic keeps its own chain tail, so switching AUDIT_TOPIC_ID starts the new topic at seq 0", async () => {
  const { auditTailFile } = await import("../src/log.ts");
  const dir = mkdtempSync(join(tmpdir(), "tmb-audit-"));
  try {
    const old = new AuditLog(flakySink().sink, auditTailFile(dir, "0.0.111"));
    await old.write({ kind: "quote", reason: "old topic" });
    await old.write({ kind: "paid", reason: "old topic" });
    const { sink, sent } = flakySink();
    await new AuditLog(sink, auditTailFile(dir, "0.0.222")).write({ kind: "quote", reason: "new topic" });
    assert.equal(sent[0].seq, 0);
    assert.equal(sent[0].prevHash, "0".repeat(64));
    assert.notEqual(auditTailFile(dir, "0.0.111"), auditTailFile(dir, "0.0.222"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("close() waits for queued submits, then closes the sink's client so a script can exit", async () => {
  const { sink, sent } = flakySink(0, () => 10);
  let closed = false;
  const log = new AuditLog({ ...sink, close: () => { closed = true; } });
  const pending = log.write({ kind: "quote", reason: "last one" });
  await log.close();
  assert.equal(sent.length, 1, "message submitted before close");
  assert.equal(closed, true);
  await pending;
});

test("an exact resend (same seq and hash, e.g. after DUPLICATE_TRANSACTION) is skipped and counted; a different message at that seq still breaks", async () => {
  const { verifyChain } = await import("../src/chain.ts");
  const sent: any[] = [];
  const log = new AuditLog({ submit: async (m: any) => { sent.push(m); return {}; } } as any);
  for (const k of ["quote", "paid", "relayed"] as const) await log.write({ kind: k, reason: k });
  const resent = [sent[0], sent[1], sent[1], sent[2]];
  const r = verifyChain(resent);
  assert.equal(r.ok, true);
  assert.equal((r as any).duplicates, 1);
  const forged = { ...sent[1], reason: "edited" };
  assert.equal(verifyChain([sent[0], sent[1], forged, sent[2]]).ok, false);
  assert.equal(verifyChain([sent[0], sent[2]]).ok, false); // gap
});
