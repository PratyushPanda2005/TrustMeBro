/** Whitechain access behind an interface, so the agent runs on a mock until lane C deploys. */
import type { Checks, VerifyResponse } from "@tmb/shared";

export interface ShipmentDeclared {
  dealId: string;
  exporter: string;
  claims: Checks;
  containerNo: string;
  blRef: string;
}

export type RelayResult = { ok: true; txHash: string } | { ok: false; error: string };

export interface ChainAdapter {
  readonly tradeDeals: string;
  /** Subscribe to new ShipmentDeclared events; returns unsubscribe. */
  watchShipments(cb: (e: ShipmentDeclared) => void): () => void;
  /** Shipped deals not yet verified (catch-up after a restart). */
  pendingShipments(): Promise<ShipmentDeclared[]>;
  /** Simulates first; only sends if the simulation passes. */
  submitVerification(r: VerifyResponse): Promise<RelayResult>;
}

/** In-memory adapter for tests and CHAIN_ADAPTER=mock (dashboard demos before deploy). */
export class MockChainAdapter implements ChainAdapter {
  submitted: VerifyResponse[] = [];
  private listeners = new Set<(e: ShipmentDeclared) => void>();
  private pending: ShipmentDeclared[] = [];
  private failure?: string;
  constructor(readonly tradeDeals: string) {}

  emit(e: ShipmentDeclared) {
    this.pending.push(e);
    for (const l of this.listeners) l(e);
  }
  failNextWith(reason: string) {
    this.failure = reason;
  }
  watchShipments(cb: (e: ShipmentDeclared) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  async pendingShipments() {
    return [...this.pending];
  }
  async submitVerification(r: VerifyResponse): Promise<RelayResult> {
    if (this.failure) {
      const error = `simulation reverted: ${this.failure}`;
      this.failure = undefined;
      return { ok: false, error };
    }
    this.submitted.push(r);
    this.pending = this.pending.filter((p) => p.dealId.toLowerCase() !== r.verification.dealId.toLowerCase());
    return { ok: true, txHash: "0x" + this.submitted.length.toString(16).padStart(64, "0") };
  }
}
