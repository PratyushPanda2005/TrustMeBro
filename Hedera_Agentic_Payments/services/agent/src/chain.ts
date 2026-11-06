/** Whitechain access behind an interface, so the agent runs on a mock until lane C deploys. Plan v5 §3, §7. */
import { DEAL_STATE, applyFalsified, applySettledExporter, judge, newExporterRep, trust, type Rep, type VerifyResponse } from "@tmb/shared";

/** TradeDeals `Claimed` event: the exporter's value claims (plan v5 §3 step 4). */
export interface ClaimedEvent {
  dealId: string; // the contract's uint256 id as bytes32 hex
  exporter: string;
  declaredKg: number;
  claimedStatus: number;
  docHash: string;
  containerNo: string;
  blRef: string;
  verifyDeadline: bigint; // unix seconds
}

export type RelayOutcome = "verified" | "pending" | "rejected" | "mismatch";

/** The exporter's score around this relay. Only a rejection moves it; credit comes at settlement. */
export interface TrustUpdate {
  exporter: string;
  outcome: RelayOutcome;
  beforeBps: number;
  afterBps: number;
  falsifiedMask: number;
}

/** What the agent reads from TradeDeals before paying for a check (getDeal). */
export interface DealStatus {
  state: number; // DEAL_STATE
  checks: number; // verifications the contract has accepted so far
  verifyDeadline: bigint; // unix seconds; status still behind after it is falsified
}

/** DEAL_STATE number → name, for logs. */
export const stateName = (s: number) => Object.entries(DEAL_STATE).find(([, v]) => v === s)?.[0] ?? `state ${s}`;

export type RelayResult = { ok: true; txHash: string; outcome: RelayOutcome; trust?: TrustUpdate } | { ok: false; error: string };

export interface ChainAdapter {
  readonly tradeDeals: string;
  /** Subscribe to new Claimed events; returns unsubscribe. */
  watchClaims(cb: (e: ClaimedEvent) => void): () => void;
  /** Deals still in Claimed or Pending, with how many checks were already submitted (catch-up and rechecks). */
  openClaims(): Promise<{ claim: ClaimedEvent; checks: number }[]>;
  /** The deal as TradeDeals sees it now; undefined if it does not exist. */
  dealStatus(dealId: string): Promise<DealStatus | undefined>;
  /** TradeDeals.verifier(): the only EIP-712 signer the contract accepts. undefined = this chain can't say (mock). */
  verifier(): Promise<string | undefined>;
  /** Simulates first; only sends if the simulation passes. */
  submitVerification(r: VerifyResponse): Promise<RelayResult>;
}

type MockState = "Claimed" | "Pending" | "Verified" | "Rejected" | "Mismatch" | "Settled" | "Expired";
const MAX_CLOCK_SKEW = 300; // TradeDeals.MAX_CLOCK_SKEW: verifier clock may run ahead of the chain

/**
 * In-memory TradeDeals + TrustRegistry for tests and CHAIN_ADAPTER=mock. Applies the same checks
 * as lane C's submitVerification (state, expiry, nonce, observedAt window, status range) and
 * judges with the shared TS mirror of _judge, so outcomes and scores match the real contract.
 * The EIP-712 signature itself is checked by the agent before relaying (recoverSigner).
 */
export class MockChainAdapter implements ChainAdapter {
  submitted: VerifyResponse[] = [];
  private listeners = new Set<(e: ClaimedEvent) => void>();
  private deals = new Map<string, { claim: ClaimedEvent; state: MockState; checks: number; claimTime: number; observedAt: bigint }>();
  private reps = new Map<string, Rep>();
  private nonces = new Set<string>();
  private failure?: string;
  constructor(
    readonly tradeDeals: string,
    private now: () => number = () => Math.floor(Date.now() / 1000),
    /** What verifier() returns; the mock doesn't check signatures (the agent does). */
    private verifierAddress?: string,
  ) {}

  /** The exporter calls declareClaims: state → Claimed, claimTime = now. */
  emit(e: ClaimedEvent) {
    this.deals.set(e.dealId.toLowerCase(), { claim: e, state: "Claimed", checks: 0, claimTime: this.now(), observedAt: 0n });
    for (const l of this.listeners) l(e);
  }
  failNextWith(reason: string) {
    this.failure = reason;
  }
  watchClaims(cb: (e: ClaimedEvent) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  async openClaims() {
    return [...this.deals.values()].filter((d) => d.state === "Claimed" || d.state === "Pending").map((d) => ({ claim: d.claim, checks: d.checks }));
  }

  async dealStatus(dealId: string): Promise<DealStatus | undefined> {
    const d = this.deals.get(dealId.toLowerCase());
    return d && { state: DEAL_STATE[d.state], checks: d.checks, verifyDeadline: d.claim.verifyDeadline };
  }
  async verifier() {
    return this.verifierAddress;
  }
  /** Demo/test: the exporter or anyone moves the deal on (e.g. expire, cancel) behind the agent's back. */
  setState(dealId: string, state: MockState) {
    const d = this.deals.get(dealId.toLowerCase());
    if (d) d.state = state;
  }

  async submitVerification(r: VerifyResponse): Promise<RelayResult> {
    if (this.failure) {
      const error = `simulation reverted: ${this.failure}`;
      this.failure = undefined;
      return { ok: false, error };
    }
    const v = r.verification;
    const d = this.deals.get(v.dealId.toLowerCase());
    if (!d) return { ok: false, error: "UnknownDeal" };
    if (d.state !== "Claimed" && d.state !== "Pending") return { ok: false, error: "WrongState" };
    const now = this.now();
    if (now > Number(v.expiry)) return { ok: false, error: "SignatureExpired" };
    if (this.nonces.has(v.nonce)) return { ok: false, error: "NonceAlreadyUsed" };
    const observedAt = BigInt(v.observedAt);
    if (observedAt <= BigInt(d.claimTime) || observedAt <= d.observedAt) return { ok: false, error: "StaleObservation" };
    if (observedAt > BigInt(now + MAX_CLOCK_SKEW)) return { ok: false, error: "ObservationInFuture" };
    if (v.statusCode > 5) return { ok: false, error: "InvalidStatus" };

    this.nonces.add(v.nonce);
    this.submitted.push(r);
    d.checks += 1;
    d.observedAt = observedAt;
    const verdict = judge(
      { declaredKg: d.claim.declaredKg, claimedStatus: d.claim.claimedStatus, docHash: d.claim.docHash, verifyDeadline: d.claim.verifyDeadline },
      { observedKg: v.observedKg, statusCode: v.statusCode, docHash: v.docHash, observedAt },
    );
    const key = d.claim.exporter.toLowerCase();
    const before = this.reps.get(key) ?? newExporterRep();
    let after = before;
    let outcome: RelayOutcome;
    if (verdict.outcome === "Falsified") {
      after = applyFalsified(before, verdict.mask);
      this.reps.set(key, after);
      d.state = "Rejected";
      outcome = "rejected";
    } else if (verdict.outcome === "Pending") {
      d.state = "Pending";
      outcome = "pending";
    } else if (verdict.outcome === "Mismatch") {
      d.state = "Mismatch";
      outcome = "mismatch";
    } else {
      d.state = "Verified";
      outcome = "verified";
    }
    return {
      ok: true,
      txHash: "0x" + this.submitted.length.toString(16).padStart(64, "0"),
      outcome,
      trust: { exporter: d.claim.exporter, outcome, beforeBps: Number(trust(before)), afterBps: Number(trust(after)), falsifiedMask: verdict.mask },
    };
  }

  /** Demo only: the importer pays in full, the deal settles and the honest exporter gets +r (plan v5 §5.2). */
  settle(dealId: string): { beforeBps: number; afterBps: number } {
    const d = this.deals.get(dealId.toLowerCase());
    if (!d || d.state !== "Verified") throw new Error(`deal ${dealId} is not Verified`);
    const key = d.claim.exporter.toLowerCase();
    const before = this.reps.get(key) ?? newExporterRep();
    const after = applySettledExporter(before);
    this.reps.set(key, after);
    d.state = "Settled";
    return { beforeBps: Number(trust(before)), afterBps: Number(trust(after)) };
  }

  /** Current Trust Score of an exporter in basis points (new exporters start at 5000 = 50%). */
  exporterScoreBps(exporter: string): number {
    return Number(trust(this.reps.get(exporter.toLowerCase()) ?? newExporterRep()));
  }
}
