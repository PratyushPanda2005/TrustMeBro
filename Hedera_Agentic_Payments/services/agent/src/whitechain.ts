/**
 * Real Whitechain adapter (viem). Chain 1874, official RPC/WS (50 req/s per IP limit:
 * WS subscription for events, backoff on 429). Simulates every write before sending.
 */
import { createPublicClient, createWalletClient, http, webSocket, defineChain, type Hex, BaseError, ContractFunctionRevertedError } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { tradeDealsAgentAbi, WHITECHAIN_CHAIN_ID, WHITECHAIN_RPC, WHITECHAIN_WS, WHITECHAIN_EXPLORER, DEAL_STATE, type VerifyResponse } from "@tmb/shared";
import { fromJson } from "@tmb/shared/sign";
import type { ChainAdapter, RelayResult, ShipmentDeclared } from "./chain.ts";

export const whitechainSepolia = defineChain({
  id: WHITECHAIN_CHAIN_ID,
  name: "Whitechain Sepolia",
  nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
  rpcUrls: { default: { http: [WHITECHAIN_RPC], webSocket: [WHITECHAIN_WS] } },
  blockExplorers: { default: { name: "Whitechain Explorer", url: WHITECHAIN_EXPLORER } },
  testnet: true,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withBackoff<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String((e as Error).message);
      if (i >= tries - 1 || !/429|rate limit|Too Many/i.test(msg)) throw e;
      await sleep(1000 * 2 ** i); // RPC sends Retry-After: 1
    }
  }
}

export class WhitechainAdapter implements ChainAdapter {
  private pub;
  private ws;
  private wallet;
  constructor(readonly tradeDeals: Hex, relayerKey: Hex, private fromBlock: bigint = 0n) {
    this.pub = createPublicClient({ chain: whitechainSepolia, transport: http(process.env.WHITECHAIN_RPC ?? WHITECHAIN_RPC) });
    this.ws = createPublicClient({ chain: whitechainSepolia, transport: webSocket(process.env.WHITECHAIN_WS ?? WHITECHAIN_WS) });
    this.wallet = createWalletClient({ chain: whitechainSepolia, transport: http(process.env.WHITECHAIN_RPC ?? WHITECHAIN_RPC), account: privateKeyToAccount(relayerKey) });
  }

  private toEvent(log: any): ShipmentDeclared {
    const a = log.args;
    return { dealId: a.dealId, exporter: a.exporter, claims: { weight: a.weight, statusCode: a.statusCode, documents: a.documents }, containerNo: a.containerNo, blRef: a.blRef };
  }

  watchShipments(cb: (e: ShipmentDeclared) => void) {
    return this.ws.watchContractEvent({
      address: this.tradeDeals, abi: tradeDealsAgentAbi, eventName: "ShipmentDeclared",
      onLogs: (logs) => logs.forEach((l) => cb(this.toEvent(l))),
      onError: (e) => console.error("[whitechain] watch error:", e.message),
    });
  }

  async pendingShipments(): Promise<ShipmentDeclared[]> {
    const latest = await withBackoff(() => this.pub.getBlockNumber());
    const out: ShipmentDeclared[] = [];
    // Chunked log queries (some RPCs cap ranges); only deals still in Shipped need the agent.
    for (let from = this.fromBlock; from <= latest; from += 5_000n) {
      const to = from + 4_999n > latest ? latest : from + 4_999n;
      const logs = await withBackoff(() => this.pub.getContractEvents({ address: this.tradeDeals, abi: tradeDealsAgentAbi, eventName: "ShipmentDeclared", fromBlock: from, toBlock: to }));
      for (const l of logs) {
        const e = this.toEvent(l);
        const state = await withBackoff(() => this.pub.readContract({ address: this.tradeDeals, abi: tradeDealsAgentAbi, functionName: "dealState", args: [e.dealId as Hex] }));
        if (Number(state) === DEAL_STATE.Shipped) out.push(e);
      }
    }
    return out;
  }

  async submitVerification(r: VerifyResponse): Promise<RelayResult> {
    const v = fromJson(r.verification);
    try {
      const { request } = await withBackoff(() => this.pub.simulateContract({
        address: this.tradeDeals, abi: tradeDealsAgentAbi, functionName: "submitVerification",
        args: [v, r.signature as Hex], account: this.wallet.account,
      }));
      const hash = await this.wallet.writeContract(request);
      const receipt = await withBackoff(() => this.pub.waitForTransactionReceipt({ hash }));
      return receipt.status === "success" ? { ok: true, txHash: hash } : { ok: false, error: `reverted in block ${receipt.blockNumber}` };
    } catch (e) {
      if (e instanceof BaseError) {
        const revert = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
        return { ok: false, error: revert?.data?.errorName ?? revert?.shortMessage ?? e.shortMessage };
      }
      return { ok: false, error: (e as Error).message };
    }
  }
}
