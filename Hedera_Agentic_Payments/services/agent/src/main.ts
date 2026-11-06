/**
 * The autonomous TrustMeBro agent (no human in the payment path).
 *   1. catch up on shipped deals, then watch ShipmentDeclared on Whitechain
 *   2. per shipment: spending gate → x402 payment on Hedera → signed check → relay to Whitechain
 *   3. every decision is written to the HCS audit topic
 *   4. over-cap prices wait for a human via the approvals API (dashboard button)
 * Run: pnpm agent   (CHAIN_ADAPTER=mock until lane C deploys; then whitechain)
 */
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { recoverVerificationSigner, verificationHash, fromJson } from "@tmb/shared/sign";
import { hashscanTopic, type Hex } from "@tmb/shared";
import { AuditLog, HcsSink, ConsoleSink } from "@tmb/audit";
import { buyVerification } from "./buy.ts";
import { processShipment } from "./agent.ts";
import { MockChainAdapter, type ChainAdapter, type ShipmentDeclared } from "./chain.ts";
import { WhitechainAdapter } from "./whitechain.ts";
import { SpendLedger } from "./ledger.ts";
import { makePayFetch } from "./payer.ts";
import { startApi } from "./api.ts";
import { loadPolicy, need, tradeDealsOrPlaceholder } from "./config.ts";

const STATE = join(process.cwd(), ".state");
const policy = loadPolicy();
const ledger = new SpendLedger(join(STATE, "ledger.json"));
const expectedSigner = privateKeyToAccount(need("VERIFIER_EVM_PRIVATE_KEY") as Hex).address;
const verifierUrl = (process.env.VERIFIER_URL ?? "http://localhost:4021") + "/verify";

const topic = process.env.AUDIT_TOPIC_ID;
const audit = new AuditLog(
  topic && process.env.AUDIT_OPERATOR_ID && process.env.AUDIT_OPERATOR_KEY
    ? new HcsSink(topic, process.env.AUDIT_OPERATOR_ID, process.env.AUDIT_OPERATOR_KEY)
    : new ConsoleSink(),
  join(STATE, "audit-tail.json"),
);

const chain: ChainAdapter = process.env.CHAIN_ADAPTER === "whitechain"
  ? new WhitechainAdapter(need("TRADE_DEALS_ADDRESS") as Hex, need("RELAYER_PRIVATE_KEY") as Hex, BigInt(process.env.WHITECHAIN_FROM_BLOCK ?? 0))
  : new MockChainAdapter(tradeDealsOrPlaceholder());

// Signs only the exact quote the spending gate approved (including human-approved over-cap prices).
const payFetch = makePayFetch({ accountId: need("AGENT_HEDERA_ACCOUNT_ID"), privateKey: need("AGENT_HEDERA_PRIVATE_KEY") });
const auditWrite = async (e: any) => { await audit.write(e); console.log(`[agent] ${e.kind.padEnd(13)} ${e.reason}`); };

const deps = {
  chain,
  audit: auditWrite,
  verificationHash: (r: any) => verificationHash(fromJson(r.verification)),
  buy: (req: any, stage: any) => buyVerification(req, stage, {
    url: verifierUrl, policy, ledger, now: Date.now, expectedSigner, fetch, payFetch,
    recoverSigner: recoverVerificationSigner, audit: auditWrite,
  }),
};

// One deal at a time per dealId (no double processing from catch-up + live events).
const inflight = new Set<string>();
const known = new Map<string, ShipmentDeclared>();
async function handle(e: ShipmentDeclared) {
  const id = e.dealId.toLowerCase();
  known.set(id, e);
  if (inflight.has(id)) return;
  inflight.add(id);
  try {
    const r = await processShipment(e, deps);
    console.log(`[agent] deal ${e.dealId.slice(0, 10)}… → ${r.outcome}`);
  } catch (err) {
    await auditWrite({ kind: "error", dealId: e.dealId, reason: `unexpected: ${(err as Error).message}` });
  } finally {
    inflight.delete(id);
  }
}

await startApi({
  port: Number(process.env.AGENT_API_PORT ?? 4002),
  ledger,
  token: process.env.AGENT_API_TOKEN,
  onApproved: async (a) => {
    await auditWrite({ kind: "approved", dealId: a.dealId, reason: `human approved ${a.amount} to ${a.payTo}` });
    // Retry the deal: the gate now sees the approval, and payFetch pins the approved amount.
    const e = known.get(a.dealId.toLowerCase());
    if (e) await handle(e);
    else console.log(`[agent] approval ${a.id}: deal ${a.dealId.slice(0, 10)}… not seen since start; it is retried when the shipment event arrives`);
  },
});

console.log(`TrustMeBro agent: adapter=${process.env.CHAIN_ADAPTER ?? "mock"} verifier=${verifierUrl} audit=${topic ? hashscanTopic(topic) : "console"}`);
for (const e of await chain.pendingShipments()) await handle(e);
chain.watchShipments((e) => void handle(e));

// Mock mode: emit a demo shipment so the full Hedera leg can be exercised before contracts exist.
if (chain instanceof MockChainAdapter && process.env.MOCK_DEMO_SHIPMENT !== "0") {
  const { randomBytes } = await import("node:crypto");
  chain.emit({ dealId: `0x${randomBytes(32).toString("hex")}`, exporter: "0x" + "22".repeat(20), claims: { weight: true, statusCode: true, documents: true }, containerNo: "MSKU1234567", blRef: "BL-DEMO-001" });
}
