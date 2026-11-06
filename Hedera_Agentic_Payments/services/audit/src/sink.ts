/**
 * Picks the HCS writer from env. Default: Hedera Agent Kit consensus tools.
 * AUDIT_SINK=sdk falls back to plain @hiero-ledger/sdk (the plan's time-box fallback).
 * No real topic or operator → console only (unit tests, first run before create-topic).
 */
import { AgentKitSink } from "./agentkit.ts";
import { ConsoleSink, HcsSink, type AuditSink } from "./hcs.ts";

type Env = Record<string, string | undefined>;
export type SinkKind = "agentkit" | "sdk" | "console";

export function sinkKind(env: Env): SinkKind {
  const mode = env.AUDIT_SINK ?? "agentkit";
  if (mode !== "agentkit" && mode !== "sdk") throw new Error(`AUDIT_SINK must be "agentkit" or "sdk", got "${mode}"`);
  const topicOk = /^0\.0\.\d+$/.test(env.AUDIT_TOPIC_ID ?? "");
  if (!topicOk || !env.AUDIT_OPERATOR_ID || !env.AUDIT_OPERATOR_KEY) return "console";
  return mode;
}

export function makeAuditSink(env: Env = process.env): { sink: AuditSink; kind: SinkKind } {
  const kind = sinkKind(env);
  if (kind === "console") return { sink: new ConsoleSink(), kind };
  const args = [env.AUDIT_TOPIC_ID!, env.AUDIT_OPERATOR_ID!, env.AUDIT_OPERATOR_KEY!] as const;
  return { sink: kind === "agentkit" ? new AgentKitSink(...args) : new HcsSink(...args), kind };
}
