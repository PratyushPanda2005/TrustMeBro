import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JobStore } from "@trustmebro/shared/job-store";
import {
  V2_FINANCE,
  attestationHash,
  commitment,
  type Report,
} from "@trustmebro/shared/v2";
import {
  account,
  fixture,
  merchant,
  now,
} from "../../../../services/verifier/test/v2-fixture.ts";
import { SpendLedger } from "../src/ledger.ts";
import { reconcileMetaMask } from "../src/v2-metamask.ts";
import {
  processV2,
  type FlowDeps,
  type Job,
  type V2Chain,
} from "../src/v2-flow.ts";

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64");
async function harness(
  options: {
    uncertain?: boolean;
    missing?: boolean;
    unauthorized?: boolean;
    mutate?: (r: Report) => void;
    outcome?: "valid" | "nonpassing" | "reverted";
    crashBroadcast?: boolean;
  } = {},
) {
  const m = await merchant({ evidence: options.missing ? null : undefined }),
    f = fixture(),
    dir = mkdtempSync(join(tmpdir(), "tmb-v2-agent-")),
    store = new JobStore<Job>(join(dir, "jobs"));
  let purchases = 0,
    broadcasts = 0;
  const chain: V2Chain = {
    finance: V2_FINANCE,
    confirmed: async () => [1n],
    deal: async () => f.deal,
    time: async () => now,
    authorized: async () => !options.unauthorized,
    digest: async (a) => attestationHash(a),
    used: async () => false,
    prepare: async () => ({ raw: "0x1234", hash: commitment("tx") }),
    broadcast: async () => {
      broadcasts++;
      if (options.crashBroadcast) throw Error("lost broadcast response");
      return commitment("tx");
    },
    receipt: async () =>
      broadcasts ? (options.outcome ?? "valid") : "pending",
  };
  const deps: FlowDeps = {
    chain,
    store,
    ledger: new SpendLedger(join(dir, "ledger.json")),
    policy: {
      network: "hedera:testnet",
      asset: "0.0.429274",
      allowlist: new Set(["0.0.5005"]),
      maxPerCall: 1000000n,
      maxPerDeal: 1000000n,
      maxPerDay: 10000000n,
      maxChecksPerDeal: 3,
      maxChecksPerExporterPerDay: 5,
    },
    signer: account.address,
    mode: "demo",
    url: m.url,
    fetch: async () =>
      new Response(null, {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": b64({
            accepts: [
              {
                scheme: "exact",
                network: "hedera:testnet",
                asset: "0.0.429274",
                payTo: "0.0.5005",
                amount: "300000",
              },
            ],
          }),
        },
      }),
    payFetch: async (url, init) => {
      purchases++;
      const res = await fetch(url, init);
      const r = (await res.json()) as Report;
      options.mutate?.(r);
      return new Response(JSON.stringify(r), {
        status: res.status,
        headers: {
          "PAYMENT-RESPONSE": b64({
            success: !options.uncertain,
            transaction: "0.0.7162784@1800000000.000000001",
            payer: "0.0.9001",
          }),
        },
      });
    },
    audit: async () => {},
    allowBroadcast: true,
    confirmPayment: async () => true,
    now: () => Number(now) * 1000,
  };
  return {
    deps,
    metadata: f.metadata,
    counts: () => ({ purchases, broadcasts }),
    async close() {
      await m.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
test("confirmed trade -> mocked x402 purchase -> real merchant V2 signature -> relay -> verified; duplicate/restart never repurchases", async () => {
  const h = await harness();
  try {
    const ids = await h.deps.chain.confirmed();
    assert.deepEqual(ids, [1n]);
    const j = await processV2(ids[0], h.metadata, h.deps);
    assert.equal(j.state, "verified");
    assert.ok(j.settlement?.txId);
    assert.ok(j.reportHash);
    const restarted = {
      ...h.deps,
      store: new JobStore<Job>(h.deps.store.directory),
    };
    assert.equal(
      (await processV2(1n, h.metadata, restarted)).state,
      "verified",
    );
    assert.deepEqual(h.counts(), { purchases: 1, broadcasts: 1 });
  } finally {
    await h.close();
  }
});
test("manual MetaMask persists public payload without backend relay; restart and reconciliation never repurchase", async () => {
  const h = await harness();
  try {
    h.deps.relayMode = "manual-metamask";
    h.deps.allowBroadcast = false;
    h.deps.chain.prepare = async () => {
      throw Error("Backend must not sign");
    };
    const job = await processV2(1n, h.metadata, h.deps);
    assert.equal(job.state, "awaiting_metamask");
    assert.equal(job.manualPayload?.evidenceLabel, "DEMO_SIMULATION");
    assert.equal(
      job.manualPayload?.hederaPaymentTransactionId,
      job.settlement?.txId,
    );
    assert.equal(job.manualPayload?.transaction.value, "0x0");
    assert.ok(job.manualPayload?.transaction.data.startsWith("0x"));
    assert.equal(
      (await processV2(1n, h.metadata, h.deps)).state,
      "awaiting_metamask",
    );
    h.deps.chain.externalReceipt = async () => {
      throw Error("Mismatched transaction");
    };
    await assert.rejects(
      reconcileMetaMask(
        h.deps.store,
        job.jobId,
        commitment("wrong"),
        h.deps.chain,
      ),
    );
    assert.equal(h.deps.store.get(job.jobId)?.state, "awaiting_metamask");
    h.deps.chain.externalReceipt = async () => "pending";
    assert.equal(
      (
        await reconcileMetaMask(
          h.deps.store,
          job.jobId,
          commitment("manual"),
          h.deps.chain,
        )
      ).state,
      "metamask_submitted",
    );
    h.deps.chain.externalReceipt = async () => "valid";
    assert.equal(
      (
        await reconcileMetaMask(
          h.deps.store,
          job.jobId,
          commitment("manual"),
          h.deps.chain,
        )
      ).state,
      "verified",
    );
    assert.deepEqual(h.counts(), { purchases: 1, broadcasts: 0 });
  } finally {
    await h.close();
  }
});
test("single payment approval rejects changed quote before purchase", async () => {
  const h = await harness();
  try {
    h.deps.relayMode = "manual-metamask";
    h.deps.approvedQuote = {
      network: "hedera:testnet",
      asset: "0.0.429274",
      payTo: "0.0.5005",
      amount: 1n,
    };
    assert.equal((await processV2(1n, h.metadata, h.deps)).state, "blocked");
    assert.deepEqual(h.counts(), { purchases: 0, broadcasts: 0 });
  } finally {
    await h.close();
  }
});
for (const outcome of ["nonpassing", "reverted"] as const)
  test(`manual ${outcome} receipt never completes job`, async () => {
    const h = await harness();
    try {
      h.deps.relayMode = "manual-metamask";
      h.deps.allowBroadcast = false;
      const job = await processV2(1n, h.metadata, h.deps);
      h.deps.chain.externalReceipt = async () => outcome;
      assert.equal(
        (
          await reconcileMetaMask(
            h.deps.store,
            job.jobId,
            commitment("manual"),
            h.deps.chain,
          )
        ).state,
        outcome,
      );
      assert.deepEqual(h.counts(), { purchases: 1, broadcasts: 0 });
    } finally {
      await h.close();
    }
  });
for (const [label, options, expected] of [
  ["missing evidence", { missing: true }, "insufficient_evidence"],
  ["uncertain payment", { uncertain: true }, "payment_unknown"],
  ["unauthorized signer", { unauthorized: true }, "blocked"],
  [
    "invalid signature",
    {
      mutate: (r: Report) => {
        r.signature = `0x${"00".repeat(65)}`;
      },
    },
    "untrusted",
  ],
  [
    "wrong trade",
    {
      mutate: (r: Report) => {
        r.request.tradeId = "2";
      },
    },
    "untrusted",
  ],
  [
    "wrong terms",
    {
      mutate: (r: Report) => {
        r.attestation!.termsHash = commitment("other");
      },
    },
    "untrusted",
  ],
  [
    "successful tx with nonpassing contract result",
    { outcome: "nonpassing" as const },
    "nonpassing",
  ],
  ["reverted relay", { outcome: "reverted" as const }, "reverted"],
] as const)
  test(label, async () => {
    const h = await harness(options);
    try {
      const j = await processV2(1n, h.metadata, h.deps);
      assert.equal(j.state, expected);
      await processV2(1n, h.metadata, h.deps);
      assert.ok(h.counts().purchases <= 1);
      if (!["nonpassing", "reverted"].includes(expected))
        assert.equal(h.counts().broadcasts, 0);
    } finally {
      await h.close();
    }
  });
test("prepared transaction survives ambiguous broadcast, reconciles without buying twice", async () => {
  const h = await harness({ crashBroadcast: true });
  try {
    await assert.rejects(processV2(1n, h.metadata, h.deps), /lost broadcast/);
    const j = await processV2(1n, h.metadata, h.deps);
    assert.equal(j.state, "verified");
    assert.deepEqual(h.counts(), { purchases: 1, broadcasts: 1 });
  } finally {
    await h.close();
  }
});
test("concurrent workers cannot purchase same job twice", async () => {
  const h = await harness();
  try {
    const results = await Promise.allSettled([
      processV2(1n, h.metadata, h.deps),
      processV2(1n, h.metadata, {
        ...h.deps,
        store: new JobStore<Job>(h.deps.store.directory),
      }),
    ]);
    assert.equal(results.filter((x) => x.status === "rejected").length, 1);
    assert.equal(h.counts().purchases, 1);
  } finally {
    await h.close();
  }
});
test("old evidence cannot approve", async () => {
  const h = await harness({
    mutate: (r) => {
      r.evidence!.observedAt = (now - 1000n).toString();
    },
  });
  try {
    assert.equal((await processV2(1n, h.metadata, h.deps)).state, "untrusted");
  } finally {
    await h.close();
  }
});

test("Mirror indexing delay recovers saved report after restart without another purchase", async () => {
  const h = await harness();
  let confirmed = false;
  h.deps.confirmPayment = async () => confirmed;
  try {
    assert.equal(
      (await processV2(1n, h.metadata, h.deps)).state,
      "payment_unknown",
    );
    confirmed = true;
    const restarted = {
      ...h.deps,
      store: new JobStore<Job>(h.deps.store.directory),
    };
    assert.equal(
      (await processV2(1n, h.metadata, restarted)).state,
      "verified",
    );
    assert.deepEqual(h.counts(), { purchases: 1, broadcasts: 1 });
  } finally {
    await h.close();
  }
});

test("mismatched shipment metadata is rejected before any paid request", async () => {
  const h = await harness();
  try {
    assert.equal(
      (
        await processV2(
          1n,
          { ...h.metadata, shipmentReference: "DIFFERENT" },
          h.deps,
        )
      ).state,
      "blocked",
    );
    assert.equal(h.counts().purchases, 0);
  } finally {
    await h.close();
  }
});
