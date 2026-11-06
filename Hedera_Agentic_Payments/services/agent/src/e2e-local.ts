/**
 * Full-loop e2e on lane C's real contracts and verifier (plan v5 §3–6), payments live on Hedera testnet.
 *   cd services/verifier && PAYMENTS=on VERIFIER_PAYTO=0.0.11331478 npm run local     (repo root, terminal 1)
 *   pnpm e2e:local                 # all cases    (terminal 2)
 *   pnpm e2e:local stuck           # one case
 *
 * Each case: a fresh exporter is KYC'd and onboarded at 50% → createDeal → importer approveDeal →
 * declareClaims 10,000 kg / LOADED (verifyWindow 60 s, the contract's minimum) → the agent's own code
 * path per check: getDeal + verifier() pre-checks → x402 payment on Hedera → signed answer checked →
 * submitVerification sent by the agent's relayer → the contract decides → rechecks on Pending
 * (the last one after verifyDeadline) → HCS record. Honest deals are then funded and repaid on
 * chain, so TrustRegistry credits the exporter at settlement.
 * Checked against the systems themselves: Mirror Node balance and topic, receipts, TrustRegistry.
 * Prints the Hedera, local-chain and HCS links per case; exits 1 if anything fails.
 */
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, keccak256, parseAbi, stringToHex, type Account, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DEAL_STATE, STATUS, hashscanTopic, hashscanTx, type HcsMessage } from "@tmb/shared";
import { AuditLog, auditTailFile, makeAuditSink, verifyChain } from "@tmb/audit";
import { nextCheckInSec, processClaim } from "./agent.ts";
import { buyVerification, type AuditEvent } from "./buy.ts";
import { stateName, type RelayOutcome } from "./chain.ts";
import { need } from "./config.ts";
import { LOCAL_CASES, judgeLocal, type LocalCaseName, type LocalRun } from "./e2e-local-cases.ts";
import { liveBuyDeps, verifierBase } from "./live.ts";
import { chargedSince, checkTopic, usdcBalance } from "./mirror.ts";
import { DEFAULT_LOCAL_DEPLOYMENT, chainTarget, deploymentScope } from "./target.ts";
import { tradeDealsAdapter, toClaimed } from "./whitechain.ts";

// lane C's full generated ABI (the reference) for the exporter/importer/investor side of the demo.
const { tradeDealsAbi } = await import(new URL("../../../../packages/shared/src/abi/tradeDeals.ts", import.meta.url).href);
const erc20 = parseAbi(["function approve(address spender, uint256 amount) returns (bool)", "function mint(address to, uint256 amount)"]);

const ROLE_EXPORTER = 1; // lane C's Role.Exporter
const USDT = 1_000_000n;
const VERIFY_WINDOW = 60; // TradeDeals.MIN_WINDOW: the stuck case's deadline comes after a minute
const RECHECK_SEC = 3;
const DEMO_TOKEN = process.env.DEMO_TOKEN ?? "local-demo-token";
const agentAccount = need("AGENT_HEDERA_ACCOUNT_ID");
const usdc = process.env.HEDERA_USDC_TOKEN_ID ?? "0.0.429274";
const topic = process.env.AUDIT_TOPIC_ID;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

const arg = process.argv[2];
const names = (arg ? [arg] : Object.keys(LOCAL_CASES)) as LocalCaseName[];
for (const n of names) if (!(n in LOCAL_CASES)) throw new Error(`unknown case ${n}; one of ${Object.keys(LOCAL_CASES).join(", ")}`);

// The agent's side: exactly what `CHAIN_ADAPTER=local pnpm agent` runs.
const target = chainTarget({ ...process.env, CHAIN_ADAPTER: "local" });
const dep = JSON.parse(readFileSync(process.env.LOCAL_DEPLOYMENT ?? DEFAULT_LOCAL_DEPLOYMENT, "utf8"));
const chain = tradeDealsAdapter(target);
const scope = await deploymentScope(target);
const { sink, kind } = makeAuditSink();
const audit = new AuditLog(sink, auditTailFile(join(process.cwd(), ".state"), topic));
const written: HcsMessage[] = [];
const auditWrite = async (e: AuditEvent) => {
  const m = await audit.write(e);
  written.push(m);
  console.log(`   [hcs #${m.seq}] ${m.kind.padEnd(13)} ${m.reason}`);
};
const buyDeps = liveBuyDeps(auditWrite, target, scope);
const deps = { chain, audit: auditWrite, expectedSigner: target.expectedSigner, buy: (req: any, ctx: any) => buyVerification(req, ctx, buyDeps) };

// The other parties, with lane C's anvil test keys.
const pub = createPublicClient({ transport: http(target.rpcUrl) });
const key = (name: string) => dep.wallets[name].privateKey as Hex;
const admin = privateKeyToAccount(key("admin"));
const importer = privateKeyToAccount(key("importer"));
const investor = privateKeyToAccount(key("investor"));
async function send(account: Account, address: Hex, abi: any, functionName: string, args: readonly unknown[]) {
  const { request } = await pub.simulateContract({ account, address, abi, functionName, args } as any);
  const wallet = createWalletClient({ account, chain: undefined, transport: http(target.rpcUrl) });
  const hash = await wallet.writeContract({ ...(request as any), chain: null });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${functionName} reverted`);
  return hash;
}
const deals = (fn: string, args: readonly unknown[], who: Account) => send(who, target.tradeDeals, tradeDealsAbi, fn, args);
const getDeal = (id: bigint) => pub.readContract({ address: target.tradeDeals, abi: tradeDealsAbi, functionName: "getDeal", args: [id] }) as Promise<any>;

/** A fresh exporter (KYC'd, gas) claims 10,000 kg / LOADED on a new deal. Returns the Claimed event. */
async function claimedDeal(containerNo: string) {
  const exporter = privateKeyToAccount(`0x${randomBytes(32).toString("hex")}`);
  await pub.request({ method: "anvil_setBalance" as any, params: [exporter.address, "0x8AC7230489E80000"] as any }); // 10 ETH
  await deals("setKyc", [exporter.address, ROLE_EXPORTER], admin);
  const now = (await pub.getBlock()).timestamp;
  const termsHash = keccak256(stringToHex("TrustMeBro T&C v1: pay to the TradeDeals contract"));
  await deals("createDeal", [100n * USDT, now + 3_600n, importer.address, keccak256(stringToHex(`invoice ${containerNo}`)), termsHash,
    { verifyWindow: VERIFY_WINDOW, listingWindow: 900, graceWindow: 300 }], exporter);
  const id = (await pub.readContract({ address: target.tradeDeals, abi: tradeDealsAbi, functionName: "dealCount" })) as bigint;
  await deals("approveDeal", [id, termsHash], importer);
  const claimTx = await deals("declareClaims", [id, 10_000, STATUS.LOADED, keccak256(stringToHex(`docs for ${containerNo}`)), containerNo, "BL-E2E"], exporter);
  const receipt = await pub.waitForTransactionReceipt({ hash: claimTx });
  const logs = await pub.getContractEvents({ address: target.tradeDeals, abi: tradeDealsAbi, eventName: "Claimed", fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber });
  return { id, exporter: exporter.address, claim: toClaimed((logs[0] as any).args), claimTx };
}

/** Investor funds the advance, importer pays in full → Settled (lane C's honest path). */
async function fundAndSettle(id: bigint) {
  const q: any = await pub.readContract({ address: target.tradeDeals, abi: tradeDealsAbi, functionName: "quote", args: [id] });
  await send(investor, dep.usdt, erc20, "approve", [target.tradeDeals, q.advance]);
  await deals("fund", [id, q.advance, q.yieldBps], investor);
  await send(importer, dep.usdt, erc20, "approve", [target.tradeDeals, 100n * USDT]);
  return deals("pay", [id, 100n * USDT], importer);
}

async function setScenario(containerNo: string, scenario: string) {
  const res = await fetch(`${verifierBase()}/demo/scenarios/${encodeURIComponent(containerNo)}`, {
    method: "PUT", headers: { "content-type": "application/json", "x-demo-token": DEMO_TOKEN }, body: JSON.stringify({ scenario }),
  });
  if (!res.ok) throw new Error(`lane C verifier /demo/scenarios ${res.status}: is \`npm run local\` running on ${verifierBase()}?`);
}

console.log(`TradeDeals ${target.tradeDeals} on chain ${target.chainId} (lane C local); verifier() ${await chain.verifier()}; relayer ${chain.relayer}`);
console.log(`audit: ${kind === "console" ? "console only (set AUDIT_TOPIC_ID)" : `${hashscanTopic(topic!)} via ${kind}`}`);

const rows: string[] = [];
let failed = 0;
for (const name of names) {
  const c = LOCAL_CASES[name];
  const containerNo = `TMBU${Date.now().toString().slice(-7)}`;
  await setScenario(containerNo, c.scenario);
  const { id, exporter, claim, claimTx } = await claimedDeal(containerNo);
  console.log(`\n▶ e2e:local:${name} (lane C scenario ${c.scenario}) deal ${id}, container ${containerNo}, new exporter ${exporter.slice(0, 10)}… at ${pct(await chain.trustBps(exporter))}`);
  console.log(`   [chain] declareClaims 10,000 kg / LOADED, verifyDeadline +${VERIFY_WINDOW}s: ${claimTx}`);
  const before = await usdcBalance(agentAccount, usdc);

  const run: LocalRun = { outcomes: [], state: "", mask: 0, charged: 0n, scoreBps: 0 };
  const hedera: string[] = [];
  const relays: string[] = [];
  for (let checkNo = 1; checkNo <= buyDeps.policy.maxChecksPerDeal; checkNo++) {
    const out = await processClaim(claim, checkNo, deps);
    if (!("txHash" in out)) {
      run.stopped = `${out.outcome}: ${out.reason}`;
      break;
    }
    run.outcomes.push(out.outcome as RelayOutcome);
    if (out.hederaTxId) hedera.push(out.hederaTxId);
    relays.push(out.txHash);
    console.log(`   [chain] submitVerification ${out.txHash}  events: ${out.events?.join(", ")}`);
    const wait = nextCheckInSec(out.outcome, checkNo, buyDeps.policy.maxChecksPerDeal, Math.floor(Date.now() / 1000), claim.verifyDeadline, RECHECK_SEC);
    if (wait === null) break;
    await auditWrite({ kind: "recheck", dealId: claim.dealId, reason: `status behind: check ${checkNo + 1} of ${buyDeps.policy.maxChecksPerDeal} in ${Math.ceil(wait)}s` });
    if (wait > RECHECK_SEC) console.log(`   … last check kept for after verifyDeadline: waiting ${Math.ceil(wait)}s`);
    await sleep(wait * 1000);
  }
  const deal = await getDeal(id);
  run.state = stateName(Number(deal.state));
  run.mask = Number(deal.falsifiedMask);
  run.scoreBps = await chain.trustBps(exporter);
  run.charged = await chargedSince(agentAccount, usdc, before, c.charge);
  if ("settledBps" in c && Number(deal.state) === DEAL_STATE.Verified) {
    const payTx = await fundAndSettle(id);
    run.settledBps = await chain.trustBps(exporter);
    console.log(`   [chain] investor funded, importer paid in full → ${stateName(Number((await getDeal(id)).state))}: ${payTx}; exporter ${pct(run.scoreBps)} → ${pct(run.settledBps)}`);
  }

  const { pass, why } = judgeLocal(c, run);
  if (!pass) failed++;
  console.log(`${pass ? "✅ PASS" : "❌ FAIL"} e2e:local:${name}: ${why}${hedera.map((t) => `\n   ${hashscanTx(t)}`).join("")}`);
  rows.push(`| ${name} | ${hedera.map((t) => `[\`${t}\`](${hashscanTx(t)})`).join("<br>") || "none"} | ${relays.map((h) => `\`${h.slice(0, 10)}…\``).join("<br>")} | ${pass ? "PASS" : "FAIL"}: ${why} |`);
}

if (kind !== "console") {
  const t = await checkTopic(topic!, written, verifyChain);
  if (!t.ok) failed++;
  console.log(`\n${t.ok ? "✅ PASS" : "❌ FAIL"} HCS: ${t.found}/${written.length} messages of this run on ${topic} (${t.total} total), chain ${t.chain.ok ? `intact${t.chain.duplicates ? `, ${t.chain.duplicates} exact resend(s) skipped` : ""}` : "broken"}\n   ${hashscanTopic(topic!)}`);
  rows.push(`| HCS audit | [\`${topic}\`](${hashscanTopic(topic!)}) | | ${t.ok ? "PASS" : "FAIL"}: ${t.found}/${written.length} messages via ${kind}, chain ${t.chain.ok ? "intact" : "broken"} |`);
}

console.log(`\n${failed ? `❌ ${failed} failed` : "✅ all passed"}. PROOFS.md rows:\n| Case | Hedera tx | submitVerification | Result |\n|---|---|---|---|\n${rows.join("\n")}`);
await audit.close();
process.exitCode = failed ? 1 : 0;
