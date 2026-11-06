import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyTypedData } from "viem";
import {
  canonical,
  reportCommitment,
  decodeAttestation,
  typedAttestation,
  attestationHash,
  type Report,
} from "@trustmebro/shared/v2";
import {
  fixture,
  now,
  account,
} from "../../../../services/verifier/test/v2-fixture.ts";
import { demoReissue } from "../src/v2-demo-recovery.ts";
import type { Job } from "../src/v2-flow.ts";
import {
  assertExpiredUnsubmitted,
  appendRecoveryVersion,
  recoveryHistory,
} from "../src/v2-recovery-history.ts";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
function input() {
  const f = fixture();
  f.evidence.raw = { simulation: true, warning: "SIMULATED" };
  const stale = { ...f.evidence, observedAt: (now - 681n).toString() };
  const reason = "old generic reason",
    report: Report = {
      v: 2,
      request: f.request,
      result: "insufficient_evidence",
      reason,
      evidence: stale,
      reportHash: reportCommitment(
        f.request,
        "insufficient_evidence",
        stale,
        reason,
      ),
    };
  const job: Job = {
    jobId: f.request.jobId,
    tradeId: "1",
    termsHash: f.deal.termsHash,
    state: "insufficient_evidence",
    request: f.request,
    response: report,
    purchaseStartedAt: Number(now) * 1000,
    quote: {
      network: "hedera:testnet",
      asset: "0.0.429274",
      payTo: "0.0.5005",
      amount: "300000",
    },
    settlement: {
      success: true,
      txId: "0.0.1@1800000000.000000001",
      payer: "0.0.9001",
    },
  };
  return {
    job,
    merchantReport: structuredClone(report),
    fixture: f.evidence,
    deal: f.deal,
    now,
    paymentConfirmed: true,
    reader: {
      deal: async () => f.deal,
      time: async () => now,
      authorized: async () => true,
      digest: async (a: Parameters<typeof attestationHash>[0]) =>
        attestationHash(a),
    },
    signer: {
      address: account.address,
      sign: (a: Parameters<typeof attestationHash>[0]) =>
        account.signTypedData(typedAttestation(a)),
    },
  };
}
test("paid stale demo can receive a separately linked fresh signed reissue without modifying its original report/job", async () => {
  const args = input(),
    before = canonical(args.job);
  const recovered = await demoReissue(args);
  assert.equal(canonical(args.job), before);
  assert.equal(recovered.state, "awaiting_metamask");
  assert.equal(recovered.manualPayload?.evidenceLabel, "DEMO_SIMULATION");
  assert.equal(
    recovered.manualPayload?.hederaPaymentTransactionId,
    args.job.settlement!.txId,
  );
  assert.notEqual(recovered.reportHash, args.merchantReport.reportHash);
  const report = recovered.response as Report;
  assert.equal(report.evidence!.observedAt, now.toString());
  assert.equal(
    args.merchantReport.evidence!.observedAt,
    (now - 681n).toString(),
  );
  assert.equal(
    await verifyTypedData({
      ...typedAttestation(decodeAttestation(report.attestation!)),
      address: account.address,
      signature: report.signature!,
    }),
    true,
  );
});
for (const failure of [
  "uncertainPayment",
  "realMode",
  "quantity",
  "unauthorized",
  "changedReport",
  "changedTerms",
  "notInsufficient",
] as const)
  test(`demo reissue rejects ${failure}`, async () => {
    const args = input();
    if (failure === "uncertainPayment") args.paymentConfirmed = false;
    if (failure === "realMode") args.fixture.mode = "real";
    if (failure === "quantity") args.fixture.quantity = "1001";
    if (failure === "unauthorized") args.reader.authorized = async () => false;
    if (failure === "changedReport")
      args.merchantReport.reportHash = ("0x" +
        "00".repeat(32)) as `0x${string}`;
    if (failure === "changedTerms")
      args.job.termsHash = ("0x" + "00".repeat(32)) as `0x${string}`;
    if (failure === "notInsufficient") args.job.state = "verified";
    await assert.rejects(demoReissue(args));
  });

test("expired unsubmitted demo renewal preserves old nonce/signature/files and appends a fresh version", async () => {
  const args = input(),
    first = await demoReissue(args),
    original = canonical(args.job),
    prior = canonical(first);
  const later = now + 301n,
    chain = { digest: args.reader.digest, used: async () => false };
  const oldNonce = await assertExpiredUnsubmitted(
    first,
    args.job,
    args.deal,
    later,
    account.address,
    chain,
    async () => false,
  );
  const fresh = await demoReissue({ ...args, now: later });
  assert.notEqual(fresh.manualPayload!.attestation!.nonce, oldNonce.toString());
  assert.equal(BigInt(fresh.manualPayload!.attestation!.expiry), later + 300n);
  assert.equal(canonical(first), prior);
  assert.equal(canonical(args.job), original);
  const dir = mkdtempSync(join(tmpdir(), "tmb-version-history-"));
  try {
    const oldFile = appendRecoveryVersion(dir, first.jobId, 1, first),
      bytes = readFileSync(oldFile, "utf8");
    const newFile = appendRecoveryVersion(dir, fresh.jobId, 2, fresh);
    assert.ok(newFile.includes(join("versions", "2", "metamask")));
    assert.equal(readFileSync(oldFile, "utf8"), bytes);
    assert.deepEqual(
      recoveryHistory(dir, first.jobId).map((x) => x.version),
      [1, 2],
    );
    assert.throws(() => appendRecoveryVersion(dir, fresh.jobId, 2, fresh));
    assert.equal(readFileSync(oldFile, "utf8"), bytes);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
for (const failure of [
  "unexpired",
  "submitted",
  "usedNonce",
  "onchainReport",
  "verifiedTrade",
  "tamperedSignature",
  "wrongPayment",
  "realEvidence",
] as const)
  test(`expired renewal rejects ${failure}`, async () => {
    const args = input(),
      previous = await demoReissue(args);
    const chain = {
      digest: args.reader.digest,
      used: async () => failure === "usedNonce",
    };
    if (failure === "submitted")
      previous.txHash = ("0x" + "22".repeat(32)) as `0x${string}`;
    if (failure === "verifiedTrade") args.deal.verification = 1;
    if (failure === "tamperedSignature")
      previous.manualPayload!.signature = ("0x" +
        "00".repeat(65)) as `0x${string}`;
    if (failure === "wrongPayment")
      previous.settlement!.txId = "0.0.2@1800000000.000000001";
    if (failure === "realEvidence")
      previous.manualPayload!.evidenceLabel = "AUTHENTICATED_PROVIDER";
    await assert.rejects(
      assertExpiredUnsubmitted(
        previous,
        args.job,
        args.deal,
        failure === "unexpired" ? now + 300n : now + 301n,
        account.address,
        chain,
        async () => failure === "onchainReport",
      ),
    );
  });
