/** pnpm --filter @tmb/audit verify → re-checks the whole audit chain straight from the Mirror Node. */
import "@tmb/shared/env";
import { HEDERA_MIRROR } from "@tmb/shared";
import { decodeMirrorMessages, verifyChain } from "./chain.ts";

const topic = process.env.AUDIT_TOPIC_ID;
if (!topic) throw new Error("set AUDIT_TOPIC_ID");

const entries = [];
let next: string | null = `/api/v1/topics/${topic}/messages?limit=100&order=asc`;
while (next) {
  const res = await fetch(HEDERA_MIRROR + next);
  if (!res.ok) throw new Error(`mirror node ${res.status}`);
  const body: any = await res.json();
  entries.push(...decodeMirrorMessages(body));
  next = body.links?.next ?? null;
}
const result = verifyChain(entries.map(({ topicSequence, consensusTimestamp, ...m }) => m));
console.log(`${entries.length} messages on ${topic}:`, result.ok ? "✅ chain intact" : `❌ broken at #${(result as any).brokenAt}: ${(result as any).why}`);
for (const e of entries) console.log(`#${e.seq} ${e.kind.padEnd(13)} ${e.payment?.hederaTxId ?? ""} ${e.reason}`);
process.exitCode = result.ok ? 0 : 1;
