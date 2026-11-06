/** Agent spend ledger + human-approval queue, persisted as JSON (bigints as strings). Plan v5 §9. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Deal ids are per contract: a redeployed TradeDeals (or lane C's local anvil after a restart)
 * starts again at deal 1. So a deal is (contract, dealId), with contract = "<chainId>:<TradeDeals>".
 * Records written before this have contract "" and only match each other.
 */
export const contractScope = (chainId: number, tradeDeals: string) => `${chainId}:${tradeDeals.toLowerCase()}`;

export interface PaymentRecord {
  /** contractScope(chainId, TradeDeals) this deal id belongs to. */
  contract?: string;
  dealId: string;
  /** 1 for the first paid check of a deal, 2–3 for rechecks while the contract says Pending. */
  checkNo: number;
  /** For the per-exporter daily cap ("" for records written before v5). */
  exporter: string;
  payTo: string;
  amount: bigint;
  at: number; // ms epoch
  hederaTxId?: string;
}

export interface ApprovalRecord {
  id: string;
  contract?: string;
  dealId: string;
  checkNo: number;
  payTo: string;
  amount: bigint;
  reason: string;
  status: "pending" | "approved" | "rejected";
  at: number;
}

const utcDay = (ms: number) => Math.floor(ms / 86_400_000);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const deal = (contract: string | undefined, dealId: string) => `${(contract ?? "").toLowerCase()}|${dealId.toLowerCase()}`;
const key = (contract: string | undefined, dealId: string, checkNo: number) => `${deal(contract, dealId)}:${checkNo}`;
/** v4 records carried a stage instead of a check number: they count as the deal's first check. */
const upgrade = (x: any) => ({ ...x, checkNo: x.checkNo ?? 1, exporter: x.exporter ?? "", amount: BigInt(x.amount) });

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
    this.payments = raw.payments.map(upgrade);
    this.approvals = raw.approvals.map(upgrade);
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

  alreadyPaid(dealId: string, checkNo: number, contract = ""): boolean {
    this.load();
    return this.payments.some((p) => key(p.contract, p.dealId, p.checkNo) === key(contract, dealId, checkNo));
  }

  checksPaid(dealId: string, contract = ""): number {
    this.load();
    return this.payments.filter((p) => deal(p.contract, p.dealId) === deal(contract, dealId)).length;
  }

  spentOnDeal(dealId: string, contract = ""): bigint {
    this.load();
    return this.payments.filter((p) => deal(p.contract, p.dealId) === deal(contract, dealId)).reduce((s, p) => s + p.amount, 0n);
  }

  spentOnDay(nowMs: number): bigint {
    this.load();
    const d = utcDay(nowMs);
    return this.payments.filter((p) => utcDay(p.at) === d).reduce((s, p) => s + p.amount, 0n);
  }

  exporterChecksOnDay(exporter: string, nowMs: number): number {
    this.load();
    const d = utcDay(nowMs);
    return this.payments.filter((p) => p.exporter && same(p.exporter, exporter) && utcDay(p.at) === d).length;
  }

  /** Returns the existing pending request for the same payment instead of duplicating it. */
  requestApproval(a: Omit<ApprovalRecord, "id" | "status">): string {
    this.load();
    const existing = this.approvals.find(
      (x) => x.status === "pending" && key(x.contract, x.dealId, x.checkNo) === key(a.contract, a.dealId, a.checkNo) && x.payTo === a.payTo && x.amount === a.amount,
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

  /** Latest decision for this exact payment (contract, deal, check, payTo, amount). */
  approvalFor(dealId: string, checkNo: number, payTo: string, amount: bigint, contract = ""): ApprovalRecord["status"] | undefined {
    this.load();
    const matches = this.approvals.filter(
      (x) => key(x.contract, x.dealId, x.checkNo) === key(contract, dealId, checkNo) && x.payTo === payTo && x.amount === amount,
    );
    return matches.at(-1)?.status;
  }

  listApprovals(): ApprovalRecord[] {
    this.load();
    return [...this.approvals];
  }
}
