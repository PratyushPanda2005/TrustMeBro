/**
 * Real Whitechain adapter (viem) against lane C's TradeDeals (plan v5 §7). Chain 1874, official
 * RPC/WS (50 req/s per IP: WS subscription for events, backoff on 429). Simulates every write
 * before sending, so a relay the contract would revert is never paid for in gas.
 */
import { createPublicClient, createWalletClient, http, webSocket, defineChain, type Hex, BaseError, ContractFunctionRevertedError } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  tradeDealsAgentAbi, DEAL_STATE, OUTCOME, WHITECHAIN_CHAIN_ID, WHITECHAIN_RPC, WHITECHAIN_WS, WHITECHAIN_EXPLORER,
  dealIdToBytes32, bytes32ToDealId, type VerifyResponse,
} from "@tmb/shared";
import { fromJson } from "@tmb/shared/sign";
import type { ChainAdapter, ClaimedEvent, DealStatus, RelayOutcome, RelayResult } from "./chain.ts";

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

const OUTCOME_NAME: Record<number, RelayOutcome> = {
  [OUTCOME.Verified]: "verified", [OUTCOME.Pending]: "pending", [OUTCOME.Falsified]: "rejected", [OUTCOME.Mismatch]: "mismatch",
};

/** Claimed event args → the agent's ClaimedEvent (uint256 deal id carried as bytes32, like the Verification). */
export function toClaimed(a: any): ClaimedEvent {
  return {
    dealId: dealIdToBytes32(a.dealId), exporter: a.exporter, declaredKg: Number(a.declaredKg), claimedStatus: Number(a.claimedStatus),
    docHash: a.docHash, containerNo: a.containerNo, blRef: a.blRef, verifyDeadline: BigInt(a.verifyDeadline),
  };
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

  watchClaims(cb: (e: ClaimedEvent) => void) {
    return this.ws.watchContractEvent({
      address: this.tradeDeals, abi: tradeDealsAgentAbi, eventName: "Claimed",
      onLogs: (logs) => logs.forEach((l: any) => cb(toClaimed(l.args))),
      onError: (e) => console.error("[whitechain] watch error:", e.message),
    });
  }

  async openClaims(): Promise<{ claim: ClaimedEvent; checks: number }[]> {
    const latest = await withBackoff(() => this.pub.getBlockNumber());
    const out: { claim: ClaimedEvent; checks: number }[] = [];
    // Chunked log queries (some RPCs cap ranges); only deals still Claimed or Pending need the agent.
    for (let from = this.fromBlock; from <= latest; from += 5_000n) {
      const to = from + 4_999n > latest ? latest : from + 4_999n;
      const logs = await withBackoff(() => this.pub.getContractEvents({ address: this.tradeDeals, abi: tradeDealsAgentAbi, eventName: "Claimed", fromBlock: from, toBlock: to }));
      for (const l of logs as any[]) {
        const claim = toClaimed(l.args);
        const deal: any = await withBackoff(() => this.pub.readContract({ address: this.tradeDeals, abi: tradeDealsAgentAbi, functionName: "getDeal", args: [bytes32ToDealId(claim.dealId as Hex)] }));
        const state = Number(deal.state);
        if (state === DEAL_STATE.Claimed || state === DEAL_STATE.Pending) out.push({ claim, checks: Number(deal.checks) });
      }
    }
    return out;
  }

  async dealStatus(dealId: string): Promise<DealStatus | undefined> {
    const deal: any = await withBackoff(() => this.pub.readContract({ address: this.tradeDeals, abi: tradeDealsAgentAbi, functionName: "getDeal", args: [bytes32ToDealId(dealId as Hex)] }));
    const state = Number(deal.state);
    if (state === DEAL_STATE.None) return undefined;
    return { state, checks: Number(deal.checks), verifyDeadline: BigInt(deal.verifyDeadline) };
  }

  async verifier(): Promise<string> {
    return withBackoff(() => this.pub.readContract({ address: this.tradeDeals, abi: tradeDealsAgentAbi, functionName: "verifier" })) as Promise<string>;
  }

  async submitVerification(r: VerifyResponse): Promise<RelayResult> {
    const v = fromJson(r.verification);
    try {
      const { request, result } = await withBackoff(() => this.pub.simulateContract({
        address: this.tradeDeals, abi: tradeDealsAgentAbi, functionName: "submitVerification",
        args: [v, r.signature as Hex], account: this.wallet.account,
      }));
      const hash = await this.wallet.writeContract(request);
      const receipt = await withBackoff(() => this.pub.waitForTransactionReceipt({ hash }));
      if (receipt.status !== "success") return { ok: false, error: `reverted in block ${receipt.blockNumber}` };
      // The contract's verdict is the return value; the score move is in TrustRegistry / the Rejected event.
      return { ok: true, txHash: hash, outcome: OUTCOME_NAME[Number(result)] ?? "pending" };
    } catch (e) {
      if (e instanceof BaseError) {
        const revert = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
        return { ok: false, error: revert?.data?.errorName ?? revert?.shortMessage ?? e.shortMessage };
      }
      return { ok: false, error: (e as Error).message };
    }
  }
}
