/**
 * HCS sink. Plain @hiero-ledger/sdk, pinned to the version @x402/hedera uses so pnpm
 * installs a single copy. Hedera Agent Kit (HcsAuditTrailHook) can replace this
 * later behind the same AuditSink interface (90-minute time-box in the plan).
 */
import { Client, PrivateKey, TopicCreateTransaction, TopicMessageSubmitTransaction, TopicId } from "@hiero-ledger/sdk";
import type { HcsMessage } from "@tmb/shared";

export interface AuditSink {
  submit(m: HcsMessage): Promise<{ topicSequence?: number; hederaTxId?: string }>;
  /** Releases the Hedera client (open gRPC channels keep a script alive). */
  close?(): void;
}

export class ConsoleSink implements AuditSink {
  async submit(m: HcsMessage) {
    console.log(`[audit #${m.seq}] ${m.kind.padEnd(13)} ${m.reason}`);
    return {};
  }
}

export function operatorClient(operatorId: string, operatorKey: string) {
  return Client.forTestnet().setOperator(operatorId, PrivateKey.fromStringECDSA(operatorKey));
}

/** Creates a topic whose submit key is the operator key: only the agent can write. */
export async function createAuditTopic(operatorId: string, operatorKey: string, memo = "TrustMeBro agent spend audit") {
  const client = operatorClient(operatorId, operatorKey);
  const key = PrivateKey.fromStringECDSA(operatorKey);
  const tx = await new TopicCreateTransaction().setTopicMemo(memo).setSubmitKey(key.publicKey).execute(client);
  const receipt = await tx.getReceipt(client);
  client.close();
  return receipt.topicId!.toString();
}

export class HcsSink implements AuditSink {
  private client: Client;
  private key: PrivateKey;
  constructor(private topicId: string, operatorId: string, operatorKey: string) {
    this.client = operatorClient(operatorId, operatorKey);
    this.key = PrivateKey.fromStringECDSA(operatorKey);
  }
  async submit(m: HcsMessage) {
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(this.topicId))
      .setMessage(JSON.stringify(m))
      .freezeWith(this.client)
      .sign(this.key);
    const receipt = await (await tx.execute(this.client)).getReceipt(this.client);
    return { topicSequence: Number(receipt.topicSequenceNumber) };
  }
  close() {
    this.client.close();
  }
}
