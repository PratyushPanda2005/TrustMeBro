import { encodeFunctionData, type Address, type Hex } from "viem";
import {
  ADMIN,
  V2_CHAIN,
  financeV2Abi,
  type Attestation,
  type Report,
} from "@trustmebro/shared/v2";
import type { Job, V2Chain } from "./v2-flow.ts";
import { JobStore } from "@trustmebro/shared/job-store";

/** Public handoff only. Contains a service signature, never a private key or raw wallet transaction. */
export type MetaMaskPayload = {
  version: 1;
  relayMode: "manual-metamask";
  evidenceLabel: "DEMO_SIMULATION" | "AUTHENTICATED_PROVIDER";
  jobId: Hex;
  tradeId: string;
  termsHash: Hex;
  reportHash: Hex;
  hederaPaymentTransactionId: string;
  signer: Address;
  attestation: Report["attestation"];
  signature: Hex;
  transaction: {
    chainId: 1874;
    from: Address;
    to: Address;
    value: "0x0";
    data: Hex;
  };
};
export function publicMetaMaskPayload(
  j: Job,
  a: Attestation,
  r: Report,
  finance: Address,
): MetaMaskPayload {
  if (
    !j.settlement?.success ||
    !j.settlement.txId ||
    !r.attestation ||
    !r.signature ||
    !r.signer
  )
    throw Error("Confirmed payment and signed report required");
  return {
    version: 1,
    relayMode: "manual-metamask",
    evidenceLabel:
      r.evidence?.mode === "demo"
        ? "DEMO_SIMULATION"
        : "AUTHENTICATED_PROVIDER",
    jobId: j.jobId,
    tradeId: j.tradeId,
    termsHash: j.termsHash,
    reportHash: r.reportHash,
    hederaPaymentTransactionId: j.settlement.txId,
    signer: r.signer,
    attestation: r.attestation,
    signature: r.signature,
    transaction: {
      chainId: V2_CHAIN,
      from: ADMIN,
      to: finance,
      value: "0x0",
      data: encodeFunctionData({
        abi: financeV2Abi,
        functionName: "verifyAttestation",
        args: [a, r.signer, r.signature],
      }),
    },
  };
}
/** Exact external transaction is checked before a local job can become verified. Never sends or republishes it. */
export async function reconcileMetaMask(
  store: JobStore<Job>,
  jobId: string,
  hash: Hex,
  chain: V2Chain,
) {
  const unlock = store.lock();
  try {
    const job = store.get(jobId);
    if (
      !job?.manualPayload ||
      !["awaiting_metamask", "metamask_submitted", "verified"].includes(
        job.state,
      )
    )
      throw Error("No matching saved manual-MetaMask job");
    if (
      job.manualPayload.transaction.to.toLowerCase() !==
      chain.finance.toLowerCase()
    )
      throw Error("Wrong Finance deployment");
    if (job.state === "verified") {
      if (job.txHash?.toLowerCase() !== hash.toLowerCase())
        throw Error("Job already reconciled with another transaction");
      return job;
    }
    if (!chain.externalReceipt)
      throw Error("External receipt validation unavailable");
    const result = await chain.externalReceipt(hash, job.manualPayload);
    job.txHash = hash;
    job.state =
      result === "valid"
        ? "verified"
        : result === "pending"
          ? "metamask_submitted"
          : result === "reverted"
            ? "reverted"
            : "nonpassing";
    job.reason =
      result === "valid"
        ? "MetaMask receipt, ShipmentChecked Valid, current state and funding eligibility confirmed"
        : `MetaMask relay ${result}`;
    store.put(job);
    return job;
  } finally {
    unlock();
  }
}
