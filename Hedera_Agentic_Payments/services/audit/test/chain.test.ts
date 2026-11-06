import { test } from "node:test";
import assert from "node:assert/strict";
import { AuditChain, verifyChain, canonical, decodeMirrorMessages, GENESIS } from "../src/chain.ts";

const DEAL = "0x" + "aa".repeat(32);
const clock = () => "2026-11-06T10:00:00.000Z";

test("messages are numbered and each one commits to the previous hash", () => {
  const c = new AuditChain(clock);
  const m0 = c.next({ kind: "quote", dealId: DEAL, reason: "quoted 300000" });
  const m1 = c.next({ kind: "paid", dealId: DEAL, reason: "settled" });
  assert.equal(m0.seq, 0);
  assert.equal(m0.prevHash, GENESIS);
  assert.equal(m1.seq, 1);
  assert.equal(m1.prevHash, m0.hash);
});

test("an untouched chain verifies", () => {
  const c = new AuditChain(clock);
  const msgs = [c.next({ kind: "quote", reason: "a" }), c.next({ kind: "paid", reason: "b" }), c.next({ kind: "relayed", reason: "c" })];
  assert.deepEqual(verifyChain(msgs), { ok: true });
});

test("editing any past message is detected at that message", () => {
  const c = new AuditChain(clock);
  const msgs = [c.next({ kind: "quote", reason: "a" }), c.next({ kind: "paid", reason: "b" }), c.next({ kind: "relayed", reason: "c" })];
  const tampered = msgs.map((m, i) => (i === 1 ? { ...m, reason: "b (edited)" } : m));
  assert.deepEqual(verifyChain(tampered), { ok: false, brokenAt: 1, why: "hash mismatch" });
});

test("deleting a message breaks the chain", () => {
  const c = new AuditChain(clock);
  const msgs = [c.next({ kind: "quote", reason: "a" }), c.next({ kind: "paid", reason: "b" }), c.next({ kind: "relayed", reason: "c" })];
  const r = verifyChain([msgs[0], msgs[2]]);
  assert.equal(r.ok, false);
});

test("canonical JSON is key-order independent", () => {
  assert.equal(canonical({ b: 1, a: { d: 2, c: 3 } }), canonical({ a: { c: 3, d: 2 }, b: 1 }));
});

test("messages fit in one HCS chunk (≤ 1024 bytes); long reasons are trimmed", () => {
  const c = new AuditChain(clock);
  const m = c.next({ kind: "error", reason: "x".repeat(5000) });
  assert.ok(Buffer.byteLength(JSON.stringify(m)) <= 1024);
  assert.deepEqual(verifyChain([m]), { ok: true });
});

test("resuming from the last message continues the chain", () => {
  const c = new AuditChain(clock);
  const m0 = c.next({ kind: "quote", reason: "a" });
  const resumed = new AuditChain(clock, m0);
  const m1 = resumed.next({ kind: "paid", reason: "b" });
  assert.deepEqual(verifyChain([m0, m1]), { ok: true });
});

test("mirror node messages are base64-decoded back into audit messages", () => {
  const c = new AuditChain(clock);
  const m = c.next({ kind: "paid", reason: "ok" });
  const mirror = { messages: [{ sequence_number: 1, consensus_timestamp: "1762400000.000000001", message: Buffer.from(JSON.stringify(m)).toString("base64") }] };
  const [entry] = decodeMirrorMessages(mirror);
  assert.equal(entry.hash, m.hash);
  assert.equal(entry.topicSequence, 1);
  assert.equal(entry.consensusTimestamp, "1762400000.000000001");
});
