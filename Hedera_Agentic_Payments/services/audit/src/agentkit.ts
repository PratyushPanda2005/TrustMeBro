/**
 * HCS audit through Hedera Agent Kit v4 consensus tools, run from code (no LLM).
 * The kit uses the same @hiero-ledger/sdk copy as @x402/hedera (peer dependency), so there is
 * still one SDK in the process.
 *
 * Least privilege: the kit instance gets two tools only, create_topic and submit_topic_message.
 * It has no transfer tools, so this code path cannot move money.
 *
 * The kit's HcsAuditTrailHook is deliberately not attached: it logs Agent Kit tool calls, while
 * the agent's payments go through the x402 client, not kit tools. On our topic it would also write
 * unchained messages and break `audit verify`. Our own hash-chained messages are what the kit submits.
 */
import { Client, PrivateKey } from "@hiero-ledger/sdk";
import { AgentMode, HederaAgentAPI } from "@hashgraph/hedera-agent-kit";
import { createTopicTool, submitTopicMessageTool } from "@hashgraph/hedera-agent-kit/plugins";
import type { HcsMessage } from "@tmb/shared";
import type { AuditSink } from "./hcs.ts";

export const KIT_TOOLS = { create: "create_topic_tool", submit: "submit_topic_message_tool" } as const;

/**
 * Reads a kit tool result. The kit catches tool errors and returns { raw: { status: "ERROR" } }
 * instead of throwing, so anything but SUCCESS becomes a throw here: the audit outbox then keeps
 * the message for retry instead of believing it was sent.
 */
export function kitResult(output: string): { transactionId: string; topicId?: string } {
  let raw: { status?: string; error?: string; transactionId?: string; topicId?: unknown };
  try {
    raw = JSON.parse(output).raw ?? {};
  } catch {
    throw new Error(`Agent Kit returned an unreadable result: ${output.slice(0, 120)}`);
  }
  if (raw.status !== "SUCCESS") throw new Error(`Agent Kit tool failed: ${raw.error ?? raw.status ?? "no status"}`);
  const t = raw.topicId as { shard?: unknown; realm?: unknown; num?: unknown } | string | undefined;
  const topicId = typeof t === "string" ? t : t && t.num !== undefined ? `${part(t.shard)}.${part(t.realm)}.${part(t.num)}` : undefined;
  return { transactionId: raw.transactionId ?? "", topicId };
}

/** A receipt's TopicId serialises its parts as protobuf Longs ({ low, high }) or plain numbers. */
function part(v: unknown): string {
  if (v === undefined || v === null) return "0";
  if (typeof v === "object" && "low" in v) {
    const { low, high } = v as { low: number; high: number };
    return ((BigInt(high >>> 0) << 32n) | BigInt(low >>> 0)).toString();
  }
  return String(v);
}

export function auditKit(operatorId: string, operatorKey: string) {
  const client = Client.forTestnet().setOperator(operatorId, PrivateKey.fromStringECDSA(operatorKey));
  const context = { accountId: operatorId, mode: AgentMode.AUTONOMOUS };
  const api = new HederaAgentAPI(client, context, [createTopicTool(context), submitTopicMessageTool(context)]);
  return { api, close: () => client.close() };
}

/** Creates the audit topic with the kit; submitKey: true = the operator key, so only the agent can write. */
export async function createAuditTopicWithKit(operatorId: string, operatorKey: string, memo = "TrustMeBro agent spend audit") {
  const kit = auditKit(operatorId, operatorKey);
  try {
    const r = kitResult(await kit.api.run(KIT_TOOLS.create, { topicMemo: memo, submitKey: true }));
    if (!r.topicId) throw new Error("Agent Kit created a topic but returned no topic id");
    return r;
  } finally {
    kit.close();
  }
}

export class AgentKitSink implements AuditSink {
  private kit: ReturnType<typeof auditKit>;
  constructor(private topicId: string, operatorId: string, operatorKey: string) {
    this.kit = auditKit(operatorId, operatorKey);
  }
  async submit(m: HcsMessage) {
    const r = kitResult(await this.kit.api.run(KIT_TOOLS.submit, { topicId: this.topicId, message: JSON.stringify(m) }));
    return { hederaTxId: r.transactionId };
  }
  close() {
    this.kit.close();
  }
}
