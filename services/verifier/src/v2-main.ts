import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Hex } from "viem";
import { V2_FINANCE, type Report } from "@trustmebro/shared/v2";
import { JobStore } from "@trustmebro/shared/job-store";
import {
  chainReader,
  configuredProvider,
  createV2App,
  serviceSigner,
} from "./v2.js";
import { verifierConfig } from "./v2-config.js";
import {
  StartupError,
  loadV2Environment,
  diagnoseV2,
  probeV2,
  requireDedicatedSigner,
  startupStep,
  printStartupError,
  serviceAddress,
  existingFile,
} from "@trustmebro/shared/v2-startup";
import { consoleLogger } from "./log.js";
import { createPaymentMiddleware } from "./x402.js";

async function main() {
  const packageDir = fileURLToPath(new URL("../", import.meta.url));
  const loaded = loadV2Environment(packageDir);
  if (process.argv.includes("--diagnose")) {
    await diagnoseV2("verifier", packageDir, loaded);
    return;
  }
  const cfg = verifierConfig(process.env);
  const key = process.env.SERVICE_SIGNER_PRIVATE_KEY as Hex | undefined;
  const address = serviceAddress(process.env)!;
  if (
    process.env.VERIFIER_ADDRESS &&
    process.env.VERIFIER_ADDRESS.toLowerCase() !== address.toLowerCase()
  )
    throw new StartupError(
      "SIGNER_ADDRESS_MISMATCH",
      "VERIFIER_ADDRESS does not match the service key public address.",
      "Use the same dedicated service public address in both packages.",
    );
  const health = await probeV2(cfg.RPC_URL, address);
  requireDedicatedSigner(health);
  const mode = process.env.EVIDENCE_MODE ?? "real";
  if (!["real", "demo"].includes(mode))
    throw new StartupError(
      "EVIDENCE_MODE_INVALID",
      "EVIDENCE_MODE must be real or demo.",
      "Use real for authenticated provider integration, demo only for labeled fixtures.",
    );
  if (process.env.SHIPPING_PROVIDER_MODULE)
    existingFile(
      process.env.SHIPPING_PROVIDER_MODULE,
      "SHIPPING_PROVIDER_MODULE",
    );
  if (mode === "demo")
    existingFile(process.env.DEMO_EVIDENCE_FILE, "DEMO_EVIDENCE_FILE");
  const provider = await startupStep(
    "PROVIDER_INIT_FAILED",
    "Check the trusted provider module or demo fixture format. No provider secrets are logged.",
    () =>
      configuredProvider(
        mode,
        process.env.SHIPPING_PROVIDER_MODULE,
        process.env.DEMO_EVIDENCE_FILE,
      ),
  );
  const signer = serviceSigner(key!),
    reader = chainReader(cfg.RPC_URL);
  const store = await startupStep(
    "REPORT_STORE_UNAVAILABLE",
    "Check V2_REPORT_DIR permissions; preserve all existing reports.",
    () =>
      new JobStore<Report & { jobId: string }>(
        resolve(packageDir, process.env.V2_REPORT_DIR ?? ".state/v2-reports"),
      ),
  );
  const app = await startupStep(
    "PAYMENT_INIT_FAILED",
    "Check merchant payment/facilitator configuration; no purchase has been initiated.",
    () =>
      createV2App(
        { reader, provider, signer, store },
        createPaymentMiddleware(cfg, consoleLogger, "v2"),
      ),
  );
  await new Promise<void>((done, reject) => {
    const server = app.listen(cfg.PORT, "127.0.0.1", () => {
      console.log(
        `V2 merchant :${cfg.PORT}; mode=${mode}; finance=${V2_FINANCE}; signer=${signer.address}`,
      );
      done();
    });
    server.once("error", (error: NodeJS.ErrnoException) =>
      reject(
        new StartupError(
          error.code === "EADDRINUSE" ? "PORT_IN_USE" : "LISTEN_FAILED",
          "Cannot listen on the configured verifier port.",
          "Check PORT and the existing process using it. Do not kill other services automatically.",
        ),
      ),
    );
  });
}
main().catch((error) => {
  printStartupError(error);
  process.exitCode = 1;
});
