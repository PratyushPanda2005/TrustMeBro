import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { privateKeyToAccount } from "viem/accounts";
import { JobStore } from "@trustmebro/shared/job-store";
import {
  V2_FINANCE,
  attestationHash,
  commitment,
  jobKey,
  prepareTrade,
  typedAttestation,
  type Deal,
  type Evidence,
  type Metadata,
  type Report,
  type VerificationRequest,
} from "@trustmebro/shared/v2";
import { createV2App, type Provider, type V2Reader } from "../src/v2.js";

// Public deterministic TEST key, never an operational signer.
export const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
export const now = 1800000000n;
export function fixture() {
  const record = {
    issuer: "test-carrier",
    recordId: "TEST-BOL-7",
    shipmentReference: "TEST1234567",
    quantity: "1000",
    unit: "kg",
    goodsDescription: "Test cargo",
  };
  const input = {
    exporter: "0x2222222222222222222222222222222222222222" as const,
    importer: "0x3333333333333333333333333333333333333333" as const,
    invoiceNumber: "TEST-001",
    invoiceAmount: "100",
    goodsDescription: "Test cargo",
    shipmentReference: "TEST1234567",
    quantity: "1000",
    unit: "kg",
    record,
  };
  const prepared = prepareTrade(input, now);
  if (!prepared.ok) throw Error("Invalid test fixture");
  const deal: Deal = {
    exporter: input.exporter,
    terms: prepared.terms,
    termsHash: commitment({ test: "terms" }),
    createdAt: now - 10n,
    importerApproved: true,
    state: 1,
    verification: 0,
  };
  const metadata: Metadata = prepared.metadata;
  const request: VerificationRequest = {
    jobId: jobKey(1n, deal.termsHash),
    tradeId: "1",
    termsHash: deal.termsHash,
    chainId: 1874,
    finance: V2_FINANCE,
    metadata,
  };
  // Independent fixture values, not computed from declarations.
  const evidence: Evidence = {
    mode: "demo",
    shipmentReference: "TEST1234567",
    quantity: "1000",
    unit: "kg",
    documentHash: prepared.terms.documentHash,
    stage: 1,
    observedAt: now.toString(),
    statusSource: "test-terminal",
    supportSource: "test-carrier",
    actual: true,
    identityAuthenticated: true,
    documentAuthenticated: true,
    quantityAuthenticated: true,
    raw: { fixture: true, warning: "SIMULATED, not real shipping data" },
  };
  return { input, deal, metadata, request, evidence };
}
export async function merchant(
  options: {
    evidence?: Evidence | null;
    authorized?: boolean;
    badDigest?: boolean;
  } = {},
) {
  const f = fixture(),
    dir = mkdtempSync(join(tmpdir(), "tmb-v2-merchant-"));
  const reader: V2Reader = {
    deal: async () => f.deal,
    time: async () => now,
    authorized: async () => options.authorized ?? true,
    digest: async (a) =>
      options.badDigest ? commitment("wrong") : attestationHash(a),
  };
  const provider: Provider = {
    mode: "demo",
    observe: async () =>
      options.evidence === null ? undefined : (options.evidence ?? f.evidence),
  };
  const store = new JobStore<Report & { jobId: string }>(dir);
  const app = createV2App({
    reader,
    provider,
    store,
    signer: {
      address: account.address,
      sign: (a) => account.signTypedData(typedAttestation(a)),
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No listener");
  const url = `http://127.0.0.1:${address.port}/verify`;
  return {
    ...f,
    reader,
    store,
    url,
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
