/** Glue: chain + sink + local tail file, so a restarted agent continues the same chain. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { HcsMessage } from "@tmb/shared";
import { AuditChain, type AuditInput } from "./chain.ts";
import type { AuditSink } from "./hcs.ts";

export class AuditLog {
  private chain: AuditChain;
  constructor(private sink: AuditSink, private tailFile?: string) {
    const last = tailFile && existsSync(tailFile) ? (JSON.parse(readFileSync(tailFile, "utf8")) as HcsMessage) : undefined;
    this.chain = new AuditChain(undefined, last);
  }
  async write(e: AuditInput): Promise<HcsMessage> {
    const m = this.chain.next(e);
    if (this.tailFile) {
      mkdirSync(dirname(this.tailFile), { recursive: true });
      writeFileSync(this.tailFile, JSON.stringify(m));
    }
    try {
      await this.sink.submit(m);
    } catch (err) {
      // An audit outage must never move money; log locally and continue.
      console.error(`[audit] submit failed for #${m.seq}: ${(err as Error).message}`);
    }
    return m;
  }
}
