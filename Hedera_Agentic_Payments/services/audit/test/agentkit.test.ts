import { test } from "node:test";
import assert from "node:assert/strict";
import { kitResult, KIT_TOOLS } from "../src/agentkit.ts";

const out = (raw: unknown) => JSON.stringify({ raw, humanMessage: "x" });

test("a successful Agent Kit tool run yields its Hedera tx id (and topic id for create)", () => {
  assert.deepEqual(kitResult(out({ status: "SUCCESS", transactionId: "0.0.11331562@1793947000.000000001" })), {
    transactionId: "0.0.11331562@1793947000.000000001",
    topicId: undefined,
  });
  // receipt.topicId serialises as an object, not a string
  assert.equal(kitResult(out({ status: "SUCCESS", transactionId: "t", topicId: { shard: 0, realm: 0, num: 11334995 } })).topicId, "0.0.11334995");
  assert.equal(kitResult(out({ status: "SUCCESS", transactionId: "t", topicId: "0.0.42" })).topicId, "0.0.42");
});

test("Agent Kit swallows tool errors into raw.status=ERROR: that must throw, so the audit outbox keeps the message", () => {
  assert.throws(() => kitResult(out({ status: "ERROR", error: "Failed to execute Submit Topic Message: INVALID_SIGNATURE" })), /INVALID_SIGNATURE/);
  assert.throws(() => kitResult(out({ status: "TOPIC_EXPIRED", transactionId: "t" })), /TOPIC_EXPIRED/);
  assert.throws(() => kitResult("not json"), /unreadable/);
});

test("the audit kit exposes only the consensus tools it needs (least privilege)", () => {
  assert.deepEqual(Object.values(KIT_TOOLS).sort(), ["create_topic_tool", "submit_topic_message_tool"]);
});

test("sink choice: Agent Kit by default, plain SDK as the fallback, console without a topic", async () => {
  const { sinkKind } = await import("../src/sink.ts");
  const full = { AUDIT_TOPIC_ID: "0.0.1", AUDIT_OPERATOR_ID: "0.0.2", AUDIT_OPERATOR_KEY: "0xkey" };
  assert.equal(sinkKind(full), "agentkit");
  assert.equal(sinkKind({ ...full, AUDIT_SINK: "sdk" }), "sdk");
  assert.equal(sinkKind({ ...full, AUDIT_SINK: "agentkit" }), "agentkit");
  assert.equal(sinkKind({ ...full, AUDIT_TOPIC_ID: "0.0.xxxxxxx" }), "console");
  assert.equal(sinkKind({ AUDIT_TOPIC_ID: "0.0.1" }), "console");
  assert.throws(() => sinkKind({ ...full, AUDIT_SINK: "langchain" }), /AUDIT_SINK/);
});

test("topic id parts that arrive as protobuf Longs ({low, high}) are read as numbers", () => {
  const L = (n: number) => ({ low: n, high: 0, unsigned: false });
  const r = kitResult(out({ status: "SUCCESS", transactionId: "t", topicId: { shard: L(0), realm: L(0), num: L(11336190) } }));
  assert.equal(r.topicId, "0.0.11336190");
});
