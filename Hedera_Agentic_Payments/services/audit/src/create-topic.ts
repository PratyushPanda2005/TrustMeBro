/**
 * pnpm --filter @tmb/audit create-topic → prints AUDIT_TOPIC_ID for .env and docs/PROOFS.md
 * Created through Hedera Agent Kit (create_topic_tool, submit key = operator key).
 * AUDIT_SINK=sdk uses plain @hiero-ledger/sdk instead.
 */
import "@tmb/shared/env";
import { hashscanTopic, hashscanTx } from "@tmb/shared";
import { createAuditTopic } from "./hcs.ts";
import { createAuditTopicWithKit } from "./agentkit.ts";

const id = process.env.AUDIT_OPERATOR_ID, key = process.env.AUDIT_OPERATOR_KEY;
if (!id || !key) throw new Error("set AUDIT_OPERATOR_ID and AUDIT_OPERATOR_KEY");

if (process.env.AUDIT_SINK === "sdk") {
  const topic = await createAuditTopic(id, key);
  console.log(`AUDIT_TOPIC_ID=${topic}\n${hashscanTopic(topic)}`);
} else {
  const { topicId, transactionId } = await createAuditTopicWithKit(id, key);
  console.log(`AUDIT_TOPIC_ID=${topicId}\n${hashscanTopic(topicId!)}\ncreated by Agent Kit in ${hashscanTx(transactionId)}`);
}
