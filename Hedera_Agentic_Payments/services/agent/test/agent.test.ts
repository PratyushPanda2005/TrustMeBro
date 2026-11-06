import { test } from "node:test";
import assert from "node:assert/strict";
import { processShipment } from "../src/agent.ts";
import { MockChainAdapter } from "../src/chain.ts";

const DEAL = "0x" + "aa".repeat(32);
const ALL = { weight: true, statusCode: true, documents: true };
const ev = (claims = ALL) => ({ dealId: DEAL, exporter: "0x" + "22".repeat(20), claims, containerNo: "MSKU1", blRef: "BL1" });

function verified(observed = ALL) {
  return async () => ({
    status: "verified" as const,
    settlement: { success: true, txId: "0.0.7162784@1.2", hashscan: "x" },
    response: {
      verification: { dealId: DEAL, ...observed, nonce: "1", expiry: "9999999999" },
      signature: "0x" + "cd".repeat(65), signer: "0x" + "99".repeat(20), chainId: 1874 as const, verifyingContract: "0x" + "11".repeat(20),
    },
  });
}

function harness(buy: any) {
  const chain = new MockChainAdapter("0x" + "11".repeat(20));
  const audit: any[] = [];
  const bought: any[] = [];
  const deps = {
    chain,
    buy: async (req: any, stage: any) => { bought.push({ req, stage }); return buy(req, stage); },
    audit: async (e: any) => { audit.push(e); },
  };
  return { chain, audit, bought, deps };
}

test("all claims true → buys a verification and relays it to Whitechain", async () => {
  const h = harness(verified());
  const r = await processShipment(ev(), h.deps as any);
  assert.equal(r.outcome, "relayed");
  assert.equal(h.chain.submitted.length, 1);
  assert.equal(h.bought[0].req.claims.status_code, true); // JSON names on the wire
  assert.equal(h.audit.at(-1).kind, "relayed");
  assert.match(h.audit.at(-1).reason, /match → release/);
});

test("exporter admits a false claim → no 402 is triggered, nothing paid", async () => {
  const h = harness(verified());
  const r = await processShipment(ev({ ...ALL, documents: false }), h.deps as any);
  assert.equal(r.outcome, "skipped");
  assert.equal(h.bought.length, 0);
  assert.equal(h.audit[0].kind, "skipped");
});

test("observed weight differs from the claim → still relayed; log names the falsified factor", async () => {
  const h = harness(verified({ ...ALL, weight: false }));
  await processShipment(ev(), h.deps as any);
  assert.equal(h.chain.submitted.length, 1);
  assert.match(h.audit.at(-1).reason, /mismatch.*weight/);
});

test("pending human approval or refusal → nothing relayed", async () => {
  for (const status of ["pending_human", "refused", "no_verdict", "untrusted"]) {
    const h = harness(async () => ({ status, reason: "x" }));
    const r = await processShipment(ev(), h.deps as any);
    assert.equal(r.outcome, status);
    assert.equal(h.chain.submitted.length, 0);
  }
});

test("a relay that would revert is not sent (simulation fails) and is audited as error", async () => {
  const h = harness(verified());
  h.chain.failNextWith("NonceUsed()");
  const r = await processShipment(ev(), h.deps as any);
  assert.equal(r.outcome, "relay_failed");
  assert.equal(h.audit.at(-1).kind, "error");
  assert.match(h.audit.at(-1).reason, /NonceUsed/);
});
