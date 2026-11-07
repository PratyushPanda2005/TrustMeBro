import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import express from "express";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { demoEvidence } from "./demo-evidence.js";
import {
  ADMIN_ROLE,
  ADMIN,
  V2_CHAIN,
  V2_FINANCE,
  VERIFIER_ROLE,
  attestationHash,
  canonical,
  evidenceFailures,
  financeV2Abi,
  hex32,
  jobKey,
  reportCommitment,
  typedAttestation,
  uint,
  validateMetadata,
  type Attestation,
  type Deal,
  type Evidence,
  type Report,
  type VerificationRequest,
} from "@trustmebro/shared/v2";
import { JobStore } from "@trustmebro/shared/job-store";

export interface V2Reader {
  deal(id: bigint): Promise<Deal>;
  time(): Promise<bigint>;
  authorized(signer: Address): Promise<boolean>;
  digest(a: Attestation): Promise<Hex>;
}
export interface Provider {
  mode: "real" | "demo";
  /** `now` is the time the request is judged at, so evidence can't postdate it. */
  observe(
    request: VerificationRequest,
    now?: bigint,
  ): Promise<Evidence | undefined>;
}
export function chainReader(
  rpc: string,
  finance: Address = V2_FINANCE,
): V2Reader {
  const client = createPublicClient({
    transport: http(rpc, { timeout: 15000, retryCount: 1 }),
  });
  const read = (functionName: string, args: readonly unknown[] = []) =>
    client.readContract({
      address: finance,
      abi: financeV2Abi,
      functionName,
      args,
    } as any) as Promise<any>;
  return {
    deal: async (id) => {
      if ((await client.getChainId()) !== V2_CHAIN) throw Error("Wrong chain");
      return read("getDeal", [id]);
    },
    time: async () => (await client.getBlock()).timestamp,
    authorized: async (signer) =>
      signer.toLowerCase() !== ADMIN.toLowerCase() &&
      (await client.getChainId()) === V2_CHAIN &&
      (await read("hasRole", [VERIFIER_ROLE, signer])) &&
      !(await read("hasRole", [ADMIN_ROLE, signer])),
    digest: (a) => read("attestationDigest", [a]),
  };
}
export async function configuredProvider(
  mode: string,
  module?: string,
  fixture?: string,
  /** Simulates a fresh observation per trade. Set only by an explicit opt-in. */
  autoEvidence?: V2Reader,
): Promise<Provider> {
  if (mode === "demo") {
    if (autoEvidence)
      return {
        mode: "demo",
        observe: async (r, now) =>
          demoEvidence(
            await autoEvidence.deal(uint(r.tradeId)),
            r.metadata,
            now ?? (await autoEvidence.time()),
          ),
      };
    if (!fixture)
      throw Error(
        "Demo requires an independent fixture file; no observations are derived from claims",
      );
    // Reload at observation time: setup may refresh this file after merchant startup.
    // Never stamp stale data as fresh here; its recorded timestamp is still validated.
    return {
      mode: "demo",
      observe: async () => {
        const evidence = JSON.parse(readFileSync(fixture, "utf8")) as Evidence;
        if (evidence.mode !== "demo")
          throw Error("Demo fixture must be labeled demo");
        return evidence;
      },
    };
  }
  if (mode !== "real") throw Error("EVIDENCE_MODE must be real or demo");
  if (!module) return { mode: "real", observe: async () => undefined };
  // Operator-installed trusted module must authenticate upstreams and preserve raw provenance.
  const provider = (await import(pathToFileURL(module).href))
    .default as Provider;
  if (provider?.mode !== "real" || typeof provider.observe !== "function")
    throw Error("Invalid authenticated provider module");
  return provider;
}
type Deps = {
  reader: V2Reader;
  provider: Provider;
  store: JobStore<Report & { jobId: string }>;
  signer: { address: Address; sign(a: Attestation): Promise<Hex> };
  finance?: Address;
};
/** Shared issuance path for the merchant and explicitly authorized, paid demo reissues. */
export async function issueV2Report(
  d: Pick<Deps, "reader" | "signer" | "finance">,
  r: VerificationRequest,
  deal: Deal,
  now: bigint,
  evidence: Evidence | undefined,
  mode: "real" | "demo",
) {
  const finance = d.finance ?? V2_FINANCE;
  validateMetadata(deal, r.metadata);
  const failures = evidence
    ? evidenceFailures(deal, r.metadata, evidence, now, mode)
    : ["missingEvidence"];
  const passing = failures.length === 0;
  const result = passing
    ? ("passing" as const)
    : ("insufficient_evidence" as const);
  const reason = passing
    ? undefined
    : `Evidence checks failed: ${failures.join(", ")}`;
  const report: Report & { jobId: string } = {
    v: 2,
    jobId: r.jobId,
    request: r,
    result,
    reason,
    evidence,
    reportHash: reportCommitment(r, result, evidence, reason),
  };
  if (passing) {
    if (!(await d.reader.authorized(d.signer.address)))
      throw Error("Dedicated signer not authorized");
    const a: Attestation = {
      tradeId: uint(r.tradeId),
      termsHash: deal.termsHash,
      documentHash: evidence!.documentHash,
      quantity: uint(evidence!.quantity),
      stage: evidence!.stage,
      reportHash: report.reportHash,
      nonce: BigInt("0x" + randomBytes(32).toString("hex")),
      timestamp: now,
      expiry: now + 300n,
    };
    if ((await d.reader.digest(a)) !== attestationHash(a, finance))
      throw Error("V2 attestation digest mismatch");
    report.attestation = JSON.parse(
      JSON.stringify(a, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
    );
    report.signer = d.signer.address;
    report.signature = await d.signer.sign(a);
  }
  return report;
}
export function createV2App(d: Deps, payment?: express.RequestHandler) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  app.get("/health", async (_req, res) => {
    try {
      const authorized = await d.reader.authorized(d.signer.address);
      res.status(authorized ? 200 : 503).json({
        ok: authorized,
        mode: d.provider.mode,
        finance: d.finance ?? V2_FINANCE,
        signer: d.signer.address,
      });
    } catch {
      res.status(503).json({ ok: false });
    }
  });
  if (payment) app.use(payment);
  app.post("/verify", async (req, res) => {
    try {
      const r = req.body as VerificationRequest,
        finance = d.finance ?? V2_FINANCE;
      if (
        !r ||
        r.chainId !== V2_CHAIN ||
        r.finance?.toLowerCase() !== finance.toLowerCase() ||
        !hex32(r.termsHash) ||
        !hex32(r.jobId) ||
        r.jobId !== jobKey(uint(r.tradeId), r.termsHash, finance)
      )
        return res.status(400).json({ error: "invalid_v2_binding" });
      if (!(await d.reader.authorized(d.signer.address)))
        return res
          .status(503)
          .json({ error: "dedicated_signer_not_authorized" });
      const deal = await d.reader.deal(uint(r.tradeId)),
        now = await d.reader.time();
      if (
        deal.state !== 1 ||
        !deal.importerApproved ||
        deal.verification === 3 ||
        deal.termsHash !== r.termsHash ||
        deal.terms.expiry < now
      )
        return res.status(409).json({ error: "trade_not_verifiable" });
      validateMetadata(deal, r.metadata);
      const unlock = d.store.lock();
      try {
        const cached = d.store.get(r.jobId);
        if (cached) {
          if (canonical(cached.request) !== canonical(r))
            return res.status(409).json({ error: "job_request_changed" });
          if (cached.attestation && uint(cached.attestation.expiry) < now)
            return res
              .status(409)
              .json({ error: "cached_attestation_expired_no_repurchase" });
          return res.json(cached);
        }
        const evidence = await d.provider.observe(r, now);
        const report = await issueV2Report(
          d,
          r,
          deal,
          now,
          evidence,
          d.provider.mode,
        );
        d.store.put(report);
        return res.json(report);
      } finally {
        unlock();
      }
    } catch {
      return res.status(422).json({ error: "invalid_or_unavailable_evidence" });
    }
  });
  return app;
}
export function serviceSigner(key: Hex, finance: Address = V2_FINANCE) {
  const account = privateKeyToAccount(key);
  if (account.address === ADMIN)
    throw Error("Admin key is forbidden for service signing");
  return {
    address: account.address,
    sign: (a: Attestation) =>
      account.signTypedData(typedAttestation(a, finance)),
  };
}
