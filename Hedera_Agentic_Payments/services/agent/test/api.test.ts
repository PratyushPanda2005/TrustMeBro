import { test } from "node:test";
import assert from "node:assert/strict";
import { startApi } from "../src/api.ts";
import { SpendLedger } from "../src/ledger.ts";

const DEAL = "0x" + "aa".repeat(32);

async function setup(token?: string) {
  const ledger = new SpendLedger();
  const approved: string[] = [];
  const id = ledger.requestApproval({ dealId: DEAL, stage: "departure", payTo: "0.0.5005", amount: 5_000_000n, reason: "above cap", at: 0 });
  const server = await startApi({ port: 0, ledger, token, onApproved: async (a) => { approved.push(a.id); } });
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  return { ledger, id, server, base, approved };
}

test("lists approvals with amounts as strings (JSON-safe)", async () => {
  const s = await setup();
  const body: any = await (await fetch(`${s.base}/approvals`)).json();
  assert.equal(body.approvals[0].amount, "5000000");
  assert.equal(body.approvals[0].status, "pending");
  s.server.close();
});

test("approve marks it approved and asks the agent to retry that payment", async () => {
  const s = await setup();
  const res = await fetch(`${s.base}/approvals/${s.id}/approve`, { method: "POST" });
  assert.equal(res.status, 200);
  assert.equal(s.ledger.approvalFor(DEAL, "departure", "0.0.5005", 5_000_000n), "approved");
  assert.deepEqual(s.approved, [s.id]);
  s.server.close();
});

test("reject marks it rejected and does not retry", async () => {
  const s = await setup();
  await fetch(`${s.base}/approvals/${s.id}/reject`, { method: "POST" });
  assert.equal(s.ledger.approvalFor(DEAL, "departure", "0.0.5005", 5_000_000n), "rejected");
  assert.deepEqual(s.approved, []);
  s.server.close();
});

test("deciding twice → 409; unknown id → 404", async () => {
  const s = await setup();
  await fetch(`${s.base}/approvals/${s.id}/approve`, { method: "POST" });
  assert.equal((await fetch(`${s.base}/approvals/${s.id}/reject`, { method: "POST" })).status, 409);
  assert.equal((await fetch(`${s.base}/approvals/nope/approve`, { method: "POST" })).status, 404);
  s.server.close();
});

test("with a token configured, decisions need the bearer token", async () => {
  const s = await setup("secret");
  assert.equal((await fetch(`${s.base}/approvals/${s.id}/approve`, { method: "POST" })).status, 401);
  const ok = await fetch(`${s.base}/approvals/${s.id}/approve`, { method: "POST", headers: { authorization: "Bearer secret" } });
  assert.equal(ok.status, 200);
  s.server.close();
});
