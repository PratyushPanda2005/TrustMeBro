/**
 * Hedera-only e2e runs against the live verifier (B7, the part that needs no Whitechain):
 *   pnpm verifier                      (terminal 1)
 *   pnpm e2e            # all cases    (terminal 2)
 *   pnpm e2e overcharge # one case
 * Each case uses a fresh dealId, switches the verifier scenario for that deal only, buys,
 * and checks the agent's real USDC balance on the Mirror Node. Prints PASS/FAIL and
 * PROOFS.md rows; exits 1 if any case fails.
 */
import { HEDERA_MIRROR, hashscanTx } from "@tmb/shared";
import { buyVerification } from "./buy.ts";
import { need } from "./config.ts";
import { E2E_CASES, judge, type E2EName } from "./e2e-cases.ts";
import { demoRequest, liveBuyDeps, verifierBase } from "./live.ts";

const agent = need("AGENT_HEDERA_ACCOUNT_ID");
const usdc = process.env.HEDERA_USDC_TOKEN_ID ?? "0.0.429274";
const adminToken = process.env.VERIFIER_ADMIN_TOKEN ?? "dev-admin";

async function balance(): Promise<bigint> {
  const res = await fetch(`${HEDERA_MIRROR}/api/v1/accounts/${agent}/tokens?token.id=${usdc}`);
  if (!res.ok) throw new Error(`mirror node ${res.status}`);
  const body = (await res.json()) as { tokens: { balance: number }[] };
  return BigInt(body.tokens[0]?.balance ?? 0);
}

/** Mirror Node lags consensus by a few seconds: wait for the expected change, or settle on what is there. */
async function chargedSince(before: bigint, expected: bigint): Promise<bigint> {
  const deadline = Date.now() + (expected > 0n ? 30_000 : 10_000);
  let charged = before - (await balance());
  while (charged !== expected && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
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

const arg = process.argv[2];
const names = (arg ? [arg] : Object.keys(E2E_CASES)) as E2EName[];
for (const n of names) if (!(n in E2E_CASES)) throw new Error(`unknown case ${n}; one of ${Object.keys(E2E_CASES).join(", ")}`);

const deps = liveBuyDeps(async (e) => console.log(`   [audit] ${e.kind.padEnd(13)} ${e.reason}`));
const rows: string[] = [];
let failed = 0;
for (const name of names) {
  const c = E2E_CASES[name];
  const req = demoRequest();
  console.log(`\n▶ e2e:${name} (scenario ${c.scenario}, deal ${req.dealId.slice(0, 10)}…)`);
  await setScenario(c.scenario, req.dealId);
  const before = await balance();
  const r = await buyVerification(req, "departure", deps);
  // A held payment must not stay in the dashboard queue after the run.
  if (r.status === "pending_human" && r.approvalId) deps.ledger.decide(r.approvalId, "rejected");
  const charged = await chargedSince(before, c.charge);
  const { pass, why } = judge(c, r, charged);
  if (!pass) failed++;
  const tx = r.settlement?.txId;
  console.log(`${pass ? "✅ PASS" : "❌ FAIL"} e2e:${name}: ${why}${tx ? `\n   ${hashscanTx(tx)}` : ""}`);
  rows.push(`| e2e:${name} | ${tx ? `[\`${tx}\`](${hashscanTx(tx)})` : "none"} | ${pass ? "PASS" : "FAIL"}: ${why} |`);
}

console.log(`\n${names.length - failed}/${names.length} passed. PROOFS.md rows:\n| Case | Hedera tx | Result |\n|---|---|---|\n${rows.join("\n")}`);
process.exitCode = failed ? 1 : 0;
