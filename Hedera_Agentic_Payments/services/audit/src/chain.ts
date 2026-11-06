/**
 * Tamper-evident audit chain for HCS. Each message carries seq + prevHash, and
 * hash = sha256(canonical JSON of the message without `hash`). HCS adds its own
 * ordering and running hash on top; this inner chain lets anyone re-verify the
 * log from the Mirror Node alone (`pnpm --filter @tmb/audit verify`).
 */
import { createHash } from "node:crypto";
import type { HcsMessage, AgentLogEntry } from "@tmb/shared";

export const GENESIS = "0".repeat(64);
export const MAX_BYTES = 1024; // one HCS chunk
const MAX_REASON = 200;

export type AuditInput = Omit<HcsMessage, "v" | "seq" | "prevHash" | "ts" | "hash">;

export function canonical(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonical).join(",")}]`;
  if (x && typeof x === "object") {
    const entries = Object.entries(x as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(x);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const hashOf = (m: Omit<HcsMessage, "hash">) => sha256(canonical(m));

export class AuditChain {
  private seq: number;
  private prev: string;
  constructor(private clock: () => string = () => new Date().toISOString(), last?: HcsMessage) {
    this.seq = last ? last.seq + 1 : 0;
    this.prev = last ? last.hash : GENESIS;
  }

  next(input: AuditInput): HcsMessage {
    let reason = input.reason.slice(0, MAX_REASON);
    for (;;) {
      const body = { ...input, reason, v: 1 as const, seq: this.seq, prevHash: this.prev, ts: this.clock() };
      const msg: HcsMessage = { ...body, hash: hashOf(body) };
      if (Buffer.byteLength(JSON.stringify(msg)) <= MAX_BYTES || reason.length === 0) {
        this.seq += 1;
        this.prev = msg.hash;
        return msg;
      }
      reason = reason.slice(0, Math.max(0, reason.length - 50));
    }
  }
}

export type ChainCheck = { ok: true; duplicates: number } | { ok: false; brokenAt: number; why: string };

/**
 * Checks the hash chain. Delivery to HCS is at-least-once: when a submit times out or the SDK's own
 * retry gets DUPLICATE_TRANSACTION, the outbox can't tell whether the first attempt landed and resends.
 * An exact replay of the message just accepted (same seq, same hash) adds nothing and is skipped and
 * counted; any other difference (edit, gap, reorder, a different message at a used seq) still breaks it.
 */
export function verifyChain(messages: HcsMessage[]): ChainCheck {
  let prev = messages[0]?.prevHash ?? GENESIS;
  let expectSeq = messages[0]?.seq ?? 0;
  let duplicates = 0;
  for (let i = 0; i < messages.length; i++) {
    const { hash, ...body } = messages[i];
    if (hashOf(body) !== hash) return { ok: false, brokenAt: i, why: "hash mismatch" };
    if (i > 0 && hash === prev && body.seq === expectSeq - 1) {
      duplicates++;
      continue;
    }
    if (body.prevHash !== prev) return { ok: false, brokenAt: i, why: "prevHash does not match previous message" };
    if (body.seq !== expectSeq) return { ok: false, brokenAt: i, why: `expected seq ${expectSeq}, got ${body.seq}` };
    prev = hash;
    expectSeq += 1;
  }
  return { ok: true, duplicates };
}

/** Mirror Node GET /api/v1/topics/{id}/messages → decoded entries for the dashboard. */
export function decodeMirrorMessages(body: { messages: { sequence_number: number; consensus_timestamp: string; message: string }[] }): AgentLogEntry[] {
  return body.messages.map((m) => ({
    ...(JSON.parse(Buffer.from(m.message, "base64").toString("utf8")) as HcsMessage),
    topicSequence: m.sequence_number,
    consensusTimestamp: m.consensus_timestamp,
  }));
}
