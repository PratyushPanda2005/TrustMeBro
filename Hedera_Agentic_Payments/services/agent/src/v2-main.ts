import { readFileSync, writeFileSync } from "node:fs";
import { pullHostedTrades, sendHostedHeartbeat } from "./v2-dashboard.ts";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Address, type Hex } from "viem";
import { JobStore } from "@trustmebro/shared/job-store";
import { type Metadata } from "@trustmebro/shared/v2";
import {
  StartupError,
  loadV2Environment,
  diagnoseV2,
  probeV2,
  requireDedicatedSigner,
  startupStep,
  printStartupError,
  requireVariables,
  serviceAddress,
  existingFile,
  rpcFor,
  DEFAULT_RPC,
  requireDemoAcknowledgement,
} from "@trustmebro/shared/v2-startup";
import { v2Chain } from "./v2-chain.ts";

async function main() {
  const packageDir = fileURLToPath(new URL("../", import.meta.url)),
    workspaceDir = fileURLToPath(new URL("../../../", import.meta.url));
  const loaded = loadV2Environment(packageDir, workspaceDir);
  // Diagnostics wins over every live execution environment setting.
  if (process.argv.includes("--diagnose")) {
    await diagnoseV2("agent", packageDir, loaded);
    return;
  }
  const execute =
    !process.argv.includes("--read-only") &&
    process.env.V2_EXECUTE ===
      "I_AUTHORIZE_LIVE_HEDERA_PAYMENTS_AND_WHITECHAIN_RELAYS";
  const rpc = rpcFor("agent", process.env) ?? DEFAULT_RPC;
  const health = await probeV2(
    rpc,
    serviceAddress({ VERIFIER_ADDRESS: process.env.VERIFIER_ADDRESS }),
  );
  const blockText = process.env.WHITECHAIN_FROM_BLOCK?.trim() || "0";
  if (!/^\d+$/.test(blockText))
    throw new StartupError(
      "FROM_BLOCK_INVALID",
      "WHITECHAIN_FROM_BLOCK must be a nonnegative integer.",
      "Use the deployment block for efficient discovery; read-only mode defaults to zero.",
    );
  const mode = process.env.EVIDENCE_MODE ?? "real";
  if (!["real", "demo"].includes(mode))
    throw new StartupError(
      "EVIDENCE_MODE_INVALID",
      "EVIDENCE_MODE must be real or demo.",
      "Select real for authenticated verification.",
    );
  const poll = Number(process.env.V2_POLL_MS ?? 15000);
  if (!Number.isSafeInteger(poll) || poll < 1000)
    throw new StartupError(
      "POLL_INVALID",
      "V2_POLL_MS must be an integer of at least 1000.",
      "Correct the polling interval.",
    );
  const chain = v2Chain(
    rpc,
    execute ? (process.env.RELAYER_PRIVATE_KEY as Hex) : undefined,
    BigInt(blockText),
  );
  if (!execute) {
    console.log(
      "READ-ONLY discovery: no payment credentials, signer grant, metadata, locks, HCS writes or job mutations required.",
    );
    if (!health.signer)
      console.log(
        "Dedicated signer is not configured. Live execution remains unavailable.",
      );
    for (const id of await startupStep(
      "DISCOVERY_FAILED",
      "Check RPC log access and WHITECHAIN_FROM_BLOCK. No jobs were changed.",
      () => chain.confirmed(),
    )) {
      const deal = await startupStep(
        "TRADE_READ_FAILED",
        "Check RPC availability; this was a public read only.",
        () => chain.deal(id),
      );
      if (deal.importerApproved)
        console.log(
          `Trade ${id}: importer confirmed; state=${deal.state}; verification=${deal.verification}. No purchase or relay.`,
        );
    }
    return;
  }
  requireVariables(process.env, [
    "VERIFIER_ADDRESS",
    "WHITECHAIN_FROM_BLOCK",
    "V2_METADATA_FILE",
    "VERIFIER_PAYTO",
    "AGENT_HEDERA_ACCOUNT_ID",
    "AGENT_HEDERA_PRIVATE_KEY",
    "RELAYER_PRIVATE_KEY",
  ]);
  requireDedicatedSigner(health);
  requireDemoAcknowledgement(mode, process.env);
  if (mode === "demo")
    console.log(
      "SIMULATED SHIPMENT EVIDENCE: real testnet payment/relay, no independent real-world shipment verification.",
    );
  const file = existingFile(process.env.V2_METADATA_FILE, "V2_METADATA_FILE");
  const readMetadata = () => {
    const value = JSON.parse(readFileSync(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error();
    return value as Record<string, Metadata>;
  };
  let metadata = await startupStep(
    "METADATA_INVALID",
    "Correct V2_METADATA_FILE JSON; preserve original commitment preimages.",
    readMetadata,
  );
  // Imported only after explicit live execution has been requested and validated.
  const [
    { AuditLog, auditTailFile, makeAuditSink },
    { SpendLedger },
    { loadPolicy },
    { makePayFetch },
    { confirmHederaPayment },
    { processV2 },
  ] = await startupStep(
    "LIVE_DEPENDENCY_INIT_FAILED",
    "Check installed backend dependencies. No job has been acquired.",
    () =>
      Promise.all([
        import("@tmb/audit"),
        import("./ledger.ts"),
        import("./config.ts"),
        import("./payer.ts"),
        import("./v2-payment.ts"),
        import("./v2-flow.ts"),
      ]),
  );
  const policy = await startupStep(
    "POLICY_INVALID",
    "Check VERIFIER_PAYTO, HEDERA_USDC_TOKEN_ID and numeric POLICY_* settings.",
    () => loadPolicy(),
  );
  const payFetch = await startupStep(
    "PAYER_CONFIG_INVALID",
    "Check AGENT_HEDERA_ACCOUNT_ID and AGENT_HEDERA_PRIVATE_KEY formats without logging their values.",
    () =>
      makePayFetch({
        accountId: process.env.AGENT_HEDERA_ACCOUNT_ID!,
        privateKey: process.env.AGENT_HEDERA_PRIVATE_KEY!,
      }),
  );
  const root = resolve(packageDir, process.env.V2_STATE_DIR ?? ".state/v2");
  const store = await startupStep(
    "STATE_STORE_UNAVAILABLE",
    "Check V2_STATE_DIR access; do not delete or reset jobs.",
    () => new JobStore<import("./v2-flow.ts").Job>(join(root, "jobs")),
  );
  const unlock = await startupStep(
    "STATE_LOCKED",
    "Run npm.cmd run diagnose:v2 to inspect locks. Stop duplicate workers; do not remove lock or job files automatically.",
    () => new JobStore<{ jobId: string }>(join(root, "runtime")).lock(),
  );
  let audit: InstanceType<typeof AuditLog> | undefined;
  try {
    audit = await startupStep(
      "AUDIT_INIT_FAILED",
      "Check AUDIT_* settings and saved outbox. Existing job data has not been reset.",
      () =>
        new AuditLog(
          makeAuditSink().sink,
          auditTailFile(root, process.env.AUDIT_TOPIC_ID),
        ),
    );
    const ledger = await startupStep(
      "LEDGER_READ_FAILED",
      "Inspect the existing ledger without deleting or resetting it.",
      () => new SpendLedger(join(root, "ledger.json")),
    );
    const heartbeat = join(root, "agent-heartbeat.json");
    const tick = async () => {
      await pullHostedTrades(file);
      // The dashboard saves new trades here, so a running worker has to reread it.
      metadata = readMetadata();
      for (const id of await chain.confirmed()) {
        const deal = await chain.deal(id);
        if (!deal.importerApproved) continue;
        if (!metadata[id.toString()]) {
          console.log(
            `Trade ${id}: Insufficient Evidence (missing commitment preimages)`,
          );
          continue;
        }
        const job = await processV2(id, metadata[id.toString()], {
          chain,
          store,
          ledger,
          policy,
          signer: health.signer!.address as Address,
          mode: mode as "real" | "demo",
          url:
            (process.env.VERIFIER_URL ?? "http://localhost:4021") + "/verify",
          fetch,
          payFetch,
          audit: (e) => audit!.write(e).then(() => undefined),
          allowBroadcast: true,
          confirmPayment: (s, q, t) =>
            confirmHederaPayment(s, q, process.env.AGENT_HEDERA_ACCOUNT_ID!, t),
        });
        console.log(`Trade ${id}: ${job.state}`);
      }
    };
    do {
      // Jobs are durable and never repurchase, so one failed tick just retries.
      try {
        await tick();
        writeFileSync(heartbeat, JSON.stringify({ at: Date.now() }));
        await sendHostedHeartbeat();
      } catch (error) {
        if (process.argv.includes("--once")) throw error;
        console.error(`Tick failed: ${(error as Error).message}`);
      }
      if (process.argv.includes("--once")) break;
      await new Promise((r) => setTimeout(r, poll));
    } while (true);
  } finally {
    try {
      await audit?.close();
    } finally {
      unlock();
    }
  }
}
main().catch((error) => {
  printStartupError(error);
  process.exitCode = 1;
});
