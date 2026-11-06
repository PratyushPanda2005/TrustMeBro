import {
  existsSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { verifyTypedData, type Address, type Hex } from "viem";
import {
  attestationHash,
  canonical,
  decodeAttestation,
  evidencePasses,
  reportCommitment,
  typedAttestation,
  type Report,
  type Deal,
} from "@trustmebro/shared/v2";
import { publicMetaMaskPayload } from "./v2-metamask.ts";
import type { Job, V2Chain } from "./v2-flow.ts";

export function recoveryHistory(root: string, key: string) {
  const base = join(root, "recovery"),
    entries: { version: number; file: string; job: Job; bytes: Buffer }[] = [];
  const add = (version: number, folder: string) => {
    const file = join(folder, "jobs", key + ".json");
    if (existsSync(file)) {
      const bytes = readFileSync(file);
      entries.push({ version, file, bytes, job: JSON.parse(bytes.toString()) });
    }
  };
  add(1, base);
  const versions = join(base, "versions");
  if (existsSync(versions))
    for (const name of readdirSync(versions)) {
      if (
        !/^[2-9]\d*$|^1\d+$/.test(name) ||
        !Number.isSafeInteger(Number(name))
      )
        throw Error("Invalid recovery history version");
      if (!existsSync(join(versions, name, "jobs", key + ".json")))
        throw Error("Incomplete recovery version; preserve and inspect it");
      add(Number(name), join(versions, name));
    }
  return entries.sort((a, b) => a.version - b.version);
}
/** Refuse unexpired, submitted, consumed, malformed or differently bound previous signatures. */
export async function assertExpiredUnsubmitted(
  previous: Job,
  original: Job,
  deal: Deal,
  now: bigint,
  signer: Address,
  chain: Pick<V2Chain, "digest" | "used">,
  reportSeen: (hash: Hex) => Promise<boolean>,
) {
  if (
    deal.state !== 1 ||
    !deal.importerApproved ||
    deal.verification !== 0 ||
    deal.terms.expiry < now
  )
    throw Error(
      "Trade must remain Created, confirmed and Pending verification",
    );
  const r = previous.response as Report,
    p = previous.manualPayload;
  if (
    previous.state !== "awaiting_metamask" ||
    previous.raw ||
    previous.txHash ||
    !p ||
    p.evidenceLabel !== "DEMO_SIMULATION" ||
    r?.evidence?.mode !== "demo" ||
    !r.attestation ||
    !r.signature ||
    r.signer?.toLowerCase() !== signer.toLowerCase()
  )
    throw Error("Recovery is submitted, non-demo or missing its signature");
  if (
    previous.jobId !== original.jobId ||
    previous.tradeId !== original.tradeId ||
    previous.termsHash !== deal.termsHash ||
    canonical(previous.request) !== canonical(original.request) ||
    canonical(previous.settlement) !== canonical(original.settlement) ||
    canonical(previous.quote) !== canonical(original.quote) ||
    canonical(r.request) !== canonical(original.request)
  )
    throw Error("Recovery history binding mismatch");
  const a = decodeAttestation(r.attestation);
  if (
    r.result !== "passing" ||
    r.reportHash !==
      reportCommitment(r.request, r.result, r.evidence, r.reason) ||
    previous.reportHash !== r.reportHash ||
    canonical(p) !==
      canonical(publicMetaMaskPayload(previous, a, r, original.request.finance))
  )
    throw Error("Recovery report/payload integrity mismatch");
  if (
    a.tradeId !== BigInt(original.tradeId) ||
    a.termsHash !== deal.termsHash ||
    a.reportHash !== r.reportHash ||
    a.documentHash !== r.evidence.documentHash ||
    a.quantity !== BigInt(r.evidence.quantity) ||
    a.stage !== r.evidence.stage ||
    a.timestamp < deal.createdAt ||
    a.timestamp > now ||
    a.expiry < a.timestamp ||
    a.expiry - a.timestamp > 300n ||
    !evidencePasses(
      deal,
      original.request.metadata,
      r.evidence,
      a.timestamp,
      "demo",
    )
  )
    throw Error("Recovery attestation fields/time/evidence mismatch");
  if (a.expiry >= now) throw Error("Recovery is still valid; renewal refused");
  if ((await chain.used(signer, a.nonce)) || (await reportSeen(r.reportHash)))
    throw Error("Recovery nonce/report already submitted onchain");
  if (
    (await chain.digest(a)) !== attestationHash(a) ||
    !(await verifyTypedData({
      ...typedAttestation(a),
      address: signer,
      signature: r.signature,
    }))
  )
    throw Error("Recovery signature/digest invalid");
  return a.nonce;
}
/** Caller holds the recovery-control lock. All report/payload writes are exclusive. */
export function appendRecoveryVersion(
  root: string,
  key: string,
  version: number,
  job: Job,
) {
  if (
    !Number.isSafeInteger(version) ||
    version < 1 ||
    job.jobId !== key ||
    !/^0x[0-9a-f]{64}$/i.test(key)
  )
    throw Error("Invalid recovery version/key");
  const base =
    version === 1
      ? join(root, "recovery")
      : join(root, "recovery", "versions", String(version));
  if (version > 1) {
    mkdirSync(join(root, "recovery", "versions"), { recursive: true });
    mkdirSync(base);
  }
  const out = join(base, "jobs"),
    folder = join(base, "metamask");
  mkdirSync(out, { recursive: true });
  mkdirSync(folder, { recursive: true });
  const payload = join(folder, `v2-attestation-trade-${job.tradeId}.json`);
  if (existsSync(payload))
    throw Error("Existing public payload cannot be replaced");
  writeFileSync(join(out, key + ".json"), JSON.stringify(job, null, 2) + "\n", {
    flag: "wx",
  });
  writeFileSync(payload, JSON.stringify(job.manualPayload, null, 2) + "\n", {
    flag: "wx",
  });
  return payload;
}
