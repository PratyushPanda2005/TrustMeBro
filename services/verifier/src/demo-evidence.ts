import type { Deal, Evidence, Metadata } from "@trustmebro/shared/v2";

/** Hackathon fixture for one trade. Clearly labelled, and never real shipping data. */
export function demoEvidence(
  deal: Deal,
  metadata: Metadata,
  now: bigint,
): Evidence {
  return {
    mode: "demo",
    shipmentReference: metadata.shipmentReference,
    quantity: deal.terms.quantity.toString(),
    unit: metadata.unit,
    documentHash: deal.terms.documentHash,
    stage: deal.terms.minimumStage,
    observedAt: now.toString(),
    statusSource: "SIMULATED TEST TERMINAL",
    supportSource: metadata.record.issuer,
    actual: true,
    identityAuthenticated: true,
    documentAuthenticated: true,
    quantityAuthenticated: true,
    raw: { label: "SIMULATED EVIDENCE ONLY; NO REAL SHIPMENT" },
  };
}
