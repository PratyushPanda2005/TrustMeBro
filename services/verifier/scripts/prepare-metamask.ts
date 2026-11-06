import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  formatEther,
  formatUnits,
  parseEventLogs,
} from "viem";
import {
  ADMIN,
  ADMIN_ROLE,
  VERIFIER_ROLE,
  V2_FINANCE,
  financeV2Abi,
  attestationTypes,
  attestationHash,
  validateMetadata,
  prepareTrade,
  canonical,
  type Deal,
} from "@trustmebro/shared/v2";
import { printStartupError, startupStep } from "@trustmebro/shared/v2-startup";

async function main() {
  const pkg = fileURLToPath(new URL("../", import.meta.url)),
    folder = join(pkg, ".state/v2-demo/metamask");
  const template = readFileSync(
    join(pkg, "scripts/remix/v2-metamask.template.js"),
    "utf8",
  );
  const names = new Set([
    "DEFAULT_ADMIN_ROLE",
    "VERIFIER_ROLE",
    "hasRole",
    "grantRole",
    "getDeal",
    "attestationDigest",
    "attestationUsed",
    "verifyAttestation",
    "quote",
    "ShipmentChecked",
  ]);
  const abi = financeV2Abi.filter(
    (item) => "name" in item && names.has(item.name),
  );
  mkdirSync(folder, { recursive: true });
  for (const [operation, file] of [
    ["grant", "grant-verifier.js"],
    ["relay", "relay-attestation.js"],
  ]) {
    const script = template
      .replace("__OPERATION__", JSON.stringify(operation))
      .replace("__ABI__", JSON.stringify(abi))
      .replace("__TYPES__", JSON.stringify(attestationTypes))
      .trimEnd();
    writeFileSync(join(folder, file), script);
    console.log(
      `Prepared PUBLIC Remix script: ${join(folder, file)}; ACTION=preflight; nothing submitted.`,
    );
  }
  const client = createPublicClient({
    transport: http("https://rpc.testnet.whitechain.io", {
      timeout: 15000,
      retryCount: 0,
    }),
  });
  if ((await client.getChainId()) !== 1874) throw Error("Wrong chain");
  const signer = "0x76b4B8FFaa84901d5b2aDFB5c6a3592E4e63B1E8" as const;
  const read = (functionName: string, args: readonly unknown[] = []) =>
    client.readContract({
      address: V2_FINANCE,
      abi: financeV2Abi,
      functionName,
      args,
    } as any) as Promise<any>;
  const role = await read("VERIFIER_ROLE"),
    adminRole = await read("DEFAULT_ADMIN_ROLE");
  if (role !== VERIFIER_ROLE || adminRole !== ADMIN_ROLE)
    throw Error("Unexpected role constants");
  const admin = await read("hasRole", [adminRole, ADMIN]),
    authorized = await read("hasRole", [role, signer]);
  const data = encodeFunctionData({
    abi: financeV2Abi,
    functionName: "grantRole",
    args: [role, signer],
  });
  const gas = authorized
    ? undefined
    : await client.estimateGas({ account: ADMIN, to: V2_FINANCE, data });
  const balance = await client.getBalance({ address: ADMIN });
  const pending = JSON.parse(
    readFileSync(join(pkg, ".state/v2-demo/pending-trade.json"), "utf8"),
  );
  const invoiceTemplate = readFileSync(
    join(pkg, "scripts/remix/v2-invoice.template.js"),
    "utf8",
  );
  const invoiceNames = new Set([
    "EXPORTER_ROLE",
    "IMPORTER_ROLE",
    "hasRole",
    "createTrade",
    "confirmAgreement",
    "getDeal",
    "invoiceUsed",
    "TradeCreated",
    "AgreementConfirmed",
  ]);
  const invoiceAbi = financeV2Abi.filter(
    (item) => "name" in item && invoiceNames.has(item.name),
  );
  for (const operation of ["create", "confirm"]) {
    const script = invoiceTemplate
      .replace("__OPERATION__", JSON.stringify(operation))
      .replace("__INVOICE__", JSON.stringify(pending))
      .replace("__ABI__", JSON.stringify(invoiceAbi))
      .trimEnd();
    const file = join(
      folder,
      operation === "create"
        ? "create-demo-invoice.js"
        : "confirm-demo-agreement.js",
    );
    writeFileSync(file, script);
    console.log(
      `Prepared PUBLIC invoice script: ${file}; ACTION=preflight; nothing submitted.`,
    );
  }
  const exporterRole = await read("EXPORTER_ROLE"),
    importerRole = await read("IMPORTER_ROLE");
  const latest = await client.getBlockNumber(),
    candidates = new Set<string>([
      ADMIN,
      pending.exporter,
      pending.importer,
      signer,
    ]);
  // AccessControl is not enumerable: recover candidates from all deployment-to-present grant events,
  // then read current hasRole so revoked memberships are never reported as current.
  for (let from = 12365020n; from <= latest; from += 1500n) {
    const logs = await client.getContractEvents({
      address: V2_FINANCE,
      abi: financeV2Abi,
      eventName: "RoleGranted",
      fromBlock: from,
      toBlock: from + 1499n < latest ? from + 1499n : latest,
    });
    for (const log of logs)
      if (log.args.account) candidates.add(log.args.account);
  }
  const wallets = [];
  for (const address of candidates) {
    wallets.push({
      address,
      exporterRole: await read("hasRole", [exporterRole, address]),
      importerRole: await read("hasRole", [importerRole, address]),
      WBT: formatEther(
        await client.getBalance({ address: address as `0x${string}` }),
      ),
    });
  }
  const grantHash =
    "0x4a807b4e14d158a9e5b6be28ff0f1cfe416bb2695c9ece24dd38186d771dd186" as const;
  const grantReceipt = await client.getTransactionReceipt({ hash: grantHash });
  const grants = parseEventLogs({
    abi: financeV2Abi,
    eventName: "RoleGranted",
    logs: grantReceipt.logs.filter(
      (log) => log.address.toLowerCase() === V2_FINANCE.toLowerCase(),
    ),
  });
  if (
    grantReceipt.status !== "success" ||
    !grants.some(
      (log) =>
        log.args.role === VERIFIER_ROLE &&
        log.args.account.toLowerCase() === signer.toLowerCase() &&
        log.args.sender.toLowerCase() === ADMIN.toLowerCase(),
    )
  )
    throw Error("Role grant receipt mismatch");
  const terms = {
    ...pending.terms,
    face: BigInt(pending.terms.face),
    quantity: BigInt(pending.terms.quantity),
    expiry: BigInt(pending.terms.expiry),
  };
  validateMetadata({ terms } as Deal, pending.metadata);
  const regenerated = prepareTrade(
    {
      exporter: pending.exporter,
      importer: pending.importer,
      invoiceNumber: "SIMULATED-TMB-V2-HACKATHON-001",
      invoiceAmount: formatUnits(terms.face, 6),
      goodsDescription: pending.metadata.record.goodsDescription,
      shipmentReference: pending.metadata.shipmentReference,
      quantity: terms.quantity.toString(),
      unit: pending.metadata.unit,
      record: pending.metadata.record,
      minimumStage: terms.minimumStage,
      expiry: terms.expiry,
    },
    BigInt((await client.getBlock()).timestamp),
  );
  if (!regenerated.ok || canonical(regenerated.terms) !== canonical(terms))
    throw Error("Prepared business data/commitment regeneration mismatch");
  const fixture = JSON.parse(
    readFileSync(
      join(pkg, ".state/v2-demo/shipment-evidence.demo.json"),
      "utf8",
    ),
  );
  if (
    fixture.mode !== "demo" ||
    fixture.documentHash !== terms.documentHash ||
    BigInt(fixture.quantity) !== terms.quantity ||
    fixture.unit !== pending.metadata.unit ||
    fixture.stage < terms.minimumStage
  )
    throw Error("Demo fixture/terms mismatch");
  const simulated = await client.simulateContract({
    address: V2_FINANCE,
    abi: financeV2Abi,
    functionName: "createTrade",
    args: [terms],
    account: pending.exporter,
  });
  // Unsigned public test vector only: not a report and not an approval for an invoice.
  const digestProbe = {
    tradeId: 0n,
    termsHash: terms.commercialHash,
    documentHash: terms.documentHash,
    quantity: terms.quantity,
    stage: terms.minimumStage,
    reportHash: terms.invoiceHash,
    nonce: 0n,
    timestamp: 1n,
    expiry: 301n,
  };
  if (
    (await read("attestationDigest", [digestProbe])) !==
    attestationHash(digestProbe)
  )
    throw Error("Deployed Solidity/EIP-712 digest mismatch");
  const report = {
    chainId: 1874,
    finance: V2_FINANCE,
    admin: ADMIN,
    adminRole: admin,
    serviceSigner: signer,
    verifierRole: role,
    signerAuthorized: authorized,
    grantTransaction: grantHash,
    grantReceiptConfirmed: true,
    roleMembershipScanThroughBlock: latest.toString(),
    wallets,
    adminWBT: formatEther(balance),
    grantGasEstimate: gas?.toString(),
    invoiceCommitmentsMatch: true,
    evidenceLabel: "DEMO_SIMULATION",
    creationReadOnlySimulation: "PASS",
    deployedAttestationDigestParity: true,
    predictedOnlyId: simulated.result.toString(),
    fundingExpiry: terms.expiry.toString(),
    submitted: false,
  };
  writeFileSync(
    join(folder, "readiness.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}
startupStep(
  "METAMASK_PREPARATION_FAILED",
  "Check public RPC access and the prepared invoice JSON/expiry. This script never requests a wallet or submits a transaction.",
  main,
).catch((error) => {
  printStartupError(error);
  process.exitCode = 1;
});
