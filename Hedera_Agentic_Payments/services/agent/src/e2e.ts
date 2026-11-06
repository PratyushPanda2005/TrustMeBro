/**
 * Hedera e2e: the agent's full autonomous flow per plan v5 §3 steps 4–6, live on Hedera testnet.
 *   pnpm verifier                         (terminal 1)
 *   pnpm e2e               # all cases    (terminal 2)
 *   pnpm e2e short-weight  # one case
 *
 * Each case: a fresh exporter declares the demo claim (10,000 kg / LOADED / docHash A) → the agent
 * buys POST /verify over x402 with only {dealId, shipmentRef} (spending gate, pinned payment) →
 * relays to the mock TradeDeals, which judges like lane C's contract → Pending is rechecked as the
 * next check → every step goes to the HCS audit topic through Hedera Agent Kit.
 * Checked against Hedera itself: the agent's USDC balance and the topic messages on the Mirror
 * Node. Prints PASS/FAIL and PROOFS.md rows; exits 1 if anything fails.
 */
import { join } from "node:path";
import { HEDERA_MIRROR, hashscanTopic, hashscanTx, type HcsMessage } from "@tmb/shared";
import { AuditLog, auditTailFile, decodeMirrorMessages, makeAuditSink, verifyChain } from "@tmb/audit";
import { nextCheckInSec, processClaim } from "./agent.ts";
import { buyVerification, type AuditEvent } from "./buy.ts";
import { MockChainAdapter, type RelayOutcome } from "./chain.ts";
import { need, tradeDealsOrPlaceholder } from "./config.ts";
import { E2E_CASES, judge, type E2EName, type E2ERun } from "./e2e-cases.ts";
import { demoClaim, liveBuyDeps, verifierBase } from "./live.ts";

const agent = need("AGENT_HEDERA_ACCOUNT_ID");
const usdc = process.env.HEDERA_USDC_TOKEN_ID ?? "0.0.429274";
const adminToken = process.env.VERIFIER_ADMIN_TOKEN ?? "dev-admin";
const topic = process.env.AUDIT_TOPIC_ID;
const RECHECK_WAIT_MS = 2_500; // the recheck's observedAt must be newer than the last one (seconds)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mirror<T>(path: string): Promise<T> {
  const res = await fetch(HEDERA_MIRROR + path);
  if (!res.ok) throw new Error(`mirror node ${res.status} for ${path}`);
  return (await res.json()) as T;
}

async function balance(): Promise<bigint> {
  const body = await mirror<{ tokens: { balance: number }[] }>(`/api/v1/accounts/${agent}/tokens?token.id=${usdc}`);
  return BigInt(body.tokens[0]?.balance ?? 0);
}

/** Mirror Node lags consensus by a few seconds: wait for the expected change, or settle on what is there. */
async function chargedSince(before: bigint, expected: bigint): Promise<bigint> {
  const deadline = Date.now() + (expected > 0n ? 30_000 : 10_000);
  let charged = before - (await balance());
  while (charged !== expected && Date.now() < deadline) {
    await sleep(2000);
    charged = before - (await balance());
  }
  return charged;
}

async function setScenario(scenario: string, dealId: string) {
  const res = await fetch(`${verifierBase()}/admin/scenario`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-token": adminToken },
    body: JSON.stringify({ scenario, dealId }),
  });
  if (!res.ok) throw new Error(`verifier /admin/scenario ${res.status} (is the verifier running with this VERIFIER_ADMIN_TOKEN?)`);
}

/** All messages on the topic, oldest first. */
async function topicMessages(): Promise<HcsMessage[]> {
  const out: HcsMessage[] = [];
  let next: string | null = `/api/v1/topics/${topic}/messages?limit=100&order=asc`;
  while (next) {
    const body: any = await mirror(next);
    out.push(...decodeMirrorMessages(body).map(({ topicSequence, consensusTimestamp, ...m }) => m as HcsMessage));
    next = body.links?.next ?? null;
  }
  return out;
}

const arg = process.argv[2];
const names = (arg ? [arg] : Object.keys(E2E_CASES)) as E2EName[];
for (const n of names) if (!(n in E2E_CASES)) throw new Error(`unknown case ${n}; one of ${Object.keys(E2E_CASES).join(", ")}`);

const { sink, kind } = makeAuditSink();
const audit = new AuditLog(sink, auditTailFile(join(process.cwd(), ".state"), topic));
const written: HcsMessage[] = [];
const auditWrite = async (e: AuditEvent) => {
  const m = await audit.write(e);
  written.push(m);
  console.log(`   [hcs #${m.seq}] ${m.kind.padEnd(13)} ${m.reason}`);
};
const buyDeps = liveBuyDeps(auditWrite);
const chain = new MockChainAdapter(tradeDealsOrPlaceholder());
const maxChecks = buyDeps.policy.maxChecksPerDeal;
console.log(`audit: ${kind === "console" ? "console only (set AUDIT_TOPIC_ID)" : `${hashscanTopic(topic!)} via ${kind}`}  ·  TradeDeals: mock (${chain.tradeDeals})`);

const rows: string[] = [];
let failed = 0;
for (const name of names) {
  const c: (typeof E2E_CASES)[E2EName] = E2E_CASES[name];
  const claim = demoClaim("declaredKg" in c ? { declaredKg: c.declaredKg } : {});
  console.log(`\n▶ e2e:${name} (scenario ${c.scenario}; claim ${claim.declaredKg} kg / LOADED / hash A; deal ${claim.dealId.slice(-6)}; new exporter ${claim.exporter.slice(0, 8)}… at 50.00%)`);
  await setScenario(c.scenario, claim.dealId);
  chain.emit(claim); // the exporter's declareClaims (plan v5 §3 step 4)
  await sleep(1_100); // observedAt must be strictly after claimTime (whole seconds)
  const before = await balance();

  const run: E2ERun = { outcomes: [], charged: 0n, scoreBps: 0 };
  const txs: string[] = [];
  for (let checkNo = 1; checkNo <= maxChecks; checkNo++) {
    const out = await processClaim(claim, checkNo, { chain, audit: auditWrite, expectedSigner: buyDeps.expectedSigner, buy: (req, ctx) => buyVerification(req, ctx, buyDeps) });
    if (out.outcome === "relay_failed" || !["verified", "pending", "rejected", "mismatch"].includes(out.outcome)) {
      run.stopped = out.outcome;
      // A held payment must not stay in the dashboard queue after the run.
      const held = buyDeps.ledger.listApprovals().find((a) => a.status === "pending" && a.dealId.toLowerCase() === claim.dealId.toLowerCase());
      if (held) buyDeps.ledger.decide(held.id, "rejected");
      break;
    }
    run.outcomes.push(out.outcome as RelayOutcome);
    if ("hederaTxId" in out && out.hederaTxId) txs.push(out.hederaTxId);
    const wait = nextCheckInSec(out.outcome, checkNo, maxChecks, Math.floor(Date.now() / 1000), claim.verifyDeadline, RECHECK_WAIT_MS / 1000);
    if (wait === null) break;
    await auditWrite({ kind: "recheck", dealId: claim.dealId, reason: `status behind: check ${checkNo + 1} of ${maxChecks} in ${Math.ceil(wait)}s` });
    await sleep(wait * 1000);
  }
  run.charged = await chargedSince(before, c.charge);
  run.scoreBps = chain.exporterScoreBps(claim.exporter);
  if (run.outcomes.at(-1) === "verified" && "settledBps" in c) {
    run.settledBps = chain.settle(claim.dealId).afterBps; // mock: importer pays in full → Settled → +r
    console.log(`   [mock chain] importer paid, deal Settled → exporter ${(run.scoreBps / 100).toFixed(2)}% → ${(run.settledBps / 100).toFixed(2)}%`);
  }

  const { pass, why } = judge(c, run);
  if (!pass) failed++;
  console.log(`${pass ? "✅ PASS" : "❌ FAIL"} e2e:${name}: ${why}${txs.map((t) => `\n   ${hashscanTx(t)}`).join("")}`);
  rows.push(`| e2e:${name} | ${txs.length ? txs.map((t) => `[\`${t}\`](${hashscanTx(t)})`).join("<br>") : "none"} | ${pass ? "PASS" : "FAIL"}: ${why} |`);
}

// Check the audit trail on Hedera itself: every message this run wrote is on the topic, chain intact.
if (kind !== "console") {
  let onTopic: HcsMessage[] = [];
  const deadline = Date.now() + 30_000;
  const want = new Set(written.map((m) => m.hash));
  while (Date.now() < deadline) {
    onTopic = await topicMessages();
    if (written.every((m) => onTopic.some((t) => t.hash === m.hash))) break;
    await sleep(3000);
  }
  const found = onTopic.filter((t) => want.has(t.hash)).length;
  const chainCheck = verifyChain(onTopic);
  const ok = found === written.length && chainCheck.ok;
  if (!ok) failed++;
  console.log(`\n${ok ? "✅ PASS" : "❌ FAIL"} HCS: ${found}/${written.length} messages of this run on ${topic} (${onTopic.length} total), chain ${chainCheck.ok ? "intact" : `broken at #${(chainCheck as any).brokenAt}`}\n   ${hashscanTopic(topic!)}`);
  rows.push(`| HCS audit | [\`${topic}\`](${hashscanTopic(topic!)}) | ${ok ? "PASS" : "FAIL"}: ${found}/${written.length} messages on the topic via ${kind}, chain ${chainCheck.ok ? "intact" : "broken"} |`);
}

console.log(`\n${failed ? "❌" : "✅"} ${failed ? `${failed} failed` : "all passed"}. PROOFS.md rows:\n| Case | Hedera tx | Result |\n|---|---|---|\n${rows.join("\n")}`);
await audit.close(); // flushes the outbox, then closes the Agent Kit client so the script exits
process.exitCode = failed ? 1 : 0;
