/** pnpm --filter @tmb/audit create-topic → prints AUDIT_TOPIC_ID for .env and docs/PROOFS.md */
import "@tmb/shared/env";
import { hashscanTopic } from "@tmb/shared";
import { createAuditTopic } from "./hcs.ts";

const id = process.env.AUDIT_OPERATOR_ID, key = process.env.AUDIT_OPERATOR_KEY;
if (!id || !key) throw new Error("set AUDIT_OPERATOR_ID and AUDIT_OPERATOR_KEY");
const topic = await createAuditTopic(id, key);
console.log(`AUDIT_TOPIC_ID=${topic}\n${hashscanTopic(topic)}`);
