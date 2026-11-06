import {
  createPublicClient,
  encodeFunctionData,
  http,
  keccak256,
  parseEventLogs,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ADMIN_ROLE,
  ADMIN,
  V2_CHAIN,
  V2_FINANCE,
  VERIFIER_ROLE,
  financeV2Abi,
  type Attestation,
  type Deal,
} from "@trustmebro/shared/v2";
import type { V2Chain } from "./v2-flow.ts";
import type { MetaMaskPayload } from "./v2-metamask.ts";

export function v2Chain(
  rpc: string,
  key: Hex | undefined,
  fromBlock: bigint,
  localTest?: { client: PublicClient; finance: Address },
): V2Chain {
  const publicClient =
      localTest?.client ??
      createPublicClient({
        transport: http(rpc, { timeout: 15000, retryCount: 1 }),
      }),
    finance = localTest?.finance ?? V2_FINANCE;
  const read = async (functionName: string, args: readonly unknown[] = []) => {
    if ((await publicClient.getChainId()) !== V2_CHAIN)
      throw Error("Wrong chain");
    return publicClient.readContract({
      address: finance,
      abi: financeV2Abi,
      functionName,
      args,
    } as any) as Promise<any>;
  };
  return {
    finance,
    async confirmed() {
      if ((await publicClient.getChainId()) !== V2_CHAIN)
        throw Error("Wrong chain");
      const latest = await publicClient.getBlockNumber(),
        safe = latest > 1n ? latest - 1n : 0n,
        ids = new Set<bigint>();
      for (let start = fromBlock; start <= safe; start += 1500n) {
        const logs = await publicClient.getContractEvents({
          address: finance,
          abi: financeV2Abi,
          eventName: "AgreementConfirmed",
          fromBlock: start,
          toBlock: start + 1499n < safe ? start + 1499n : safe,
        });
        for (const log of logs)
          if (log.args.id !== undefined) ids.add(log.args.id);
      }
      return [...ids];
    },
    deal: (id) => read("getDeal", [id]) as Promise<Deal>,
    time: async () => (await publicClient.getBlock()).timestamp,
    authorized: async (signer) =>
      signer.toLowerCase() !== ADMIN.toLowerCase() &&
      (await read("hasRole", [VERIFIER_ROLE, signer])) &&
      !(await read("hasRole", [ADMIN_ROLE, signer])),
    digest: (a) => read("attestationDigest", [a]),
    used: (signer, nonce) => read("attestationUsed", [signer, nonce]),
    async prepare(a: Attestation, signer: Address, signature: Hex) {
      if (!key) throw Error("RELAYER_PRIVATE_KEY missing");
      const account = privateKeyToAccount(key);
      if (
        account.address === ADMIN ||
        (await read("hasRole", [ADMIN_ROLE, account.address]))
      )
        throw Error("Relayer must not use Admin key");
      await publicClient.simulateContract({
        address: finance,
        abi: financeV2Abi,
        functionName: "verifyAttestation",
        args: [a, signer, signature],
        account,
      });
      const data = encodeFunctionData({
        abi: financeV2Abi,
        functionName: "verifyAttestation",
        args: [a, signer, signature],
      });
      const gas = await publicClient.estimateGas({
          account,
          to: finance,
          data,
        }),
        fees = await publicClient.estimateFeesPerGas();
      const nonce = await publicClient.getTransactionCount({
        address: account.address,
        blockTag: "pending",
      });
      const raw = await account.signTransaction({
        chainId: V2_CHAIN,
        type: "eip1559",
        to: finance,
        data,
        nonce,
        gas: (gas * 120n) / 100n,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      });
      return { raw, hash: keccak256(raw) };
    },
    broadcast: (raw) =>
      publicClient.sendRawTransaction({ serializedTransaction: raw }),
    async externalReceipt(hash: Hex, payload: MetaMaskPayload) {
      if ((await publicClient.getChainId()) !== V2_CHAIN)
        throw Error("Wrong chain");
      let tx;
      try {
        tx = await publicClient.getTransaction({ hash });
      } catch (error) {
        if ((error as { name?: string }).name === "TransactionNotFoundError")
          return "pending";
        throw error;
      }
      const expected = payload.transaction;
      if (
        tx.chainId === undefined ||
        BigInt(tx.chainId) !== BigInt(V2_CHAIN) ||
        expected.chainId !== V2_CHAIN ||
        tx.from.toLowerCase() !== ADMIN.toLowerCase() ||
        expected.from.toLowerCase() !== ADMIN.toLowerCase() ||
        tx.to?.toLowerCase() !== finance.toLowerCase() ||
        expected.to.toLowerCase() !== finance.toLowerCase() ||
        tx.value !== 0n ||
        tx.input.toLowerCase() !== expected.data.toLowerCase()
      )
        throw Error(
          "MetaMask transaction does not match saved Admin/Finance/calldata/value/chain",
        );
      return this.receipt(hash, BigInt(payload.tradeId), payload.reportHash);
    },
    async receipt(hash, id, reportHash) {
      let receipt;
      try {
        receipt = await publicClient.getTransactionReceipt({ hash });
      } catch (e) {
        if ((e as { name?: string }).name === "TransactionReceiptNotFoundError")
          return "pending";
        throw e;
      }
      if ((await publicClient.getBlockNumber()) < receipt.blockNumber + 1n)
        return "pending";
      if (receipt.status !== "success") return "reverted";
      const logs = parseEventLogs({
        abi: financeV2Abi,
        eventName: "ShipmentChecked",
        logs: receipt.logs.filter(
          (l) => l.address.toLowerCase() === finance.toLowerCase(),
        ),
      });
      const event = logs.find(
        (l) =>
          l.args.id === id &&
          l.args.reportHash === reportHash &&
          l.args.mode === "TRUSTED_SERVICE_ATTESTATION",
      );
      const deal = (await read("getDeal", [id])) as Deal;
      if (
        !event ||
        event.args.result !== 1 ||
        deal.verification !== 1 ||
        !deal.importerApproved
      )
        return "nonpassing";
      if (deal.state === 1) {
        if (deal.terms.expiry < (await this.time())) return "nonpassing";
        await read("quote", [id]);
      } else if (deal.state !== 2) return "nonpassing";
      return "valid";
    },
  };
}
