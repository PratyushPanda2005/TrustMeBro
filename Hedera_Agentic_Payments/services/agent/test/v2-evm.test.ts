import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { JobStore } from "@trustmebro/shared/job-store";
import {
  ADMIN,
  commitment,
  attestationHash,
  decodeAttestation,
  prepareTrade,
  typedAttestation,
  type Attestation,
  type Deal,
  type Evidence,
  type Report,
  type VerificationRequest,
} from "@trustmebro/shared/v2";
import {
  createV2App,
  type V2Reader,
} from "../../../../services/verifier/src/v2.ts";
import {
  account,
  fixture,
} from "../../../../services/verifier/test/v2-fixture.ts";
import {
  processV2,
  type FlowDeps,
  type Job,
  type V2Chain,
} from "../src/v2-flow.ts";
import { SpendLedger } from "../src/ledger.ts";
import { createPublicClient, custom, type Address, type Hex } from "viem";
import { v2Chain } from "../src/v2-chain.ts";
import { reconcileMetaMask } from "../src/v2-metamask.ts";

test("LOCAL EVM ONLY: existing V2 bytecode accepts merchant signature; receipt/state and quote establish funding eligibility", async () => {
  // Reuse supplied V2 artifacts/runtime. No compile, external RPC, .env, or public signer.
  const root = resolve(
    process.env.V2_PACKAGE_PATH ?? "D:/TrustMeBroo/packages/contracts-v2",
  );
  process.env.HARDHAT_CONFIG = join(root, "hardhat.config.cjs");
  const require = createRequire(join(root, "package.json")),
    hre = require("hardhat"),
    { ethers } = hre;
  hre.config.networks.hardhat.chainId = 1874;
  assert.equal((await ethers.provider.getNetwork()).chainId, 1874n);
  const artifact = (name: string) =>
    JSON.parse(
      readFileSync(
        join(root, "artifacts/src", name + ".sol", name + ".json"),
        "utf8",
      ),
    );
  const [admin, exporter, importer, relayer] = await ethers.getSigners();
  const token = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";
  const mock = JSON.parse(
    readFileSync(
      join(root, "artifacts/src/mocks/MockUSDT.sol/MockUSDT.json"),
      "utf8",
    ),
  );
  await hre.network.provider.send("hardhat_setCode", [
    token,
    mock.deployedBytecode,
  ]);
  const a = artifact("TradePilotFinance"),
    f = await new ethers.ContractFactory(a.abi, a.bytecode, admin).deploy(
      token,
      admin.address,
      admin.address,
    );
  await f.waitForDeployment();
  const finance = f.target as Address;
  await (await f.grantRole(await f.EXPORTER_ROLE(), exporter.address)).wait();
  await (await f.grantRole(await f.IMPORTER_ROLE(), importer.address)).wait();
  await (await f.grantRole(await f.VERIFIER_ROLE(), account.address)).wait();
  const now = BigInt((await ethers.provider.getBlock("latest")).timestamp),
    base = fixture();
  const prepared = prepareTrade(
    { ...base.input, exporter: exporter.address, importer: importer.address },
    now,
  );
  if (!prepared.ok) throw Error("Missing fixture inputs");
  await (await f.connect(exporter).createTrade(prepared.terms)).wait();
  await (await f.connect(importer).confirmAgreement(1n)).wait();
  const loadDeal = async (id: bigint): Promise<Deal> => {
    const d = await f.getDeal(id);
    return {
      exporter: d.exporter,
      terms: { ...prepared.terms },
      termsHash: d.termsHash,
      createdAt: d.createdAt,
      importerApproved: d.importerApproved,
      state: Number(d.state),
      verification: Number(d.verification),
    };
  };
  const reader: V2Reader = {
    deal: loadDeal,
    time: async () =>
      BigInt((await ethers.provider.getBlock("latest")).timestamp),
    authorized: async (signer) =>
      (await f.hasRole(await f.VERIFIER_ROLE(), signer)) &&
      !(await f.hasRole(ethers.ZeroHash, signer)),
    digest: async (att) => f.attestationDigest(att),
  };
  const dir = mkdtempSync(join(tmpdir(), "tmb-v2-evm-"));
  const evidence: Evidence = {
    ...base.evidence,
    observedAt: (await reader.time()).toString(),
  };
  const app = createV2App({
    finance,
    reader,
    provider: { mode: "demo", observe: async () => evidence },
    store: new JobStore<Report & { jobId: string }>(join(dir, "merchant")),
    signer: {
      address: account.address,
      sign: (att) => account.signTypedData(typedAttestation(att, finance)),
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw Error("Listener failed");
    let submitted: Attestation | undefined,
      purchases = 0;
    // Local adapter broadcasts only through the in-process Hardhat provider.
    const key = ethers.HDNodeWallet.fromPhrase(
      "test test test test test test test test test test test junk",
      undefined,
      "m/44'/60'/0'/0/3",
    ).privateKey as Hex;
    const client = createPublicClient({
      transport: custom(hre.network.provider),
      cacheTime: 0,
    });
    const actual = v2Chain("http://unused.local", key, 0n, { client, finance });
    const chain: V2Chain = {
      ...actual,
      prepare: async (att, signer, signature) => {
        submitted = att;
        return actual.prepare(att, signer, signature);
      },
      broadcast: async (raw) => {
        const hash = await actual.broadcast(raw);
        await hre.network.provider.send("hardhat_mine", ["0x2"]);
        return hash;
      },
    };
    await hre.network.provider.send("hardhat_mine", ["0x2"]);
    const deps: FlowDeps = {
      chain,
      store: new JobStore<Job>(join(dir, "agent")),
      ledger: new SpendLedger(join(dir, "ledger.json")),
      policy: {
        network: "hedera:testnet",
        asset: "0.0.429274",
        allowlist: new Set(["0.0.5005"]),
        maxPerCall: 1000000n,
        maxPerDeal: 1000000n,
        maxPerDay: 10000000n,
        maxChecksPerDeal: 3,
        maxChecksPerExporterPerDay: 5,
      },
      signer: account.address,
      mode: "demo",
      url: `http://127.0.0.1:${address.port}/verify`,
      fetch: async () =>
        new Response(null, {
          status: 402,
          headers: {
            "PAYMENT-REQUIRED": Buffer.from(
              JSON.stringify({
                accepts: [
                  {
                    scheme: "exact",
                    network: "hedera:testnet",
                    asset: "0.0.429274",
                    payTo: "0.0.5005",
                    amount: "300000",
                  },
                ],
              }),
            ).toString("base64"),
          },
        }),
      payFetch: async (url, init) => {
        purchases++;
        const res = await fetch(url, init);
        return new Response(await res.text(), {
          status: res.status,
          headers: {
            "PAYMENT-RESPONSE": Buffer.from(
              JSON.stringify({
                success: true,
                transaction:
                  "0.0.7162784@1800000000." +
                  purchases.toString().padStart(9, "0"),
                payer: "0.0.9001",
              }),
            ).toString("base64"),
          },
        });
      },
      audit: async () => {},
      allowBroadcast: true,
      confirmPayment: async () => true,
    };
    assert.deepEqual(await chain.confirmed(), [1n]);
    const job = await processV2(1n, prepared.metadata, deps);
    assert.equal(job.state, "verified");
    assert.equal(purchases, 1);
    assert.equal(
      await f.attestationDigest(submitted),
      attestationHash(submitted!, finance),
    );
    assert.equal((await f.getDeal(1n)).verification, 1n);
    assert.ok((await f.quote(1n)).advance > 0n);
    assert.equal(
      await f.attestationUsed(account.address, submitted!.nonce),
      true,
    );
    await assert.rejects(
      f
        .connect(relayer)
        .verifyAttestation(
          submitted,
          account.address,
          (job.response as Report).signature,
        ),
    );
    // A separate LOCAL trade exercises the production external-wallet reconciliation.
    await (
      await f
        .connect(exporter)
        .createTrade({
          ...prepared.terms,
          invoiceHash: commitment("local-manual-invoice"),
        })
    ).wait();
    await (await f.connect(importer).confirmAgreement(2n)).wait();
    evidence.observedAt = (await reader.time()).toString();
    const manual = v2Chain("http://unused.local", undefined, 0n, {
      client,
      finance,
    });
    const manualJob = await processV2(2n, prepared.metadata, {
      ...deps,
      chain: manual,
      relayMode: "manual-metamask",
      allowBroadcast: false,
    });
    assert.equal(manualJob.state, "awaiting_metamask");
    assert.ok(manualJob.manualPayload);
    // Impersonation exists solely on in-process Hardhat, never public RPC or MetaMask.
    await hre.network.provider.send("hardhat_impersonateAccount", [ADMIN]);
    await hre.network.provider.send("hardhat_setBalance", [
      ADMIN,
      "0x56BC75E2D63100000",
    ]);
    const localWallet = await ethers.getSigner(ADMIN);
    const wrong = await localWallet
      .sendTransaction({ to: finance, value: 0, data: "0x" })
      .catch(() => undefined);
    if (wrong)
      await assert.rejects(
        reconcileMetaMask(deps.store, manualJob.jobId, wrong.hash, manual),
      );
    const tx = await localWallet.sendTransaction({
      to: finance,
      value: 0,
      data: manualJob.manualPayload!.transaction.data,
    });
    await tx.wait();
    await hre.network.provider.send("hardhat_mine", ["0x2"]);
    await assert.rejects(
      reconcileMetaMask(deps.store, manualJob.jobId, job.txHash!, manual),
    );
    assert.equal(
      (await reconcileMetaMask(deps.store, manualJob.jobId, tx.hash, manual))
        .state,
      "verified",
    );
    assert.equal((await f.getDeal(2n)).verification, 1n);
    assert.ok((await f.quote(2n)).advance > 0n);
    assert.equal(purchases, 2);
    console.log(
      "Local V2 EVM PASS: agreement discovery, mocked x402 purchase, exact Solidity digest, authorized relay, Valid state, financeable quote and replay rejection. NO LIVE PAYMENT.",
    );
  } finally {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    rmSync(dir, { recursive: true, force: true });
  }
});
