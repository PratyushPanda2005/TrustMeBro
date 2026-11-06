import { getAddress, verifyTypedData, type Address, type Hex } from "viem";
import {
  V2_FINANCE,
  V2_CHAIN,
  attestationHash,
  canonical,
  decodeAttestation,
  evidencePasses,
  hex32,
  jobKey,
  reportCommitment,
  typedAttestation,
  uint,
  validateMetadata,
  type Attestation,
  type Deal,
  type Metadata,
  type Report,
  type VerificationRequest,
} from "@trustmebro/shared/v2";
import { JobStore } from "@trustmebro/shared/job-store";
import { evaluate, type Policy } from "./policy.ts";
import { SpendLedger, contractScope } from "./ledger.ts";
import {
  parsePaymentRequired,
  parseSettlement,
  type PinnedPayment,
  type Settlement,
} from "./x402.ts";
import type { AuditEvent } from "./buy.ts";
import { publicMetaMaskPayload, type MetaMaskPayload } from "./v2-metamask.ts";

export interface V2Chain {
  finance: Address;
  confirmed(): Promise<bigint[]>;
  deal(id: bigint): Promise<Deal>;
  time(): Promise<bigint>;
  authorized(signer: Address): Promise<boolean>;
  digest(a: Attestation): Promise<Hex>;
  prepare(
    a: Attestation,
    signer: Address,
    signature: Hex,
  ): Promise<{ raw: Hex; hash: Hex }>;
  broadcast(raw: Hex): Promise<Hex>;
  receipt(
    hash: Hex,
    id: bigint,
    reportHash: Hex,
  ): Promise<"pending" | "valid" | "nonpassing" | "reverted">;
  used(signer: Address, nonce: bigint): Promise<boolean>;
  externalReceipt?(
    hash: Hex,
    payload: MetaMaskPayload,
  ): Promise<"pending" | "valid" | "nonpassing" | "reverted">;
}
export type Job = {
  jobId: Hex;
  tradeId: string;
  termsHash: Hex;
  state:
    | "ready"
    | "purchasing"
    | "payment_unknown"
    | "purchased"
    | "insufficient_evidence"
    | "untrusted"
    | "prepared"
    | "submitted"
    | "awaiting_metamask"
    | "metamask_submitted"
    | "verified"
    | "nonpassing"
    | "reverted"
    | "blocked";
  manualPayload?: MetaMaskPayload;
  reason?: string;
  request: VerificationRequest;
  quote?: PinnedWire;
  settlement?: Settlement;
  response?: unknown;
  raw?: Hex;
  txHash?: Hex;
  reportHash?: Hex;
  paymentRecorded?: boolean;
  paymentAudited?: boolean;
  purchaseStartedAt?: number;
};
type PinnedWire = {
  network: string;
  asset: string;
  payTo: string;
  amount: string;
};
export type FlowDeps = {
  chain: V2Chain;
  store: JobStore<Job>;
  ledger: SpendLedger;
  policy: Policy;
  signer: Address;
  mode: "real" | "demo";
  url: string;
  fetch: typeof fetch;
  payFetch: (
    url: string,
    init: RequestInit,
    pinned: PinnedPayment,
  ) => Promise<Response>;
  audit: (e: AuditEvent) => Promise<void>;
  allowBroadcast: boolean;
  confirmPayment: (
    settlement: Settlement,
    quote: PinnedWire,
    startedAt: number,
  ) => Promise<boolean>;
  now?: () => number;
  relayMode?: "automatic" | "manual-metamask";
  approvedAmount?: bigint;
  approvedQuote?: PinnedPayment;
};

async function reportValid(
  d: FlowDeps,
  j: Job,
  deal: Deal,
): Promise<{ report: Report; attestation: Attestation }> {
  const r = j.response as Report,
    now = await d.chain.time();
  if (
    !r ||
    r.v !== 2 ||
    canonical(r.request) !== canonical(j.request) ||
    !hex32(r.reportHash) ||
    r.reportHash !== reportCommitment(j.request, r.result, r.evidence, r.reason)
  )
    throw Error("Malformed or mismatched report");
  if (r.result !== "passing" || !r.evidence)
    throw Error("Insufficient evidence");
  if (!evidencePasses(deal, j.request.metadata, r.evidence, now, d.mode))
    throw Error("Unreliable or outdated evidence");
  if (
    !r.attestation ||
    !r.signer ||
    getAddress(r.signer) !== getAddress(d.signer) ||
    !r.signature ||
    !/^0x[\da-f]{130}$/i.test(r.signature)
  )
    throw Error("Invalid signer/signature");
  const a = decodeAttestation(r.attestation);
  if (
    a.tradeId !== uint(j.tradeId) ||
    a.termsHash !== deal.termsHash ||
    a.reportHash !== r.reportHash ||
    a.documentHash !== r.evidence.documentHash ||
    a.quantity !== uint(r.evidence.quantity) ||
    a.stage !== r.evidence.stage ||
    a.timestamp < deal.createdAt ||
    a.timestamp > now ||
    a.expiry < now ||
    a.expiry < a.timestamp ||
    a.expiry - a.timestamp > 300n ||
    now - a.timestamp > 300n
  )
    throw Error("Invalid attestation binding/time");
  if (!(await d.chain.authorized(d.signer)))
    throw Error("Unauthorized service signer");
  if (
    (await d.chain.digest(a)) !== attestationHash(a, d.chain.finance) ||
    !(await verifyTypedData({
      ...typedAttestation(a, d.chain.finance),
      address: d.signer,
      signature: r.signature,
    }))
  )
    throw Error("Invalid V2 signature/digest");
  return { report: r, attestation: a };
}
export async function processV2(
  id: bigint,
  metadata: Metadata,
  d: FlowDeps,
): Promise<Job> {
  const unlock = d.store.lock();
  try {
    return await processLocked(id, metadata, d);
  } finally {
    unlock();
  }
}
async function processLocked(
  id: bigint,
  metadata: Metadata,
  d: FlowDeps,
): Promise<Job> {
  const deal = await d.chain.deal(id),
    now = await d.chain.time(),
    key = jobKey(id, deal.termsHash, d.chain.finance);
  const request: VerificationRequest = {
    jobId: key,
    tradeId: id.toString(),
    termsHash: deal.termsHash,
    chainId: V2_CHAIN,
    finance: d.chain.finance,
    metadata,
  };
  let j = d.store.get(key);
  if (j && canonical(j.request) !== canonical(request))
    throw Error("Immutable verification job metadata changed");
  if (!j) {
    j = {
      jobId: key,
      tradeId: id.toString(),
      termsHash: deal.termsHash,
      state: "ready",
      request,
    };
    d.store.put(j);
  }
  const save = (state: Job["state"], reason?: string) => {
    j!.state = state;
    j!.reason = reason;
    d.store.put(j!);
    return j!;
  };
  if (
    [
      "verified",
      "insufficient_evidence",
      "untrusted",
      "nonpassing",
      "reverted",
      "blocked",
      "awaiting_metamask",
      "metamask_submitted",
    ].includes(j.state)
  )
    return j;
  if (j.state === "purchasing")
    return save(
      "payment_unknown",
      "Purchase interrupted; reconcile the existing payment. Never repurchase automatically.",
    );
  if (j.state === "payment_unknown") {
    if (
      !j.response ||
      !j.settlement?.success ||
      !j.quote ||
      !j.purchaseStartedAt ||
      !(await d.confirmPayment(j.settlement, j.quote, j.purchaseStartedAt))
    )
      return j;
    save("purchased");
  }
  // A signed raw transaction is durable before broadcast: recovery rebroadcasts the SAME hash.
  if (j.state === "prepared" || j.state === "submitted") {
    const result = await d.chain.receipt(j.txHash!, id, j.reportHash!);
    if (result !== "pending") {
      await d.audit({
        kind: "relayed",
        dealId: `0x${id.toString(16).padStart(64, "0")}`,
        whitechainTx: j.txHash,
        reason: `V2 recovered ${result}; report ${j.reportHash}`,
      });
      return save(
        result === "valid"
          ? "verified"
          : result === "reverted"
            ? "reverted"
            : "nonpassing",
      );
    }
    if (!d.allowBroadcast) return j;
    const hash = await d.chain.broadcast(j.raw!);
    if (hash.toLowerCase() !== j.txHash!.toLowerCase())
      throw Error("Broadcast hash mismatch");
    return save("submitted");
  }
  if (
    deal.state !== 1 ||
    !deal.importerApproved ||
    deal.verification === 3 ||
    deal.terms.expiry < now
  )
    return save("blocked", "Trade is not an approved, unexpired Created trade");
  try {
    validateMetadata(deal, metadata);
  } catch {
    return save(
      "blocked",
      "Missing or mismatched shipment commitments; do not purchase",
    );
  }
  if (!(await d.chain.authorized(d.signer)))
    return save(
      "blocked",
      "Dedicated service signer lacks authorization or also holds Admin role",
    );
  if (j.state === "ready") {
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: canonical(request),
    };
    const probe = await d.fetch(d.url, init);
    if (probe.status !== 402 || !probe.headers.get("PAYMENT-REQUIRED"))
      return save("ready", "No x402 quote");
    const q = parsePaymentRequired(
      probe.headers.get("PAYMENT-REQUIRED")!,
      d.policy.network,
    );
    if (!q || q.amount <= 0n)
      return save("blocked", "Invalid Hedera payment quote");
    if (d.approvedAmount !== undefined && q.amount !== d.approvedAmount)
      return save(
        "blocked",
        "Quoted amount differs from explicit one-test approval; nothing paid",
      );
    if (
      d.approvedQuote &&
      (q.amount !== d.approvedQuote.amount ||
        q.payTo !== d.approvedQuote.payTo ||
        q.asset !== d.approvedQuote.asset ||
        q.network !== d.approvedQuote.network)
    )
      return save(
        "blocked",
        "Quoted payment differs from the explicitly approved merchant/network/token/amount; nothing paid",
      );
    console.log(
      `x402 quote: ${q.amount} atomic USDC (${Number(q.amount) / 1e6} USDC); merchant ${q.payTo}; network ${q.network}; trade ${id}`,
    );
    const decision = evaluate(
      {
        contract: contractScope(V2_CHAIN, d.chain.finance),
        dealId: `0x${id.toString(16).padStart(64, "0")}`,
        checkNo: 1,
        exporter: deal.exporter,
        network: q.network,
        asset: q.asset,
        payTo: q.payTo,
        amount: q.amount,
      },
      d.policy,
      d.ledger,
      (d.now ?? Date.now)(),
    );
    await d.audit({
      kind: "quote",
      dealId: `0x${id.toString(16).padStart(64, "0")}`,
      reason: `V2 ${decision.decision}: ${decision.reason}`,
    });
    if (decision.decision !== "allow") return save("blocked", decision.reason);
    j.purchaseStartedAt = (d.now ?? Date.now)();
    j.quote = {
      network: q.network,
      asset: q.asset,
      payTo: q.payTo,
      amount: q.amount.toString(),
    };
    save("purchasing");
    // Reserve the approved spend before a signed request can leave this process.
    // Uncertain payments continue counting against caps until reconciled.
    d.ledger.recordPayment({
      contract: contractScope(V2_CHAIN, d.chain.finance),
      dealId: `0x${id.toString(16).padStart(64, "0")}`,
      checkNo: 1,
      exporter: deal.exporter,
      payTo: q.payTo,
      amount: q.amount,
      at: j.purchaseStartedAt,
    });
    j.paymentRecorded = true;
    d.store.put(j);
    let paid: Response;
    try {
      paid = await d.payFetch(d.url, init, q);
    } catch {
      return save(
        "payment_unknown",
        "Paid request transport failed; reconcile before any retry",
      );
    }
    // Save the body even if settlement is uncertain, so later investigation has evidence.
    try {
      const body = await paid.text();
      if (body.length > 262144) throw Error("Report too large");
      j.response = JSON.parse(body);
    } catch {
      save(
        "payment_unknown",
        "Malformed paid response; settlement must be reconciled",
      );
      return j;
    }
    try {
      j.settlement = paid.headers.get("PAYMENT-RESPONSE")
        ? parseSettlement(paid.headers.get("PAYMENT-RESPONSE")!)
        : { success: false, error: "missing settlement header" };
    } catch {
      j.settlement = { success: false, error: "malformed settlement" };
    }
    d.store.put(j);
    if (
      paid.status !== 200 ||
      !j.settlement.success ||
      !j.settlement.txId ||
      !j.settlement.payer ||
      !(await d.confirmPayment(j.settlement, j.quote, j.purchaseStartedAt))
    )
      return save(
        "payment_unknown",
        "Settlement is failed or uncertain; no approval or automatic repurchase",
      );
    save("purchased");
  }
  if (j.state === "purchased") {
    const alreadyBound = d.store
      .list()
      .some(
        (other) =>
          other.jobId !== j!.jobId &&
          other.settlement?.txId === j!.settlement?.txId,
      );
    if (alreadyBound)
      return save("blocked", "Hedera payment already bound to another job");
    if (!j.paymentRecorded) {
      d.ledger.recordPayment({
        contract: contractScope(V2_CHAIN, d.chain.finance),
        dealId: `0x${id.toString(16).padStart(64, "0")}`,
        checkNo: 1,
        exporter: deal.exporter,
        payTo: j.quote!.payTo,
        amount: BigInt(j.quote!.amount),
        at: (d.now ?? Date.now)(),
        hederaTxId: j.settlement!.txId,
      });
      j.paymentRecorded = true;
      d.store.put(j);
    }
    if (!j.paymentAudited) {
      await d.audit({
        kind: "paid",
        dealId: `0x${id.toString(16).padStart(64, "0")}`,
        reason: `V2 paid evidence; mode=${d.mode}; job ${j.jobId}`,
        payment: {
          payTo: j.quote!.payTo,
          amount: j.quote!.amount,
          asset: j.quote!.asset,
          hederaTxId: j.settlement!.txId,
          payer: j.settlement!.payer,
        },
      });
      j.paymentAudited = true;
      d.store.put(j);
    }
    const report = j.response as Report;
    try {
      if (
        !report ||
        report.v !== 2 ||
        canonical(report.request) !== canonical(j.request) ||
        report.reportHash !==
          reportCommitment(
            j.request,
            report.result,
            report.evidence,
            report.reason,
          )
      )
        throw Error("Report binding mismatch");
    } catch {
      return save("untrusted", "Malformed or mismatched report");
    }
    j.reportHash = report.reportHash;
    d.store.put(j);
    if (report?.result === "insufficient_evidence")
      return save("insufficient_evidence", report.reason);
    let validated: Awaited<ReturnType<typeof reportValid>>;
    try {
      validated = await reportValid(d, j, deal);
    } catch (e) {
      return save("untrusted", (e as Error).message);
    }
    const { attestation: a, report: r } = validated;
    if (await d.chain.used(d.signer, a.nonce))
      return save(
        "blocked",
        "Attestation nonce already consumed; reconcile onchain event",
      );
    j.reportHash = r.reportHash;
    await d.audit({
      kind: "paid",
      dealId: `0x${id.toString(16).padStart(64, "0")}`,
      reason: `V2 report ${r.reportHash}; mode=${d.mode}`,
      payment: {
        payTo: j.quote!.payTo,
        amount: j.quote!.amount,
        asset: j.quote!.asset,
        hederaTxId: j.settlement!.txId,
        payer: j.settlement!.payer,
      },
    });
    if (d.relayMode === "manual-metamask") {
      j.manualPayload = publicMetaMaskPayload(j, a, r, d.chain.finance);
      return save(
        "awaiting_metamask",
        "Validated attestation persisted. Awaiting explicit MetaMask approval; no Whitechain transaction was signed or sent by backend.",
      );
    }
    if (!d.allowBroadcast)
      return save(
        "purchased",
        "Validated report retained; public transaction execution disabled",
      );
    const tx = await d.chain.prepare(a, d.signer, r.signature!);
    j.raw = tx.raw;
    j.txHash = tx.hash;
    save("prepared");
    const hash = await d.chain.broadcast(tx.raw);
    if (hash.toLowerCase() !== tx.hash.toLowerCase())
      throw Error("Broadcast hash mismatch");
    save("submitted");
    const result = await d.chain.receipt(hash, id, r.reportHash);
    if (result === "pending") return j;
    await d.audit({
      kind: "relayed",
      dealId: `0x${id.toString(16).padStart(64, "0")}`,
      whitechainTx: hash,
      reason: `V2 ${result}; report ${r.reportHash}`,
    });
    return save(
      result === "valid"
        ? "verified"
        : result === "reverted"
          ? "reverted"
          : "nonpassing",
    );
  }
  return j;
}
