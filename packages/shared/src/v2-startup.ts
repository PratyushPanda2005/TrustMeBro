import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { createPublicClient, getAddress, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ADMIN,
  ADMIN_ROLE,
  V2_CHAIN,
  V2_FINANCE,
  VERIFIER_ROLE,
  financeV2Abi,
} from "./v2.js";

export class StartupError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly action: string,
  ) {
    super(message);
  }
}
export function requireDemoAcknowledgement(
  mode: string,
  env: NodeJS.ProcessEnv,
) {
  if (
    mode === "demo" &&
    env.V2_DEMO_ACK !== "I_UNDERSTAND_SHIPMENT_EVIDENCE_IS_SIMULATED"
  )
    throw new StartupError(
      "DEMO_ACK_REQUIRED",
      "Testnet demo evidence requires explicit acknowledgment; it is not authenticated shipment data.",
      "Only after approval for testnet transactions, set V2_DEMO_ACK=I_UNDERSTAND_SHIPMENT_EVIDENCE_IS_SIMULATED. The caller must also enforce its explicit execution gate (V2_EXECUTE or the single-payment manual acknowledgment).",
    );
}
export async function startupStep<T>(
  code: string,
  action: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof StartupError) throw error;
    throw new StartupError(code, "Initialization check failed.", action);
  }
}
export function printStartupError(error: unknown) {
  if (error instanceof StartupError)
    console.error(`[${error.code}] ${error.message}\nAction: ${error.action}`);
  else
    console.error(
      "[STARTUP_UNEXPECTED] Startup failed. Run npm.cmd run diagnose:v2 for read-only configuration, RPC and job checks. Raw errors are suppressed to protect secrets.",
    );
}
export const missingVariables = (env: NodeJS.ProcessEnv, names: string[]) =>
  names.filter((name) => !env[name]?.trim());
export function requireVariables(env: NodeJS.ProcessEnv, names: string[]) {
  const missing = missingVariables(env, names);
  if (missing.length)
    throw new StartupError(
      "CONFIG_MISSING",
      `Missing environment variables: ${missing.join(", ")}`,
      "Set these names in the package .env or shell. Never paste secret values into logs or chat.",
    );
}
/** Shell > explicit file OR package .env > Hedera workspace .env. Paths belong to their defining file. */
export function loadV2Environment(
  packageDir: string,
  workspaceDir?: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const files = env.V2_ENV_FILE
    ? [resolve(env.V2_ENV_FILE)]
    : [
        join(packageDir, ".env"),
        ...(workspaceDir ? [join(workspaceDir, ".env")] : []),
      ];
  if (env.V2_ENV_FILE && !existsSync(files[0]))
    throw new StartupError(
      "ENV_FILE_MISSING",
      "V2_ENV_FILE does not exist.",
      "Point V2_ENV_FILE to an existing local file; its contents will not be printed.",
    );
  const loaded: string[] = [];
  const paths = [
    "V2_METADATA_FILE",
    "SHIPPING_PROVIDER_MODULE",
    "DEMO_EVIDENCE_FILE",
  ];
  for (const file of files) {
    if (!existsSync(file)) continue;
    // Native parser, isolated from the process environment to preserve provenance and precedence.
    let values: NodeJS.ProcessEnv;
    try {
      values = readEnv(file);
    } catch {
      throw new StartupError(
        "ENV_FILE_INVALID",
        "Cannot read environment file.",
        "Check file permissions and dotenv syntax; values are never logged.",
      );
    }
    for (const [key, value] of Object.entries(values))
      if (env[key] === undefined) {
        env[key] = value;
        if (paths.includes(key) && value && !isAbsolute(value))
          env[key] = resolve(dirname(file), value);
      }
    loaded.push(file);
  }
  return loaded;
}
// util.parseEnv does not mutate process.env and supports Node's dotenv quoting rules.
import { parseEnv } from "node:util";
const readEnv = (file: string) => parseEnv(readFileSync(file, "utf8"));
export const rpcFor = (kind: "verifier" | "agent", env: NodeJS.ProcessEnv) =>
  kind === "verifier"
    ? env.RPC_URL?.trim() || env.WHITECHAIN_RPC?.trim()
    : env.WHITECHAIN_RPC?.trim() || env.RPC_URL?.trim();
export const DEFAULT_RPC = "https://rpc.testnet.whitechain.io";
export function validateRpc(value: string) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) throw Error();
  } catch {
    throw new StartupError(
      "RPC_CONFIG_INVALID",
      "Invalid Whitechain RPC URL.",
      "Set RPC_URL (verifier) or WHITECHAIN_RPC (agent) to a valid HTTP(S) RPC endpoint.",
    );
  }
  return value;
}
export function serviceAddress(env: NodeJS.ProcessEnv): Address | undefined {
  if (env.SERVICE_SIGNER_PRIVATE_KEY) {
    try {
      return privateKeyToAccount(
        env.SERVICE_SIGNER_PRIVATE_KEY as `0x${string}`,
      ).address;
    } catch {
      throw new StartupError(
        "SIGNER_KEY_INVALID",
        "Invalid SERVICE_SIGNER_PRIVATE_KEY.",
        "Use an existing dedicated EVM service key in the verifier only. Do not use the Admin key.",
      );
    }
  }
  if (env.VERIFIER_ADDRESS) {
    try {
      return getAddress(env.VERIFIER_ADDRESS);
    } catch {
      throw new StartupError(
        "SIGNER_ADDRESS_INVALID",
        "Invalid VERIFIER_ADDRESS.",
        "Set the public address of the dedicated service signer, not a private key.",
      );
    }
  }
}
export async function probeV2(rpc: string, signer?: Address) {
  const c = createPublicClient({
    transport: http(validateRpc(rpc), { timeout: 10000, retryCount: 0 }),
  });
  const chainId = await startupStep(
    "RPC_UNREACHABLE",
    "Check RPC URL, network access and endpoint availability; no transactions are needed.",
    () => c.getChainId(),
  );
  if (chainId !== V2_CHAIN)
    throw new StartupError(
      "CHAIN_MISMATCH",
      `RPC chain ID is ${chainId}; expected ${V2_CHAIN}.`,
      "Select Whitechain Sepolia. Do not change the deployed Finance address.",
    );
  const read = (functionName: string, args: readonly unknown[] = []) =>
    c.readContract({
      address: V2_FINANCE,
      abi: financeV2Abi,
      functionName,
      args,
    } as any) as Promise<any>;
  const result = await startupStep(
    "FINANCE_READ_FAILED",
    "Check RPC access to the deployed Whitechain V2 Finance contract.",
    async () => {
      const [code, d, paymentToken, reputation, note, adminVerifier] =
        await Promise.all([
          c.getCode({ address: V2_FINANCE }),
          read("eip712Domain"),
          read("paymentToken"),
          read("reputation"),
          read("note"),
          read("hasRole", [VERIFIER_ROLE, ADMIN]),
        ]);
      if (
        !code ||
        code === "0x" ||
        d[1] !== "TrustMeBro Trade Finance" ||
        d[2] !== "2" ||
        d[3] !== BigInt(V2_CHAIN) ||
        d[4].toLowerCase() !== V2_FINANCE.toLowerCase()
      )
        throw new StartupError(
          "FINANCE_DOMAIN_MISMATCH",
          "Deployed code/domain does not match V2.",
          "Verify the RPC network and approved deployment.",
        );
      const roles = signer
        ? {
            address: signer,
            verifierRole: await read("hasRole", [VERIFIER_ROLE, signer]),
            adminRole: await read("hasRole", [ADMIN_ROLE, signer]),
          }
        : undefined;
      if (
        paymentToken.toLowerCase() !==
          "0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7" ||
        reputation.toLowerCase() !==
          "0xdeda59a4fe774a0f553e9fbea78d4bd96f0c2673" ||
        note.toLowerCase() !== "0x7a403a382fc3afbe985ba1a00ba973674167bad0"
      )
        throw new StartupError(
          "FINANCE_BINDINGS_MISMATCH",
          "Finance companion/token bindings differ from the approved deployment.",
          "Verify the RPC and supplied deployment addresses. No contract changes are attempted.",
        );
      return {
        chainId,
        finance: V2_FINANCE,
        domain: { name: d[1], version: d[2] },
        paymentToken,
        reputation,
        note,
        adminHasVerifierRole: adminVerifier,
        signer: roles,
      };
    },
  );
  return result;
}
export function requireDedicatedSigner(
  result: Awaited<ReturnType<typeof probeV2>>,
) {
  const signer = result.signer;
  if (!signer)
    throw new StartupError(
      "SIGNER_NOT_CONFIGURED",
      "No dedicated service signer is configured.",
      "Configure SERVICE_SIGNER_PRIVATE_KEY in verifier and its public VERIFIER_ADDRESS in agent.",
    );
  if (signer.adminRole || signer.address.toLowerCase() === ADMIN.toLowerCase())
    throw new StartupError(
      "ADMIN_SIGNER_FORBIDDEN",
      "Configured signer is an Admin account.",
      "Use a separate existing dedicated service account; never copy the Admin private key into backend configuration.",
    );
  if (!signer.verifierRole)
    throw new StartupError(
      "VERIFIER_ROLE_MISSING",
      `Service signer ${signer.address} lacks VERIFIER_ROLE.`,
      "Ask the Admin to review authorization later. This command will not grant roles or submit transactions.",
    );
}
export function inspectJobs(directory: string) {
  const folder = join(directory, "jobs");
  const states: Record<string, number> = {};
  let count = 0,
    unreadable = 0;
  if (existsSync(folder))
    for (const file of readdirSync(folder).filter((f) =>
      /^0x[\da-f]{64}\.json$/i.test(f),
    )) {
      try {
        const j = JSON.parse(readFileSync(join(folder, file), "utf8"));
        const known = [
          "ready",
          "purchasing",
          "payment_unknown",
          "purchased",
          "insufficient_evidence",
          "untrusted",
          "prepared",
          "submitted",
          "awaiting_metamask",
          "metamask_submitted",
          "verified",
          "nonpassing",
          "reverted",
          "blocked",
        ];
        const state = known.includes(j.state) ? j.state : "unknown";
        states[state] = (states[state] ?? 0) + 1;
        count++;
      } catch {
        unreadable++;
      }
    }
  const locks = [
    "runtime/worker.lock",
    "runtime/worker.lock.gate",
    "jobs/worker.lock",
    "jobs/worker.lock.gate",
  ].filter((f) => existsSync(join(directory, f)));
  return {
    directory,
    exists: existsSync(directory),
    count,
    states,
    unreadable,
    locks,
  };
}
export function existingFile(value: string | undefined, name: string) {
  if (!value)
    throw new StartupError(
      "CONFIG_MISSING",
      `Missing environment variable: ${name}`,
      "Configure the existing file path. Do not invent shipment data.",
    );
  try {
    if (!statSync(value).isFile()) throw Error();
  } catch {
    throw new StartupError(
      "CONFIG_FILE_MISSING",
      `${name} does not identify a readable file.`,
      "Correct the configured path; paths inside .env resolve relative to that file.",
    );
  }
  return value;
}
export async function diagnoseV2(
  kind: "verifier" | "agent",
  packageDir: string,
  loaded: string[],
) {
  console.log(
    "READ-ONLY diagnostics: no signing, locks, payments, HCS writes, role grants or job mutations.",
  );
  console.log(
    "Environment files loaded:",
    loaded.length ? loaded.join(", ") : "none; shell/defaults only",
  );
  const required =
    kind === "verifier"
      ? ["SERVICE_SIGNER_PRIVATE_KEY", "VERIFIER_PAYTO"]
      : [
          "VERIFIER_ADDRESS",
          "WHITECHAIN_FROM_BLOCK",
          "V2_METADATA_FILE",
          "VERIFIER_PAYTO",
          "AGENT_HEDERA_ACCOUNT_ID",
          "AGENT_HEDERA_PRIVATE_KEY",
          "RELAYER_PRIVATE_KEY",
        ];
  const missing = missingVariables(process.env, required);
  console.log(
    `${kind === "agent" ? "Live execution" : "Merchant"} missing variables (names only):`,
    missing.join(", ") || "none",
  );
  if (kind === "agent") {
    const jobs = await startupStep(
      "JOB_INSPECTION_FAILED",
      "Check V2_STATE_DIR read permissions. Do not delete or reset saved jobs.",
      () =>
        inspectJobs(
          resolve(packageDir, process.env.V2_STATE_DIR ?? ".state/v2"),
        ),
    );
    console.log("Persisted jobs (read-only):", JSON.stringify(jobs));
  }
  const mode = process.env.EVIDENCE_MODE || "real";
  console.log(
    "Evidence mode:",
    mode === "demo"
      ? "SIMULATED demo - not authenticated shipping evidence"
      : "real",
  );
  if (mode === "demo")
    console.log(
      "Demo evidence:",
      kind === "agent"
        ? "agent expects explicitly demo-labeled reports from the merchant"
        : process.env.DEMO_EVIDENCE_FILE &&
            existsSync(process.env.DEMO_EVIDENCE_FILE)
          ? "fixture file exists; freshness is validated when purchased"
          : "DEMO_EVIDENCE_FILE is missing or unavailable",
    );
  else
    console.log(
      "Provider adapter:",
      process.env.SHIPPING_PROVIDER_MODULE
        ? "configured; module not executed by diagnostics"
        : "not configured; real evidence remains Insufficient Evidence",
    );
  if (kind === "agent" && process.env.V2_METADATA_FILE) {
    try {
      const metadata = JSON.parse(
        readFileSync(process.env.V2_METADATA_FILE, "utf8"),
      );
      console.log(
        "Configured trade metadata entries:",
        Object.keys(metadata).filter((id) => /^\d+$/.test(id)).length,
      );
    } catch {
      console.log(
        "Trade metadata: unreadable or invalid; no file has been changed",
      );
    }
  }
  let signer: Address | undefined;
  try {
    signer = serviceAddress(
      kind === "agent"
        ? { VERIFIER_ADDRESS: process.env.VERIFIER_ADDRESS }
        : process.env,
    );
  } catch (error) {
    printStartupError(error);
  }
  console.log(
    "Dedicated signer:",
    signer ??
      "not configured; cannot establish whether an external service key exists",
  );
  const rpc = validateRpc(rpcFor(kind, process.env) ?? DEFAULT_RPC),
    url = new URL(rpc);
  console.log("RPC endpoint (origin only):", url.origin);
  const result = await probeV2(rpc, signer);
  console.log("Public chain health:", JSON.stringify(result));
  if (result.signer) {
    try {
      requireDedicatedSigner(result);
      console.log("Dedicated signer authorization: PASS");
    } catch (e) {
      printStartupError(e);
    }
  }
  console.log(
    "Startup configuration ready:",
    missing.length === 0
      ? "check remaining file/provider requirements above"
      : "NO; configure the listed names before normal startup",
  );
  return result;
}
