import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { execFileSync } from "node:child_process";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  getAddress,
  formatEther,
  type Address,
  type Hex,
} from "viem";
import {
  selectEvmCredential,
  validateHederaSetup,
} from "../src/v2-setup-config.js";
import {
  StartupError,
  startupStep,
  printStartupError,
} from "@trustmebro/shared/v2-startup";
import {
  ADMIN,
  V2_FINANCE,
  V2_CHAIN,
  VERIFIER_ROLE,
  ADMIN_ROLE,
  financeV2Abi,
  prepareTrade,
  validateMetadata,
  jobKey,
  type Deal,
  type Metadata,
  type Evidence,
} from "@trustmebro/shared/v2";

// Local configuration and public reads only. No wallet client, signature or broadcast.
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const merchantDir = join(repo, "services/verifier"),
  agentDir = join(repo, "Hedera_Agentic_Payments/services/agent");
const setupDir = join(merchantDir, ".state/v2-demo"),
  metadataFile = join(agentDir, ".state/v2/trade-metadata.json");
const manifest = JSON.parse(
  readFileSync(
    join(repo, "Hedera_Agentic_Payments/deployments/hedera-testnet.json"),
    "utf8",
  ),
);
const readEnv = (file: string) => {
  if (!existsSync(file)) return {};
  try {
    return parseEnv(readFileSync(file, "utf8"));
  } catch {
    throw new StartupError(
      "ENV_READ_FAILED",
      "Cannot read or parse a local environment file.",
      "Check file access and dotenv encoding/syntax. Contents will not be logged.",
    );
  }
};
function readSetupJson(file: string, label: string): any {
  if (!existsSync(file))
    throw new StartupError(
      "DEMO_FILE_MISSING",
      `${label} is missing.`,
      "Run setup to prepare the local demo files before binding or checking their contents. Do not reset existing jobs.",
    );
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new StartupError(
      "DEMO_JSON_INVALID",
      `${label} cannot be read as JSON.`,
      "Check the local file format and read permissions. No contents are logged.",
    );
  }
}
const safeWrite = (file: string, body: string) => {
  try {
    execFileSync("git", ["check-ignore", "-q", "--", file], {
      cwd: repo,
      stdio: "ignore",
    });
  } catch {
    throw new StartupError(
      "LOCAL_FILE_NOT_IGNORED",
      "Refusing to write a local configuration file that Git does not ignore.",
      "Check .gitignore for the service .env and .state directories before retrying.",
    );
  }
  try {
    mkdirSync(resolve(file, ".."), { recursive: true });
    writeFileSync(file, body, { mode: 0o600 });
  } catch {
    throw new StartupError(
      "LOCAL_WRITE_FAILED",
      "Could not write an ignored local setup file.",
      "Check local file permissions. No blockchain transaction was attempted.",
    );
  }
};
const jsonWrite = (file: string, value: unknown) =>
  safeWrite(
    file,
    JSON.stringify(
      value,
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ) + "\n",
  );
const envWrite = (file: string, env: Record<string, string | undefined>) =>
  safeWrite(
    file,
    Object.entries(env)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => {
        if (/[\r\n]/.test(v!))
          throw new StartupError(
            "ENV_MULTILINE_UNSUPPORTED",
            `${k} contains an unsupported multiline value.`,
            "Use the original single-line credential format privately.",
          );
        return `${k}=${JSON.stringify(v)}`;
      })
      .join("\n") + "\n",
  );
const arg = (name: string) =>
  process.argv.find((x) => x.startsWith(`--${name}=`))?.slice(name.length + 3);
const client = createPublicClient({
  transport: http("https://rpc.testnet.whitechain.io", {
    timeout: 15000,
    retryCount: 1,
  }),
});
const read = async (name: string, args: readonly unknown[] = []) =>
  startupStep(
    "RPC_CONTRACT_READ_FAILED",
    `Check Whitechain RPC access for public Finance.${name} reads. No transaction is sent.`,
    () =>
      client.readContract({
        address: V2_FINANCE,
        abi: financeV2Abi,
        functionName: name,
        args,
      } as any) as Promise<any>,
  );

async function main() {
  const chainId = await startupStep(
    "RPC_UNREACHABLE",
    "Check access to https://rpc.testnet.whitechain.io; setup only performs public reads.",
    () => client.getChainId(),
  );
  if (chainId !== V2_CHAIN)
    throw new StartupError(
      "CHAIN_MISMATCH",
      `RPC chain ID ${chainId} differs from ${V2_CHAIN}.`,
      "Select Whitechain Sepolia. Do not change the deployed contracts.",
    );
  const tradeId = arg("bind-trade") ?? arg("check-trade");
  if (tradeId) {
    if (!/^\d+$/.test(tradeId))
      throw new StartupError(
        "TRADE_ID_INVALID",
        "Trade ID must be a decimal integer.",
        "Use the actual TradeCreated ID, not a predicted ID or transaction hash.",
      );
    const d = (await read("getDeal", [BigInt(tradeId)])) as Deal;
    console.log(
      JSON.stringify({
        tradeId,
        state: d.state,
        importerApproved: d.importerApproved,
        verification: d.verification,
      }),
    );
    if (arg("check-trade")) {
      const configuredState =
        readEnv(join(agentDir, ".env")).V2_STATE_DIR || ".state/v2";
      const file = join(
        resolve(agentDir, configuredState),
        "jobs",
        jobKey(BigInt(tradeId), d.termsHash) + ".json",
      );
      if (existsSync(file)) {
        const j = readSetupJson(file, "Saved verification job");
        console.log(
          JSON.stringify({
            jobState: j.state,
            hederaTx: j.settlement?.txId,
            whitechainTx: j.txHash,
            reportHash: j.reportHash,
            evidenceMode: j.response?.evidence?.mode,
          }),
        );
      }
      if (d.state === 1 && d.verification === 1) {
        await read("quote", [BigInt(tradeId)]);
        console.log("Trade is eligible for funding.");
      }
      return;
    }
    const pending = readSetupJson(
      join(setupDir, "pending-trade.json"),
      "Prepared demo trade",
    );
    if (d.state !== 1 || !d.importerApproved)
      throw new StartupError(
        "TRADE_NOT_BINDABLE",
        "Trade must be Created and importer-confirmed; settled trades cannot be reused.",
        "Create and confirm the prepared trade through the owners wallets after human approval, then bind its actual ID.",
      );
    if (
      d.exporter.toLowerCase() !== pending.exporter.toLowerCase() ||
      d.terms.importer.toLowerCase() !== pending.importer.toLowerCase()
    )
      throw new StartupError(
        "TRADE_PARTIES_MISMATCH",
        "Trade parties differ from the prepared demo.",
        "Use the matching trade ID and original exporter/importer agreement.",
      );
    await startupStep(
      "TRADE_COMMITMENT_MISMATCH",
      "Use the original matching shipment metadata; do not substitute hashes to bypass V2 integrity checks.",
      () => validateMetadata(d, pending.metadata as Metadata),
    );
    for (const [name, value] of Object.entries(pending.terms)) {
      const actual = (d.terms as any)[name];
      if (String(actual).toLowerCase() !== String(value).toLowerCase())
        throw new StartupError(
          "TRADE_TERMS_MISMATCH",
          "Immutable trade terms differ from the prepared demo.",
          "Use the exact prepared agreement or its correct trade ID. Existing terms cannot be edited.",
        );
    }
    const metadata = existsSync(metadataFile)
      ? readSetupJson(metadataFile, "Trade metadata")
      : {};
    if (
      metadata[tradeId] &&
      JSON.stringify(metadata[tradeId]) !== JSON.stringify(pending.metadata)
    )
      throw new StartupError(
        "METADATA_OVERWRITE_REFUSED",
        "Different metadata already exists for this trade.",
        "Inspect the existing entry; setup will not replace it or reset a verification job.",
      );
    metadata[tradeId] = pending.metadata;
    jsonWrite(metadataFile, metadata);
    const evidence = readSetupJson(
      join(setupDir, "shipment-evidence.demo.json"),
      "Simulated shipment fixture",
    );
    evidence.observedAt = (
      await startupStep(
        "RPC_BLOCK_READ_FAILED",
        "Check public Whitechain RPC access; no transaction was attempted.",
        () => client.getBlock(),
      )
    ).timestamp.toString();
    jsonWrite(join(setupDir, "shipment-evidence.demo.json"), evidence);
    console.log(
      "Bound exact onchain agreement to metadata; demo observation timestamp refreshed. Start merchant and approved agent within 300 seconds. No job was touched.",
    );
    return;
  }
  const sourcePath = arg("credentials");
  if (sourcePath && !existsSync(resolve(sourcePath)))
    throw new StartupError(
      "CREDENTIAL_FILE_MISSING",
      "The --credentials file does not exist.",
      "Pass an existing local file path. Do not paste file contents into a command.",
    );
  if (sourcePath && !Object.keys(readEnv(resolve(sourcePath))).length)
    throw new StartupError(
      "CREDENTIAL_FILE_EMPTY",
      "The credential file contains no parsed environment assignments.",
      "Check dotenv syntax/encoding and the supplied file path without printing its contents.",
    );
  const existingMerchant = readEnv(join(merchantDir, ".env")),
    existingAgent = readEnv(join(agentDir, ".env"));
  const source = {
    ...readEnv(join(repo, "Hedera_Agentic_Payments/.env")),
    ...(sourcePath ? readEnv(resolve(sourcePath)) : {}),
    ...process.env,
  };
  const notices: string[] = [];
  const service = selectEvmCredential(
    [
      {
        name: "SERVICE_SIGNER_PRIVATE_KEY",
        value: source.SERVICE_SIGNER_PRIVATE_KEY,
      },
      {
        name: "VERIFIER_EVM_PRIVATE_KEY",
        value: source.VERIFIER_EVM_PRIVATE_KEY,
      },
      { name: "VERIFIER_SIGNER_PK", value: source.VERIFIER_SIGNER_PK },
      {
        name: "SERVICE_SIGNER_PRIVATE_KEY (existing merchant)",
        value: existingMerchant.SERVICE_SIGNER_PRIVATE_KEY,
      },
    ],
    notices,
  );
  const key = service?.key;
  let signer = getAddress(manifest.verifier.signer),
    derived = false;
  if (key) {
    signer = service!.address;
    derived = true;
    if (signer === ADMIN || (await read("hasRole", [ADMIN_ROLE, signer])))
      throw new StartupError(
        "ADMIN_SIGNER_FORBIDDEN",
        "The service signer is an Admin account.",
        "Use the existing dedicated test verifier key, not the Admin private key.",
      );
  }
  const relayerCredential = selectEvmCredential(
    [
      { name: "RELAYER_PRIVATE_KEY", value: source.RELAYER_PRIVATE_KEY },
      {
        name: "RELAYER_PRIVATE_KEY (existing agent)",
        value: existingAgent.RELAYER_PRIVATE_KEY,
      },
    ],
    notices,
  );
  const relayerKey = relayerCredential?.key;
  let relayer: Address | undefined;
  if (relayerKey) {
    relayer = relayerCredential!.address;
    if (relayer === ADMIN || (await read("hasRole", [ADMIN_ROLE, relayer])))
      throw new StartupError(
        "ADMIN_RELAYER_FORBIDDEN",
        "The configured relayer is an Admin account.",
        "Use an existing non-Admin funded relayer; leave RELAYER_PRIVATE_KEY blank if unavailable.",
      );
  }
  const payer =
    source.AGENT_HEDERA_ACCOUNT_ID ||
    existingAgent.AGENT_HEDERA_ACCOUNT_ID ||
    manifest.accounts.agent;
  const payTo =
    source.VERIFIER_PAYTO ||
    existingMerchant.VERIFIER_PAYTO ||
    manifest.accounts.verifierPayTo;
  const asset =
    source.HEDERA_USDC_TOKEN_ID || source.HEDERA_USDC || manifest.usdc.tokenId;
  const facilitator = source.FACILITATOR_URL || manifest.facilitator.url;
  validateHederaSetup(
    source.HEDERA_NETWORK,
    asset,
    payer,
    payTo,
    manifest.usdc.tokenId,
  );
  const verifierRole = await read("hasRole", [VERIFIER_ROLE, signer]);
  const merchant = {
    ...existingMerchant,
    SERVICE_SIGNER_PRIVATE_KEY: key ?? "",
    VERIFIER_ADDRESS: signer,
    VERIFIER_PAYTO: payTo,
    RPC_URL: "https://rpc.testnet.whitechain.io",
    PORT: existingMerchant.PORT || "4021",
    PAYMENTS: "on",
    PRICE:
      source.VERIFY_PRICE ||
      source.PRICE ||
      existingMerchant.PRICE ||
      manifest.verifier.price,
    HEDERA_NETWORK: "hedera:testnet",
    HEDERA_USDC: asset,
    FACILITATOR_URL: facilitator,
    EVIDENCE_MODE: "demo",
    SHIPPING_PROVIDER_MODULE: "",
    DEMO_EVIDENCE_FILE: join(
      setupDir,
      "shipment-evidence.demo.json",
    ).replaceAll("\\", "/"),
    V2_REPORT_DIR: existingMerchant.V2_REPORT_DIR || ".state/v2-reports",
  };
  const agent: Record<string, string | undefined> = {
    ...existingAgent,
    WHITECHAIN_RPC: "https://rpc.testnet.whitechain.io",
    WHITECHAIN_FROM_BLOCK: "12365020",
    VERIFIER_ADDRESS: signer,
    VERIFIER_URL: "http://localhost:" + merchant.PORT,
    VERIFIER_PAYTO: payTo,
    HEDERA_NETWORK: "hedera:testnet",
    HEDERA_USDC_TOKEN_ID: asset,
    FACILITATOR_URL: facilitator,
    AGENT_HEDERA_ACCOUNT_ID: payer,
    AGENT_HEDERA_PRIVATE_KEY:
      source.AGENT_HEDERA_PRIVATE_KEY ||
      existingAgent.AGENT_HEDERA_PRIVATE_KEY ||
      "",
    RELAYER_PRIVATE_KEY: relayerKey || "",
    AUDIT_TOPIC_ID:
      source.AUDIT_TOPIC_ID ||
      existingAgent.AUDIT_TOPIC_ID ||
      manifest.auditTopicId,
    AUDIT_OPERATOR_ID:
      source.AUDIT_OPERATOR_ID ||
      existingAgent.AUDIT_OPERATOR_ID ||
      manifest.accounts.auditOperator,
    AUDIT_OPERATOR_KEY:
      source.AUDIT_OPERATOR_KEY || existingAgent.AUDIT_OPERATOR_KEY || "",
    AUDIT_SINK: source.AUDIT_SINK || existingAgent.AUDIT_SINK || "agentkit",
    V2_METADATA_FILE: metadataFile.replaceAll("\\", "/"),
    V2_STATE_DIR: existingAgent.V2_STATE_DIR || ".state/v2",
    EVIDENCE_MODE: "demo",
    V2_EXECUTE: "",
    V2_DEMO_ACK: "",
  };
  for (const [name, value] of Object.entries(source))
    if (name.startsWith("POLICY_") && value) agent[name] = value;
  const policyDefaults = {
    POLICY_MAX_PER_CALL: "1000000",
    POLICY_MAX_PER_DEAL: "1000000",
    POLICY_MAX_PER_DAY: "10000000",
    POLICY_MAX_CHECKS_PER_DEAL: "3",
    POLICY_MAX_CHECKS_PER_EXPORTER_PER_DAY: "5",
  };
  for (const [name, value] of Object.entries(policyDefaults))
    agent[name] ??= value;
  envWrite(join(merchantDir, ".env"), merchant);
  envWrite(join(agentDir, ".env"), agent);
  if (!existsSync(metadataFile)) jsonWrite(metadataFile, {});
  const now = (
    await startupStep(
      "RPC_BLOCK_READ_FAILED",
      "Check public Whitechain RPC access; no transaction was attempted.",
      () => client.getBlock(),
    )
  ).timestamp;
  const exporter = getAddress("0x4dcda2a3b4b8c8ac71d3e9224e5a80fbf9a4219c"),
    importer = getAddress("0xed450f58f5287d37ca9200930f14ebcafa44cff4");
  const record = {
    issuer: "SIMULATED HACKATHON CARRIER",
    recordId: "SIMULATED-TMB-V2-DEMO-001",
    shipmentReference: "SIMULATED-TMB-V2-001",
    quantity: "1000",
    unit: "kg",
    goodsDescription: "SIMULATED HACKATHON CARGO - NOT A REAL SHIPMENT",
  };
  let pending: any;
  const pendingFile = join(setupDir, "pending-trade.json");
  if (existsSync(pendingFile))
    pending = readSetupJson(pendingFile, "Prepared demo trade");
  else {
    const prepared = prepareTrade(
      {
        exporter,
        importer,
        invoiceNumber: "SIMULATED-TMB-V2-HACKATHON-001",
        invoiceAmount: "100",
        goodsDescription: record.goodsDescription,
        shipmentReference: record.shipmentReference,
        quantity: record.quantity,
        unit: record.unit,
        record,
        minimumStage: 2,
      },
      now,
    );
    if (!prepared.ok)
      throw new StartupError(
        "DEMO_INPUT_MISSING",
        "Required demo invoice or record information is missing.",
        "Check the explicit simulated invoice fixture; do not invent real-world evidence.",
      );
    if (await read("invoiceUsed", [prepared.terms.invoiceHash]))
      throw new StartupError(
        "INVOICE_ALREADY_USED",
        "The prepared demo invoice already exists onchain.",
        "Bind its actual confirmed trade ID rather than creating a duplicate.",
      );
    pending = {
      label: "SIMULATED EVIDENCE ONLY; NO REAL SHIPMENT",
      exporter,
      importer,
      terms: prepared.terms,
      metadata: prepared.metadata,
    };
    jsonWrite(pendingFile, pending);
  }
  const createData = await startupStep(
    "TRADE_ENCODING_FAILED",
    "Check prepared trade JSON types and the generated V2 ABI. No creation transaction has been submitted.",
    () =>
      encodeFunctionData({
        abi: financeV2Abi,
        functionName: "createTrade",
        args: [pending.terms],
      }),
  );
  const facts: Evidence = {
    mode: "demo",
    shipmentReference: record.shipmentReference,
    quantity: record.quantity,
    unit: record.unit,
    documentHash: pending.terms.documentHash,
    stage: 2,
    observedAt: now.toString(),
    statusSource: "SIMULATED TEST TERMINAL",
    supportSource: record.issuer,
    actual: true,
    identityAuthenticated: true,
    documentAuthenticated: true,
    quantityAuthenticated: true,
    raw: {
      simulation: true,
      warning:
        "All assertions are simulated test fixtures, not authenticated shipment facts",
      record,
    },
  };
  if (!existsSync(join(setupDir, "shipment-evidence.demo.json")))
    jsonWrite(join(setupDir, "shipment-evidence.demo.json"), facts);
  const grant = {
    chainId: V2_CHAIN,
    from: ADMIN,
    to: V2_FINANCE,
    value: "0x0",
    data: encodeFunctionData({
      abi: financeV2Abi,
      functionName: "grantRole",
      args: [VERIFIER_ROLE, signer],
    }),
    signerAddressDerivedFromAvailableKey: derived,
    alreadyAuthorized: verifierRole,
  };
  jsonWrite(join(setupDir, "unsigned-transactions.json"), {
    warning:
      "Unsigned instructions only. Review and explicitly approve each transaction. No transaction was sent.",
    grantRole: grant,
    createTrade: {
      chainId: V2_CHAIN,
      from: exporter,
      to: V2_FINANCE,
      value: "0x0",
      data: createData,
    },
    confirmAgreement: {
      instruction:
        "Use the actual TradeCreated ID after creation, not a predicted ID.",
      method: "confirmAgreement(uint256)",
      from: importer,
      to: V2_FINANCE,
    },
  });
  console.log(
    JSON.stringify(
      {
        configuredPublicAccounts: {
          payer,
          merchant: payTo,
          auditOperator: agent.AUDIT_OPERATOR_ID,
          auditTopic: agent.AUDIT_TOPIC_ID,
        },
        expectedSigner: signer,
        signerDerivedFromAvailableKey: derived,
        verifierRole,
        relayer: relayer ?? "NOT CONFIGURED",
        relayerWBT: relayer
          ? formatEther(
              await startupStep(
                "RELAYER_BALANCE_READ_FAILED",
                "Check public RPC access for the configured relayer balance; no transfer is attempted.",
                () => client.getBalance({ address: relayer! }),
              ),
            )
          : "UNKNOWN",
        deploymentBlock: "12365020",
        liveExecutionEnabled: false,
        metadataBoundToTrade: false,
        notices,
        ignoredLegacySettings: [
          "TRADE_DEALS_ADDRESS",
          "CHAIN_ADAPTER",
          "WHITECHAIN_FROM_BLOCK",
          "WHITECHAIN_CHAIN_ID",
        ].filter((name) => !!source[name]),
        missing: [
          "SERVICE_SIGNER_PRIVATE_KEY",
          "AGENT_HEDERA_PRIVATE_KEY",
          "AUDIT_OPERATOR_KEY",
          "RELAYER_PRIVATE_KEY",
        ].filter(
          (n) => !(n === "SERVICE_SIGNER_PRIVATE_KEY" ? merchant[n] : agent[n]),
        ),
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  printStartupError(error);
  process.exitCode = 1;
});
