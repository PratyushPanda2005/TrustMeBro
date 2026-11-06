import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Hex } from "viem";
import { JobStore } from "@trustmebro/shared/job-store";
import {
  canonical,
  reportCommitment,
  validateMetadata,
  evidenceFailures,
  jobKey,
  financeV2Abi,
  V2_FINANCE,
  decodeAttestation,
  type Evidence,
  type Report,
} from "@trustmebro/shared/v2";
import {
  loadV2Environment,
  probeV2,
  requireDedicatedSigner,
  rpcFor,
  DEFAULT_RPC,
  StartupError,
  printStartupError,
  requireDemoAcknowledgement,
} from "@trustmebro/shared/v2-startup";
import {
  chainReader,
  serviceSigner,
} from "../../../../services/verifier/src/v2.ts";
import { confirmHederaPayment } from "./v2-payment.ts";
import { demoReissue } from "./v2-demo-recovery.ts";
import type { Job } from "./v2-flow.ts";
import { v2Chain } from "./v2-chain.ts";
import { createPublicClient, http } from "viem";
import {
  recoveryHistory,
  assertExpiredUnsubmitted,
  appendRecoveryVersion,
} from "./v2-recovery-history.ts";

async function main() {
  const pkg = fileURLToPath(new URL("../", import.meta.url)),
    merchant = fileURLToPath(
      new URL("../../../../services/verifier/", import.meta.url),
    );
  loadV2Environment(pkg, fileURLToPath(new URL("../../../", import.meta.url)));
  const id = process.argv.find((x) => x.startsWith("--trade-id="))?.slice(11);
  if (!id || !/^\d+$/.test(id))
    throw new StartupError(
      "TRADE_ID_REQUIRED",
      "Supply --trade-id=3.",
      "Default mode only inspects public payment/evidence and never changes job data.",
    );
  const rpc = rpcFor("agent", process.env) ?? DEFAULT_RPC,
    reader = chainReader(rpc),
    deal = await reader.deal(BigInt(id)),
    now = await reader.time();
  const root = resolve(pkg, process.env.V2_STATE_DIR || ".state/v2"),
    key = jobKey(BigInt(id), deal.termsHash),
    file = join(root, "jobs", key + ".json");
  const bytes = readFileSync(file),
    sha = (b: Buffer) => createHash("sha256").update(b).digest("hex"),
    job = JSON.parse(bytes.toString()) as Job;
  const old = job.response as Report;
  const menv: NodeJS.ProcessEnv = {};
  loadV2Environment(merchant, undefined, menv);
  const cacheFile = join(
    resolve(merchant, menv.V2_REPORT_DIR || ".state/v2-reports"),
    key + ".json",
  );
  const cached = JSON.parse(readFileSync(cacheFile, "utf8")) as Report;
  validateMetadata(deal, job.request.metadata);
  if (
    canonical(old) !== canonical(cached) ||
    canonical(old.request) !== canonical(job.request) ||
    old.reportHash !==
      reportCommitment(old.request, old.result, old.evidence, old.reason)
  )
    throw new StartupError(
      "PAID_REPORT_INTEGRITY_FAILED",
      "Original paid report/cache bindings disagree.",
      "Preserve both files. No signing, payment or relay was attempted.",
    );
  if (
    job.quote?.payTo !== menv.VERIFIER_PAYTO ||
    job.quote?.asset !== "0.0.429274" ||
    job.settlement?.payer !== process.env.AGENT_HEDERA_ACCOUNT_ID
  )
    throw Error("Original payment configuration mismatch");
  const confirmed =
    !!job.settlement &&
    !!job.quote &&
    !!job.purchaseStartedAt &&
    (await confirmHederaPayment(
      job.settlement,
      job.quote,
      process.env.AGENT_HEDERA_ACCOUNT_ID!,
      job.purchaseStartedAt,
    ));
  const fixture = JSON.parse(
    readFileSync(menv.DEMO_EVIDENCE_FILE!, "utf8"),
  ) as Evidence;
  const health = await probeV2(
    rpc,
    process.env.VERIFIER_ADDRESS as `0x${string}`,
  );
  console.log(
    JSON.stringify(
      {
        tradeId: id,
        state: job.state,
        originalJobSHA256: sha(bytes),
        paymentConfirmed: confirmed,
        hederaPaymentTransactionId: job.settlement?.txId,
        amount: job.quote?.amount,
        token: job.quote?.asset,
        payer: job.settlement?.payer,
        merchant: job.quote?.payTo,
        termsHash: deal.termsHash,
        onchain: {
          state: deal.state,
          importerApproved: deal.importerApproved,
          verification: deal.verification,
          quantity: deal.terms.quantity.toString(),
          minimumStage: deal.terms.minimumStage,
          documentHash: deal.terms.documentHash,
        },
        purchasedObservedAt: old.evidence?.observedAt,
        fixtureObservedAt: fixture.observedAt,
        purchaseStartedSeconds:
          job.purchaseStartedAt && Math.floor(job.purchaseStartedAt / 1000),
        failedAtPurchase:
          old.evidence &&
          evidenceFailures(
            deal,
            job.request.metadata,
            old.evidence,
            BigInt(Math.floor(job.purchaseStartedAt! / 1000)),
            "demo",
          ),
        failedNow:
          old.evidence &&
          evidenceFailures(
            deal,
            job.request.metadata,
            old.evidence,
            now,
            "demo",
          ),
        signerAuthorized: health.signer?.verifierRole,
        mode: "DEMO_SIMULATION",
        originalPreserved: true,
      },
      null,
      2,
    ),
  );
  const checkRenewal = process.argv.includes("--check-renewal");
  if (!process.argv.includes("--reissue-demo") && !checkRenewal) return;
  if (process.env.EVIDENCE_MODE !== "demo" || menv.EVIDENCE_MODE !== "demo")
    throw Error("Demo only");
  if (!checkRenewal) requireDemoAcknowledgement("demo", process.env);
  if (
    !checkRenewal &&
    !process.argv.includes("--ack-new-simulated-observation")
  )
    throw new StartupError(
      "DEMO_REOBSERVATION_ACK_REQUIRED",
      "Fresh demo observation must be explicitly acknowledged.",
      "Use --ack-new-simulated-observation; this creates a new simulated report, not real evidence. No payment or relay is performed.",
    );
  requireDedicatedSigner(health);
  const signer = serviceSigner(menv.SERVICE_SIGNER_PRIVATE_KEY as Hex);
  if (signer.address.toLowerCase() !== health.signer!.address.toLowerCase())
    throw Error("Wrong dedicated signer");
  const unlock = checkRenewal
    ? () => {}
    : new JobStore<{ jobId: string }>(join(root, "recovery", "control")).lock();
  try {
    const history = recoveryHistory(root, key),
      renew = process.argv.includes("--renew-expired") || checkRenewal;
    if (history.length && !renew)
      throw new StartupError(
        "RECOVERY_ALREADY_EXISTS",
        "A recovery already exists.",
        "Use --renew-expired explicitly only for expired, unsubmitted demo history. Nothing is overwritten.",
      );
    if (renew && !history.length) throw Error("No expired recovery to renew");
    const chain = v2Chain(rpc, undefined, 12365020n),
      currentDeal = await reader.deal(BigInt(id)),
      currentTime = await reader.time();
    const client = createPublicClient({
      transport: http(rpc, { timeout: 15000, retryCount: 1 }),
    });
    const reports = new Set<Hex>();
    if (history.length) {
      const latest = await client.getBlockNumber();
      for (let from = 12365020n; from <= latest; from += 1500n) {
        const logs = await client.getContractEvents({
          address: V2_FINANCE,
          abi: financeV2Abi,
          eventName: "ShipmentChecked",
          args: { id: BigInt(id) },
          fromBlock: from,
          toBlock: from + 1499n < latest ? from + 1499n : latest,
        });
        for (const log of logs)
          if (log.args.reportHash) reports.add(log.args.reportHash);
      }
    }
    const priorNonces = new Set<string>();
    for (const previous of history) {
      try {
        const nonce = await assertExpiredUnsubmitted(
          previous.job,
          job,
          currentDeal,
          currentTime,
          signer.address,
          chain,
          async (hash) => reports.has(hash),
        );
        priorNonces.add(nonce.toString());
      } catch {
        throw new StartupError(
          "RECOVERY_RENEWAL_UNSAFE",
          "Previous recovery is not expired/unsubmitted or its integrity/onchain checks failed.",
          "Preserve history. Inspect current trade, nonce, signature, receipt and any submitted transaction. No new signature is issued.",
        );
      }
    }
    const version = history.length
      ? history[history.length - 1].version + 1
      : 1;
    const base =
      version === 1
        ? join(root, "recovery")
        : join(root, "recovery", "versions", version.toString());
    if (checkRenewal) {
      console.log(
        JSON.stringify({
          renewalEligible: confirmed,
          historyVersions: history.map((entry) => entry.version),
          nextVersion: version,
          previousNoncesUnused: true,
          previousReportsNotSubmitted: true,
          originalAndHistoryPreserved: true,
          publicPayloadIfReissued: join(
            base,
            "metamask",
            `v2-attestation-trade-${id}.json`,
          ),
          signed: false,
          paidAgain: false,
          whitechainSubmitted: false,
        }),
      );
      return;
    }
    const recovered = await demoReissue({
      job,
      merchantReport: cached,
      fixture,
      deal: await reader.deal(BigInt(id)),
      now: await reader.time(),
      paymentConfirmed: confirmed,
      reader,
      signer,
    });
    const attestation = decodeAttestation(
      recovered.manualPayload!.attestation!,
    );
    if (
      priorNonces.has(attestation.nonce.toString()) ||
      (await chain.used(signer.address, attestation.nonce))
    )
      throw Error("New nonce collision/consumption");
    recovered.recovery = {
      ...(recovered.recovery as object),
      version,
      previousReportHash: history.at(-1)?.job.reportHash,
    };
    if (
      sha(readFileSync(file)) !== sha(bytes) ||
      history.some(
        (entry) => sha(readFileSync(entry.file)) !== sha(entry.bytes),
      )
    )
      throw Error("Original job/history changed during preparation");
    const payload = appendRecoveryVersion(root, key, version, recovered);
    console.log(
      JSON.stringify({
        state: recovered.state,
        recoveryVersion: version,
        historyPreserved: true,
        paidAgain: false,
        whitechainSubmitted: false,
        originalJobPreserved: sha(readFileSync(file)) === sha(bytes),
        publicPayload: payload,
        expiry: recovered.manualPayload?.attestation?.expiry,
        evidenceLabel: "DEMO_SIMULATION",
        hederaPaymentTransactionId: job.settlement?.txId,
      }),
    );
  } finally {
    unlock();
  }
}
main().catch((error) => {
  printStartupError(error);
  process.exitCode = 1;
});
