// Writes the labelled simulated evidence the demo verifier reads, for a trade made in the dashboard.
// Run it just before the paid check, because evidence goes stale after 300 seconds. It reads public
// data and writes one local file. It doesn't sign, pay or send anything.
//
//   npm run demo-evidence -- --trade-id=4

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadV2Environment } from "@trustmebro/shared/v2-startup";
import { validateMetadata, type Metadata } from "@trustmebro/shared/v2";

import { demoEvidence } from "../src/demo-evidence.js";
import { chainReader } from "../src/v2.js";

const packageDir = fileURLToPath(new URL("../", import.meta.url));
loadV2Environment(packageDir);

const id = process.argv
  .find((item) => item.startsWith("--trade-id="))
  ?.slice("--trade-id=".length);
if (!id || !/^\d+$/.test(id)) throw new Error("Use --trade-id=ACTUAL_ID");

const metadataFile = resolve(
  packageDir,
  "../../Hedera_Agentic_Payments/services/agent/.state/v2/trade-metadata.json",
);
const metadata = (
  JSON.parse(readFileSync(metadataFile, "utf8")) as Record<string, Metadata>
)[id];
if (!metadata) {
  throw new Error(
    `No shipment details for trade ${id}. Trades made in the dashboard save them on the machine that ran it.`,
  );
}

const reader = chainReader(
  process.env.RPC_URL ?? "https://rpc.testnet.whitechain.io",
);
const deal = await reader.deal(BigInt(id));
validateMetadata(deal, metadata);

const file = resolve(
  packageDir,
  process.env.DEMO_EVIDENCE_FILE ?? ".state/v2-demo/shipment-evidence.demo.json",
);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(
  file,
  JSON.stringify(demoEvidence(deal, metadata, await reader.time()), null, 2),
);
console.log(`Simulated evidence for trade ${id} is valid for 300 seconds.`);
