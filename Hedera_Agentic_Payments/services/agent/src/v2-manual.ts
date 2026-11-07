import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Hex } from "viem";
import { JobStore } from "@trustmebro/shared/job-store";
import {
  V2_CHAIN,
  jobKey,
  canonical,
  validateMetadata,
  type Metadata,
  type VerificationRequest,
} from "@trustmebro/shared/v2";
import {
  StartupError,
  loadV2Environment,
  probeV2,
  requireDedicatedSigner,
  serviceAddress,
  requireVariables,
  requireDemoAcknowledgement,
  printStartupError,
  DEFAULT_RPC,
  rpcFor,
} from "@trustmebro/shared/v2-startup";
import { v2Chain } from "./v2-chain.ts";
import { processV2, type Job } from "./v2-flow.ts";
import { reconcileMetaMask } from "./v2-metamask.ts";
import { SpendLedger, contractScope } from "./ledger.ts";
import { parsePaymentRequired } from "./x402.ts";
import { evaluate } from "./policy.ts";

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const paymentAck = () => {
  if (process.env.V2_MANUAL_PAYMENT_ACK !== "I_AUTHORIZE_ONE_HEDERA_X402_TEST")
    throw new StartupError(
      "SINGLE_PAYMENT_APPROVAL_REQUIRED",
      "Single-test Hedera payment approval is absent.",
      "Review quote first; set V2_MANUAL_PAYMENT_ACK only after explicit approval. No Whitechain key is used.",
    );
};
async function main() {
  const pkg = fileURLToPath(new URL("../", import.meta.url));
  loadV2Environment(pkg, fileURLToPath(new URL("../../../", import.meta.url)));
  const command = process.argv[2],
    idText = arg("trade-id");
  const recovery = process.argv.includes("--recovery");
  const version = arg("recovery-version");
  if (
    version &&
    (!recovery ||
      !/^[1-9]\d*$/.test(version) ||
      !Number.isSafeInteger(Number(version)))
  )
    throw Error("Supply --recovery and a positive --recovery-version");
  if (recovery && !["export", "reconcile"].includes(command))
    throw new StartupError(
      "RECOVERY_READ_ONLY_RELAY_HANDOFF",
      "--recovery supports export or reconcile only.",
      "No purchase or new report can be triggered through the recovery handoff.",
    );
  if (
    !["quote", "purchase", "export", "reconcile"].includes(command) ||
    !idText ||
    !/^\d+$/.test(idText)
  )
    throw new StartupError(
      "MANUAL_COMMAND_INVALID",
      "Use quote, purchase, export or reconcile with --trade-id=ACTUAL_ID.",
      "Manual-MetaMask mode always processes exactly one explicit trade.",
    );
  const health = await probeV2(
    rpcFor("agent", process.env) ?? DEFAULT_RPC,
    serviceAddress({ VERIFIER_ADDRESS: process.env.VERIFIER_ADDRESS }),
  );
  const chain = v2Chain(
    rpcFor("agent", process.env) ?? DEFAULT_RPC,
    undefined,
    BigInt(process.env.WHITECHAIN_FROM_BLOCK || "12365020"),
  );
  const id = BigInt(idText),
    deal = await chain.deal(id),
    key = jobKey(id, deal.termsHash, chain.finance),
    root = resolve(pkg, process.env.V2_STATE_DIR || ".state/v2"),
    recoveryRoot =
      version && version !== "1"
        ? join(root, "recovery", "versions", version)
        : join(root, "recovery"),
    jobDir = recovery ? join(recoveryRoot, "jobs") : join(root, "jobs"),
    jobFile = join(jobDir, key + ".json");
  if (command === "reconcile") {
    const hash = arg("tx-hash");
    if (!hash || !/^0x[\da-f]{64}$/i.test(hash) || !existsSync(jobFile))
      throw new StartupError(
        "RECONCILE_INPUT_INVALID",
        "Saved job and actual MetaMask transaction hash are required.",
        "No purchase, signing or broadcast occurs during reconciliation.",
      );
    const job = await reconcileMetaMask(
      new JobStore<Job>(jobDir),
      key,
      hash as Hex,
      chain,
    );
    console.log(
      JSON.stringify({
        tradeId: idText,
        jobState: job.state,
        hederaTx: job.settlement?.txId,
        whitechainTx: job.txHash,
        reportHash: job.reportHash,
        mode: job.manualPayload?.evidenceLabel,
      }),
    );
    if (process.argv.includes("--publish-audit")) {
      paymentAck();
      const { AuditLog, auditTailFile, makeAuditSink } =
        await import("@tmb/audit");
      const audit = new AuditLog(
        makeAuditSink().sink,
        auditTailFile(root, process.env.AUDIT_TOPIC_ID),
      );
      try {
        await audit.write({
          kind: "relayed",
          dealId: `0x${id.toString(16).padStart(64, "0")}`,
          whitechainTx: job.txHash,
          reason: `manual-MetaMask ${job.state}; report ${job.reportHash}`,
          payment: job.quote && {
            payTo: job.quote.payTo,
            amount: job.quote.amount,
            asset: job.quote.asset,
            hederaTxId: job.settlement?.txId,
            payer: job.settlement?.payer,
          },
        });
      } finally {
        await audit.close();
      }
    }
    return;
  }
  requireDedicatedSigner(health);
  const existing: Job | undefined = existsSync(jobFile)
    ? JSON.parse(readFileSync(jobFile, "utf8"))
    : undefined;
  const exportPayload = async (job: Job) => {
    if (!job.manualPayload)
      throw new StartupError(
        "ATTESTATION_UNAVAILABLE",
        "No validated manual-MetaMask attestation is saved.",
        "Do not repurchase a paid or uncertain job; inspect its state.",
      );
    if (
      !job.manualPayload.attestation ||
      BigInt(job.manualPayload.attestation.expiry) < (await chain.time())
    )
      throw new StartupError(
        "ATTESTATION_EXPIRED",
        "Saved attestation has expired.",
        "Do not submit or repurchase automatically. Inspect the existing paid job before planning a fresh report.",
      );
    const folder = recovery
      ? join(recoveryRoot, "metamask")
      : join(root, "metamask");
    mkdirSync(folder, { recursive: true });
    const file = join(folder, `v2-attestation-trade-${idText}.json`);
    const json = JSON.stringify(job.manualPayload, null, 2) + "\n";
    if (recovery && existsSync(file)) {
      if (readFileSync(file, "utf8") !== json)
        throw Error("Existing recovery payload differs; refusing overwrite");
    } else writeFileSync(file, json, recovery ? { flag: "wx" } : undefined);
    console.log(`Awaiting your MetaMask approval. Public payload: ${file}`);
    console.log(
      `DEMO label: ${job.manualPayload.evidenceLabel}; expiry ${job.manualPayload.attestation.expiry}; no backend Whitechain transaction sent.`,
    );
  };
  if (command === "export") {
    if (!existing)
      throw new StartupError(
        "JOB_MISSING",
        "No saved job for this trade.",
        "Review a quote before authorizing a single purchase.",
      );
    await exportPayload(existing);
    return;
  }
  // A payment_unknown job only rechecks its saved payment in processV2. It can't pay again.
  if (
    existing &&
    existing.state !== "ready" &&
    existing.state !== "payment_unknown"
  ) {
    console.log(`Existing job ${existing.state}; no new purchase.`);
    if (existing.manualPayload) await exportPayload(existing);
    return;
  }
  if (
    deal.state !== 1 ||
    !deal.importerApproved ||
    deal.verification === 1 ||
    deal.verification === 3 ||
    deal.terms.expiry < (await chain.time())
  )
    throw new StartupError(
      "TRADE_NOT_READY",
      "Trade must be unexpired, Created, importer-confirmed and not already Valid/Rejected.",
      "Bind the actual new trade before requesting a report.",
    );
  requireVariables(process.env, ["V2_METADATA_FILE", "VERIFIER_PAYTO"]);
  const metadata = (
    JSON.parse(readFileSync(process.env.V2_METADATA_FILE!, "utf8")) as Record<
      string,
      Metadata
    >
  )[idText];
  if (!metadata)
    throw new StartupError(
      "METADATA_MISSING",
      "No metadata entry for the selected trade.",
      "Run setup:v2-demo -- --bind-trade=ACTUAL_ID first.",
    );
  validateMetadata(deal, metadata);
  const { loadPolicy } = await import("./config.ts"),
    policy = loadPolicy(),
    ledger = new SpendLedger(join(root, "ledger.json"));
  const request: VerificationRequest = {
    jobId: key,
    tradeId: idText,
    termsHash: deal.termsHash,
    chainId: V2_CHAIN,
    finance: chain.finance,
    metadata,
  };
  const url = (process.env.VERIFIER_URL || "http://localhost:4021") + "/verify";
  if (command === "quote") {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: canonical(request),
    });
    if (response.status !== 402 || !response.headers.get("PAYMENT-REQUIRED"))
      throw new StartupError(
        "QUOTE_UNAVAILABLE",
        "Merchant did not return an x402 quote.",
        "Check merchant health, signer role and endpoint; no payment was signed.",
      );
    const q = parsePaymentRequired(
      response.headers.get("PAYMENT-REQUIRED")!,
      policy.network,
    );
    if (!q) throw Error("No approved network quote");
    const decision = evaluate(
      {
        contract: contractScope(V2_CHAIN, chain.finance),
        dealId: `0x${id.toString(16).padStart(64, "0")}`,
        checkNo: 1,
        exporter: deal.exporter,
        ...q,
      },
      policy,
      ledger,
      Date.now(),
    );
    console.log(
      JSON.stringify({
        tradeId: idText,
        relayMode: "manual-metamask",
        evidenceLabel:
          process.env.EVIDENCE_MODE === "demo"
            ? "DEMO_SIMULATION"
            : "AUTHENTICATED_PROVIDER",
        network: q.network,
        asset: q.asset,
        merchant: q.payTo,
        atomicUSDC: q.amount.toString(),
        USDC: Number(q.amount) / 1e6,
        policy: decision,
        paid: false,
      }),
    );
    return;
  }
  paymentAck();
  requireDemoAcknowledgement(process.env.EVIDENCE_MODE || "real", process.env);
  const amount = arg("approve-payment");
  if (!amount || !/^\d+$/.test(amount) || BigInt(amount) <= 0n)
    throw new StartupError(
      "EXACT_AMOUNT_REQUIRED",
      "--approve-payment must match the reviewed atomic USDC quote.",
      "Use the amount from the unpaid quote; never approve an unlimited budget.",
    );
  requireVariables(process.env, [
    "AGENT_HEDERA_ACCOUNT_ID",
    "AGENT_HEDERA_PRIVATE_KEY",
  ]);
  if (!/^0\.0\.\d+$/.test(process.env.VERIFIER_PAYTO!))
    throw Error("Approve exactly one merchant");
  const mode = process.env.EVIDENCE_MODE || "real";
  if (mode !== "real" && mode !== "demo") throw Error("Invalid evidence mode");
  const { makePayFetch } = await import("./payer.ts"),
    { confirmHederaPayment } = await import("./v2-payment.ts"),
    { AuditLog, auditTailFile, makeAuditSink } = await import("@tmb/audit");
  const runtimeUnlock = new JobStore<{ jobId: string }>(
    join(root, "runtime"),
  ).lock();
  let audit: InstanceType<typeof AuditLog> | undefined;
  try {
    audit = new AuditLog(
      makeAuditSink().sink,
      auditTailFile(root, process.env.AUDIT_TOPIC_ID),
    );
    const job = await processV2(id, metadata, {
      chain,
      store: new JobStore<Job>(jobDir),
      ledger,
      policy,
      signer: health.signer!.address,
      mode,
      url,
      fetch,
      payFetch: makePayFetch({
        accountId: process.env.AGENT_HEDERA_ACCOUNT_ID!,
        privateKey: process.env.AGENT_HEDERA_PRIVATE_KEY!,
      }),
      audit: (e) => audit!.write(e).then(() => undefined),
      allowBroadcast: false,
      relayMode: "manual-metamask",
      approvedQuote: {
        network: "hedera:testnet",
        asset: "0.0.429274",
        payTo: process.env.VERIFIER_PAYTO!,
        amount: BigInt(amount),
      },
      confirmPayment: (s, q, t) =>
        confirmHederaPayment(s, q, process.env.AGENT_HEDERA_ACCOUNT_ID!, t),
    });
    console.log(`Trade ${id}: ${job.state}`);
    if (job.manualPayload) await exportPayload(job);
  } finally {
    try {
      await audit?.close();
    } finally {
      runtimeUnlock();
    }
  }
}
main().catch((error) => {
  printStartupError(error);
  process.exitCode = 1;
});
