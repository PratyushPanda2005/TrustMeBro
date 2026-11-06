/** Glue: chain + sink + local tail file, so a restarted agent continues the same chain. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { HcsMessage } from "@tmb/shared";
import { AuditChain, type AuditInput } from "./chain.ts";
import type { AuditSink } from "./hcs.ts";

/**
 * Every message waits in an outbox until HCS accepts it. A failed submit stays at the head
 * and goes out before anything newer, so a network blip delays the log but never leaves a
 * gap that `audit verify` would report as a broken chain. Submits run one at a time, in seq
 * order, even when several deals write concurrently.
 */
export class AuditLog {
  private chain: AuditChain;
  private outbox: HcsMessage[];
  private outboxFile?: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(private sink: AuditSink, private tailFile?: string) {
    const last = tailFile && existsSync(tailFile) ? (JSON.parse(readFileSync(tailFile, "utf8")) as HcsMessage) : undefined;
    this.chain = new AuditChain(undefined, last);
    this.outboxFile = tailFile?.replace(/(\.json)?$/, "-outbox.json");
    this.outbox = this.outboxFile && existsSync(this.outboxFile) ? (JSON.parse(readFileSync(this.outboxFile, "utf8")) as HcsMessage[]) : [];
  }

  /** Messages built but not yet accepted by HCS. */
  pending(): number {
    return this.outbox.length;
  }

  async write(e: AuditInput): Promise<HcsMessage> {
    const m = this.chain.next(e);
    this.outbox.push(m);
    this.persist(m);
    // An audit outage must never move money or throw: flush() logs and keeps the message.
    await (this.queue = this.queue.then(() => this.flush()));
    return m;
  }

  /** Waits for every queued submit, then closes the sink's client. Call before a script exits. */
  async close() {
    await this.queue;
    this.sink.close?.();
  }

  private async flush() {
    while (this.outbox.length) {
      const head = this.outbox[0];
      try {
        await this.sink.submit(head);
      } catch (err) {
        console.error(`[audit] submit failed for #${head.seq}, kept for retry (${this.outbox.length} pending): ${(err as Error).message}`);
        return;
      }
      this.outbox.shift();
      this.persist();
    }
  }

  private persist(last?: HcsMessage) {
    if (!this.tailFile || !this.outboxFile) return;
    mkdirSync(dirname(this.tailFile), { recursive: true });
    if (last) writeFileSync(this.tailFile, JSON.stringify(last));
    writeFileSync(this.outboxFile, JSON.stringify(this.outbox));
  }
}

/** Local chain tail for one topic. A new AUDIT_TOPIC_ID gets a fresh chain from seq 0. */
export function auditTailFile(stateDir: string, topicId: string | undefined): string {
  return join(stateDir, `audit-tail-${topicId && /^0\.0\.\d+$/.test(topicId) ? topicId : "console"}.json`);
}
