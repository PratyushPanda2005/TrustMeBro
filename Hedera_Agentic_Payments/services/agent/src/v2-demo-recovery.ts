import {
  canonical,
  decodeAttestation,
  evidenceFailures,
  jobKey,
  reportCommitment,
  validateMetadata,
  V2_FINANCE,
  type Deal,
  type Evidence,
  type Report,
} from "@trustmebro/shared/v2";
import {
  issueV2Report,
  type V2Reader,
} from "../../../../services/verifier/src/v2.ts";
import { publicMetaMaskPayload } from "./v2-metamask.ts";
import type { Job } from "./v2-flow.ts";

/** Paid demo correction only. Original job/report are immutable; never used in real-provider mode. */
export async function demoReissue(input: {
  job: Job;
  merchantReport: Report;
  fixture: Evidence;
  deal: Deal;
  now: bigint;
  paymentConfirmed: boolean;
  reader: V2Reader;
  signer: Parameters<typeof issueV2Report>[0]["signer"];
}) {
  const { job, merchantReport, fixture, deal, now, reader, signer } = input;
  const old = job.response as Report;
  if (
    !input.paymentConfirmed ||
    !job.settlement?.success ||
    !job.settlement.txId ||
    !job.quote ||
    !job.purchaseStartedAt
  )
    throw Error("Independently confirmed original payment required");
  if (
    job.state !== "insufficient_evidence" ||
    job.raw ||
    job.txHash ||
    job.manualPayload
  )
    throw Error("Only unrelayed insufficient-evidence job can be reissued");
  if (
    job.request.finance.toLowerCase() !== V2_FINANCE.toLowerCase() ||
    job.request.chainId !== 1874 ||
    job.jobId !== jobKey(BigInt(job.tradeId), deal.termsHash) ||
    job.request.termsHash !== deal.termsHash ||
    deal.termsHash !== job.termsHash
  )
    throw Error("Wrong trade/deployment/terms binding");
  validateMetadata(deal, job.request.metadata);
  if (
    deal.state !== 1 ||
    !deal.importerApproved ||
    deal.verification === 1 ||
    deal.verification === 3 ||
    deal.terms.expiry < now
  )
    throw Error("Trade not eligible for verification");
  if (
    !old ||
    old.result !== "insufficient_evidence" ||
    !old.evidence ||
    old.evidence.mode !== "demo" ||
    fixture.mode !== "demo" ||
    !(fixture.raw as { simulation?: boolean })?.simulation
  )
    throw Error("Explicit demo simulation required");
  if (
    canonical(old) !== canonical(merchantReport) ||
    canonical(old.request) !== canonical(job.request) ||
    old.reportHash !==
      reportCommitment(old.request, old.result, old.evidence, old.reason)
  )
    throw Error("Original paid report/cache integrity mismatch");
  const failures = evidenceFailures(
    deal,
    job.request.metadata,
    old.evidence,
    BigInt(Math.floor(job.purchaseStartedAt / 1000)),
    "demo",
  );
  if (failures.length !== 1 || failures[0] !== "observationFresh")
    throw Error(
      "Only a demonstrated stale-demo-observation failure can be reissued",
    );
  // New simulated observation, not a timestamp edit to the purchased response or provider file.
  const evidence: Evidence = {
    ...structuredClone(fixture),
    observedAt: now.toString(),
    raw: {
      simulation: true,
      warning: "NEW DEMO_SIMULATION observation; not real shipping evidence",
      sourceFixture: structuredClone(fixture.raw),
      reissue: {
        previousReportHash: old.reportHash,
        previousObservedAt: old.evidence.observedAt,
        originalPayment: job.settlement.txId,
      },
    },
  };
  const report = await issueV2Report(
    { reader, signer },
    job.request,
    deal,
    now,
    evidence,
    "demo",
  );
  if (report.result !== "passing" || !report.attestation)
    throw Error("Fresh demo evidence still insufficient");
  const recovered: Job & { recovery: unknown } = {
    ...structuredClone(job),
    state: "awaiting_metamask",
    response: report,
    reportHash: report.reportHash,
    reason:
      "Fresh DEMO_SIMULATION reissue against independently confirmed original payment; no new payment",
    recovery: {
      originalReportHash: old.reportHash,
      originalJobId: job.jobId,
      newObservation: true,
    },
  };
  recovered.manualPayload = publicMetaMaskPayload(
    recovered,
    decodeAttestation(report.attestation),
    report,
    V2_FINANCE,
  );
  return recovered;
}
