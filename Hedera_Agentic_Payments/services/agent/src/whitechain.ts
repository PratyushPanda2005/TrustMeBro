/**
 * TradeDeals adapter (viem) against lane C's contracts (plan v5 §7), for two chains:
 *   whitechain → chain 1874, official RPC/WS (50 req/s per IP: WS subscription for events, backoff on 429)
 *   local      → lane C's anvil (31337) from services/verifier `npm run local`, HTTP polling
 * Simulates every write before sending, so a relay the contract would revert is never paid for in gas.
 * Reads the exporter's real Trust Score from TrustRegistry before and after each relay, and the
 * events the contract emitted, so the audit log shows what the chain decided.
 */
import {
  createPublicClient, createWalletClient, http, webSocket, defineChain, parseEventLogs,
  BaseError, ContractFunctionRevertedError, type Chain, type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  tradeDealsAgentAbi, trustRegistryAgentAbi, DEAL_STATE, OUTCOME, WHITECHAIN_CHAIN_ID, WHITECHAIN_RPC, WHITECHAIN_WS, WHITECHAIN_EXPLORER,
  dealIdToBytes32, bytes32ToDealId, type VerifyResponse,
} from "@tmb/shared";
import { fromJson } from "@tmb/shared/sign";
import type { ChainAdapter, ClaimedEvent, DealStatus, RelayOutcome, RelayResult } from "./chain.ts";
import type { ChainTarget } from "./target.ts";

export const whitechainSepolia = defineChain({
  id: WHITECHAIN_CHAIN_ID,
  name: "Whitechain Sepolia",
  nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
  rpcUrls: { default: { http: [WHITECHAIN_RPC], webSocket: [WHITECHAIN_WS] } },
  blockExplorers: { default: { name: "Whitechain Explorer", url: WHITECHAIN_EXPLORER } },
  testnet: true,
});

const localAnvil = (id: number, rpcUrl: string) =>
  defineChain({ id, name: "Lane C local anvil", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });

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

export interface TradeDealsAdapterOptions {
  chain: Chain;
  rpcUrl: string;
  /** Event subscription over WS; without it, events are polled over HTTP every `pollingMs`. */
  wsUrl?: string;
  pollingMs?: number;
  tradeDeals: Hex;
  relayerKey: Hex;
  fromBlock?: bigint;
  /** Link for a tx hash in logs, if the chain has an explorer. */
  txLink?: (hash: string) => string;
}

export class TradeDealsAdapter implements ChainAdapter {
  readonly tradeDeals: Hex;
  readonly txLink: (hash: string) => string;
  private pub;
  private events;
  private wallet;
  private registry?: Hex;
  constructor(private o: TradeDealsAdapterOptions) {
    this.tradeDeals = o.tradeDeals;
    this.txLink = o.txLink ?? ((h) => h);
    this.pub = createPublicClient({ chain: o.chain, transport: http(o.rpcUrl), pollingInterval: o.pollingMs ?? 4_000 });
    this.events = o.wsUrl ? createPublicClient({ chain: o.chain, transport: webSocket(o.wsUrl) }) : this.pub;
    this.wallet = createWalletClient({ chain: o.chain, transport: http(o.rpcUrl), account: privateKeyToAccount(o.relayerKey) });
  }

  get relayer(): Hex {
    return this.wallet.account.address;
  }

  watchClaims(cb: (e: ClaimedEvent) => void) {
    return this.events.watchContractEvent({
      address: this.tradeDeals, abi: tradeDealsAgentAbi, eventName: "Claimed",
      onLogs: (logs) => logs.forEach((l: any) => cb(toClaimed(l.args))),
      onError: (e) => console.error("[chain] watch error:", e.message),
    });
  }

  async openClaims(): Promise<{ claim: ClaimedEvent; checks: number }[]> {
    const latest = await withBackoff(() => this.pub.getBlockNumber());
    const out: { claim: ClaimedEvent; checks: number }[] = [];
    // Chunked log queries (some RPCs cap ranges); only deals still Claimed or Pending need the agent.
    for (let from = this.o.fromBlock ?? 0n; from <= latest; from += 5_000n) {
      const to = from + 4_999n > latest ? latest : from + 4_999n;
      const logs = await withBackoff(() => this.pub.getContractEvents({ address: this.tradeDeals, abi: tradeDealsAgentAbi, eventName: "Claimed", fromBlock: from, toBlock: to }));
      for (const l of logs as any[]) {
        const claim = toClaimed(l.args);
        const s = await this.dealStatus(claim.dealId);
        if (s && (s.state === DEAL_STATE.Claimed || s.state === DEAL_STATE.Pending)) out.push({ claim, checks: s.checks });
      }
    }
    return out;
  }

  private getDeal(dealId: string): Promise<any> {
    return withBackoff(() => this.pub.readContract({ address: this.tradeDeals, abi: tradeDealsAgentAbi, functionName: "getDeal", args: [bytes32ToDealId(dealId as Hex)] }));
  }

  async dealStatus(dealId: string): Promise<DealStatus | undefined> {
    const deal = await this.getDeal(dealId);
    const state = Number(deal.state);
    if (state === DEAL_STATE.None) return undefined;
    return { state, checks: Number(deal.checks), verifyDeadline: BigInt(deal.verifyDeadline) };
  }

  async verifier(): Promise<string> {
    return withBackoff(() => this.pub.readContract({ address: this.tradeDeals, abi: tradeDealsAgentAbi, functionName: "verifier" })) as Promise<string>;
  }

  /** The exporter's Trust Score in bps from TrustRegistry (0 = never onboarded: the first claim onboards at 50%). */
  async trustBps(subject: string): Promise<number> {
    this.registry ??= (await withBackoff(() => this.pub.readContract({ address: this.tradeDeals, abi: tradeDealsAgentAbi, functionName: "registry" }))) as Hex;
    const bps = await withBackoff(() => this.pub.readContract({ address: this.registry!, abi: trustRegistryAgentAbi, functionName: "trust", args: [subject as Hex] }));
    return Number(bps);
  }

  async submitVerification(r: VerifyResponse): Promise<RelayResult> {
    const v = fromJson(r.verification);
    try {
      const exporter = (await this.getDeal(v.dealId)).exporter as string;
      const beforeBps = await this.trustBps(exporter);
      const { request, result } = await withBackoff(() => this.pub.simulateContract({
        address: this.tradeDeals, abi: tradeDealsAgentAbi, functionName: "submitVerification",
        args: [v, r.signature as Hex], account: this.wallet.account,
      }));
      const hash = await this.wallet.writeContract(request);
      const receipt = await withBackoff(() => this.pub.waitForTransactionReceipt({ hash }));
      if (receipt.status !== "success") return { ok: false, error: `reverted in block ${receipt.blockNumber}` };
      // The verdict is the return value; the score move is in TrustRegistry, the falsified checks in the deal.
      const outcome = OUTCOME_NAME[Number(result)] ?? "pending";
      const [afterBps, deal] = await Promise.all([this.trustBps(exporter), this.getDeal(v.dealId)]);
      const events = parseEventLogs({ abi: tradeDealsAgentAbi, logs: receipt.logs }).map((l) => l.eventName);
      return {
        ok: true, txHash: hash, outcome, events, block: receipt.blockNumber,
        trust: { exporter, outcome, beforeBps, afterBps, falsifiedMask: Number(deal.falsifiedMask) },
      };
    } catch (e) {
      if (e instanceof BaseError) {
        const revert = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
        return { ok: false, error: revert?.data?.errorName ?? revert?.shortMessage ?? e.shortMessage };
      }
      return { ok: false, error: (e as Error).message };
    }
  }
}

/** The adapter for a ChainTarget: Whitechain testnet, or lane C's local anvil. */
export function tradeDealsAdapter(t: ChainTarget, fromBlock = 0n): TradeDealsAdapter {
  if (!t.relayerKey) throw new Error("missing RELAYER_PRIVATE_KEY (the EOA that sends submitVerification; needs gas)");
  if (t.kind === "local") {
    return new TradeDealsAdapter({ chain: localAnvil(t.chainId, t.rpcUrl), rpcUrl: t.rpcUrl, pollingMs: 1_000, tradeDeals: t.tradeDeals, relayerKey: t.relayerKey, fromBlock });
  }
  return new TradeDealsAdapter({
    chain: whitechainSepolia, rpcUrl: t.rpcUrl, wsUrl: process.env.WHITECHAIN_WS ?? WHITECHAIN_WS,
    tradeDeals: t.tradeDeals, relayerKey: t.relayerKey, fromBlock, txLink: (h) => `${WHITECHAIN_EXPLORER}/tx/${h}`,
  });
}
