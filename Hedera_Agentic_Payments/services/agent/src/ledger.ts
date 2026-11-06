/** Agent spend ledger + human-approval queue, persisted as JSON (bigints as strings). */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export type Stage = "departure" | "arrival";

export interface PaymentRecord {
  dealId: string;
  stage: Stage;
  payTo: string;
  amount: bigint;
  at: number; // ms epoch
  hederaTxId?: string;
}

export interface ApprovalRecord {
  id: string;
  dealId: string;
  stage: Stage;
  payTo: string;
  amount: bigint;
  reason: string;
  status: "pending" | "approved" | "rejected";
  at: number;
}

const utcDay = (ms: number) => Math.floor(ms / 86_400_000);
const key = (dealId: string, stage: Stage) => `${dealId.toLowerCase()}:${stage}`;

export class SpendLedger {
  private payments: PaymentRecord[] = [];
  private approvals: ApprovalRecord[] = [];

  constructor(private file?: string) {
    this.load();
  }

  /**
   * Re-reads the file before every read and change. Several processes can share one ledger
   * (pnpm agent + agent:once); without this the last writer drops the other process's payments
   * and the per-deal / daily caps undercount. Sync read then write, so the race window is tiny.
   */
  private load() {
    if (!this.file || !existsSync(this.file)) return;
    const raw = JSON.parse(readFileSync(this.file, "utf8"));
    this.payments = raw.payments.map((p: any) => ({ ...p, amount: BigInt(p.amount) }));
    this.approvals = raw.approvals.map((a: any) => ({ ...a, amount: BigInt(a.amount) }));
  }

  private save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const ser = (x: any) => ({ ...x, amount: x.amount.toString() });
    writeFileSync(this.file, JSON.stringify({ payments: this.payments.map(ser), approvals: this.approvals.map(ser) }, null, 2));
  }

  recordPayment(p: PaymentRecord) {
    this.load();
    this.payments.push(p);
    this.save();
  }

  alreadyPaid(dealId: string, stage: Stage): boolean {
    this.load();
    return this.payments.some((p) => key(p.dealId, p.stage) === key(dealId, stage));
  }

  spentOnDeal(dealId: string): bigint {
    this.load();
    return this.payments.filter((p) => p.dealId.toLowerCase() === dealId.toLowerCase()).reduce((s, p) => s + p.amount, 0n);
  }

  spentOnDay(nowMs: number): bigint {
    this.load();
    const d = utcDay(nowMs);
    return this.payments.filter((p) => utcDay(p.at) === d).reduce((s, p) => s + p.amount, 0n);
  }

  /** Returns the existing pending request for the same payment instead of duplicating it. */
  requestApproval(a: Omit<ApprovalRecord, "id" | "status">): string {
    this.load();
    const existing = this.approvals.find(
      (x) => x.status === "pending" && key(x.dealId, x.stage) === key(a.dealId, a.stage) && x.payTo === a.payTo && x.amount === a.amount,
    );
    if (existing) return existing.id;
    const id = randomUUID();
    this.approvals.push({ ...a, id, status: "pending" });
    this.save();
    return id;
  }

  decide(id: string, status: "approved" | "rejected") {
    this.load();
    const a = this.approvals.find((x) => x.id === id);
    if (!a) throw new Error(`no approval ${id}`);
    if (a.status !== "pending") throw new Error(`approval ${id} already ${a.status}`);
    a.status = status;
    this.save();
  }

  /** Latest decision for this exact payment (deal, stage, payTo, amount). */
  approvalFor(dealId: string, stage: Stage, payTo: string, amount: bigint): ApprovalRecord["status"] | undefined {
    this.load();
    const matches = this.approvals.filter(
      (x) => key(x.dealId, x.stage) === key(dealId, stage) && x.payTo === payTo && x.amount === amount,
    );
    return matches.at(-1)?.status;
  }

  listApprovals(): ApprovalRecord[] {
    this.load();
    return [...this.approvals];
  }
}
