import {
  getAddress,
  hashTypedData,
  keccak256,
  parseUnits,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
export { financeV2Abi } from "./abi/financeV2.js";

export const V2_CHAIN = 1874;
export const V2_FINANCE = getAddress(
  "0x71e3c6ae367a0d8517a0da7cc480cba9e954dfc7",
);
export const ADMIN = getAddress("0xb758e119133050305520e2f47362cfdd9e55a325");
export const VERIFIER_ROLE = keccak256(stringToHex("VERIFIER_ROLE"));
export const ADMIN_ROLE = `0x${"00".repeat(32)}` as Hex;
export const attestationTypes = {
  Attestation: [
    { name: "tradeId", type: "uint256" },
    { name: "termsHash", type: "bytes32" },
    { name: "documentHash", type: "bytes32" },
    { name: "quantity", type: "uint256" },
    { name: "stage", type: "uint8" },
    { name: "reportHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "timestamp", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
} as const;
export const domain = (finance: Address = V2_FINANCE, chainId = V2_CHAIN) => ({
  name: "TrustMeBro Trade Finance",
  version: "2",
  chainId,
  verifyingContract: finance,
});
export type Attestation = {
  tradeId: bigint;
  termsHash: Hex;
  documentHash: Hex;
  quantity: bigint;
  stage: number;
  reportHash: Hex;
  nonce: bigint;
  timestamp: bigint;
  expiry: bigint;
};
export const typedAttestation = (
  message: Attestation,
  finance: Address = V2_FINANCE,
  chainId = V2_CHAIN,
) => ({
  domain: domain(finance, chainId),
  types: attestationTypes,
  primaryType: "Attestation" as const,
  message,
});
export const attestationHash = (
  a: Attestation,
  finance: Address = V2_FINANCE,
  chainId = V2_CHAIN,
) => hashTypedData(typedAttestation(a, finance, chainId));
export function canonical(value: unknown): string {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  if (
    value === undefined ||
    (typeof value === "number" && !Number.isFinite(value))
  )
    throw Error("Noncanonical value");
  return JSON.stringify(value);
}
export const commitment = (value: unknown) =>
  keccak256(stringToHex(canonical(value)));
export const hex32 = (v: unknown): v is Hex =>
  typeof v === "string" && /^0x[\da-f]{64}$/i.test(v) && !/^0x0{64}$/i.test(v);
export const uint = (v: unknown): bigint => {
  if (typeof v !== "string" || !/^\d{1,78}$/.test(v) || BigInt(v) >= 2n ** 256n)
    throw Error("Invalid uint256");
  return BigInt(v);
};
export const jobKey = (
  id: bigint,
  termsHash: Hex,
  finance: Address = V2_FINANCE,
  chainId = V2_CHAIN,
) =>
  commitment({
    chainId,
    finance: finance.toLowerCase(),
    tradeId: id,
    termsHash,
  });
export type Terms = {
  importer: Address;
  face: bigint;
  invoiceHash: Hex;
  documentHash: Hex;
  commercialHash: Hex;
  categoryHash: Hex;
  shipmentReference: Hex;
  quantity: bigint;
  minimumStage: number;
  expiry: bigint;
};
export type Deal = {
  exporter: Address;
  terms: Terms;
  termsHash: Hex;
  createdAt: bigint;
  importerApproved: boolean;
  state: number;
  verification: number;
};
export type ShipmentRecord = {
  issuer: string;
  recordId: string;
  shipmentReference: string;
  quantity: string;
  unit: string;
  goodsDescription: string;
};
export const normalizedReference = (v: string) => v.trim().toUpperCase();
export const shipmentCommitment = (reference: string) =>
  commitment({ v: 1, shipmentReference: normalizedReference(reference) });
export const documentCommitment = (record: ShipmentRecord) =>
  commitment({ v: 1, record });
export type BusinessInput = {
  exporter: Address;
  importer: Address;
  invoiceAmount: string;
  goodsDescription: string;
  shipmentReference: string;
  quantity: string;
  unit: string;
  invoiceNumber?: string;
  record?: ShipmentRecord;
  expiry?: bigint;
  minimumStage?: number;
};
export function prepareTrade(input: BusinessInput, now: bigint) {
  const missing: string[] = [];
  if (!input.invoiceNumber?.trim())
    missing.push(
      "Stable exporter invoice number (cannot infer real-world invoice identity)",
    );
  if (!input.record)
    missing.push(
      "Source-backed shipment record: issuer, record ID, shipment identity, quantity, unit and description",
    );
  if (missing.length) return { ok: false as const, missing };
  const exporter = getAddress(input.exporter),
    importer = getAddress(input.importer);
  if (exporter === importer) throw Error("Trade parties must differ");
  const quantity = uint(input.quantity),
    face = parseUnits(input.invoiceAmount, 6),
    record = input.record!;
  if (
    !/^\d+(\.\d{1,6})?$/.test(input.invoiceAmount) ||
    face < 10000n ||
    face > 2n ** 128n - 1n ||
    quantity === 0n
  )
    throw Error("Invalid face/quantity");
  for (const v of [
    input.goodsDescription,
    input.shipmentReference,
    input.unit,
    record.issuer,
    record.recordId,
  ])
    if (!v.trim()) throw Error("Missing business field");
  if (
    normalizedReference(record.shipmentReference) !==
      normalizedReference(input.shipmentReference) ||
    uint(record.quantity) !== quantity ||
    record.unit !== input.unit ||
    record.goodsDescription !== input.goodsDescription
  )
    throw Error("Record does not match invoice");
  const expiry = input.expiry ?? now + 7n * 86400n,
    minimumStage = input.minimumStage ?? 1;
  if (expiry <= now || ![1, 2, 3].includes(minimumStage))
    throw Error("Invalid expiry/stage");
  const terms: Terms = {
    importer,
    face,
    invoiceHash: commitment({
      v: 1,
      exporter: exporter.toLowerCase(),
      invoiceNumber: input.invoiceNumber!.trim(),
    }),
    documentHash: documentCommitment(record),
    commercialHash: commitment({
      v: 1,
      goodsDescription: input.goodsDescription,
      quantity: input.quantity,
      unit: input.unit,
      recordIssuer: record.issuer,
      recordId: record.recordId,
    }),
    categoryHash: commitment({ category: "trade-finance" }),
    shipmentReference: shipmentCommitment(input.shipmentReference),
    quantity,
    minimumStage,
    expiry,
  };
  return {
    ok: true as const,
    functionName: "createTrade" as const,
    args: [terms] as const,
    terms,
    metadata: {
      shipmentReference: normalizedReference(input.shipmentReference),
      unit: input.unit,
      record,
      commercial: {
        v: 1,
        goodsDescription: input.goodsDescription,
        quantity: input.quantity,
        unit: input.unit,
        recordIssuer: record.issuer,
        recordId: record.recordId,
      },
    },
    warning:
      "Preparation commits the supplied record; it does not authenticate its issuer. Verification must authenticate it independently.",
  };
}
export type Metadata = {
  shipmentReference: string;
  unit: string;
  record: ShipmentRecord;
  commercial: {
    v: number;
    goodsDescription: string;
    quantity: string;
    unit: string;
    recordIssuer: string;
    recordId: string;
  };
};
export function validateMetadata(d: Deal, m: Metadata) {
  if (
    shipmentCommitment(m.shipmentReference) !== d.terms.shipmentReference ||
    documentCommitment(m.record) !== d.terms.documentHash ||
    commitment(m.commercial) !== d.terms.commercialHash ||
    uint(m.record.quantity) !== d.terms.quantity ||
    m.unit !== m.record.unit ||
    m.commercial.unit !== m.unit ||
    uint(m.commercial.quantity) !== d.terms.quantity ||
    m.commercial.recordIssuer !== m.record.issuer ||
    m.commercial.recordId !== m.record.recordId ||
    m.commercial.goodsDescription !== m.record.goodsDescription ||
    normalizedReference(m.record.shipmentReference) !==
      normalizedReference(m.shipmentReference)
  )
    throw Error("Shipment metadata does not match immutable commitments");
}
export type VerificationRequest = {
  jobId: Hex;
  tradeId: string;
  termsHash: Hex;
  chainId: number;
  finance: Address;
  metadata: Metadata;
};
export type Evidence = {
  mode: "real" | "demo";
  shipmentReference: string;
  quantity: string;
  unit: string;
  documentHash: Hex;
  stage: number;
  observedAt: string;
  statusSource: string;
  supportSource: string;
  actual: boolean;
  identityAuthenticated: boolean;
  documentAuthenticated: boolean;
  quantityAuthenticated: boolean;
  raw: unknown;
};
export type Report = {
  v: 2;
  request: VerificationRequest;
  result: "passing" | "insufficient_evidence";
  reason?: string;
  evidence?: Evidence;
  reportHash: Hex;
  attestation?: Record<keyof Attestation, string | number>;
  signer?: Address;
  signature?: Hex;
};
export const reportCommitment = (
  request: VerificationRequest,
  result: Report["result"],
  evidence?: Evidence,
  reason?: string,
) => commitment({ v: 2, request, result, evidence, reason });
export function evidencePasses(
  d: Deal,
  m: Metadata,
  e: Evidence,
  now: bigint,
  mode: "real" | "demo",
  maxAge = 300n,
): boolean {
  return evidenceFailures(d, m, e, now, mode, maxAge).length === 0;
}
/** Same fail-closed conditions, with public diagnostics rather than a generic rejection. */
export function evidenceFailures(
  d: Deal,
  m: Metadata,
  e: Evidence,
  now: bigint,
  mode: "real" | "demo",
  maxAge = 300n,
): string[] {
  try {
    return Object.entries({
      mode: e.mode === mode,
      actual: e.actual === true,
      identity: e.identityAuthenticated === true,
      documentAuthentication: e.documentAuthenticated === true,
      quantityAuthentication: e.quantityAuthenticated === true,
      statusSource: !!e.statusSource?.trim(),
      supportSource: !!e.supportSource?.trim(),
      independentSources: e.statusSource !== e.supportSource,
      shipmentIdentity:
        normalizedReference(e.shipmentReference) ===
        normalizedReference(m.shipmentReference),
      unit: e.unit === m.unit,
      quantity: uint(e.quantity) === d.terms.quantity,
      documentCommitment: e.documentHash === d.terms.documentHash,
      stage:
        Number.isInteger(e.stage) &&
        e.stage >= d.terms.minimumStage &&
        e.stage <= 3,
      observationNotFuture: uint(e.observedAt) <= now,
      observationFresh: uint(e.observedAt) >= now - maxAge,
    })
      .filter(([, ok]) => !ok)
      .map(([name]) => name);
  } catch {
    return ["malformedEvidence"];
  }
}
export const decodeAttestation = (
  a: Record<keyof Attestation, string | number>,
): Attestation => ({
  tradeId: uint(a.tradeId),
  termsHash: a.termsHash as Hex,
  documentHash: a.documentHash as Hex,
  quantity: uint(a.quantity),
  stage: Number(a.stage),
  reportHash: a.reportHash as Hex,
  nonce: uint(a.nonce),
  timestamp: uint(a.timestamp),
  expiry: uint(a.expiry),
});
